import type * as THREE from 'three';
import type { BlockType } from './blocks';

// ──── Settings ────

export type GameSettings = {
  mouseSensitivity: number;
  moveSpeed: number;
  daySpeed: number;
  pixelRatio: number;
  shadows: boolean;
  viewDistance: number;
  modelBrightness: number;
  breakSpeed: number;
  showFps: boolean;
  timeOfDay: number;
  infiniteWaterSpread: boolean;
  rendererBackend: 'webgl' | 'webgpu';
};

export type WorldGenSettings = {
  worldSize: 'small' | 'medium' | 'large' | 'huge';
  worldSizeCustom?: number;
  treeDensity: 'none' | 'sparse' | 'normal' | 'dense';
  structureDensity: 'none' | 'sparse' | 'normal' | 'dense';
  oreDensity: 'none' | 'sparse' | 'normal' | 'rich';
  plantDensity: 'none' | 'sparse' | 'normal' | 'lush';
  flatWorld: boolean;
  infiniteWorld: boolean;
  mountainScale: number;
  oceanScale: number;
  riverScale: number;
  biomeScale: number;
  seed?: number;
};

export type ChunkState = 'empty' | 'terrain' | 'populated' | 'meshed';

export type GeneratedStage = 'none' | 'terrain' | 'populated';

export type BlockEdit = {
  x: number;
  y: number;
  z: number;
  type: BlockType | null;
};

export type WaterEdit = {
  x: number;
  y: number;
  z: number;
  distance?: number;
  level?: number;
  source?: boolean;
  falling?: boolean;
  static?: boolean;
  removed?: boolean;
};

export type ChunkSaveData = {
  version: 1;
  chunkX: number;
  chunkZ: number;
  generatedStage: GeneratedStage;
  blockEdits: BlockEdit[];
  waterEdits: WaterEdit[];
  structureRefs: string[];
  modified?: boolean;
};

export type ChunkData = {
  chunkX: number;
  chunkZ: number;
  state: ChunkState;
  generatedStage: GeneratedStage;
  dirtyMesh: boolean;
  dirtyWaterMesh: boolean;
  modified: boolean;
  structureRefs: string[];
  blockEdits: BlockEdit[];
  waterEdits: WaterEdit[];
  lastAccessTime?: number;
};

export const worldSizePresets: Record<WorldGenSettings['worldSize'], number> = {
  small: 40,
  medium: 80,
  large: 120,
  huge: 200,
};

export function getWorldRadius(settings: WorldGenSettings): number {
  if (settings.worldSizeCustom != null) return settings.worldSizeCustom;
  return worldSizePresets[settings.worldSize];
}

export const defaultWorldGenSettings: WorldGenSettings = {
  worldSize: 'medium',
  treeDensity: 'normal',
  structureDensity: 'normal',
  oreDensity: 'normal',
  plantDensity: 'normal',
  flatWorld: false,
  infiniteWorld: true,
  mountainScale: 1,
  oceanScale: 1,
  riverScale: 1,
  biomeScale: 1,
};

// ──── Model types ────

export type ModelPartSettings = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
};

export type PlacedModelSettings = {
  id: string;
  name: string;
  rotation: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  brightness: number;
  opacity: number;
  visible: boolean;
  shadows: boolean;
  damageable: boolean;
  health: number;
  maxHealth: number;
  animation: 'none' | 'idle' | 'spin' | 'lookAtPlayer';
  vmdName?: string;
  vmdPlaying: boolean;
  animationSpeed: number;
  animationDistance: number;
  parts: ModelPartSettings[];
};

export type ImportedModelItem = {
  id: string;
  name: string;
  kind: 'generic' | 'mmd';
};

export type ModelImportProgress = {
  progress: number;
  label: string;
  fileName?: string;
};

export type ModelImportOptions = {
  onProgress?: (progress: ModelImportProgress) => void;
};

export type MmdModelHandle = {
  root: THREE.Object3D;
  mesh?: THREE.SkinnedMesh;
  setAnimation?: (animation: unknown) => void;
  update?: (seconds: number, options?: { physics?: boolean; ik?: boolean }) => unknown;
};

export type MmdRuntimeHandle = {
  setAnimation?: (animation: unknown, mesh: THREE.SkinnedMesh) => void;
  tick?: (seconds: number, options?: { mesh?: THREE.Object3D; physics?: boolean; ik?: boolean }) => unknown;
};

export type ModelPart = ModelPartSettings & {
  material: THREE.Material;
};

