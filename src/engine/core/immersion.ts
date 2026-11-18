import { TOP, type Cell } from './voxel';

export function waterTop(level: number | undefined, covered: boolean) {
  return covered ? .5 : -.5 + .95 * (level ?? 7) / 7;
}

/** Depth below contiguous water in the resident column, saturated at limit. */
export function submergedDepth(world: { get(x:number,y:number,z:number):Cell|null }, x:number, y:number, z:number, limit = 8) {
  x = Math.round(x); z = Math.round(z);
  let row = Math.round(y), cell = world.get(x, row, z);
  if (cell?.type !== 'water') return 0;
  while (row < TOP) {
    const above = world.get(x, row + 1, z);
    if (above?.type !== 'water') break;
    if (row + .5 - y >= limit) return limit;
    row++; cell = above;
  }
  return Math.max(0, Math.min(limit, row + waterTop(cell.level, false) - y));
}
