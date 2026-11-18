import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { blockMaterials } from '../src/engine/blocks';
import { TerrainGenerator } from '../src/engine/core/generator';
import { World } from '../src/engine/core/world';
import { TOP } from '../src/engine/core/voxel';
import { defaultWorldGenSettings } from '../src/engine/types';
import { ChunkRenderer } from '../src/engine/render/chunks';

const width = 640, height = 480;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const mode = document.querySelector<HTMLSelectElement>('#mode')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const result = document.querySelector<HTMLPreElement>('#result')!;
const pictures = document.querySelector<HTMLDivElement>('#pictures')!;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
type Renderer = THREE.WebGLRenderer | WebGPURenderer;
type Actual = 'WebGLRenderer' | 'WebGPUBackend' | 'WebGLBackend';

function assert(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(reason); }

function prepare(world: World) {
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.ensure(x, z);
  // This seed has leaves and short grass but no water here. Make a deterministic pond in camera view.
  for (let x = 1; x <= 6; x++) for (let z = 1; z <= 6; z++) {
    for (let y = 8; y <= TOP; y++) if (world.get(x, y, z)) world.set(x, y, z, null);
    world.set(x, 7, z, { type: 'water', level: 0, source: true, static: true });
  }
}

function snapshot(canvas: HTMLCanvasElement, label: string) {
  // Copy in the render task, before the default framebuffer is discarded. Keep images, not live contexts.
  const copy = document.createElement('canvas'); copy.width = width; copy.height = height;
  const ctx = copy.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const colors = new Set<number>();
  for (let i = 0; i < pixels.length; i += 64) colors.add((pixels[i] << 16) + (pixels[i + 1] << 8) + pixels[i + 2]);
  assert(colors.size > 64, `${label}: blank or nearly uniform output (${colors.size} sampled colours)`);
  const fig = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption');
  img.alt = caption.textContent = label; img.src = copy.toDataURL(); fig.append(caption, img); pictures.append(fig);
  return colors.size;
}

async function drawPair(world: World, renderer: Renderer, actual: Actual, label: string) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(72, width / height, .1, 220);
  scene.background = new THREE.Color(0xa8d4ee);
  scene.fog = new THREE.Fog(0xa8d4ee, 41, 82);
  const sun = new THREE.DirectionalLight(0xffedcd, 2.2); sun.position.set(20, 50, 25);
  scene.add(new THREE.HemisphereLight(0xc4e9ff, 0x8b896c, 1.7), sun);
  camera.position.set(18, 25, 26); camera.lookAt(0, 5, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setPixelRatio(1); renderer.setSize(width, height); renderer.info.autoReset = false;
  const rows = [];
  for (const atlas of [false, true]) {
    const chunks = new ChunkRenderer(world, scene, { materialBatching: atlas, workerFactory: null });
    try {
      chunks.shadows = false;
      assert(await chunks.prepareMaterials(), 'Atlas preparation timed out');
      assert(!chunks.materialBatchingFallbacks.length && (!atlas || chunks.atlasCount > 0), 'Missing terrain atlas');
      for (const chunk of world.loaded) chunks.rebuild(chunk);
      let meshes = 0, geometryTriangles = 0, waterTriangles = 0, cutoutTriangles = 0;
      let submittedWater = false, submittedCutout = false;
      chunks.root.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const count = o.geometry.index.count / 3;
        meshes++; geometryTriangles += count;
        if (o.userData.water) waterTriangles += count;
        if (o.material.alphaTest > 0) cutoutTriangles += count;
        o.onAfterRender = () => {
          if (o.userData.water) submittedWater = true;
          if (o.material.alphaTest > 0) submittedCutout = true;
        };
      });
      await renderer.compileAsync(scene, camera);
      submittedWater = submittedCutout = false;
      renderer.info.reset(); renderer.render(scene, camera);
      const drawCalls = renderer instanceof THREE.WebGLRenderer ? renderer.info.render.calls : renderer.info.render.drawCalls;
      const visibleTriangles = renderer.info.render.triangles;
      const sampledColors = snapshot(renderer.domElement, `${label} · ${actual} · ${atlas ? '图集' : '原材质'}`);
      assert(drawCalls > 0 && visibleTriangles > 0 && submittedWater && submittedCutout, 'Missing draws for terrain, water or foliage');
      rows.push({ atlasCount: chunks.atlasCount, meshes, geometryTriangles, waterTriangles, cutoutTriangles, submittedWater, submittedCutout, drawCalls, visibleTriangles, sampledColors });
    } finally { chunks.dispose(); }
  }
  assert(rows[0].geometryTriangles === rows[1].geometryTriangles && rows[0].waterTriangles === rows[1].waterTriangles && rows[0].cutoutTriangles === rows[1].cutoutTriangles, 'Batching changed geometry');
  return rows;
}

function glAdapter(gl: WebGL2RenderingContext) {
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : 'unknown (masked)';
}

