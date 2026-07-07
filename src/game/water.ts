import * as THREE from 'three';
import { isPlantBlock, isReplaceableBlock } from './blocks';
import type { BlockType } from './blocks';
import type { GameSettings } from './types';

export type WaterCell = {
  position: THREE.Vector3;
  distance: number;
  level: number;
  source: boolean;
  falling: boolean;
  static: boolean;
};

type WaterState = Omit<WaterCell, 'position'>;

export type WaterChunkMesh = {
  mesh: THREE.Mesh;
};

export type BlockData = {
  position: THREE.Vector3;
  type: BlockType;
  waterDistance?: number;
};

export type ChunkMesh = {
  meshes: THREE.Mesh[];
  faceBlockKeysByMesh: Map<THREE.Mesh, string[]>;
};

export interface WaterContext {
  blocks: Map<string, BlockData>;
  waterCells: Map<string, WaterCell>;
  waterKeys: Set<string>;
  waterUpdates: string[];
  queuedWaterUpdates: Set<string>;
  columnSolidY: Map<string, Set<number>>;
  waterChunkMeshes: Map<string, WaterChunkMesh>;
  dirtyWaterChunks: Set<string>;
  chunkMeshes: Map<string, ChunkMesh>;
  scene: THREE.Scene;
  waterMaterial: THREE.Material;
  visibleChunkRaycastMeshes: THREE.Mesh[];
  settings: GameSettings;
  chunkSize: number;
  maxWaterSpreadDistance: number;
  waterLevel: number;
  worldBottom: number;
  waterUpdateTimer: number;
  removeBlockAt: (x: number, y: number, z: number, rebuild?: boolean) => void;
  onWaterCellSet?: (x: number, y: number, z: number, cell: { distance: number; level: number; source: boolean; falling: boolean; static: boolean }) => void;
  onWaterCellRemove?: (x: number, y: number, z: number) => void;
}

export function createWaterContext(
  scene: THREE.Scene,
  waterMaterial: THREE.Material,
  settings: GameSettings,
  chunkSize: number,
  maxWaterSpreadDistance: number,
  waterLevel: number,
  worldBottom: number,
  removeBlockAt: (x: number, y: number, z: number, rebuild?: boolean) => void,
): WaterContext {
  return {
    blocks: new Map(),
    waterCells: new Map(),
    waterKeys: new Set(),
    waterUpdates: [],
    queuedWaterUpdates: new Set(),
    columnSolidY: new Map(),
    waterChunkMeshes: new Map(),
    dirtyWaterChunks: new Set(),
    chunkMeshes: new Map(),
    scene,
    waterMaterial,
    visibleChunkRaycastMeshes: [],
    settings,
    chunkSize,
    maxWaterSpreadDistance,
    waterLevel,
    worldBottom,
    waterUpdateTimer: 0,
    removeBlockAt,
  };
}

const faceDefs = [
  { normal: new THREE.Vector3(1, 0, 0), corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] as [number, number, number][] },
  { normal: new THREE.Vector3(-1, 0, 0), corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] as [number, number, number][] },
  { normal: new THREE.Vector3(0, 1, 0), corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] as [number, number, number][] },
  { normal: new THREE.Vector3(0, -1, 0), corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] as [number, number, number][] },
  { normal: new THREE.Vector3(0, 0, 1), corners: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] as [number, number, number][] },
  { normal: new THREE.Vector3(0, 0, -1), corners: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] as [number, number, number][] },
];

