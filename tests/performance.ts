import * as THREE from 'three';
import { TerrainGenerator } from '../src/engine/core/generator';
import { World } from '../src/engine/core/world';
import { defaultSettings } from '../src/engine/core/session';
import { defaultWorldGenSettings } from '../src/engine/types';
import { ChunkRenderer } from '../src/engine/render/chunks';
import { GameScene } from '../src/engine/render/scene';
import { terrainBenchmark } from './terrainBenchmark';
import { meshBenchmark } from './meshBenchmark';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const stats = (values: number[]) => {
  const a = [...values].sort((a, b) => a - b);
  return {
    medianMs: +a[Math.floor(a.length * 0.5)].toFixed(2),
    p95Ms: +a[Math.min(a.length - 1, Math.floor(a.length * 0.95))].toFixed(2),
  };
};
document.querySelector('#run')!.addEventListener('click', async () => {
  const button = document.querySelector('#run') as HTMLButtonElement;
  button.disabled = true;
  const output = document.querySelector('#result')!;
  output.textContent = '运行中';
  const settings = { ...defaultSettings(1), shadows: false, viewDistance: 82 };
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings, 'terrain-v2.1'));
  const view = new GameScene(document.querySelector('#mount') as HTMLElement, settings);
  const meshes = new ChunkRenderer(world, view.scene, { materialBatching: false });
  let batched: ChunkRenderer | undefined;
  meshes.shadows = false;
  const generation: number[] = [],
    meshing: number[] = [];
  try {
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        const start = performance.now();
        world.ensure(x, z);
        generation.push(performance.now() - start);
      }
    // Neighbor data is present for all builds; no transient boundary faces.
    for (const c of world.loaded) {
      const start = performance.now();
      meshes.rebuild(c);
      meshing.push(performance.now() - start);
    }
    view.camera.position.set(18, 25, 26);
    view.camera.lookAt(0, 5, 0);
    for (let i = 0; i < 8; i++) {
      view.draw(0.28, 1 / 60);
      await frame();
    }
    const submit: number[] = [],
      interval: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 30; i++) {
      await frame();
      const now = performance.now();
      interval.push(now - last);
      last = now;
      const start = performance.now();
      view.draw(0.28, 1 / 60);
      submit.push(performance.now() - start);
    }
    let triangles = 0;
    meshes.root.traverse((o) => {
      if (o instanceof THREE.Mesh) triangles += (o.geometry.index?.count ?? 0) / 3;
    });
    const info = view.renderer.info;
    const baseline = { drawCalls: info.render.calls, visibleTriangles: info.render.triangles,
      textures: info.memory.textures, geometries: info.memory.geometries };
    // Same world, camera and renderer; only one terrain root is visible at a time.
    batched = new ChunkRenderer(world, view.scene, { workerFactory: null });
    batched.shadows = false;
    if (!await batched.prepareMaterials()) throw new Error('材质图集准备超时');
    for (const chunk of world.loaded) batched.rebuild(chunk);
    meshes.root.visible = false;
    // Use the same warm-up and sample cadence as the control, including RAF
    // intervals. The panel can still be throttled; these are not GPU timings.
    for (let i = 0; i < 8; i++) { view.draw(0.28, 1 / 60); await frame(); }
    const batchedSubmit: number[] = [], batchedInterval: number[] = [];
    last = performance.now();
    for (let i = 0; i < 30; i++) {
      await frame();
      const start = performance.now();
      batchedInterval.push(start - last);
      last = start;
      view.draw(0.28, 1 / 60);
      batchedSubmit.push(performance.now() - start);
    }
    let batchedTriangles = 0, batchedMeshes = 0;
    batched.root.traverse(object => {
      if (object instanceof THREE.Mesh) { batchedMeshes++; batchedTriangles += object.geometry.index!.count / 3; }
    });
    const batching = { drawCalls: info.render.calls, visibleTriangles: info.render.triangles,
      totalTriangles: batchedTriangles, meshes: batchedMeshes, atlases: batched.atlasCount,
      renderSubmit: stats(batchedSubmit), frameInterval: stats(batchedInterval),
      note: 'Merged bounds can submit more triangles; same total geometry. Resource counts omitted: both A/B roots are resident.' };
    const worker = await terrainBenchmark();
    const meshWorker = await meshBenchmark();
    output.textContent =
      JSON.stringify(
        {
          seed: 42,
          chunks: world.loadedCount,
          cells: world.blockCount,
          triangles,
          generation: stats(generation),
          meshing: stats(meshing),
          renderSubmit: stats(submit),
          frameInterval: stats(interval),
          ...baseline,
          batching,
          worker,
          meshWorker,
          note: 'Development browser, CPU wall times; frame interval includes browser throttling, not GPU timer.',
        },
        null,
        2,
      ) + '\nDONE';
  } catch (e) {
    output.textContent = String(e);
    throw e;
  } finally {
    meshes.dispose();
    batched?.dispose();
    view.dispose();
    world.dispose();
    button.disabled = false;
  }
});
