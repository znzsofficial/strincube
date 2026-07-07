import { Package, UserRound } from 'lucide-react';
import type { ImportedModelItem, ModelImportProgress } from '../game/blockGame';
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

interface DesktopInventoryProps {
  activeSlot: number;
  heldItem: InventoryItem;
  hotbarItems: InventoryItem[];
  importProgress: ModelImportProgress | null;
  importStatus: string;
  modelItems: ImportedModelItem[];
  onImportFolder: () => void;
  onImportModel: () => void;
  onPutBlockInActiveSlot: (block: BlockType) => void;
  onPutModelInActiveSlot: (model: ImportedModelItem) => void;
  onReturnToMenu: () => void;
  onSelectHotbarSlot: (slot: number) => void;
}

export function DesktopInventory({
  activeSlot,
  heldItem,
  hotbarItems,
  importProgress,
  importStatus,
  modelItems,
  onImportFolder,
  onImportModel,
  onPutBlockInActiveSlot,
  onPutModelInActiveSlot,
  onReturnToMenu,
  onSelectHotbarSlot,
}: DesktopInventoryProps) {
  return (
    <section className="side-panel inventory-panel mc-inventory" aria-label="背包">
      <header><Package size={18} aria-hidden="true" /> 创造模式物品栏</header>
      <div className="inventory-selected">
        {inventoryItemIcon(heldItem, 'large')}
        <strong>{inventoryItemLabel(heldItem)}</strong>
        <span>点击物品会放入当前热栏槽 {activeSlot + 1}</span>
      </div>
      <div className="inventory-grid">
        {blockItems.map((block, index) => (
          <button key={block} type="button" className={heldItem.type === 'block' && heldItem.block === block ? 'inventory-item active' : 'inventory-item'} title={blockLabels[block]} aria-label={`${blockLabels[block]}，放入热栏 ${activeSlot + 1}`} onClick={() => onPutBlockInActiveSlot(block)}>
            <span className={itemIconClass(block, 'large')} style={itemIconStyle(block)} />
            <small>{hotbarItems.some((item) => item.type === 'block' && item.block === block) ? '•' : index + 1}</small>
          </button>
        ))}
        {modelItems.map((model) => (
          <button key={model.id} type="button" className={heldItem.type === 'model' && heldItem.model.id === model.id ? 'inventory-item model active' : 'inventory-item model'} title={model.name} aria-label={`${model.name}，放入热栏 ${activeSlot + 1}`} onClick={() => onPutModelInActiveSlot(model)}>
            <span className="model-item-icon large"><UserRound size={20} aria-hidden="true" /></span>
            <small>M</small>
          </button>
        ))}
      </div>
      <div className="inventory-hotbar" aria-label="当前热栏">
        {hotbarItems.map((item, index) => (
          <button key={`${itemKey(item)}-inventory-${index}`} type="button" className={activeSlot === index ? 'inventory-hotbar-slot active' : 'inventory-hotbar-slot'} title={`${index + 1}: ${inventoryItemLabel(item)}`} onClick={() => onSelectHotbarSlot(index)}>
            {inventoryItemIcon(item)}
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <p>{importStatus}</p>
      {importProgress && (
        <div className="import-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(importProgress.progress * 100)}>
          <div className="import-progress-track"><span style={{ width: `${Math.round(importProgress.progress * 100)}%` }} /></div>
          <strong>{Math.round(importProgress.progress * 100)}%</strong>
          <span>{importProgress.fileName ? `${importProgress.label}：${importProgress.fileName}` : importProgress.label}</span>
        </div>
      )}
      <div className="inventory-actions">
        <button type="button" className="panel-command" onClick={onImportModel}>导入模型</button>
        <button type="button" className="panel-command" onClick={onImportFolder}>导入 MMD 文件夹</button>
        <button type="button" className="panel-command" onClick={onReturnToMenu}>返回菜单</button>
      </div>
    </section>
  );
}
