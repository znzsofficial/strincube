import { defaultWorldGenSettings, type GameSettings, type WorldGenSettings } from '../types';
import { FixedClock, type Movement } from './clock';
import { GENERATOR, TerrainGenerator } from './generator';
import { findSpawn, Player, type PlayerState } from './player';
import { Simulation, type SimulationState } from './simulation';
import type { ChunkEdit } from './voxel';
import { World } from './world';
import { ChunkStream, type ChunkSource } from './chunkStream';
import { defaultShadowSettings, normalizeShadowSettings } from '../shadowPolicy';

export type WorldState = {
  generator: string;
  edits: ChunkEdit[];
  player: PlayerState;
  simulation?: SimulationState;
};

export function defaultSettings(pixelRatio = 1): GameSettings {
  return {
    mouseSensitivity: 1,
    moveSpeed: 5.4,
    gamepadLookSensitivity: 1,
    daySpeed: 0.004,
    pixelRatio: Math.min(pixelRatio, 1.5),
    shadows: true,
    ...defaultShadowSettings,
    viewDistance: 82,
    modelBrightness: 0.78,
    breakSpeed: 1,
    showFps: false,
    autosave: false,
    timeOfDay: 0.28,
    infiniteWaterSpread: false,
    rendererBackend: 'webgl',
    postProcessing: false,
    bloomStrength: 0.18,
    vignette: false,
    vignetteDarkness: 1,
    filmGrain: false,
    filmNoise: 0.15,
    filmScanlines: 0.05,
  };
}

/** Simulation lifetime independent of canvas, input devices and storage backend. */
export class GameSession {
  readonly world: World;
  readonly stream: ChunkStream;
  readonly simulation: Simulation;
  readonly player: Player;
  readonly settings: GameSettings;
  private clock = new FixedClock();
  private disposed = false;
  private time: number;

  constructor(options: {
    seed: number;
    worldGen?: WorldGenSettings;
    state?: WorldState;
    settings?: Partial<GameSettings>;
    timeOfDay?: number;
    pixelRatio?: number;
    terrainSource?: (generator: TerrainGenerator) => ChunkSource;
  }) {
    if (options.state && options.state.generator !== GENERATOR) {
      throw new Error('此存档的地形生成器版本不受支持');
    }
    this.settings = { ...defaultSettings(options.pixelRatio), ...options.settings, rendererBackend: 'webgl' };
    Object.assign(this.settings, normalizeShadowSettings(this.settings));
    this.time = options.timeOfDay ?? this.settings.timeOfDay;
    this.settings.timeOfDay = this.time;
    this.world = new World(
      new TerrainGenerator(options.seed, options.worldGen ?? defaultWorldGenSettings),
      options.state?.edits,
    );
    this.simulation = new Simulation(this.world, options.state?.simulation);
    this.player = new Player(options.state?.player ?? findSpawn(this.world));
    this.stream = new ChunkStream(this.world, options.terrainSource?.(this.world.generator));
  }

  get timeOfDay() {
    return this.time;
  }

  advance(delta: number, movement: Movement, active: boolean) {
    if (this.disposed) return;
    if (!active || this.player.dead) {
      this.clock.reset();
      return;
    }
    this.clock.advance(delta, movement, (dt, jump) => {
      this.player.update(this.world, dt, movement.x, movement.z, jump, this.settings.moveSpeed);
      this.simulation.tick(dt, this.settings.infiniteWaterSpread);
      this.time = (this.time + this.settings.daySpeed * dt) % 1;
      this.settings.timeOfDay = this.time;
      return !this.player.dead;
    });
  }

  updateSettings(next: Partial<GameSettings>) {
    Object.assign(this.settings, next);
    Object.assign(this.settings, normalizeShadowSettings(this.settings));
    this.settings.rendererBackend = 'webgl';
    if (next.timeOfDay !== undefined) this.time = next.timeOfDay;
  }

  respawn() {
    this.clock.reset();
    this.player.teleport(findSpawn(this.world));
  }

  snapshot(): WorldState {
    if (this.disposed) throw new Error('世界已关闭，无法保存');
    return {
      generator: GENERATOR,
      edits: this.world.snapshot(),
      player: { ...this.player.state },
      simulation: this.simulation.snapshot(),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clock.reset();
    this.stream.dispose();
    this.simulation.dispose();
    this.world.dispose();
  }
}
