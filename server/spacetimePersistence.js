import { randomUUID } from 'node:crypto';
import { startingInventory } from '../src/shared/survivalConfig.js';

function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function normalizePlayerRow(row) {
  if (!row) return null;
  const [accountId, resourcesJson, toolsJson, inventoryJson, hotbarJson, x, z, rotation, progressionJson] = row;
  return {
    accountId,
    inventory: {
      resources: JSON.parse(resourcesJson),
      tools: JSON.parse(toolsJson),
      inventorySlots: JSON.parse(inventoryJson),
      hotbar: JSON.parse(hotbarJson)
    },
    x: Number(x) || 0,
    z: Number(z) || 0,
    rotation: Number(rotation) || 0,
    progression: JSON.parse(progressionJson || '{}')
  };
}

export class SpacetimePersistence {
  constructor(env = process.env) {
    this.host = String(env.SPACETIMEDB_HOST || 'http://127.0.0.1:3000').replace(/\/$/, '');
    this.database = env.SPACETIMEDB_DATABASE || 'wildwood-survival';
    this.token = env.SPACETIMEDB_TOKEN || '';
  }

  headers(contentType = 'application/json') {
    const headers = { 'content-type': contentType };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return headers;
  }

  async request(path, options = {}) {
    let response;
    try { response = await fetch(`${this.host}${path}`, { ...options, signal: AbortSignal.timeout(8000) }); }
    catch (error) {
      throw Object.assign(new Error(`SpacetimeDB unavailable at ${this.host}: ${error.message}`), {
        publicMessage: 'Database is offline. The server owner needs to run npm run db:start.'
      });
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 4000);
      const publicMessage = response.status === 404
        ? 'Database is not set up. The server owner needs to run npm run db:setup.'
        : [401, 403].includes(response.status)
          ? 'Database credentials are invalid. The server owner needs to check the database configuration.'
          : 'Could not save or load player data. Please try again.';
      throw Object.assign(new Error(`SpacetimeDB ${response.status}: ${detail}`), { publicMessage });
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async call(reducer, args) {
    return this.request(`/v1/database/${encodeURIComponent(this.database)}/call/${reducer}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(args)
    });
  }

  async sql(statement) {
    const result = await this.request(`/v1/database/${encodeURIComponent(this.database)}/sql`, {
      method: 'POST', headers: this.headers('text/plain'), body: statement
    });
    return result?.[0]?.rows || [];
  }

  async accountByUsername(normalizedUsername) {
    const rows = await this.sql(`SELECT account_id, username, password_hash FROM account WHERE normalized_username = ${sqlString(normalizedUsername)}`);
    if (!rows.length) return null;
    return { accountId: rows[0][0], username: rows[0][1], passwordHash: rows[0][2] };
  }

  async accountById(accountId) {
    const rows = await this.sql(`SELECT account_id, username, password_hash FROM account WHERE account_id = ${sqlString(accountId)}`);
    if (!rows.length) return null;
    return { accountId: rows[0][0], username: rows[0][1], passwordHash: rows[0][2] };
  }

  async register(username, normalizedUsername, passwordHash) {
    const accountId = randomUUID();
    const start = startingInventory();
    await this.call('create_account', [
      accountId, username, normalizedUsername, passwordHash,
      JSON.stringify(start.resources), JSON.stringify(start.tools), JSON.stringify(start.inventorySlots), JSON.stringify(start.hotbar)
    ]);
    return { accountId, username, passwordHash };
  }

  async loadPlayer(accountId) {
    const rows = await this.sql(`SELECT account_id, resources_json, tools_json, inventory_json, hotbar_json, x, z, rotation, progression_json FROM player_state WHERE account_id = ${sqlString(accountId)}`);
    const player = normalizePlayerRow(rows[0]);
    if (!player) return null;
    const inventories = await this.sql(`SELECT state_json FROM inventory_state WHERE account_id = ${sqlString(accountId)}`);
    if (inventories.length) player.inventory = JSON.parse(inventories[0][0]);
    const roles = await this.sql(`SELECT role FROM account_role WHERE account_id = ${sqlString(accountId)}`);
    player.role = roles[0]?.[0] || 'player';
    return player;
  }

  async inventoryAction(accountId, action) {
    await this.call('inventory_action', [accountId, JSON.stringify(action)]);
    const rows = await this.sql(`SELECT state_json FROM inventory_state WHERE account_id = ${sqlString(accountId)}`);
    return JSON.parse(rows[0][0]);
  }

  async resourceStates(roomId) {
    const rows = await this.sql('SELECT key, remaining, respawn_at FROM resource_state');
    return rows.filter(row => row[0].startsWith(`${roomId}:`)).map(([key, remaining, respawnAt]) => ({ id: key.slice(roomId.length + 1), remaining: Number(remaining), respawnAt: Number(respawnAt) }));
  }

  async setRole(accountId, role) { await this.call('set_role', [accountId, role]); }

  async savePlayer(accountId, inventory, position, progression = {}) {
    await this.call('save_player', [
      accountId,
      JSON.stringify(inventory.resources),
      JSON.stringify([...inventory.tools]),
      JSON.stringify(inventory.inventorySlots),
      JSON.stringify(inventory.hotbar),
      Number(position.x) || 0,
      Number(position.z) || 0,
      Number(position.rotation) || 0,
      JSON.stringify(progression)
    ]);
  }
}
