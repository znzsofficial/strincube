import { Package } from 'lucide-react';
import { inventoryItemIcon, inventoryItemLabel, itemIconStyle, itemKey, type InventoryItem } from './inventoryUi';

interface HotbarProps {
  activeSlot: number;
  hotbarItems: InventoryItem[];
  isLocked: boolean;
  isTouch: boolean;
  onOpenInventory: () => void;
  onSelectHotbarSlot: (slot: number) => void;
}

export function Hotbar({ activeSlot, hotbarItems, isLocked, isTouch, onOpenInventory, onSelectHotbarSlot }: HotbarProps) {
  return (
    <section className={isTouch ? 'hotbar hotbar-touch' : 'hotbar'} aria-label="快捷物品栏">
      {hotbarItems.map((item, index) => (
        <button
          key={`${itemKey(item)}-${index}`}
          type="button"
          className={activeSlot === index ? 'slot active' : 'slot'}
          style={item.type === 'block' ? itemIconStyle(item.block) : undefined}
          aria-label={`${index + 1}: ${inventoryItemLabel(item)}`}
          disabled={!isLocked}
          onClick={() => onSelectHotbarSlot(index)}
        >
          {inventoryItemIcon(item)}
          <span>{index + 1}</span>
        </button>
      ))}
      {isTouch && (
        <button
          type="button"
          className="slot inventory-open-slot"
          aria-label="打开物品栏"
          disabled={!isLocked}
          onClick={onOpenInventory}
        >
          <Package size={22} aria-hidden="true" />
          <span>包</span>
        </button>
      )}
    </section>
  );
}
