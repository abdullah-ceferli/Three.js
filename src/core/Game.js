import * as THREE from 'three';
import { createScene } from './Scene.js';
import { World } from '../world/World.js';
import { PlayerController } from '../player/PlayerController.js';
import { NetworkClient } from '../network/NetworkClient.js';
import { RemotePlayers } from '../network/RemotePlayers.js';
import { Lobby } from '../ui/Lobby.js';
import { CONFIG } from '../config.js';
import { Inventory } from '../inventory/Inventory.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { FirstPersonTool } from '../player/FirstPersonTool.js';
import { AuthUI } from '../ui/AuthUI.js';

export class Game {
  constructor() {
    const setup = createScene(); this.scene = setup.scene; this.camera = setup.camera; this.renderer = setup.renderer; this.clock = new THREE.Clock(); this.active = false; this.networkTimer = 0; this.networkInterval=matchMedia('(pointer: coarse), (max-width: 700px)').matches ? .1 : CONFIG.network.updateInterval;
    this.world = new World(this.scene); this.remotePlayers = new RemotePlayers(this.scene, this.camera);
    this.inventoryUI = new InventoryUI(); this.inventory = new Inventory(this.inventoryUI); this.inventoryUI.onSelect = index => {this.inventory.selectHotbar(index);this.network?.send({type:'hotbar-select',index});this.viewModel?.setTool(this.inventory.getSelectedTool());}; this.inventoryUI.onCraft = recipeId => this.network.send({type:'craft',recipeId}); this.inventoryUI.onMove = move => this.network.send({type:'inventory-move',...move});
    this.lobby = new Lobby(message => this.network.send(message));
    this.player = new PlayerController(this.scene, this.camera, this.renderer.domElement, this.world.collisions, walking => this.lobby.movement(walking,this.player?.swimming));
    this.viewModel = new FirstPersonTool(this.camera);
    this.network = new NetworkClient({
      status: value => this.lobby.status(value), connection: connected => this.lobby.setConnected(connected), servers: servers => this.lobby.renderServers(servers), error: message => this.lobby.error(message),
      joined: (room,spawn) => { this.player.setSpawn(spawn); this.active = true; this.player.enabled = true; this.inventoryUI.enabled = true; this.lobby.enter(room); },
      left: () => { this.active = false; this.player.enabled = false; this.inventoryUI.toggle(false); this.inventoryUI.enabled = false; this.remotePlayers.clear(); this.lobby.leave(); },
      players: (players, localId) => this.remotePlayers.sync(players, localId),
      inventory: state => { this.inventory.setState(state); this.viewModel?.setTool(this.inventory.getSelectedTool()); }, resources: states => this.world.applyResourceStates(states),
      resourceUpdate: state => this.world.applyResourceState(state), notice: (message,error=false) => this.showNotice(message,error), playerAction: action => this.remotePlayers.playAction(action.playerId)
    });
    this.auth = new AuthUI(session => this.network.authenticate(session));
    this.nearbyResource = null;
    this.mobileAction = document.querySelector('#mobile-action');
    this.renderer.domElement.addEventListener('pointerdown', event => { if(event.pointerType==='mouse'&&event.button===0&&document.pointerLockElement===this.renderer.domElement&&this.active&&!this.inventoryUI.open)this.gather(); });
    this.mobileAction.addEventListener('pointerdown', event => { event.preventDefault();event.stopPropagation();if(this.active&&!this.inventoryUI.open)this.gather(); });
  }
  async start() { await this.world.build(); this.renderer.setAnimationLoop(() => this.update()); }
  update() {
    const delta = Math.min(this.clock.getDelta(), .1); this.player.enabled=this.active&&!this.inventoryUI.open; this.player.update(delta); this.remotePlayers.update(delta); this.viewModel.update(delta); this.world.update(delta,this.player.group.position); this.updateInteraction();
    if (this.active) { this.networkTimer += delta; if (this.networkTimer >= this.networkInterval) { this.networkTimer = 0; this.network.send({ type: 'state', ...this.player.getState() }); } }
    this.renderer.render(this.scene, this.camera);
  }
  updateInteraction() { const prompt=document.querySelector('#interaction-prompt'),mobile=matchMedia('(pointer: coarse), (max-width: 700px)').matches;if(!this.active||this.inventoryUI.open){prompt.classList.add('hidden');this.mobileAction.disabled=true;return;}this.nearbyResource=this.world.getNearestResource(this.player.group.position);prompt.classList.toggle('hidden',!this.nearbyResource);this.mobileAction.disabled=!this.nearbyResource;if(this.nearbyResource){const type=this.nearbyResource.userData.resource.type,verb=type==='leaf'?'Pick Up':type==='tree'?'Hit Tree':'Mine Rock';prompt.querySelector('kbd').textContent=mobile?'BUTTON':'CLICK';prompt.querySelector('span').textContent=mobile?`Tap button to ${verb}`:`Click to ${verb}`;this.mobileAction.querySelector('span').textContent=type==='leaf'?'PICK UP':type==='tree'?'CHOP':'MINE';} }
  gather() { if(!this.nearbyResource)return;const resource=this.nearbyResource.userData.resource;if(resource.type!=='leaf'&&!this.inventory.getSelectedTool())return this.showNotice('Select a tool in your hotbar',true);if(resource.type!=='leaf'){this.player.playGatherAnimation();this.viewModel.swing();this.world.hitResource(this.nearbyResource);}this.network.send({type:'gather',nodeId:resource.id,tool:this.inventory.getSelectedTool()}); }
  showNotice(message,error=false){if(error)this.inventory.render();const notice=document.querySelector('#action-notice');notice.textContent=message;notice.classList.toggle('error',error);notice.classList.remove('hidden');clearTimeout(this.noticeTimer);this.noticeTimer=setTimeout(()=>notice.classList.add('hidden'),1600);}
}
