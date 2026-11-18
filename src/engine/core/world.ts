import { TerrainGenerator } from './generator';
import {
  BOTTOM,
  TOP,
  chunkCoord,
  chunkKey,
  indexOf,
  neighbors,
  type Cell,
  type Chunk,
  type ChunkEdit,
  type Position,
} from './voxel';

export type Change = Position & { before: Cell | null; after: Cell | null };
/** Sole owner of world state. Meshes and simulations subscribe; they never own maps. */
export class World {
  readonly generator: TerrainGenerator;
  private chunks = new Map<string, Chunk>();
  private edits = new Map<string, Map<number, Cell | null>>();
  private listeners = new Set<(change: Change) => void>();
  private chunkListeners = new Set<(chunk: Chunk) => void>();
  private disposed = false;
  readonly dirty = new Set<string>();
  constructor(generator: TerrainGenerator, edits: ChunkEdit[] = []) {
    this.generator = generator;
    for (const e of edits)
      this.edits.set(chunkKey(e.x, e.z), new Map(e.cells.map(([i, c]) => [i, c ? { ...c } : null])));
  }
  subscribe(fn: (change: Change) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  onChunk(fn: (chunk: Chunk) => void) {
    this.chunkListeners.add(fn);
    return () => {
      this.chunkListeners.delete(fn);
    };
  }
  get loaded() {
    return this.chunks.values();
  }
  get loadedCount() {
    return this.chunks.size;
  }
  get blockCount() {
    let n = 0;
    for (const c of this.chunks.values()) n += c.cells.size;
    return n;
  }
  isLoaded(x: number, z: number) {
    return this.chunks.has(chunkKey(chunkCoord(x), chunkCoord(z)));
  }
  getChunk(x: number, z: number) {
    return this.chunks.get(chunkKey(x, z));
  }
  get(x: number, y: number, z: number): Cell | null {
    return this.chunks.get(chunkKey(chunkCoord(x), chunkCoord(z)))?.cells.get(indexOf(x, y, z)) ?? null;
  }
  ensure(cx: number, cz: number): Chunk {
    if (this.disposed) throw new Error('世界已关闭');
    const key = chunkKey(cx, cz),
      existing = this.chunks.get(key);
    if (existing) return existing;
    return this.install(this.generator.generate(cx, cz));
  }
  /** Accept generated terrain only here, then replay the latest journal. */
  install(chunk: Chunk): Chunk {
    if (this.disposed) throw new Error('世界已关闭');
    const cx = chunk.x,
      cz = chunk.z,
      key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    for (const [i, c] of this.edits.get(key) ?? []) {
      if (c) chunk.cells.set(i, { ...c });
      else chunk.cells.delete(i);
    }
    this.chunks.set(key, chunk);
    this.invalidate(cx, cz);
    for (const fn of this.chunkListeners) fn(chunk);
    return chunk;
  }
  set(x: number, y: number, z: number, cell: Cell | null): boolean {
    if (
      ![x, y, z].every(Number.isInteger) ||
      y < BOTTOM ||
      y > TOP ||
      !this.generator.inside(x, z) ||
      !this.isLoaded(x, z)
    )
      return false;
    const cx = chunkCoord(x),
      cz = chunkCoord(z),
      key = chunkKey(cx, cz),
      i = indexOf(x, y, z);
    const chunk = this.chunks.get(key)!;
    const before = chunk.cells.get(i) ?? null;
    if (JSON.stringify(before) === JSON.stringify(cell)) return false;
    const after = cell ? { ...cell } : null;
    if (after) chunk.cells.set(i, after);
    else chunk.cells.delete(i);
    let edits = this.edits.get(key);
    if (!edits) {
      edits = new Map();
      this.edits.set(key, edits);
    }
    edits.set(i, after);
    this.dirty.add(key);
    for (const [dx, , dz] of neighbors) this.dirty.add(chunkKey(chunkCoord(x + dx), chunkCoord(z + dz)));
    for (const fn of this.listeners) fn({ x, y, z, before, after });
    return true;
  }
  unload(cx: number, cz: number) {
    this.chunks.delete(chunkKey(cx, cz));
    this.invalidate(cx, cz);
    // Edits intentionally survive eviction, including player-modified chunks.
  }
  private invalidate(cx: number, cz: number) {
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      this.dirty.add(chunkKey(cx + dx, cz + dz));
  }
  snapshot(): ChunkEdit[] {
    return [...this.edits].map(([key, cells]) => {
      const [x, z] = key.split(',').map(Number);
      return { x, z, cells: [...cells].map(([i, c]) => [i, c ? { ...c } : null]) };
    });
  }
  dispose() {
    this.disposed = true;
    this.chunks.clear();
    this.edits.clear();
    this.dirty.clear();
    this.listeners.clear();
    this.chunkListeners.clear();
  }
}
