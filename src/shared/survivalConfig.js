import { RECIPES } from './itemDefinitions.js';
import { ISLAND_RESOURCES } from './worldLayout.js';
export const SURVIVAL = Object.freeze({
  interactionRange: 4,
  hitCooldownMs: 550,
  stackLimits: { wood: 1000, stone: 1000, leaves: 1000, rope: 1000 },
  tree: { capacity: 200, stoneReward: [20, 30], axeReward: [30, 40], respawnMs: 20 * 60 * 1000 },
  rock: { capacity: 200, stoneReward: [10, 15], pickaxeReward: [20, 30], respawnMs: 20 * 60 * 1000 },
  leaf: { rewardRange: [1, 3], respawnMs: 5 * 60 * 1000 },
  recipes: RECIPES
});

export const INVENTORY_SLOT_COUNT = 15;
export const HOTBAR_SLOT_COUNT = 5;

export const RESOURCE_NODES = ISLAND_RESOURCES;

export function startingInventory() {
  return {
    resources: { wood:0, stone:1, leaves:0, rope:0 },
    tools: [],
    inventorySlots: Array(INVENTORY_SLOT_COUNT).fill(null),
    hotbar: ['stone', ...Array(HOTBAR_SLOT_COUNT - 1).fill(null)]
  };
}
