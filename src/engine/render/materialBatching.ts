import * as THREE from 'three';
import type { MeshBatchMaterials } from '../core/meshSnapshot';

const TILE = 16;
const CELL = 64;
const PAD = 16;
const ignored = new Set(['uuid', 'name', 'version', '_listeners', 'userData', 'color', 'map']);

/** Conservative compatibility: only static, untransformed nearest-filtered sRGB image maps. */
function familyKey(material: THREE.Material): string | undefined {
  if (!(material instanceof THREE.MeshLambertMaterial) || material.transparent || material.vertexColors ||
      material.opacity !== 1 || material.clippingPlanes ||
      material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
      material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return;
  const map = material.map;
  if (!map || map instanceof THREE.CanvasTexture || map instanceof THREE.DataTexture ||
      map.mapping !== THREE.UVMapping || map.channel !== 0 ||
      map.colorSpace !== THREE.SRGBColorSpace || !map.flipY || map.premultiplyAlpha ||
      map.type !== THREE.UnsignedByteType || map.format !== THREE.RGBAFormat ||
      map.minFilter !== THREE.NearestMipmapNearestFilter || map.magFilter !== THREE.NearestFilter ||
      map.wrapS !== THREE.ClampToEdgeWrapping || map.wrapT !== THREE.ClampToEdgeWrapping ||
      map.anisotropy !== 1 || map.mipmaps.length || !map.generateMipmaps ||
      !map.matrixAutoUpdate || map.rotation !== 0 || map.offset.x !== 0 || map.offset.y !== 0 ||
      map.repeat.x !== 1 || map.repeat.y !== 1) return;
  // Include every remaining render-state property, including emissive, alphaTest,
  // side/shadowSide, depth, blending, polygon offset and future Three material fields.
  const state = Object.entries(material).filter(([key]) => !ignored.has(key));
  if (state.some(([, value]) => value instanceof THREE.Texture || typeof value === 'function')) return;
  return JSON.stringify(state);
}

const linear = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const srgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

function downsample(data: Uint8Array, size: number) {
  const next = new Uint8Array(size * size);
  for (let y = 0; y < size / 2; y++) for (let x = 0; x < size / 2; x++) {
    const offsets = [((2 * y) * size + 2 * x) * 4, ((2 * y) * size + 2 * x + 1) * 4,
      ((2 * y + 1) * size + 2 * x) * 4, ((2 * y + 1) * size + 2 * x + 1) * 4];
    for (let channel = 0; channel < 4; channel++) {
      const average = offsets.reduce((sum, offset) => sum +
        (channel === 3 ? data[offset + channel] : linear(data[offset + channel])), 0) / 4;
      next[(y * size / 2 + x) * 4 + channel] = channel === 3 ? Math.round(average) : srgb(average);
    }
  }
  return next;
}

/** Each tile is filtered independently in linear light, with extruded edges at EVERY mip.
 * Five immutable mip levels end at the source's 1x1 texel, never an average of other tiles.
 * Typed pixel rows are explicitly bottom-up; DataTexture.flipY remains false.
 */
function makeAtlas(images: HTMLImageElement[]) {
  const columns = 2 ** Math.ceil(Math.log2(Math.ceil(Math.sqrt(images.length))));
  const rows = 2 ** Math.ceil(Math.log2(Math.ceil(images.length / columns)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Terrain atlas requires an available 2D canvas context');
  let tiles = images.map((image) => {
    context.clearRect(0, 0, TILE, TILE);
    context.drawImage(image, 0, 0);
    return new Uint8Array(context.getImageData(0, 0, TILE, TILE).data);
  });
  const mipmaps: { data: Uint8Array; width: number; height: number }[] = [];
  for (let level = 0; level <= 4; level++) {
    const size = TILE >> level, cell = CELL >> level, pad = PAD >> level;
    const width = columns * cell, height = rows * cell;
    const data = new Uint8Array(width * height * 4);
    tiles.forEach((tile, index) => {
      const ox = (index % columns) * cell, oy = Math.floor(index / columns) * cell;
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const sx = Math.max(0, Math.min(size - 1, x - pad));
        const sy = size - 1 - Math.max(0, Math.min(size - 1, y - pad));
        const source = (sy * size + sx) * 4, target = ((oy + y) * width + ox + x) * 4;
        data[target] = tile[source];
        data[target + 1] = tile[source + 1];
        data[target + 2] = tile[source + 2];
        data[target + 3] = tile[source + 3];
      }
    });
    mipmaps.push({ data, width, height });
    if (size > 1) tiles = tiles.map((tile) => downsample(tile, size));
  }
  const base = mipmaps[0];
  const texture = new THREE.DataTexture(base.data, base.width, base.height);
  texture.name = 'terrain-atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = false;
  // Three's WebGLTextures allocates mipmaps.length immutable levels via texStorage2D.
  // Immutable storage limits the effective maximum mip to 4, even though the atlas
  // dimensions could otherwise support more levels that would mix unrelated tiles.
  texture.mipmaps = mipmaps;
  texture.needsUpdate = true;
  return { texture, columns, width: base.width, height: base.height };
}

type Family = { ids: number[]; finished: boolean };
export type TerrainBatchingFallback = { readonly materialIds: readonly number[]; readonly reason: string };

/** Owns atlas textures only. The caller owns and disposes all materials in the supplied array.
 * Source images/textures are shared and are never mutated or disposed here.
 */
export class TerrainMaterialBatching {
  private families: Family[];
  private textures: THREE.Texture[] = [];
  private disposed = false;
  private layout: MeshBatchMaterials = {};
  private materials: THREE.Material[];
  private failures: TerrainBatchingFallback[] = [];
  constructor(materials: THREE.Material[]) {
    this.materials = materials;
    const groups = new Map<string, number[]>();
    materials.forEach((material, id) => {
      const key = familyKey(material);
      if (key === undefined) return;
      const group = groups.get(key) ?? [];
      group.push(id);
      groups.set(key, group);
    });
    this.families = [...groups.values()].filter((ids) => ids.length > 1).map((ids) => ({ ids, finished: false }));
  }
  get batches(): MeshBatchMaterials { return this.layout; }
  get atlasCount() { return this.textures.length; }
  get ready() { return this.families.every((family) => family.finished); }
  get fallbacks(): readonly TerrainBatchingFallback[] { return this.failures; }
  /** Called at rebuild/flush boundaries. TextureLoader fills .image only after onload.
   * Until an entire compatible family is ready, original materials remain fully usable.
   * Published layouts are immutable so an in-flight worker cannot observe a partial update.
   */
  refresh(): boolean {
    if (this.disposed) return false;
    let changed = false;
    for (const family of this.families) {
      if (family.finished) continue;
      const images = family.ids.map((id) => (this.materials[id] as THREE.MeshLambertMaterial).map!.image);
      if (images.some((image) => !image)) continue;
      family.finished = true;
      // Dynamic, animated-strip, non-16px and custom sources keep the baseline path.
      const ids = family.ids.filter((_, i) => images[i] instanceof HTMLImageElement &&
        images[i].complete && images[i].naturalWidth === TILE && images[i].naturalHeight === TILE);
      if (ids.length < 2) continue;
      let texture: THREE.Texture | undefined;
      let material: THREE.MeshLambertMaterial | undefined;
      try {
        const atlas = makeAtlas(ids.map((id) => (this.materials[id] as THREE.MeshLambertMaterial).map!.image as HTMLImageElement));
        texture = atlas.texture;
        material = (this.materials[ids[0]] as THREE.MeshLambertMaterial).clone();
        material.name = 'terrain-atlas';
        material.map = texture;
        material.color.setRGB(1, 1, 1);
        material.vertexColors = true;
        const materialId = this.materials.length;
        const layout = { ...this.layout };
        ids.forEach((id, index) => {
          const source = this.materials[id] as THREE.MeshLambertMaterial;
          layout[id] = {
            material: materialId,
            uv: [(index % atlas.columns * CELL + PAD) / atlas.width,
              (Math.floor(index / atlas.columns) * CELL + PAD) / atlas.height,
              TILE / atlas.width, TILE / atlas.height],
            color: [source.color.r, source.color.g, source.color.b],
          };
        });
        // Commit only after every texture/material/layout operation succeeds. Other
        // accepted families and old snapshots keep their exact material IDs on failure.
        this.materials.push(material);
        this.textures.push(texture);
        this.layout = layout;
        changed = true;
      } catch (error) {
        material?.dispose();
        texture?.dispose();
        this.failures.push(Object.freeze({ materialIds: Object.freeze([...ids]),
          reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }));
        // The family is settled on the original materials, without retrying a failed
        // canvas operation every frame. Optional batching must not stop rendering.
      }
    }
    return changed;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textures) texture.dispose();
    this.textures = [];
    this.layout = {};
  }
}
