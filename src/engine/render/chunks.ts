import * as THREE from 'three';
import { blockMaterials, materialIndexFor, createItemFrameWithItemTexture, blockIconUrls } from '../blocks';
import type { World } from '../core/world';
import { chunkCoord, type Chunk } from '../core/voxel';
import { buildMesh, meshFaces, meshResultTransfers, type MeshPart } from '../core/meshBuilder';
import { captureMeshSnapshot, MeshSnapshotGuard, meshSnapshotTransfers } from '../core/meshSnapshot';
import type { MeshReply, MeshWorkerLike } from '../workers/meshProtocol';
import { TerrainMaterialBatching } from './materialBatching';

const normals = meshFaces.map((face) => new THREE.Vector3(...(face.n as [number, number, number])));
const materialCache = new Map<Parameters<typeof materialIndexFor>[0], number[]>();
function materialsFor(type: Parameters<typeof materialIndexFor>[0]) {
  let indices = materialCache.get(type);
  if (!indices) {
    indices = normals.map((normal) => materialIndexFor(type, normal));
    materialCache.set(type, indices);
  }
  return indices;
}
export type ChunkRendererOptions = {
  workerFactory?: (() => MeshWorkerLike) | null;
  workerTimeoutMs?: number;
  /** Disable for fixed-scene A/B measurements using the original material-per-mesh path. */
  materialBatching?: boolean;
};
type Job = {
  id: number;
  guard: MeshSnapshotGuard;
  ready?: MeshPart[];
  timer?: ReturnType<typeof setTimeout>;
};

