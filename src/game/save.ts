import * as pako from 'pako';
import type { BlockType } from './blocks';
import type { WorldSaveData } from './types';

export function serializeBlocks(blocks: Map<string, { type: BlockType }>): { blocksBin: string; blockDict: string[] } {
  const typeSet = new Set<BlockType>();
  for (const data of blocks.values()) typeSet.add(data.type);
  const dict = [...typeSet].sort();
  const typeIndex = new Map<BlockType, number>(dict.map((t, i) => [t, i]));

  const raw = new Uint16Array(blocks.size * 4);
  let off = 0;
  for (const [key, data] of blocks) {
    const [xs, ys, zs] = key.split(',');
    raw[off++] = +xs + 32768;
    raw[off++] = +ys + 32768;
    raw[off++] = +zs + 32768;
    raw[off++] = typeIndex.get(data.type)!;
  }
  const compressed = pako.deflate(new Uint8Array(raw.buffer));
  let bin = '';
  for (let i = 0; i < compressed.length; i++) bin += String.fromCharCode(compressed[i]);
  return { blocksBin: btoa(bin), blockDict: dict };
}

export function deserializeBlocks(
  data: WorldSaveData,
  blocks: Map<string, { position: { x: number; y: number; z: number }; type: BlockType }>,
  addSolidColumnY: (x: number, y: number, z: number) => void,
  keyOf: (x: number, y: number, z: number) => string,
  Vector3: new (x: number, y: number, z: number) => { x: number; y: number; z: number },
) {
  if (data.version !== 2 || !data.blocksBin || !data.blockDict) return;
  const bin = atob(data.blocksBin);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const raw = new Uint16Array(pako.inflate(bytes).buffer);
  for (let i = 0; i < raw.length; i += 4) {
    const x = raw[i] - 32768;
    const y = raw[i + 1] - 32768;
    const z = raw[i + 2] - 32768;
    const type = data.blockDict[raw[i + 3]] as BlockType;
    const key = keyOf(x, y, z);
    blocks.set(key, { position: new Vector3(x, y, z), type });
    addSolidColumnY(x, y, z);
  }
}
