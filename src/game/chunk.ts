// Keep the current runtime chunk sizing unchanged during the refactor skeleton.
export const CHUNK_SIZE = 8;

export type ChunkPos = {
  chunkX: number;
  chunkZ: number;
};

export function toChunkCoord(x: number, z: number): ChunkPos {
  return {
    chunkX: Math.floor(x / CHUNK_SIZE),
    chunkZ: Math.floor(z / CHUNK_SIZE),
  };
}

export function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

export function chunkKeyFromWorld(x: number, z: number): string {
  const { chunkX, chunkZ } = toChunkCoord(x, z);
  return chunkKey(chunkX, chunkZ);
}

export function worldToLocal(x: number, z: number): { lx: number; lz: number } {
  const { chunkX, chunkZ } = toChunkCoord(x, z);
  return {
    lx: x - chunkX * CHUNK_SIZE,
    lz: z - chunkZ * CHUNK_SIZE,
  };
}

export function chunkWorldMin(chunkX: number, chunkZ: number): { minX: number; minZ: number } {
  return {
    minX: chunkX * CHUNK_SIZE,
    minZ: chunkZ * CHUNK_SIZE,
  };
}

export function forEachChunkCell(
  chunkX: number,
  chunkZ: number,
  callback: (x: number, z: number) => void,
) {
  const { minX, minZ } = chunkWorldMin(chunkX, chunkZ);
  for (let x = minX; x < minX + CHUNK_SIZE; x += 1) {
    for (let z = minZ; z < minZ + CHUNK_SIZE; z += 1) {
      callback(x, z);
    }
  }
}
