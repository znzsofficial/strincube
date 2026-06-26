import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type {
  GameSettings,
  PlacedModelSettings,
  ModelPartSettings,
  ImportedModelItem,
  ModelImportOptions,
  StoredModel,
  PlacedModelEntity,
  ModelPart,
  MmdModelHandle,
  MmdRuntimeHandle,
} from './types';

export type { StoredModel, PlacedModelEntity, ModelPart, MmdModelHandle, MmdRuntimeHandle };

export interface ModelContext {
  scene: THREE.Scene;
  settings: GameSettings;
  gltfLoader: GLTFLoader;
  importedModelMaterials: Set<THREE.Material>;
  storedModels: Map<string, StoredModel>;
  placedModels: Map<string, PlacedModelEntity>;
  placedModelRaycastRoots: THREE.Object3D[];
  selectedPlacedModelId: string | null;
  modelItemSequence: number;
  placedModelSequence: number;
  modelPlacementRotation: number;
  modelPlacementScale: number;
  emitSnapshot: () => void;
  updateSelectedModelHelper: () => void;
  _colorHurtFlash: THREE.Color;
}

export function tuneMmdMaterial(material: THREE.Material): void {
  const mat = material as THREE.MeshStandardMaterial & THREE.MeshToonMaterial & THREE.MeshPhongMaterial;
  if ('color' in mat && mat.color instanceof THREE.Color && !mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
  if ('emissive' in mat && mat.emissive instanceof THREE.Color) mat.emissive.setHex(0x000000);
  if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0;
  if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 0.7, 0.82);
  if ('metalness' in mat) mat.metalness = Math.min(mat.metalness ?? 0, 0.05);
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.needsUpdate = true;
  }
  material.needsUpdate = true;
}

export function registerImportedMaterial(material: THREE.Material, importedModelMaterials: Set<THREE.Material>): void {
  const mat = material as THREE.Material & { color?: THREE.Color };
  if (mat.color instanceof THREE.Color && !material.userData.baseColor) material.userData.baseColor = mat.color.clone();
  if (material.userData.baseOpacity === undefined) material.userData.baseOpacity = material.opacity;
  if (material.userData.baseTransparent === undefined) material.userData.baseTransparent = material.transparent;
  if (material.userData.baseDepthWrite === undefined) material.userData.baseDepthWrite = material.depthWrite;
  importedModelMaterials.add(material);
}

export function applyModelBrightness(importedModelMaterials: Set<THREE.Material>, modelBrightness: number): void {
  for (const material of importedModelMaterials) {
    const mat = material as THREE.Material & { color?: THREE.Color };
    const baseColor = material.userData.baseColor as THREE.Color | undefined;
    if (mat.color instanceof THREE.Color && baseColor) {
      mat.color.copy(baseColor).multiplyScalar(modelBrightness);
    }
  }
}

export function collectObjectMaterials(object: THREE.Object3D): THREE.Material[] {
  const materials: THREE.Material[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    materials.push(...childMaterials);
  });
  return materials;
}

export function collectModelParts(object: THREE.Object3D): ModelPart[] {
  const parts: ModelPart[] = [];
  const seenMaterials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    childMaterials.forEach((material, materialIndex) => {
      if (seenMaterials.has(material)) return;
      seenMaterials.add(material);
      const rawName = material.name || child.name || `部件 ${parts.length + 1}`;
      const slotSuffix = childMaterials.length > 1 ? ` #${materialIndex + 1}` : '';
      parts.push({
        id: `part-${parts.length.toString(36)}`,
        name: `${rawName}${slotSuffix}`,
        visible: material.visible,
        opacity: typeof material.userData.baseOpacity === 'number' ? material.userData.baseOpacity : material.opacity,
        material,
      });
    });
  });
  return parts;
}

export function prepareImportedObject(object: THREE.Object3D, shadows: boolean, importedModelMaterials: Set<THREE.Material>): THREE.Material[] {
  const materials = collectObjectMaterials(object);
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = shadows;
      child.receiveShadow = true;
    }
  });
  materials.forEach((material) => registerImportedMaterial(material, importedModelMaterials));
  return materials;
}

export function tuneMmdObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => tuneMmdMaterial(material));
  });
}

export function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | undefined {
  let skinnedMesh: THREE.SkinnedMesh | undefined;
  root.traverse((child) => {
    if (!skinnedMesh && child instanceof THREE.SkinnedMesh) skinnedMesh = child;
  });
  return skinnedMesh;
}

