import { BOTTOM, TOP, CHUNK, indexOf, type Chunk } from './voxel';
import type { World } from './world';

/** Short-lived mesh read view. Cache chunk lookup, never cell data or edits. */
export function chunkRead(world: World, chunk: Chunk) {
  const adjacent = [
    world.getChunk(chunk.x - 1, chunk.z),
    world.getChunk(chunk.x + 1, chunk.z),
    world.getChunk(chunk.x, chunk.z - 1),
    world.getChunk(chunk.x, chunk.z + 1),
  ];
  const minX = chunk.x * CHUNK,
    minZ = chunk.z * CHUNK;
  return (x: number, y: number, z: number) => {
    if (y < BOTTOM || y > TOP) return null;
    let target: Chunk | undefined = chunk;
    if (x < minX) target = adjacent[0];
    else if (x >= minX + CHUNK) target = adjacent[1];
    else if (z < minZ) target = adjacent[2];
    else if (z >= minZ + CHUNK) target = adjacent[3];
    return target?.cells.get(indexOf(x, y, z)) ?? null;
  };
}
