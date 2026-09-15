import { ITEM_DEFINITIONS as ITEMS, RECIPES, CATEGORIES } from '../shared/itemDefinitions.js';
import { HOTBAR_SIZE, inventoryAction } from '../shared/inventoryState.js';
const FRAME='/assets/img/corner-of-hotbar-element.png';

export class InventoryUI {
  constructor() {
    this.hotbar=document.querySelector('#hotbar'); this.panel=document.querySelector('#inventory-panel');
    this.resources=document.querySelector('#resource-list'); this.recipes=document.querySelector('#recipe-list');
    this.detail=document.querySelector('#craft-detail'); this.bagButton=document.querySelector('#bag-button');
    this.search=document.querySelector('#recipe-search'); this.categories=document.querySelector('#recipe-categories');
    this.open=false; this.enabled=false; this.selectedRecipe='rope'; this.category='all'; this.query=''; this.pendingMove=null;
    document.querySelector('#inventory-close').addEventListener('click',()=>this.toggle(false));
    this.bagButton.addEventListener('click',()=>this.toggle());
    this.search.addEventListener('input',()=>{this.query=this.search.value.toLowerCase().trim();this.renderRecipes();});
    for(const [id,label] of Object.entries(CATEGORIES)) {
      const button=document.createElement('button');button.textContent=label;button.dataset.category=id;button.type='button';
      button.addEventListener('click',()=>{this.category=id;this.renderRecipes();});this.categories.append(button);
    }
    addEventListener('keydown',event=>{
      if(!this.enabled||event.repeat||event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
      if(event.code==='Tab'){event.preventDefault();this.toggle();return;}
      if(event.code==='Escape'&&this.open){this.toggle(false);return;}
      const key=/^Digit([1-5])$/.exec(event.code);
      if(key){event.preventDefault();this.onSelect?.(Number(key[1])-1);}
    });
  }
  toggle(force) {
    if(!this.enabled&&force!==false)return;
    this.open=force??!this.open; this.panel.classList.toggle('hidden',!this.open);
    document.body.classList.toggle('inventory-open',this.open);
    this.bagButton.classList.toggle('selected',this.open);this.bagButton.setAttribute('aria-expanded',String(this.open));
    this.clearPendingMove();if(this.open)document.exitPointerLock?.();
  }
  itemMarkup(stack,key='') {
    const item=ITEMS[stack.type], durability=item.maxDurability;
    return `<span class="ui-item-clip"><img class="ui-item-img" src="${item.icon}" alt="${item.name}"></span><img class="ui-corner" src="${FRAME}" alt="">
      ${key?'<span class="slot-key">'+key+'</span>':''}<span class="main-count"><b class="count">${stack.quantity}</b></span>
      ${durability?'<span class="durability '+(stack.durability===0?'broken':'')+'" style="--durability:'+(100*stack.durability/durability)+'%"></span>':''}`;
  }
  render(state,selected) {
    this.state=state;this.clearPendingMove();this.hotbar.replaceChildren();this.resources.replaceChildren();
    for(const [area,slots,root] of [['hotbar',state.hotbar,this.hotbar],['inventory',state.inventorySlots,this.resources]]) {
      slots.forEach((id,index)=>{
        const stack=state.items[id],button=document.createElement('button');
        button.type='button';button.className=`ui ${area==='hotbar'?'hotbar-slot':'inventory-slot'}${!stack?' empty':''}${area==='hotbar'&&index===selected?' selected':''}`;
        button.setAttribute('aria-label',stack?ITEMS[stack.type].name+' ×'+stack.quantity:area+' slot '+(index+1));
        if(area==='hotbar')button.setAttribute('aria-pressed',String(index===selected));
        button.innerHTML=stack?this.itemMarkup(stack,area==='hotbar'?index+1:''):`<img class="ui-corner" src="${FRAME}" alt="">${area==='hotbar'?'<span class="slot-key">'+(index+1)+'</span>':''}`;
        button.title=stack?ITEMS[stack.type].name+(stack.durability!==undefined?' · Durability '+stack.durability+'/'+ITEMS[stack.type].maxDurability:''):'Empty slot';
        this.bindSlot(button,area,index,id);root.append(button);
      });
    }
    document.querySelector('#inventory-capacity').textContent=state.inventorySlots.filter(Boolean).length+' / 15';
    this.renderRecipes();this.renderDetail();
  }
  bindSlot(button,area,index,id) {
    button.dataset.area=area;button.dataset.index=index;button.draggable=Boolean(id);
    const source={area,index,itemId:id};
    button.addEventListener('dragstart',event=>{if(!id)return;this.pendingMove=source;button.classList.add('moving');event.dataTransfer.setData('text/plain',JSON.stringify(source));event.dataTransfer.effectAllowed='move';});
    button.addEventListener('dragover',event=>{event.preventDefault();button.classList.add('drop-target');});
    button.addEventListener('dragleave',()=>button.classList.remove('drop-target'));
    button.addEventListener('drop',event=>{event.preventDefault();let from;try{from=JSON.parse(event.dataTransfer.getData('text/plain'));}catch{return;}this.move(from,{area,index});});
    button.addEventListener('dragend',()=>this.clearPendingMove());
    button.addEventListener('click',()=>{
      if(this.pendingMove){this.move(this.pendingMove,{area,index});return;}
      if(this.open&&id){this.pendingMove=source;button.classList.add('moving');return;}
      if(area==='hotbar')this.onSelect?.(index);
    });
  }
  move(source,target) {
    if(source.area!==target.area||source.index!==target.index)this.onMove?.({fromArea:source.area,fromIndex:source.index,toArea:target.area,toIndex:target.index,itemId:source.itemId});
    this.clearPendingMove();
  }
  clearPendingMove() {this.pendingMove=null;document.querySelectorAll('.moving,.drop-target').forEach(el=>el.classList.remove('moving','drop-target'));}
  craftError(id) {try{inventoryAction(this.state,{type:'craft',recipeId:id});return '';}catch(error){return error.message;}}
  renderRecipes() {
    if(!this.state)return;
    this.categories.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.category===this.category));
    this.recipes.replaceChildren();
    for(const [id,recipe] of Object.entries(RECIPES)) {
      const item=ITEMS[recipe.output];
      if(this.category!=='all'&&recipe.category!==this.category)continue;
      if(this.query&&!item.name.toLowerCase().includes(this.query))continue;
      const button=document.createElement('button');button.className='recipe-tile'+(id===this.selectedRecipe?' active':'');
      button.innerHTML=`<img src="${item.icon}" alt=""><strong>${item.name}</strong><small>${this.craftError(id)?'Materials needed':'Ready to craft'}</small>`;
      button.addEventListener('click',()=>{this.selectedRecipe=id;this.renderRecipes();this.renderDetail();});this.recipes.append(button);
    }
    if(!this.recipes.children.length){const empty=document.createElement('p');empty.className='recipe-empty';empty.textContent='No recipes in this category yet.';this.recipes.append(empty);}
  }
  renderDetail() {
    const recipe=RECIPES[this.selectedRecipe],item=ITEMS[recipe.output];
    this.detail.innerHTML=`<div class="craft-preview"><img src="${item.icon}" alt="${item.name}"></div><div class="craft-copy"><small>${item.tier?'STONE EQUIPMENT':'CRAFTING MATERIAL'}</small><h3>${item.name}</h3><p>${item.description||''}</p></div>
      ${item.maxDurability?'<div class="tool-stats"><span>Durability <b>'+item.maxDurability+'</b></span><span>Interval <b>'+item.attackSpeed+'s</b></span><span>Reach <b>'+item.attackDistance+'m</b></span></div>':''}
      <div class="ingredient-list">${Object.entries(recipe.costs).map(([type,cost])=>{const count=this.state.resources[type],enough=count>=cost;return '<div class="ingredient '+(enough?'enough':'missing')+'"><img src="'+ITEMS[type].icon+'" alt=""><span>'+ITEMS[type].name+'</span><strong>'+count+' / '+cost+' '+(enough?'✓':'✕')+'</strong></div>';}).join('')}</div>`;
    const button=document.createElement('button'),error=this.craftError(this.selectedRecipe);
    button.className='craft-action';button.disabled=Boolean(error);button.textContent=error||'Craft '+item.name;
    button.addEventListener('click',()=>{button.disabled=true;this.onCraft?.(this.selectedRecipe);});this.detail.append(button);
  }
}