function keyOf(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function chunkKeyOf(chunkSize: number, x: number, z: number) {
  return `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`;
}

export function columnKeyOf(x: number, z: number) {
  return `${x},${z}`;
}

export function addSolidColumnY(ctx: WaterContext, x: number, y: number, z: number) {
  const columnKey = columnKeyOf(x, z);
  let solidY = ctx.columnSolidY.get(columnKey);
  if (!solidY) {
    solidY = new Set<number>();
    ctx.columnSolidY.set(columnKey, solidY);
  }
  solidY.add(y);
}

export function removeSolidColumnY(ctx: WaterContext, x: number, y: number, z: number) {
  const columnKey = columnKeyOf(x, z);
  const solidY = ctx.columnSolidY.get(columnKey);
  if (!solidY) return;
  solidY.delete(y);
  if (solidY.size === 0) ctx.columnSolidY.delete(columnKey);
}

export function queueWaterUpdate(ctx: WaterContext, x: number, y: number, z: number) {
  const key = keyOf(x, y, z);
  if (ctx.queuedWaterUpdates.has(key)) return;
  ctx.queuedWaterUpdates.add(key);
  ctx.waterUpdates.push(key);
}

export function queueWaterNeighbors(ctx: WaterContext, x: number, y: number, z: number) {
  queueWaterUpdate(ctx, x, y, z);
  queueWaterUpdate(ctx, x + 1, y, z);
  queueWaterUpdate(ctx, x - 1, y, z);
  queueWaterUpdate(ctx, x, y, z + 1);
  queueWaterUpdate(ctx, x, y, z - 1);
  queueWaterUpdate(ctx, x, y + 1, z);
  queueWaterUpdate(ctx, x, y - 1, z);
}

export function markWaterChunkDirty(ctx: WaterContext, x: number, z: number) {
  const ck = chunkKeyOf.bind(null, ctx.chunkSize);
  ctx.dirtyWaterChunks.add(ck(x, z));
  ctx.dirtyWaterChunks.add(ck(x - 1, z));
  ctx.dirtyWaterChunks.add(ck(x + 1, z));
  ctx.dirtyWaterChunks.add(ck(x, z - 1));
  ctx.dirtyWaterChunks.add(ck(x, z + 1));
}

export function removeWaterChunkMesh(ctx: WaterContext, chunkKey: string) {
  const chunk = ctx.waterChunkMeshes.get(chunkKey);
  if (!chunk) return;
  ctx.scene.remove(chunk.mesh);
  chunk.mesh.geometry.dispose();
  ctx.waterChunkMeshes.delete(chunkKey);
}

function waterStateChanged(cell: WaterCell, state: WaterState) {
  return cell.distance !== state.distance
    || cell.level !== state.level
    || cell.source !== state.source
    || cell.falling !== state.falling
    || cell.static !== state.static;
}

function setWaterCellState(ctx: WaterContext, x: number, y: number, z: number, state: WaterState) {
  const key = keyOf(x, y, z);
  ctx.waterCells.set(key, { position: new THREE.Vector3(x, y, z), ...state });
  ctx.onWaterCellSet?.(x, y, z, state);
  ctx.waterKeys.add(key);
  markWaterChunkDirty(ctx, x, z);
}

function canWaterOccupy(ctx: WaterContext, x: number, y: number, z: number) {
  if (y <= ctx.worldBottom + 1) return false;
  const block = ctx.blocks.get(keyOf(x, y, z));
  return !block || isPlantBlock(block.type) || isReplaceableBlock(block.type);
}

function clearReplaceableForWater(ctx: WaterContext, x: number, y: number, z: number) {
  const block = ctx.blocks.get(keyOf(x, y, z));
  if (block && isReplaceableBlock(block.type)) ctx.removeBlockAt(x, y, z, false);
}

function horizontalSupplyFrom(ctx: WaterContext, cell: WaterCell, x: number, y: number, z: number): WaterState | null {
  if (cell.static) return null;
  if (cell.source) return { distance: 1, level: 6, source: false, falling: false, static: false };
  if (cell.falling) {
    const below = ctx.blocks.get(keyOf(x, y - 1, z));
    const belowWater = ctx.waterCells.get(keyOf(x, y - 1, z));
    if (below || belowWater) return { distance: ctx.maxWaterSpreadDistance, level: 1, source: false, falling: false, static: false };
    return null;
  }
  if (cell.level <= 1 || cell.distance >= ctx.maxWaterSpreadDistance) return null;
  return { distance: cell.distance + 1, level: cell.level - 1, source: false, falling: false, static: false };
}

function bestHorizontalSupply(ctx: WaterContext, x: number, y: number, z: number): WaterState | null {
  let best: WaterState | null = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const cell = ctx.waterCells.get(keyOf(x + dx, y, z + dz));
    if (!cell) continue;
    const supply = horizontalSupplyFrom(ctx, cell, x + dx, y, z + dz);
    if (!supply) continue;
    if (!best || supply.level > best.level || (supply.level === best.level && supply.distance < best.distance)) best = supply;
  }
  return best;
}

function computeWaterStateAt(ctx: WaterContext, x: number, y: number, z: number): WaterState | null {
  const current = ctx.waterCells.get(keyOf(x, y, z));
  if (current?.source || current?.static) return current;
  if (!canWaterOccupy(ctx, x, y, z)) return null;

  const above = ctx.waterCells.get(keyOf(x, y + 1, z));
  if (above && !above.static) {
    return {
      distance: above.distance,
      level: 7,
      source: false,
      falling: true,
      static: false,
    };
  }

  return bestHorizontalSupply(ctx, x, y, z);
}

