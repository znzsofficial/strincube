import * as THREE from 'three';
import type { WorldGenSettings } from './types';
import type { BlockType } from './blocks';
import { pickPlant } from './blocks';
import { CHUNK_SIZE, forEachChunkCell, toChunkCoord } from './chunk';

export type Creature = { root: THREE.Group; phase: number; home: THREE.Vector3 };

export interface WorldGenContext {
  blocks: Map<string, { position: THREE.Vector3; type: BlockType }>;
  worldSeed: number;
  worldRadius: number | null;
  waterLevel: number;
  worldBottom: number;
  scene: THREE.Scene;
  creatures: Creature[];
  addBlock: (x: number, y: number, z: number, type: BlockType, waterDistance?: number, staticWater?: boolean) => void;
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

export type BaseBiome = 'plains' | 'forest' | 'jungle' | 'desert' | 'snow' | 'taiga' | 'savanna';
export type DerivedBiome = 'river' | 'beach' | 'stonyShore' | 'ocean' | 'deepOcean' | 'frozenOcean' | 'mountainMeadow' | 'stonyPeaks' | 'snowySlopes';
export type Biome = BaseBiome | DerivedBiome;

export const biomeConfig: Record<BaseBiome, {
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
    heightAmp: 1.3,
  },
  forest: {
    grassColor: 0x5a8f29,
    treeDensity: 0.985,
    treeTypes: ['oak', 'spruce', 'cherry'],
    surfaceBlock: 'grass',
    plantDensity: 0.70,
    baseHeight: 2,
    heightAmp: 2.4,
  },
  jungle: {
    grassColor: 0x3a7a1a,
    treeDensity: 0.975,
    treeTypes: ['jungle'],
    surfaceBlock: 'grass',
    plantDensity: 0.62,
    baseHeight: 3,
    heightAmp: 4.2,
  },
  desert: {
    grassColor: 0xc2a645,
    treeDensity: 0.998,
    treeTypes: [],
    surfaceBlock: 'sand',
    plantDensity: 0.95,
    baseHeight: 1,
    heightAmp: 1.2,
  },
  snow: {
    grassColor: 0x8fb8a0,
    treeDensity: 0.99,
    treeTypes: ['spruce'],
    surfaceBlock: 'snow',
    plantDensity: 0.88,
    baseHeight: 2,
    heightAmp: 3,
  },
  taiga: {
    grassColor: 0x6a9f4a,
    treeDensity: 0.98,
    treeTypes: ['spruce'],
    surfaceBlock: 'grass',
    plantDensity: 0.80,
    baseHeight: 2.5,
    heightAmp: 3,
  },
  savanna: {
    grassColor: 0x9ab84a,
    treeDensity: 0.992,
    treeTypes: ['oak'],
    surfaceBlock: 'grass',
    plantDensity: 0.86,
    baseHeight: 1.5,
    heightAmp: 1.4,
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

const simplexGrad2: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function simplex2D(worldSeed: number, x: number, z: number): number {
  const f2 = 0.5 * (Math.sqrt(3) - 1);
  const g2 = (3 - Math.sqrt(3)) / 6;
  const s = (x + z) * f2;
  const i = Math.floor(x + s);
  const j = Math.floor(z + s);
  const t = (i + j) * g2;
  const x0 = x - (i - t);
  const z0 = z - (j - t);
  const i1 = x0 > z0 ? 1 : 0;
  const j1 = x0 > z0 ? 0 : 1;
  const x1 = x0 - i1 + g2;
  const z1 = z0 - j1 + g2;
  const x2 = x0 - 1 + 2 * g2;
  const z2 = z0 - 1 + 2 * g2;

  function corner(ix: number, iz: number, dx: number, dz: number) {
    const falloff = 0.5 - dx * dx - dz * dz;
    if (falloff <= 0) return 0;
    const grad = simplexGrad2[Math.floor(hash2D(worldSeed, ix, iz) * simplexGrad2.length) % simplexGrad2.length];
    const strength = falloff * falloff;
    return strength * strength * (grad[0] * dx + grad[1] * dz);
  }

  const n0 = corner(i, j, x0, z0);
  const n1 = corner(i + i1, j + j1, x1, z1);
  const n2 = corner(i + 1, j + 1, x2, z2);
  return THREE.MathUtils.clamp(70 * (n0 + n1 + n2) * 0.5 + 0.5, 0, 1);
}

export function fbm2D(worldSeed: number, x: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * simplex2D(worldSeed + i * 100, x * frequency, z * frequency);
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
  return fbm2D(worldSeed * 0.1, x * 0.0032, z * 0.0032, 3);
}

function moistureNoise(worldSeed: number, x: number, z: number) {
  return fbm2D(worldSeed * 0.1 + 500, x * 0.0038, z * 0.0038, 3);
}

function settingScale(value: number | undefined) {
  return Math.max(0.25, value ?? 1);
}

function biomeCoordScale(worldGen?: WorldGenSettings) {
  return 1 / settingScale(worldGen?.biomeScale);
}

function riverCoordScale(worldGen?: WorldGenSettings) {
  return 1 / settingScale(worldGen?.riverScale);
}

function mountainStrength(worldGen?: WorldGenSettings) {
  return settingScale(worldGen?.mountainScale);
}

function oceanStrength(worldGen?: WorldGenSettings) {
  return settingScale(worldGen?.oceanScale);
}

function oceanContinentalness(worldSeed: number, x: number, z: number, worldGen?: WorldGenSettings) {
  const scale = 1 / oceanStrength(worldGen);
  const broad = fbm2D(worldSeed + 900, x * 0.006 * scale, z * 0.006 * scale, 4);
  const shelf = fbm2D(worldSeed + 950, x * 0.018 * scale, z * 0.018 * scale, 2) * 0.18;
  return broad + shelf;
}

function oceanDepth(worldSeed: number, x: number, z: number, worldGen?: WorldGenSettings) {
  const strength = oceanStrength(worldGen);
  const threshold = THREE.MathUtils.clamp(0.43 + (strength - 1) * 0.08, 0.32, 0.58);
  const continentalness = oceanContinentalness(worldSeed, x, z, worldGen);
  if (continentalness >= threshold) return 0;
  const deepNoise = fbm2D(worldSeed + 980, x * 0.025 / strength, z * 0.025 / strength, 2);
  const depth = (threshold - continentalness) / threshold;
  return Math.max(1, Math.floor(depth * 8 + deepNoise * 2));
}

function lakeProfile(worldSeed: number, x: number, z: number, worldGen?: WorldGenSettings) {
  if (oceanDepth(worldSeed, x, z, worldGen) > 0) return { depth: 0, bank: false };
  const scale = biomeCoordScale(worldGen);
  const basin = fbm2D(worldSeed + 1500, x * 0.01 * scale, z * 0.01 * scale, 3);
  const shape = fbm2D(worldSeed + 1510, x * 0.028 * scale, z * 0.028 * scale, 2);
  const mountainGate = fbm2D(worldSeed + 1300, x * 0.0038 / mountainStrength(worldGen), z * 0.0038 / mountainStrength(worldGen), 4);
  if (mountainGate > 0.72) return { depth: 0, bank: false };
  const lakeScore = basin * 0.72 + shape * 0.28;
  if (lakeScore < 0.245) return { depth: 2 + Math.floor((0.245 - lakeScore) * 32), bank: true };
  if (lakeScore < 0.285) return { depth: 0, bank: true };
  return { depth: 0, bank: false };
}

function sampleWorldClimate(worldSeed: number, x: number, z: number, worldGen?: WorldGenSettings): WorldClimateSample {
  const bScale = biomeCoordScale(worldGen);
  const lake = lakeProfile(worldSeed, x, z, worldGen);
  return {
    temperature: biomeNoise(worldSeed, x * bScale, z * bScale),
    humidity: moistureNoise(worldSeed, x * bScale, z * bScale),
    continentalness: oceanContinentalness(worldSeed, x, z, worldGen),
    erosion: fbm2D(worldSeed + 1320, x * 0.018, z * 0.018, 3),
    ridge: fbm2D(worldSeed + 1300, x * 0.0038 / mountainStrength(worldGen), z * 0.0038 / mountainStrength(worldGen), 4),
    oceanDepth: oceanDepth(worldSeed, x, z, worldGen),
    lakeDepth: lake.depth,
    lakeBank: lake.bank,
  };
}

// ──── Biome blending ────

type BiomeWeight = { biome: BaseBiome; weight: number };

type WorldClimateSample = {
  temperature: number;
  humidity: number;
  continentalness: number;
  erosion: number;
  ridge: number;
  oceanDepth: number;
  lakeDepth: number;
  lakeBank: boolean;
};

type EffectiveRiverProfile = {
  bed: boolean;
  bank: boolean;
  depth: number;
  bankBlend: number;
  waterY?: number;
  flowAccumulation?: number;
  slope?: number;
  source?: 'noise' | 'hydrology';
};

type HydroCell = {
  x: number;
  z: number;
  height: number;
  humidity: number;
  oceanDepth: number;
  lakeDepth: number;
  downstream: number;
  accumulation: number;
  slope: number;
  centerRiver: boolean;
  riverWidth: number;
  riverDepth: number;
};

type HydrologyPatch = {
  minX: number;
  minZ: number;
  size: number;
  cells: HydroCell[];
};

function emptyRiverProfile(): EffectiveRiverProfile {
  return { bed: false, bank: false, bankBlend: 0, depth: 0 };
}

type WorldGenDensityConfig = {
  treeDensityMultiplier: number;
  structureDensityOffset: number;
  oreDensityMultiplier: number;
  plantDensityOffset: number;
};

type ColumnFeatureContext = {
  ctx: WorldGenContext;
  worldSeed: number;
  x: number;
  z: number;
  h: number;
  biome: Biome;
  baseBiome: BaseBiome;
  surfaceType?: BlockType;
  isPlantable: boolean;
  river: EffectiveRiverProfile;
};

type SurfaceFeatureRule = {
  threshold: number;
  biomes?: Biome[];
  baseBiomes?: BaseBiome[];
  requirePlantable?: boolean;
  avoidRiverBank?: boolean;
  affectedByPlantDensity?: boolean;
  build: (feature: ColumnFeatureContext) => void;
};

type TreeFeatureRule = {
  biomes?: Biome[];
  baseBiomes?: BaseBiome[];
  minDistanceFromSpawn?: number;
  density: number;
  types: ('oak' | 'jungle' | 'cherry' | 'spruce')[];
};

type OreFeatureRule = {
  type: BlockType;
  minY: number;
  maxY: number;
  threshold: number;
  attempts: number;
  biomes?: Biome[];
};

const biomeCenters: Record<BaseBiome, [number, number]> = {
  desert: [0.8, 0.2],
  savanna: [0.6, 0.4],
  plains: [0.4, 0.4],
  forest: [0.55, 0.65],
  jungle: [0.8, 0.8],
  taiga: [0.35, 0.55],
  snow: [0.22, 0.38],
};

function getBiomeWeights(worldSeed: number, x: number, z: number, blendRadius = 24, climate = sampleWorldClimate(worldSeed, x, z), coordScale = 1): BiomeWeight[] {
  const temp = climate.temperature;
  const moisture = climate.humidity;
  const raw: BiomeWeight[] = [];
  for (const [biome, [ct, cm]] of Object.entries(biomeCenters)) {
    const dist = Math.sqrt((temp - ct) ** 2 + (moisture - cm) ** 2);
    const falloff = biome === 'snow' ? 1.62 : 2.2;
    const boost = biome === 'snow' && temp < 0.36 ? 0.24 : 0;
    const weight = Math.max(0, 1 - dist * falloff) + boost;
    raw.push({ biome: biome as BaseBiome, weight });
  }

  // Sample nearby positions for smoother transitions
  const sampleRadius = Math.round(blendRadius * 0.3);
  if (sampleRadius > 0) {
    const neighbors: BiomeWeight[] = [];
    const step = Math.max(1, Math.floor(sampleRadius / 2));
    for (let dx = -sampleRadius; dx <= sampleRadius; dx += step) {
      for (let dz = -sampleRadius; dz <= sampleRadius; dz += step) {
        if (dx === 0 && dz === 0) continue;
        const nt = biomeNoise(worldSeed, (x + dx) * coordScale, (z + dz) * coordScale);
        const nm = moistureNoise(worldSeed, (x + dx) * coordScale, (z + dz) * coordScale);
        for (const [biome, [ct, cm]] of Object.entries(biomeCenters)) {
          const dist = Math.sqrt((nt - ct) ** 2 + (nm - cm) ** 2);
          const falloff = biome === 'snow' ? 1.62 : 2.2;
          const boost = biome === 'snow' && nt < 0.36 ? 0.24 : 0;
          const w = Math.max(0, 1 - dist * falloff) + boost;
          neighbors.push({ biome: biome as BaseBiome, weight: w * 0.15 });
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

export function getBiome(worldSeed: number, x: number, z: number, worldGen?: WorldGenSettings): Biome {
  const climate = sampleWorldClimate(worldSeed, x, z, worldGen);
  const coordScale = biomeCoordScale(worldGen);
  const weights = getBiomeWeights(worldSeed, x, z, 0, climate, coordScale);
  const baseBiome = weights[0].biome;
  const h = resolveBaseTerrainHeight(worldSeed, x, z, weights, worldGen);
  const hydrology = worldGen ? createHydrologyPatchAt(worldSeed, worldGen, x, z, 1) : undefined;
  return resolveDerivedBiome(baseBiome, climate, hydrologyAt(hydrology, x, z) ?? riverProfile(worldSeed, x, z, worldGen), h, 1);
}

// ──── River network ────

export function riverProfile(worldSeed: number, x: number, z: number, worldGen?: WorldGenSettings) {
  const seaDepth = oceanDepth(worldSeed, x, z, worldGen);
  if (seaDepth >= 3) return { bed: false, bank: false, depth: 0, bankBlend: 0 };

  const rScale = riverCoordScale(worldGen);
  const riverAmount = settingScale(worldGen?.riverScale);
  const warpX = (fbm2D(worldSeed + 1160, x * 0.008 * rScale, z * 0.008 * rScale, 3) - 0.5) * 84;
  const warpZ = (fbm2D(worldSeed + 1170, x * 0.008 * rScale, z * 0.008 * rScale, 3) - 0.5) * 84;
  const wx = x + warpX;
  const wz = z + warpZ;

  const basin = fbm2D(worldSeed + 1180, x * 0.0026 * rScale, z * 0.0026 * rScale, 3);
  const localWetness = fbm2D(worldSeed + 1190, x * 0.014 * rScale, z * 0.014 * rScale, 2);
  if (basin < 0.32 - (riverAmount - 1) * 0.05 || localWetness < 0.24 - (riverAmount - 1) * 0.04) return { bed: false, bank: false, depth: 0, bankBlend: 0 };

  const primary = Math.abs(fbm2D(worldSeed + 1200, wx * 0.0065 * rScale, wz * 0.0065 * rScale, 4) - 0.5);
  const tributaryGate = fbm2D(worldSeed + 1210, x * 0.01 * rScale, z * 0.01 * rScale, 2);
  const tributary = tributaryGate > 0.56
    ? Math.abs(fbm2D(worldSeed + 1220, wx * 0.013 * rScale, wz * 0.013 * rScale, 3) - 0.5) * 1.18
    : 1;
  const channel = Math.min(primary, tributary);

  const distance = channel * (165 / THREE.MathUtils.clamp(riverAmount, 0.6, 1.8));
  const width = 2.2 + seededNoise(worldSeed, Math.floor(x / 13), 0, Math.floor(z / 13)) * 2.2;
  const bankWidth = width + 3.2 + seededNoise(worldSeed, Math.floor(x / 17), 0, Math.floor(z / 17)) * 2.2;
  const bed = distance < width;
  const bank = distance < bankWidth;
  const depth = bed ? 1 + Math.floor((1 - distance / width) * (seaDepth > 0 ? 1.6 : 2.8)) : 0;
  return { bed, bank, depth, bankBlend: THREE.MathUtils.clamp((bankWidth - distance) / Math.max(bankWidth - width, 0.1), 0, 1) };
}

const HYDRO_MARGIN = 40;
const HYDRO_STREAM_THRESHOLD = 18;
const HYDRO_RIVER_THRESHOLD = 54;
const hydroPatchCache = new Map<string, HydrologyPatch>();

function hydroCacheKey(worldSeed: number, worldGen: WorldGenSettings, chunkX: number, chunkZ: number, waterLevel: number) {
  return [
    worldSeed,
    chunkX,
    chunkZ,
    waterLevel,
    worldGen.flatWorld ? 1 : 0,
    worldGen.riverScale ?? 1,
    worldGen.biomeScale ?? 1,
    worldGen.mountainScale ?? 1,
    worldGen.oceanScale ?? 1,
  ].join('|');
}

function hydroIndex(size: number, lx: number, lz: number) {
  return lz * size + lx;
}

function baseHydroHeight(worldSeed: number, worldGen: WorldGenSettings, x: number, z: number, waterLevel: number) {
  const climate = sampleWorldClimate(worldSeed, x, z, worldGen);
  const biomeWeights = getBiomeWeights(worldSeed, x, z, 0, climate, biomeCoordScale(worldGen));
  let height = resolveBaseTerrainHeight(worldSeed, x, z, biomeWeights, worldGen);
  if (climate.oceanDepth > 0) height = Math.min(height, waterLevel - climate.oceanDepth);
  return { height, climate };
}

function createHydrologyPatch(worldSeed: number, worldGen: WorldGenSettings, chunkX: number, chunkZ: number, waterLevel: number): HydrologyPatch | undefined {
  if (worldGen.flatWorld) return undefined;
  const cacheKey = hydroCacheKey(worldSeed, worldGen, chunkX, chunkZ, waterLevel);
  const cached = hydroPatchCache.get(cacheKey);
  if (cached) return cached;
  const minX = chunkX * CHUNK_SIZE - HYDRO_MARGIN;
  const minZ = chunkZ * CHUNK_SIZE - HYDRO_MARGIN;
  const size = CHUNK_SIZE + HYDRO_MARGIN * 2;
  const cells: HydroCell[] = [];

  for (let lz = 0; lz < size; lz += 1) {
    for (let lx = 0; lx < size; lx += 1) {
      const x = minX + lx;
      const z = minZ + lz;
      const { height, climate } = baseHydroHeight(worldSeed, worldGen, x, z, waterLevel);
      cells.push({
        x,
        z,
        height,
        humidity: climate.humidity,
        oceanDepth: climate.oceanDepth,
        lakeDepth: climate.lakeDepth,
        downstream: -1,
        accumulation: 0.65 + climate.humidity * 0.7 + Math.max(0, climate.ridge - 0.5) * 0.55,
        slope: 0,
        centerRiver: false,
        riverWidth: 0,
        riverDepth: 0,
      });
    }
  }

  for (let lz = 0; lz < size; lz += 1) {
    for (let lx = 0; lx < size; lx += 1) {
      const index = hydroIndex(size, lx, lz);
      const cell = cells[index];
      let bestIndex = -1;
      let bestDrop = 0;
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dz === 0) continue;
          const nx = lx + dx;
          const nz = lz + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const neighborIndex = hydroIndex(size, nx, nz);
          const distance = dx !== 0 && dz !== 0 ? Math.SQRT2 : 1;
          const drop = (cell.height - cells[neighborIndex].height) / distance;
          if (drop > bestDrop) {
            bestDrop = drop;
            bestIndex = neighborIndex;
          }
        }
      }
      cell.downstream = bestIndex;
      cell.slope = Math.max(0, bestDrop);
    }
  }

  const byHeight = [...cells.keys()].sort((a, b) => cells[b].height - cells[a].height);
  for (const index of byHeight) {
    const downstream = cells[index].downstream;
    if (downstream >= 0) cells[downstream].accumulation += cells[index].accumulation;
  }

  for (const cell of cells) {
    if (cell.oceanDepth > 0 || cell.downstream < 0) continue;
    const riverAmount = settingScale(worldGen.riverScale);
    const streamThreshold = HYDRO_STREAM_THRESHOLD / riverAmount;
    const riverThreshold = HYDRO_RIVER_THRESHOLD / riverAmount;
    if (cell.accumulation < streamThreshold) continue;
    const riverStrength = THREE.MathUtils.clamp((cell.accumulation - streamThreshold) / Math.max(riverThreshold, 1), 0, 1);
    const slopeNarrowing = cell.slope > 1.6 ? 0.68 : cell.slope < 0.5 ? 1.25 : 1;
    cell.centerRiver = true;
    cell.riverWidth = THREE.MathUtils.clamp((1 + Math.sqrt(cell.accumulation) * 0.28) * slopeNarrowing, 1, 7);
    cell.riverDepth = THREE.MathUtils.clamp(1 + Math.log2(1 + cell.accumulation / riverThreshold) * 1.35 + (cell.slope > 1.8 ? 1 : 0) + riverStrength, 1, 6);
  }

  const patch = { minX, minZ, size, cells };
  hydroPatchCache.set(cacheKey, patch);
  const oldestKey = hydroPatchCache.keys().next().value;
  if (hydroPatchCache.size > 128 && oldestKey) hydroPatchCache.delete(oldestKey);
  return patch;
}

function createHydrologyPatchAt(worldSeed: number, worldGen: WorldGenSettings, x: number, z: number, waterLevel: number): HydrologyPatch | undefined {
  const { chunkX, chunkZ } = toChunkCoord(x, z);
  return createHydrologyPatch(worldSeed, worldGen, chunkX, chunkZ, waterLevel);
}

function hydrologyAt(patch: HydrologyPatch | undefined, x: number, z: number): EffectiveRiverProfile | undefined {
  if (!patch) return undefined;
  const lx = x - patch.minX;
  const lz = z - patch.minZ;
  if (lx < 0 || lz < 0 || lx >= patch.size || lz >= patch.size) return undefined;
  const center = patch.cells[hydroIndex(patch.size, lx, lz)];

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestCell = center;
  const searchRadius = 10;
  for (let dz = -searchRadius; dz <= searchRadius; dz += 1) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      const nx = lx + dx;
      const nz = lz + dz;
      if (nx < 0 || nz < 0 || nx >= patch.size || nz >= patch.size) continue;
      const candidate = patch.cells[hydroIndex(patch.size, nx, nz)];
      if (!candidate.centerRiver) continue;
      const wobble = (seededNoise(17, candidate.x, 0, candidate.z) - 0.5) * 0.35;
      const distance = Math.hypot(dx, dz) + wobble;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCell = candidate;
      }
    }
  }

  const bankWidth = bestCell.riverWidth + 3.2;
  const bed = bestDistance <= bestCell.riverWidth;
  const bank = bestDistance <= bankWidth;
  if (!bank) return { bed: false, bank: false, depth: 0, bankBlend: 0, flowAccumulation: center.accumulation, slope: center.slope, source: 'hydrology' };
  const depth = bed ? Math.max(1, Math.round(bestCell.riverDepth * (1 - bestDistance / Math.max(bestCell.riverWidth + 0.1, 0.1)))) : 0;
  return {
    bed,
    bank,
    depth,
    bankBlend: THREE.MathUtils.clamp((bankWidth - bestDistance) / Math.max(bankWidth - bestCell.riverWidth, 0.1), 0, 1),
    flowAccumulation: bestCell.accumulation,
    slope: bestCell.slope,
    source: 'hydrology',
  };
}

function resolveDerivedBiome(
  baseBiome: BaseBiome,
  climate: WorldClimateSample,
  river: EffectiveRiverProfile,
  height: number,
  waterLevel: number,
): Biome {
  if (climate.oceanDepth >= 5) return climate.temperature < 0.28 ? 'frozenOcean' : 'deepOcean';
  if (climate.lakeDepth > 0 && height < waterLevel) return 'river';
  if (climate.oceanDepth > 0 || height < waterLevel) return climate.temperature < 0.24 ? 'frozenOcean' : 'ocean';
  if (river.bed) return 'river';
  if (height <= waterLevel + 1) return climate.erosion > 0.55 ? 'stonyShore' : 'beach';
  if (height >= 34) return 'snowySlopes';
  if (height >= 24) return climate.erosion > 0.52 ? 'stonyPeaks' : 'mountainMeadow';
  return baseBiome;
}

export function getWorldDebugSample(worldSeed: number, x: number, z: number, waterLevel: number, flatWorld = false, worldGen?: WorldGenSettings) {
  const climate = sampleWorldClimate(worldSeed, x, z, worldGen);
  const biomeWeights = getBiomeWeights(worldSeed, x, z, 0, climate, biomeCoordScale(worldGen));
  const baseBiome = biomeWeights[0].biome;
  const hydrology = worldGen && !flatWorld ? createHydrologyPatchAt(worldSeed, worldGen, x, z, waterLevel) : undefined;
  const river: EffectiveRiverProfile = flatWorld ? emptyRiverProfile() : hydrologyAt(hydrology, x, z) ?? riverProfile(worldSeed, x, z, worldGen);
  let height = flatWorld ? waterLevel : resolveBaseTerrainHeight(worldSeed, x, z, biomeWeights, worldGen);
  if (!flatWorld && climate.oceanDepth > 0) height = Math.min(height, waterLevel - climate.oceanDepth);
  // Lakes now only occupy naturally low terrain; lake noise no longer carves hills down to water level.
  const allowSurfaceWater = height <= waterLevel + 4;
  const terrainRiver = allowSurfaceWater ? river : emptyRiverProfile();
  if (!flatWorld && terrainRiver.bed) height = Math.floor(Math.min(height - terrainRiver.depth, waterLevel - terrainRiver.depth));
  if (!flatWorld && !terrainRiver.bed && terrainRiver.bank && terrainRiver.bankBlend > 0.5 && height > waterLevel + 1) height -= 1;
  if (!flatWorld && !terrainRiver.bed && terrainRiver.bank) height = Math.max(height, waterLevel);
  const biome = resolveDerivedBiome(baseBiome, climate, terrainRiver, height, waterLevel);
  return { climate, baseBiome, biome, height, river: terrainRiver };
}

function getRiverAt(worldSeed: number, x: number, z: number, waterLevel: number, worldGen: WorldGenSettings | undefined) {
  const hydrology = worldGen ? createHydrologyPatchAt(worldSeed, worldGen, x, z, waterLevel) : undefined;
  return hydrologyAt(hydrology, x, z) ?? riverProfile(worldSeed, x, z, worldGen);
}

function findNearbyRiver(worldSeed: number, preferredX: number, preferredZ: number, worldRadius: number | null, waterLevel: number, worldGen: WorldGenSettings | undefined) {
  const center = toChunkCoord(preferredX, preferredZ);
  for (let r = 0; r <= 12; r += 1) {
    for (let dcx = -r; dcx <= r; dcx += 1) {
      for (let dcz = -r; dcz <= r; dcz += 1) {
        if (r > 0 && Math.abs(dcx) < r && Math.abs(dcz) < r) continue;
        const chunkX = center.chunkX + dcx;
        const chunkZ = center.chunkZ + dcz;
        const hydrology = worldGen ? createHydrologyPatch(worldSeed, worldGen, chunkX, chunkZ, waterLevel) : undefined;
        const minX = chunkX * CHUNK_SIZE;
        const minZ = chunkZ * CHUNK_SIZE;
        for (let lx = 0; lx < CHUNK_SIZE; lx += 2) {
          for (let lz = 0; lz < CHUNK_SIZE; lz += 2) {
            const x = minX + lx;
            const z = minZ + lz;
            if (worldRadius != null && Math.hypot(x, z) >= worldRadius - 3) continue;
            const river = hydrologyAt(hydrology, x, z) ?? riverProfile(worldSeed, x, z, worldGen);
            if (!river.bed) continue;
            const h = worldGen ? baseHydroHeight(worldSeed, worldGen, x, z, waterLevel).height : getSurfaceHeight(worldSeed, x, z, worldRadius, waterLevel, false, worldGen);
            if (h <= waterLevel + 4) return { x, z };
          }
        }
      }
    }
  }
  return null;
}

export function findSafeSpawnPoint(
  worldSeed: number,
  preferredX: number,
  preferredZ: number,
  worldRadius: number | null,
  waterLevel: number,
  worldGen?: WorldGenSettings,
): { x: number; z: number } {
  const riverAnchor = findNearbyRiver(worldSeed, preferredX, preferredZ, worldRadius, waterLevel, worldGen);
  if (riverAnchor) {
    for (let r = 4; r <= 48; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dz = -r; dz <= r; dz += 1) {
          if (r > 0 && Math.abs(dx) < r && Math.abs(dz) < r) continue;
          const x = riverAnchor.x + dx;
          const z = riverAnchor.z + dz;
          if (worldRadius != null && Math.hypot(x, z) >= worldRadius - 3) continue;
          if (getRiverAt(worldSeed, x, z, waterLevel, worldGen).bed) continue;
          const h = getSurfaceHeight(worldSeed, x, z, worldRadius, waterLevel, false, worldGen);
          if (h > waterLevel) return { x, z };
        }
      }
    }
  }

  for (let r = 0; r <= 40; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        if (r > 0 && Math.abs(dx) < r && Math.abs(dz) < r) continue;
        const x = preferredX + dx;
        const z = preferredZ + dz;
        if (worldRadius != null && Math.hypot(x, z) >= worldRadius - 3) continue;
        const river = getRiverAt(worldSeed, x, z, waterLevel, worldGen);
        if (river.bed) continue;
        const h = getSurfaceHeight(worldSeed, x, z, worldRadius, waterLevel, false, worldGen);
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

function mountainHeightBonus(worldSeed: number, x: number, z: number, worldGen?: WorldGenSettings) {
  const strength = mountainStrength(worldGen);
  const rangeMask = THREE.MathUtils.smoothstep(fbm2D(worldSeed + 1300, x * 0.0032 / strength, z * 0.0032 / strength, 4), 0.52, 0.82);
  const ridgeNoise = Math.abs(fbm2D(worldSeed + 1310, x * 0.012 / strength, z * 0.012 / strength, 4) - 0.5) * 2;
  const ridge = Math.max(0, 1 - ridgeNoise * 1.95);
  const erosion = fbm2D(worldSeed + 1320, x * 0.018 / strength, z * 0.018 / strength, 3);
  const carved = THREE.MathUtils.lerp(0.62, 1.02, erosion);
  const foothills = Math.max(0, rangeMask - 0.12) * fbm2D(worldSeed + 1330, x * 0.016 / strength, z * 0.016 / strength, 2) * 7;
  return (foothills + rangeMask * ridge * carved * 26) * strength;
}

function resolveBaseTerrainHeight(worldSeed: number, x: number, z: number, biomeWeights: BiomeWeight[], worldGen?: WorldGenSettings) {
  let heightSum = 0;
  let weightSum = 0;
  for (const w of biomeWeights.slice(0, 3)) {
    if (w.weight > 0.05) {
      const cfg = biomeConfig[w.biome];
      heightSum += w.weight * (cfg.baseHeight + fbm2D(worldSeed + 500, x * 0.022, z * 0.022, 2) * cfg.heightAmp);
      weightSum += w.weight;
    }
  }

  const lowland = weightSum > 0 ? heightSum / weightSum : 1.5;
  const broadRelief = (fbm2D(worldSeed + 1340, x * 0.0035, z * 0.0035, 3) - 0.44) * 3.5;
  const mountain = mountainHeightBonus(worldSeed, x, z, worldGen);
  return Math.floor(lowland + broadRelief + mountain);
}

// ──── Surface height (matches generateWorld logic) ────

export function getSurfaceHeight(
  worldSeed: number, x: number, z: number,
  worldRadius: number | null, waterLevel: number,
  flatWorld = false,
  worldGen?: WorldGenSettings,
): number {
  if (flatWorld) return waterLevel;

  const distance = Math.hypot(x, z);
  const climate = sampleWorldClimate(worldSeed, x, z, worldGen);
  const biomeWeights = getBiomeWeights(worldSeed, x, z, 24, climate, biomeCoordScale(worldGen));
  const hydrology = worldGen ? createHydrologyPatchAt(worldSeed, worldGen, x, z, waterLevel) : undefined;
  const river: EffectiveRiverProfile = hydrologyAt(hydrology, x, z) ?? riverProfile(worldSeed, x, z, worldGen);

  let h = resolveBaseTerrainHeight(worldSeed, x, z, biomeWeights, worldGen);

  const seaDepth = oceanDepth(worldSeed, x, z, worldGen);
  if (seaDepth > 0) h = Math.min(h, waterLevel - seaDepth);

  if (worldRadius != null) {
    const edgeDist = worldRadius - distance;
    if (edgeDist < 6) {
      h = waterLevel + Math.floor(((h - waterLevel) * edgeDist) / 6);
    }
  }

  const allowSurfaceWater = h <= waterLevel + 4;
  if (allowSurfaceWater && river.bed) h = Math.floor(Math.min(h - river.depth, waterLevel - river.depth));
  if (allowSurfaceWater && !river.bed && river.bank && river.bankBlend > 0.5 && h > waterLevel + 1) h -= 1;
  if (allowSurfaceWater && !river.bed && river.bank) h = Math.max(h, waterLevel);

  return h;
}

// ──── Cave noise ────

function caveProfile(worldSeed: number, x: number, y: number, z: number, surfaceHeight: number) {
  const depthBelowSurface = surfaceHeight - y;
  if (depthBelowSurface < 13 || y > surfaceHeight - 8) return { open: false, aquifer: false };
  const depthFactor = THREE.MathUtils.clamp((depthBelowSurface - 12) / 38, 0, 1);
  const cavern = fbm3D(worldSeed + 300, x * 0.045, y * 0.06, z * 0.045, 3);
  const tunnelA = Math.abs(fbm3D(worldSeed + 400, x * 0.095, y * 0.055, z * 0.095, 3) - 0.5);
  const tunnelB = Math.abs(fbm3D(worldSeed + 410, x * 0.055, y * 0.11, z * 0.055, 3) - 0.5);
  const fissure = Math.abs(fbm2D(worldSeed + 420, x * 0.028, z * 0.028, 3) - 0.5);
  const cavernOpen = cavern > 0.83 - depthFactor * 0.055;
  const tunnelOpen = tunnelA < 0.032 + depthFactor * 0.017 || tunnelB < 0.027 + depthFactor * 0.013;
  const fissureOpen = fissure < 0.007 && y < -6 && y > -26 && depthBelowSurface > 18;
  const aquifer = false;
  return { open: cavernOpen || tunnelOpen || fissureOpen, aquifer };
}

function undergroundBlockType(worldSeed: number, x: number, y: number, z: number, surfaceHeight: number, biome: Biome): BlockType {
  const layerNoise = seededNoise(worldSeed, x, y, z);
  if (y <= -24) return layerNoise > 0.8 ? 'tuff' : 'deepslate';
  if (y <= -14) return layerNoise > 0.84 ? 'tuff' : layerNoise > 0.12 ? 'deepslate' : 'stone';
  if (y <= -8) return layerNoise > 0.88 ? 'tuff' : layerNoise > 0.35 ? 'stone' : 'deepslate';
  if ((biome === 'stonyPeaks' || biome === 'snowySlopes') && surfaceHeight - y > 4 && layerNoise > 0.7) return 'tuff';
  return 'stone';
}

function caveDecorProfile(worldSeed: number, x: number, y: number, z: number) {
  const lush = fbm3D(worldSeed + 440, x * 0.026, y * 0.045, z * 0.026, 2);
  const drip = fbm3D(worldSeed + 450, x * 0.032, y * 0.05, z * 0.032, 2);
  return {
    lush: y < 10 && y > -12 && lush > 0.66,
    dripstone: y < 18 && drip > 0.69,
  };
}

function decorateCaveColumn(ctx: WorldGenContext, worldSeed: number, x: number, z: number, surfaceHeight: number, generatedWaterKeys: Set<string>) {
  for (let y = ctx.worldBottom + 2; y < surfaceHeight - 2; y += 1) {
    const depthBelowSurface = surfaceHeight - y;
    if (depthBelowSurface < 12) continue;
    const currentKey = `${x},${y},${z}`;
    if (ctx.blocks.has(currentKey) || generatedWaterKeys.has(currentKey)) continue;
    const belowKey = `${x},${y - 1},${z}`;
    const aboveKey = `${x},${y + 1},${z}`;
    const below = ctx.blocks.get(belowKey)?.type;
    const above = ctx.blocks.get(aboveKey)?.type;
    const profile = caveDecorProfile(worldSeed, x, y, z);
    const roll = seededNoise(worldSeed, x + 47, y, z - 47);

    if (profile.lush && below && !generatedWaterKeys.has(belowKey)) {
      if (roll > 0.985) ctx.addBlock(x, y, z, 'mossBlock');
      else if (roll > 0.965 && y <= -2) ctx.addBlock(x, y, z, 'clay');
    }

    if (profile.dripstone && above && roll < 0.018) {
      ctx.addBlock(x, y, z, 'dripstone');
    } else if (profile.dripstone && below && roll > 0.992) {
      ctx.addBlock(x, y, z, 'calcite');
    }
  }
}

function getWorldGenDensityConfig(worldGen: WorldGenSettings): WorldGenDensityConfig {
  return {
    treeDensityMultiplier: worldGen.treeDensity === 'none' ? 0
      : worldGen.treeDensity === 'sparse' ? 2
      : worldGen.treeDensity === 'dense' ? 0.5
      : 1,
    structureDensityOffset: worldGen.structureDensity === 'none' ? 1
      : worldGen.structureDensity === 'sparse' ? 0.05
      : worldGen.structureDensity === 'dense' ? -0.05
      : 0,
    oreDensityMultiplier: worldGen.oreDensity === 'none' ? 0
      : worldGen.oreDensity === 'sparse' ? 2
      : worldGen.oreDensity === 'rich' ? 0.5
      : 1,
    plantDensityOffset: worldGen.plantDensity === 'none' ? 1
      : worldGen.plantDensity === 'sparse' ? 0.06
      : worldGen.plantDensity === 'lush' ? -0.06
      : 0,
  };
}

function getColumnBiomeData(worldSeed: number, worldGen: WorldGenSettings, x: number, z: number) {
  const climate = sampleWorldClimate(worldSeed, x, z, worldGen);
  const biomeWeights = getBiomeWeights(worldSeed, x, z, 24, climate, biomeCoordScale(worldGen));
  const baseBiome = biomeWeights[0].biome;
  const config = biomeConfig[baseBiome];
  return { climate, biomeWeights, baseBiome, config };
}

function getColumnRiver(worldSeed: number, worldGen: WorldGenSettings, x: number, z: number, hydrology?: HydrologyPatch): EffectiveRiverProfile {
  const hydroRiver = hydrologyAt(hydrology, x, z);
  if (hydroRiver) return hydroRiver;
  return worldGen.flatWorld ? emptyRiverProfile() : riverProfile(worldSeed, x, z, worldGen);
}

function isWithinFiniteWorldRadius(ctx: WorldGenContext, x: number, z: number) {
  if (ctx.worldRadius == null) return true;
  const distance = Math.hypot(x, z);
  return distance <= ctx.worldRadius + Math.sin(x * z) * 0.8;
}

function resolveColumnHeight(
  ctx: WorldGenContext,
  worldGen: WorldGenSettings,
  worldSeed: number,
  x: number,
  z: number,
  biomeWeights: BiomeWeight[],
  river: EffectiveRiverProfile,
): number {
  const distance = Math.hypot(x, z);
  if (worldGen.flatWorld) return ctx.waterLevel;

  let h = resolveBaseTerrainHeight(worldSeed, x, z, biomeWeights, worldGen);
  const seaDepth = oceanDepth(worldSeed, x, z, worldGen);
  if (seaDepth > 0) h = Math.min(h, ctx.waterLevel - seaDepth);
  // Lakes now only fill natural depressions instead of cutting elevated terrain down to water level.

  if (ctx.worldRadius != null) {
    const edgeDist = ctx.worldRadius - distance;
    if (edgeDist < 6) {
      h = ctx.waterLevel + Math.floor(((h - ctx.waterLevel) * edgeDist) / 6);
    }
  }

  const allowSurfaceWater = h <= ctx.waterLevel + 4;
  if (allowSurfaceWater && river.bed) h = Math.floor(Math.min(h - river.depth, ctx.waterLevel - river.depth));
  if (allowSurfaceWater && !river.bed && river.bank && river.bankBlend > 0.5 && h > ctx.waterLevel + 1) h -= 1;
  if (allowSurfaceWater && !river.bed && river.bank) h = Math.max(h, ctx.waterLevel);
  return h;
}

function getSurfaceBlockType(
  ctx: WorldGenContext,
  x: number,
  y: number,
  z: number,
  h: number,
  biome: Biome,
  baseBiome: BaseBiome,
  config: (typeof biomeConfig)[BaseBiome],
  river: EffectiveRiverProfile,
): BlockType {
  const bankRoll = seededNoise(ctx.worldSeed, x, y, z);
  const isBeach = h <= ctx.waterLevel + 1 && !river.bed;
  const isSeaFloor = h < ctx.waterLevel && !river.bed;

  if (biome === 'deepOcean') return bankRoll > 0.62 ? 'gravel' : bankRoll > 0.24 ? 'clay' : 'tuff';
  if (biome === 'ocean' || biome === 'frozenOcean') return bankRoll > 0.52 ? 'sand' : bankRoll > 0.2 ? 'gravel' : 'clay';
  if (biome === 'river') return bankRoll > 0.38 ? 'sand' : 'gravel';
  if (biome === 'stonyShore') return bankRoll > 0.48 ? 'sand' : 'gravel';
  if (biome === 'beach') return 'sand';
  if (biome === 'snowySlopes') return bankRoll > 0.18 ? 'snow' : 'stone';
  if (biome === 'stonyPeaks') return bankRoll > 0.36 ? 'stone' : 'gravel';
  if (river.bed) return bankRoll > 0.38 ? 'sand' : 'gravel';
  if (isSeaFloor) return bankRoll > 0.32 ? 'sand' : 'gravel';
  if (isBeach) return 'sand';
  if (river.bank && bankRoll < river.bankBlend * 0.58) return 'sand';
  if (h >= 34) return 'snow';
  if (baseBiome === 'desert') return 'sand';
  if (baseBiome === 'snow') return y === h ? 'snow' : 'grass';
  return config.surfaceBlock;
}

const oreFeatureRules: OreFeatureRule[] = [
  { type: 'coalOre', minY: -8, maxY: 40, threshold: 0.965, attempts: 2 },
  { type: 'ironOre', minY: -24, maxY: 34, threshold: 0.97, attempts: 2 },
  { type: 'copperOre', minY: -16, maxY: 28, threshold: 0.974, attempts: 1 },
  { type: 'goldOre', minY: -28, maxY: 12, threshold: 0.982, attempts: 1 },
  { type: 'diamondOre', minY: -30, maxY: -2, threshold: 0.988, attempts: 1 },
  { type: 'emeraldOre', minY: 6, maxY: 44, threshold: 0.986, attempts: 1, biomes: ['mountainMeadow', 'stonyPeaks', 'snowySlopes'] },
];

function generateOreFeatures(
  ctx: WorldGenContext,
  worldSeed: number,
  density: WorldGenDensityConfig,
  x: number,
  z: number,
  surfaceHeight: number,
  biome: Biome,
  river: EffectiveRiverProfile,
) {
  const naturalOreHosts = new Set<BlockType>(['stone', 'deepslate', 'tuff']);
  if (density.oreDensityMultiplier <= 0 || river.bed) return;
  for (const rule of oreFeatureRules) {
    if (rule.biomes && !rule.biomes.includes(biome)) continue;
    const maxY = Math.min(rule.maxY, surfaceHeight - 2);
    if (maxY < rule.minY) continue;
    const threshold = 1 - (1 - rule.threshold) / density.oreDensityMultiplier;
    for (let attempt = 0; attempt < rule.attempts; attempt += 1) {
      const roll = seededNoise(worldSeed, x * 5 + attempt * 17, surfaceHeight * 3, z * 5 - attempt * 13);
      if (roll <= threshold) continue;
      const yRoll = seededNoise(worldSeed, x - attempt * 19, surfaceHeight + attempt * 7, z + attempt * 23);
      const y = Math.round(THREE.MathUtils.lerp(rule.minY, maxY, yRoll));
      const host = ctx.blocks.get(`${x},${y},${z}`)?.type;
      if (!host || !naturalOreHosts.has(host)) continue;
      buildMineralVein(ctx, x, y, z, rule.type, worldSeed, naturalOreHosts);
    }
  }
}

export function generateColumnTerrain(
  ctx: WorldGenContext,
  worldGen: WorldGenSettings,
  worldSeed: number,
  density: WorldGenDensityConfig,
  x: number,
  z: number,
  hydrology?: HydrologyPatch,
) {
  if (!isWithinFiniteWorldRadius(ctx, x, z)) return null;

  const { climate, biomeWeights, baseBiome, config } = getColumnBiomeData(worldSeed, worldGen, x, z);
  const river = getColumnRiver(worldSeed, worldGen, x, z, hydrology);
  const h = resolveColumnHeight(ctx, worldGen, worldSeed, x, z, biomeWeights, river);
  const terrainRiver = h <= ctx.waterLevel + 4 ? river : emptyRiverProfile();
  const biome = resolveDerivedBiome(baseBiome, climate, terrainRiver, h, ctx.waterLevel);
  const generatedWaterKeys = new Set<string>();

  for (let y = ctx.worldBottom; y <= h; y += 1) {
    if (y < h - 2 && y > ctx.worldBottom + 1 && !terrainRiver.bed) {
      const cave = caveProfile(worldSeed, x, y, z, h);
      if (cave.open) {
        if (cave.aquifer) {
          ctx.addBlock(x, y, z, 'water', 0);
          generatedWaterKeys.add(`${x},${y},${z}`);
        }
        continue;
      }
    }

    const surfaceType = getSurfaceBlockType(ctx, x, y, z, h, biome, baseBiome, config, terrainRiver);
    const type = y === ctx.worldBottom ? 'bedrock'
      : y === h ? surfaceType
      : baseBiome === 'desert' ? (y > h - 4 ? 'sand' : 'stone')
      : y > h - 3 ? 'dirt' : undergroundBlockType(worldSeed, x, y, z, h, biome);
    ctx.addBlock(x, y, z, type);
  }

  generateOreFeatures(ctx, worldSeed, density, x, z, h, biome, terrainRiver);

  if (terrainRiver.bed) {
    for (let y = h + 1; y <= ctx.waterLevel; y += 1) {
      ctx.addBlock(x, y, z, 'water', 0, true);
      generatedWaterKeys.add(`${x},${y},${z}`);
    }
  } else if (h < ctx.waterLevel) {
    for (let y = h + 1; y <= ctx.waterLevel; y += 1) {
      ctx.addBlock(x, y, z, 'water', 0, true);
      generatedWaterKeys.add(`${x},${y},${z}`);
    }
  }

  decorateCaveColumn(ctx, worldSeed, x, z, h, generatedWaterKeys);

  return { biome, baseBiome, config, river: terrainRiver, height: h };
}

const surfaceFeatureRules: SurfaceFeatureRule[] = [
  {
    threshold: 0.85,
    baseBiomes: ['snow'],
    build: ({ ctx, x, h, z, worldSeed }) => buildSnowPile(ctx, x, h, z, worldSeed),
  },
  {
    threshold: 0.96,
    biomes: ['mountainMeadow'],
    requirePlantable: true,
    affectedByPlantDensity: true,
    build: ({ ctx, x, h, z, worldSeed }) => addVegetation(ctx, x, h, z, worldSeed),
  },
  {
    threshold: 0.985,
    baseBiomes: ['desert'],
    build: ({ ctx, x, h, z, worldSeed }) => buildCactus(ctx, x, h, z, worldSeed),
  },
  {
    threshold: 0.985,
    baseBiomes: ['forest'],
    requirePlantable: true,
    build: ({ ctx, x, h, z, worldSeed }) => buildMushroomCluster(ctx, x, h, z, worldSeed),
  },
  {
    threshold: 0.997,
    requirePlantable: true,
    build: ({ ctx, x, h, z, worldSeed, baseBiome }) => {
      if (baseBiome !== 'desert' && baseBiome !== 'snow') buildPumpkinPatch(ctx, x, h, z, worldSeed);
    },
  },
  {
    threshold: 1.1,
    requirePlantable: true,
    avoidRiverBank: true,
    build: ({ ctx, x, h, z, worldSeed }) => buildPond(ctx, x, h, z, worldSeed),
  },
  {
    threshold: 0.985,
    requirePlantable: true,
    affectedByPlantDensity: true,
    build: ({ ctx, x, h, z, worldSeed }) => addVegetation(ctx, x, h, z, worldSeed),
  },
];

const treeFeatureRules: TreeFeatureRule[] = [
  { biomes: ['mountainMeadow'], minDistanceFromSpawn: 12, density: 0.996, types: ['oak', 'spruce'] },
  { baseBiomes: ['jungle'], minDistanceFromSpawn: 8, density: 0.975, types: ['jungle'] },
  { baseBiomes: ['forest'], minDistanceFromSpawn: 8, density: 0.985, types: ['oak', 'spruce', 'cherry'] },
  { baseBiomes: ['taiga'], minDistanceFromSpawn: 8, density: 0.98, types: ['spruce'] },
  { baseBiomes: ['snow'], minDistanceFromSpawn: 10, density: 0.99, types: ['spruce'] },
  { baseBiomes: ['savanna'], minDistanceFromSpawn: 8, density: 0.992, types: ['oak'] },
  { baseBiomes: ['plains'], minDistanceFromSpawn: 8, density: 0.994, types: ['oak'] },
];

function buildTreeType(feature: ColumnFeatureContext, type: TreeFeatureRule['types'][number]) {
  if (type === 'oak') buildTree(feature.ctx, feature.x, feature.h, feature.z, feature.worldSeed);
  else if (type === 'jungle') buildJungleTree(feature.ctx, feature.x, feature.h, feature.z, feature.worldSeed);
  else if (type === 'cherry') buildCherryTree(feature.ctx, feature.x, feature.h, feature.z, feature.worldSeed);
  else if (type === 'spruce') buildSpruceTree(feature.ctx, feature.x, feature.h, feature.z, feature.worldSeed);
}

function applyTreeFeatureRules(feature: ColumnFeatureContext, density: WorldGenDensityConfig) {
  if (density.treeDensityMultiplier <= 0) return;
  if (feature.river.bank || feature.river.bed) return;
  if (feature.biome === 'beach' || feature.biome === 'stonyShore' || feature.biome === 'ocean' || feature.biome === 'deepOcean' || feature.biome === 'frozenOcean' || feature.biome === 'stonyPeaks' || feature.biome === 'snowySlopes') return;

  const distance = Math.hypot(feature.x, feature.z);
  for (const rule of treeFeatureRules) {
    if (rule.biomes && !rule.biomes.includes(feature.biome)) continue;
    if (rule.baseBiomes && !rule.baseBiomes.includes(feature.baseBiome)) continue;
    if (distance <= (rule.minDistanceFromSpawn ?? 0)) continue;
    const treeNoise = seededNoise(feature.worldSeed, feature.x, feature.h, feature.z);
    const treeThreshold = 1 - (1 - rule.density) / density.treeDensityMultiplier;
    if (treeNoise > treeThreshold) {
      const treeType = rule.types[Math.floor(seededNoise(feature.worldSeed, feature.x, feature.h + 1, feature.z) * rule.types.length)];
      buildTreeType(feature, treeType);
      return;
    }
    if (seededNoise(feature.worldSeed, feature.x + 3, feature.h, feature.z - 5) > 0.999) {
      buildFallenLog(feature.ctx, feature.x, feature.h, feature.z, feature.worldSeed);
      return;
    }
    if (seededNoise(feature.worldSeed, feature.x - 7, feature.h, feature.z + 11) > 0.9995) {
      buildBush(feature.ctx, feature.x, feature.h, feature.z, feature.worldSeed);
      return;
    }
    return;
  }
}

function buildUnderwaterRock(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const height = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  const material: BlockType = 'mossBlock';
  for (let dy = 1; dy <= height; dy += 1) ctx.addBlock(x, y + dy, z, material);
  if (height >= 2 && seededNoise(worldSeed, x - 5, y, z + 5) > 0.62) ctx.addBlock(x + 1, y + 1, z, material);
  if (height >= 2 && seededNoise(worldSeed, x + 7, y, z - 3) > 0.62) ctx.addBlock(x, y + 1, z - 1, material);
}

function buildOceanFloorFeature(feature: ColumnFeatureContext) {
  const { ctx, worldSeed, x, h, z, biome } = feature;
  const floorNoise = seededNoise(worldSeed, x + 31, h, z - 31);
  if ((biome === 'ocean' || biome === 'frozenOcean') && floorNoise > 0.985) {
    buildUnderwaterRock(ctx, x, h, z, worldSeed);
  } else if (biome === 'deepOcean' && floorNoise > 0.992) {
    ctx.addBlock(x, h + 1, z, 'dripstone');
  }
}

function applySurfaceFeatureRules(feature: ColumnFeatureContext, density: WorldGenDensityConfig) {
  const structNoise = seededNoise(feature.worldSeed, feature.x + 11, feature.h, feature.z - 7);
  for (const rule of surfaceFeatureRules) {
    if (rule.biomes && !rule.biomes.includes(feature.biome)) continue;
    if (rule.baseBiomes && !rule.baseBiomes.includes(feature.baseBiome)) continue;
    if (rule.requirePlantable && !feature.isPlantable) continue;
    if (rule.avoidRiverBank && (feature.river.bank || feature.river.bed)) continue;
    const densityOffset = density.structureDensityOffset + (rule.affectedByPlantDensity ? density.plantDensityOffset : 0);
    if (structNoise <= rule.threshold + densityOffset) continue;
    rule.build(feature);
    return;
  }
}

export function populateColumn(
  ctx: WorldGenContext,
  worldGen: WorldGenSettings,
  worldSeed: number,
  density: WorldGenDensityConfig,
  x: number,
  z: number,
  column: { biome: Biome; baseBiome: BaseBiome; config: (typeof biomeConfig)[BaseBiome]; river: EffectiveRiverProfile; height: number },
) {
  const { biome, baseBiome, river, height: h } = column;

  const surfaceType = ctx.blocks.get(`${x},${h},${z}`)?.type;
  const isPlantable = surfaceType === 'grass' || surfaceType === 'dirt';
  const feature = { ctx, worldSeed, x, z, h, biome, baseBiome, surfaceType, isPlantable, river };

  if (biome === 'ocean' || biome === 'deepOcean' || biome === 'frozenOcean') {
    buildOceanFloorFeature(feature);
    return;
  }

  if (river.bed) return;
  applyTreeFeatureRules(feature, density);
  if (h < ctx.waterLevel || worldGen.structureDensity === 'none') return;
  applySurfaceFeatureRules(feature, density);
}

export function generateChunk(
  ctx: WorldGenContext,
  worldGen: WorldGenSettings,
  worldSeed: number,
  chunkX: number,
  chunkZ: number,
) {
  const density = getWorldGenDensityConfig(worldGen);
  const hydrology = createHydrologyPatch(worldSeed, worldGen, chunkX, chunkZ, ctx.waterLevel);
  const populatedColumns: Array<{
    x: number;
    z: number;
    column: { biome: Biome; baseBiome: BaseBiome; config: (typeof biomeConfig)[BaseBiome]; river: EffectiveRiverProfile; height: number };
  }> = [];

  forEachChunkCell(chunkX, chunkZ, (x, z) => {
    const column = generateColumnTerrain(ctx, worldGen, worldSeed, density, x, z, hydrology);
    if (!column) return;
    populatedColumns.push({ x, z, column });
  });

  for (const entry of populatedColumns) {
    populateColumn(ctx, worldGen, worldSeed, density, entry.x, entry.z, entry.column);
  }

  return {
    chunkX,
    chunkZ,
    blockSpan: CHUNK_SIZE * CHUNK_SIZE,
    generatedColumns: populatedColumns.length,
  };
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
  const count = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
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
        ctx.addBlock(x + dx, y, z + dz, 'dirt');
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

export function buildMineralVein(ctx: WorldGenContext, x: number, y: number, z: number, type: BlockType, worldSeed: number, replaceableHosts?: Set<BlockType>) {
  const size = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dx = 0; dx < size; dx += 1) {
    for (let dy = 0; dy < size; dy += 1) {
      for (let dz = 0; dz < size; dz += 1) {
        if (seededNoise(worldSeed, x + dx, y + dy, z + dz) > 0.6) {
          if (replaceableHosts) {
            const host = ctx.blocks.get(`${x + dx},${y + dy},${z + dz}`)?.type;
            if (!host || !replaceableHosts.has(host)) continue;
          }
          ctx.addBlock(x + dx, y + dy, z + dz, type);
        }
      }
    }
  }
}

export function addVegetation(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const isRiverBed = (wx: number, wz: number) => riverProfile(worldSeed, wx, wz).bed;
  const isRiverBank = (wx: number, wz: number) => riverProfile(worldSeed, wx, wz).bank;
  if (isRiverBed(x, z) || seededNoise(worldSeed, x, y, z) < 0.82) return;
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
    const generationRadius = ctx.worldRadius ?? 80;

    for (let x = -generationRadius; x <= generationRadius; x += 1) {
      for (let z = -generationRadius; z <= generationRadius; z += 1) {
        xCoords.push(x);
        zCoords.push(z);
      }
    }

    let index = 0;
    const totalBlocks = xCoords.length;

    const density = getWorldGenDensityConfig(worldGen);

    function processBatch() {
      const endIndex = Math.min(index + batchSize, totalBlocks);

      for (let i = index; i < endIndex; i += 1) {
        const x = xCoords[i];
        const z = zCoords[i];
        const hydrology = createHydrologyPatchAt(worldSeed, worldGen, x, z, ctx.waterLevel);
        const column = generateColumnTerrain(ctx, worldGen, worldSeed, density, x, z, hydrology);
        if (!column) continue;
        populateColumn(ctx, worldGen, worldSeed, density, x, z, column);
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
