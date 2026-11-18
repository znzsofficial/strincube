import {
  BOTTOM,
  TOP,
  cellKey,
  chunkCoord,
  chunkKey,
  isFalling,
  isPlant,
  isSolid,
  neighbors,
  positionOf,
  type Cell,
  type Chunk,
} from './voxel';
import { World } from './world';

type Bomb = { x: number; y: number; z: number; time: number };
export type SimulationState = {
  pending: string[];
  bombs: Bomb[];
  /** A cell waits on one missing chunk at a time; it may discover another on waking. */
  deferred?: { chunk: string; pending: string[] }[];
  timer?: number;
};

const horizontal = neighbors.filter((n) => n[1] === 0);
const UPDATE_BUDGET = 384;
const BOMB_BUDGET = 64;

/** Bounded fixed-step simulation; generated water remains asleep until disturbed. */
export class Simulation {
  private pending = new Set<string>();
  private deferred = new Map<string, Set<string>>();
  private waitingOn = new Map<string, string>();
  private readyChunks = new Set<string>();
  private scans = new Map<string, { x: number; z: number }>();
  private scan: { chunk: Chunk; cells: IterableIterator<[number, Cell]> } | null = null;
  private timer = 0;
  private unsubscribe: () => void;
  private unsubscribeChunk: () => void;
  private bombs = new Set<Bomb>();
  readonly world: World;
  constructor(world: World, state?: SimulationState) {
    this.world = world;
    if (state) {
      this.pending = new Set(state.pending);
      this.bombs = new Set(state.bombs.map((b) => ({ ...b })));
      this.timer = state.timer ?? 0;
      for (const entry of state.deferred ?? []) for (const key of entry.pending) this.defer(key, entry.chunk);
    }
    this.unsubscribeChunk = world.onChunk((chunk) => {
      this.installed(chunk);
    });
    this.unsubscribe = world.subscribe(({ x, y, z }) => {
      this.enqueue(x, y, z);
      for (const [dx, dy, dz] of neighbors) this.enqueue(x + dx, y + dy, z + dz);
    });
    for (const chunk of world.loaded) this.installed(chunk);
  }
  private installed(chunk: Chunk) {
    const key = chunkKey(chunk.x, chunk.z);
    if (this.deferred.has(key)) this.readyChunks.add(key);
    // Do not scan an entire populated chunk in the install callback.
    // Queued scans hold coordinates, not cell maps that would pin evicted chunks.
    this.scans.set(key, { x: chunk.x, z: chunk.z });
  }
  private enqueue(x: number, y: number, z: number) {
    if (y <= BOTTOM || y > TOP || !this.world.generator.inside(x, z)) return;
    this.queue(cellKey(x, y, z));
  }
  private queue(key: string) {
    this.forgetWait(key);
    this.pending.add(key);
  }
  private forgetWait(key: string) {
    const chunk = this.waitingOn.get(key);
    if (chunk === undefined) return;
    const cells = this.deferred.get(chunk)!;
    cells.delete(key);
    if (!cells.size) {
      this.deferred.delete(chunk);
      this.readyChunks.delete(chunk);
    }
    this.waitingOn.delete(key);
  }
  private defer(key: string, chunk: string) {
    this.pending.delete(key);
    if (this.waitingOn.get(key) === chunk) return;
    this.forgetWait(key);
    let cells = this.deferred.get(chunk);
    if (!cells) this.deferred.set(chunk, (cells = new Set()));
    cells.add(key);
    this.waitingOn.set(key, chunk);
  }
  private activate() {
    // Detached/unloaded work is never polled each tick. Only installed chunks wake it.
    for (let i = 0; i < UPDATE_BUDGET && this.readyChunks.size; i++) {
      const chunk = this.readyChunks.values().next().value!;
      const [cx, cz] = chunk.split(',').map(Number);
      if (!this.world.getChunk(cx, cz)) {
        this.readyChunks.delete(chunk);
        continue;
      }
      const cells = this.deferred.get(chunk);
      if (!cells?.size) this.readyChunks.delete(chunk);
      else this.queue(cells.values().next().value!);
    }
    for (let i = 0; i < UPDATE_BUDGET && this.scans.size; i++) {
      const [key, position] = this.scans.entries().next().value!;
      const chunk = this.world.getChunk(position.x, position.z);
      if (!chunk) {
        this.scans.delete(key);
        this.scan = null;
        continue;
      }
      if (this.scan?.chunk !== chunk) this.scan = { chunk, cells: chunk.cells.entries() };
      const scan = this.scan;
      const entry = scan.cells.next();
      if (entry.done) {
        this.scans.delete(key);
        this.scan = null;
        continue;
      }
      const [index, cell] = entry.value;
      if ((cell.type === 'water' && !cell.static) || isFalling(cell)) {
        const p = positionOf(index, scan.chunk.x, scan.chunk.z);
        this.enqueue(p.x, p.y, p.z);
      }
    }
  }
  prime(x: number, y: number, z: number) {
    if (this.world.get(x, y, z)?.type !== 'tnt') return;
    if (this.world.set(x, y, z, null)) this.bombs.add({ x, y, z, time: 2 });
  }
  private blastLoaded(b: Bomb) {
    for (let dx = -3; dx <= 3; dx++)
      for (let dz = -3; dz <= 3; dz++) {
        if (dx * dx + dz * dz > 10 || !this.world.generator.inside(b.x + dx, b.z + dz)) continue;
        if (!this.world.isLoaded(b.x + dx, b.z + dz)) return false;
      }
    return true;
  }
  tick(dt: number, infiniteWater = false) {
    // Round-robin budget: under extreme TNT load, unserviced fuses also pause.
    // Snapshot only this batch so chain-primed TNT starts on the next tick.
    const bombs: Bomb[] = [];
    for (const b of this.bombs) {
      bombs.push(b);
      if (bombs.length === BOMB_BUDGET) break;
    }
    for (const b of bombs) {
      this.bombs.delete(b);
      this.bombs.add(b);
      if (!this.blastLoaded(b)) continue;
      b.time -= dt;
      if (b.time > 0) continue;
      this.bombs.delete(b);
      for (let dx = -3; dx <= 3; dx++)
        for (let dy = -3; dy <= 3; dy++)
          for (let dz = -3; dz <= 3; dz++) {
            if (dx * dx + dy * dy + dz * dz > 10) continue;
            if (b.y + dy < BOTTOM || b.y + dy > TOP || !this.world.generator.inside(b.x + dx, b.z + dz))
              continue;
            const c = this.world.get(b.x + dx, b.y + dy, b.z + dz);
            if (c?.type === 'bedrock') continue;
            if (c?.type === 'tnt') this.prime(b.x + dx, b.y + dy, b.z + dz);
            else this.world.set(b.x + dx, b.y + dy, b.z + dz, null);
          }
    }
    this.timer += dt;
    if (this.timer < 0.15) return;
    this.timer = 0;
    this.activate();
    const keys: string[] = [];
    for (const key of this.pending) {
      keys.push(key);
      this.pending.delete(key);
      if (keys.length === UPDATE_BUDGET) break;
    }
    for (const key of keys) {
      const [x, y, z] = key.split(',').map(Number);
      if (y <= BOTTOM || y > TOP || !this.world.generator.inside(x, z)) continue;
      if (!this.world.isLoaded(x, z)) {
        this.defer(key, chunkKey(chunkCoord(x), chunkCoord(z)));
        continue;
      }
      const cell = this.world.get(x, y, z),
        below = this.world.get(x, y - 1, z);
      if (isFalling(cell) && !isSolid(below)) {
        this.world.set(x, y, z, null);
        this.world.set(x, y - 1, z, cell);
        continue;
      }
      if (cell?.type !== 'water') continue;
      this.water(x, y, z, cell, infiniteWater);
    }
  }
  private water(x: number, y: number, z: number, cell: Cell, infinite: boolean) {
    const world = this.world;
    // Unknown supply is not air. Freeze this cell until its immediate in-world
    // dependencies are resident, including sources blocked from crossing a border.
    for (const [dx, , dz] of horizontal) {
      if (world.generator.inside(x + dx, z + dz) && !world.isLoaded(x + dx, z + dz)) {
        this.defer(cellKey(x, y, z), chunkKey(chunkCoord(x + dx), chunkCoord(z + dz)));
        return;
      }
    }
    if (!cell.source) {
      let supplied = y < TOP && world.get(x, y + 1, z)?.type === 'water' ? 7 : 0;
      for (const [dx, , dz] of horizontal) {
        if (!world.generator.inside(x + dx, z + dz)) continue;
        const n = world.get(x + dx, y, z + dz);
        if (n?.type === 'water') supplied = Math.max(supplied, (n.level ?? 7) - 1);
      }
      if (!supplied) {
        world.set(x, y, z, null);
        return;
      }
      if (supplied !== (cell.level ?? 7)) {
        cell = { ...cell, level: supplied };
        world.set(x, y, z, cell);
      }
    }
    const below = world.get(x, y - 1, z);
    if (y > BOTTOM + 1 && !isSolid(below) && below?.type !== 'water') {
      if (cell.static) world.set(x, y, z, { ...cell, static: false });
      world.set(x, y - 1, z, { type: 'water', level: 7, source: false });
      return;
    }
    const level = (cell.level ?? 7) - 1;
    if (level <= 0) return;
    for (const [dx, , dz] of horizontal) {
      if (!world.generator.inside(x + dx, z + dz)) continue;
      if (!infinite) {
        let supported = false;
        for (let sy = y - 1; sy >= BOTTOM; sy--)
          if (isSolid(world.get(x + dx, sy, z + dz))) {
            supported = true;
            break;
          }
        if (!supported) continue;
      }
      const n = world.get(x + dx, y, z + dz);
      if (!n || isPlant(n.type)) {
        if (cell.static) world.set(x, y, z, { ...cell, static: false });
        world.set(x + dx, y, z + dz, { type: 'water', level, source: false });
      } else if (n.type === 'water' && !n.source && (n.level ?? 7) < level)
        world.set(x + dx, y, z + dz, { ...n, level });
    }
  }
  snapshot(): SimulationState {
    return {
      pending: [...this.pending],
      bombs: [...this.bombs].map((b) => ({ ...b })),
      deferred: [...this.deferred].map(([chunk, cells]) => ({ chunk, pending: [...cells] })),
      timer: this.timer,
    };
  }
  dispose() {
    this.unsubscribe();
    this.unsubscribeChunk();
    this.pending.clear();
    this.deferred.clear();
    this.waitingOn.clear();
    this.readyChunks.clear();
    this.scans.clear();
    this.scan = null;
    this.bombs.clear();
  }
}