export function recomputeWaterAt(ctx: WaterContext, x: number, y: number, z: number) {
  const current = ctx.waterCells.get(keyOf(x, y, z));
  const next = computeWaterStateAt(ctx, x, y, z);
  if (!next) {
    if (current) removeWaterCell(ctx, x, y, z);
    return;
  }
  if (current && !waterStateChanged(current, next)) return;
  clearReplaceableForWater(ctx, x, y, z);
  setWaterCellState(ctx, x, y, z, next);
  queueWaterNeighbors(ctx, x, y, z);
}

export function addWaterCell(ctx: WaterContext, x: number, y: number, z: number, distance = 0, level = 7, source = distance === 0 && level === 7, falling = false, staticWater = false) {
  const key = keyOf(x, y, z);
  if (ctx.blocks.has(key)) return;
  const existing = ctx.waterCells.get(key);
  const nextSource = existing?.source || source;
  const nextFalling = falling && !nextSource;
  const nextStatic = staticWater && nextSource && !nextFalling;
  const nextState = { distance, level, source: nextSource, falling: nextFalling, static: nextStatic };
  if (existing && !waterStateChanged(existing, nextState)) return;
  setWaterCellState(ctx, x, y, z, nextState);
  if (!nextStatic) {
    queueWaterUpdate(ctx, x, y, z);
    queueWaterNeighbors(ctx, x, y, z);
  }
  markWaterChunkDirty(ctx, x, z);
}

export function wakeStaticWaterAround(ctx: WaterContext, x: number, y: number, z: number) {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1) continue;
        const wx = x + dx;
        const wy = y + dy;
        const wz = z + dz;
        const cell = ctx.waterCells.get(keyOf(wx, wy, wz));
        if (!cell?.static) continue;
        cell.static = false;
        ctx.onWaterCellSet?.(wx, wy, wz, { distance: cell.distance, level: cell.level, source: cell.source, falling: cell.falling, static: false });
        queueWaterUpdate(ctx, wx, wy, wz);
        queueWaterNeighbors(ctx, wx, wy, wz);
      }
    }
  }
}

export function removeWaterCell(ctx: WaterContext, x: number, y: number, z: number) {
  const key = keyOf(x, y, z);
  if (!ctx.waterCells.delete(key)) return;
  ctx.onWaterCellRemove?.(x, y, z);
  ctx.waterKeys.delete(key);
  ctx.queuedWaterUpdates.delete(key);
  markWaterChunkDirty(ctx, x, z);
  queueWaterNeighbors(ctx, x, y, z);
}

