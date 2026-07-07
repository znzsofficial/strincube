import { UserRound } from 'lucide-react';
import type React from 'react';
import type { BlockType } from '../game/blocks';
import { blockIconTints, blockIconUrls, blockLabels } from '../game/blocks';
import type { ImportedModelItem } from '../game/blockGame';

export type InventoryItem = { type: 'block'; block: BlockType } | { type: 'model'; model: ImportedModelItem };

export const blockItems = Object.keys(blockLabels) as BlockType[];
export const initialHotbarItems: InventoryItem[] = blockItems.slice(0, 9).map((block) => ({ type: 'block', block }));

export function itemKey(item: InventoryItem) {
  return item.type === 'block' ? `block:${item.block}` : `model:${item.model.id}`;
}

export function itemIconClass(block: BlockType, size = '') {
  return `item-icon${size ? ` ${size}` : ''}${block === 'shortGrass' ? ' plant-grass-icon' : ''}${block === 'tnt' ? ' tnt-icon' : ''}`;
}

export function itemIconStyle(block: BlockType) {
  const texture = blockIconUrls[block];
  const tint = blockIconTints[block];
  if (!texture && !tint) return undefined;
  const style: Record<string, string> = {};
  if (texture) style['--item-texture'] = `url(${texture})`;
  if (tint) { style['--item-tint'] = tint; style['--item-blend'] = 'multiply'; }
  return style as React.CSSProperties;
}

export function inventoryItemLabel(item: InventoryItem) {
  return item.type === 'model' ? item.model.name : blockLabels[item.block];
}

export function inventoryItemIcon(item: InventoryItem, size = '') {
  if (item.type === 'model') return <span className={`model-item-icon${size ? ` ${size}` : ''}`}><UserRound size={size === 'large' ? 20 : 16} aria-hidden="true" /></span>;
  return <span className={itemIconClass(item.block, size)} style={itemIconStyle(item.block)} />;
}