export class ChunkRenderer {
  private groups = new Map<string, THREE.Group>();
  private materials: THREE.Material[];
  private contactMaterials = new Map<number, THREE.Material>();
  private batching?: TerrainMaterialBatching;
  private revision = 0;
  private frames = new Map<string, THREE.MeshLambertMaterial>();
  private worker?: MeshWorkerLike;
  private job?: Job;
  private sequence = 0;
  private disposed = false;
  private unsubscribe: () => void;
  private timeoutMs: number;
  private fallbackReason?: string;
  error: Error | null = null;
  readonly metrics = {
    submitted: 0,
    completed: 0,
    published: 0,
    stale: 0,
    failures: 0,
    snapshotMs: 0,
    buildMs: 0,
    publishMs: 0,
    bytes: 0,
  };
  readonly root = new THREE.Group();
  readonly world: World;
  shadows = true;
  constructor(world: World, scene: THREE.Scene, options: ChunkRendererOptions = {}) {
    this.world = world;
    this.timeoutMs = options.workerTimeoutMs ?? 15000;
    this.materials = blockMaterials.map((m) => m.clone());
    if (options.materialBatching !== false) this.batching = new TerrainMaterialBatching(this.materials);
    scene.add(this.root);
    this.unsubscribe = world.subscribe(({ x, z }) => {
      if (this.job?.guard.touches(chunkCoord(x), chunkCoord(z))) this.job.guard.invalidated = true;
    });
    if (options.workerFactory !== null) {
      try {
        this.worker = options.workerFactory
          ? options.workerFactory()
          : new Worker(new URL('../workers/mesh.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }) => this.receive(data);
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.fail(event.message || '网格 Worker 加载失败');
        };
        this.worker.onmessageerror = () => this.fail('网格 Worker 返回数据无法读取');
      } catch (error) {
        this.fail(String(error));
      }
    }
  }
  /** Includes ready buffers awaiting publication. Queue is bounded to one snapshot/result. */
  get pending() {
    return this.job ? 1 : 0;
  }
  get busy() {
    return !!this.job;
  }
  get mode() {
    return this.worker ? 'worker' : 'main-thread-fallback';
  }
  get fallback() {
    return this.fallbackReason;
  }
  get atlasCount() {
    return this.batching?.atlasCount ?? 0;
  }
  get materialBatchingFallbacks() {
    return this.batching?.fallbacks ?? [];
  }
  /** Rendering changes, including removals and atlas activation, for shadow invalidation. */
  get renderRevision() {
    return this.revision;
  }
  /** Optional warm-up for reproducible A/B scenes. Normal gameplay loads progressively.
   * False means timeout/disposal; original texture materials remain the fallback.
   * True means settled, including failed families listed in materialBatchingFallbacks.
   * Call before draining/rebuilding chunks: atlas activation marks resident chunks dirty.
   */
  async prepareMaterials(timeoutMs = 15000): Promise<boolean> {
    const deadline = performance.now() + Math.max(0, timeoutMs);
    while (!this.disposed) {
      this.refreshBatching();
      if (!this.batching || this.batching.ready) return true;
      if (performance.now() >= deadline) return false;
      await new Promise<void>((resolve) => setTimeout(resolve, 16));
    }
    return false;
  }
  private refreshBatching() {
    if (!this.batching?.refresh()) return;
    this.revision++;
    // An old in-flight layout is valid geometry, but publishing it would undo batching.
    if (this.job) this.job.guard.invalidated = true;
    for (const chunk of this.world.loaded) this.world.dirty.add(`${chunk.x},${chunk.z}`);
  }
  private closeWorker() {
    if (!this.worker) return;
    this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = undefined;
  }
  private fail(message: string) {
    if (this.disposed) return;
    this.fallbackReason = message;
    this.metrics.failures++;
    this.closeWorker();
    if (this.job) {
      clearTimeout(this.job.timer);
      this.world.dirty.add(this.job.guard.key);
      this.job = undefined;
    }
  }
  private receive(reply: MeshReply) {
    if (this.disposed || !this.job || this.job.id !== reply.id) return;
    clearTimeout(this.job.timer);
    if (reply.type === 'error') {
      this.fail(reply.message);
      return;
    }
    this.metrics.completed++;
    this.metrics.buildMs = reply.buildMs;
    this.metrics.bytes = meshResultTransfers(reply.parts).reduce((sum, buffer) => sum + buffer.byteLength, 0);
    this.job.ready = reply.parts;
  }
  private remove(key: string) {
    const g = this.groups.get(key);
    if (!g) return;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.root.remove(g);
    this.groups.delete(key);
    this.revision++;
  }
  private frame(item: string) {
    let m = this.frames.get(item);
    if (!m) {
      m = new THREE.MeshLambertMaterial({
        map: createItemFrameWithItemTexture(blockIconUrls[item as keyof typeof blockIconUrls]),
      });
      this.frames.set(item, m);
    }
    return m;
  }
  private terrainMaterial(id: number, colored: boolean) {
    const source = this.materials[id];
    if (!colored || source.vertexColors) return source;
    // The same original material may serve an unshaded part in another chunk.
    // Leave it and the atlas family inputs intact; share one variant per source.
    let material = this.contactMaterials.get(id);
    if (!material) {
      material = source.clone();
      material.vertexColors = true;
      this.contactMaterials.set(id, material);
    }
    return material;
  }
  private publish(key: string, parts: MeshPart[]) {
    const start = performance.now(),
      group = new THREE.Group();
    try {
      for (const part of parts) {
        const geometry = new THREE.BufferGeometry();
        const id = part.material;
        // BufferAttribute retains transferred arrays instead of copying them on the main thread.
        geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
        if (part.colors) geometry.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
        const s = part.sphere;
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.x, s.y, s.z), s.radius);
        const mesh = new THREE.Mesh(geometry, typeof id === 'string' ? this.frame(id) : this.terrainMaterial(id, !!part.colors));
        mesh.userData.water = id === 43;
        mesh.castShadow = this.shadows && id !== 43;
        mesh.receiveShadow = this.shadows;
        group.add(mesh);
      }
    } catch (error) {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      throw error;
    }
    // Keep the old mesh visible until the entire replacement is constructed.
    this.remove(key);
    this.groups.set(key, group);
    this.root.add(group);
    this.revision++;
    this.metrics.published++;
    this.metrics.publishMs = performance.now() - start;
  }
  rebuild(chunk: Chunk) {
    if (this.disposed) return;
    this.refreshBatching();
    if (this.job?.guard.touches(chunk.x, chunk.z)) this.job.guard.invalidated = true;
    try {
      const start = performance.now(),
        guard = new MeshSnapshotGuard(this.world, chunk);
      const snapshot = captureMeshSnapshot(chunk, guard.refs, materialsFor, this.batching?.batches);
      this.metrics.snapshotMs = performance.now() - start;
      const buildStart = performance.now(),
        parts = buildMesh(snapshot);
      this.metrics.buildMs = performance.now() - buildStart;
      this.publish(guard.key, parts);
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      throw this.error;
    }
  }
  flush(max = 2, budgetMs = Infinity) {
    if (this.disposed || this.error || max <= 0 || budgetMs <= 0) return;
    this.refreshBatching();
    const start = performance.now();
    // Unloaded chunks must disappear even while another chunk is being meshed.
    for (const key of this.world.dirty) {
      const [x, z] = key.split(',').map(Number);
      if (!this.world.getChunk(x, z)) {
        this.remove(key);
        this.world.dirty.delete(key);
      }
      if (performance.now() - start >= budgetMs) return;
    }
    if (this.job?.ready) {
      const job = this.job;
      this.job = undefined;
      if (job.guard.valid(this.world)) {
        try {
          this.publish(job.guard.key, job.ready!);
        } catch (error) {
          this.world.dirty.add(job.guard.key);
          this.error = error instanceof Error ? error : new Error(String(error));
          return;
        }
        max--;
      } else {
        this.metrics.stale++;
        if (this.world.getChunk(job.guard.chunk.x, job.guard.chunk.z)) this.world.dirty.add(job.guard.key);
      }
    }
    if (this.job || max <= 0 || performance.now() - start >= budgetMs) return;
    for (const key of this.world.dirty) {
      const [x, z] = key.split(',').map(Number),
        chunk = this.world.getChunk(x, z);
      if (!chunk) {
        this.world.dirty.delete(key);
        this.remove(key);
        continue;
      }
      this.world.dirty.delete(key);
      if (!this.worker) {
        try {
          this.rebuild(chunk);
        } catch {
          this.world.dirty.add(key);
          return;
        }
        if (--max <= 0 || performance.now() - start >= budgetMs) return;
        continue;
      }
      const snapshotStart = performance.now(),
        guard = new MeshSnapshotGuard(this.world, chunk);
      try {
        const snapshot = captureMeshSnapshot(chunk, guard.refs, materialsFor, this.batching?.batches);
        this.metrics.snapshotMs = performance.now() - snapshotStart;
        const id = ++this.sequence;
        this.job = {
          id,
          guard,
          timer: setTimeout(() => this.fail('网格 Worker 超时，回退到主线程'), this.timeoutMs),
        };
        this.metrics.submitted++;
        this.worker.postMessage({ id, snapshot }, meshSnapshotTransfers(snapshot));
      } catch (error) {
        this.world.dirty.add(key);
        this.fail(String(error));
      }
      return;
    }
  }
  updateShadows(enabled: boolean) {
    if (this.shadows === enabled) return;
    this.shadows = enabled;
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = enabled && !o.userData.water;
        o.receiveShadow = enabled;
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    if (this.job) clearTimeout(this.job.timer);
    this.job = undefined;
    this.closeWorker();
    for (const key of [...this.groups.keys()]) this.remove(key);
    for (const m of this.materials) m.dispose();
    for (const m of this.contactMaterials.values()) m.dispose();
    this.contactMaterials.clear();
    this.batching?.dispose();
    for (const m of this.frames.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.frames.clear();
    this.root.removeFromParent();
  }
}
