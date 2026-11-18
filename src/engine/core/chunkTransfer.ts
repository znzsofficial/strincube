import type { Cell, Chunk } from './voxel';

/** Transient wire format, not a save format. Transfers buffers rather than 10k objects. */
export type PackedChunk = {
  x: number;
  z: number;
  indices: Uint32Array;
  values: Uint16Array;
  palette: Cell[];
};
export function packChunk(chunk: Chunk): PackedChunk {
  const indices = new Uint32Array(chunk.cells.size),
    values = new Uint16Array(chunk.cells.size);
  const palette: Cell[] = [],
    lookup = new Map<string, number>();
  let offset = 0;
  for (const [index, cell] of chunk.cells) {
    const key = JSON.stringify(cell);
    let id = lookup.get(key);
    if (id === undefined) {
      id = palette.length;
      if (id > 65535) throw new Error('区块调色板过大');
      palette.push({ ...cell });
      lookup.set(key, id);
    }
    indices[offset] = index;
    values[offset++] = id;
  }
  return { x: chunk.x, z: chunk.z, indices, values, palette };
}
export function unpackChunk(packed: PackedChunk): Chunk {
  if (packed.indices.length !== packed.values.length) throw new Error('区块传输长度不匹配');
  const cells = new Map<number, Cell>();
  for (let i = 0; i < packed.indices.length; i++) {
    const cell = packed.palette[packed.values[i]];
    if (!cell) throw new Error('区块调色板索引无效');
    cells.set(packed.indices[i], { ...cell });
  }
  return { x: packed.x, z: packed.z, cells };
}
