import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { playerHeight, isSwimming, ISLAND } from '../shared/worldLayout.js';
import { preparePlayerModel } from './preparePlayerModel.js';

export class PlayerController {
  constructor(scene, camera, canvas, collisions, onMovement) {
    this.camera = camera; this.canvas = canvas; this.collisions = collisions; this.onMovement = onMovement;
    this.group = new THREE.Group(); this.cameraYaw = new THREE.Group(); this.pitch = new THREE.Group(); this.visual = new THREE.Group(); this.visual.rotation.y = Math.PI; this.pitch.add(camera); this.cameraYaw.add(this.pitch); this.group.add(this.visual); scene.add(this.group, this.cameraYaw);
    this.keys = new Set(); this.joystick = new THREE.Vector2(); this.movement = new THREE.Vector3(); this.forward = new THREE.Vector3(); this.right = new THREE.Vector3(); this.next = new THREE.Vector3();
    this.eyeHeight = CONFIG.player.eyeHeight; this.walkTime = 0; this.hitTime = 0; this.enabled = false;
    // Pitch rotates around the eyes, never around the player's feet.
    this.pitch.position.y = this.eyeHeight;
    camera.position.set(0, 0, 0); this.bindDesktopControls(); this.bindMobileControls(); this.loadModel();
  }

