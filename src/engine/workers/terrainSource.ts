import type { ChunkSource } from '../core/chunkStream';
import type { TerrainGenerator } from '../core/generator';
import { unpackChunk } from '../core/chunkTransfer';
import type { Chunk } from '../core/voxel';
import type { TerrainReply, TerrainRequest } from './protocol';

export class TerrainWorkerSource implements ChunkSource {
  private worker?: Worker;
  private sequence = 0;
  private disposed = false;
  private pending = new Map<
    number,
    { resolve: (reply: TerrainReply) => void; reject: (error: Error) => void }
  >();
  private fallbackReason?: string;
  readonly metrics = { generationMs: 0, packingMs: 0, decodingMs: 0, transferBytes: 0, completed: 0 };
  constructor(privateGenerator: TerrainGenerator) {
    this.generator = privateGenerator;
    try {
      this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }: MessageEvent<TerrainReply>) => {
        this.pending.get(data.id)?.resolve(data);
      };
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.fail(event.message || '地形 Worker 加载失败');
      };
      this.worker.onmessageerror = () => this.fail('地形 Worker 返回数据无法读取');
      this.send({ type: 'init', seed: privateGenerator.seed, settings: privateGenerator.settings });
    } catch (error) {
      this.fail(String(error));
    }
  }
  private generator: TerrainGenerator;
  get mode() {
    return this.worker ? 'worker' : 'main-thread-fallback';
  }
  get fallback() {
    return this.fallbackReason;
  }
  private send(message: TerrainRequest) {
    this.worker!.postMessage(message);
  }
  private fail(message: string) {
    this.fallbackReason = message;
    this.worker?.terminate();
    this.worker = undefined;
    for (const job of this.pending.values()) job.reject(new Error(message));
    this.pending.clear();
  }
  async generate(x: number, z: number, signal: AbortSignal): Promise<Chunk> {
    signal.throwIfAborted();
    if (this.disposed) throw new Error('地形服务已关闭');
    if (this.pending.size) throw new Error('地形服务仅接受一个并发请求');
    if (this.worker) {
      const id = ++this.sequence;
      try {
        const reply = await new Promise<TerrainReply>((resolve, reject) => {
          const abort = () => {
            cleanup();
            reject(signal.reason);
          };
          const timeout = setTimeout(() => this.fail('地形 Worker 超时，回退到主线程'), 15000);
          const cleanup = () => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', abort);
            this.pending.delete(id);
          };
          this.pending.set(id, {
            resolve: (reply) => {
              cleanup();
              resolve(reply);
            },
            reject: (error) => {
              cleanup();
              reject(error);
            },
          });
          signal.addEventListener('abort', abort, { once: true });
          try {
            this.send({ type: 'generate', id, x, z });
          } catch (error) {
            cleanup();
            this.fail(String(error));
            reject(error);
          }
        });
        signal.throwIfAborted();
        if (this.disposed) throw new Error('地形服务已关闭');
        if (reply.type === 'error') throw new Error(reply.message);
        const start = performance.now(),
          chunk = unpackChunk(reply.chunk);
        Object.assign(this.metrics, {
          generationMs: reply.generationMs,
          packingMs: reply.packingMs,
          decodingMs: performance.now() - start,
          transferBytes: reply.chunk.indices.byteLength + reply.chunk.values.byteLength,
        });
        this.metrics.completed++;
        return chunk;
      } catch (error) {
        signal.throwIfAborted();
        if (this.disposed || this.worker) throw error;
        // Network/CSP/worker failures fall back, generation errors stay visible.
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    signal.throwIfAborted();
    if (this.disposed) throw new Error('地形服务已关闭');
    return this.generator.generate(x, z);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.fail('地形服务已关闭');
  }
}
