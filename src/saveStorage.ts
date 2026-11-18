import type { WorldSaveData } from './engine/types';
import { getWorldRadius } from './engine/types';
import { worldSaves } from './engine/persistence';
import { validateSaveSummary, validateWorldSave } from './engine/saveValidation';

export type SaveMeta = { id: string; name: string; savedAt: number; seed: number; worldModeLabel: string; worldSeedLabel: string };

function describeWorldMode(data: Pick<WorldSaveData, 'worldGen'>) {
  const settings = data.worldGen;
  if (settings.flatWorld) return '超平坦测试';
  if (settings.infiniteWorld) return '无限世界';
  return `有限世界 · 半径 ${getWorldRadius(settings)} 格`;
}

export async function getSaveMetaList(): Promise<SaveMeta[]> {
  const result: SaveMeta[] = [];
  for (const data of await worldSaves.list()) {
    try { validateSaveSummary(data); } catch { continue; } // A corrupt row must not hide other saves.
    result.push({ id: data.id, name: data.name, savedAt: data.savedAt, seed: data.seed,
      worldModeLabel: describeWorldMode(data), worldSeedLabel: `种子 ${data.seed}` });
  }
  return result.sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadSaveData(id: string): Promise<WorldSaveData | null> {
  const row = await worldSaves.get(id);
  if (row === undefined) return null;
  const data = row?.data;
  validateWorldSave(data);
  return data;
}

export async function storeSaveData(id: string, data: WorldSaveData) {
  await worldSaves.put(id, data);
}

export async function deleteSaveData(id: string) {
  await worldSaves.delete(id);
}
