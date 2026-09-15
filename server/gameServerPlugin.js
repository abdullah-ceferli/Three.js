import { randomBytes, randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { RESOURCE_NODES, SURVIVAL } from '../src/shared/survivalConfig.js';
import { createSession, hashPassword, verifyPassword, verifySession } from './security.js';
import { SpacetimePersistence } from './spacetimePersistence.js';

import { migrateInventory } from '../src/shared/inventoryState.js';
import { playerHeight, isSwimming, ISLAND } from '../src/shared/worldLayout.js';
const MAX_PLAYERS = 3;
const SAVE_DELAY_MS = 750;
const SPAWN_POINTS = [{ x: 0, z: 3, rotation: Math.PI }, { x: -3, z: -2, rotation: .6 }, { x: 3, z: -2, rotation: -.6 }];
const validUsername = value => /^[a-zA-Z0-9_]{3,20}$/.test(value);

async function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 16_384) request.destroy(new Error('Request too large')); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

function cookieValue(request, name) {
  const entry = String(request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function setSessionCookie(response, token) {
  response.setHeader('set-cookie', `wildwood_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);
}

export function normalizeInventory(saved) { return migrateInventory(saved?.inventory, saved?.accountId); }

export function gameServerPlugin(env = process.env) {
  return { name: 'wildwood-game-server', configureServer(server) {
    const persistence = new SpacetimePersistence(env);
    const sessionSecret = env.WILDWOOD_SESSION_SECRET || env.SPACETIMEDB_TOKEN || randomBytes(32).toString('hex');
    if (!env.WILDWOOD_SESSION_SECRET && !env.SPACETIMEDB_TOKEN) console.warn('[auth] Set WILDWOOD_SESSION_SECRET to keep sessions valid across restarts.');

    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (!pathname.startsWith('/api/auth/')) return next();
      try {
        if (request.method === 'POST' && pathname === '/api/auth/register') {
          const body = await readJson(request), username = String(body.username || '').trim(), password = String(body.password || '');
          if (!validUsername(username)) return sendJson(response, 400, { error: 'Username must be 3–20 letters, numbers, or underscores.' });
          if (password.length < 8 || password.length > 128) return sendJson(response, 400, { error: 'Password must contain 8–128 characters.' });
          if (password !== String(body.confirmPassword || '')) return sendJson(response, 400, { error: 'Passwords do not match.' });
          const normalized = username.toLocaleLowerCase('en-US');
          if (await persistence.accountByUsername(normalized)) return sendJson(response, 409, { error: 'Username already exists.' });
          const account = await persistence.register(username, normalized, await hashPassword(password));
          setSessionCookie(response, createSession(account, sessionSecret));
          return sendJson(response, 201, { nickname: account.username });
        }
        if (request.method === 'POST' && pathname === '/api/auth/login') {
          const body = await readJson(request), normalized = String(body.username || '').trim().toLocaleLowerCase('en-US');
          const account = await persistence.accountByUsername(normalized);
          if (!account || !await verifyPassword(String(body.password || ''), account.passwordHash)) return sendJson(response, 401, { error: 'Invalid username or password.' });
          setSessionCookie(response, createSession(account, sessionSecret));
          return sendJson(response, 200, { nickname: account.username });
        }
        if (request.method === 'GET' && pathname === '/api/auth/session') {
          const session = verifySession(cookieValue(request, 'wildwood_session'), sessionSecret);
          if (!session || !await persistence.accountById(session.accountId)) return sendJson(response, 401, { error: 'Session expired.' });
          return sendJson(response, 200, { nickname: session.nickname });
        }
        if (request.method === 'POST' && pathname === '/api/auth/logout') {
          response.setHeader('set-cookie', 'wildwood_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
          return sendJson(response, 200, { ok: true });
        }
        return sendJson(response, 404, { error: 'Not found.' });
      } catch (error) {
        console.error('[auth]', error.message);
        const duplicate = /unique|already exists/i.test(error.message);
        return sendJson(response, duplicate ? 409 : 503, { error: duplicate ? 'Username already exists.' : error.publicMessage || 'Persistent database is unavailable.' });
      }
    });

    const socketServer = new WebSocketServer({ noServer: true, maxPayload: 16384 }), rooms = new Map(), clients = new Set();
    let nextRoomNumber = 1, actionQueue = Promise.resolve();
    const send = (socket, message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    const broadcast = (room, message) => room?.players.forEach(({ socket }) => send(socket, message));
    const roomList = () => [...rooms.values()].map(room => ({ id: room.id, name: room.name, players: room.players.size, maxPlayers: MAX_PLAYERS }));
    const broadcastLobby = () => clients.forEach(client => send(client.socket, { type: 'servers', servers: roomList() }));
    const serializeInventory = client => JSON.parse(JSON.stringify(client.inventory));
    const sendInventory = client => send(client.socket, { type: 'inventory', inventory: serializeInventory(client) });
    const makeResources = () => new Map(RESOURCE_NODES.map(definition => [definition.id, { ...definition, remaining: definition.type === 'leaf' ? 1 : SURVIVAL[definition.type].capacity, active: true, respawnAt: 0, timer: null }]));
    const resourceSnapshot = room => [...room.resources.values()].map(({ id, type, remaining, active, respawnAt }) => ({ id, type, remaining, active, respawnAt }));
    const playerSnapshot = room => [...room.players.values()].map(({ id, accountId, nickname, x, z, rotation, pitch }) => ({ id, accountId, nickname, x, z, y: playerHeight(x,z), swimming: isSwimming(x,z), rotation, pitch }));
    const broadcastPlayers = room => broadcast(room, { type: 'players', players: playerSnapshot(room) });

    async function persistNow(client) {
      clearTimeout(client.saveTimer); client.saveTimer = null;
      const inventory = serializeInventory(client), position = { x: client.x, z: client.z, rotation: client.rotation }, progression = { ...client.progression };
      client.saveChain = client.saveChain.catch(() => {}).then(() => persistence.savePlayer(client.accountId, inventory, position, progression));
      try { await client.saveChain; } catch (error) { console.error(`[persistence] ${client.nickname}:`, error.message); }
    }
    function persistSoon(client, immediate = false) {
      if (immediate) return void persistNow(client);
      // Throttle writes: continuous movement must not postpone saving forever.
      if (!client.saveTimer) client.saveTimer = setTimeout(() => void persistNow(client), SAVE_DELAY_MS);
    }
    const fail = (client, reason) => send(client.socket, { type: 'action-error', reason });
    async function mutate(client, action) {
      client.inventory = await persistence.inventoryAction(client.accountId, action);
      sendInventory(client);
    }
    async function hydrateResources(room) {
      for (const saved of await persistence.resourceStates(room.id)) {
        const node = room.resources.get(saved.id);
        if (!node || saved.respawnAt && saved.respawnAt <= Date.now()) continue;
        Object.assign(node, saved, { active: saved.remaining > 0 });
        if (!node.active) scheduleRespawn(room, node, saved.respawnAt);
      }
    }
    const sendRoomState = (client, room) => { sendInventory(client); send(client.socket, { type: 'resources', resources: resourceSnapshot(room) }); };
    function chooseSpawn(client, room) {
      if (client.hasSavedPosition && Number.isFinite(client.x) && Number.isFinite(client.z)) return { x: client.x, z: client.z, rotation: client.rotation };
      const spawn = SPAWN_POINTS[room.players.size % SPAWN_POINTS.length]; Object.assign(client, spawn); return { ...spawn };
    }
    function removeFromRoom(client) {
      if (!client.roomId) return;
      const room = rooms.get(client.roomId); room?.players.delete(client.id); client.roomId = null;
      if (room) { broadcastPlayers(room); if (room.players.size === 0) { room.resources.forEach(node => node.timer && clearTimeout(node.timer)); rooms.delete(room.id); } }
      persistSoon(client, true); broadcastLobby();
    }
    function scheduleRespawn(room, node, deadline = Date.now() + SURVIVAL[node.type].respawnMs) {
      node.active = false; node.respawnAt = deadline; clearTimeout(node.timer);
      node.timer = setTimeout(() => {
        if (!rooms.has(room.id)) return;
        node.active = true; node.respawnAt = 0; node.remaining = node.type === 'leaf' ? 1 : SURVIVAL[node.type].capacity;
        broadcast(room, { type: 'resource-update', resource: { id: node.id, type: node.type, active: true, remaining: node.remaining, respawnAt: 0 } });
      }, Math.max(1, deadline - Date.now()));
      node.timer.unref?.();
    }
    async function gather(client, update) {
      const room = rooms.get(client.roomId); if (!room) return;
      await mutate(client, { type: 'gather', roomId: room.id, nodeId: String(update.nodeId), x: client.x, z: client.z });
      const result = client.inventory.lastResult, node = room.resources.get(result.nodeId);
      Object.assign(node, { remaining: result.remaining, active: result.active, respawnAt: result.respawnAt });
      if (!node.active) scheduleRespawn(room, node, node.respawnAt);
      broadcast(room, { type: 'resource-update', resource: { id: node.id, type: node.type, ...result } });
      broadcast(room, { type: 'player-action', playerId: client.id, action: 'gather' });
      send(client.socket, { type: 'gather-result', label: '+' + result.amount + ' ' + result.resource });
    }

    server.httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '/', 'http://localhost');
      if (url.pathname.replace(/\/$/, '') !== '/ws') return;
      const session = verifySession(cookieValue(request, 'wildwood_session'), sessionSecret);
      if (!session) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
      socketServer.handleUpgrade(request, socket, head, webSocket => { webSocket.authSession = session; socketServer.emit('connection', webSocket); });
    });

    socketServer.on('connection', async socket => {
      const session = socket.authSession;
      let saved;
      try { await persistence.inventoryAction(session.accountId, { type: 'ensure' }); saved = await persistence.loadPlayer(session.accountId); }
      catch { send(socket, { type: 'fatal-error', reason: 'Could not load persistent player data.' }); socket.close(1011); return; }
      if (!saved) { send(socket, { type: 'fatal-error', reason: 'Player record not found.' }); socket.close(1008); return; }
      if ([...clients].some(client => client.accountId === session.accountId)) { send(socket, { type: 'fatal-error', reason: 'This account is already connected. Close the other game tab first.' }); socket.close(1008); return; }
      if (socket.readyState !== WebSocket.OPEN) return;
      const client = { id: randomUUID(), accountId: session.accountId, nickname: session.nickname, socket, roomId: null, x: saved.x, z: saved.z, rotation: saved.rotation, pitch: 0, hasSavedPosition: true, inventory: normalizeInventory(saved), selectedHotbarIndex: 0, progression: saved.progression || {}, lastStateAt: Date.now(), lastGatherAt: 0, saveTimer: null, saveChain: Promise.resolve() };
      clients.add(client); send(socket, { type: 'welcome', id: client.id, accountId: client.accountId, nickname: client.nickname }); send(socket, { type: 'servers', servers: roomList() });
      socket.on('message', raw => {
        actionQueue = actionQueue.catch(() => {}).then(async () => {
        if (socket.readyState !== WebSocket.OPEN) return;
        try {
          const update = JSON.parse(raw.toString());
          if (update.type === 'create') {
            removeFromRoom(client); const room = { id: `room-${nextRoomNumber++}`, name: String(update.name || 'New server').slice(0, 24), players: new Map(), resources: makeResources() };
            await hydrateResources(room); rooms.set(room.id, room); client.roomId = room.id; const spawn = chooseSpawn(client, room); room.players.set(client.id, client);
            send(socket, { type: 'joined', room: { id: room.id, name: room.name }, spawn }); sendRoomState(client, room); broadcastPlayers(room); broadcastLobby(); return;
          }
          if (update.type === 'join') {
            const room = rooms.get(update.roomId); if (!room || room.players.size >= MAX_PLAYERS) { send(socket, { type: 'join-failed', reason: !room ? 'Server not found' : 'Server is full' }); return; }
            removeFromRoom(client); client.roomId = room.id; const spawn = chooseSpawn(client, room); room.players.set(client.id, client);
            send(socket, { type: 'joined', room: { id: room.id, name: room.name }, spawn }); sendRoomState(client, room); broadcastPlayers(room); broadcastLobby(); return;
          }
          if (update.type === 'leave') { removeFromRoom(client); send(socket, { type: 'left' }); return; }
          if (update.type === 'state' && client.roomId) {
            const x = Number(update.x), z = Number(update.z); if (!Number.isFinite(x) || !Number.isFinite(z)) return;
            const dx = x - client.x, dz = z - client.z, distance = Math.hypot(dx, dz), elapsed = Math.min(.5, (Date.now() - client.lastStateAt) / 1000), maxStep = elapsed * (isSwimming(client.x, client.z) ? ISLAND.swimSpeed : ISLAND.groundSpeed) * 1.08;
            client.lastStateAt = Date.now();
            if (distance > maxStep) { client.x += dx / distance * maxStep; client.z += dz / distance * maxStep; } else { client.x = x; client.z = z; }
            client.rotation = Number(update.rotation) || 0; client.pitch = Number(update.pitch) || 0; broadcastPlayers(rooms.get(client.roomId)); persistSoon(client); return;
          }
          if (update.type === 'hotbar-select' && client.roomId) return await mutate(client, { type: 'select', index: update.index });
          if (update.type === 'gather' && client.roomId) return await gather(client, update);
          if (update.type === 'craft' && client.roomId) { await mutate(client, { type: 'craft', recipeId: String(update.recipeId) }); send(client.socket, { type: 'craft-result', recipeId: update.recipeId }); return; };
          if (update.type === 'inventory-move' && client.roomId) await mutate(client, { ...update, type: 'move' });
        } catch (error) {
          const known = ['Not enough materials','Inventory is full','Invalid hotbar slot','Item moved already. Try again.','Resource is depleted','Too fast','Move closer with an equipped tool','Select a tool in your hotbar','Wrong tool for this resource'];
          const reason = known.find(message => error.message.includes(message));
          fail(client, reason || error.publicMessage || 'Action failed. Please reconnect if this continues.');
        }
        });
      });
      socket.on('close', () => { removeFromRoom(client); clearTimeout(client.saveTimer); void persistNow(client); clients.delete(client); });
    });
  }};
}