export function applyPlacedModelSettings(entity: PlacedModelEntity, settings: GameSettings, updateSelectedModelHelper: () => void): void {
  entity.root.position.copy(entity.anchor).add(entity.offset);
  if (entity.animation !== 'idle') entity.root.rotation.z = 0;
  entity.root.scale.setScalar(entity.baseScale * entity.scale);
  entity.root.visible = entity.visible;

  const wantShadow = entity.shadows && settings.shadows;
  if (entity._lastShadow !== wantShadow) {
    entity._lastShadow = wantShadow;
    entity.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = wantShadow;
        child.receiveShadow = entity.shadows;
      }
    });
  }

  for (const material of entity.materials) {
    const mat = material as THREE.Material & { color?: THREE.Color };
    const baseColor = material.userData.baseColor as THREE.Color | undefined;
    if (mat.color instanceof THREE.Color && baseColor) {
      mat.color.copy(baseColor).multiplyScalar(settings.modelBrightness * entity.brightness);
    }
    const part = entity.partByMaterial.get(material);
    const baseOpacity = typeof material.userData.baseOpacity === 'number' ? material.userData.baseOpacity : 1;
    const baseTransparent = Boolean(material.userData.baseTransparent);
    const baseDepthWrite = material.userData.baseDepthWrite !== false;
    const opacity = entity.opacity * (part?.opacity ?? 1) * baseOpacity;
    material.visible = part?.visible ?? true;
    material.transparent = opacity < 0.98 || baseTransparent;
    material.opacity = opacity;
    material.depthWrite = opacity >= 0.98 && baseDepthWrite;
  }
  updateSelectedModelHelper();
}

export function flashEntityMaterials(entity: PlacedModelEntity, strength: number, colorHurtFlash: THREE.Color, modelBrightness: number): void {
  for (const material of entity.materials) {
    const mat = material as THREE.Material & { color?: THREE.Color };
    const baseColor = material.userData.baseColor as THREE.Color | undefined;
    if (mat.color instanceof THREE.Color && baseColor) {
      mat.color.copy(baseColor).lerp(colorHurtFlash, strength).multiplyScalar(modelBrightness * entity.brightness);
    }
  }
}

export function updateProgress(options: ModelImportOptions | undefined, progress: number, label: string, fileName?: string): void {
  options?.onProgress?.({ progress: THREE.MathUtils.clamp(progress, 0, 1), label, fileName });
}

export function noteMmdSupport(): string {
  return 'PMX/PMD folders are supported through @yohawing/three-mmd-loader texture maps.';
}

export async function loadMmdTools(): Promise<any> {
  return import('@yohawing/three-mmd-loader');
}

export function updateSelectedPlacedModel(ctx: ModelContext, nextSettings: Partial<Omit<PlacedModelSettings, 'id' | 'name'>>): void {
  if (!ctx.selectedPlacedModelId) return;
  const entity = ctx.placedModels.get(ctx.selectedPlacedModelId);
  if (!entity) return;
  if (nextSettings.rotation !== undefined) entity.root.rotation.y = nextSettings.rotation;
  if (nextSettings.scale !== undefined) entity.scale = THREE.MathUtils.clamp(nextSettings.scale, 0.15, 4);
  if (nextSettings.offsetX !== undefined) entity.offset.x = THREE.MathUtils.clamp(nextSettings.offsetX, -8, 8);
  if (nextSettings.offsetY !== undefined) entity.offset.y = THREE.MathUtils.clamp(nextSettings.offsetY, -8, 8);
  if (nextSettings.offsetZ !== undefined) entity.offset.z = THREE.MathUtils.clamp(nextSettings.offsetZ, -8, 8);
  if (nextSettings.brightness !== undefined) entity.brightness = THREE.MathUtils.clamp(nextSettings.brightness, 0.2, 2);
  if (nextSettings.opacity !== undefined) entity.opacity = THREE.MathUtils.clamp(nextSettings.opacity, 0.15, 1);
  if (nextSettings.visible !== undefined) entity.visible = nextSettings.visible;
  if (nextSettings.shadows !== undefined) entity.shadows = nextSettings.shadows;
  if (nextSettings.damageable !== undefined) entity.damageable = nextSettings.damageable;
  if (nextSettings.maxHealth !== undefined) {
    entity.maxHealth = THREE.MathUtils.clamp(nextSettings.maxHealth, 5, 300);
    entity.health = Math.min(entity.health, entity.maxHealth);
  }
  if (nextSettings.health !== undefined) entity.health = THREE.MathUtils.clamp(nextSettings.health, 0, entity.maxHealth);
  if (nextSettings.animation !== undefined) entity.animation = nextSettings.animation;
  if (nextSettings.vmdPlaying !== undefined) entity.vmdPlaying = nextSettings.vmdPlaying;
  if (nextSettings.animationSpeed !== undefined) entity.animationSpeed = THREE.MathUtils.clamp(nextSettings.animationSpeed, 0, 3);
  if (nextSettings.animationDistance !== undefined) entity.animationDistance = THREE.MathUtils.clamp(nextSettings.animationDistance, 8, 120);
  applyPlacedModelSettings(entity, ctx.settings, ctx.updateSelectedModelHelper);
  ctx.emitSnapshot();
}

