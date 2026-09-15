// Real SpacetimeDB integration test; never writes test accounts to the game database.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import WebSocket from 'ws';
import { gameServerPlugin } from '../server/gameServerPlugin.js';
import { SpacetimePersistence } from '../server/spacetimePersistence.js';

const root = process.cwd();
mkdirSync('.data', { recursive: true });
const dataRoot = mkdtempSync(resolve('.data/database-check-'));
const cli = resolve('.runtime/spacetimedb/spacetimedb-cli.exe');
const standalone = resolve('.runtime/spacetimedb/spacetimedb-standalone.exe');
const host = 'http://127.0.0.1:3001';
const base = 'http://127.0.0.1:5199';
const env = { SPACETIMEDB_HOST: host, SPACETIMEDB_DATABASE: 'wildwood-verification', WILDWOOD_SESSION_SECRET: randomBytes(48).toString('hex') };
let databaseProcess, vite;
const sockets = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function eventually(check) {
  let last;
  for (let i = 0; i < 80; i++) { try { return await check(); } catch (error) { last = error; await delay(100); } }
  throw last;
}
function cliRun(args) {
  const result = spawnSync(cli, ['--root-dir', dataRoot, ...args], { cwd: root, windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Database CLI ${args[0]} failed: ${args[0] === 'login' ? '(credentials hidden)' : result.stderr}`);
}
async function startDatabase() {
  databaseProcess = spawn(standalone, ['start', '--listen-addr', '127.0.0.1:3001', '--data-dir', resolve(dataRoot, 'data'), '--jwt-key-dir', resolve(dataRoot, 'config'), '--non-interactive'], { windowsHide: true, stdio: 'ignore' });
  await eventually(async () => {
    if (databaseProcess.exitCode !== null) throw new Error('Test database process exited. Port 3001 may be occupied.');
    const response = await fetch(`${host}/v1/identity/public-key`);
    assert.equal(response.status, 200);
  });
}
async function stopDatabase() {
  if (!databaseProcess || databaseProcess.exitCode !== null) return;
  const exited = once(databaseProcess, 'exit'); databaseProcess.kill(); await exited;
}
async function startGame() {
  vite = await createServer({ configFile: false, root, plugins: [gameServerPlugin(env)], optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 5199, strictPort: true, hmr: false, watch: null } });
  await vite.listen();
}
async function auth(action, username = 'DatabaseTester', password = 'test-password-123') {
  const response = await fetch(`${base}/api/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, confirmPassword: password }) });
  const body = await response.json();
  return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
function connect(cookie) {
  const socket = new WebSocket('ws://127.0.0.1:5199/ws', { headers: { cookie } });
  const messages = []; socket.on('message', raw => messages.push(JSON.parse(String(raw))));
  sockets.push(socket);
  return {
    socket,
    send: message => socket.send(JSON.stringify(message)),
    wait: (type, predicate = () => true) => eventually(() => {
      const index = messages.findIndex(message => message.type === type && predicate(message));
      assert.ok(index >= 0, `Waiting for ${type}`); return messages.splice(index, 1)[0];
    })
  };
}
async function closeSocket(socket) { if (socket.readyState === WebSocket.CLOSED) return; const closed = once(socket, 'close'); socket.close(); await closed; }

