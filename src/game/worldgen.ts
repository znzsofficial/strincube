import * as THREE from 'three';
import type { WorldGenSettings } from './types';
import type { BlockType } from './blocks';
import { pickPlant } from './blocks';

export type Creature = { root: THREE.Group; phase: number; home: THREE.Vector3 };

export interface WorldGenContext {
  blocks: Map<string, { position: THREE.Vector3; type: BlockType }>;
  worldSeed: number;
  worldRadius: number;
  waterLevel: number;
  worldBottom: number;
  scene: THREE.Scene;
  creatures: Creature[];
  addBlock: (x: number, y: number, z: number, type: BlockType, waterDistance?: number) => void;
  settleInitialFallingBlocks: () => void;
  queueInitialWater: () => void;
  rebuildAllChunks: () => void;
  rebuildDirtyWaterChunks: (limit?: number) => void;
  dirtyWaterChunks: Set<string>;
  updateChunkVisibility: (force?: boolean) => void;
  lightConfig: (type: BlockType) => { color: number; intensity: number; distance: number } | null;
  blockLights: Map<string, THREE.PointLight>;
  onProgress?: (label: string, progress: number) => void;
}

export type Biome = 'plains' | 'forest' | 'jungle' | 'desert' | 'snow' | 'taiga' | 'savanna';

export const biomeConfig: Record<Biome, {
  grassColor: number;
  treeDensity: number;
  treeTypes: ('oak' | 'jungle' | 'cherry' | 'spruce')[];
  surfaceBlock: BlockType;
  plantDensity: number;
  baseHeight: number;
  heightAmp: number;
}> = {
  plains: {
    grassColor: 0x73b84a,
    treeDensity: 0.994,
    treeTypes: ['oak'],
    surfaceBlock: 'grass',
    plantDensity: 0.82,
    baseHeight: 1.5,
    heightAmp: 3,
  },
  forest: {
    grassColor: 0x5a8f29,
    treeDensity: 0.985,
    treeTypes: ['oak', 'spruce', 'cherry'],
    surfaceBlock: 'grass',
    plantDensity: 0.70,
    baseHeight: 2,
    heightAmp: 4,
  },
  jungle: {
    grassColor: 0x3a7a1a,
    treeDensity: 0.975,
    treeTypes: ['jungle'],
    surfaceBlock: 'grass',
    plantDensity: 0.62,
    baseHeight: 3,
    heightAmp: 6,
  },
  desert: {
    grassColor: 0xc2a645,
    treeDensity: 0.998,
    treeTypes: [],
    surfaceBlock: 'sand',
    plantDensity: 0.95,
    baseHeight: 1,
    heightAmp: 2,
  },
  snow: {
    grassColor: 0x8fb8a0,
    treeDensity: 0.99,
    treeTypes: ['spruce'],
    surfaceBlock: 'snow',
    plantDensity: 0.88,
    baseHeight: 2,
    heightAmp: 5,
  },
  taiga: {
    grassColor: 0x6a9f4a,
    treeDensity: 0.98,
    treeTypes: ['spruce'],
    surfaceBlock: 'grass',
    plantDensity: 0.80,
    baseHeight: 2.5,
    heightAmp: 5,
  },
  savanna: {
    grassColor: 0x9ab84a,
    treeDensity: 0.992,
    treeTypes: ['oak'],
    surfaceBlock: 'grass',
    plantDensity: 0.86,
    baseHeight: 1.5,
    heightAmp: 2.5,
  },
};

// ──── Value Noise with FBM ────

function hash2D(worldSeed: number, x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + worldSeed * 47.3) * 43758.5453;
  return n - Math.floor(n);
}

function hash3D(worldSeed: number, x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + worldSeed * 47.3) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise2D(worldSeed: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const n00 = hash2D(worldSeed, ix, iz);
  const n10 = hash2D(worldSeed, ix + 1, iz);
  const n01 = hash2D(worldSeed, ix, iz + 1);
  const n11 = hash2D(worldSeed, ix + 1, iz + 1);
  return n00 * (1 - sx) * (1 - sz) + n10 * sx * (1 - sz) + n01 * (1 - sx) * sz + n11 * sx * sz;
}

