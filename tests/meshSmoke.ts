import * as THREE from 'three';
import { World } from '../src/engine/core/world';
import { TerrainGenerator } from '../src/engine/core/generator';
import { defaultWorldGenSettings } from '../src/engine/types';
import { ChunkRenderer } from '../src/engine/render/chunks';
import { buildMesh } from '../src/engine/core/meshBuilder';
import { indexOf, type Chunk } from '../src/engine/core/voxel';
import type { MeshReply, MeshRequest, MeshWorkerLike } from '../src/engine/workers/meshProtocol';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Mesh smoke: ${message}`);
}
class ControlledWorker implements MeshWorkerLike {
  onmessage: MeshWorkerLike['onmessage'] = null;
  onerror: MeshWorkerLike['onerror'] = null;
  onmessageerror: MeshWorkerLike['onmessageerror'] = null;
  requests: MeshRequest[] = [];
  terminated = false;
  transferred = false;
  postMessage(request: MeshRequest, transfer: Transferable[]) {
    this.requests.push(structuredClone(request, { transfer }));
    this.transferred = request.snapshot.cells.byteLength === 0;
  }
  reply() {
    const request = this.requests.shift()!;
    this.onmessage?.({
      data: { id: request.id, type: 'mesh', parts: buildMesh(request.snapshot), buildMs: 1 },
    } as MessageEvent<MeshReply>);
  }
  terminate() {
    this.terminated = true;
  }
}
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const fixture = () => {
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  const c: Chunk = { x: 0, z: 0, cells: new Map([[indexOf(15, 0, 0), { type: 'stone' }]]) };
  world.install(c);
  world.dirty.clear();
  world.dirty.add('0,0');
  return { world, c };
};
const triangles = (renderer: ChunkRenderer) => {
  let n = 0;
  renderer.root.traverse((o) => {
    if (o instanceof THREE.Mesh) n += o.geometry.index!.count / 3;
  });
  return n;
};

/** Browser entry: real module worker + controlled races, no GPU context needed. */
export async function runMeshSmoke() {
  const { world, c } = fixture(),
    worker = new ControlledWorker();
  const renderer = new ChunkRenderer(world, new THREE.Scene(), { workerFactory: () => worker });
  try {
    renderer.rebuild(c);
    const old = renderer.root.children[0];
    renderer.flush();
    renderer.flush();
    assert(
      worker.requests.length === 1 && renderer.pending === 1 && worker.transferred,
      'bounded transferable dispatch',
    );
    assert(renderer.root.children[0] === old, 'old mesh kept while worker runs');
    world.set(15, 0, 0, { type: 'glass' });
    worker.reply();
    assert(renderer.pending === 1, 'ready buffers count as pending');
    renderer.flush();
    assert(
      renderer.metrics.stale === 1 && renderer.root.children[0] === old,
      'stale edited snapshot never published',
    );
    worker.reply();
    renderer.flush();
    assert(
      renderer.pending === 0 && renderer.root.children[0] !== old,
      'current result published atomically',
    );
    assert(triangles(renderer) === 12, 'current geometry');

    world.dirty.add('0,0');
    renderer.flush();
    worker.reply();
    world.set(15, 0, 0, { type: 'ice' });
    renderer.flush();
    assert(renderer.metrics.stale === 2, 'edit after worker completion is rejected before publication');
    worker.reply();
    renderer.flush();
    world.set(15, 0, 0, { type: 'glass' });
    renderer.flush();
    worker.reply();
    renderer.flush();

    world.dirty.add('0,0');
    renderer.flush();
    const adjacent: Chunk = { x: 1, z: 0, cells: new Map([[indexOf(16, 0, 0), { type: 'stone' }]]) };
    world.install(adjacent);
    worker.reply();
    renderer.flush();
    assert(renderer.metrics.stale === 3, 'new neighbor invalidates missing-neighbor snapshot');
    // Finish bounded queue including the neighbor, then exercise unload/replacement.
    while (worker.requests.length || world.dirty.size) {
      if (worker.requests.length) worker.reply();
      renderer.flush();
    }
    assert(triangles(renderer) === 22, 'neighbor border visibility');
    world.dirty.add('0,0');
    renderer.flush();
    world.unload(1, 0);
    world.install({ ...adjacent, cells: new Map() });
    worker.reply();
    renderer.flush();
    assert(renderer.metrics.stale === 4, 'replaced neighbor invalidates result');

    worker.onerror?.({ message: 'intentional worker failure', preventDefault() {} } as ErrorEvent);
    assert(
      renderer.mode === 'main-thread-fallback' && renderer.fallback && !renderer.error,
      'worker failure has nonterminal observable fallback',
    );
    while (world.dirty.size) renderer.flush();
    assert(triangles(renderer) === 12 && renderer.pending === 0, 'fallback reconstructs fresh snapshot');
  } finally {
    renderer.dispose();
    world.dispose();
  }
  assert(worker.terminated && renderer.root.children.length === 0, 'dispose releases worker and meshes');

  const disposal = fixture(),
    delayed = new ControlledWorker();
  const disposedRenderer = new ChunkRenderer(disposal.world, new THREE.Scene(), {
    workerFactory: () => delayed,
  });
  disposedRenderer.flush();
  const lateCallback = delayed.onmessage;
  disposedRenderer.dispose();
  const request = delayed.requests[0];
  lateCallback?.({
    data: { type: 'mesh', id: request.id, parts: buildMesh(request.snapshot), buildMs: 1 },
  } as MessageEvent<MeshReply>);
  assert(
    disposedRenderer.pending === 0 && disposedRenderer.root.children.length === 0,
    'late callback cannot resurrect disposed renderer',
  );
  disposal.world.dispose();

  const unloading = fixture(),
    unloadingWorker = new ControlledWorker();
  const unloadedRenderer = new ChunkRenderer(unloading.world, new THREE.Scene(), {
    workerFactory: () => unloadingWorker,
  });
  try {
    unloadedRenderer.rebuild(unloading.c);
    unloadedRenderer.flush();
    unloading.world.unload(0, 0);
    unloadedRenderer.flush();
    assert(
      unloadedRenderer.root.children.length === 0,
      'unloaded old mesh removed while job is still in flight',
    );
    unloadingWorker.reply();
    unloadedRenderer.flush();
    assert(
      unloadedRenderer.pending === 0 && unloadedRenderer.root.children.length === 0,
      'unloaded center never resurrected',
    );
    unloading.world.install(unloading.c);
    unloadedRenderer.flush();
    unloading.world.unload(0, 0);
    unloading.world.install({ x: 0, z: 0, cells: new Map() });
    unloadingWorker.reply();
    unloadedRenderer.flush();
    assert(unloadedRenderer.metrics.stale === 2, 'replaced center rejected');
    unloadingWorker.reply();
    unloadedRenderer.flush();
    assert(triangles(unloadedRenderer) === 0, 'replacement center geometry installed');
  } finally {
    unloadedRenderer.dispose();
    unloading.world.dispose();
  }

  const timeout = fixture(),
    neverReplies = new ControlledWorker();
  const timedRenderer = new ChunkRenderer(timeout.world, new THREE.Scene(), {
    workerFactory: () => neverReplies,
    workerTimeoutMs: 1,
  });
  try {
    timedRenderer.flush();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assert(
      timedRenderer.pending === 0 && timedRenderer.fallback && !timedRenderer.error,
      'timeout clears pending and enables fallback',
    );
    timedRenderer.flush();
    assert(
      triangles(timedRenderer) === 12 && timedRenderer.metrics.published === 1,
      'timeout fallback publishes',
    );
  } finally {
    timedRenderer.dispose();
    timeout.world.dispose();
  }

  const actual = fixture(),
    real = new ChunkRenderer(actual.world, new THREE.Scene());
  try {
    const deadline = performance.now() + 15000;
    while (actual.world.dirty.size || real.pending) {
      real.flush();
      if (real.error) throw real.error;
      assert(performance.now() < deadline, 'real worker drain timeout');
      await frame();
    }
    assert(real.mode === 'worker' && real.metrics.completed === 1, 'real module worker used');
    assert(triangles(real) === 12, 'real worker buffers produce identical geometry');
    return { mode: real.mode, ...real.metrics, races: 'PASS' };
  } finally {
    real.dispose();
    actual.world.dispose();
  }
}
