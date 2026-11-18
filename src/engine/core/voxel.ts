import type { BlockType } from '../blocks';

export const CHUNK = 16;
export const BOTTOM = -32;
export const TOP = 96;
export const SEA = 1;
export type Position = { x: number; y: number; z: number };
export type Cell = { type: BlockType; level?: number; source?: boolean; static?: boolean; item?: BlockType };
export type Chunk = { x: number; z: number; cells: Map<number, Cell> };
export type ChunkEdit = { x: number; z: number; cells: [number, Cell | null][] };
export const chunkKey = (x: number, z: number) => `${x},${z}`;
export const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const chunkCoord = (v: number) => Math.floor(v / CHUNK);
export const local = (v: number) => ((v % CHUNK) + CHUNK) % CHUNK;
export const indexOf = (x: number, y: number, z: number) =>
  ((y - BOTTOM) * CHUNK + local(z)) * CHUNK + local(x);
export function positionOf(index: number, cx: number, cz: number): Position {
  return {
    x: cx * CHUNK + (index % CHUNK),
    y: BOTTOM + Math.floor(index / (CHUNK * CHUNK)),
    z: cz * CHUNK + (Math.floor(index / CHUNK) % CHUNK),
  };
}
const plants = new Set<BlockType>([
  'flower',
  'shortGrass',
  'fern',
  'deadBush',
  'dandelion',
  'poppy',
  'allium',
  'blueOrchid',
  'brownMushroom',
  'redMushroom',
  'basicString',
  'stringSeaBeacon',
  'topologicalRing',
  'crystalCore',
  'catTreat',
  'idealCoin',
  'purpleCatTreat',
  'dice',
]);
export const isPlant = (type: BlockType) => plants.has(type);
export const isSolid = (cell: Cell | null | undefined) =>
  !!cell && cell.type !== 'water' && cell.type !== 'riverPebbles' && !isPlant(cell.type);
export const isFalling = (cell: Cell | null | undefined) =>
  !!cell && ['sand', 'redSand', 'gravel'].includes(cell.type);
export const isLeaves = (type: BlockType) => type === 'leaves' || type.endsWith('Leaves');
export const transparent = (cell: Cell | null | undefined) =>
  !cell ||
  cell.type === 'water' ||
  cell.type === 'glass' ||
  cell.type === 'riverPebbles' ||
  cell.type === 'ice' ||
  isPlant(cell.type) ||
  isLeaves(cell.type);
export const neighbors = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;
