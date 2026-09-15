export class NetworkClient {
  constructor(handlers) { this.handlers=handlers;this.id=null;this.socket=null;this.queue=[];this.retry=0;this.closedByUser=false;this.authenticated=false; }
  authenticate(){this.authenticated=true;this.closedByUser=false;this.connect();}
  connect(){
    if(!this.authenticated)return;
    this.handlers.status('Connecting…');this.handlers.connection?.(false);
    const protocol=location.protocol==='https:'?'wss':'ws';this.socket=new WebSocket(`${protocol}://${location.host}/ws`);
    this.socket.addEventListener('open',()=>{this.retry=0;this.handlers.status('Loading player…');const pending=this.queue.splice(0);pending.forEach(message=>this.send(message));});
    this.socket.addEventListener('close',()=>{this.handlers.status('Reconnecting…');this.handlers.connection?.(false);this.handlers.left?.();if(!this.closedByUser){const delay=Math.min(1000*2**this.retry++,10000);clearTimeout(this.reconnectTimer);this.reconnectTimer=setTimeout(()=>this.connect(),delay);}});
    this.socket.addEventListener('error',()=>this.handlers.error?.('Connection lost. Reconnecting…'));
    this.socket.addEventListener('message',event=>{try{this.route(JSON.parse(event.data));}catch(error){console.warn('Invalid server message',error);}});
  }
  route(message){
    if(message.type==='welcome'){this.id=message.id;this.handlers.status('Connected');this.handlers.connection?.(true);}
    else if(message.type==='servers')this.handlers.servers(message.servers);
    else if(message.type==='joined')this.handlers.joined(message.room,message.spawn);
    else if(message.type==='join-failed')this.handlers.error(message.reason);
    else if(message.type==='left')this.handlers.left();
    else if(message.type==='players')this.handlers.players(message.players,this.id);
    else if(message.type==='inventory')this.handlers.inventory(message.inventory);
    else if(message.type==='resources')this.handlers.resources(message.resources);
    else if(message.type==='resource-update')this.handlers.resourceUpdate(message.resource);
    else if(message.type==='gather-result')this.handlers.notice(message.label);
    else if(message.type==='craft-result')this.handlers.notice(`${message.recipeId} crafted`);
    else if(message.type==='action-error')this.handlers.notice(message.reason,true);
    else if(message.type==='player-action')this.handlers.playerAction?.(message);
    else if(message.type==='fatal-error'){this.closedByUser=true;this.handlers.error?.(message.reason);}
  }
  send(message){if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(message));return true;}if(['create','join','leave'].includes(message.type)){if(!this.queue.some(item=>item.type===message.type))this.queue.push(message);this.handlers.error?.('Connecting to server… your action is queued.');}return false;}
}
