import { TerrainGenerator } from '../src/engine/core/generator';
import { World } from '../src/engine/core/world';
import { ChunkStream } from '../src/engine/core/chunkStream';
import { TerrainWorkerSource } from '../src/engine/workers/terrainSource';
import { defaultWorldGenSettings } from '../src/engine/types';

export async function verifyTerrainWorker(assert: (condition: unknown, label: string) => void) {
  const generator = new TerrainGenerator(42, defaultWorldGenSettings);
  const source = new TerrainWorkerSource(generator),
    world = new World(generator),
    stream = new ChunkStream(world, source);
  try {
    const signal = new AbortController().signal;
    const old = new TerrainGenerator(42, defaultWorldGenSettings, 'terrain-v2.1');
    const oldSource = new TerrainWorkerSource(old);
    try {
      const oldChunk = await oldSource.generate(0, 0, signal);
      assert(oldSource.mode === 'worker' && JSON.stringify([...oldChunk.cells]) === JSON.stringify([...old.generate(0,0).cells]), '读取旧世界时 Worker 保留原来的地形版本');
    } finally { oldSource.dispose(); }
    const chunk = await source.generate(-1, 0, signal);
    assert(source.mode === 'worker', '浏览器实际运行独立地形 Worker（非回退）');
    assert(
      JSON.stringify([...chunk.cells]) === JSON.stringify([...generator.generate(-1, 0).cells]),
      'Worker 生成结果逐方块等同同步生成器',
    );
    assert(source.metrics.transferBytes === chunk.cells.size * 6, '区块通过可转移缓冲区传输');
    await stream.prepare(0, 0, 0, () => {});
    world.set(2, 20, 2, { type: 'glass' });
    world.unload(0, 0);
    world.dirty.clear();
    stream.tick(0, 0, 0);
    await stream.idle();
    assert(world.get(2, 20, 2)?.type === 'glass', '异步重载保留玩家编辑');
    const pending = source.generate(20, 20, signal);
    source.dispose();
    let rejected = false;
    try {
      await pending;
    } catch {
      rejected = true;
    }
    assert(rejected, '退出终止 Worker 并结束未完成请求');
  } finally {
    stream.dispose();
    world.dispose();
  }
}