export function updateSelectedModelPart(ctx: ModelContext, partId: string, nextSettings: Partial<Omit<ModelPartSettings, 'id' | 'name'>>): void {
  if (!ctx.selectedPlacedModelId) return;
  const entity = ctx.placedModels.get(ctx.selectedPlacedModelId);
  if (!entity) return;
  const part = entity.parts.find((modelPart) => modelPart.id === partId);
  if (!part) return;
  if (nextSettings.visible !== undefined) part.visible = nextSettings.visible;
  if (nextSettings.opacity !== undefined) part.opacity = THREE.MathUtils.clamp(nextSettings.opacity, 0, 1);
  applyPlacedModelSettings(entity, ctx.settings, ctx.updateSelectedModelHelper);
  ctx.emitSnapshot();
}

export function damagePlacedModel(ctx: ModelContext, entity: PlacedModelEntity, amount: number, knockback?: THREE.Vector3): void {
  if (!entity.damageable || entity.hurtCooldown > 0 || entity.health <= 0) return;
  entity.health = Math.max(0, entity.health - amount);
  entity.hurtCooldown = 0.22;
  entity.hurtFlash = 0.18;
  if (knockback) {
    entity.velocity.add(knockback);
    entity.velocityY = 6;
  }
  ctx.selectedPlacedModelId = entity.id;
  ctx.updateSelectedModelHelper();
  if (entity.health <= 0) destroyPlacedModel(ctx, entity);
  ctx.emitSnapshot();
}

export function destroyPlacedModel(ctx: ModelContext, entity: PlacedModelEntity): void {
  ctx.scene.remove(entity.root);
  ctx.placedModels.delete(entity.id);
  const index = ctx.placedModelRaycastRoots.indexOf(entity.root);
  if (index >= 0) ctx.placedModelRaycastRoots.splice(index, 1);
  if (ctx.selectedPlacedModelId === entity.id) ctx.selectedPlacedModelId = null;
  ctx.updateSelectedModelHelper();
}

export function selectPlacedModel(ctx: ModelContext, entity: PlacedModelEntity | null): void {
  ctx.selectedPlacedModelId = entity?.id ?? null;
  ctx.updateSelectedModelHelper();
  ctx.emitSnapshot();
}

export function removeSelectedPlacedModel(ctx: ModelContext): void {
  if (!ctx.selectedPlacedModelId) return;
  const entity = ctx.placedModels.get(ctx.selectedPlacedModelId);
  if (!entity) return;
  ctx.scene.remove(entity.root);
  ctx.placedModels.delete(entity.id);
  const index = ctx.placedModelRaycastRoots.indexOf(entity.root);
  if (index >= 0) ctx.placedModelRaycastRoots.splice(index, 1);
  ctx.selectedPlacedModelId = null;
  ctx.updateSelectedModelHelper();
  ctx.emitSnapshot();
}

export function findPlacedModelFromObject(ctx: ModelContext, object: THREE.Object3D): PlacedModelEntity | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const id = current.userData.placedModelId as string | undefined;
    if (id) return ctx.placedModels.get(id) ?? null;
    current = current.parent;
  }
  return null;
}

export function placeImportedObject(ctx: ModelContext, object: THREE.Object3D, position: THREE.Vector3, scale = 1, kind: 'generic' | 'mmd' = 'generic'): THREE.Object3D {
  object.position.copy(position);
  object.scale.setScalar(scale);
  if (kind === 'mmd') tuneMmdObject(object);
  prepareImportedObject(object, ctx.settings.shadows, ctx.importedModelMaterials);
  applyModelBrightness(ctx.importedModelMaterials, ctx.settings.modelBrightness);
  ctx.scene.add(object);
  return object;
}