export function fbm2D(worldSeed: number, x: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * smoothNoise2D(worldSeed + i * 100, x * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue;
}

function fbm3D(worldSeed: number, x: number, y: number, z: number, octaves = 3): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i += 1) {
    const hx = x * frequency;
    const hy = y * frequency;
    const hz = z * frequency;
    const ix = Math.floor(hx);
    const iy = Math.floor(hy);
    const iz = Math.floor(hz);
    const fx = hx - ix;
    const fy = hy - iy;
    const fz = hz - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sz = fz * fz * (3 - 2 * fz);
    const seed = worldSeed + i * 100;
    const v000 = hash3D(seed, ix, iy, iz);
    const v100 = hash3D(seed, ix + 1, iy, iz);
    const v010 = hash3D(seed, ix, iy + 1, iz);
    const v110 = hash3D(seed, ix + 1, iy + 1, iz);
    const v001 = hash3D(seed, ix, iy, iz + 1);
    const v101 = hash3D(seed, ix + 1, iy, iz + 1);
    const v011 = hash3D(seed, ix, iy + 1, iz + 1);
    const v111 = hash3D(seed, ix + 1, iy + 1, iz + 1);
    const a = v000 * (1 - sx) + v100 * sx;
    const b = v010 * (1 - sx) + v110 * sx;
    const c = v001 * (1 - sx) + v101 * sx;
    const d = v011 * (1 - sx) + v111 * sx;
    const e = a * (1 - sy) + b * sy;
    const f = c * (1 - sy) + d * sy;
    value += amplitude * (e * (1 - sz) + f * sz);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue;
}

// ──── Backward-compat noise ────

export function seededNoise(worldSeed: number, x: number, y: number, z: number) {
  return Math.abs(Math.sin((x + worldSeed) * 12.9898 + (y - worldSeed * 0.37) * 78.233 + (z + worldSeed * 0.61) * 37.719) * 43758.5453) % 1;
}

// ──── Biome noise (larger scale) ────

function biomeNoise(worldSeed: number, x: number, z: number) {
  return fbm2D(worldSeed * 0.1, x * 0.012, z * 0.012, 3);
}

function moistureNoise(worldSeed: number, x: number, z: number) {
  return fbm2D(worldSeed * 0.1 + 500, x * 0.015, z * 0.015, 3);
}

// ──── Biome blending ────

type BiomeWeight = { biome: Biome; weight: number };

const biomeCenters: Record<Biome, [number, number]> = {
  desert: [0.8, 0.2],
  savanna: [0.6, 0.4],
  plains: [0.4, 0.4],
  forest: [0.55, 0.65],
  jungle: [0.8, 0.8],
  taiga: [0.35, 0.55],
  snow: [0.15, 0.35],
};

function getBiomeWeights(worldSeed: number, x: number, z: number, blendRadius = 24): BiomeWeight[] {
  const temp = biomeNoise(worldSeed, x, z);
  const moisture = moistureNoise(worldSeed, x, z);

  const raw: BiomeWeight[] = [];
  for (const [biome, [ct, cm]] of Object.entries(biomeCenters)) {
    const dist = Math.sqrt((temp - ct) ** 2 + (moisture - cm) ** 2);
    const weight = Math.max(0, 1 - dist * 2.2);
    raw.push({ biome: biome as Biome, weight });
  }

  // Sample nearby positions for smoother transitions
  const sampleRadius = Math.round(blendRadius * 0.3);
  if (sampleRadius > 0) {
    const neighbors: BiomeWeight[] = [];
    const step = Math.max(1, Math.floor(sampleRadius / 2));
    for (let dx = -sampleRadius; dx <= sampleRadius; dx += step) {
      for (let dz = -sampleRadius; dz <= sampleRadius; dz += step) {
        if (dx === 0 && dz === 0) continue;
        const nt = biomeNoise(worldSeed, x + dx, z + dz);
        const nm = moistureNoise(worldSeed, x + dx, z + dz);
        for (const [biome, [ct, cm]] of Object.entries(biomeCenters)) {
          const dist = Math.sqrt((nt - ct) ** 2 + (nm - cm) ** 2);
          const w = Math.max(0, 1 - dist * 2.2);
          neighbors.push({ biome: biome as Biome, weight: w * 0.15 });
        }
      }
    }
    for (const n of neighbors) {
      const existing = raw.find((r) => r.biome === n.biome);
      if (existing) existing.weight += n.weight;
      else raw.push(n);
    }
  }

  return raw.sort((a, b) => b.weight - a.weight);
}

