import type { WorldSaveData } from './game/blockGame';
import { getWorldRadius } from './game/types';

const SAVE_KEY_PREFIX = 'strincube_save_';

export type SaveMeta = { id: string; name: string; savedAt: number; worldModeLabel: string; worldSeedLabel: string };

function describeWorldMode(data: WorldSaveData) {
  const settings = data.worldGen;
  if (!settings) return '旧版世界';
  if (settings.flatWorld) return '超平坦测试';
  if (settings.infiniteWorld ?? true) return '无限世界';
  return `有限世界 · 半径 ${getWorldRadius(settings)} 格`;
}

export function getSaveMetaList(): SaveMeta[] {
  const list: SaveMeta[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key)!) as WorldSaveData;
        list.push({
          id: key.replace(SAVE_KEY_PREFIX, ''),
          name: data.name,
          savedAt: data.savedAt,
          worldModeLabel: describeWorldMode(data),
          worldSeedLabel: `种子 ${data.seed}`,
        });
      } catch { /* ignore corrupt saves */ }
    }
  }
  return list.sort((a, b) => b.savedAt - a.savedAt);
}

export function loadSaveData(id: string): WorldSaveData | null {
  try {
    const raw = localStorage.getItem(`${SAVE_KEY_PREFIX}${id}`);
    return raw ? JSON.parse(raw) as WorldSaveData : null;
  } catch { return null; }
}

export function storeSaveData(id: string, data: WorldSaveData) {
  localStorage.setItem(`${SAVE_KEY_PREFIX}${id}`, JSON.stringify(data));
}

export function deleteSaveData(id: string) {
  localStorage.removeItem(`${SAVE_KEY_PREFIX}${id}`);
}