try {
  await startDatabase();
  env.SPACETIMEDB_TOKEN = (await (await fetch(`${host}/v1/identity`, { method: 'POST' })).json()).token;
  cliRun(['login', '--token', env.SPACETIMEDB_TOKEN]);
  cliRun(['publish', '--server', host, '--module-path', 'spacetimedb', '--delete-data=never', '--yes=skip-login', env.SPACETIMEDB_DATABASE]);
  await startGame();
  const registered = await auth('register');
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.ok(registered.cookie);
  assert.equal((await auth('register', 'databasetester')).status, 409);
  assert.equal((await auth('login', 'DatabaseTester', 'wrong-password')).status, 401);
  assert.equal((await auth('login')).status, 200);
  console.log('PASS: real registration, case-insensitive unique usernames, password verification and session cookie.');

  const db = new SpacetimePersistence(env);
  const account = await db.accountByUsername('databasetester');
  assert.ok(account.passwordHash.startsWith('scrypt$'));
  let saved = await db.loadPlayer(account.accountId);
  assert.equal(saved.inventory.resources.stone,1);assert.equal(saved.inventory.resources.wood,0);
  saved.inventory.resources={wood:300,stone:200,leaves:30,rope:20};
  saved.inventory.hotbar=['stone',null,null,null,'wood'];
  await db.savePlayer(account.accountId,saved.inventory,{x:4,z:-2,rotation:.5},{unlocked:['test-fixture']});
  const player=connect(registered.cookie);await player.wait('welcome');
  player.send({type:'create',name:'Integration test'});const joined=await player.wait('joined');
  let inventory=(await player.wait('inventory')).inventory;const stone=inventory.hotbar[0];
  assert.equal(inventory.items[stone].type,'stone');assert.equal(inventory.hotbar.length,5);
  player.send({type:'inventory-move',fromArea:'hotbar',fromIndex:0,toArea:'inventory',toIndex:2,itemId:stone});
  inventory=(await player.wait('inventory')).inventory;
  assert.equal(inventory.hotbar[0],null);assert.equal(inventory.inventorySlots[2],stone);
  player.send({type:'gather',nodeId:'rock-1',tool:'stone'});
  assert.match((await player.wait('action-error')).reason,/equipped|tool|closer/i);
  player.send({type:'hotbar-select',index:5});
  assert.equal((await player.wait('action-error')).reason,'Invalid hotbar slot');
  player.send({type:'inventory-move',fromArea:'inventory',fromIndex:2,toArea:'hotbar',toIndex:3,itemId:stone});
  await player.wait('inventory');
  player.send({type:'hotbar-select',index:3});await player.wait('inventory');
  player.send({type:'gather',nodeId:'rock-1'});await player.wait('gather-result');
  inventory=(await player.wait('inventory')).inventory;
  assert.ok(inventory.resources.stone>=210&&inventory.resources.stone<=215);
  console.log('PASS: authenticated socket move, empty-slot rejection, slot 6 rejected, selected Stone gathering.');
  const otherAuth=await auth('register','SecondPlayer');const other=connect(otherAuth.cookie);const otherWelcome=await other.wait('welcome');
  other.send({type:'join',roomId:joined.room.id});await other.wait('joined');
  const seenA=await player.wait('players',m=>m.players.length===2);
  const seenB=await other.wait('players',m=>m.players.length===2);
  assert.deepEqual(new Set(seenA.players.map(p=>p.id)),new Set(seenB.players.map(p=>p.id)));
  assert.ok(seenA.players.every(p=>p.nickname&&Number.isFinite(p.y)));
  await closeSocket(other.socket);await player.wait('players',m=>!m.players.some(p=>p.id===otherWelcome.id));
  console.log('PASS: two accounts see matching player IDs, nicknames, heights; disconnect broadcast removes remote.');
  await delay(150);
  const movementTimer=setInterval(()=>player.send({type:'state',x:4.1,z:-2,rotation:.8}),50);
  try { await eventually(async()=>assert.equal((await db.loadPlayer(account.accountId)).x,4.1)); }
  finally {clearInterval(movementTimer);}
  await closeSocket(player.socket);
  await delay(100);
  // Concurrent reducer calls serialize atomically inside the database, not the browser.
  await Promise.all(Array.from({length:10},()=>db.inventoryAction(account.accountId,{type:'craft',recipeId:'rope'})));
  inventory=(await db.loadPlayer(account.accountId)).inventory;
  assert.equal(inventory.resources.leaves,0);assert.equal(inventory.resources.rope,30);
  await assert.rejects(db.inventoryAction(account.accountId,{type:'craft',recipeId:'rope'}));
  inventory=await db.inventoryAction(account.accountId,{type:'craft',recipeId:'stone_hatchet'});
  inventory=await db.inventoryAction(account.accountId,{type:'craft',recipeId:'stone_hatchet'});
  inventory=await db.inventoryAction(account.accountId,{type:'craft',recipeId:'stone_pickaxe'});
  const hatchets=Object.values(inventory.items).filter(x=>x.type==='stone_hatchet'),pickaxe=Object.values(inventory.items).find(x=>x.type==='stone_pickaxe');
  assert.equal(hatchets.length,2);assert.notEqual(hatchets[0].id,hatchets[1].id);assert.equal(pickaxe.durability,500);
  inventory=await db.inventoryAction(account.accountId,{type:'move',fromArea:'inventory',fromIndex:inventory.inventorySlots.indexOf(hatchets[0].id),toArea:'hotbar',toIndex:0});
  await db.inventoryAction(account.accountId,{type:'select',index:0});await delay(600);
  inventory=await db.inventoryAction(account.accountId,{type:'gather',roomId:'durability-test',nodeId:'tree-0',x:-8,z:12});
  assert.equal(inventory.items[hatchets[0].id].durability,299);assert.equal(inventory.items[hatchets[1].id].durability,300);
  assert.ok(inventory.lastResult.amount>=32&&inventory.lastResult.amount<=48);
  await assert.rejects(db.inventoryAction(account.accountId,{type:'gather',roomId:'durability-test',nodeId:'tree-0',x:-8,z:12}));
  console.log('PASS: atomic concurrent Rope crafting, exact costs, unique tool instances, individual durability, cooldown and harvest multiplier.');
  let totalWood=inventory.lastResult.amount;
  while(inventory.lastResult.remaining>0){
    await delay(580);
    inventory=await db.inventoryAction(account.accountId,{type:'gather',roomId:'durability-test',nodeId:'tree-0',x:-8,z:12});
    totalWood+=inventory.lastResult.amount;
  }
  assert.equal(totalWood,200);assert.equal(inventory.lastResult.active,false);
  assert.ok(inventory.lastResult.respawnAt-Date.now()>19*60*1000);
  await delay(580);
  await assert.rejects(db.inventoryAction(account.accountId,{type:'gather',roomId:'durability-test',nodeId:'tree-0',x:-8,z:12}));
  const secondAccount=await db.accountByUsername('secondplayer');
  const collected=await Promise.allSettled([account.accountId,secondAccount.accountId].map(accountId=>db.inventoryAction(accountId,{type:'gather',roomId:'leaf-race',nodeId:'leaf-0',x:-3,z:4})));
  assert.equal(collected.filter(result=>result.status==='fulfilled').length,1);
  const winner=collected.find(result=>result.status==='fulfilled').value;
  assert.ok(Number.isInteger(winner.lastResult.amount)&&winner.lastResult.amount>=1&&winner.lastResult.amount<=3);
  assert.equal(winner.resources.leaves,winner.lastResult.amount);
  assert.equal(winner.lastResult.remaining,0);
  assert.equal(winner.lastResult.active,false);
  const leafState=(await db.resourceStates('leaf-race'))[0];assert.equal(leafState.remaining,0);assert.ok(leafState.respawnAt-Date.now()>290000);
  inventory=(await db.loadPlayer(account.accountId)).inventory;
  console.log('PASS: continuous movement persists, tree grants at most 200 Wood, 20-minute respawn, simultaneous leaf pickups grant one random 1–3 reward with 5-minute respawn.');
  const {bootstrapAccounts}=await import('../server/bootstrapAccounts.js');
  const bootstrapEnv={WILDWOOD_BOOTSTRAP_PASSWORD:'isolated-test-secret'};
  await bootstrapAccounts(db,bootstrapEnv);const admin=await db.accountByUsername('admin'),superadmin=await db.accountByUsername('superadmin');
  await bootstrapAccounts(db,bootstrapEnv);
  assert.equal((await db.accountByUsername('admin')).accountId,admin.accountId);
  assert.equal((await db.accountByUsername('admin')).passwordHash,admin.passwordHash);
  assert.equal((await db.loadPlayer(admin.accountId)).role,'admin');
  assert.equal((await db.loadPlayer(superadmin.accountId)).role,'superadmin');
  const finalInventory=JSON.stringify(inventory);
  await vite.close();vite=null;await delay(200);await stopDatabase();await startDatabase();await startGame();
  const login=await auth('login');assert.equal(login.status,200);
  const restored=await db.loadPlayer(account.accountId);
  assert.equal(JSON.stringify(restored.inventory),finalInventory);
  assert.deepEqual(restored.progression,{unlocked:['test-fixture']});
  assert.equal((await db.loadPlayer(admin.accountId)).role,'admin');
  assert.equal((await db.accountByUsername('admin')).accountId,admin.accountId);
  console.log('PASS: full database/server restart preserves inventory IDs, quantities, slots, selected tool, durability, login, progression and permanent roles.');
} finally {
  for(const socket of sockets)await closeSocket(socket);
  await delay(300);if(vite)await vite.close();await stopDatabase();
  console.log('Stopped isolated verification servers. Test files: '+dataRoot);
}