export function getBiome(worldSeed: number, x: number, z: number): Biome {
  return getBiomeWeights(worldSeed, x, z, 0)[0].biome;
}

// ──── River ────

function riverCenterX(worldSeed: number, z: number) {
  return Math.sin((z + worldSeed) * 0.15) * 7 + Math.sin((z - worldSeed * 0.52) * 0.045 + 1.8) * 10;
}

export function riverProfile(worldSeed: number, x: number, z: number) {
  const center = riverCenterX(worldSeed, z);
  const bend = riverCenterX(worldSeed, z + 1) - riverCenterX(worldSeed, z - 1);
  const distance = Math.abs(x - center) / Math.max(1, Math.hypot(1, bend * 0.5));
  const width = 3.2 + seededNoise(worldSeed, Math.floor(z / 7), 0, 3) * 1.7;
  const bankWidth = width + 3.4 + seededNoise(worldSeed, Math.floor(z / 9), 0, 11) * 1.4;
  const bed = distance < width;
  const bank = distance < bankWidth;
  const depth = bed ? 1 + Math.floor((1 - distance / width) * 2.6) : 0;
  return { bed, bank, depth, bankBlend: THREE.MathUtils.clamp((bankWidth - distance) / Math.max(bankWidth - width, 0.1), 0, 1) };
}

export function findSafeSpawnPoint(worldSeed: number, preferredX: number, preferredZ: number, worldRadius: number, waterLevel: number): { x: number; z: number } {
  for (let r = 0; r <= 40; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        if (r > 0 && Math.abs(dx) < r && Math.abs(dz) < r) continue;
        const x = preferredX + dx;
        const z = preferredZ + dz;
        if (Math.hypot(x, z) >= worldRadius - 3) continue;
        const river = riverProfile(worldSeed, x, z);
        if (river.bed) continue;
        const h = getSurfaceHeight(worldSeed, x, z, worldRadius, waterLevel);
        if (h > waterLevel) return { x, z };
      }
    }
  }
  return { x: preferredX, z: preferredZ };
}

// ──── Terrain height with FBM ────

export function terrainHeight(worldSeed: number, x: number, z: number) {
  const continent = (fbm2D(worldSeed, x * 0.025, z * 0.025, 3) - 0.4) * 10;
  const detail = fbm2D(worldSeed + 100, x * 0.07, z * 0.07, 2) * 3;
  const ridge = Math.max(0, fbm2D(worldSeed + 200, x * 0.04, z * 0.04, 3) - 0.55) * 14;
  return Math.floor(1.5 + continent + detail + ridge);
}

// ──── Surface height (matches generateWorld logic) ────

