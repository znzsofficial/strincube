import * as pako from 'pako';
import type { BlockType } from './blocks';
import type { ChunkSaveData, WorldSaveData } from './types';

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

export function serializeChunkData(chunk: ChunkSaveData): ChunkSaveData {
  return {
    version: 1,
    chunkX: chunk.chunkX,
    chunkZ: chunk.chunkZ,
    generatedStage: chunk.generatedStage,
    blockEdits: chunk.blockEdits.map((entry) => ({ ...entry })),
    waterEdits: chunk.waterEdits.map((entry) => ({ ...entry })),
    structureRefs: [...chunk.structureRefs],
    modified: chunk.modified,
  };
}

export function deserializeChunkData(chunk: ChunkSaveData): ChunkSaveData {
  return serializeChunkData(chunk);
}

export function applyChunkData(
  chunk: ChunkSaveData,
  applyBlock: (x: number, y: number, z: number, type: BlockType | null) => void,
  applyWater: (x: number, y: number, z: number, cell: { distance: number; level: number; source: boolean; falling: boolean; static: boolean } | null) => void,
) {
  const normalized = deserializeChunkData(chunk);
  for (const blockEdit of normalized.blockEdits) {
    applyBlock(blockEdit.x, blockEdit.y, blockEdit.z, blockEdit.type);
  }
  for (const waterEdit of normalized.waterEdits) {
    applyWater(waterEdit.x, waterEdit.y, waterEdit.z, waterEdit.removed ? null : {
      distance: waterEdit.distance ?? 0,
      level: waterEdit.level ?? 7,
      source: waterEdit.source ?? false,
      falling: waterEdit.falling ?? false,
      static: waterEdit.static ?? false,
    });
  }
}
