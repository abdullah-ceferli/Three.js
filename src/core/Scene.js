import * as THREE from 'three';

export function createScene() {
  const mobile = matchMedia('(pointer: coarse), (max-width: 700px)').matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bc9d2);
  scene.fog = new THREE.FogExp2(0x9bc9d2, 0.0032);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, mobile ? 600 : 1100);
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance', precision: mobile ? 'mediump' : 'highp' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.15 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.id = 'game-canvas';
  document.body.prepend(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xdff5ff, 0x48563c, 2.25));
  const sun = new THREE.DirectionalLight(0xfff2cf, 3.2);
  sun.position.set(-32, 45, 24); sun.castShadow = !mobile; sun.shadow.mapSize.set(mobile ? 512 : 2048, mobile ? 512 : 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -105; sun.shadow.camera.right = sun.shadow.camera.top = 105;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 150; sun.shadow.bias = -0.00025; scene.add(sun);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  return { scene, camera, renderer };
}