export function getSurfaceHeight(
  worldSeed: number, x: number, z: number,
  worldRadius: number, waterLevel: number,
  flatWorld = false,
): number {
  if (flatWorld) return waterLevel;

  const distance = Math.hypot(x, z);
  const biomeWeights = getBiomeWeights(worldSeed, x, z);
  const river = riverProfile(worldSeed, x, z);

  let heightSum = 0;
  let weightSum = 0;
  for (const w of biomeWeights.slice(0, 3)) {
    if (w.weight > 0.05) {
      const cfg = biomeConfig[w.biome];
      heightSum += w.weight * (cfg.baseHeight + fbm2D(worldSeed + 500, x * 0.05, z * 0.05, 2) * cfg.heightAmp);
      weightSum += w.weight;
    }
  }
  let h = Math.floor(weightSum > 0 ? heightSum / weightSum : 1.5);

  const edgeDist = worldRadius - distance;
  if (edgeDist < 6) {
    h = waterLevel + Math.floor(((h - waterLevel) * edgeDist) / 6);
  }

  if (river.bed) h = Math.floor(Math.min(h - river.depth, waterLevel - river.depth));
  if (!river.bed && river.bank && river.bankBlend > 0.5 && h > waterLevel + 1) h -= 1;
  if (!river.bed && river.bank) h = Math.max(h, waterLevel);

  return h;
}

// ──── Cave noise ────

function caveNoiseValue(worldSeed: number, x: number, y: number, z: number): number {
  const n1 = fbm3D(worldSeed + 300, x * 0.08, y * 0.08, z * 0.08, 3);
  const n2 = fbm3D(worldSeed + 400, x * 0.12, y * 0.12, z * 0.12, 2);
  return n1 * 0.7 + n2 * 0.3;
}

// ──── Trees ────

export function buildTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 4 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'wood');

  for (let layer = -1; layer <= 2; layer += 1) {
    const leafY = y + trunkHeight + layer;
    const baseRadius = layer < 1 ? 2 : 1;

    for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
      for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        const cornerNoise = seededNoise(worldSeed, x + dx, leafY, z + dz);
        const edgeLimit = baseRadius + (cornerNoise > 0.76 ? 1 : 0);
        if (distance > edgeLimit || (distance === 0 && layer < 0)) continue;
        if (distance >= baseRadius + 1 && cornerNoise < 0.9) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'leaves');
      }
    }
  }

  ctx.addBlock(x, y + trunkHeight + 2, z, 'leaves');
}

export function buildJungleTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 6 + Math.floor(seededNoise(worldSeed, x, y, z) * 5);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'jungleLog');

  for (let layer = -2; layer <= 2; layer += 1) {
    const leafY = y + trunkHeight + layer;
    const baseRadius = layer < 0 ? 3 : 2;

    for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
      for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        const cornerNoise = seededNoise(worldSeed, x + dx, leafY, z + dz);
        if (distance > baseRadius + (cornerNoise > 0.7 ? 1 : 0)) continue;
        if (distance === 0 && layer < 0) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'jungleLeaves');
      }
    }
  }
}

export function buildCherryTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 4 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'cherryLog');

  for (let layer = -1; layer <= 2; layer += 1) {
    const leafY = y + trunkHeight + layer;
    const baseRadius = layer < 1 ? 2 : 1;

    for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
      for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        if (distance > baseRadius + 1) continue;
        if (distance === 0 && layer < 0) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'cherryLeaves');
      }
    }
  }
}

export function buildSpruceTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 5 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'spruceLog');

  for (let layer = -1; layer <= trunkHeight; layer += 1) {
    const leafY = y + trunkHeight + 2 - layer;
    const radius = Math.max(0, Math.floor(layer / 2));

    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.abs(dx) + Math.abs(dz) > radius) continue;
        if (dx === 0 && dz === 0 && layer < trunkHeight) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'spruceLeaves');
      }
    }
  }
}

function buildFallenLog(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const logType: Record<string, BlockType> = { oak: 'wood', spruce: 'spruceLog', jungle: 'jungleLog', cherry: 'cherryLog' };
  const treeRoll = seededNoise(worldSeed, x, y + 3, z);
  const treeKind = treeRoll < 0.25 ? 'spruce' : treeRoll < 0.5 ? 'jungle' : treeRoll < 0.75 ? 'cherry' : 'oak';
  const axis = seededNoise(worldSeed, x, y + 7, z) > 0.5;
  const len = 2 + Math.floor(seededNoise(worldSeed, x + 5, y, z + 5) * 3);
  for (let i = 0; i < len; i += 1) {
    const px = x + (axis ? i : 0);
    const pz = z + (axis ? 0 : i);
    ctx.addBlock(px, y + 1, pz, logType[treeKind]);
  }
}

