import { TerrainGenerator } from '../src/engine/core/generator';
import { World } from '../src/engine/core/world';
import { Simulation } from '../src/engine/core/simulation';
import { TerrainWorkerSource } from '../src/engine/workers/terrainSource';
import { defaultWorldGenSettings } from '../src/engine/types';

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(2),
  };
};
export async function terrainBenchmark() {
  const generator = new TerrainGenerator(42, defaultWorldGenSettings);
  const source = new TerrainWorkerSource(generator),
    world = new World(generator),
    simulation = new Simulation(world);
  const signal = new AbortController().signal;
  try {
    const first = performance.now();
    await source.generate(99, 99, signal);
    const startupMs = performance.now() - first;
    if (source.mode !== 'worker') throw new Error(`基准要求真实 Worker：${source.fallback}`);
    const workerCpu: number[] = [],
      packing: number[] = [],
      decode: number[] = [],
      install: number[] = [],
      roundTrip: number[] = [];
    let bytes = 0,
      cells = 0;
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        const start = performance.now();
        const chunk = await source.generate(x, z, signal);
        roundTrip.push(performance.now() - start);
        workerCpu.push(source.metrics.generationMs);
        packing.push(source.metrics.packingMs);
        decode.push(source.metrics.decodingMs);
        const accepted = performance.now();
        world.install(chunk);
        install.push(performance.now() - accepted);
        bytes += source.metrics.transferBytes;
        cells += chunk.cells.size;
      }
    return {
      mode: source.mode,
      startupAndFirstChunkMs: +startupMs.toFixed(2),
      chunks: world.loadedCount,
      cells,
      bytes,
      workerGeneration: stats(workerCpu),
      workerPacking: stats(packing),
      mainDecode: stats(decode),
      mainInstallWithSimulation: stats(install),
      roundTrip: stats(roundTrip),
    };
  } finally {
    source.dispose();
    simulation.dispose();
    world.dispose();
  }
}
