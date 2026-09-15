export class Lobby {
  constructor(send) {
    this.send = send; this.panel = document.querySelector('#lobby'); this.hud = document.querySelector('#game-hud'); this.joystick = document.querySelector('#joystick'); this.mobileAction = document.querySelector('#mobile-action'); this.bagButton=document.querySelector('#bag-button'); this.crosshair = document.querySelector('#crosshair');
    document.querySelector('#create-server').addEventListener('click', () => this.create());
    document.querySelector('#server-name').addEventListener('keydown', e => { if (e.key === 'Enter') this.create(); });
    document.querySelector('#leave-server').addEventListener('click', () => send({ type: 'leave' }));
    this.setConnected(false);
  }
  isMobile() { return matchMedia('(pointer: coarse), (max-width: 700px)').matches; }
  requestMobileFullscreen() { if(!this.isMobile()||document.fullscreenElement)return;const root=document.documentElement,request=root.requestFullscreen||root.webkitRequestFullscreen;if(request){try{const result=request.call(root);result?.then(()=>screen.orientation?.lock?.('landscape').catch(()=>{})).catch(()=>{});}catch{}} }
  create() { this.requestMobileFullscreen(); const input = document.querySelector('#server-name'); this.error(''); this.send({ type: 'create', name: input.value.trim() || 'New camp' }); }
  renderServers(servers) {
    const list = document.querySelector('#server-list'); list.replaceChildren();
    if (!servers.length) { list.innerHTML = '<p class="empty-list">No camps yet. Create the first one.</p>'; return; }
    servers.forEach(server => { const full = server.players >= server.maxPlayers, card = document.createElement('article'); card.className = 'server-card';
      const copy = document.createElement('div'), name = document.createElement('strong'), count = document.createElement('span'); name.textContent = server.name; count.textContent = `${server.players} / ${server.maxPlayers} explorers`; copy.append(name, count);
      const button = document.createElement('button'); button.textContent = full ? 'Full' : 'Join'; button.disabled = full; button.addEventListener('click', () => {this.requestMobileFullscreen();this.send({ type: 'join', roomId: server.id });}); card.append(copy, button); list.append(card); });
  }
  enter(room) { this.panel.classList.add('hidden'); this.hud.classList.remove('hidden'); this.crosshair.classList.remove('hidden'); document.querySelector('#hotbar').classList.remove('hidden'); if (this.isMobile()) { this.joystick.classList.remove('hidden'); this.mobileAction.classList.remove('hidden'); this.bagButton.classList.remove('hidden'); } document.querySelector('#room-name').textContent = room.name; }
  leave() { document.exitPointerLock?.(); this.panel.classList.remove('hidden'); this.hud.classList.add('hidden'); this.joystick.classList.add('hidden'); this.mobileAction.classList.add('hidden'); this.bagButton.classList.add('hidden'); this.crosshair.classList.add('hidden'); document.querySelector('#hotbar').classList.add('hidden'); document.querySelector('#inventory-panel').classList.add('hidden'); }
  status(value) { document.querySelector('#online-status').textContent = value; }
  setConnected(connected) { const button=document.querySelector('#create-server');button.disabled=!connected;button.textContent=connected?'Create camp':'Connecting…'; }
  movement(walking,swimming) { document.querySelector('#movement-status').textContent = swimming ? 'Swimming' : walking ? 'Walking' : 'Standing'; }
  error(value) { document.querySelector('#lobby-error').textContent = value; }
}