function buildBush(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const leafTypes: Record<string, BlockType> = { oak: 'leaves', spruce: 'spruceLeaves', jungle: 'jungleLeaves', cherry: 'cherryLeaves' };
  const treeRoll = seededNoise(worldSeed, x + 2, y + 5, z + 2);
  const treeKind = treeRoll < 0.25 ? 'spruce' : treeRoll < 0.5 ? 'jungle' : treeRoll < 0.75 ? 'cherry' : 'oak';
  const leaf = leafTypes[treeKind];
  ctx.addBlock(x, y + 1, z, leaf);
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      if (Math.abs(dx) + Math.abs(dz) > 1 && seededNoise(worldSeed, x + dx, y + 1, z + dz) < 0.5) continue;
      ctx.addBlock(x + dx, y + 1, z + dz, leaf);
    }
  }
}

// ──── Structures ────

export function buildCactus(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const height = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dy = 1; dy <= height; dy += 1) ctx.addBlock(x, y + dy, z, 'cactus');
}

export function buildPumpkinPatch(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const count = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let i = 0; i < count; i += 1) {
    const dx = Math.floor(seededNoise(worldSeed, x + i, y, z) * 3) - 1;
    const dz = Math.floor(seededNoise(worldSeed, x, y, z + i) * 3) - 1;
    ctx.addBlock(x + dx, y + 1, z + dz, 'pumpkin');
  }
}

export function buildMushroomCluster(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const count = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 4);
  for (let i = 0; i < count; i += 1) {
    const dx = Math.floor(seededNoise(worldSeed, x + i, y, z) * 5) - 2;
    const dz = Math.floor(seededNoise(worldSeed, x, y, z + i) * 5) - 2;
    const type = seededNoise(worldSeed, x + i, y + 1, z + i) > 0.5 ? 'brownMushroom' : 'redMushroom';
    ctx.addBlock(x + dx, y + 1, z + dz, type);
  }
}

export function buildRockFormation(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const radius = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  const height = 1 + Math.floor(seededNoise(worldSeed, x, y + 1, z) * 2);

  for (let dy = 0; dy <= height; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        if (distance > radius + (seededNoise(worldSeed, x + dx, y + dy, z + dz) > 0.6 ? 1 : 0)) continue;
        const type = dy === height ? 'cobblestone' : 'mossyCobblestone';
        ctx.addBlock(x + dx, y + dy, z + dz, type);
      }
    }
  }
}

export function buildPond(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const radius = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      const distance = Math.hypot(dx, dz);
      if (distance > radius) continue;
      if (distance > radius - 1.5) {
        ctx.addBlock(x + dx, y, z + dz, 'clay');
      } else {
        ctx.addBlock(x + dx, y, z + dz, 'water', 0);
      }
    }
  }
}

export function buildSnowPile(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const radius = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.abs(dx) + Math.abs(dz) > radius) continue;
      ctx.addBlock(x + dx, y + 1, z + dz, 'snow');
    }
  }
}

export function buildMineralVein(ctx: WorldGenContext, x: number, y: number, z: number, type: BlockType, worldSeed: number) {
  const size = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dx = 0; dx < size; dx += 1) {
    for (let dy = 0; dy < size; dy += 1) {
      for (let dz = 0; dz < size; dz += 1) {
        if (seededNoise(worldSeed, x + dx, y + dy, z + dz) > 0.6) {
          ctx.addBlock(x + dx, y + dy, z + dz, type);
        }
      }
    }
  }
}

export function addVegetation(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const isRiverBed = (wx: number, wz: number) => riverProfile(worldSeed, wx, wz).bed;
  const isRiverBank = (wx: number, wz: number) => riverProfile(worldSeed, wx, wz).bank;
  if (isRiverBed(x, z) || seededNoise(worldSeed, x, y, z) < 0.58) return;
  const plant = isRiverBank(x, z) && seededNoise(worldSeed, x, y, z + 23) > 0.72 ? 'fern' : pickPlant(x, y, z, (nx, ny, nz) => seededNoise(worldSeed, nx, ny, nz));
  ctx.addBlock(x, y + 1, z, plant);
}

