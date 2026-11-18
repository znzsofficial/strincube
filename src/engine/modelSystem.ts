import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as helpers from './modelHelpers';
import type { GameSettings, ImportedModelItem, ModelImportOptions, PlacedModelSettings } from './types';

export type ModelAsset = { id: string; name: string; files: File[]; paths: string[] };
export type ModelPlacement = {
  id: string;
  modelId: string;
  x: number;
  y: number;
  z: number;
  settings: PlacedModelSettings;
  vmd?: File;
};

/** Owns imported assets and instances. The old format loaders are adapters only. */
export class ModelSystem {
  private readonly context: helpers.ModelContext;
  private assets: ModelAsset[] = [];
  private motions = new Map<string, File>();
  private decoder = new DRACOLoader();
  private disposed = false;
  constructor(scene: THREE.Scene, settings: GameSettings, changed: () => void) {
    this.decoder.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.context = {
      scene,
      settings,
      storedModels: new Map(),
      placedModels: new Map(),
      importedModelMaterials: new Set(),
      placedModelRaycastRoots: [],
      selectedPlacedModelId: null,
      modelItemSequence: 0,
      placedModelSequence: 0,
      modelPlacementRotation: 0,
      modelPlacementScale: 1,
      emitSnapshot: changed,
      updateSelectedModelHelper: () => {},
      _colorHurtFlash: new THREE.Color(0xff4444),
    };
  }
  get items(): ImportedModelItem[] {
    return [...this.context.storedModels.values()].map(({ id, name, kind }) => ({ id, name, kind }));
  }
  get placement() {
    return { rotation: this.context.modelPlacementRotation, scale: this.context.modelPlacementScale };
  }
  adjustPlacement(rotationDelta = 0, scaleDelta = 0) {
    this.context.modelPlacementRotation += rotationDelta;
    this.context.modelPlacementScale = Math.max(
      0.15,
      Math.min(4, this.context.modelPlacementScale + scaleDelta),
    );
  }
  clearSelection() {
    this.context.selectedPlacedModelId = null;
  }
  get selectedSettings() {
    const id = this.context.selectedPlacedModelId;
    return id ? this.settingsFor(id) : undefined;
  }
  intersect(raycaster: THREE.Raycaster) {
    return raycaster.intersectObjects(this.context.placedModelRaycastRoots, true)[0];
  }
  applySettings() {
    for (const entity of this.context.placedModels.values()) {
      helpers.applyPlacedModelSettings(entity, this.context.settings, () => {});
    }
  }
  private async loadFile(files: File[], file: File, options?: ModelImportOptions) {
    if (/\.(pmx|pmd)$/i.test(file.name))
      return helpers.importMmdModelFiles(this.context, files, file, options);
    const manager = new THREE.LoadingManager(),
      urls = new Map<string, string>();
    const normalize = (name: string) => decodeURIComponent(name).replaceAll('\\', '/').replace(/^\.\//, '');
    for (const f of files) {
      const url = URL.createObjectURL(f);
      urls.set(normalize(f.webkitRelativePath || f.name), url);
      if (!urls.has(f.name)) urls.set(f.name, url);
    }
    const base = (file.webkitRelativePath || file.name).split('/').slice(0, -1).join('/');
    manager.setURLModifier((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      const path = normalize(url);
      return (
        urls.get(path) ?? urls.get(base ? `${base}/${path}` : path) ?? urls.get(path.split('/').pop()!) ?? url
      );
    });
    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(this.decoder);
    try {
      options?.onProgress?.({ progress: 0.2, label: '读取模型与贴图', fileName: file.name });
      const gltf = await loader.loadAsync(urls.get(normalize(file.webkitRelativePath || file.name))!);
      return helpers.registerImportedModel(this.context, gltf.scene, file.name, 'generic');
    } finally {
      for (const url of new Set(urls.values())) URL.revokeObjectURL(url);
    }
  }
  async import(files: File[], options?: ModelImportOptions) {
    const candidates = files.filter((f) => /\.(pmx|pmd|glb|gltf)$/i.test(f.name));
    if (!candidates.length) throw new Error('文件夹内没有支持的模型');
    const items: ImportedModelItem[] = [];
    for (const file of candidates) {
      const item = await this.loadFile(files, file, options);
      items.push(item);
      this.assets.push({
        id: item.id,
        name: file.webkitRelativePath || file.name,
        files,
        paths: files.map((f) => f.webkitRelativePath || f.name),
      });
    }
    if (this.disposed) {
      this.release();
      throw new Error('游戏已退出，导入已取消');
    }
    options?.onProgress?.({ progress: 1, label: '导入完成' });
    return items;
  }
  place(modelId: string, position: THREE.Vector3) {
    const root = helpers.placeStoredModel(this.context, modelId, position);
    if (!root) return null;
    const entity = helpers.findPlacedModelFromObject(this.context, root)!;
    // Instance appearance must not mutate another copy of the same model.
    const materialMap = new Map<THREE.Material, THREE.Material>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const clone = (m: THREE.Material) => {
          let n = materialMap.get(m);
          if (!n) {
            n = m.clone();
            materialMap.set(m, n);
          }
          return n;
        };
        o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
      }
    });
    entity.materials = [...materialMap.values()];
    entity.parts = helpers.collectModelParts(root);
    entity.partByMaterial = new Map(entity.parts.map((p) => [p.material, p]));
    for (const m of entity.materials) this.context.importedModelMaterials.add(m);
    helpers.applyPlacedModelSettings(entity, this.context.settings, () => {});
    return root;
  }
  private get selected() {
    return this.context.selectedPlacedModelId
      ? this.context.placedModels.get(this.context.selectedPlacedModelId)
      : undefined;
  }
  settingsFor(id: string): PlacedModelSettings | undefined {
    const e = this.context.placedModels.get(id);
    if (!e) return;
    return {
      id: e.id,
      name: e.name,
      rotation: e.root.rotation.y,
      scale: e.scale,
      offsetX: e.offset.x,
      offsetY: e.offset.y,
      offsetZ: e.offset.z,
      brightness: e.brightness,
      opacity: e.opacity,
      visible: e.visible,
      shadows: e.shadows,
      damageable: e.damageable,
      health: e.health,
      maxHealth: e.maxHealth,
      animation: e.animation,
      vmdName: e.vmdName,
      vmdPlaying: e.vmdPlaying,
      animationSpeed: e.animationSpeed,
      animationDistance: e.animationDistance,
      parts: e.parts.map(({ id, name, opacity, visible }) => ({ id, name, opacity, visible })),
    };
  }
  update(settings: Partial<Omit<PlacedModelSettings, 'id' | 'name'>>) {
    helpers.updateSelectedPlacedModel(this.context, settings);
  }
  updatePart(id: string, settings: Partial<{ opacity: number; visible: boolean }>) {
    helpers.updateSelectedModelPart(this.context, id, settings);
  }
  async motion(file: File) {
    const id = this.selected?.id;
    await helpers.importVmdForSelectedModel(this.context, file);
    if (id) this.motions.set(id, file);
  }
  select(object: THREE.Object3D) {
    helpers.selectPlacedModel(this.context, helpers.findPlacedModelFromObject(this.context, object));
  }
  remove() {
    const entity = this.selected;
    if (entity) {
      for (const m of entity.materials) {
        this.context.importedModelMaterials.delete(m);
        m.dispose();
      }
      this.motions.delete(entity.id);
    }
    helpers.removeSelectedPlacedModel(this.context);
  }
  tick(dt: number, camera: THREE.Camera) {
    let shadowChanged = false;
    for (const e of this.context.placedModels.values()) {
      e.hurtCooldown = Math.max(0, e.hurtCooldown - dt);
      if (e.root.position.distanceTo(camera.position) > e.animationDistance) continue;
      const oldY = e.root.position.y, oldRotation = e.root.rotation.y;
      e.animationPhase += dt * e.animationSpeed;
      if (e.animation === 'spin') e.root.rotation.y += dt * e.animationSpeed;
      if (e.animation === 'idle')
        e.root.position.y = e.anchor.y + e.offset.y + Math.sin(e.animationPhase * 2) * 0.08;
      if (e.animation === 'lookAtPlayer')
        e.root.rotation.y = Math.atan2(
          camera.position.x - e.root.position.x,
          camera.position.z - e.root.position.z,
        );
      if (e.vmdPlaying) {
        e.vmdTime += dt * e.animationSpeed;
        e.mmdRuntime?.tick?.(e.vmdTime, { mesh: e.mmdMesh, physics: false, ik: true });
        if (dt > 0 && e.animationSpeed !== 0 && e.mmdRuntime) shadowChanged = true;
      }
      if (e.root.position.y !== oldY || e.root.rotation.y !== oldRotation) shadowChanged = true;
    }
    return shadowChanged;
  }
  snapshot() {
    return {
      assets: this.assets.map((asset) => ({ ...asset, files: [...asset.files], paths: [...asset.paths] })),
      placements: [...this.context.placedModels.values()].map((e) => ({
        id: e.id,
        modelId: e.modelId,
        x: e.anchor.x,
        y: e.anchor.y,
        z: e.anchor.z,
        settings: this.settingsFor(e.id)!,
        vmd: this.motions.get(e.id),
      })),
    };
  }
  async restore(assets: ModelAsset[], placements: ModelPlacement[], progress: (label: string) => void) {
    for (const asset of assets) {
      progress(`恢复模型 · ${asset.name}`);
      const files = asset.files.map((file, i) => {
        const f = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
        Object.defineProperty(f, 'webkitRelativePath', { value: asset.paths[i] ?? file.name });
        return f;
      });
      const file = files.find((f) => (f.webkitRelativePath || f.name) === asset.name);
      if (!file) throw new Error(`缺少模型文件：${asset.name}`);
      const item = await this.loadFile(files, file);
      const stored = this.context.storedModels.get(item.id)!;
      this.context.storedModels.delete(item.id);
      stored.id = asset.id;
      this.context.storedModels.set(asset.id, stored);
      this.assets.push(asset);
    }
    for (const placement of placements) {
      const root = this.place(placement.modelId, new THREE.Vector3(placement.x, placement.y, placement.z));
      if (!root) throw new Error(`缺少模型资源：${placement.modelId}`);
      const entity = this.selected!;
      this.context.placedModels.delete(entity.id);
      entity.id = placement.id;
      root.traverse((object) => {
        object.userData.placedModelId = placement.id;
      });
      this.context.placedModels.set(placement.id, entity);
      this.context.selectedPlacedModelId = placement.id;
      this.update(placement.settings);
      for (const part of placement.settings.parts) this.updatePart(part.id, part);
      if (placement.vmd) {
        await this.motion(placement.vmd);
        this.update({ vmdPlaying: placement.settings.vmdPlaying });
      }
    }
    this.context.selectedPlacedModelId = null;
  }
  private release() {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    for (const item of [...this.context.storedModels.values(), ...this.context.placedModels.values()]) {
      item.root.removeFromParent();
      item.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
        }
      });
    }
    for (const m of this.context.importedModelMaterials) materials.add(m);
    for (const m of materials) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
      m.dispose();
    }
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    this.context.storedModels.clear();
    this.context.placedModels.clear();
    this.context.importedModelMaterials.clear();
    this.context.placedModelRaycastRoots.length = 0;
  }
  dispose() {
    this.disposed = true;
    this.release();
    this.decoder.dispose();
    this.assets = [];
    this.motions.clear();
  }
}
