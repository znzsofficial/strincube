import type { Mesh, Object3D } from 'three';
import { createGame } from '../src/engine/runtime';
import { createExperimentalView, NativeWebGPUUnavailableError } from '../src/engine/render/experimentalWebgpuView';
import { defaultWorldGenSettings, type BlockGameApi, type GameSnapshot } from '../src/engine/types';

type View = Awaited<ReturnType<typeof createExperimentalView>>;
const mount = document.querySelector<HTMLDivElement>('#mount')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const lock = document.querySelector<HTMLButtonElement>('#lock')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const output = document.querySelector<HTMLPreElement>('#result')!;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

// Observe the real window scheduler and real module Worker replies, including Three's own RAF.
// Fixture waits use timers, so none of its own RAFs can hide a leaked callback.
function observeBrowser() {
  const { Worker: OriginalWorker, requestAnimationFrame: request, cancelAnimationFrame: cancel } = window;
  const workers = { chunk: 0, mesh: 0 }, pending = new Set<number>();
  let fired = 0, canvases = 0, maxCanvases = 0;
  window.Worker = class extends OriginalWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.addEventListener('message', ({ data }) => {
        if (data.type === 'chunk') workers.chunk++;
        if (data.type === 'mesh') workers.mesh++;
      });
    }
  };
  window.requestAnimationFrame = cb => {
    const id = request.call(window, time => { pending.delete(id); fired++; cb(time); });
    pending.add(id); return id;
  };
  window.cancelAnimationFrame = id => { pending.delete(id); cancel.call(window, id); };
  const countCanvases = (nodes: NodeList) => [...nodes].reduce((n, node) => n + (node instanceof Element ? Number(node.matches('canvas')) + node.querySelectorAll('canvas').length : 0), 0);
  const observer = new MutationObserver(records => {
    // Replay the batch: append-before-remove must fail even within one JS task.
    for (const record of records) {
      canvases += countCanvases(record.addedNodes) - countCanvases(record.removedNodes);
      maxCanvases = Math.max(maxCanvases, canvases);
    }
  });
  observer.observe(mount, { childList: true, subtree: true });
  return { workers, pending, get fired() { return fired; }, get maxCanvases() { return maxCanvases; }, restore() {
    observer.disconnect(); window.Worker = OriginalWorker; window.requestAnimationFrame = request; window.cancelAnimationFrame = cancel;
  } };
}

// Browser pointer lock requires a fresh trusted click. Do not shim pointerLockElement or synthesize a grant.
async function userLock(api: BlockGameApi, label: string) {
  lock.textContent = label; lock.hidden = false; status.value = '等待点击';
  try {
    await new Promise<void>((resolve, reject) => {
      lock.onclick = () => { lock.hidden = true; Promise.resolve(api.lockControls()).then(resolve, reject); };
    });
  } finally { lock.onclick = null; lock.hidden = true; }
}

function geometryOf(group: Object3D) {
  const geometries = new Set<Mesh['geometry']>();
  group.traverse(object => { if ('water' in object.userData && (object as Mesh).isMesh) geometries.add((object as Mesh).geometry); });
  return geometries;
}

// Read a published frame in its render task; deferred readback can sample a discarded backbuffer.
function sampleColors(canvas: HTMLCanvasElement) {
  const copy = document.createElement('canvas'); copy.width = 96; copy.height = 64;
  const ctx = copy.getContext('2d')!; ctx.drawImage(canvas, 0, 0, 96, 64);
  const data = ctx.getImageData(0, 0, 96, 64).data, colors = new Set<number>();
  for (let i = 0; i < data.length; i += 4) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return colors.size;
}

