import { ASSET_PATHS } from './assetPaths.js';

export const CONFIG = Object.freeze({
  world: { size: 440 },
  player: { speed: 6, radius: 0.42, eyeHeight: 1.62, modelScale: 1, lookSpeed: 0.0024 },
  network: { updateInterval: 0.05 },
  assets: {
    ...ASSET_PATHS,
    grass: ASSET_PATHS.grassTexture,
    player: ASSET_PATHS.player,
    map: ASSET_PATHS.map,
    starterStone: ASSET_PATHS.starterStone,
    stoneModels: ASSET_PATHS.stoneModels,
    tree: ASSET_PATHS.tree,
    berry: ASSET_PATHS.berry
  }
});
