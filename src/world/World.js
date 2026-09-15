import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { CollisionWorld } from './CollisionWorld.js';
import { RESOURCE_NODES, SURVIVAL } from '../shared/survivalConfig.js';
import { ISLAND, groundHeight, coastDistance } from '../shared/worldLayout.js';

export class World {
  constructor(scene) {
    this.scene=scene;this.mobile=matchMedia('(pointer:coarse),(max-width:700px)').matches;
    this.collisions=new CollisionWorld();this.resourceObjects=new Map();this.pendingResourceStates=new Map();
    this.batches=[];this.time=0;this.cullTimer=0;this.hiddenMatrix=new THREE.Matrix4().makeScale(0,0,0);
  }
  async build() {
    this.createTerrain();this.createOcean();
    const files={tree:CONFIG.assets.tree,rockA:CONFIG.assets.stoneModels[0],rockB:CONFIG.assets.stoneModels[1],leaf:CONFIG.assets.leaves};
    await Promise.all(Object.entries(files).map(async([kind,path])=>{
      const gltf=await new GLTFLoader().loadAsync(path);
      const type=kind.startsWith('rock')?'rock':kind;
      const definitions=RESOURCE_NODES.filter((node,index)=>node.type===type&&(type!=='rock'||index%2===(kind==='rockA'?0:1)));
      this.createResourceBatch(gltf.scene,definitions,type);
    }));
  }
  texture(path,repeat) {
    const texture=new THREE.TextureLoader().load(path);texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.setScalar(repeat);texture.anisotropy=this.mobile?2:8;return texture;
  }
  createTerrain() {
    const geometry=new THREE.PlaneGeometry(620,620,this.mobile?140:220,this.mobile?140:220);geometry.rotateX(-Math.PI/2);
    const positions=geometry.attributes.position,colors=[];
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,groundHeight(x,z));
      const inland=coastDistance(x,z);colors.push(Math.max(0,Math.min(1,(inland-5)/13)),0,0);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const grass=this.texture(CONFIG.assets.grassTexture,1),sand=this.texture(CONFIG.assets.sandTexture,1);
    const material=new THREE.ShaderMaterial({uniforms:{grass:{value:grass},sand:{value:sand},fogColor:{value:this.scene.background},fogDensity:{value:.0032}},
      vertexShader:`varying vec3 vWorld;varying vec3 vNormal;varying float vGrass;attribute vec3 color;
      void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*normal);vGrass=color.r;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader:`uniform sampler2D grass;uniform sampler2D sand;uniform vec3 fogColor;uniform float fogDensity;
      varying vec3 vWorld;varying vec3 vNormal;varying float vGrass;
      void main(){vec3 ground=mix(texture2D(sand,vWorld.xz*.16).rgb,texture2D(grass,vWorld.xz*.22).rgb,smoothstep(0.,1.,vGrass));
      float light=.65+.4*max(0.,dot(normalize(vNormal),normalize(vec3(-.5,1.,.4))));vec3 color=ground*light;
      float distanceToCamera=length(cameraPosition-vWorld);float fog=1.-exp(-pow(distanceToCamera*fogDensity,2.));
      gl_FragColor=vec4(mix(color,fogColor,fog),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
    const terrain=new THREE.Mesh(geometry,material);terrain.name='Island terrain';this.scene.add(terrain);
  }
  createOcean() {
    const geometry=new THREE.PlaneGeometry(ISLAND.oceanSize,ISLAND.oceanSize,1,1);geometry.rotateX(-Math.PI/2);
    const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},fogColor:{value:this.scene.background}},
      vertexShader:`varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`uniform float time;uniform vec3 fogColor;varying vec3 vWorld;
      void main(){vec2 p=vWorld.xz;float a=atan(p.y,p.x);float coast=210.+19.*sin(a*3.+.4)+13.*sin(a*7.)-length(p);
      float waves=sin(p.x*.32+time*.8)*sin(p.y*.27-time*.6)+.4*sin((p.x+p.y)*.8+time);
      float shallow=smoothstep(-30.,-1.,coast);vec3 water=mix(vec3(.025,.20,.30),vec3(.08,.54,.52),shallow);
      water+=waves*.019;float foam=(1.-smoothstep(0.,2.2,abs(coast+.6+sin(time+p.x*.2)*.5)))*(.5+.5*sin(p.x*.9+p.y*.6+time));
      water=mix(water,vec3(.75,.9,.8),foam*.5);
      vec3 ray=normalize(cameraPosition-vWorld);float glint=pow(max(0.,dot(reflect(normalize(vec3(.5,-1.,-.4)),normalize(vec3(waves*.08,1.,sin(p.x*.4-time)*.07))),ray)),60.);
      water+=glint*.35;float d=length(cameraPosition-vWorld);float fog=1.-exp(-pow(d*.0032,2.));
      gl_FragColor=vec4(mix(water,fogColor,fog),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,side:THREE.DoubleSide});
    this.ocean=new THREE.Mesh(geometry,material);this.ocean.name='Endless ocean';this.ocean.position.y=ISLAND.waterLevel;this.scene.add(this.ocean);
  }
  createResourceBatch(model,definitions,type) {
    if(!definitions.length)return;
    model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const target=type==='tree'?8:type==='rock'?1.65:.5;
    const factor=target/Math.max(.001,type==='tree'?size.y:Math.max(size.x,size.y,size.z));
    const normalize=new THREE.Matrix4().makeScale(factor,factor,factor).multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z));
    const anchors=definitions.map(definition=>{
      const anchor=new THREE.Group();anchor.position.set(definition.x,groundHeight(definition.x,definition.z),definition.z);
      anchor.rotation.y=definition.rotation;anchor.scale.setScalar(definition.scale);anchor.updateMatrixWorld();
      anchor.userData.resource={...definition,active:true,remaining:type==='leaf'?1:SURVIVAL[type].capacity};
      anchor.userData.instances=[];anchor.userData.baseMatrix=anchor.matrixWorld.clone();
      if(type!=='leaf')anchor.userData.obstacle=this.collisions.addCircle(definition.x,definition.z,type==='tree'?.48:.8);
      this.resourceObjects.set(definition.id,anchor);return anchor;
    });
    model.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(source=>{const material=source.clone();if(type==='leaf'){material.metalness=0;material.roughness=1;material.side=THREE.DoubleSide;}return material;});
      const batch=new THREE.InstancedMesh(mesh.geometry,Array.isArray(mesh.material)?materials:materials[0],definitions.length);batch.castShadow=!this.mobile;batch.receiveShadow=true;batch.frustumCulled=false;
      batch.userData.instances=[];
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const local=normalize.clone().multiply(mesh.matrixWorld);
      anchors.forEach((anchor,index)=>{
        const matrix=anchor.userData.baseMatrix.clone().multiply(local);
        batch.setMatrixAt(index,matrix);anchor.userData.instances.push({batch,index,matrix});
        batch.userData.instances.push({anchor,matrix});
      });
      this.scene.add(batch);this.batches.push(batch);
    });
    anchors.forEach(anchor=>{const pending=this.pendingResourceStates.get(anchor.userData.resource.id);if(pending){this.applyResourceState(pending);this.pendingResourceStates.delete(pending.id);}});
  }
  applyResourceStates(states){states.forEach(state=>this.applyResourceState(state));}
  applyResourceState(state){
    const model=this.resourceObjects.get(state.id);if(!model){this.pendingResourceStates.set(state.id,state);return;}
    Object.assign(model.userData.resource,state);model.visible=state.active;
    if(model.userData.obstacle)model.userData.obstacle.active=state.active;
    this.cullTimer=0;
  }
  getNearestResource(position,range=4) {
    let nearest=null,distance=range;
    for(const model of this.resourceObjects.values()){if(!model.userData.resource.active)continue;const d=Math.hypot(position.x-model.position.x,position.z-model.position.z);if(d<distance){nearest=model;distance=d;}}
    return nearest;
  }
  hitResource(model){if(model)model.userData.hitTime=.3;}
  update(delta,position=new THREE.Vector3()) {
    this.time+=delta;this.ocean.material.uniforms.time.value=this.time;
    // Recenter the water around the observer; its edge is always beyond the far plane.
    this.ocean.position.x=Math.round(position.x/256)*256;this.ocean.position.z=Math.round(position.z/256)*256;
    this.cullTimer-=delta;
    if(this.cullTimer>0)return;this.cullTimer=.3;
    const maxDistance=this.mobile?105:230;
    for(const batch of this.batches){
      let count=0;
      for(const {anchor,matrix} of batch.userData.instances){
        if(!anchor.userData.resource.active||Math.hypot(anchor.position.x-position.x,anchor.position.z-position.z)>=maxDistance)continue;
        batch.setMatrixAt(count++,matrix);
      }
      batch.count=count;batch.instanceMatrix.needsUpdate=true;
    }
  }
}
