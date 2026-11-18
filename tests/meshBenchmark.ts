import * as THREE from 'three';
import { TerrainGenerator } from '../src/engine/core/generator';
import { World } from '../src/engine/core/world';
import { defaultWorldGenSettings } from '../src/engine/types';
import { ChunkRenderer } from '../src/engine/render/chunks';

function stats(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(2),
  };
}

/** Async wall time is explicitly separated from synchronous main-thread flush time. */
export async function meshBenchmark() {
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.ensure(x, z);
  const renderer = new ChunkRenderer(world, new THREE.Scene());
  const mainFlush: number[] = [],
    packing: number[] = [],
    builds: number[] = [],
    publish: number[] = [];
  let submitted = 0,
    published = 0,
    bytes = 0;
  const start = performance.now();
  try {
    if (!await renderer.prepareMaterials()) throw new Error('网格基准材质图集准备超时');
    while (world.dirty.size || renderer.pending) {
      if (performance.now() - start > 60000) throw new Error('网格 Worker 基准超时');
      const before = performance.now();
      renderer.flush(1, 4);
      const duration = performance.now() - before;
      if (renderer.error) throw renderer.error;
      if (renderer.metrics.submitted !== submitted) {
        submitted = renderer.metrics.submitted;
        packing.push(renderer.metrics.snapshotMs);
        mainFlush.push(duration);
      }
      if (renderer.metrics.published !== published) {
        published = renderer.metrics.published;
        builds.push(renderer.metrics.buildMs);
        publish.push(renderer.metrics.publishMs);
        bytes += renderer.metrics.bytes;
        mainFlush.push(duration);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    let triangles = 0,
      meshes = 0;
    renderer.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        meshes++;
        triangles += (object.geometry.index?.count ?? 0) / 3;
      }
    });
    return {
      mode: renderer.mode,
      chunks: world.loadedCount,
      meshes,
      triangles,
      wallMs: +(performance.now() - start).toFixed(2),
      mainSnapshot: stats(packing),
      workerBuild: stats(builds),
      mainPublish: stats(publish),
      mainFlush: stats(mainFlush),
      geometryBytes: bytes,
      staleResults: renderer.metrics.stale,
      note: 'Includes worker startup and task scheduling; no FPS or GPU-time inference.',
    };
  } finally {
    renderer.dispose();
    world.dispose();
  }
}
