import { World } from './world';
import type { Position } from './voxel';

export type VoxelHit = Position & { normal: Position; distance: number };
/** Voxel DDA: picking is independent of whether a dirty render mesh has rebuilt. */
export function raycast(world: World, origin: Position, direction: Position, reach = 7): VoxelHit | null {
  const cell = {
    x: Math.floor(origin.x + 0.5),
    y: Math.floor(origin.y + 0.5),
    z: Math.floor(origin.z + 0.5),
  };
  const step = { x: Math.sign(direction.x), y: Math.sign(direction.y), z: Math.sign(direction.z) };
  const next = { x: 0, y: 0, z: 0 },
    delta = { x: 0, y: 0, z: 0 };
  for (const axis of ['x', 'y', 'z'] as const) {
    delta[axis] = direction[axis] === 0 ? Infinity : Math.abs(1 / direction[axis]);
    next[axis] =
      direction[axis] === 0 ? Infinity : (cell[axis] + step[axis] * 0.5 - origin[axis]) / direction[axis];
  }
  let distance = 0;
  let normal: Position = { x: 0, y: 0, z: 0 };
  while (distance <= reach) {
    const c = world.get(cell.x, cell.y, cell.z);
    if (c && c.type !== 'water') return { ...cell, normal, distance };
    const axis = next.x < next.y ? (next.x < next.z ? 'x' : 'z') : next.y < next.z ? 'y' : 'z';
    distance = next[axis];
    next[axis] += delta[axis];
    cell[axis] += step[axis];
    normal = { x: 0, y: 0, z: 0 };
    normal[axis] = -step[axis];
  }
  return null;
}
