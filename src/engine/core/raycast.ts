import { World } from './world';
import type { Position } from './voxel';
import { pebbleShapes } from './pebbles';

export type VoxelHit = Position & { normal: Position; distance: number; shape?: ReturnType<typeof pebbleShapes>[number] };

function pickPebbles(cell: Position, origin: Position, direction: Position, reach: number) {
  let nearest: VoxelHit | null = null;
  for (const shape of pebbleShapes(cell.x, cell.z)) {
    let enter = -Infinity, exit = nearest?.distance ?? reach;
    const normal = {x:0,y:0,z:0};
    for (const axis of ['x','y','z'] as const) {
      const half = (axis === 'x' ? shape.w : axis === 'y' ? shape.h : shape.d) / 2;
      const centre = cell[axis] + shape[axis] - origin[axis], dir = direction[axis];
      if (!dir) { if (Math.abs(centre) > half) { exit = -Infinity; break; } continue; }
      const a = (centre-half)/dir, b = (centre+half)/dir, near = Math.min(a,b);
      if (near > enter) {
        enter = near; normal.x = normal.y = normal.z = 0; normal[axis] = -Math.sign(dir);
      }
      exit = Math.min(exit, Math.max(a,b));
    }
    const t = Math.max(0, enter);
    if (t <= exit) nearest = {...cell, normal, distance:t, shape};
  }
  return nearest;
}
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
    if (c?.type === 'riverPebbles') {
      const hit = pickPebbles(cell, origin, direction, reach);
      if (hit) return hit;
    } else if (c && c.type !== 'water') return { ...cell, normal, distance };
    const axis = next.x < next.y ? (next.x < next.z ? 'x' : 'z') : next.y < next.z ? 'y' : 'z';
    distance = next[axis];
    next[axis] += delta[axis];
    cell[axis] += step[axis];
    normal = { x: 0, y: 0, z: 0 };
    normal[axis] = -step[axis];
  }
  return null;
}
