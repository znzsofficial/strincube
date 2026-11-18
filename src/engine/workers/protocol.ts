import type { WorldGenSettings } from '../types';
import type { TerrainVersion } from '../core/generator';
import type { PackedChunk } from '../core/chunkTransfer';

export type TerrainRequest =
  | { type: 'init'; seed: number; settings: WorldGenSettings; version: TerrainVersion }
  | { type: 'generate'; id: number; x: number; z: number };
export type TerrainReply =
  | { type: 'chunk'; id: number; chunk: PackedChunk; generationMs: number; packingMs: number }
  | { type: 'error'; id: number; message: string };
