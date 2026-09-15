const material = (id, name, icon) => ({ id, name, icon: `/assets/img/${icon}`, category: 'materials', maxStack: 1000, tradable: true });
const tool = (id, name, icon, durability, attackSpeed, harvestType, harvestMultiplier, lastHitMultiplier) => ({
  id, name, icon: `/assets/img/${icon}`, category: 'tools', classification: ['item', 'tool', 'equipment'], tier: 'stone',
  maxStack: 1, maxDurability: durability, attackSpeed, attackDistance: 3, harvestType, harvestMultiplier, lastHitMultiplier,
  damagePlayers: 5, damageNPCs: 5, damageAnimals: 5, damageBuildings: 5, tradable: true, repairable: true, craftable: true
});
export const ITEM_DEFINITIONS = {
  wood: material('wood', 'Wood', 'Tree.png'),
  stone: { ...material('stone', 'Stone', 'Stone.png'), description: 'A resource and a primitive gathering tool.', attackSpeed: .55, attackDistance: 4 },
  leaves: material('leaves', 'Leaves', 'Leaf.png'),
  rope: { ...material('rope', 'Rope', 'Rope.png'), craftable: true, description: 'An essential material for early tools and building.' },
  stone_hatchet: { ...tool('stone_hatchet', 'Stone Hatchet', 'Stoneaxe.png', 300, .55, 'soft', 1.6, 15), description: '5 damage. Cuts trees and animals.' },
  stone_pickaxe: { ...tool('stone_pickaxe', 'Stone Pickaxe', 'Stonepickaxe.png', 500, .95, 'hard', .90, 8), description: '5 damage. Mines nodes.' }
};
export const RECIPES = {
  rope: { category: 'materials', costs: { leaves: 3 }, output: 'rope', amount: 1 },
  stone_hatchet: { category: 'tools', costs: { wood: 50, stone: 25, rope: 3 }, output: 'stone_hatchet', amount: 1 },
  stone_pickaxe: { category: 'tools', costs: { wood: 50, stone: 25, rope: 4 }, output: 'stone_pickaxe', amount: 1 }
};
export const CATEGORIES = { all: 'All recipes', basics: 'Basics', tools: 'Tools', weapons: 'Weapons', building: 'Building', materials: 'Materials' };
export const itemType = type => ({ axe: 'stone_hatchet', pickaxe: 'stone_pickaxe' })[type] || type;
