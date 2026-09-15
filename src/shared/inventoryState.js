import { ITEM_DEFINITIONS as ITEMS, RECIPES, itemType } from './itemDefinitions.js';

export const BACKPACK_SIZE = 15, HOTBAR_SIZE = 5;
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };
export function refreshInventory(state) {
  state.resources = { wood: 0, stone: 0, leaves: 0, rope: 0 }; state.tools = [];
  for (const stack of Object.values(state.items)) {
    if (Object.hasOwn(state.resources, stack.type)) state.resources[stack.type] += stack.quantity;
    else state.tools.push(stack.type);
  }
  return state;
}
export function validateInventory(state) {
  if (!Number.isInteger(state.selectedHotbarIndex) || state.selectedHotbarIndex < 0 || state.selectedHotbarIndex >= HOTBAR_SIZE) fail('Invalid selected slot');
  if (state.hotbar.length !== HOTBAR_SIZE || state.inventorySlots.length !== BACKPACK_SIZE) fail('Invalid slot layout');
  const ids = [...state.hotbar, ...state.inventorySlots].filter(Boolean);
  if (new Set(ids).size !== ids.length || ids.length !== Object.keys(state.items).length) fail('Invalid item locations');
  for (const id of ids) {
    const stack = state.items[id], def = ITEMS[stack?.type];
    if (!def || stack.id !== id || !Number.isInteger(stack.quantity) || stack.quantity < 1 || stack.quantity > def.maxStack) fail('Invalid stack');
    if (def.maxDurability && (!Number.isInteger(stack.durability) || stack.durability < 0 || stack.durability > def.maxDurability)) fail('Invalid durability');
  }
  return refreshInventory(state);
}
export function insertItem(state, type, amount, preferred) {
  const def = ITEMS[type]; if (!def || !Number.isInteger(amount) || amount < 1) fail('Invalid item');
  for (const stack of Object.values(state.items)) {
    if (stack.type !== type || def.maxStack === 1) continue;
    const added = Math.min(amount, def.maxStack - stack.quantity); stack.quantity += added; amount -= added;
    if (!amount) return;
  }
  while (amount > 0) {
    let slots = state.inventorySlots, index = slots.indexOf(null);
    if (preferred && !preferred.slots[preferred.index]) { slots = preferred.slots; index = preferred.index; preferred = null; }
    else if (index < 0) { slots = state.hotbar; index = slots.indexOf(null); }
    if (index < 0) fail('Inventory is full');
    const id = `${state.namespace}:${++state.sequence}`, quantity = Math.min(amount, def.maxStack);
    state.items[id] = { id, type, quantity, ...(def.maxDurability ? { durability: def.maxDurability } : {}) };
    slots[index] = id; amount -= quantity;
  }
}
export function migrateInventory(source, namespace = 'player') {
  if (source?.version === 2) return validateInventory(copy(source));
  const state = { version: 2, namespace, sequence: 0, revision: 0, selectedHotbarIndex: 0, lastGatherAt: 0,
    items: {}, hotbar: Array(HOTBAR_SIZE).fill(null), inventorySlots: Array(BACKPACK_SIZE).fill(null) };
  const resources = source?.resources || { wood: 0, stone: 1, leaves: 0, rope: 0 };
  const owned = { ...resources };
  for (const type of source?.tools || []) owned[itemType(type)] = 1;
  const placed = new Set();
  for (const [area, size] of [['hotbar', HOTBAR_SIZE], ['inventorySlots', BACKPACK_SIZE]]) {
    for (let index = 0; index < size; index++) {
      const type = itemType(source?.[area]?.[index]);
      if (!ITEMS[type] || !(owned[type] > 0) || placed.has(type)) continue;
      insertItem(state, type, Math.floor(owned[type]), { slots: state[area], index }); placed.add(type);
    }
  }
  for (const [type, amount] of Object.entries(owned)) if (ITEMS[type] && amount > 0 && !placed.has(type)) {
    insertItem(state, type, Math.floor(amount), !source && type === 'stone' ? { slots: state.hotbar, index: 0 } : undefined);
  }
  return validateInventory(state);
}
export function equippedStack(state) {
  const stack = state.items[state.hotbar[state.selectedHotbarIndex]];
  return stack && (stack.durability === undefined || stack.durability > 0) ? stack : null;
}
function removeEmpty(state) {
  for (const stack of Object.values(state.items)) if (stack.quantity <= 0) {
    delete state.items[stack.id];
    for (const slots of [state.hotbar, state.inventorySlots]) for (let i = 0; i < slots.length; i++) if (slots[i] === stack.id) slots[i] = null;
  }
}
export function inventoryAction(current, action) {
  const state = copy(current);
  if (action.type === 'select') {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= HOTBAR_SIZE) fail('Invalid hotbar slot');
    state.selectedHotbarIndex = action.index;
  } else if (action.type === 'move') {
    const areas = { hotbar: state.hotbar, inventory: state.inventorySlots };
    const a = areas[action.fromArea], b = areas[action.toArea], i = action.fromIndex, j = action.toIndex;
    if (!a || !b || !Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= a.length || j >= b.length) fail('Invalid inventory slot');
    if (!a[i] || (action.itemId && action.itemId !== a[i])) fail('Item moved already. Try again.');
    [a[i], b[j]] = [b[j], a[i]];
  } else if (action.type === 'craft') {
    const recipe = RECIPES[action.recipeId]; if (!recipe) fail('Unknown recipe');
    refreshInventory(state);
    for (const [type, amount] of Object.entries(recipe.costs)) if (state.resources[type] < amount) fail('Not enough materials');
    for (const [type, amount] of Object.entries(recipe.costs)) {
      let remaining = amount;
      for (const stack of Object.values(state.items)) if (stack.type === type) { const used = Math.min(stack.quantity, remaining); stack.quantity -= used; remaining -= used; }
    }
    removeEmpty(state); insertItem(state, recipe.output, recipe.amount);
  } else if (action.type === 'harvest') {
    insertItem(state, action.resource, action.amount);
    if (action.toolId) {
      const stack = equippedStack(state);
      if (!stack || stack.id !== action.toolId) fail('Tool is not equipped');
      if (stack.durability !== undefined) stack.durability--;
    }
    state.lastGatherAt = action.now;
  } else fail('Unknown inventory action');
  state.revision++;
  return validateInventory(state);
}
