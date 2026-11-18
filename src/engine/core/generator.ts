import { defaultWorldGenSettings, getWorldRadius, type WorldGenSettings } from '../types';
import { clamp } from './noise';
import { legacyColumn, VoxelTerrain, type Column } from './voxelTerrain';
import { WatershedSurface } from './watershed';

export type { Column } from './voxelTerrain';
export const GENERATOR = 'terrain-watershed-2';
export const PREVIOUS_GENERATOR = 'terrain-v2.1';
export type TerrainVersion = typeof GENERATOR | typeof PREVIOUS_GENERATOR | 'terrain-v2.2' | 'terrain-watershed-1';
export const supportsTerrain = (v: unknown): v is TerrainVersion =>
  v === GENERATOR || v === PREVIOUS_GENERATOR || v === 'terrain-v2.2' || v === 'terrain-watershed-1';

/** Version selection is per world; workers construct the same sampler. */
export class TerrainGenerator extends VoxelTerrain {
  readonly seed: number;
  readonly settings: WorldGenSettings;
  readonly radius: number | null;
  readonly version: TerrainVersion;
  private readonly surface: (x:number,z:number) => Column;
  protected get hasGroundDetails() { return this.version === GENERATOR && !this.settings.flatWorld; }

  constructor(seed: number, settings: WorldGenSettings, version: TerrainVersion = GENERATOR) {
    super();
    this.version = version;
    this.seed = seed | 0;
    this.settings = { ...defaultWorldGenSettings, ...settings };
    for (const key of ['mountainScale', 'oceanScale', 'riverScale', 'biomeScale'] as const) {
      this.settings[key] = Number.isFinite(this.settings[key]) ? clamp(this.settings[key], 0, 3) : 1;
    }
    this.radius = this.settings.infiniteWorld ? null : clamp(getWorldRadius(this.settings), 30, 200);
    if ((version === GENERATOR || version === 'terrain-watershed-1') && !this.settings.flatWorld) {
      const terrain = new WatershedSurface(this.seed, this.settings, this.radius);
      this.surface = (x,z) => terrain.column(x,z);
    } else this.surface = (x,z) => legacyColumn(this.seed, this.settings, version === PREVIOUS_GENERATOR, x,z);
  }
  inside(x: number, z: number) { return this.radius === null || Math.hypot(x,z) < this.radius; }
  column(x: number, z: number) { return this.surface(x,z); }
}