  async loadModel() {
    try {
      const model = preparePlayerModel((await new GLTFLoader().loadAsync(CONFIG.assets.player)).scene);
      const originalHeight=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
      model.scale.setScalar(1.8/Math.max(.01,originalHeight));
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
      model.position.x -= center.x; model.position.z -= center.z; model.position.y -= bounds.min.y; model.updateMatrixWorld(true);
      const grounded = new THREE.Box3().setFromObject(model);
      this.eyeHeight = THREE.MathUtils.clamp(grounded.min.y + grounded.getSize(new THREE.Vector3()).y * .88, 1.45, 1.72);
      model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); o.material.colorWrite = false; o.material.depthWrite = false; } });
      this.visual.add(model);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(.65, 24), new THREE.MeshBasicMaterial({ color: 0x18251b, transparent: true, opacity: .28, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.scale.y = 1.6; shadow.position.y = .01; this.group.add(shadow);
    } catch (error) { console.warn('Player model unavailable', error); }
  }

  bindDesktopControls() {
    addEventListener('keydown', e => { if (!this.enabled || e.target?.matches?.('input,textarea,select,[contenteditable="true"]')) return; this.keys.add(e.code); }); addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.joystick.set(0, 0); });
    this.canvas.addEventListener('click', () => { if (this.enabled && !matchMedia('(pointer: coarse)').matches) this.canvas.requestPointerLock(); });
    addEventListener('mousemove', e => { if (document.pointerLockElement !== this.canvas) return; this.look(e.movementX, e.movementY); });
  }

  bindMobileControls() {
    const joystick = document.querySelector('#joystick'), knob = document.querySelector('#joystick-knob'); let joystickId = null;
    const update = touch => { const b = joystick.getBoundingClientRect(), dx = touch.clientX - b.left - b.width / 2, dy = touch.clientY - b.top - b.height / 2, max = b.width * .34, d = Math.min(Math.hypot(dx, dy), max), a = Math.atan2(dy, dx), x = Math.cos(a) * d, y = Math.sin(a) * d; knob.style.transform = `translate(${x}px,${y}px)`; this.joystick.set(x / max, y / max); };
    joystick.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); joystickId = e.changedTouches[0].identifier; update(e.changedTouches[0]); }, { passive: false });
    joystick.addEventListener('touchmove', e => { const touch = [...e.changedTouches].find(t => t.identifier === joystickId); if (touch) { e.preventDefault(); update(touch); } }, { passive: false });
    const reset = e => { if (![...e.changedTouches].some(t => t.identifier === joystickId)) return; joystickId = null; this.joystick.set(0, 0); knob.style.transform = ''; };
    joystick.addEventListener('touchend', reset); joystick.addEventListener('touchcancel', reset);
    const lookTouch = { id: null, x: 0, y: 0 };
    this.canvas.addEventListener('touchstart', e => { const touch = e.changedTouches[0]; if (lookTouch.id !== null || touch.clientX < innerWidth * .38) return; lookTouch.id = touch.identifier; lookTouch.x = touch.clientX; lookTouch.y = touch.clientY; }, { passive: true });
    this.canvas.addEventListener('touchmove', e => { const touch = [...e.changedTouches].find(t => t.identifier === lookTouch.id); if (!touch) return; e.preventDefault(); this.look(touch.clientX - lookTouch.x, touch.clientY - lookTouch.y); lookTouch.x = touch.clientX; lookTouch.y = touch.clientY; }, { passive: false });
    this.canvas.addEventListener('touchend', e => { if ([...e.changedTouches].some(t => t.identifier === lookTouch.id)) lookTouch.id = null; });
  }

  look(dx, dy) { if(!this.enabled)return; this.cameraYaw.rotation.y -= dx * CONFIG.player.lookSpeed; this.pitch.rotation.x = THREE.MathUtils.clamp(this.pitch.rotation.x - dy * CONFIG.player.lookSpeed, -1.02, 1.22); }

  setSpawn(spawn={}) { const rotation=Number(spawn.rotation)||0;this.group.position.set(Number(spawn.x)||0,playerHeight(Number(spawn.x)||0,Number(spawn.z)||0),Number(spawn.z)||0);this.group.rotation.y=rotation;this.cameraYaw.position.copy(this.group.position);this.cameraYaw.rotation.y=rotation;this.pitch.rotation.x=0; }

  playGatherAnimation() { this.hitTime = .48; }

  updateVisual(delta, walking) {
    if (this.hitTime > 0) {
      this.hitTime = Math.max(0, this.hitTime - delta);
      const progress = 1 - this.hitTime / .48;
      const windup = Math.sin(progress * Math.PI);
      const strike = Math.sin(Math.min(1, progress * 1.35) * Math.PI);
      this.visual.rotation.x = 0;
      this.visual.rotation.y = Math.PI - .34 * windup;
      this.visual.rotation.z = 0;
      this.visual.position.set(.06 * windup, Math.sin(progress * Math.PI * 2) * .025, -.08 * strike);
      return;
    }
    const bob = walking ? Math.sin(this.walkTime) * .025 : 0;
    this.visual.rotation.x = THREE.MathUtils.damp(this.visual.rotation.x, 0, 16, delta);
    this.visual.rotation.y = THREE.MathUtils.damp(this.visual.rotation.y, Math.PI, 16, delta);
    this.visual.rotation.z = THREE.MathUtils.damp(this.visual.rotation.z, walking ? Math.sin(this.walkTime * .5) * .025 : 0, 16, delta);
    this.visual.position.x = THREE.MathUtils.damp(this.visual.position.x, 0, 16, delta);
    this.visual.position.y = THREE.MathUtils.damp(this.visual.position.y, bob, 16, delta);
    this.visual.position.z = THREE.MathUtils.damp(this.visual.position.z, 0, 16, delta);
  }

  update(delta) {
    this.group.position.y=playerHeight(this.group.position.x,this.group.position.z);
    this.swimming=isSwimming(this.group.position.x,this.group.position.z);
    this.cameraYaw.position.copy(this.group.position);
    if (!this.enabled) { this.keys.clear(); this.joystick.set(0, 0); this.updateVisual(delta, false); return; }
    this.movement.set((this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.joystick.x, 0, (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0) + this.joystick.y);
    const walking = this.movement.lengthSq() > .01; this.onMovement(walking);
    if (!walking) { this.walkTime = 0; this.updateVisual(delta, false); this.pitch.position.y = THREE.MathUtils.damp(this.pitch.position.y, this.eyeHeight, 10, delta); this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, 0, 10, delta); return; }
    this.movement.normalize(); this.forward.set(0, 0, -1).applyQuaternion(this.cameraYaw.quaternion); this.right.set(1, 0, 0).applyQuaternion(this.cameraYaw.quaternion);
    this.next.copy(this.group.position).addScaledVector(this.forward, -this.movement.z * (this.swimming?ISLAND.swimSpeed:ISLAND.groundSpeed) * delta).addScaledVector(this.right, this.movement.x * (this.swimming?ISLAND.swimSpeed:ISLAND.groundSpeed) * delta);
    this.collisions.resolve(this.next, CONFIG.player.radius); this.next.y=playerHeight(this.next.x,this.next.z); const dx=this.next.x-this.group.position.x,dz=this.next.z-this.group.position.z;this.group.position.copy(this.next);if(Math.hypot(dx,dz)>.0001){const heading=Math.atan2(-dx,-dz),turn=Math.atan2(Math.sin(heading-this.group.rotation.y),Math.cos(heading-this.group.rotation.y));this.group.rotation.y+=turn*Math.min(1,delta*14);}this.cameraYaw.position.copy(this.group.position);this.walkTime += delta * 10;
    this.pitch.position.y = this.eyeHeight + Math.sin(this.walkTime) * .045; this.camera.position.x = Math.cos(this.walkTime * .5) * .025;
    this.updateVisual(delta, true);
  }

  getState() { return { x: this.group.position.x, z: this.group.position.z, rotation: this.group.rotation.y, pitch: this.pitch.rotation.x }; }
}
