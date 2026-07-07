import type { WorldSaveData } from './game/blockGame';

const SAVE_KEY_PREFIX = 'strincube_save_';

export type SaveMeta = { id: string; name: string; savedAt: number };

export function getSaveMetaList(): SaveMeta[] {
  const list: SaveMeta[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key)!) as WorldSaveData;
        list.push({ id: key.replace(SAVE_KEY_PREFIX, ''), name: data.name, savedAt: data.savedAt });
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
