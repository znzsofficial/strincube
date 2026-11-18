import { chunkCoord, chunkKey, type Chunk } from './voxel';
import { World } from './world';

export interface ChunkSource {
  generate(x: number, z: number, signal: AbortSignal): Promise<Chunk>;
  dispose(): void;
}
type Request = { x: number; z: number; distance: number };

/** One in-flight chunk. No unbounded worker queue or stale work after a teleport. */
export class ChunkStream {
  readonly world: World;
  private source: ChunkSource;
  private lifetime = new AbortController();
  private queue: Request[] = [];
  private desired = new Set<string>();
  private center = '';
  private flight?: Promise<void>;
  private preparing = false;
  private failure?: Error;
  constructor(world: World, source?: ChunkSource) {
    this.world = world;
    this.source = source ?? {
      generate: async (x, z, signal) => {
        signal.throwIfAborted();
        return world.generator.generate(x, z);
      },
      dispose() {},
    };
  }
  private area(x: number, z: number, radius: number): Request[] {
    const cx = chunkCoord(x),
      cz = chunkCoord(z),
      result: Request[] = [];
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        result.push({ x: cx + dx, z: cz + dz, distance: dx * dx + dz * dz });
      }
    return result.sort((a, b) => a.distance - b.distance);
  }
  requests(x: number, z: number, radius: number) {
    return this.area(x, z, radius).filter((r) => !this.world.getChunk(r.x, r.z));
  }
  tick(x: number, z: number, radius: number) {
    if (this.lifetime.signal.aborted || this.preparing || this.failure) return;
    const cx = chunkCoord(x),
      cz = chunkCoord(z),
      key = `${cx},${cz}:${radius}`;
    if (key !== this.center) {
      this.center = key;
      const area = this.area(x, z, radius);
      this.desired = new Set(area.map((r) => chunkKey(r.x, r.z)));
      this.queue = area.filter((r) => !this.world.getChunk(r.x, r.z));
      for (const chunk of this.world.loaded) {
        if (Math.max(Math.abs(cx - chunk.x), Math.abs(cz - chunk.z)) > radius + 1)
          this.world.unload(chunk.x, chunk.z);
      }
    }
    // Let meshing catch up rather than flooding the main thread with installations.
    if (this.flight || this.world.dirty.size > 16) return;
    let request = this.queue.shift();
    while (request && this.world.getChunk(request.x, request.z)) request = this.queue.shift();
    if (!request) return;
    const job = request;
    this.flight = this.source
      .generate(job.x, job.z, this.lifetime.signal)
      .then((chunk) => {
        if (this.lifetime.signal.aborted || !this.desired.has(chunkKey(job.x, job.z))) return;
        this.accept(job, chunk);
      })
      .catch((error) => {
        if (!this.lifetime.signal.aborted)
          this.failure = error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        this.flight = undefined;
      });
  }
  private accept(request: Request, chunk: Chunk) {
    if (chunk.x !== request.x || chunk.z !== request.z) throw new Error('区块生成结果坐标不匹配');
    this.world.install(chunk);
  }
  get error() {
    return this.failure;
  }
  get pending() {
    return this.flight !== undefined;
  }
  get queuedCount() {
    return this.queue.length;
  }
  async idle() {
    await this.flight;
  }
  async prepare(
    x: number,
    z: number,
    radius: number,
    progress: (done: number, total: number) => void,
    signal?: AbortSignal,
  ) {
    if (this.preparing || this.flight) throw new Error('区块加载已在进行');
    const combined = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    combined.throwIfAborted();
    this.preparing = true;
    try {
      const requests = this.requests(x, z, radius);
      for (let i = 0; i < requests.length; i++) {
        combined.throwIfAborted();
        const r = requests[i],
          chunk = await this.source.generate(r.x, r.z, combined);
        combined.throwIfAborted();
        this.accept(r, chunk);
        progress(i + 1, requests.length);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      this.preparing = false;
    }
  }
  dispose() {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.source.dispose();
    this.queue = [];
    this.desired.clear();
  }
}
