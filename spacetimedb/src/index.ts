import { schema, table, t, SenderError } from 'spacetimedb/server';
import { migrateInventory, inventoryAction, equippedStack } from '../../src/shared/inventoryState.js';
import { ITEM_DEFINITIONS } from '../../src/shared/itemDefinitions.js';
import { RESOURCE_NODES, SURVIVAL } from '../../src/shared/survivalConfig.js';

const config = table({ name: 'config' }, {
  owner_identity: t.identity().primaryKey()
});

const account = table({ name: 'account' }, {
  account_id: t.string().primaryKey(),
  username: t.string(),
  normalized_username: t.string().unique(),
  password_hash: t.string(),
  created_at: t.timestamp()
});

const player_state = table({ name: 'player_state' }, {
  account_id: t.string().primaryKey(),
  resources_json: t.string(),
  tools_json: t.string(),
  inventory_json: t.string(),
  hotbar_json: t.string(),
  x: t.f64(),
  z: t.f64(),
  rotation: t.f64(),
  progression_json: t.string(),
  updated_at: t.timestamp()
});

// Additive tables: existing accounts and legacy saves remain untouched.
const inventory_state = table({ name: 'inventory_state' }, { account_id: t.string().primaryKey(), state_json: t.string() });
const account_role = table({ name: 'account_role' }, { account_id: t.string().primaryKey(), role: t.string() });
const resource_state = table({ name: 'resource_state' }, { key: t.string().primaryKey(), remaining: t.u32(), respawn_at: t.f64() });
const spacetimedb = schema({ config, account, player_state, inventory_state, account_role, resource_state });
export default spacetimedb;

function requireOwner(ctx: any) {
  const owner = ctx.db.config.iter().next().value;
  if (!owner || owner.owner_identity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError('Only the trusted game server can modify player data');
  }
}

export const init = spacetimedb.init(ctx => {
  ctx.db.config.insert({ owner_identity: ctx.sender });
});

export const create_account = spacetimedb.reducer({
  account_id: t.string(),
  username: t.string(),
  normalized_username: t.string(),
  password_hash: t.string(),
  resources_json: t.string(),
  tools_json: t.string(),
  inventory_json: t.string(),
  hotbar_json: t.string()
}, (ctx, args) => {
  requireOwner(ctx);
  if (ctx.db.account.normalized_username.find(args.normalized_username)) throw new SenderError('Username already exists');
  const now = ctx.timestamp;
  ctx.db.account.insert({
    account_id: args.account_id,
    username: args.username,
    normalized_username: args.normalized_username,
    password_hash: args.password_hash,
    created_at: now
  });
  ctx.db.player_state.insert({
    account_id: args.account_id,
    resources_json: args.resources_json,
    tools_json: args.tools_json,
    inventory_json: args.inventory_json,
    hotbar_json: args.hotbar_json,
    x: 0,
    z: 3,
    rotation: Math.PI,
    progression_json: '{}',
    updated_at: now
  });
});

export const save_player = spacetimedb.reducer({
  account_id: t.string(),
  resources_json: t.string(),
  tools_json: t.string(),
  inventory_json: t.string(),
  hotbar_json: t.string(),
  x: t.f64(),
  z: t.f64(),
  rotation: t.f64(),
  progression_json: t.string()
}, (ctx, args) => {
  requireOwner(ctx);
  const current = ctx.db.player_state.account_id.find(args.account_id);
  if (!current) throw new SenderError('Player record not found');
  ctx.db.player_state.account_id.update({ ...args, updated_at: ctx.timestamp });
});

export const set_role = spacetimedb.reducer({ account_id: t.string(), role: t.string() }, (ctx, args) => {
  requireOwner(ctx);
  if (!['player', 'admin', 'superadmin'].includes(args.role) || !ctx.db.account.account_id.find(args.account_id)) throw new SenderError('Invalid role/account');
  if (ctx.db.account_role.account_id.find(args.account_id)) ctx.db.account_role.account_id.update(args);
  else ctx.db.account_role.insert(args);
});

