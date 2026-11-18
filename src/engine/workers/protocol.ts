import type { WorldGenSettings } from '../types';
import type { PackedChunk } from '../core/chunkTransfer';

export type TerrainRequest =
  | { type: 'init'; seed: number; settings: WorldGenSettings }
  | { type: 'generate'; id: number; x: number; z: number };
export type TerrainReply =
  | { type: 'chunk'; id: number; chunk: PackedChunk; generationMs: number; packingMs: number }
  | { type: 'error'; id: number; message: string };
