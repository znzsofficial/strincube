import { Package, UserRound } from 'lucide-react';
import type { ImportedModelItem } from '../game/blockGame';
import { blockLabels, type BlockType } from '../game/blocks';
import {
  blockItems,
  inventoryItemIcon,
  inventoryItemLabel,
  itemIconClass,
  itemIconStyle,
  itemKey,
  type InventoryItem,
} from './inventoryUi';

interface MobileInventoryProps {
  activeSlot: number;
  heldItem: InventoryItem;
  hotbarItems: InventoryItem[];
  modelItems: ImportedModelItem[];
  onClose: () => void;
  onPutBlockInActiveSlot: (block: BlockType) => void;
  onPutModelInActiveSlot: (model: ImportedModelItem) => void;
  onSelectHotbarSlot: (slot: number) => void;
}

export function MobileInventory({
  activeSlot,
  heldItem,
  hotbarItems,
  modelItems,
  onClose,
  onPutBlockInActiveSlot,
  onPutModelInActiveSlot,
  onSelectHotbarSlot,
}: MobileInventoryProps) {
  return (
    <section className="mobile-inventory" aria-label="移动端物品栏">
      <header>
        <div>
          <Package size={18} aria-hidden="true" />
          <strong>物品栏</strong>
        </div>
        <button type="button" className="mobile-inventory-close" onClick={onClose}>关闭</button>
      </header>
      <div className="mobile-inventory-current">
        {inventoryItemIcon(heldItem, 'large')}
        <span>{inventoryItemLabel(heldItem)}</span>
        <small>点击物品放入热栏 {activeSlot + 1}</small>
      </div>
      <div className="mobile-inventory-grid">
        {blockItems.map((block) => (
          <button key={block} type="button" className={heldItem.type === 'block' && heldItem.block === block ? 'mobile-inventory-item active' : 'mobile-inventory-item'} title={blockLabels[block]} aria-label={`${blockLabels[block]}，放入热栏 ${activeSlot + 1}`} onClick={() => onPutBlockInActiveSlot(block)}>
            <span className={itemIconClass(block, 'large')} style={itemIconStyle(block)} />
            <small>{blockLabels[block]}</small>
          </button>
        ))}
        {modelItems.map((model) => (
          <button key={model.id} type="button" className={heldItem.type === 'model' && heldItem.model.id === model.id ? 'mobile-inventory-item active' : 'mobile-inventory-item'} title={model.name} aria-label={`${model.name}，放入热栏 ${activeSlot + 1}`} onClick={() => onPutModelInActiveSlot(model)}>
            <span className="model-item-icon large"><UserRound size={20} aria-hidden="true" /></span>
            <small>{model.name}</small>
          </button>
        ))}
      </div>
      <div className="mobile-inventory-hotbar" aria-label="当前热栏">
        {hotbarItems.map((item, index) => (
          <button key={`${itemKey(item)}-mobile-inventory-${index}`} type="button" className={activeSlot === index ? 'mobile-inventory-slot active' : 'mobile-inventory-slot'} title={`${index + 1}: ${inventoryItemLabel(item)}`} onClick={() => onSelectHotbarSlot(index)}>
            {inventoryItemIcon(item)}
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
