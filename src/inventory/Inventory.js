import { migrateInventory, equippedStack, HOTBAR_SIZE } from '../shared/inventoryState.js';
import { ITEM_DEFINITIONS } from '../shared/itemDefinitions.js';
export class Inventory {
  constructor(ui) { this.ui=ui; this.state=migrateInventory(); this.selectedHotbarIndex=0; this.render(); }
  setState(state) { this.state=migrateInventory(state); this.selectedHotbarIndex=this.state.selectedHotbarIndex; this.render(); }
  selectHotbar(index) { if(!Number.isInteger(index)||index<0||index>=HOTBAR_SIZE)return; this.selectedHotbarIndex=index; this.state.selectedHotbarIndex=index; this.render(); }
  getSelectedItem() { return equippedStack(this.state); }
  getSelectedTool() { const item=this.getSelectedItem(); return ITEM_DEFINITIONS[item?.type]?.attackSpeed ? item.type : null; }
  render() { this.ui?.render(this.state,this.selectedHotbarIndex); }
}