// ──── Creatures ────

export function createCreature(ctx: WorldGenContext, x: number, z: number, worldSeed: number) {
  const h = getSurfaceHeight(worldSeed, x, z, ctx.worldRadius, ctx.waterLevel) + 1;
  const root = new THREE.Group();
  root.position.set(x, h, z);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.9), new THREE.MeshLambertMaterial({ color: 0xffd56f }));
  body.position.y = 0.38;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.52), new THREE.MeshLambertMaterial({ color: 0xffe29a }));
  head.position.set(0, 0.77, -0.28);
  head.castShadow = true;
  root.add(head);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x392d38 });
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), eyeMaterial);
  leftEye.position.set(-0.13, 0.82, -0.55);
  root.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.13;
  root.add(rightEye);

  ctx.scene.add(root);
  ctx.creatures.push({ root, phase: Math.random() * Math.PI * 2, home: root.position.clone() });
}

export function spawnCreatures(ctx: WorldGenContext, worldSeed: number) {
  createCreature(ctx, -6, -5, worldSeed);
  createCreature(ctx, 5, -8, worldSeed);
  createCreature(ctx, 8, 4, worldSeed);
  createCreature(ctx, -9, 6, worldSeed);
}

// ──── World Generation ────

export function generateWorld(ctx: WorldGenContext, worldGen: WorldGenSettings, worldSeed: number) {
  return new Promise<void>((resolve) => {
    ctx.onProgress?.('生成地形 · 计算噪声与生物群系', 0);

    const batchSize = 20;
    const xCoords: number[] = [];
    const zCoords: number[] = [];

    for (let x = -ctx.worldRadius; x <= ctx.worldRadius; x += 1) {
      for (let z = -ctx.worldRadius; z <= ctx.worldRadius; z += 1) {
        xCoords.push(x);
        zCoords.push(z);
      }
    }

    let index = 0;
    const totalBlocks = xCoords.length;

    // treeDensityMultiplier: divides gap (1 - density) so sparse=2→less trees, dense=0.5→more
    const treeDensityMultiplier = worldGen.treeDensity === 'none' ? 0
      : worldGen.treeDensity === 'sparse' ? 2
      : worldGen.treeDensity === 'dense' ? 0.5
      : 1;

    const structureDensityOffset = worldGen.structureDensity === 'none' ? 1
      : worldGen.structureDensity === 'sparse' ? 0.05
      : worldGen.structureDensity === 'dense' ? -0.05
      : 0;

    // oreDensityMultiplier: divides gap (1 - threshold) so sparse=2→less ore, rich=0.5→more
    const oreDensityMultiplier = worldGen.oreDensity === 'none' ? 0
      : worldGen.oreDensity === 'sparse' ? 2
      : worldGen.oreDensity === 'rich' ? 0.5
      : 1;

    // plantDensityOffset: shifts vegetation threshold so sparse raises it (less plants), lush lowers it (more plants)
    const plantDensityOffset = worldGen.plantDensity === 'none' ? 1
      : worldGen.plantDensity === 'sparse' ? 0.06
      : worldGen.plantDensity === 'lush' ? -0.06
      : 0;

    function processBatch() {
      const endIndex = Math.min(index + batchSize, totalBlocks);

      for (let i = index; i < endIndex; i += 1) {
        const x = xCoords[i];
        const z = zCoords[i];
        const distance = Math.hypot(x, z);
        if (distance > ctx.worldRadius + Math.sin(x * z) * 0.8) continue;

        const biomeWeights = getBiomeWeights(worldSeed, x, z);
        const biome = biomeWeights[0].biome;
        const config = biomeConfig[biome];
        const river = worldGen.flatWorld ? { bed: false, bank: false, bankBlend: 0, depth: 0 } : riverProfile(worldSeed, x, z);

        // Blend terrain height between biomes
        let h: number;
        if (worldGen.flatWorld) {
          h = ctx.waterLevel;
        } else {
          let heightSum = 0;
          let weightSum = 0;
          for (const w of biomeWeights.slice(0, 3)) {
            if (w.weight > 0.05) {
              const cfg = biomeConfig[w.biome];
              heightSum += w.weight * (cfg.baseHeight + fbm2D(worldSeed + 500, x * 0.05, z * 0.05, 2) * cfg.heightAmp);
              weightSum += w.weight;
            }
          }
          h = Math.floor(weightSum > 0 ? heightSum / weightSum : 1.5);

          // World edge slope
          const edgeDist = ctx.worldRadius - distance;
          if (edgeDist < 6) {
            h = ctx.waterLevel + Math.floor(((h - ctx.waterLevel) * edgeDist) / 6);
          }

          if (river.bed) h = Math.floor(Math.min(h - river.depth, ctx.waterLevel - river.depth));
          if (!river.bed && river.bank && river.bankBlend > 0.5 && h > ctx.waterLevel + 1) h -= 1;
          if (!river.bed && river.bank) h = Math.max(h, ctx.waterLevel);
        }

        // Fill column
        for (let y = ctx.worldBottom; y <= h; y += 1) {
          // Cave check (only in stone layers, not at surface or bedrock)
          if (y < h - 2 && y > ctx.worldBottom + 1 && !river.bed) {
            const cv = caveNoiseValue(worldSeed, x, y, z);
            if (cv > 0.62 && cv < 0.72) {
              continue; // Skip this block → cave
            }
          }

          const bankRoll = seededNoise(worldSeed, x, y, z);
          let surfaceType: BlockType;

          // Beach: water-adjacent land uses sand
          const isBeach = h === ctx.waterLevel && distance < ctx.worldRadius - 3;

          if (river.bed) {
            surfaceType = bankRoll > 0.38 ? 'sand' : 'gravel';
          } else if (isBeach) {
            surfaceType = 'sand';
          } else if (river.bank && bankRoll < river.bankBlend * 0.58) {
            surfaceType = 'sand';
          } else if (biome === 'desert') {
            surfaceType = 'sand';
          } else if (biome === 'snow') {
            surfaceType = y === h ? 'snow' : 'grass';
          } else {
            surfaceType = config.surfaceBlock;
          }

          const type = y === ctx.worldBottom ? 'bedrock'
            : y === h ? surfaceType
            : biome === 'desert' ? (y > h - 4 ? 'sand' : 'stone')
            : y > h - 3 ? 'dirt' : 'stone';
          ctx.addBlock(x, y, z, type);
        }

        // Ores (need at least 5 blocks below surface to generate, not in river beds)
        if (oreDensityMultiplier > 0 && h - ctx.worldBottom > 5 && !river.bed) {
          const mineralNoise = seededNoise(worldSeed, x * 3, h * 3, z * 3);
          const oreThreshold = oreDensityMultiplier > 0 ? 1 - (1 - 0.96) / oreDensityMultiplier : 1;
          const oreY = (offset: number) => Math.max(ctx.worldBottom + 1, h - offset);
          if (mineralNoise > oreThreshold) buildMineralVein(ctx, x, oreY(10), z, 'coalOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.01) buildMineralVein(ctx, x, oreY(8), z, 'ironOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.02) buildMineralVein(ctx, x, oreY(11), z, 'copperOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.03) buildMineralVein(ctx, x, oreY(14), z, 'goldOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.035) buildMineralVein(ctx, x, oreY(17), z, 'diamondOre', worldSeed);
        }

        if (river.bed) {
          for (let y = h + 1; y <= ctx.waterLevel; y += 1) ctx.addBlock(x, y, z, 'water', 0);
          continue;
        }

        // Trees & structures
        if (treeDensityMultiplier > 0 && distance > 8 && !river.bank && config.treeTypes.length > 0) {
          const treeNoise = seededNoise(worldSeed, x, h, z);
          const treeThreshold = treeDensityMultiplier > 0 ? 1 - (1 - config.treeDensity) / treeDensityMultiplier : 1;
          if (treeNoise > treeThreshold) {
            const treeType = config.treeTypes[Math.floor(seededNoise(worldSeed, x, h + 1, z) * config.treeTypes.length)];
            if (treeType === 'oak') buildTree(ctx, x, h, z, worldSeed);
            else if (treeType === 'jungle') buildJungleTree(ctx, x, h, z, worldSeed);
            else if (treeType === 'cherry') buildCherryTree(ctx, x, h, z, worldSeed);
            else if (treeType === 'spruce') buildSpruceTree(ctx, x, h, z, worldSeed);
          } else if (seededNoise(worldSeed, x + 3, h, z - 5) > 0.999) {
            buildFallenLog(ctx, x, h, z, worldSeed);
          } else if (seededNoise(worldSeed, x - 7, h, z + 11) > 0.9995) {
            buildBush(ctx, x, h, z, worldSeed);
          }
        }

        if (h >= ctx.waterLevel && worldGen.structureDensity !== 'none') {
          const structNoise = seededNoise(worldSeed, x + 11, h, z - 7);
          const structThreshold = config.plantDensity + structureDensityOffset + plantDensityOffset;
          const surfaceType = ctx.blocks.get(`${x},${h},${z}`)?.type;
          const isPlantable = surfaceType === 'grass' || surfaceType === 'dirt';

          if (isPlantable && structNoise > structThreshold) addVegetation(ctx, x, h, z, worldSeed);
          else if (biome === 'desert' && structNoise > 0.92 + structureDensityOffset) buildCactus(ctx, x, h, z, worldSeed);
          else if (isPlantable && biome !== 'desert' && biome !== 'snow' && structNoise > 0.93 + structureDensityOffset) buildPumpkinPatch(ctx, x, h, z, worldSeed);
          else if (isPlantable && biome === 'forest' && structNoise > 0.91 + structureDensityOffset) buildMushroomCluster(ctx, x, h, z, worldSeed);
          else if (isPlantable && structNoise > 0.94 + structureDensityOffset) buildRockFormation(ctx, x, h, z, worldSeed);
          else if (!river.bank && !river.bed && isPlantable && structNoise > 0.87 + structureDensityOffset) buildPond(ctx, x, h, z, worldSeed);
          else if (biome === 'snow' && structNoise > 0.85 + structureDensityOffset) buildSnowPile(ctx, x, h, z, worldSeed);
        }
      }

      index = endIndex;
      const pct = index / totalBlocks;
      const phase = pct < 0.3 ? '生成地形 · 雕刻山脉与河流' : pct < 0.7 ? '生成地形 · 放置方块与矿脉' : '生成地形 · 生成树木与结构';
      ctx.onProgress?.(phase, pct);

      if (index < totalBlocks) {
        setTimeout(processBatch, 0);
      } else {
        ctx.onProgress?.('处理物理 · 计算重力与沙子下落', 0.92);
        ctx.settleInitialFallingBlocks();
        ctx.onProgress?.('构建网格 · 渲染区块与水面', 0.95);
        ctx.rebuildAllChunks();
        while (ctx.dirtyWaterChunks.size > 0) ctx.rebuildDirtyWaterChunks(64);
        ctx.updateChunkVisibility(true);
        ctx.onProgress?.('放置光源与生物', 0.98);
        for (const [key, block] of ctx.blocks) {
          const cfg = ctx.lightConfig(block.type);
          if (cfg) {
            const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance);
            light.position.set(block.position.x, block.position.y + 0.2, block.position.z);
            ctx.scene.add(light);
            ctx.blockLights.set(key, light);
          }
        }
        spawnCreatures(ctx, worldSeed);
        ctx.onProgress?.('完成 · 世界已就绪', 1);
        resolve();
      }
    }

    setTimeout(processBatch, 0);
  });
}