async function verify(report: Record<string, unknown>) {
  const probe = observeBrowser();
  let game: BlockGameApi | undefined, view!: View, snapshot!: GameSnapshot;
  let emissions = 0, failure: Error | undefined;
  const perf = () => snapshot.performance!.resources;
  async function until(label: string, ready: () => boolean) {
    status.value = label;
    const deadline = performance.now() + 20000;
    while (!ready()) {
      if (failure || view?.error) throw failure ?? view.error;
      assert(performance.now() < deadline, `Timeout: ${label}`); await delay(16);
    }
  }
  try {
    const colors = { WebGPUBackend: 0, WebGLRenderer: 0 };
    game = await createGame(mount, s => { snapshot = s; emissions++; }, undefined, {
      worldGen: { ...defaultWorldGenSettings, seed: 42, flatWorld: true, plantDensity: 'none', treeDensity: 'none', structureDensity: 'none' },
      onProgress: label => { status.value = label; }, onError: e => { failure = e; },
      async viewFactory(m, settings, signal) {
        view = await createExperimentalView(m, settings, signal);
        const draw = view.draw.bind(view);
        view.draw = (...args) => {
          draw(...args);
          const backend = view.backend;
          if (backend && !colors[backend] && (view.frameResources().triangles ?? 0) > 0) colors[backend] = sampleColors(view.canvas);
        };
        return view;
      },
    });
    const api = game, scene = view.scene, camera = view.camera, original = view.canvas;
    const actualBackend = () => view.backend, selected = () => snapshot.selectedBlock;
    api.updateSettings({ showFps: true, shadows: false, pixelRatio: 1, viewDistance: 32 });
    await until('检查原生帧与初始区块', () => view.nativeFrames > 1 && perf().renderedChunks === 25 && !!perf().drawCalls);
    assert(actualBackend() === 'WebGPUBackend' && original.getContext('webgpu') && colors.WebGPUBackend > 16, 'No nonblank native WebGPU frame');
    const root = scene.children.find(group => geometryOf(group).size >= 25);
    assert(root && root.children.length === 25, 'Expected 25 published terrain groups');
    await userLock(api, '锁定原生画布并触发设备丢失');
    await until('检查原生指针锁', () => snapshot.isLocked && document.pointerLockElement === original);
    // Face a patch of flat ground two blocks ahead. Placement must go through the runtime raycast.
    document.dispatchEvent(new PointerEvent('pointermove', { pointerType:'mouse', movementX: 60, movementY: 385 }));
    await until('检查视角', () => camera.rotation.x < -.6 && Math.abs(camera.rotation.y) > .05);
    api.setSelectedBlock('diamondBlock');
    const rect = original.getBoundingClientRect();
    api.touchPlace(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const saved = api.save('before loss');
    assert(saved.engineData.edits.some(chunk => chunk.cells.some(([, c]) => c?.type === 'diamondBlock')), 'Expected a real diamond block placement');
    api.setSelectedBlock('bricks');
    api.updateSettings({ viewDistance: 80 });
    await until('等候流式加载队列', () => (perf().terrainQueueDepth ?? 0) > 0 && (perf().meshQueueDepth ?? 0) > 0);
    const before = { ...perf() }, journal = JSON.stringify(saved.engineData.edits), player = saved.engineData.player;
    const geometries = geometryOf(root);
    report.native = { frames: view.nativeFrames, colors: colors.WebGPUBackend, ...before };
    report.orientation = { yaw: player.yaw, pitch: player.pitch };
    const loss = await view.destroyDeviceForTest();
    assert(loss.reason === 'destroyed', `Unexpected device.lost reason: ${loss.reason}`);
    await until('等候 WebGL 替换画布', () => view.fallbackFrames > 1 && !snapshot.isLocked && !document.pointerLockElement);
    const replacement = view.canvas, gl = replacement.getContext('webgl2');
    assert(view.lossReason === loss.reason && actualBackend() === 'WebGLRenderer' && gl && !gl.isContextLost(), 'Expected stable WebGL renderer');
    assert(replacement !== original && !original.isConnected && mount.querySelector('canvas') === replacement && colors.WebGLRenderer > 16, 'Expected one nonblank replacement canvas');
    assert(view.scene === scene && view.camera === camera && root.parent === scene, 'Scene, camera or chunk root replaced');
    const retained = [...geometryOf(root)].filter(geometry => geometries.has(geometry)).length;
    assert(root.children.length >= before.renderedChunks! && retained >= geometries.size / 2, 'Published chunk geometry was cleared during swap');
    const resumed = api.save('after loss');
    assert(JSON.stringify(resumed.engineData.edits) === journal && selected() === 'bricks', 'Journal or selected block changed');
    assert(JSON.stringify(resumed.engineData.player) === JSON.stringify(player), 'Saved player position/orientation changed');
    assert(camera.rotation.x === player.pitch && camera.rotation.y === player.yaw, 'Camera no longer follows saved orientation');
    const swapGroups = root.children.length, swapWorkers = { ...probe.workers }, firstPausedFrame = view.fallbackFrames;
    await until('检查恢复后的 Worker 结果和新区块', () => (perf().residentChunks ?? 0) > before.residentChunks! &&
      (perf().renderedChunks ?? 0) > Math.max(swapGroups, before.renderedChunks!) && probe.workers.chunk > swapWorkers.chunk && probe.workers.mesh > swapWorkers.mesh && view.fallbackFrames > firstPausedFrame + 4);
    assert(snapshot.performance?.meshExecution?.mode === 'worker' && !snapshot.isLocked && !document.pointerLockElement, 'Worker fallback or unauthorized relock');
    const paused = api.save('paused');
    assert(paused.timeOfDay === resumed.timeOfDay && JSON.stringify(paused.engineData.player) === JSON.stringify(player), 'Simulation advanced without explicit resume');
    report.recovery = { lossReason: loss.reason, frames: view.fallbackFrames, colors: colors.WebGLRenderer, ...perf(),
      retainedGeometries: `${retained}/${geometries.size}`, workerRepliesAfterSwap: { terrain: probe.workers.chunk - swapWorkers.chunk, mesh: probe.workers.mesh - swapWorkers.mesh }, pausedFrames: view.fallbackFrames - firstPausedFrame };
    await userLock(api, '锁定替换画布并验证拾取');
    await until('检查替换画布的指针锁', () => snapshot.isLocked && document.pointerLockElement === replacement);
    const pick = () => new PointerEvent('pointerdown', { button: 1, bubbles: true, cancelable: true });
    original.dispatchEvent(pick());
    assert(selected() === 'bricks', 'Detached canvas still handles picking');
    replacement.dispatchEvent(pick());
    assert(selected() === 'diamondBlock', 'Replacement canvas did not pick the saved edit');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    await until('检查恢复后的移动', () => Math.hypot(camera.position.x - player.x, camera.position.z - player.z) > .35);
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    report.input = { pick: snapshot.selectedBlock, moved: Math.hypot(camera.position.x - player.x, camera.position.z - player.z) };
    api.dispose();
    const frames = probe.fired, snapshots = emissions;
    await delay(350);
    assert(!probe.pending.size && frames === probe.fired && emissions === snapshots, `Post-dispose callbacks: pending RAF ${probe.pending.size}, fired ${probe.fired - frames}`);
    assert(probe.maxCanvases === 1 && !mount.querySelector('canvas') && !document.pointerLockElement, 'Canvas/lock lifetime leak');
    if (failure || view.error) throw failure ?? view.error;
    report.cleanup = { maxSimultaneousCanvases: probe.maxCanvases, canvases: mount.querySelectorAll('canvas').length, pendingRAF: probe.pending.size };
  } finally { try { game?.dispose(); } finally { probe.restore(); } }
}

run.disabled = false; status.value = '就绪';
run.onclick = async () => {
  run.disabled = true; output.textContent = ''; delete output.dataset.outcome;
  const report: Record<string, unknown> = {};
  try { await verify(report); status.value = 'PASSED'; output.dataset.outcome = 'passed'; }
  catch (e) {
    const skipped = e instanceof NativeWebGPUUnavailableError;
    status.value = skipped ? 'SKIPPED · 无原生 WebGPU' : 'FAILED'; output.dataset.outcome = skipped ? 'skipped' : 'failed';
    report[skipped ? 'reason' : 'error'] = e instanceof Error ? e.message : String(e);
  } finally { output.textContent = JSON.stringify(report, null, 2); run.disabled = false; }
};