export const inventory_action = spacetimedb.reducer({ account_id: t.string(), action_json: t.string() }, (ctx, args) => {
  requireOwner(ctx);
  try {
  const player = ctx.db.player_state.account_id.find(args.account_id);
  if (!player) throw new SenderError('Player not found');
  const record = ctx.db.inventory_state.account_id.find(args.account_id);
  const legacy = { resources: JSON.parse(player.resources_json), tools: JSON.parse(player.tools_json), inventorySlots: JSON.parse(player.inventory_json), hotbar: JSON.parse(player.hotbar_json) };
  let state = migrateInventory(record ? JSON.parse(record.state_json) : legacy, args.account_id);
  const action = JSON.parse(args.action_json);
  if (action.type === 'gather') {
    const node = RESOURCE_NODES.find(n => n.id === action.nodeId);
    if (!node || typeof action.roomId !== 'string') throw new SenderError('Resource not found');
    const key = `${action.roomId}:${node.id}`, existing = ctx.db.resource_state.key.find(key);
    const now = Number(ctx.timestamp.microsSinceUnixEpoch) / 1000;
    const config = SURVIVAL[node.type as 'tree' | 'rock' | 'leaf'];
    const capacity = node.type === 'leaf' ? 1 : (config as typeof SURVIVAL.tree).capacity;
    const remaining = !existing || (existing.respawn_at > 0 && existing.respawn_at <= now) ? capacity : existing.remaining;
    if (remaining <= 0) throw new SenderError('Resource is depleted');
    const equipped = equippedStack(state), def = equipped ? ITEM_DEFINITIONS[equipped.type as keyof typeof ITEM_DEFINITIONS] : null;
    const stats = def as any;
    const cooldown = node.type === 'leaf' ? 550 : (stats?.attackSpeed || .55) * 1000;
    if (now - state.lastGatherAt < cooldown) throw new SenderError('Too fast');
    const range = node.type === 'leaf' ? 3 : stats?.attackDistance || 0;
    if (!Number.isFinite(action.x) || !Number.isFinite(action.z) || Math.hypot(action.x - node.x, action.z - node.z) > range) throw new SenderError('Move closer with an equipped tool');
    let amount = 1, resource = 'leaves';
    if (node.type === 'leaf') {
      const [min, max] = SURVIVAL.leaf.rewardRange;
      amount = min + Math.floor(ctx.random() * (max - min + 1));
    } else {
      if (!equipped || !stats?.attackSpeed) throw new SenderError('Select a tool in your hotbar');
      const surface = node.type === 'tree' ? 'soft' : 'hard';
      if (equipped.type !== 'stone' && stats.harvestType !== surface) throw new SenderError('Wrong tool for this resource');
      const reward = node.type === 'tree' ? SURVIVAL.tree.stoneReward : SURVIVAL.rock.stoneReward;
      // Reducer RNG is evaluated independently for each accepted hit.
      const base = reward[0] + Math.floor(ctx.random() * (reward[1] - reward[0] + 1));
      const regular = Math.max(1, Math.round(base * (stats.harvestMultiplier ?? 1)));
      amount = Math.min(remaining, regular >= remaining ? Math.round(regular * (stats.lastHitMultiplier ?? 1)) : regular);
      resource = node.type === 'tree' ? 'wood' : 'stone';
    }
    state = inventoryAction(state, { type: 'harvest', resource, amount, toolId: node.type === 'leaf' ? null : equipped.id, now });
    // A leaf plant is one pickup, independent of the number of leaves it gives.
    const consumed = node.type === 'leaf' ? 1 : amount;
    const next = { key, remaining: remaining - consumed, respawn_at: remaining === consumed ? now + config.respawnMs : 0 };
    if (existing) ctx.db.resource_state.key.update(next); else ctx.db.resource_state.insert(next);
    state.lastResult = { resource, amount, nodeId: node.id, remaining: next.remaining, respawnAt: next.respawn_at, active: next.remaining > 0 };
  } else if (action.type !== 'ensure') {
    if (!['move', 'craft', 'select'].includes(action.type)) throw new SenderError('Unsupported action');
    state = inventoryAction(state, action);
    state.lastResult = null;
  }
  const next = { account_id: args.account_id, state_json: JSON.stringify(state) };
  if (record) ctx.db.inventory_state.account_id.update(next); else ctx.db.inventory_state.insert(next);
  if (!ctx.db.account_role.account_id.find(args.account_id)) ctx.db.account_role.insert({ account_id: args.account_id, role: 'player' });
  } catch (error) { throw new SenderError(error instanceof Error ? error.message : 'Inventory action failed'); }
});
