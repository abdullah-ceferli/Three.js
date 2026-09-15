// Change model paths here. Keep paths relative to the public `assets` folder.
// Save this file and restart `npm run dev` after changing a path.
export const ASSET_PATHS = {
  player: '/assets/Models/playerModel/player.glb',
  // Original map is preserved as a source asset; island generation now uses
  // worldLayout.js plus the individual tree/stone/leaf paths below.
  map: '/assets/Models/nature-kit/map.glb',

  starterStone: '/assets/Models/stone/stone2.glb',
  stoneModels: [
    '/assets/Models/stone/stone1.glb',
    '/assets/Models/stone/stone2.glb'
  ],

  tree: '/assets/Models/treeModel/tree.glb',
  berry: '/assets/Models/berry/berry.glb',
  grassTexture: '/assets/img/grass-texture.png',
  sandTexture: '/assets/img/sand-texture.png',
  leaves: '/assets/Models/nature-kit/Models/GLTF%20format/grass_leafs.glb'
};
