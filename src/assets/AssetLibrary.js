import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AssetLibrary {
  constructor(root = '/assets/Models/survival-kit/Models/GLB%20format/') { this.root = root; this.loader = new GLTFLoader(); this.models = new Map(); }
  async load(names) { await Promise.all([...new Set(names)].map(async name => { const gltf = await this.loader.loadAsync(`${this.root}${name}.glb`); this.models.set(name, gltf.scene); })); }
  clone(name) { const model = this.models.get(name); if (!model) throw new Error(`Model not loaded: ${name}`); return model.clone(true); }
}
