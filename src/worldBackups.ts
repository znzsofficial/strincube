import { decodeSaveArchive, encodeSaveArchive } from './engine/saveArchive';
import { worldSaves } from './engine/persistence';

export async function exportWorldBackup(id: string) {
  const row = await worldSaves.get(id);
  if (!row) throw new Error('这个存档已不存在，请刷新列表。');
  const blob = await encodeSaveArchive(row.data);
  const name = row.data.name.replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').trim().slice(0, 80) || 'StrinCube';
  return { blob, filename: `${name}.strincube` };
}

export async function importWorldBackup(blob: Blob) {
  const data = await decodeSaveArchive(blob);
  const id = `next_${crypto.randomUUID()}`;
  // An archive has no authority over local save IDs. Even a UUID collision must
  // abort the entire transaction rather than replace an existing world or summary.
  await worldSaves.insert(id, data);
  return { id, name: data.name };
}
