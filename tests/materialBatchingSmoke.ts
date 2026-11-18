import * as THREE from 'three';
import { blockMaterials } from '../src/engine/blocks';
import { TerrainGenerator } from '../src/engine/core/generator';
import { World } from '../src/engine/core/world';
import { defaultWorldGenSettings } from '../src/engine/types';
import { ChunkRenderer } from '../src/engine/render/chunks';
import { TerrainMaterialBatching } from '../src/engine/render/materialBatching';
import { indexOf, type Cell, type Chunk } from '../src/engine/core/voxel';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Material batching: ${message}`);
}
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const meshes = (root: THREE.Object3D) => {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) result.push(object);
  });
  return result;
};
const triangles = (root: THREE.Object3D) => meshes(root).reduce((sum, mesh) => sum + mesh.geometry.index!.count / 3, 0);

/** Wait for original TextureLoader assets, without replacing the global loading manager. */
export async function waitForTerrainTextures() {
  const deadline = performance.now() + 15000;
  while (blockMaterials.some((material) => !material.map?.image)) {
    assert(performance.now() < deadline, 'source textures did not load');
    await frame();
  }
}

function materialContracts() {
  const materials: THREE.Material[] = blockMaterials.map((material) => material.clone());
  const batching = new TerrainMaterialBatching(materials);
  let sharedDisposed = false, ownedDisposed = 0;
  const source = blockMaterials[3].map!;
  const onDispose = () => { sharedDisposed = true; };
  source.addEventListener('dispose', onDispose);
  try {
    assert(batching.refresh() && batching.atlasCount === 2, 'opaque + cutout atlas families');
    assert(!batching.refresh(), 'settled atlas does not rebuild every frame');
    const layout = batching.batches;
    assert(layout[2]?.material === layout[3]?.material, 'opaque materials share one draw');
    assert(layout[6]?.material === layout[59]?.material && layout[6]?.material !== layout[3]?.material,
      'cutout leaves batch separately from opaque');
    for (const id of [0, 1, 7, 8, 43, 44, 45, 77, 99, 122, 134, 148, 150])
      assert(!layout[id], `unsupported/emissive/transparent/dynamic material ${id} remains baseline`);
    for (const id of [3, 6, 59, 83, 90, 98]) {
      const entry = layout[id]!;
      const material = materials[entry.material] as THREE.MeshLambertMaterial;
      const original = blockMaterials[id];
      assert(entry.color.every((value, i) => value === original.color.toArray()[i]), 'linear tint retained');
      for (const key of ['alphaTest', 'side', 'shadowSide', 'depthWrite', 'depthTest', 'polygonOffset',
        'polygonOffsetFactor', 'polygonOffsetUnits', 'emissiveIntensity', 'transparent'] as const)
        assert(material[key] === original[key], `${key} retained`);
      assert(material.emissive.equals(original.emissive), 'emissive retained');
      assert(material.vertexColors && material.color.equals(new THREE.Color(0xffffff)), 'tint applied exactly once');
      const atlas = material.map as THREE.DataTexture;
      assert(atlas.colorSpace === THREE.SRGBColorSpace && !atlas.flipY && !atlas.generateMipmaps &&
        atlas.mipmaps.length === 5, 'explicit bottom-up sRGB mip chain');
      atlas.addEventListener('dispose', () => { ownedDisposed++; });
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = tileCanvas.height = 16;
      const context = tileCanvas.getContext('2d')!;
      context.drawImage(original.map!.image as HTMLImageElement, 0, 0);
      const pixels = context.getImageData(0, 0, 16, 16).data;
      const base = atlas.mipmaps[0] as { data: Uint8Array; width: number; height: number };
      const x = Math.round(entry.uv[0] * base.width), y = Math.round(entry.uv[1] * base.height);
      for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
        const target = ((y + row) * base.width + x + col) * 4;
        const src = ((15 - row) * 16 + col) * 4;
        assert(base.data.subarray(target, target + 4).every((value, channel) => value === pixels[src + channel]),
          'atlas image orientation and alpha match source exactly');
      }
      for (let level = 0; level < atlas.mipmaps.length; level++) {
        const mip = atlas.mipmaps[level] as { data: Uint8Array; width: number; height: number };
        const tx = Math.round(entry.uv[0] * mip.width), ty = Math.round(entry.uv[1] * mip.height);
        const inside = (ty * mip.width + tx) * 4, padding = (ty * mip.width + tx - 1) * 4;
        assert(mip.data.subarray(inside, inside + 4).every((value, channel) => value === mip.data[padding + channel]),
          'edge padding survives every mip level');
      }
    }
  } finally {
    batching.dispose();
    batching.dispose();
    for (const material of materials) material.dispose();
    source.removeEventListener('dispose', onDispose);
  }
  assert(!sharedDisposed && ownedDisposed === 6, 'dispose releases each owned atlas once, never shared textures');
}

async function asynchronousContracts() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#3078a0'; context.fillRect(0, 0, 16, 16);
  const image = new Image();
  image.src = canvas.toDataURL();
  await image.decode();
  const first = new THREE.Texture(), second = new THREE.Texture();
  for (const texture of [first, second]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.magFilter = THREE.NearestFilter;
  }
  const materials: THREE.Material[] = [new THREE.MeshLambertMaterial({ map: first }), new THREE.MeshLambertMaterial({ map: second })];
  const batching = new TerrainMaterialBatching(materials);
  try {
    assert(!batching.refresh() && Object.keys(batching.batches).length === 0, 'unloaded textures keep original path');
    first.image = image;
    assert(!batching.refresh(), 'partially loaded family stays original');
    const oldLayout = batching.batches;
    second.image = image;
    assert(batching.refresh() && batching.atlasCount === 1 && !oldLayout[0], 'ready atlas publishes immutable layout');
    batching.dispose();
    assert(!batching.refresh(), 'late image completion cannot resurrect disposed atlases');
  } finally {
    batching.dispose(); first.dispose(); second.dispose();
    for (const material of materials) material.dispose();
  }
  // Visually significant state and texture transforms must never be silently erased.
  const transformed = blockMaterials[3].map!.clone();
  transformed.offset.x = .25;
  const originals = [
    blockMaterials[3].clone(),
    new THREE.MeshLambertMaterial({ map: transformed }),
    new THREE.MeshLambertMaterial({ map: blockMaterials[3].map, alphaTest: .2 }),
    new THREE.MeshLambertMaterial({ map: blockMaterials[3].map, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ map: blockMaterials[3].map, depthWrite: false }),
    new THREE.MeshLambertMaterial({ map: blockMaterials[3].map, emissive: 0x120000 }),
  ];
  const fallback = new TerrainMaterialBatching(originals);
  try {
    assert(!fallback.refresh() && fallback.atlasCount === 0 && originals[1].map === transformed,
      'transformed texture and incompatible material state retain original textured fallback');
  } finally {
    fallback.dispose(); transformed.dispose();
    originals.forEach((material) => material.dispose());
  }
}

function failedCanvasContracts() {
  const originalContext = HTMLCanvasElement.prototype.getContext;
  const originalReadback = CanvasRenderingContext2D.prototype.getImageData;
  for (const failure of ['unavailable-context', 'security-error'] as const) {
    const materials: THREE.Material[] = [2, 3, 6, 59].map((id) => blockMaterials[id].clone());
    const batching = new TerrainMaterialBatching(materials);
    let contextCalls = 0, readbackCalls = 0;
    try {
      HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, id: string, options?: unknown) {
        if (id === '2d' && ++contextCalls === 1 && failure === 'unavailable-context') return null;
        return originalContext.call(this, id, options);
      } as typeof originalContext;
      CanvasRenderingContext2D.prototype.getImageData = function(...args: Parameters<typeof originalReadback>) {
        // Let the first family commit, then simulate a browser security exception on
        // the second family's first image. This must not invalidate the accepted atlas.
        if (++readbackCalls === 3 && failure === 'security-error')
          throw new DOMException('Controlled tainted atlas canvas', 'SecurityError');
        return originalReadback.apply(this, args);
      };
      assert(batching.refresh() && batching.ready && batching.atlasCount === 1, `${failure}: other family remains batched`);
      const failedIds = failure === 'unavailable-context' ? [0, 1] : [2, 3];
      const acceptedIds = failure === 'unavailable-context' ? [2, 3] : [0, 1];
      assert(failedIds.every((id) => !batching.batches[id]), `${failure}: original textured material IDs retained`);
      assert(acceptedIds.every((id) => batching.batches[id]?.material === 4) && materials.length === 5,
        `${failure}: accepted material ID and ownership remain stable`);
      assert(batching.fallbacks.length === 1 && batching.fallbacks[0].materialIds.join() === failedIds.join() &&
        batching.fallbacks[0].reason.includes(failure === 'security-error' ? 'SecurityError' : '2D canvas'),
        `${failure}: actionable per-family fallback reason`);
      const layout = batching.batches, calls = contextCalls;
      assert(!batching.refresh() && batching.batches === layout && contextCalls === calls,
        `${failure}: failed family is not retried every frame`);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalContext;
      CanvasRenderingContext2D.prototype.getImageData = originalReadback;
      batching.dispose(); materials.forEach((material) => material.dispose());
    }
  }

  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  const chunk: Chunk = { x: 0, z: 0, cells: new Map([
    [indexOf(0, 0, 0), { type: 'stone' }], [indexOf(2, 0, 0), { type: 'leaves' }],
  ]) };
  world.install(chunk);
  const renderer = new ChunkRenderer(world, new THREE.Scene(), { workerFactory: null });
  try {
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, id: string, options?: unknown) {
      return id === '2d' ? null : originalContext.call(this, id, options);
    } as typeof originalContext;
    renderer.rebuild(chunk);
    renderer.flush(8);
    assert(!renderer.error && renderer.atlasCount === 0 && renderer.materialBatchingFallbacks.length === 2 &&
      triangles(renderer.root) === 24, 'rebuild/flush survive atlas failure and publish original textured geometry');
    assert(meshes(renderer.root).every((mesh) => !!mesh.material.map && !mesh.material.vertexColors),
      'renderer fallback retains source textures, not white replacement materials');
  } finally {
    HTMLCanvasElement.prototype.getContext = originalContext;
    renderer.dispose(); world.dispose();
  }
}

/** Dedicated browser entry. Parent browser/performance entrypoints can await this function.
 * Uses real WebGL readback and a real mesh worker. Returns counts, not inferred GPU timings.
 */
export async function runMaterialBatchingSmoke() {
  await waitForTerrainTextures();
  materialContracts();
  await asynchronousContracts();
  failedCanvasContracts();
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.ensure(x, z);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x182331);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(16, 40, 25); scene.add(sun);
  const baseline = new ChunkRenderer(world, scene, { materialBatching: false, workerFactory: null });
  const batched = new ChunkRenderer(world, scene);
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(256, 256);
  const target = new THREE.WebGLRenderTarget(256, 256);
  const camera = new THREE.PerspectiveCamera(65, 1, .1, 300);
  camera.position.set(18, 25, 26); camera.lookAt(0, 5, 0);
  const pixels = (show: ChunkRenderer, hide: ChunkRenderer) => {
    show.root.visible = true; hide.root.visible = false;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const calls = renderer.info.render.calls;
    const data = new Uint8Array(256 * 256 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 256, 256, data);
    return { calls, data };
  };
  const difference = (a: Uint8Array, b: Uint8Array) => {
    let total = 0, changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      total += d;
      if (d > 12) changed++;
    }
    return { meanChannelError: total / (256 * 256 * 3), changedFraction: changed / (256 * 256) };
  };
  let galleryWorld: World | undefined, galleryBaseline: ChunkRenderer | undefined, galleryBatched: ChunkRenderer | undefined;
  try {
    assert(await baseline.prepareMaterials(), 'baseline readiness is immediate');
    const initialRevision = batched.renderRevision;
    assert(await batched.prepareMaterials(), 'explicit atlas readiness');
    assert(batched.renderRevision > initialRevision, 'atlas activation invalidates shadows');
    const preparedRevision = batched.renderRevision;
    for (const chunk of world.loaded) baseline.rebuild(chunk);
    const deadline = performance.now() + 30000;
    while (world.dirty.size || batched.pending) {
      batched.flush(8);
      if (batched.error) throw batched.error;
      assert(performance.now() < deadline, 'worker atlas build timeout');
      await frame();
    }
    assert(batched.mode === 'worker' && batched.atlasCount === 2, 'real worker publishes atlas metadata');
    assert(batched.renderRevision > preparedRevision, 'publication invalidates shadows');
    assert(triangles(baseline.root) === 101482 && triangles(batched.root) === 101482, 'original 101482-triangle fixture retained');
    const before = pixels(baseline, batched), after = pixels(batched, baseline);
    const visual = difference(before.data, after.data);
    assert(after.calls < before.calls * .75, `terrain draw calls reduced: ${before.calls} -> ${after.calls}`);
    assert(visual.meanChannelError < .5 && visual.changedFraction < .01, `terrain visual parity ${JSON.stringify(visual)}`);
    const counts = { baselineCalls: before.calls, batchedCalls: after.calls,
      baselineMeshes: meshes(baseline.root).length, batchedMeshes: meshes(batched.root).length };
    baseline.root.visible = batched.root.visible = false;

    galleryWorld = new World(new TerrainGenerator(42, defaultWorldGenSettings));
    const chunk: Chunk = { x: 0, z: 0, cells: new Map() };
    const cells: Cell[] = ['stone', 'dirt', 'mossBlock', 'copperBlock', 'wood', 'grass',
      'leaves', 'darkOakLeaves', 'spruceLeaves', 'birchLeaves', 'jungleLeaves', 'cherryLeaves',
      'glass', 'ice', 'water', 'fern', 'flower', 'torch', 'lantern', 'soulLantern'].map((type) => ({ type } as Cell));
    cells.push({ type: 'itemFrame', item: 'dice' }, { type: 'itemFrame' });
    cells.forEach((cell, i) => chunk.cells.set(indexOf(1 + i % 6 * 2, 2, 1 + Math.floor(i / 6) * 2), cell));
    for (let x = 0; x < 13; x++) for (let z = 0; z < 9; z++) chunk.cells.set(indexOf(x, 0, z), { type: 'whiteWool' });
    galleryWorld.install(chunk);
    galleryBaseline = new ChunkRenderer(galleryWorld, scene, { workerFactory: null, materialBatching: false });
    galleryBatched = new ChunkRenderer(galleryWorld, scene, { workerFactory: null });
    galleryBaseline.rebuild(chunk); galleryBatched.rebuild(chunk);
    await frame(); // allow frame icon image callbacks
    camera.position.set(14, 13, 17); camera.lookAt(6, 1, 4);
    const galleryBefore = pixels(galleryBaseline, galleryBatched), galleryAfter = pixels(galleryBatched, galleryBaseline);
    const galleryVisual = difference(galleryBefore.data, galleryAfter.data);
    assert(galleryVisual.meanChannelError < .5 && galleryVisual.changedFraction < .01, `gallery appearance ${JSON.stringify(galleryVisual)}`);
    const water = meshes(galleryBatched.root).find((mesh) => mesh.userData.water)!;
    assert(water.material.transparent && !water.material.depthWrite && !water.castShadow, 'water remains separate and shadowless');
    galleryBatched.updateShadows(false); galleryBatched.updateShadows(true);
    assert(!water.castShadow && meshes(galleryBatched.root).filter((mesh) => !mesh.userData.water).every((mesh) => mesh.castShadow), 'shadow toggles preserve water exception');
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -18;
    sun.shadow.camera.right = sun.shadow.camera.top = 18;
    sun.shadow.camera.far = 100;
    const shadowBefore = pixels(galleryBaseline, galleryBatched), shadowAfter = pixels(galleryBatched, galleryBaseline);
    const shadowVisual = difference(shadowBefore.data, shadowAfter.data);
    assert(shadowVisual.meanChannelError < .5 && shadowVisual.changedFraction < .01, `cutout shadow parity ${JSON.stringify(shadowVisual)}`);
    assert(renderer.getContext().getError() === 0, 'atlas and alpha-shadow shaders compile without WebGL errors');
    const beforeRemoval = galleryBatched.renderRevision;
    galleryWorld.unload(0, 0); galleryBatched.flush();
    assert(galleryBatched.root.children.length === 0 && galleryBatched.renderRevision > beforeRemoval, 'removal invalidates shadows');
    return { triangles: 101482, atlases: batched.atlasCount, ...counts, visual, galleryVisual, shadowVisual, contracts: 'PASS' };
  } finally {
    galleryBaseline?.dispose(); galleryBatched?.dispose(); galleryWorld?.dispose();
    baseline.dispose(); batched.dispose(); world.dispose();
    sun.shadow.map?.dispose(); target.dispose(); renderer.dispose();
  }
}