export type PlacedModelEntity = {
  id: string;
  modelId: string;
  name: string;
  root: THREE.Object3D;
  anchor: THREE.Vector3;
  baseScale: number;
  scale: number;
  offset: THREE.Vector3;
  brightness: number;
  opacity: number;
  visible: boolean;
  shadows: boolean;
  damageable: boolean;
  health: number;
  maxHealth: number;
  hurtCooldown: number;
  hurtFlash: number;
  velocity: THREE.Vector3;
  velocityY: number;
  animation: PlacedModelSettings['animation'];
  vmdName?: string;
  vmdAnimation?: unknown;
  mmdRuntime?: MmdRuntimeHandle;
  mmdMesh?: THREE.SkinnedMesh;
  vmdPlaying: boolean;
  vmdTime: number;
  animationSpeed: number;
  animationDistance: number;
  animationPhase: number;
  animationTick: number;
  materials: THREE.Material[];
  parts: ModelPart[];
  partByMaterial: Map<THREE.Material, ModelPart>;
  _lastShadow?: boolean;
};

export type StoredModel = ImportedModelItem & {
  root: THREE.Object3D;
  mmdModel?: MmdModelHandle;
  scale: number;
  materials: THREE.Material[];
  previewSize: THREE.Vector3;
  previewCenter: THREE.Vector3;
};

// ──── Snapshot ────

export type GameSnapshot = {
  selectedBlock: BlockType;
  blockCount: number;
  timeOfDay: number;
  creatureCount: number;
  isLocked: boolean;
  isDead: boolean;
  fps?: number;
  worldDebug?: {
    x: number;
    y: number;
    z: number;
    height: number;
    biome: string;
    baseBiome: string;
    temperature: number;
    humidity: number;
    continentalness: number;
    erosion: number;
    ridge: number;
    oceanDepth: number;
    lakeDepth: number;
    lakeBank: boolean;
    river: boolean;
    riverBank: boolean;
    riverFlow?: number;
    riverSlope?: number;
    riverSource?: string;
  };
  contextLost?: boolean;
  selectedModelName?: string;
  canOpenModelMenu?: boolean;
  selectedModelSettings?: PlacedModelSettings;
  modelPlacement?: {
    rotation: number;
    scale: number;
  };
};

// ──── Save data ────

export type WorldSaveData = {
  version: 2;
  name: string;
  savedAt: number;
  seed: number;
  worldGen: WorldGenSettings;
  saveMode?: 'legacySnapshot' | 'chunkDelta';
  blocksBin?: string;
  blockDict?: string[];
  waterCells?: [string, { distance: number; level: number; source: boolean; falling?: boolean; static?: boolean }][];
  player: {
    x: number; y: number; z: number;
    yaw: number; pitch: number;
    physicalY: number;
  };
  timeOfDay: number;
  settings: Partial<GameSettings>;
  hotbar: ({ type: 'block'; block: BlockType } | { type: 'model'; modelId: string })[];
  activeSlot: number;
  placedModels: {
    id: string; modelId: string; name: string;
    x: number; y: number; z: number;
    scale: number; baseScale: number;
    rotation: number;
    brightness: number; opacity: number;
    visible: boolean; shadows: boolean;
    animation: string; animationSpeed: number;
    animationDistance: number;
    parts: { id: string; name: string; opacity: number; visible: boolean }[];
  }[];
  importedModels: { id: string; name: string; kind: 'generic' | 'mmd' }[];
  itemFrameContents: [string, string][];
  chunks?: ChunkSaveData[];
};

// ──── Options / API ────

export type BlockGameOptions = {
  rendererBackend?: GameSettings['rendererBackend'];
  worldGen?: WorldGenSettings;
  onProgress?: (label: string, progress: number) => void;
};

export type BlockGameApi = {
  setSelectedBlock: (block: BlockType) => void;
  setSelectedModel: (modelId: string | null) => void;
  lockControls: () => void | Promise<void>;
  unlockControls: () => void;
  importModelFile: (file: File, options?: ModelImportOptions) => Promise<ImportedModelItem[]>;
  importModelFiles: (files: File[], options?: ModelImportOptions) => Promise<ImportedModelItem[]>;
  importGltfModel: (url: string, position?: THREE.Vector3) => Promise<THREE.Group>;
  importMmdModel: (source: File | string, position?: THREE.Vector3) => Promise<THREE.Object3D>;
  updateSettings: (settings: Partial<GameSettings>) => void;
  updateSelectedPlacedModel: (settings: Partial<Omit<PlacedModelSettings, 'id' | 'name'>>) => void;
  updateSelectedModelPart: (partId: string, settings: Partial<Omit<ModelPartSettings, 'id' | 'name'>>) => void;
  importVmdForSelectedModel: (file: File) => Promise<void>;
  deleteSelectedPlacedModel: () => void;
  getSettings: () => GameSettings;
  noteMmdSupport: () => string;
  save: (name: string) => WorldSaveData;
  load: (data: WorldSaveData) => void;
  respawn: () => void;
  setTouchMove: (x: number, y: number) => void;
  setTouchLook: (dx: number, dy: number) => void;
  touchJump: () => void;
  touchTap: (screenX: number, screenY: number) => void;
  touchPlace: (screenX: number, screenY: number) => void;
  touchLock: () => void;
  dispose: () => void;
};
