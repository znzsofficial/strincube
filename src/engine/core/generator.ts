import type { BlockType } from '../blocks';
import { defaultWorldGenSettings, getWorldRadius, type WorldGenSettings } from '../types';
import { BOTTOM, CHUNK, SEA, TOP, indexOf, type Cell, type Chunk } from './voxel';
import { clamp, fbm, hash, mix, noise, noise3, smooth } from './noise';

/** This ID is part of the save contract. Changes to output require a new ID. */
export const GENERATOR = 'terrain-v2.1';
export type Column = {
  height: number;
  water: number | null;
  biome: string;
  river: boolean;
  temperature: number;
  humidity: number;
  continentalness: number;
};

export class TerrainGenerator {
  readonly seed: number;
  readonly settings: WorldGenSettings;
  readonly radius: number | null;
  constructor(seed: number, settings: WorldGenSettings) {
    this.seed = seed | 0;
    this.settings = { ...defaultWorldGenSettings, ...settings };
    for (const key of ['mountainScale', 'oceanScale', 'riverScale', 'biomeScale'] as const) {
      this.settings[key] = Number.isFinite(this.settings[key]) ? clamp(this.settings[key], 0, 3) : 1;
    }
    this.radius = this.settings.infiniteWorld ? null : clamp(getWorldRadius(this.settings), 30, 200);
  }
  inside(x: number, z: number) {
    return this.radius === null || Math.hypot(x, z) < this.radius;
  }
  column(x: number, z: number): Column {
    const s = this.seed,
      settings = this.settings;
    if (settings.flatWorld)
      return {
        height: 3,
        water: null,
        biome: 'plains',
        river: false,
        temperature: 0.5,
        humidity: 0.5,
        continentalness: 0.6,
      };
    const scale = 220 * Math.max(0.3, settings.biomeScale);
    const temperature = fbm(s + 31, x / scale, z / scale, 2);
    const humidity = fbm(s + 61, (x + 300) / scale, z / scale, 2);
    const continentalness = fbm(s + 101, x / 300, z / 300, 3);
    const ocean = smooth(0.34, 0.54, continentalness + (1 - settings.oceanScale) * 0.15);
    const hill = fbm(s + 201, x / 70, z / 70);
    const mountain = smooth(0.52, 0.8, noise(s + 301, x / 180, z / 180));
    const ridge = 1 - Math.abs(2 * fbm(s + 401, x / 95, z / 95) - 1);
    // Continuous meandering drainage corridors. Mountains fade before the valley;
    // each connected river has a fixed water datum, never a per-column water height.
    const spacing = 230;
    const warp = (fbm(s + 501, z / 130, 0, 3) - 0.5) * 100;
    const offset = hash(s, 0, 0, 17) * spacing;
    const phase = (x + warp + offset) / spacing;
    const distance = Math.abs(phase - Math.round(phase)) * spacing;
    const width = settings.riverScale <= 0 ? 0 : 3 + settings.riverScale * 2;
    const valley = width ? smooth(width + 2, width + 35, distance) : 1;
    let elevation = mix(
      -12 + hill * 7,
      5 + hill * 7 + mountain * ridge * 45 * settings.mountainScale * valley,
      ocean,
    );
    if (width)
      elevation = mix(
        Math.min(elevation, SEA + 1.5 + Math.max(0, distance - width) * 0.28),
        elevation,
        valley,
      );
    const river = width > 0 && distance < width && ocean > 0.3;
    if (river) elevation = Math.min(elevation, SEA - 1 - 3 * (1 - distance / width));
    const height = Math.max(BOTTOM + 5, Math.min(TOP - 12, Math.floor(elevation)));
    const water = height < SEA ? SEA : null;
    const biome =
      water !== null
        ? river
          ? 'river'
          : 'ocean'
        : height > 37
          ? 'snowyPeaks'
          : temperature < 0.32
            ? 'snow'
            : temperature > 0.63 && humidity < 0.43
              ? 'desert'
              : humidity > 0.61
                ? 'jungle'
                : humidity > 0.46
                  ? 'forest'
                  : 'plains';
    return { height, water, biome, river, temperature, humidity, continentalness };
  }
  generate(cx: number, cz: number): Chunk {
    const cells = new Map<number, Cell>();
    const cache = new Map<string, Column>();
    const sample = (x: number, z: number) => {
      const key = `${x},${z}`;
      let c = cache.get(key);
      if (!c) {
        c = this.column(x, z);
        cache.set(key, c);
      }
      return c;
    };
    const put = (x: number, y: number, z: number, type: BlockType) => {
      if (
        x < cx * CHUNK ||
        x >= (cx + 1) * CHUNK ||
        z < cz * CHUNK ||
        z >= (cz + 1) * CHUNK ||
        !this.inside(x, z) ||
        y > TOP ||
        y <= sample(x, z).height
      )
        return;
      const i = indexOf(x, y, z);
      if (!cells.has(i) || type.endsWith('Log')) cells.set(i, { type });
    };
    for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++)
      for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
        if (!this.inside(x, z)) continue;
        const c = sample(x, z);
        const shore =
          c.height <= SEA + 1 &&
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dz]) => sample(x + dx, z + dz).water !== null);
        for (let y = BOTTOM; y <= c.height; y++) {
          const cave =
            !this.settings.flatWorld &&
            c.water === null &&
            y > BOTTOM + 2 &&
            y < c.height - 5 &&
            Math.abs(noise3(this.seed + 703, x / 22, y / 13, z / 22) - 0.5) < 0.055 &&
            noise3(this.seed + 707, x / 35, y / 19, z / 35) > 0.58;
          if (cave) continue;
          let type: BlockType = y === BOTTOM ? 'bedrock' : y < c.height - 3 ? 'stone' : 'dirt';
          if (y === c.height)
            type =
              c.water !== null || shore || c.biome === 'desert'
                ? 'sand'
                : c.biome === 'snow' || c.biome === 'snowyPeaks'
                  ? 'snow'
                  : 'grass';
          if (type === 'stone' && this.settings.oreDensity !== 'none') {
            const r = hash(this.seed, Math.floor(x / 2), Math.floor(z / 2), Math.floor(y / 2));
            const density =
              this.settings.oreDensity === 'rich'
                ? 0.04
                : this.settings.oreDensity === 'sparse'
                  ? 0.008
                  : 0.02;
            if (r < density)
              type = y < -23 ? 'diamondOre' : y < -16 ? 'goldOre' : y < -8 ? 'ironOre' : 'coalOre';
          }
          cells.set(indexOf(x, y, z), { type });
        }
        if (c.water !== null)
          for (let y = c.height + 1; y <= c.water; y++)
            cells.set(indexOf(x, y, z), { type: 'water', level: 7, source: true, static: true });
        const plantChance =
          this.settings.plantDensity === 'none'
            ? 0
            : this.settings.plantDensity === 'sparse'
              ? 0.012
              : this.settings.plantDensity === 'lush'
                ? 0.1
                : 0.035;
        if (c.water === null && !shore && c.biome !== 'desert' && hash(this.seed, x, z, 711) < plantChance)
          put(x, c.height + 1, z, hash(this.seed, x, z, 712) < 0.2 ? 'poppy' : 'shortGrass');
      }
    // Anchors are chosen on a global grid, including a halo; only the requested
    // chunk is written. Trees crossing boundaries do not depend on load order.
    if (this.settings.treeDensity !== 'none' && !this.settings.flatWorld) {
      for (let gx = Math.floor((cx * CHUNK - 5) / 8); gx <= Math.floor(((cx + 1) * CHUNK + 5) / 8); gx++)
        for (let gz = Math.floor((cz * CHUNK - 5) / 8); gz <= Math.floor(((cz + 1) * CHUNK + 5) / 8); gz++) {
          const x = gx * 8 + Math.floor(hash(this.seed, gx, gz, 1) * 6),
            z = gz * 8 + Math.floor(hash(this.seed, gx, gz, 2) * 6);
          const c = sample(x, z);
          const chance =
            (c.biome === 'forest' || c.biome === 'jungle' ? 0.65 : 0.12) *
            (this.settings.treeDensity === 'dense' ? 1.5 : this.settings.treeDensity === 'sparse' ? 0.4 : 1);
          if (
            c.water !== null ||
            c.height <= SEA + 2 ||
            c.biome === 'desert' ||
            c.biome === 'snowyPeaks' ||
            hash(this.seed, gx, gz, 3) > chance
          )
            continue;
          if (
            Math.max(
              ...[-2, 2].flatMap((dx) =>
                [-2, 2].map((dz) => Math.abs(sample(x + dx, z + dz).height - c.height)),
              ),
            ) > 2
          )
            continue;
          const h = 4 + Math.floor(hash(this.seed, gx, gz, 4) * 3);
          const leaf: BlockType =
            c.biome === 'snow' ? 'spruceLeaves' : c.biome === 'jungle' ? 'jungleLeaves' : 'leaves';
          for (let dy = h - 2; dy <= h + 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              for (let dz = -2; dz <= 2; dz++)
                if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - h) <= 4)
                  put(x + dx, c.height + dy, z + dz, leaf);
          for (let dy = 1; dy <= h; dy++)
            put(x, c.height + dy, z, c.biome === 'snow' ? 'spruceLog' : 'oakLog');
        }
    }
    if (this.settings.structureDensity !== 'none') {
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++)
        for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
          const c = sample(x, z),
            rate =
              this.settings.structureDensity === 'dense'
                ? 0.008
                : this.settings.structureDensity === 'sparse'
                  ? 0.001
                  : 0.003;
          if (c.water === null && c.height > SEA + 2 && hash(this.seed, x, z, 901) < rate)
            put(x, c.height + 1, z, c.biome === 'desert' ? 'cactus' : 'pumpkin');
        }
    }
    return { x: cx, z: cz, cells };
  }
}