// This standalone document is the only consumer. Release source textures from each renderer's caches;
// Texture.dispose() preserves the decoded assets for the next backend/run.
function releaseSourceTextures() {
  for (const texture of new Set(blockMaterials.map(material => material.map))) texture?.dispose();
}

async function stable(world: World, label: string, attemptedCanvas?: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  try {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const rows = await drawPair(world, renderer, 'WebGLRenderer', label);
    assert(gl.getError() === gl.NO_ERROR && !gl.isContextLost(), 'WebGL error or context lost');
    return { actual: 'WebGLRenderer', adapter: glAdapter(gl), freshFallbackCanvas: attemptedCanvas ? canvas !== attemptedCanvas : null, rows };
  } finally { releaseSourceTextures(); renderer.dispose(); renderer.forceContextLoss(); }
}

async function candidate(world: World, requested: string) {
  const canvas = document.createElement('canvas');
  let renderer: WebGPURenderer | undefined, gl: WebGL2RenderingContext | undefined;
  let initialized = false, phase = 'import', reason = '', detected: Actual | null = null;
  const firstFig = pictures.children.length;
  try {
    const { WebGPURenderer } = await import('three/webgpu');
    phase = 'init';
    // A canvas bound to 2D cannot create WebGL2. This exercises an actual init() rejection,
    // and makes reusing the attempted canvas for the stable fallback observably incorrect.
    if (requested === 'fail-init') assert(canvas.getContext('2d'), 'Cannot inject context mismatch');
    renderer = new WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance', forceWebGL: requested !== 'auto' });
    await renderer.init(); initialized = true;
    const backend = renderer.backend as typeof renderer.backend & { isWebGPUBackend?: boolean; isWebGLBackend?: boolean; device?: GPUDevice };
    detected = backend.isWebGPUBackend ? 'WebGPUBackend' : backend.isWebGLBackend ? 'WebGLBackend' : null;
    assert(detected, 'Unknown backend after init');
    if (requested === 'force-webgl2') assert(detected === 'WebGLBackend', 'forceWebGL selected wrong backend');
    if (detected === 'WebGLBackend') gl = renderer.getContext() as WebGL2RenderingContext;
    const info = backend.device?.adapterInfo;
    const adapter = gl ? glAdapter(gl) : info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: info.isFallbackAdapter } : 'unknown (masked)';
    const errors: string[] = [];
    renderer.onError = e => errors.push(typeof e === 'string' ? e : JSON.stringify(e));
    renderer.onDeviceLost = e => errors.push(`Device lost: ${e.message}`);
    phase = 'draw';
    const rows = await drawPair(world, renderer, detected, '候选');
    await backend.device?.queue.onSubmittedWorkDone(); await frame();
    assert(!errors.length && (!gl || (!gl.isContextLost() && gl.getError() === gl.NO_ERROR)), errors.join('; ') || 'WebGL2 backend error');
    return { actual: detected, adapter, reason: detected === 'WebGPUBackend' ? null : requested === 'force-webgl2' ? 'Forced by fixture: forceWebGL=true' : 'Three initialized its internal WebGL2 fallback instead of native WebGPU', rows };
  } catch (e) {
    reason = `${requested === 'fail-init' ? 'Injected 2D-bound canvas; ' : ''}${phase}: ${message(e)}`;
    while (pictures.children.length > firstFig) pictures.lastElementChild!.remove();
  } finally {
    if (renderer) {
      releaseSourceTextures();
      // r187 dispose() can reject with the already-rejected init promise. Preserve both diagnostics.
      try { await renderer.dispose(); } catch (e) { if (initialized) throw e; reason += `; dispose: ${message(e)}`; }
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
  return { ...await stable(world, '新画布回退', canvas), attemptedBackend: detected, reason };
}

run.disabled = false; status.textContent = '就绪';
run.onclick = async () => {
  run.disabled = mode.disabled = true; delete result.dataset.outcome;
  result.textContent = ''; pictures.replaceChildren(); status.textContent = '绘制中…';
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  try {
    prepare(world);
    const deadline = performance.now() + 20000;
    while (blockMaterials.some(m => !m.map?.image)) { assert(performance.now() < deadline, 'Source textures failed to load'); await frame(); }
    const control = await stable(world, '对照'), requested = mode.value, test = await candidate(world, requested);
    assert(control.rows.every((r, i) => r.geometryTriangles === test.rows[i].geometryTriangles), 'Different geometry across backends');
    const outcome = test.actual === 'WebGPUBackend' ? 'native' : 'fallback';
    result.textContent = JSON.stringify({ seed: 42, chunks: world.loadedCount, cells: world.blockCount, requested, outcome, control, candidate: test }, null, 2);
    result.dataset.outcome = outcome; status.textContent = `完成 · ${test.actual}`;
  } catch (e) {
    result.textContent = message(e); result.dataset.outcome = 'error'; status.textContent = '验证失败';
  } finally { world.dispose(); run.disabled = mode.disabled = false; }
};
