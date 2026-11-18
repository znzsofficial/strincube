import type { BlockType } from '../blocks';
import { BOTTOM, TOP, CHUNK, chunkKey, indexOf, type Cell, type Chunk } from './voxel';

export const MESH_WIDTH = CHUNK + 2;
export const MESH_LAYER = MESH_WIDTH * MESH_WIDTH;
export type MeshMaterials = Partial<Record<BlockType, readonly number[]>>;
/** Serializable render metadata only. Colors are linear; UVs address a padded atlas tile. */
export type MeshBatchMaterial = {
  material: number;
  uv: readonly [number, number, number, number];
  color: readonly [number, number, number];
};
export type MeshBatchMaterials = Partial<Record<number, MeshBatchMaterial>>;
/** Dense one-cell halo, plus center iteration order. Zero denotes air. */
export type MeshSnapshot = {
  x: number;
  z: number;
  indices: Uint32Array;
  cells: Uint16Array;
  palette: Cell[];
  materials: MeshMaterials;
  batches?: MeshBatchMaterials;
};
type MeshWorld = { getChunk(x: number, z: number): Chunk | undefined; dirty: Set<string> };
const offsets = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Identity handles missing/replaced neighbors; dirty is retained until the result is checked. */
export class MeshSnapshotGuard {
  readonly key: string;
  readonly refs: (Chunk | undefined)[];
  invalidated = false;
  readonly chunk: Chunk;
  constructor(world: MeshWorld, chunk: Chunk) {
    this.chunk = chunk;
    this.key = chunkKey(chunk.x, chunk.z);
    this.refs = offsets.map(([dx, dz]) => world.getChunk(chunk.x + dx, chunk.z + dz));
  }
  touches(cx: number, cz: number) {
    return offsets.some(([dx, dz]) => this.chunk.x + dx === cx && this.chunk.z + dz === cz);
  }
  valid(world: MeshWorld) {
    return (
      !this.invalidated &&
      !world.dirty.has(this.key) &&
      this.refs[0] === this.chunk &&
      offsets.every(([dx, dz], i) => world.getChunk(this.chunk.x + dx, this.chunk.z + dz) === this.refs[i])
    );
  }
}

export function meshCellIndex(x: number, y: number, z: number) {
  return (y - BOTTOM) * MESH_LAYER + (z + 1) * MESH_WIDTH + x + 1;
}

export function captureMeshSnapshot(
  chunk: Chunk,
  refs: readonly (Chunk | undefined)[],
  materialFor: (type: BlockType) => readonly number[],
  batches?: MeshBatchMaterials,
): MeshSnapshot {
  const cells = new Uint16Array(MESH_LAYER * (TOP - BOTTOM + 1));
  const indices = new Uint32Array(chunk.cells.size);
  const palette: Cell[] = [];
  const lookup = new Map<string, number>();
  const materials: MeshMaterials = {};
  const put = (x: number, y: number, z: number, cell: Cell) => {
    // Source/static affect simulation only. Mesh palette preserves all geometry metadata.
    const key = `${cell.type}:${cell.level ?? 7}:${cell.item ?? ''}`;
    let id = lookup.get(key);
    if (id === undefined) {
      id = palette.length + 1;
      if (id > 65535) throw new Error('网格调色板过大');
      palette.push({ type: cell.type, level: cell.level, item: cell.item });
      lookup.set(key, id);
    }
    cells[meshCellIndex(x, y, z)] = id;
  };
  let offset = 0;
  for (const [index, cell] of chunk.cells) {
    indices[offset++] = index;
    const x = index % CHUNK,
      z = Math.floor(index / CHUNK) % CHUNK;
    put(x, BOTTOM + Math.floor(index / (CHUNK * CHUNK)), z, cell);
    materials[cell.type] ??= materialFor(cell.type);
  }
  // Read only the four boundary strips, never copy whole neighboring chunks.
  for (let side = 1; side < refs.length; side++) {
    const neighbor = refs[side];
    if (!neighbor) continue;
    for (let y = BOTTOM; y <= TOP; y++)
      for (let along = 0; along < CHUNK; along++) {
        const x = side === 1 ? -1 : side === 2 ? CHUNK : along;
        const z = side === 3 ? -1 : side === 4 ? CHUNK : along;
        const cell = neighbor.cells.get(indexOf(x, y, z));
        if (cell) put(x, y, z, cell);
      }
  }
  return { x: chunk.x, z: chunk.z, indices, cells, palette, materials, batches };
}

export function meshSnapshotTransfers(snapshot: MeshSnapshot): ArrayBuffer[] {
  return [snapshot.indices.buffer as ArrayBuffer, snapshot.cells.buffer as ArrayBuffer];
}