export function rebuildWaterChunk(ctx: WaterContext, chunkKey: string) {
  removeWaterChunkMesh(ctx, chunkKey);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexCount = 0;

  const chunkCells: WaterCell[] = [];
  const ck = chunkKeyOf.bind(null, ctx.chunkSize);
  for (const cell of ctx.waterCells.values()) {
    if (ck(cell.position.x, cell.position.z) === chunkKey) {
      chunkCells.push(cell);
    }
  }
  if (chunkCells.length === 0) return;

  function getWaterTopY(x: number, y: number, z: number): number | null {
    const cell = ctx.waterCells.get(keyOf(x, y, z));
    if (cell) return cell.position.y + THREE.MathUtils.lerp(-0.44, 0.48, cell.level / 7);
    const below = ctx.waterCells.get(keyOf(x, y - 1, z));
    if (below) return below.position.y + THREE.MathUtils.lerp(-0.44, 0.48, below.level / 7);
    const above = ctx.waterCells.get(keyOf(x, y + 1, z));
    if (above) return above.position.y + THREE.MathUtils.lerp(-0.44, 0.48, above.level / 7);
    return null;
  }

  function blendedTopY(cell: WaterCell, cornerX: number, cornerZ: number) {
    const cx = cell.position.x;
    const cy = cell.position.y;
    const cz = cell.position.z;
    const sx = cornerX > 0 ? 1 : -1;
    const sz = cornerZ > 0 ? 1 : -1;

    const selfY = cell.position.y + THREE.MathUtils.lerp(-0.44, 0.48, cell.level / 7);

    const neighborX = getWaterTopY(cx + sx, cy, cz);
    const neighborZ = getWaterTopY(cx, cy, cz + sz);
    const neighborXZ = getWaterTopY(cx + sx, cy, cz + sz);

    let sum = selfY;
    let count = 1;
    if (neighborX !== null) { sum += neighborX; count++; }
    if (neighborZ !== null) { sum += neighborZ; count++; }
    if (neighborXZ !== null) { sum += neighborXZ; count++; }

    return sum / count;
  }

  function waterTopY(cell: WaterCell) {
    return cell.position.y + THREE.MathUtils.lerp(-0.44, 0.48, cell.level / 7);
  }

  function shouldRenderFace(nx: number, ny: number, nz: number): boolean {
    if (ctx.waterCells.has(keyOf(nx, ny, nz))) return false;
    const solid = ctx.blocks.get(keyOf(nx, ny, nz));
    if (solid && !isPlantBlock(solid.type)) return false;
    return true;
  }

  for (const cell of chunkCells) {
    const cx = cell.position.x;
    const cy = cell.position.y;
    const cz = cell.position.z;

    const selfTopY = waterTopY(cell);

    for (const face of faceDefs) {
      const nx = cx + face.normal.x;
      const ny = cy + face.normal.y;
      const nz = cz + face.normal.z;

      if (!shouldRenderFace(nx, ny, nz)) continue;

      const isTopFace = face.normal.y > 0;
      const isBottomFace = face.normal.y < 0;

      for (const corner of face.corners) {
        let y: number;
        if (isTopFace) {
          y = blendedTopY(cell, corner[0], corner[2]);
        } else if (isBottomFace) {
          y = cy + corner[1];
        } else {
          y = corner[1] > 0 ? selfTopY : cy + corner[1];
        }
        positions.push(cx + corner[0], y, cz + corner[2]);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
      }
      uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
      indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
      vertexCount += 4;
    }

    const sides = [
      { dx: 1, dz: 0, corners: [[0.5, -0.5], [0.5, 0.5]] },
      { dx: -1, dz: 0, corners: [[-0.5, -0.5], [-0.5, 0.5]] },
      { dx: 0, dz: 1, corners: [[-0.5, 0.5], [0.5, 0.5]] },
      { dx: 0, dz: -1, corners: [[-0.5, -0.5], [0.5, -0.5]] },
    ];

    for (const side of sides) {
      const neighborCell = ctx.waterCells.get(keyOf(cx + side.dx, cy, cz + side.dz));
      if (!neighborCell) continue;
      const neighborTop = waterTopY(neighborCell);
      if (Math.abs(neighborTop - selfTopY) < 0.01) continue;

      const higherTop = Math.max(selfTopY, neighborTop);
      const lowerTop = Math.min(selfTopY, neighborTop);

      const isCurrentHigher = selfTopY >= neighborTop;
      const normalX = isCurrentHigher ? side.dx : -side.dx;
      const normalZ = isCurrentHigher ? side.dz : -side.dz;

      const c0 = side.corners[0];
      const c1 = side.corners[1];

      positions.push(cx + c0[0], lowerTop, cz + c0[1]);
      positions.push(cx + c0[0], higherTop, cz + c0[1]);
      positions.push(cx + c1[0], higherTop, cz + c1[1]);
      positions.push(cx + c1[0], lowerTop, cz + c1[1]);

      normals.push(normalX, 0, normalZ);
      normals.push(normalX, 0, normalZ);
      normals.push(normalX, 0, normalZ);
      normals.push(normalX, 0, normalZ);

      uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
      indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
      vertexCount += 4;
    }
  }

  if (positions.length === 0) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, ctx.waterMaterial);
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  ctx.waterChunkMeshes.set(chunkKey, { mesh });
}

export function rebuildDirtyWaterChunks(ctx: WaterContext, limit = 16) {
  let count = 0;
  for (const chunkKey of ctx.dirtyWaterChunks) {
    ctx.dirtyWaterChunks.delete(chunkKey);
    rebuildWaterChunk(ctx, chunkKey);
    count += 1;
    if (count >= limit) break;
  }
}

export function updateWater(ctx: WaterContext, delta: number) {
  ctx.waterUpdateTimer += delta;
  if (ctx.waterUpdateTimer < 0.25) return;
  ctx.waterUpdateTimer = 0;

  const toProcess = [...ctx.queuedWaterUpdates];
  ctx.queuedWaterUpdates.clear();
  ctx.waterUpdates.length = 0;

  for (const key of toProcess) {
    const [x, y, z] = key.split(',').map(Number);
    recomputeWaterAt(ctx, x, y, z);
  }
}
