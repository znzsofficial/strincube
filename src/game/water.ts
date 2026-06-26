import * as THREE from 'three';
import { isPlantBlock, isReplaceableBlock } from './blocks';
import type { BlockType } from './blocks';
import type { GameSettings } from './types';

export type WaterCell = {
  position: THREE.Vector3;
  distance: number;
  level: number;
  source: boolean;
};

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

export function addWaterCell(ctx: WaterContext, x: number, y: number, z: number, distance = 0, level = 7, source = distance === 0 && level === 7) {
  const key = keyOf(x, y, z);
  if (ctx.blocks.has(key)) return;
  const existing = ctx.waterCells.get(key);
  if (existing && existing.level >= level && existing.distance <= distance && existing.source === source) return;
  ctx.waterCells.set(key, { position: new THREE.Vector3(x, y, z), distance, level, source: existing?.source || source });
  ctx.waterKeys.add(key);
  queueWaterUpdate(ctx, x, y, z);
  queueWaterNeighbors(ctx, x, y, z);
  markWaterChunkDirty(ctx, x, z);
}

export function removeWaterCell(ctx: WaterContext, x: number, y: number, z: number) {
  const key = keyOf(x, y, z);
  if (!ctx.waterCells.delete(key)) return;
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

export function flowWaterFrom(ctx: WaterContext, block: WaterCell) {
  const { x, y, z } = block.position;
  const distance = block.distance;
  let level = block.level;
  if (y <= ctx.worldBottom + 1) return;

  if (!block.source) {
    let suppliedLevel = 0;
    const aboveKey = keyOf(x, y + 1, z);
    const above = ctx.waterCells.get(aboveKey);
    if (above) suppliedLevel = 7;

    const xPlus = ctx.waterCells.get(keyOf(x + 1, y, z));
    const xMinus = ctx.waterCells.get(keyOf(x - 1, y, z));
    const zPlus = ctx.waterCells.get(keyOf(x, y, z + 1));
    const zMinus = ctx.waterCells.get(keyOf(x, y, z - 1));

    if (xPlus) suppliedLevel = Math.max(suppliedLevel, xPlus.source ? 6 : xPlus.level - 1);
    if (xMinus) suppliedLevel = Math.max(suppliedLevel, xMinus.source ? 6 : xMinus.level - 1);
    if (zPlus) suppliedLevel = Math.max(suppliedLevel, zPlus.source ? 6 : zPlus.level - 1);
    if (zMinus) suppliedLevel = Math.max(suppliedLevel, zMinus.source ? 6 : zMinus.level - 1);

    if (suppliedLevel <= 0) {
      removeWaterCell(ctx, x, y, z);
      return;
    }

    const nextLevel = Math.min(level, suppliedLevel);
    if (nextLevel < level) {
      block.level = nextLevel;
      level = nextLevel;
      markWaterChunkDirty(ctx, x, z);
      queueWaterNeighbors(ctx, x, y, z);
    }
  }

  const belowKey = keyOf(x, y - 1, z);
  const below = ctx.blocks.get(belowKey);
  const belowWater = ctx.waterCells.get(belowKey);
  if (!belowWater && (!below || isPlantBlock(below.type))) {
    if (below && isPlantBlock(below.type)) ctx.removeBlockAt(x, y - 1, z, false);
    addWaterCell(ctx, x, y - 1, z, 0, 7, false);
    return;
  }

  if (distance >= ctx.maxWaterSpreadDistance || level <= 1) return;

  const nextLevel = level - 1;
  const nxPlus = x + 1;
  const nxMinus = x - 1;
  const nzPlus = z + 1;
  const nzMinus = z - 1;

  const keyXP = keyOf(nxPlus, y, z);
  const keyXM = keyOf(nxMinus, y, z);
  const keyZP = keyOf(x, y, nzPlus);
  const keyZM = keyOf(x, y, nzMinus);

  const blockXP = ctx.blocks.get(keyXP);
  const blockXM = ctx.blocks.get(keyXM);
  const blockZP = ctx.blocks.get(keyZP);
  const blockZM = ctx.blocks.get(keyZM);

  const waterXP = ctx.waterCells.get(keyXP);
  const waterXM = ctx.waterCells.get(keyXM);
  const waterZP = ctx.waterCells.get(keyZP);
  const waterZM = ctx.waterCells.get(keyZM);

  const isVoidBelow = (tx: number, tz: number) => {
    for (let cy = y - 1; cy >= ctx.worldBottom; cy--) {
      if (ctx.blocks.has(keyOf(tx, cy, tz))) return false;
    }
    return true;
  };

  const anyNeighborVoid = !ctx.settings.infiniteWaterSpread && (
    (!blockXP && isVoidBelow(nxPlus, z)) ||
    (!blockXM && isVoidBelow(nxMinus, z)) ||
    (!blockZP && isVoidBelow(x, nzPlus)) ||
    (!blockZM && isVoidBelow(x, nzMinus))
  );

  if (!anyNeighborVoid) {
    if ((!blockXP || isPlantBlock(blockXP.type)) && (!waterXP || waterXP.level < nextLevel)) {
      if (blockXP && isReplaceableBlock(blockXP.type)) ctx.removeBlockAt(nxPlus, y, z, false);
      addWaterCell(ctx, nxPlus, y, z, distance + 1, nextLevel, false);
    }
    if ((!blockXM || isPlantBlock(blockXM.type)) && (!waterXM || waterXM.level < nextLevel)) {
      if (blockXM && isReplaceableBlock(blockXM.type)) ctx.removeBlockAt(nxMinus, y, z, false);
      addWaterCell(ctx, nxMinus, y, z, distance + 1, nextLevel, false);
    }
    if ((!blockZP || isPlantBlock(blockZP.type)) && (!waterZP || waterZP.level < nextLevel)) {
      if (blockZP && isReplaceableBlock(blockZP.type)) ctx.removeBlockAt(x, y, nzPlus, false);
      addWaterCell(ctx, x, y, nzPlus, distance + 1, nextLevel, false);
    }
    if ((!blockZM || isPlantBlock(blockZM.type)) && (!waterZM || waterZM.level < nextLevel)) {
      if (blockZM && isReplaceableBlock(blockZM.type)) ctx.removeBlockAt(x, y, nzMinus, false);
      addWaterCell(ctx, x, y, nzMinus, distance + 1, nextLevel, false);
    }
  }
}

export function updateWater(ctx: WaterContext, delta: number) {
  ctx.waterUpdateTimer += delta;
  if (ctx.waterUpdateTimer < 0.25) return;
  ctx.waterUpdateTimer = 0;

  const toProcess = [...ctx.queuedWaterUpdates];
  ctx.queuedWaterUpdates.clear();
  ctx.waterUpdates.length = 0;

  const requeue = new Set<string>();
  for (const key of toProcess) {
    const block = ctx.waterCells.get(key);
    if (block) flowWaterFrom(ctx, block);
  }

  for (const key of requeue) {
    if (!ctx.queuedWaterUpdates.has(key)) {
      ctx.queuedWaterUpdates.add(key);
      ctx.waterUpdates.push(key);
    }
  }
}