export function registerImportedModel(ctx: ModelContext, root: THREE.Object3D, name: string, kind: 'generic' | 'mmd', scale = 1, mmdModel?: MmdModelHandle): ImportedModelItem {
  const id = `model-${Date.now().toString(36)}-${ctx.modelItemSequence.toString(36)}`;
  ctx.modelItemSequence += 1;
  root.visible = false;
  if (kind === 'mmd') tuneMmdObject(root);
  const preparedRoot = SkeletonUtils.clone(root);
  preparedRoot.visible = false;
  const materials = prepareImportedObject(preparedRoot, ctx.settings.shadows, ctx.importedModelMaterials);
  const previewBox = new THREE.Box3().setFromObject(preparedRoot);
  const previewSize = previewBox.getSize(new THREE.Vector3());
  const previewCenter = previewBox.getCenter(new THREE.Vector3());
  ctx.storedModels.set(id, { id, name, kind, root: preparedRoot, mmdModel, scale, materials, previewSize, previewCenter });
  return { id, name, kind };
}

export function placeStoredModel(ctx: ModelContext, modelId: string, position: THREE.Vector3): THREE.Object3D | null {
  const stored = ctx.storedModels.get(modelId);
  if (!stored) return null;
  const clone = SkeletonUtils.clone(stored.root);
  clone.visible = true;
  clone.position.copy(position);
  clone.rotation.y = ctx.modelPlacementRotation;
  clone.scale.setScalar(stored.scale * ctx.modelPlacementScale);

  const sharedMaterials = stored.materials;
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = ctx.settings.shadows;
      child.receiveShadow = true;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => {
          const found = sharedMaterials.find((sm) => sm.uuid === m.uuid || sm.name === m.name);
          return found ?? m;
        });
      } else {
        const found = sharedMaterials.find((sm) => sm.uuid === child.material.uuid || sm.name === child.material.name);
        if (found) child.material = found;
      }
    }
  });

  const materials = sharedMaterials;
  materials.forEach((material) => registerImportedMaterial(material, ctx.importedModelMaterials));
  const parts = collectModelParts(clone);
  const partByMaterial = new Map(parts.map((part) => [part.material, part]));
  applyModelBrightness(ctx.importedModelMaterials, ctx.settings.modelBrightness);
  const placedId = `placed-${Date.now().toString(36)}-${ctx.placedModelSequence.toString(36)}`;
  ctx.placedModelSequence += 1;
  clone.userData.placedModelId = placedId;
  clone.traverse((child) => {
    child.userData.placedModelId = placedId;
  });
  const entity: PlacedModelEntity = {
    id: placedId,
    modelId,
    name: stored.name,
    root: clone,
    anchor: position.clone(),
    baseScale: stored.scale,
    scale: ctx.modelPlacementScale,
    offset: new THREE.Vector3(),
    brightness: 1,
    opacity: 1,
    visible: true,
    shadows: true,
    damageable: true,
    health: 40,
    maxHealth: 40,
    hurtCooldown: 0,
    hurtFlash: 0,
    velocity: new THREE.Vector3(),
    velocityY: 0,
    animation: 'none',
    vmdPlaying: false,
    vmdTime: 0,
    mmdMesh: stored.kind === 'mmd' ? findSkinnedMesh(clone) : undefined,
    animationSpeed: 1,
    animationDistance: 48,
    animationPhase: Math.random() * Math.PI * 2,
    animationTick: 0,
    materials,
    parts,
    partByMaterial,
  };
  ctx.placedModels.set(placedId, entity);
  ctx.placedModelRaycastRoots.push(clone);
  ctx.scene.add(clone);
  applyPlacedModelSettings(entity, ctx.settings, ctx.updateSelectedModelHelper);
  selectPlacedModel(ctx, entity);
  return clone;
}

export async function importGltfModel(ctx: ModelContext, url: string, position = new THREE.Vector3()): Promise<THREE.Object3D> {
  const gltf = await ctx.gltfLoader.loadAsync(url);
  gltf.scene.position.copy(position);
  gltf.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = ctx.settings.shadows;
      object.receiveShadow = true;
    }
  });
  ctx.scene.add(gltf.scene);
  return gltf.scene;
}

export async function importMmdModel(ctx: ModelContext, source: File | string, position = new THREE.Vector3()): Promise<THREE.Object3D> {
  const { ThreeMmdLoader } = await loadMmdTools();
  const mmdLoader = new ThreeMmdLoader();
  const model = await mmdLoader.loadModel(source);
  return placeImportedObject(ctx, model.root, position, 0.12, 'mmd');
}

