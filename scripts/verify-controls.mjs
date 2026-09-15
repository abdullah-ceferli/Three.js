import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeInventory } from '../server/gameServerPlugin.js';
import { Inventory } from '../src/inventory/Inventory.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { playerHeight } from '../src/shared/worldLayout.js';
import { startingInventory } from '../src/shared/survivalConfig.js';

const fresh = startingInventory();
assert.equal(fresh.hotbar.length, 5);
assert.equal(fresh.inventorySlots.length, 15);
assert.deepEqual(fresh.resources, { wood: 0, stone: 1, leaves: 0, rope: 0 });
const old = startingInventory();
old.resources.wood = 56;
old.hotbar[5] = 'wood';
old.inventorySlots[3] = 'stone'; // legacy ghost is removed, not duplicated
const migrated = normalizeInventory({ inventory: old });
assert.equal(migrated.hotbar.length, 5);
assert.equal(migrated.inventorySlots.filter(x => migrated.items[x]?.type === 'wood').length, 1);
assert.equal(migrated.resources.wood, 56);
assert.equal(migrated.inventorySlots.includes('stone'), false);
const inventory = new Inventory();
for (let index = 0; index < 5; index++) {
  inventory.selectHotbar(index);
  assert.equal(inventory.selectedHotbarIndex, index);
  assert.equal(inventory.getSelectedTool(), index === 0 ? 'stone' : null);
}
for (const invalid of [5, 6, -1, 1.5, NaN]) {
  inventory.selectHotbar(invalid);
  assert.equal(inventory.selectedHotbarIndex, 4);
}
// Exercise the real look/update methods without a browser or asset fetch.
const player = Object.create(PlayerController.prototype);
Object.assign(player, {
  group: new THREE.Group(), cameraYaw: new THREE.Group(), pitch: new THREE.Group(),
  camera: new THREE.PerspectiveCamera(), eyeHeight: 1.62, enabled: true,
  movement: new THREE.Vector3(), joystick: new THREE.Vector2(), keys: new Set(),
  onMovement() {}, updateVisual() {}, walkTime: 0
});
player.cameraYaw.add(player.pitch); player.pitch.add(player.camera);
player.pitch.position.y = player.eyeHeight;
player.group.position.set(11, 0, -7);
for (const [dx, dy] of [[0, 0], [200, 9000], [-300, -9000], [100, 300]]) {
  player.look(dx, dy); player.update(.016);
  player.cameraYaw.updateMatrixWorld(true);
  const eye = player.camera.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(eye.y - playerHeight(11,-7) - 1.62) < 1e-10);
  assert.ok(Math.abs(eye.x - 11) < 1e-10);
  assert.ok(Math.abs(eye.z + 7) < 1e-10);
  assert.deepEqual(player.group.position.toArray(), [11, playerHeight(11,-7), -7]);
  assert.equal(player.group.rotation.x, 0); assert.equal(player.group.rotation.z, 0);
}
console.log('PASS: 5 hotbar + 15 backpack, sixth-slot migration, no ghost stacks, valid selection only, first-person eye pivot stays fixed.');
