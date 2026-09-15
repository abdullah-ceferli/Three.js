export const ISLAND = { seed: 7219, radius: 210, waterLevel: 0, swimDepth: 1.2, swimSpeed: 3.2, groundSpeed: 6, oceanSize: 6000 };
export function randomSequence(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function coastDistance(x, z) {
  const a = Math.atan2(z, x);
  return ISLAND.radius + 19 * Math.sin(a * 3 + .4) + 13 * Math.sin(a * 7) - Math.hypot(x, z);
}
export function groundHeight(x, z) {
  const inland = coastDistance(x, z);
  if (inland < -38) return -18;
  const shore = Math.min(3.6, Math.max(-18, inland * .28));
  const interior = Math.max(0, Math.min(1, (inland - 18) / 50));
  const hills = 5 * Math.exp(-((x + 83) ** 2 + (z - 64) ** 2) / 4200)
    + 9 * Math.exp(-((x - 88) ** 2 + (z + 66) ** 2) / 3800)
    + (Math.sin(x * .026) * Math.cos(z * .031) + 1) * 1.2;
  return shore + hills * interior;
}
export const isSwimming = (x, z) => groundHeight(x, z) < ISLAND.waterLevel - ISLAND.swimDepth;
export const playerHeight = (x, z) => Math.max(groundHeight(x, z), ISLAND.waterLevel - 1.25);
const random = randomSequence(ISLAND.seed), nodes = [];
// Keep the starter clearing navigable; nearby resources make the first loop quick.
for (const [type, positions] of Object.entries({ tree: [[-8, 12], [12, 9], [-17, -7]], rock: [[-5, 7], [4, -3], [13, -9]], leaf: [[-3, 4], [-4, 5], [-3, 6], [-2, 6]] })) {
  positions.forEach(([x, z], i) => nodes.push({ id: `${type}-${i}`, type, x, z, rotation: random() * 6.28, scale: .9 + random() * .3 }));
}
for (const [type, count] of [['tree', 170], ['rock', 65], ['leaf', 110]]) {
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = (random() - .5) * 440, z = (random() - .5) * 440;
      if (coastDistance(x, z) < 18 || Math.hypot(x, z) < 19 || nodes.some(n => Math.hypot(n.x - x, n.z - z) < (type === 'tree' ? 6 : 3))) continue;
      nodes.push({ id: `${type}-island-${i}`, type, x, z, rotation: random() * 6.28, scale: .8 + random() * .45 }); break;
    }
  }
}
export const ISLAND_RESOURCES = Object.freeze(nodes);