export async function importMmdModelFiles(ctx: ModelContext, files: File[], modelFile: File, options?: ModelImportOptions, progressStart = 0, progressSpan = 1): Promise<ImportedModelItem> {
  updateProgress(options, progressStart + progressSpan * 0.08, '读取 MMD 文件', modelFile.name);
  const { createMmdTextureMapFromFiles, ThreeMmdLoader } = await loadMmdTools();
  updateProgress(options, progressStart + progressSpan * 0.18, '准备贴图映射', modelFile.name);
  const loader = new ThreeMmdLoader({ textureMap: createMmdTextureMapFromFiles(files, modelFile) });
  updateProgress(options, progressStart + progressSpan * 0.28, '解析 PMX/PMD', modelFile.name);
  const model = await loader.loadModel(modelFile);
  updateProgress(options, progressStart + progressSpan * 0.82, '注册可放置模型', modelFile.name);
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  return registerImportedModel(ctx, model.root, modelFile.name, 'mmd', 0.12, model as MmdModelHandle);
}

export async function importGltfModelFile(ctx: ModelContext, file: File, options?: ModelImportOptions): Promise<ImportedModelItem> {
  const url = URL.createObjectURL(file);
  try {
    updateProgress(options, 0.15, '读取 GLTF/GLB', file.name);
    const gltf = await ctx.gltfLoader.loadAsync(url);
    updateProgress(options, 0.85, '注册可放置模型', file.name);
    return registerImportedModel(ctx, gltf.scene, file.name, 'generic', 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importModelFiles(ctx: ModelContext, files: File[], options?: ModelImportOptions): Promise<ImportedModelItem[]> {
  const hasMmdFiles = files.some((file) => file.name.match(/\.(pmx|pmd)$/i));
  if (!hasMmdFiles) {
    const gltfModel = files.find((file) => file.name.match(/\.(glb|gltf)$/i));
    if (gltfModel) return importModelFile(ctx, gltfModel, options);
    return Promise.reject(new Error('No supported model file found.'));
  }

  updateProgress(options, 0.03, '扫描 MMD 文件夹');
  const { findMmdModelFiles } = await loadMmdTools();
  const mmdModels = findMmdModelFiles(files);
  if (mmdModels.length > 0) {
    const imported: ImportedModelItem[] = [];
    for (const [index, mmdModel] of mmdModels.entries()) {
      const start = 0.06 + (index / mmdModels.length) * 0.9;
      const span = 0.9 / mmdModels.length;
      try {
        imported.push(await importMmdModelFiles(ctx, files, mmdModel, options, start, span));
        updateProgress(options, start + span, `已处理 ${index + 1}/${mmdModels.length}`, mmdModel.name);
      } catch (error) {
        console.warn(`Failed to import MMD model ${mmdModel.name}`, error);
      }
    }
    updateProgress(options, 1, '导入完成');
    if (imported.length > 0) return imported;
  }

  const gltfModel = files.find((file) => file.name.match(/\.(glb|gltf)$/i));
  if (gltfModel) return importModelFile(ctx, gltfModel, options);

  return Promise.reject(new Error('No supported model file found.'));
}

export async function importModelFile(ctx: ModelContext, file: File, options?: ModelImportOptions): Promise<ImportedModelItem[]> {
  if (file.name.match(/\.(pmx|pmd)$/i)) {
    const item = await importMmdModelFiles(ctx, [file], file, options);
    updateProgress(options, 1, '导入完成', file.name);
    return [item];
  }
  const item = await importGltfModelFile(ctx, file, options);
  updateProgress(options, 1, '导入完成', file.name);
  return [item];
}

export async function importVmdForSelectedModel(ctx: ModelContext, file: File): Promise<void> {
  if (!ctx.selectedPlacedModelId) throw new Error('No placed model selected.');
  const entity = ctx.placedModels.get(ctx.selectedPlacedModelId);
  if (!entity || !entity.mmdMesh) throw new Error('Selected model does not support VMD.');
  const { ThreeMmdLoader } = await loadMmdTools();
  const loader = new ThreeMmdLoader();
  const loaded = await loader.loadAnimation(file);
  entity.vmdAnimation = loaded.animation;
  entity.vmdName = file.name;
  entity.vmdPlaying = false;
  entity.vmdTime = 0;
  entity.animation = 'none';
  const runtime = await createMmdRuntimeForEntity(ctx, entity);
  runtime?.setAnimation?.(entity.vmdAnimation, entity.mmdMesh);
  ctx.emitSnapshot();
}

export async function createMmdRuntimeForEntity(_ctx: ModelContext, entity: PlacedModelEntity): Promise<MmdRuntimeHandle | undefined> {
  if (entity.mmdRuntime || !entity.mmdMesh) return entity.mmdRuntime;
  const { DefaultMmdRuntime } = await loadMmdTools();
  entity.mmdRuntime = new DefaultMmdRuntime({ physics: 'none' }) as MmdRuntimeHandle;
  if (entity.vmdAnimation) entity.mmdRuntime.setAnimation?.(entity.vmdAnimation, entity.mmdMesh);
  return entity.mmdRuntime;
}
