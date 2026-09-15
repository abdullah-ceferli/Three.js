import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { ITEM_DEFINITIONS } from '../shared/itemDefinitions.js';

const ROOT='/assets/Models/survival-kit/Models/GLB%20format/';
const FILES={stone:CONFIG.assets.starterStone,stone_hatchet:`${ROOT}tool-axe.glb`,stone_pickaxe:`${ROOT}tool-pickaxe.glb`};

export class FirstPersonTool {
  constructor(camera){this.camera=camera;this.pivot=new THREE.Group();this.pivot.position.set(.48,-.32,-.72);this.pivot.rotation.set(-.15,.12,-.2);camera.add(this.pivot);this.models=new Map();this.selected='stone';this.swingTime=0;this.load();}
  async load(){const loader=new GLTFLoader();await Promise.all(Object.entries(FILES).map(async([id,file])=>{const model=(await loader.loadAsync(file)).scene;if(id==='stone'){model.rotation.set(.2,-.35,.5);model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),scale=.34/Math.max(size.x,size.y,size.z);model.scale.setScalar(scale);model.updateMatrixWorld(true);model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));}else{model.scale.setScalar(.72);model.rotation.set(.15,0,-.15);}model.traverse(object=>{if(object.isMesh){object.material=object.material.clone();object.material.metalness=0;object.material.depthTest=false;object.material.depthWrite=false;object.renderOrder=1000;}});model.visible=id===this.selected;this.pivot.add(model);this.models.set(id,model);}));}
  setTool(tool){this.selected=tool;this.models.forEach((model,id)=>model.visible=id===tool);}
  swing(){if(this.swingTime<=0){this.swingDuration=ITEM_DEFINITIONS[this.selected]?.attackSpeed||.55;this.swingTime=this.swingDuration;}}
  update(delta){this.pivot.position.x=Math.min(.38,.72*Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect*.6);if(this.swingTime>0){this.swingTime=Math.max(0,this.swingTime-delta);const progress=1-this.swingTime/this.swingDuration,arc=Math.sin(progress*Math.PI);this.pivot.rotation.x=-.15-arc*1.05;this.pivot.rotation.z=-.2-arc*.48;this.pivot.position.y=-.32-arc*.08;}else{this.pivot.rotation.x=THREE.MathUtils.damp(this.pivot.rotation.x,-.15,18,delta);this.pivot.rotation.z=THREE.MathUtils.damp(this.pivot.rotation.z,-.2,18,delta);this.pivot.position.y=THREE.MathUtils.damp(this.pivot.position.y,-.32,18,delta);}}
}
