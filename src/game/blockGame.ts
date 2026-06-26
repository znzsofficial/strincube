import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  type BlockType,
  blockMaterials,
  materialIndexFor,
  isPlantBlock,
  isTransparentBlock,
  loadBlockTexture,
  waterMaterial,
  pickPlant as pickPlantFromRegistry,
} from './blocks';
import {
  type GameSettings,
  type WorldGenSettings,
  type WorldSaveData,
  type GameSnapshot,
  type PlacedModelSettings,
  type ModelPartSettings,
  type BlockGameOptions,
  type BlockGameApi,
  type ImportedModelItem,
  type ModelImportProgress,
  type ModelImportOptions,
  worldSizePresets,
  defaultWorldGenSettings,
} from './types';
import { serializeBlocks, deserializeBlocks } from './save';
import destroyStage0Url from '../../assets/minecraft/textures/block/destroy_stage_0.png';
import destroyStage1Url from '../../assets/minecraft/textures/block/destroy_stage_1.png';
import destroyStage2Url from '../../assets/minecraft/textures/block/destroy_stage_2.png';
import destroyStage3Url from '../../assets/minecraft/textures/block/destroy_stage_3.png';
import destroyStage4Url from '../../assets/minecraft/textures/block/destroy_stage_4.png';
import destroyStage5Url from '../../assets/minecraft/textures/block/destroy_stage_5.png';
import destroyStage6Url from '../../assets/minecraft/textures/block/destroy_stage_6.png';
import destroyStage7Url from '../../assets/minecraft/textures/block/destroy_stage_7.png';
import destroyStage8Url from '../../assets/minecraft/textures/block/destroy_stage_8.png';
import destroyStage9Url from '../../assets/minecraft/textures/block/destroy_stage_9.png';
import sunUrl from '../../assets/minecraft/textures/environment/sun.png';

export type {
  GameSettings,
  WorldGenSettings,
  WorldSaveData,
  GameSnapshot,
  PlacedModelSettings,
  ModelPartSettings,
  BlockGameOptions,
  BlockGameApi,
  ImportedModelItem,
  ModelImportProgress,
  ModelImportOptions,
};
export { worldSizePresets, defaultWorldGenSettings };

type GameRenderer = {
  domElement: HTMLCanvasElement;
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType };
  outputColorSpace: THREE.ColorSpace;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  setPixelRatio: (ratio: number) => void;
  setSize: (width: number, height: number) => void;
  setAnimationLoop: (callback: ((time: number) => void) | null) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
  init?: () => Promise<unknown>;
};

type Creature = {
  root: THREE.Group;
  phase: number;
  home: THREE.Vector3;
};

type FallingBlockEntity = {
  mesh: THREE.Mesh;
  type: BlockType;
  velocityY: number;
};

type WaterCell = {
  position: THREE.Vector3;
  distance: number;
  level: number;
  source: boolean;
};

type BlockData = {
  position: THREE.Vector3;
  type: BlockType;
  waterDistance?: number;
};

type StoredModel = ImportedModelItem & {
  root: THREE.Object3D;
  mmdModel?: MmdModelHandle;
  scale: number;
  materials: THREE.Material[];
  previewSize: THREE.Vector3;
  previewCenter: THREE.Vector3;
};

type PlacedModelEntity = {
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

type ModelPart = ModelPartSettings & {
  material: THREE.Material;
};

type PrimedTnt = {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  timer: number;
  flash: number;
};

type MmdModelHandle = {
  root: THREE.Object3D;
  mesh?: THREE.SkinnedMesh;
  setAnimation?: (animation: unknown) => void;
  update?: (seconds: number, options?: { physics?: boolean; ik?: boolean }) => unknown;
};

type MmdRuntimeHandle = {
  setAnimation?: (animation: unknown, mesh: THREE.SkinnedMesh) => void;
  tick?: (seconds: number, options?: { mesh?: THREE.Object3D; physics?: boolean; ik?: boolean }) => unknown;
};

type ChunkMesh = {
  meshes: THREE.Mesh[];
  faceBlockKeysByMesh: Map<THREE.Mesh, string[]>;
};

type WaterChunkMesh = {
  mesh: THREE.Mesh;
};

const uiKeyCodes = new Set(['Escape', 'KeyE', 'KeyM', 'KeyO']);
const chunkSize = 8;
let worldRadius = 80;
const waterLevel = 1;
const maxWaterSpreadDistance = 7;
const worldBottom = -8;
const playerHeight = 1.7;

function loadSpriteTexture(url: string) {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = '#edf4ff';
  ctx.fillRect(7, 5, 20, 22);
  ctx.fillStyle = '#c7d4e8';
  ctx.fillRect(11, 9, 4, 4);
  ctx.fillRect(20, 12, 3, 3);
  ctx.fillRect(15, 21, 5, 3);
  ctx.fillStyle = 'rgba(18, 26, 55, 0.78)';
  ctx.fillRect(18, 4, 11, 24);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x7fc8ff) },
      horizonColor: { value: new THREE.Color(0xd9f1ff) },
      bottomColor: { value: new THREE.Color(0x8ed78a) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float heightMix = smoothstep(-0.05, 0.75, normalize(vWorldPosition).y);
        float groundMix = smoothstep(-0.55, 0.08, normalize(vWorldPosition).y);
        vec3 lowColor = mix(bottomColor, horizonColor, groundMix);
        gl_FragColor = vec4(mix(lowColor, topColor, heightMix), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

function createBasicSkyMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xbcecff,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

const destroyStageTextures = [
  destroyStage0Url,
  destroyStage1Url,
  destroyStage2Url,
  destroyStage3Url,
  destroyStage4Url,
  destroyStage5Url,
  destroyStage6Url,
  destroyStage7Url,
  destroyStage8Url,
  destroyStage9Url,
].map((url) => loadBlockTexture(url));

const destroyStageMaterials = destroyStageTextures.map((map) => new THREE.MeshBasicMaterial({
  map,
  transparent: true,
  alphaTest: 0.25,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  side: THREE.DoubleSide,
}));

let worldSeed = Math.random() * 10000;

export function setWorldSeed(seed: number) {
  worldSeed = seed;
}

export function getWorldSeed() {
  return worldSeed;
}

function seededNoise(x: number, y: number, z: number) {
  return Math.abs(Math.sin((x + worldSeed) * 12.9898 + (y - worldSeed * 0.37) * 78.233 + (z + worldSeed * 0.61) * 37.719) * 43758.5453) % 1;
}

// 生物群系类型
type Biome = 'plains' | 'forest' | 'jungle' | 'desert' | 'snow' | 'taiga' | 'savanna';

// 生物群系配置
const biomeConfig: Record<Biome, {
  grassColor: number;
  treeDensity: number;
  treeTypes: ('oak' | 'jungle' | 'cherry' | 'spruce')[];
  surfaceBlock: BlockType;
  plantDensity: number;
}> = {
  plains: {
    grassColor: 0x73b84a,
    treeDensity: 0.992,
    treeTypes: ['oak'],
    surfaceBlock: 'grass',
    plantDensity: 0.78,
  },
  forest: {
    grassColor: 0x5a8f29,
    treeDensity: 0.975,
    treeTypes: ['oak', 'spruce'],
    surfaceBlock: 'grass',
    plantDensity: 0.65,
  },
  jungle: {
    grassColor: 0x3a7a1a,
    treeDensity: 0.96,
    treeTypes: ['jungle'],
    surfaceBlock: 'grass',
    plantDensity: 0.55,
  },
  desert: {
    grassColor: 0xc2a645,
    treeDensity: 0.998,
    treeTypes: [],
    surfaceBlock: 'sand',
    plantDensity: 0.95,
  },
  snow: {
    grassColor: 0x8fb8a0,
    treeDensity: 0.985,
    treeTypes: ['spruce'],
    surfaceBlock: 'snow',
    plantDensity: 0.85,
  },
  taiga: {
    grassColor: 0x6a9f4a,
    treeDensity: 0.97,
    treeTypes: ['spruce'],
    surfaceBlock: 'grass',
    plantDensity: 0.75,
  },
  savanna: {
    grassColor: 0x9ab84a,
    treeDensity: 0.988,
    treeTypes: ['oak'],
    surfaceBlock: 'grass',
    plantDensity: 0.82,
  },
};

function biomeNoise(x: number, z: number) {
  // 使用多层低频噪声生成大范围生物群系
  const nx = x / 80;  // 低频，大范围
  const nz = z / 80;
  return (
    Math.sin(nx * 0.7 + worldSeed * 0.1) * 0.3 +
    Math.sin(nz * 0.8 + worldSeed * 0.2) * 0.3 +
    Math.sin((nx + nz) * 0.5 + worldSeed * 0.3) * 0.2 +
    Math.sin(nx * 1.3 - nz * 0.9 + worldSeed * 0.4) * 0.2
  ) * 0.5 + 0.5; // 归一化到 0-1
}

function moistureNoise(x: number, z: number) {
  // 使用不同的低频噪声生成湿度
  const nx = x / 60;
  const nz = z / 60;
  return (
    Math.sin(nx * 0.9 - worldSeed * 0.15) * 0.3 +
    Math.sin(nz * 0.6 + worldSeed * 0.25) * 0.3 +
    Math.sin((nx - nz) * 0.7 + worldSeed * 0.35) * 0.2 +
    Math.sin(nx * 1.1 + nz * 1.2 - worldSeed * 0.45) * 0.2
  ) * 0.5 + 0.5; // 归一化到 0-1
}

function getBiome(x: number, z: number): Biome {
  const temp = biomeNoise(x, z);
  const moisture = moistureNoise(x, z);

  // 温度和湿度决定生物群系
  if (temp > 0.65) {
    return moisture > 0.55 ? 'jungle' : 'desert';
  }
  if (temp > 0.5) {
    return moisture > 0.6 ? 'forest' : moisture > 0.4 ? 'savanna' : 'plains';
  }
  if (temp > 0.35) {
    return moisture > 0.5 ? 'taiga' : 'plains';
  }
  return 'snow';
}

function riverCenterX(z: number) {
  const center = Math.sin((z + worldSeed) * 0.15) * 7 + Math.sin((z - worldSeed * 0.52) * 0.045 + 1.8) * 10;
  return center;
}

function riverProfile(x: number, z: number) {
  const center = riverCenterX(z);
  const bend = riverCenterX(z + 1) - riverCenterX(z - 1);
  const distance = Math.abs(x - center) / Math.max(1, Math.hypot(1, bend * 0.5));
  const width = 3.2 + seededNoise(Math.floor(z / 7), 0, 3) * 1.7;
  const bankWidth = width + 3.4 + seededNoise(Math.floor(z / 9), 0, 11) * 1.4;
  const bed = distance < width;
  const bank = distance < bankWidth;
  const depth = bed ? 1 + Math.floor((1 - distance / width) * 2.6) : 0;
  return { bed, bank, depth, bankBlend: THREE.MathUtils.clamp((bankWidth - distance) / Math.max(bankWidth - width, 0.1), 0, 1) };
}

function isRiverBed(x: number, z: number) {
  return riverProfile(x, z).bed;
}

function isRiverBank(x: number, z: number) {
  return riverProfile(x, z).bank;
}

const faceDefs = [
  { normal: new THREE.Vector3(1, 0, 0), corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { normal: new THREE.Vector3(-1, 0, 0), corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { normal: new THREE.Vector3(0, 1, 0), corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { normal: new THREE.Vector3(0, -1, 0), corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { normal: new THREE.Vector3(0, 0, 1), corners: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { normal: new THREE.Vector3(0, 0, -1), corners: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] },
];

const lanternFaceDefs = (() => {
  const h = 0.1875;
  const b = -0.5;
  const t = b + 0.4375;
  return [
    { normal: new THREE.Vector3(1, 0, 0), corners: [[h, b, -h], [h, t, -h], [h, t, h], [h, b, h]] },
    { normal: new THREE.Vector3(-1, 0, 0), corners: [[-h, b, h], [-h, t, h], [-h, t, -h], [-h, b, -h]] },
    { normal: new THREE.Vector3(0, 1, 0), corners: [[-h, t, h], [h, t, h], [h, t, -h], [-h, t, -h]] },
    { normal: new THREE.Vector3(0, -1, 0), corners: [[-h, b, -h], [h, b, -h], [h, b, h], [-h, b, h]] },
    { normal: new THREE.Vector3(0, 0, 1), corners: [[h, b, h], [h, t, h], [-h, t, h], [-h, b, h]] },
    { normal: new THREE.Vector3(0, 0, -1), corners: [[-h, b, -h], [-h, t, -h], [h, t, -h], [h, b, -h]] },
  ];
})();

const torchFaceDefs = (() => {
  const r = 0.0625;
  const b = -0.5;
  const t = b + 0.625;
  return [
    { normal: new THREE.Vector3(1, 0, 0), corners: [[r, b, -r], [r, t, -r], [r, t, r], [r, b, r]] },
    { normal: new THREE.Vector3(-1, 0, 0), corners: [[-r, b, r], [-r, t, r], [-r, t, -r], [-r, b, -r]] },
    { normal: new THREE.Vector3(0, 1, 0), corners: [[-r, t, r], [r, t, r], [r, t, -r], [-r, t, -r]] },
    { normal: new THREE.Vector3(0, -1, 0), corners: [[-r, b, -r], [r, b, -r], [r, b, r], [-r, b, r]] },
    { normal: new THREE.Vector3(0, 0, 1), corners: [[r, b, r], [r, t, r], [-r, t, r], [-r, b, r]] },
    { normal: new THREE.Vector3(0, 0, -1), corners: [[-r, b, -r], [-r, t, -r], [r, t, -r], [r, b, -r]] },
  ];
})();

const flowerFaceDefs = [
  { normal: new THREE.Vector3(0.7, 0, 0.7).normalize(), corners: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { normal: new THREE.Vector3(-0.7, 0, 0.7).normalize(), corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
];

const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
  transparent: true,
  opacity: 0.65,
});

function keyOf(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function chunkKeyOf(x: number, z: number) {
  return `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`;
}

function chunkCenterFromKey(chunkKey: string) {
  const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
  return new THREE.Vector3(chunkX * chunkSize + chunkSize / 2, 0, chunkZ * chunkSize + chunkSize / 2);
}

function rounded(v: THREE.Vector3) {
  return new THREE.Vector3(Math.round(v.x), Math.round(v.y), Math.round(v.z));
}

function terrainHeight(x: number, z: number) {
  return Math.floor(
    1.5
    + Math.sin((x + worldSeed) * 0.45) * 1.2
    + Math.cos((z - worldSeed * 0.41) * 0.36) * 1.1
    + Math.sin((x + z + worldSeed * 0.29) * 0.18) * 0.8,
  );
}

export async function createBlockGame(mount: HTMLElement, onSnapshot: (snapshot: GameSnapshot) => void, onModelMenuRequest?: () => void, options: BlockGameOptions = {}) {
  const { onProgress } = options;
  const worldGen = options.worldGen ?? defaultWorldGenSettings;
  worldRadius = worldSizePresets[worldGen.worldSize];
  
  let rendererBackend: GameSettings['rendererBackend'] = 'webgl';
  let renderer: GameRenderer;

  if (options.rendererBackend === 'webgpu') {
    const [{ WebGPURenderer }, { default: WebGPU }] = await Promise.all([
      import('three/webgpu'),
      import('three/addons/capabilities/WebGPU.js'),
    ]);
    if (WebGPU.isAvailable()) {
      rendererBackend = 'webgpu';
      renderer = new WebGPURenderer({ antialias: true }) as GameRenderer;
    } else {
      renderer = new THREE.WebGLRenderer({ antialias: true }) as GameRenderer;
    }
  } else {
    renderer = new THREE.WebGLRenderer({ antialias: true }) as GameRenderer;
  }

  const settings: GameSettings = {
    mouseSensitivity: 1,
    moveSpeed: 5.4,
    daySpeed: 0.004,
    pixelRatio: Math.min(window.devicePixelRatio, 1),
    shadows: true,
    viewDistance: 82,
    modelBrightness: 0.78,
    breakSpeed: 1,
    showFps: false,
    timeOfDay: 0.28,
    infiniteWaterSpread: false,
    rendererBackend,
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcecff);
  scene.fog = new THREE.Fog(0xbcecff, 20, settings.viewDistance);

  const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.1, 180);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, terrainHeight(0, 0) + playerHeight + 2, 7);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(settings.pixelRatio);
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  mount.appendChild(renderer.domElement);
  if (settings.rendererBackend === 'webgpu' && renderer.init) await renderer.init();

  const skyMaterial = settings.rendererBackend === 'webgpu' ? createBasicSkyMaterial() : createSkyMaterial();
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), skyMaterial);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -1000;
  scene.add(skyDome);

  const controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(controls.object);
  controls.pointerSpeed = 0;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = Math.PI - 0.16;

  const hemiLight = new THREE.HemisphereLight(0xe9f8ff, 0xa3db78, 2.4);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2.5;
  scene.add(sun);
  scene.add(sun.target);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: loadSpriteTexture(sunUrl),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }));
  sunSprite.scale.set(9, 9, 1);
  scene.add(sunSprite);

  const moon = new THREE.DirectionalLight(0xb8ccff, 0.3);
  scene.add(moon);
  scene.add(moon.target);

  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createMoonTexture(),
    color: 0xdde8ff,
    transparent: true,
    depthWrite: false,
    fog: false,
  }));
  moonSprite.scale.set(7, 7, 1);
  scene.add(moonSprite);

  const blocks = new Map<string, BlockData>();
  const waterCells = new Map<string, WaterCell>();
  const blockLights = new Map<string, THREE.PointLight>();
  const columnSolidY = new Map<string, Set<number>>();
  const chunkMeshes = new Map<string, ChunkMesh>();
  const waterChunkMeshes = new Map<string, WaterChunkMesh>();
  const dirtyWaterChunks = new Set<string>();
  const creatures: Creature[] = [];
  const fallingBlocks: FallingBlockEntity[] = [];
  const waterKeys = new Set<string>();
  const waterUpdates: string[] = [];
  const queuedWaterUpdates = new Set<string>();
  const raycaster = new THREE.Raycaster();
  raycaster.far = 6;

  const outline = new THREE.Mesh(new THREE.BoxGeometry(1.04, 1.04, 1.04), outlineMaterial);
  outline.visible = false;
  scene.add(outline);

  const destroyOverlay = new THREE.Mesh(new THREE.BoxGeometry(1.012, 1.012, 1.012), destroyStageMaterials[0]);
  destroyOverlay.visible = false;
  destroyOverlay.renderOrder = 20;
  scene.add(destroyOverlay);

  let selectedBlock: BlockType = 'grass';
  let selectedModelId: string | null = null;
  let selectedPlacedModelId: string | null = null;
  let modelPlacementRotation = 0;
  let modelPlacementScale = 1;
  let modelItemSequence = 0;
  let placedModelSequence = 0;
  let timeOfDay = 0.28;
  let verticalVelocity = 0;
  let physicalY = camera.position.y;
  let visualY = camera.position.y;
  let headBob = 0;
  let landingDip = 0;
  let canJump = false;
  let isDead = false;
  let isDisposed = false;
  let blockMeshesReady = false;
  let isBreaking = false;
  let breakingKey: string | null = null;
  let breakingProgress = 0;
  let cameraYaw = 0;
  let cameraPitch = 0;
  let waterUpdateTimer = 0;
  let modelRaycastTimer = 0;
  let lastShadowUpdateX = 0;
  let lastShadowUpdateZ = 0;

  let isPlacing = false;
  let placeTimer = 0;
  const placeInterval = 0.12;

  // FPS 计算
  let fpsFrameCount = 0;
  let fpsLastTime = 0;
  let currentFps = 0;

  let chunkVisibilityTimer = 0;
  let visibleChunkRaycastDirty = true;
  let visibleChunkRaycastMeshes: THREE.Mesh[] = [];
  const keys = new Set<string>();
  const timer = new THREE.Timer();
  const gltfLoader = new GLTFLoader();
  const importedModelMaterials = new Set<THREE.Material>();
  const storedModels = new Map<string, StoredModel>();
  const placedModels = new Map<string, PlacedModelEntity>();
  const primedTnts: PrimedTnt[] = [];
  const placedModelRaycastRoots: THREE.Object3D[] = [];
  const tntFlashMaterial = new THREE.MeshLambertMaterial({ color: 0xfff1cf, emissive: 0xff6a00, emissiveIntensity: 0.35 });

  const _colorWarmSun = new THREE.Color(0xffd29a);
  const _colorWhiteSun = new THREE.Color(0xffffff);
  const _colorHemiDay = new THREE.Color(0xe9f8ff);
  const _colorHemiNight = new THREE.Color(0xaec8ff);
  const _colorHemiGroundDay = new THREE.Color(0xa3db78);
  const _colorHemiGroundNight = new THREE.Color(0x24344d);
  const _colorHorizon = new THREE.Color(0xffb36b);
  const _colorNight = new THREE.Color(0x111a3d);
  const _colorDay = new THREE.Color(0xbcecff);
  const _colorZenithDay = new THREE.Color(0x69bdff);
  const _colorBottomDay = new THREE.Color(0x91ca71);
  const _colorBottomNight = new THREE.Color(0x172338);
  const _colorHurtFlash = new THREE.Color(0xff3d3d);
  const _tempColor1 = new THREE.Color();
  const _tempColor2 = new THREE.Color();
  const _tempVec3 = new THREE.Vector3();
  const _tempVec2 = new THREE.Vector2(0, 0);
  const _tempFlow = new THREE.Vector3();
  const _tempFlowDir = new THREE.Vector3();
  const _tempDirection = new THREE.Vector3();
  const _tempKnockback = new THREE.Vector3();



  function emitSnapshot(isLocked = controls.isLocked) {
    const selectedPlacedModel = selectedPlacedModelId ? placedModels.get(selectedPlacedModelId) : null;
    const selectedStoredModel = selectedModelId ? storedModels.get(selectedModelId) : null;
    const canOpenModelMenu = Boolean(selectedPlacedModel && controls.object.position.distanceTo(selectedPlacedModel.root.position) <= 6.5);
    onSnapshot({
      selectedBlock,
      blockCount: blocks.size,
      timeOfDay,
      creatureCount: creatures.length,
      isLocked,
      isDead,
      fps: settings.showFps ? currentFps : undefined,
      selectedModelName: selectedPlacedModel?.name ?? selectedStoredModel?.name,
      canOpenModelMenu,
      selectedModelSettings: selectedPlacedModel ? {
        id: selectedPlacedModel.id,
        name: selectedPlacedModel.name,
        rotation: selectedPlacedModel.root.rotation.y,
        scale: selectedPlacedModel.scale,
        offsetX: selectedPlacedModel.offset.x,
        offsetY: selectedPlacedModel.offset.y,
        offsetZ: selectedPlacedModel.offset.z,
        brightness: selectedPlacedModel.brightness,
        opacity: selectedPlacedModel.opacity,
        visible: selectedPlacedModel.visible,
        shadows: selectedPlacedModel.shadows,
        damageable: selectedPlacedModel.damageable,
        health: selectedPlacedModel.health,
        maxHealth: selectedPlacedModel.maxHealth,
        animation: selectedPlacedModel.animation,
        vmdName: selectedPlacedModel.vmdName,
        vmdPlaying: selectedPlacedModel.vmdPlaying,
        animationSpeed: selectedPlacedModel.animationSpeed,
        animationDistance: selectedPlacedModel.animationDistance,
        parts: selectedPlacedModel.parts.map((part) => ({ id: part.id, name: part.name, visible: part.visible, opacity: part.opacity })),
      } : undefined,
      modelPlacement: selectedModelId ? { rotation: modelPlacementRotation, scale: modelPlacementScale } : undefined,
    });
  }

  function isSolidBlock(type: BlockType) {
    return type !== 'water' && !isPlantBlock(type);
  }

  function isFallingBlock(type: BlockType) {
    return type === 'sand' || type === 'gravel';
  }

  function isReplaceableBlock(type: BlockType) {
    return isPlantBlock(type);
  }

  function canMoveInto(x: number, y: number, z: number) {
    const block = blocks.get(keyOf(x, y, z));
    return !block || isReplaceableBlock(block.type);
  }

  function columnKeyOf(x: number, z: number) {
    return `${x},${z}`;
  }

  function addSolidColumnY(x: number, y: number, z: number) {
    const columnKey = columnKeyOf(x, z);
    let solidY = columnSolidY.get(columnKey);
    if (!solidY) {
      solidY = new Set<number>();
      columnSolidY.set(columnKey, solidY);
    }
    solidY.add(y);
  }

  function removeSolidColumnY(x: number, y: number, z: number) {
    const columnKey = columnKeyOf(x, z);
    const solidY = columnSolidY.get(columnKey);
    if (!solidY) return;
    solidY.delete(y);
    if (solidY.size === 0) columnSolidY.delete(columnKey);
  }

  function queueWaterUpdate(x: number, y: number, z: number) {
    const key = keyOf(x, y, z);
    if (queuedWaterUpdates.has(key)) return;
    queuedWaterUpdates.add(key);
    waterUpdates.push(key);
  }

  function queueWaterNeighbors(x: number, y: number, z: number) {
    queueWaterUpdate(x, y, z);
    queueWaterUpdate(x + 1, y, z);
    queueWaterUpdate(x - 1, y, z);
    queueWaterUpdate(x, y, z + 1);
    queueWaterUpdate(x, y, z - 1);
    queueWaterUpdate(x, y + 1, z);
    queueWaterUpdate(x, y - 1, z);
  }

  function markWaterChunkDirty(x: number, z: number) {
    dirtyWaterChunks.add(chunkKeyOf(x, z));
    dirtyWaterChunks.add(chunkKeyOf(x - 1, z));
    dirtyWaterChunks.add(chunkKeyOf(x + 1, z));
    dirtyWaterChunks.add(chunkKeyOf(x, z - 1));
    dirtyWaterChunks.add(chunkKeyOf(x, z + 1));
  }

  function removeWaterChunkMesh(chunkKey: string) {
    const chunk = waterChunkMeshes.get(chunkKey);
    if (!chunk) return;
    scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    waterChunkMeshes.delete(chunkKey);
  }

  function addWaterCell(x: number, y: number, z: number, distance = 0, level = 7, source = distance === 0 && level === 7) {
    const key = keyOf(x, y, z);
    if (blocks.has(key)) return;
    const existing = waterCells.get(key);
    if (existing && existing.level >= level && existing.distance <= distance && existing.source === source) return;
    waterCells.set(key, { position: new THREE.Vector3(x, y, z), distance, level, source: existing?.source || source });
    waterKeys.add(key);
    queueWaterUpdate(x, y, z);
    queueWaterNeighbors(x, y, z);
    markWaterChunkDirty(x, z);
  }

  function removeWaterCell(x: number, y: number, z: number) {
    const key = keyOf(x, y, z);
    if (!waterCells.delete(key)) return;
    waterKeys.delete(key);
    queuedWaterUpdates.delete(key);
    markWaterChunkDirty(x, z);
    queueWaterNeighbors(x, y, z);
  }

  function rebuildWaterChunk(chunkKey: string) {
    removeWaterChunkMesh(chunkKey);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    const chunkCells: WaterCell[] = [];
    for (const cell of waterCells.values()) {
      if (chunkKeyOf(cell.position.x, cell.position.z) === chunkKey) {
        chunkCells.push(cell);
      }
    }
    if (chunkCells.length === 0) return;

    function getWaterTopY(x: number, y: number, z: number): number | null {
      const cell = waterCells.get(keyOf(x, y, z));
      if (cell) return cell.position.y + THREE.MathUtils.lerp(-0.44, 0.48, cell.level / 7);
      const below = waterCells.get(keyOf(x, y - 1, z));
      if (below) return below.position.y + THREE.MathUtils.lerp(-0.44, 0.48, below.level / 7);
      const above = waterCells.get(keyOf(x, y + 1, z));
      if (above) return above.position.y + THREE.MathUtils.lerp(-0.44, 0.48, above.level / 7);
      return null;
    }

    function blendedTopY(cell: WaterCell, cornerX: number, cornerZ: number) {
      const cx = cell.position.x;
      const cy = cell.position.y;
      const cz = cell.position.z;
      const sx = cornerX > 0 ? 1 : -1;
      const sz = cornerZ > 0 ? 1 : -1;

      const selfY = cell.position.y + THREE.MathUtils.lerp(-0.44, 0.48, cell.level / 7);

      const neighborX = getWaterTopY(cx + sx, cy, cz);
      const neighborZ = getWaterTopY(cx, cy, cz + sz);
      const neighborXZ = getWaterTopY(cx + sx, cy, cz + sz);

      let sum = selfY;
      let count = 1;
      if (neighborX !== null) { sum += neighborX; count++; }
      if (neighborZ !== null) { sum += neighborZ; count++; }
      if (neighborXZ !== null) { sum += neighborXZ; count++; }

      return sum / count;
    }

    function waterTopY(cell: WaterCell) {
      return cell.position.y + THREE.MathUtils.lerp(-0.44, 0.48, cell.level / 7);
    }

    function shouldRenderFace(nx: number, ny: number, nz: number): boolean {
      if (waterCells.has(keyOf(nx, ny, nz))) return false;
      const solid = blocks.get(keyOf(nx, ny, nz));
      if (solid && !isPlantBlock(solid.type)) return false;
      return true;
    }

    for (const cell of chunkCells) {
      const cx = cell.position.x;
      const cy = cell.position.y;
      const cz = cell.position.z;

      const selfTopY = waterTopY(cell);

      for (const face of faceDefs) {
        const nx = cx + face.normal.x;
        const ny = cy + face.normal.y;
        const nz = cz + face.normal.z;

        if (!shouldRenderFace(nx, ny, nz)) continue;

        const isTopFace = face.normal.y > 0;
        const isBottomFace = face.normal.y < 0;

        for (const corner of face.corners) {
          let y: number;
          if (isTopFace) {
            y = blendedTopY(cell, corner[0], corner[2]);
          } else if (isBottomFace) {
            y = cy + corner[1];
          } else {
            y = corner[1] > 0 ? selfTopY : cy + corner[1];
          }
          positions.push(cx + corner[0], y, cz + corner[2]);
          normals.push(face.normal.x, face.normal.y, face.normal.z);
        }
        uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
        indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
        vertexCount += 4;
      }

      const sides = [
        { dx: 1, dz: 0, corners: [[0.5, -0.5], [0.5, 0.5]] },
        { dx: -1, dz: 0, corners: [[-0.5, -0.5], [-0.5, 0.5]] },
        { dx: 0, dz: 1, corners: [[-0.5, 0.5], [0.5, 0.5]] },
        { dx: 0, dz: -1, corners: [[-0.5, -0.5], [0.5, -0.5]] },
      ];

      for (const side of sides) {
        const neighborCell = waterCells.get(keyOf(cx + side.dx, cy, cz + side.dz));
        if (!neighborCell) continue;
        const neighborTop = waterTopY(neighborCell);
        if (Math.abs(neighborTop - selfTopY) < 0.01) continue;

        const higherTop = Math.max(selfTopY, neighborTop);
        const lowerTop = Math.min(selfTopY, neighborTop);

        const isCurrentHigher = selfTopY >= neighborTop;
        const normalX = isCurrentHigher ? side.dx : -side.dx;
        const normalZ = isCurrentHigher ? side.dz : -side.dz;

        const c0 = side.corners[0];
        const c1 = side.corners[1];

        positions.push(cx + c0[0], lowerTop, cz + c0[1]);
        positions.push(cx + c0[0], higherTop, cz + c0[1]);
        positions.push(cx + c1[0], higherTop, cz + c1[1]);
        positions.push(cx + c1[0], lowerTop, cz + c1[1]);

        normals.push(normalX, 0, normalZ);
        normals.push(normalX, 0, normalZ);
        normals.push(normalX, 0, normalZ);
        normals.push(normalX, 0, normalZ);

        uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
        indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
        vertexCount += 4;
      }
    }

    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, waterMaterial);
    mesh.receiveShadow = true;
    scene.add(mesh);
    waterChunkMeshes.set(chunkKey, { mesh });
  }

  function rebuildDirtyWaterChunks(limit = 16) {
    let count = 0;
    for (const chunkKey of dirtyWaterChunks) {
      dirtyWaterChunks.delete(chunkKey);
      rebuildWaterChunk(chunkKey);
      count += 1;
      if (count >= limit) break;
    }
  }

  function groundHeightAt(x: number, z: number, maxCameraY = Infinity) {
    const solidY = columnSolidY.get(columnKeyOf(x, z));
    if (!solidY) return -Infinity;

    const maxBlockY = maxCameraY - playerHeight - 0.5;
    let top = -Infinity;
    for (const y of solidY) {
      if (y <= maxBlockY) top = Math.max(top, y);
    }
    return top === -Infinity ? -Infinity : top + playerHeight + 0.5;
  }

  function setSelectedBlock(block: BlockType) {
    selectedBlock = block;
    selectedModelId = null;
    // clearModelPreview() removed
    emitSnapshot();
  }

  function setSelectedModel(modelId: string | null) {
    selectedModelId = modelId;
    selectedPlacedModelId = null;
    updateSelectedModelHelper();
    // clearModelPreview() removed
    emitSnapshot();
  }

  function updateSettings(nextSettings: Partial<GameSettings>) {
    Object.assign(settings, nextSettings);
    controls.pointerSpeed = 0;
    renderer.shadowMap.enabled = settings.shadows;
    if (scene.fog instanceof THREE.Fog) scene.fog.far = settings.viewDistance;
    camera.far = Math.max(settings.viewDistance * 3, 90);
    camera.updateProjectionMatrix();
    updateChunkVisibility(true);
    applyModelBrightness();
    for (const entity of placedModels.values()) applyPlacedModelSettings(entity);
    renderer.setPixelRatio(settings.pixelRatio);
    if (nextSettings.timeOfDay !== undefined) {
      timeOfDay = nextSettings.timeOfDay;
    }
    onResize();
  }

  function updateChunkVisibility(force = false, delta = 0) {
    chunkVisibilityTimer += delta;
    if (!force && chunkVisibilityTimer < 0.35) return;
    chunkVisibilityTimer = 0;
    const player = controls.object.position;
    const visibleRadius = settings.viewDistance + chunkSize * 2;
    const visibleRadiusSq = visibleRadius * visibleRadius;
    let changed = false;

    for (const [chunkKey, chunk] of chunkMeshes) {
      const center = chunkCenterFromKey(chunkKey);
      const visible = (center.x - player.x) ** 2 + (center.z - player.z) ** 2 <= visibleRadiusSq;
      for (const mesh of chunk.meshes) {
        if (mesh.visible === visible) continue;
        mesh.visible = visible;
        changed = true;
      }
    }

    for (const [chunkKey, chunk] of waterChunkMeshes) {
      const center = chunkCenterFromKey(chunkKey);
      chunk.mesh.visible = (center.x - player.x) ** 2 + (center.z - player.z) ** 2 <= visibleRadiusSq;
    }

    if (changed || visibleChunkRaycastDirty) {
      visibleChunkRaycastMeshes = [...chunkMeshes.values()].flatMap((chunk) => chunk.meshes.filter((mesh) => mesh.visible));
      visibleChunkRaycastDirty = false;
    }
  }

  function applyCameraRotation() {
    camera.rotation.set(cameraPitch, cameraYaw, 0, 'YXZ');
  }

  function onMouseMove(event: MouseEvent) {
    if (!controls.isLocked) return;
    const sensitivity = settings.mouseSensitivity * 0.002;
    const maxStep = 0.075;
    const dx = THREE.MathUtils.clamp(event.movementX, -38, 38);
    const dy = THREE.MathUtils.clamp(event.movementY, -38, 38);
    cameraYaw -= THREE.MathUtils.clamp(dx * sensitivity, -maxStep, maxStep);
    cameraPitch -= THREE.MathUtils.clamp(dy * sensitivity, -maxStep, maxStep);
    cameraPitch = THREE.MathUtils.clamp(cameraPitch, -Math.PI / 2 + 0.16, Math.PI / 2 - 0.16);
    applyCameraRotation();
  }

  function getSettings() {
    return { ...settings };
  }

  function removeChunkMesh(chunkKey: string) {
    const chunk = chunkMeshes.get(chunkKey);
    if (!chunk) return;
    for (const mesh of chunk.meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    chunkMeshes.delete(chunkKey);
    visibleChunkRaycastDirty = true;
  }

  function rebuildChunk(chunkKey: string) {
    removeChunkMesh(chunkKey);

    type MeshBuild = {
      positions: number[];
      normals: number[];
      uvs: number[];
      materialGroups: Map<number, { indices: number[]; key: string }[]>;
      vertexCount: number;
    };

    const createBuild = (): MeshBuild => ({ positions: [], normals: [], uvs: [], materialGroups: new Map(), vertexCount: 0 });
    const opaqueBuild = createBuild();
    const glassBuild = createBuild();
    const leavesBuild = createBuild();

    function pushFace(build: MeshBuild, materialIndex: number, faceIndices: number[], key: string) {
      if (!build.materialGroups.has(materialIndex)) build.materialGroups.set(materialIndex, []);
      build.materialGroups.get(materialIndex)!.push({ indices: faceIndices, key });
    }

    for (const [key, block] of blocks.entries()) {
      if (chunkKeyOf(block.position.x, block.position.z) !== chunkKey) continue;

      if (isPlantBlock(block.type)) {
        for (const face of flowerFaceDefs) {
          for (const corner of face.corners) {
            opaqueBuild.positions.push(block.position.x + corner[0], block.position.y + corner[1], block.position.z + corner[2]);
            opaqueBuild.normals.push(face.normal.x, face.normal.y, face.normal.z);
          }
          opaqueBuild.uvs.push(0, 0, 0, 1, 1, 1, 1, 0);

          const faceIndices = [opaqueBuild.vertexCount, opaqueBuild.vertexCount + 1, opaqueBuild.vertexCount + 2, opaqueBuild.vertexCount, opaqueBuild.vertexCount + 2, opaqueBuild.vertexCount + 3];
          pushFace(opaqueBuild, materialIndexFor(block.type, face.normal), faceIndices, key);
          opaqueBuild.vertexCount += 4;
        }
        continue;
      }

      const isLantern = block.type === 'lantern' || block.type === 'soulLantern';
      const isTorch = block.type === 'torch';
      const activeFaceDefs = isLantern ? lanternFaceDefs : isTorch ? torchFaceDefs : faceDefs;

      for (const face of activeFaceDefs) {
        const nx = block.position.x + face.normal.x;
        const ny = block.position.y + face.normal.y;
        const nz = block.position.z + face.normal.z;
        const neighbor = blocks.get(keyOf(nx, ny, nz));
        const neighborIsSmall = neighbor && (neighbor.type === 'lantern' || neighbor.type === 'soulLantern' || neighbor.type === 'torch');
        if (!isLantern && !isTorch && neighbor && !isPlantBlock(neighbor.type) && !neighborIsSmall) {
          const blockTransparent = isTransparentBlock(block.type);
          const neighborTransparent = isTransparentBlock(neighbor.type);
          if (!blockTransparent && !neighborTransparent) continue;
          if (block.type === neighbor.type && blockTransparent) continue;
        }

        const build = block.type === 'glass' ? glassBuild : 
                     block.type.includes('leaves') || block.type === 'ice' ? leavesBuild : opaqueBuild;
        for (const corner of face.corners) {
          build.positions.push(block.position.x + corner[0], block.position.y + corner[1], block.position.z + corner[2]);
          build.normals.push(face.normal.x, face.normal.y, face.normal.z);
        }
        build.uvs.push(0, 0, 0, 1, 1, 1, 1, 0);

        const materialIndex = materialIndexFor(block.type, face.normal);
        const faceIndices = [build.vertexCount, build.vertexCount + 1, build.vertexCount + 2, build.vertexCount, build.vertexCount + 2, build.vertexCount + 3];
        pushFace(build, materialIndex, faceIndices, key);
        build.vertexCount += 4;

        if (block.type === 'grass' && face.normal.y === 0) {
          for (const corner of face.corners) {
            opaqueBuild.positions.push(
              block.position.x + corner[0] + face.normal.x * 0.003,
              block.position.y + corner[1],
              block.position.z + corner[2] + face.normal.z * 0.003,
            );
            opaqueBuild.normals.push(face.normal.x, face.normal.y, face.normal.z);
          }
          opaqueBuild.uvs.push(0, 0, 0, 1, 1, 1, 1, 0);

          const overlayIndices = [opaqueBuild.vertexCount, opaqueBuild.vertexCount + 1, opaqueBuild.vertexCount + 2, opaqueBuild.vertexCount, opaqueBuild.vertexCount + 2, opaqueBuild.vertexCount + 3];
          pushFace(opaqueBuild, 8, overlayIndices, key);
          opaqueBuild.vertexCount += 4;
        }
      }
    }

    if (opaqueBuild.positions.length === 0 && glassBuild.positions.length === 0) return;

    const meshes: THREE.Mesh[] = [];
    const faceBlockKeysByMesh = new Map<THREE.Mesh, string[]>();

    function createChunkMesh(build: MeshBuild, shadows: boolean) {
      if (build.positions.length === 0) return;

      const indices: number[] = [];
      const faceBlockKeys: string[] = [];

      for (const materialIndex of [...build.materialGroups.keys()].sort((a, b) => a - b)) {
        for (const face of build.materialGroups.get(materialIndex)!) {
          indices.push(...face.indices);
          faceBlockKeys.push(face.key, face.key);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(build.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(build.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(build.uvs, 2));
      geometry.setIndex(indices);

      let groupStart = 0;
      for (const materialIndex of [...build.materialGroups.keys()].sort((a, b) => a - b)) {
        const count = build.materialGroups.get(materialIndex)!.length * 6;
        geometry.addGroup(groupStart, count, materialIndex);
        groupStart += count;
      }

      geometry.computeBoundingSphere();

      const mesh = new THREE.Mesh(geometry, blockMaterials);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.renderOrder = shadows ? 0 : 2;
      scene.add(mesh);
      meshes.push(mesh);
      faceBlockKeysByMesh.set(mesh, faceBlockKeys);
    }

    function createLeavesChunkMesh(build: MeshBuild) {
      if (build.positions.length === 0) return;

      const indices: number[] = [];
      const faceBlockKeys: string[] = [];

      for (const materialIndex of [...build.materialGroups.keys()].sort((a, b) => a - b)) {
        for (const face of build.materialGroups.get(materialIndex)!) {
          indices.push(...face.indices);
          faceBlockKeys.push(face.key, face.key);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(build.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(build.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(build.uvs, 2));
      geometry.setIndex(indices);

      let groupStart = 0;
      for (const materialIndex of [...build.materialGroups.keys()].sort((a, b) => a - b)) {
        const count = build.materialGroups.get(materialIndex)!.length * 6;
        geometry.addGroup(groupStart, count, materialIndex);
        groupStart += count;
      }

      geometry.computeBoundingSphere();

      const mesh = new THREE.Mesh(geometry, blockMaterials);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      scene.add(mesh);
      meshes.push(mesh);
      faceBlockKeysByMesh.set(mesh, faceBlockKeys);
    }

    createChunkMesh(opaqueBuild, true);
    createChunkMesh(glassBuild, false);
    createLeavesChunkMesh(leavesBuild);
    chunkMeshes.set(chunkKey, { meshes, faceBlockKeysByMesh });
    visibleChunkRaycastDirty = true;
  }

  function rebuildAllChunks() {
    const chunkKeys = new Set<string>();
    for (const block of blocks.values()) chunkKeys.add(chunkKeyOf(block.position.x, block.position.z));
    for (const chunkKey of chunkKeys) rebuildChunk(chunkKey);
  }

  function rebuildAroundBlock(x: number, z: number) {
    rebuildChunk(chunkKeyOf(x, z));
    rebuildChunk(chunkKeyOf(x - 1, z));
    rebuildChunk(chunkKeyOf(x + 1, z));
    rebuildChunk(chunkKeyOf(x, z - 1));
    rebuildChunk(chunkKeyOf(x, z + 1));
  }

  function queueFallingNeighbors(x: number, y: number, z: number) {
    queueFallingCheck(x, y + 1, z);
    queueFallingCheck(x + 1, y + 1, z);
    queueFallingCheck(x - 1, y + 1, z);
    queueFallingCheck(x, y + 1, z + 1);
    queueFallingCheck(x, y + 1, z - 1);
  }

  function lightConfig(type: BlockType): { color: number; intensity: number; distance: number } | null {
    if (type === 'lantern') return { color: 0xffaa44, intensity: 1.8, distance: 10 };
    if (type === 'soulLantern') return { color: 0x44aacc, intensity: 1.4, distance: 8 };
    if (type === 'torch') return { color: 0xffcc66, intensity: 2.0, distance: 12 };
    return null;
  }

  function addBlockLight(x: number, y: number, z: number, type: BlockType) {
    const cfg = lightConfig(type);
    if (!cfg) return;
    const key = keyOf(x, y, z);
    if (blockLights.has(key)) return;
    const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance);
    light.position.set(x, y + 0.2, z);
    scene.add(light);
    blockLights.set(key, light);
  }

  function removeBlockLight(x: number, y: number, z: number) {
    const key = keyOf(x, y, z);
    const light = blockLights.get(key);
    if (!light) return;
    scene.remove(light);
    light.dispose();
    blockLights.delete(key);
  }

  function addBlock(x: number, y: number, z: number, type: BlockType, waterDistance = 0) {
    if (type === 'water') {
      addWaterCell(x, y, z, waterDistance);
      return;
    }

    const key = keyOf(x, y, z);
    if (blocks.has(key)) return;

    removeWaterCell(x, y, z);
    blocks.set(key, { position: new THREE.Vector3(x, y, z), type });
    if (isSolidBlock(type)) addSolidColumnY(x, y, z);
    if (isFallingBlock(type)) queueFallingCheck(x, y, z);
    queueWaterNeighbors(x, y, z);
    if (blockMeshesReady) rebuildAroundBlock(x, z);
    addBlockLight(x, y, z, type);
  }

  function removeBlockAt(x: number, y: number, z: number, rebuild = true) {
    const key = keyOf(x, y, z);
    const block = blocks.get(key);
    if (!block) return null;
    blocks.delete(key);
    if (isSolidBlock(block.type)) removeSolidColumnY(x, y, z);
    queueWaterNeighbors(x, y, z);
    queueFallingNeighbors(x, y, z);
    if (rebuild) rebuildAroundBlock(x, z);
    removeBlockLight(x, block.position.y, z);
    return block;
  }

  function createFallingMesh(type: BlockType) {
    const materialIndex = materialIndexFor(type, new THREE.Vector3(0, 1, 0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials[materialIndex]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function primeTnt(x: number, y: number, z: number, fuse = 2.4) {
    const removed = removeBlockAt(x, y, z, false);
    if (!removed || removed.type !== 'tnt') return;
    if (blockMeshesReady) rebuildAroundBlock(x, z);
    const tntMaterials = [
      blockMaterials[78], blockMaterials[78],
      blockMaterials[79], blockMaterials[80],
      blockMaterials[78], blockMaterials[78],
    ];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.92, 0.92), tntMaterials);
    mesh.castShadow = settings.shadows;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    primedTnts.push({ mesh, position: new THREE.Vector3(x, y, z), timer: fuse, flash: 0 });
    queueWaterNeighbors(x, y, z);
  }

  function spawnFallingBlock(x: number, y: number, z: number, type: BlockType) {
    removeBlockAt(x, y, z, false);
    if (blockMeshesReady) rebuildAroundBlock(x, z);
    const mesh = createFallingMesh(type);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    fallingBlocks.push({ mesh, type, velocityY: 0 });
  }

  function queueFallingCheck(x: number, y: number, z: number) {
    const block = blocks.get(keyOf(x, y, z));
    if (!block || !isFallingBlock(block.type)) return;
    if (y <= worldBottom + 1) return;
    if (canMoveInto(x, y - 1, z)) spawnFallingBlock(x, y, z, block.type);
  }

  function getHitBlock(hit: THREE.Intersection) {
    if (hit.faceIndex == null) return null;
    const chunk = [...chunkMeshes.values()].find((item) => item.meshes.includes(hit.object as THREE.Mesh));
    if (!chunk) return null;
    const key = chunk.faceBlockKeysByMesh.get(hit.object as THREE.Mesh)?.[hit.faceIndex];
    if (!key) return null;
    const block = blocks.get(key);
    return block ? { key, block } : null;
  }

  function resetBreaking() {
    isBreaking = false;
    breakingKey = null;
    breakingProgress = 0;
    destroyOverlay.visible = false;
  }

  function finishBreaking(key: string) {
    const target = blocks.get(key);
    if (!target) return;
    const { x, y, z } = target.position;
    if (target.type === 'tnt') {
      primeTnt(x, y, z);
      resetBreaking();
      emitSnapshot();
      return;
    }
    removeBlockAt(x, y, z);
    
    // Check if blocks above should fall
    for (let dy = y + 1; dy <= y + 16; dy += 1) {
      if (!blocks.has(keyOf(x, dy, z))) break;
      queueFallingCheck(x, dy, z);
    }
    
    breakingKey = null;
    breakingProgress = 0;
    destroyOverlay.visible = false;
    emitSnapshot();
  }

  function updateBreaking(delta: number, hit: THREE.Intersection | null) {
    if (!isBreaking || !hit) {
      if (!isBreaking) destroyOverlay.visible = false;
      return;
    }

    const target = getHitBlock(hit);
    if (!target) {
      resetBreaking();
      return;
    }

    if (breakingKey !== target.key) {
      breakingKey = target.key;
      breakingProgress = 0;
      destroyOverlay.position.copy(target.block.position);
      destroyOverlay.visible = true;
    }

    breakingProgress += delta * (isPlantBlock(target.block.type) ? 4.2 : 1.85) * settings.breakSpeed;
    const stage = THREE.MathUtils.clamp(Math.floor(breakingProgress * destroyStageMaterials.length), 0, destroyStageMaterials.length - 1);
    destroyOverlay.position.copy(target.block.position);
    destroyOverlay.material = destroyStageMaterials[stage];
    destroyOverlay.visible = true;

    if (breakingProgress >= 1) {
      finishBreaking(target.key);
      breakingProgress = 0;
      breakingKey = null;
    }
  }

  function buildTree(x: number, y: number, z: number) {
    const trunkHeight = 4 + Math.floor(seededNoise(x, y, z) * 3);
    for (let dy = 1; dy <= trunkHeight; dy += 1) addBlock(x, y + dy, z, 'wood');

    for (let layer = -1; layer <= 2; layer += 1) {
      const leafY = y + trunkHeight + layer;
      const baseRadius = layer < 1 ? 2 : 1;

      for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
        for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
          const distance = Math.abs(dx) + Math.abs(dz);
          const cornerNoise = seededNoise(x + dx, leafY, z + dz);
          const edgeLimit = baseRadius + (cornerNoise > 0.76 ? 1 : 0);
          if (distance > edgeLimit || (distance === 0 && layer < 0)) continue;
          if (distance >= baseRadius + 1 && cornerNoise < 0.9) continue;
          addBlock(x + dx, leafY, z + dz, 'leaves');
        }
      }
    }

    addBlock(x, y + trunkHeight + 2, z, 'leaves');
  }

  function buildJungleTree(x: number, y: number, z: number) {
    const trunkHeight = 6 + Math.floor(seededNoise(x, y, z) * 5);
    for (let dy = 1; dy <= trunkHeight; dy += 1) addBlock(x, y + dy, z, 'jungleLog');

    for (let layer = -2; layer <= 2; layer += 1) {
      const leafY = y + trunkHeight + layer;
      const baseRadius = layer < 0 ? 3 : 2;

      for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
        for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
          const distance = Math.abs(dx) + Math.abs(dz);
          const cornerNoise = seededNoise(x + dx, leafY, z + dz);
          if (distance > baseRadius + (cornerNoise > 0.7 ? 1 : 0)) continue;
          if (distance === 0 && layer < 0) continue;
          addBlock(x + dx, leafY, z + dz, 'jungleLeaves');
        }
      }
    }
  }

  function buildCherryTree(x: number, y: number, z: number) {
    const trunkHeight = 4 + Math.floor(seededNoise(x, y, z) * 2);
    for (let dy = 1; dy <= trunkHeight; dy += 1) addBlock(x, y + dy, z, 'cherryLog');

    for (let layer = -1; layer <= 2; layer += 1) {
      const leafY = y + trunkHeight + layer;
      const baseRadius = layer < 1 ? 2 : 1;

      for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
        for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
          const distance = Math.abs(dx) + Math.abs(dz);
          if (distance > baseRadius + 1) continue;
          if (distance === 0 && layer < 0) continue;
          addBlock(x + dx, leafY, z + dz, 'cherryLeaves');
        }
      }
    }
  }

  function buildSpruceTree(x: number, y: number, z: number) {
    const trunkHeight = 5 + Math.floor(seededNoise(x, y, z) * 3);
    for (let dy = 1; dy <= trunkHeight; dy += 1) addBlock(x, y + dy, z, 'spruceLog');

    for (let layer = -1; layer <= trunkHeight; layer += 1) {
      const leafY = y + trunkHeight + 2 - layer;
      const radius = Math.max(0, Math.floor(layer / 2));

      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.abs(dx) + Math.abs(dz) > radius) continue;
          if (dx === 0 && dz === 0 && layer < trunkHeight) continue;
          addBlock(x + dx, leafY, z + dz, 'spruceLeaves');
        }
      }
    }
  }

  function buildCactus(x: number, y: number, z: number) {
    const height = 2 + Math.floor(seededNoise(x, y, z) * 3);
    for (let dy = 1; dy <= height; dy += 1) addBlock(x, y + dy, z, 'cactus');
  }

  function buildPumpkinPatch(x: number, y: number, z: number) {
    const count = 1 + Math.floor(seededNoise(x, y, z) * 3);
    for (let i = 0; i < count; i += 1) {
      const dx = Math.floor(seededNoise(x + i, y, z) * 3) - 1;
      const dz = Math.floor(seededNoise(x, y, z + i) * 3) - 1;
      addBlock(x + dx, y + 1, z + dz, 'pumpkin');
    }
  }

  function buildMushroomCluster(x: number, y: number, z: number) {
    const count = 2 + Math.floor(seededNoise(x, y, z) * 4);
    for (let i = 0; i < count; i += 1) {
      const dx = Math.floor(seededNoise(x + i, y, z) * 5) - 2;
      const dz = Math.floor(seededNoise(x, y, z + i) * 5) - 2;
      const type = seededNoise(x + i, y + 1, z + i) > 0.5 ? 'brownMushroom' : 'redMushroom';
      addBlock(x + dx, y + 1, z + dz, type);
    }
  }

  function buildRockFormation(x: number, y: number, z: number) {
    const radius = 1 + Math.floor(seededNoise(x, y, z) * 2);
    const height = 1 + Math.floor(seededNoise(x, y + 1, z) * 2);

    for (let dy = 0; dy <= height; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          const distance = Math.abs(dx) + Math.abs(dz);
          if (distance > radius + (seededNoise(x + dx, y + dy, z + dz) > 0.6 ? 1 : 0)) continue;
          const type = dy === height ? 'cobblestone' : 'mossyCobblestone';
          addBlock(x + dx, y + dy, z + dz, type);
        }
      }
    }
  }

  function buildPond(x: number, y: number, z: number) {
    const radius = 2 + Math.floor(seededNoise(x, y, z) * 2);
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const distance = Math.hypot(dx, dz);
        if (distance > radius) continue;
        if (distance > radius - 1.5) {
          addBlock(x + dx, y, z + dz, 'clay');
        } else {
          addBlock(x + dx, y, z + dz, 'water', 0);
        }
      }
    }
  }

  function buildSnowPile(x: number, y: number, z: number) {
    const radius = 1 + Math.floor(seededNoise(x, y, z) * 2);
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.abs(dx) + Math.abs(dz) > radius) continue;
        addBlock(x + dx, y + 1, z + dz, 'snow');
      }
    }
  }

  function buildMineralVein(x: number, y: number, z: number, type: BlockType) {
    const size = 2 + Math.floor(seededNoise(x, y, z) * 3);
    for (let dx = 0; dx < size; dx += 1) {
      for (let dy = 0; dy < size; dy += 1) {
        for (let dz = 0; dz < size; dz += 1) {
          if (seededNoise(x + dx, y + dy, z + dz) > 0.6) {
            addBlock(x + dx, y + dy, z + dz, type);
          }
        }
      }
    }
  }

  function addVegetation(x: number, y: number, z: number) {
    if (isRiverBed(x, z) || seededNoise(x, y, z) < 0.58) return;
    const plant = isRiverBank(x, z) && seededNoise(x, y, z + 23) > 0.72 ? 'fern' : pickPlantFromRegistry(x, y, z, seededNoise);
    addBlock(x, y + 1, z, plant);
  }

  function createCreature(x: number, z: number) {
    const h = terrainHeight(x, z) + 1;
    const root = new THREE.Group();
    root.position.set(x, h, z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.9), new THREE.MeshLambertMaterial({ color: 0xffd56f }));
    body.position.y = 0.38;
    body.castShadow = true;
    root.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.52), new THREE.MeshLambertMaterial({ color: 0xffe29a }));
    head.position.set(0, 0.77, -0.28);
    head.castShadow = true;
    root.add(head);

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x392d38 });
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), eyeMaterial);
    leftEye.position.set(-0.13, 0.82, -0.55);
    root.add(leftEye);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.13;
    root.add(rightEye);

    scene.add(root);
    creatures.push({ root, phase: Math.random() * Math.PI * 2, home: root.position.clone() });
  }

  function spawnCreatures() {
    createCreature(-6, -5);
    createCreature(5, -8);
    createCreature(8, 4);
    createCreature(-9, 6);
  }

  function settleInitialFallingBlocks() {
    const candidates = [...blocks.values()].filter((block) => isFallingBlock(block.type));
    for (const block of candidates) queueFallingCheck(block.position.x, block.position.y, block.position.z);
  }

  function queueInitialWater() {
    for (const cell of waterCells.values()) queueWaterUpdate(cell.position.x, cell.position.y, cell.position.z);
  }

  function updateModelPreview(hit: THREE.Intersection | null) {
    if (!selectedModelId || !hit?.face) {
      // clearModelPreview() removed
      return;
    }

    const stored = storedModels.get(selectedModelId);
    const hitBlock = getHitBlock(hit);
    if (!stored || !hitBlock) {
      return;
    }

    // Preview logic removed
  }

  function updateSelection(delta = 0) {
    raycaster.setFromCamera(_tempVec2, camera);
    modelRaycastTimer += delta;
    const shouldRaycastModels = delta === 0 || modelRaycastTimer >= 0.12;
    if (!selectedModelId && placedModelRaycastRoots.length > 0 && shouldRaycastModels) {
      modelRaycastTimer = 0;
      const modelHits = raycaster.intersectObjects(placedModelRaycastRoots, true);
      if (modelHits.length > 0) {
        outline.visible = false;
        return modelHits[0];
      }
    }

    const hits = raycaster.intersectObjects(visibleChunkRaycastMeshes, false);
    if (hits.length === 0) {
      outline.visible = false;
      updateModelPreview(null);
      return null;
    }

    const hit = hits[0];
    const target = getHitBlock(hit);
    if (!target) {
      outline.visible = false;
      updateModelPreview(null);
      return null;
    }

    outline.visible = true;
    outline.position.copy(target.block.position);
    updateModelPreview(hit);
    return hit;
  }

  function placeBlock(hit: THREE.Intersection) {
    if (!hit.face) return;
    const hitBlock = getHitBlock(hit);
    if (!hitBlock) return;
    const target = rounded(hitBlock.block.position.clone().add(hit.face.normal));
    const player = controls.object.position;
    if (target.distanceTo(player) < 1.45) return;
    if (selectedModelId) {
      placeStoredModel(selectedModelId, new THREE.Vector3(target.x + 0.5, target.y - 0.5, target.z + 0.5));
      return;
    }
    addBlock(target.x, target.y, target.z, selectedBlock);
    emitSnapshot();
  }

  function updatePlayer(delta: number) {
    const speed = keys.has('shiftleft') || keys.has('shiftright') ? settings.moveSpeed * 1.58 : settings.moveSpeed;
    const forward = Number(keys.has('keyw')) - Number(keys.has('keys'));
    const right = Number(keys.has('keyd')) - Number(keys.has('keya'));
    _tempDirection.set(right, 0, forward);
    if (_tempDirection.lengthSq() > 0) _tempDirection.normalize();

    controls.moveRight(_tempDirection.x * speed * delta);
    controls.moveForward(_tempDirection.z * speed * delta);

    verticalVelocity -= 17 * delta;
    physicalY += verticalVelocity * delta;

    if (!isDead && physicalY < worldBottom - 8) {
      isDead = true;
      verticalVelocity = 0;
      controls.unlock();
      emitSnapshot();
      return;
    }
    if (isDead) return;

    const x = Math.round(controls.object.position.x);
    const z = Math.round(controls.object.position.z);
    const groundY = groundHeightAt(x, z, physicalY + 1.05);
    const wasFalling = verticalVelocity < -2.2;
    if (physicalY < groundY) {
      if (!canJump && wasFalling) landingDip = Math.min(0.18, Math.abs(verticalVelocity) * 0.018);
      verticalVelocity = 0;
      physicalY = groundY;
      canJump = true;
    } else if (physicalY > groundY + 0.08) {
      canJump = false;
    }

    const moving = _tempDirection.lengthSq() > 0 && canJump;
    headBob += delta * (moving ? speed * 1.35 : 2.2);
    landingDip = THREE.MathUtils.damp(landingDip, 0, 9, delta);
    const bobOffset = moving ? Math.sin(headBob * Math.PI * 2) * 0.035 : Math.sin(headBob) * 0.008;
    const targetVisualY = physicalY + bobOffset - landingDip;
    visualY = THREE.MathUtils.damp(visualY, targetVisualY, canJump ? 13 : 8, delta);
    controls.object.position.y = visualY;
  }

  function updateLight(delta: number) {
    timeOfDay = (timeOfDay + delta * settings.daySpeed) % 1;
    const angle = timeOfDay * Math.PI * 2;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);
    const player = controls.object.position;
    skyDome.position.copy(player);

    const shadowUpdateDistSq = 16;
    const dxShadow = player.x - lastShadowUpdateX;
    const dzShadow = player.z - lastShadowUpdateZ;
    if (dxShadow * dxShadow + dzShadow * dzShadow > shadowUpdateDistSq) {
      lastShadowUpdateX = player.x;
      lastShadowUpdateZ = player.z;
      sun.target.position.set(player.x, player.y - 2, player.z);
      moon.target.position.set(player.x, player.y - 2, player.z);
    }

    sun.position.set(player.x + sunX * 30, player.y + sunY * 35 + 8, player.z + 16);
    sunSprite.position.set(player.x + sunX * 55, player.y + sunY * 58 + 16, player.z + 30);
    moon.position.set(player.x - sunX * 22, player.y - sunY * 28 + 10, player.z - 12);
    moonSprite.position.set(player.x - sunX * 48, player.y - sunY * 52 + 16, player.z - 24);

    const day = THREE.MathUtils.clamp(sunY * 0.75 + 0.35, 0.05, 1);
    sun.color.copy(_colorWarmSun).lerp(_colorWhiteSun, THREE.MathUtils.smoothstep(day, 0.25, 0.75));
    sun.intensity = 0.2 + day * 2.45;
    sunSprite.material.opacity = THREE.MathUtils.smoothstep(day, 0.12, 0.55);
    moon.intensity = 0.1 + (1 - day) * 0.62;
    moonSprite.material.opacity = THREE.MathUtils.smoothstep(1 - day, 0.18, 0.62);
    hemiLight.color.copy(_colorHemiNight).lerp(_colorHemiDay, day);
    hemiLight.groundColor.copy(_colorHemiGroundNight).lerp(_colorHemiGroundDay, day);
    hemiLight.intensity = 0.42 + day * 1.85;
    const zenithColor = _tempColor1.copy(_colorNight).lerp(_colorZenithDay, day);
    const skyColor = _tempColor2.copy(_colorNight).lerp(_colorDay, day).lerp(_colorHorizon, (1 - Math.abs(sunY)) * 0.28);
    if (skyMaterial instanceof THREE.ShaderMaterial) {
      skyMaterial.uniforms.topColor.value.copy(zenithColor);
      skyMaterial.uniforms.horizonColor.value.copy(skyColor);
      skyMaterial.uniforms.bottomColor.value.copy(_colorBottomNight).lerp(_colorBottomDay, day);
    } else if (skyMaterial instanceof THREE.MeshBasicMaterial) {
      skyMaterial.color.copy(skyColor);
    }
    scene.background = skyColor;
    scene.fog!.color.copy(skyColor);
    if (scene.fog instanceof THREE.Fog) scene.fog.near = THREE.MathUtils.lerp(10, 20, day);
  }

  function updateCreatures(elapsed: number) {
    for (const creature of creatures) {
      const t = elapsed * 0.55 + creature.phase;
      const newX = creature.home.x + Math.sin(t) * 1.2;
      const newZ = creature.home.z + Math.cos(t * 0.8) * 1.2;
      creature.root.position.x = newX;
      creature.root.position.z = newZ;
      creature.root.position.y = terrainHeight(Math.round(newX), Math.round(newZ)) + 1 + Math.sin(t * 4) * 0.04;
      creature.root.rotation.y = Math.atan2(Math.cos(t), Math.sin(t * 0.8));
    }
  }

  function waterFlowAt(position: THREE.Vector3) {
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const z = Math.round(position.z);
    const current = waterCells.get(keyOf(x, y, z)) ?? waterCells.get(keyOf(x, y - 1, z)) ?? waterCells.get(keyOf(x, y + 1, z));
    if (!current) return _tempFlow.set(0, 0, 0);

    _tempFlow.set(0, 0, 0);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of directions) {
      const neighbor = waterCells.get(keyOf(x + dx, current.position.y, z + dz));
      if (neighbor) {
        const levelDelta = current.level - neighbor.level;
        if (levelDelta >= 0) {
          _tempFlowDir.set(dx, 0, dz).multiplyScalar(0.65 + levelDelta * 0.35);
          _tempFlow.add(_tempFlowDir);
        }
      } else if (current.level > 1) {
        _tempFlowDir.set(dx, 0, dz).multiplyScalar(0.35);
        _tempFlow.add(_tempFlowDir);
      }
    }
    if (_tempFlow.lengthSq() > 0) {
      _tempFlow.normalize().multiplyScalar(2.8 * (current.level / 7));
    }
    return _tempFlow;
  }

  function pushModelByWater(entity: PlacedModelEntity, delta: number) {
    const flow = waterFlowAt(entity.root.position);
    if (flow.lengthSq() === 0) return;
    const move = flow.multiplyScalar(delta);
    entity.anchor.add(move);
    entity.root.position.add(move);
  }

  function updatePlacedModels(delta: number, elapsed: number) {
    const playerPosition = controls.object.position;
    const viewDirection = _tempVec3;
    camera.getWorldDirection(viewDirection);

    for (const entity of placedModels.values()) {
      if (entity.hurtCooldown > 0) entity.hurtCooldown = Math.max(0, entity.hurtCooldown - delta);
      if (entity.hurtFlash > 0) {
        const wasFlashing = entity.hurtFlash;
        entity.hurtFlash = Math.max(0, entity.hurtFlash - delta);
        flashEntityMaterials(entity, entity.hurtFlash / 0.18);
        if (wasFlashing > 0 && entity.hurtFlash === 0) applyPlacedModelSettings(entity);
      }

      pushModelByWater(entity, delta);

      if (entity.velocity.lengthSq() > 0.01 || entity.velocityY !== 0) {
        entity.velocity.y += entity.velocityY;
        entity.velocityY -= 28 * delta;
        entity.anchor.add(entity.velocity.clone().multiplyScalar(delta));
        const groundY = terrainHeight(Math.round(entity.anchor.x), Math.round(entity.anchor.z)) + 0.5;
        if (entity.anchor.y < groundY) {
          entity.anchor.y = groundY;
          entity.velocityY = 0;
          entity.velocity.set(0, 0, 0);
        }
        entity.root.position.copy(entity.anchor).add(entity.offset);
        entity.velocity.multiplyScalar(Math.max(0, 1 - delta * 5));
      }

      if (!entity.visible || entity.animationSpeed <= 0) continue;
      const distance = playerPosition.distanceTo(entity.root.position);
      if (distance > entity.animationDistance) {
        if (entity.root.visible) entity.root.visible = false;
        continue;
      }
      if (!entity.root.visible) entity.root.visible = true;

      const dx = entity.root.position.x - playerPosition.x;
      const dz = entity.root.position.z - playerPosition.z;
      const distSq = dx * dx + dz * dz;
      if (distance > 18 && (dx * viewDirection.x + dz * viewDirection.z) / Math.sqrt(distSq) < -0.15) continue;

      entity.animationTick += delta;
      const minInterval = distance > 42 ? 0.18 : distance > 24 ? 0.08 : 0;
      if (entity.animationTick < minInterval) continue;
      const step = entity.animationTick;
      entity.animationTick = 0;

      if (entity.vmdAnimation && entity.mmdRuntime?.tick && entity.vmdPlaying) {
        entity.vmdTime += step * entity.animationSpeed;
        entity.mmdRuntime.tick(entity.vmdTime, { mesh: entity.root, physics: false });
        continue;
      }

      if (entity.animation === 'none') continue;

      if (entity.animation === 'spin') {
        entity.root.rotation.y += step * entity.animationSpeed * 0.75;
      } else if (entity.animation === 'lookAtPlayer') {
        entity.root.rotation.y = Math.atan2(dx, dz) + Math.PI;
      } else if (entity.animation === 'idle') {
        const bob = Math.sin(elapsed * entity.animationSpeed * 2 + entity.animationPhase) * 0.035;
        const sway = Math.sin(elapsed * entity.animationSpeed + entity.animationPhase) * 0.045;
        entity.root.position.copy(entity.anchor).add(entity.offset);
        entity.root.position.y += bob;
        entity.root.rotation.z = sway;
      }
    }
  }

  function explodeAt(center: THREE.Vector3, radius = 4) {
    const affectedChunks = new Set<string>();
    const blocksToRemove: { x: number; y: number; z: number }[] = [];
    const minX = Math.floor(center.x - radius);
    const maxX = Math.ceil(center.x + radius);
    const minY = Math.floor(center.y - radius);
    const maxY = Math.ceil(center.y + radius);
    const minZ = Math.floor(center.z - radius);
    const maxZ = Math.ceil(center.z + radius);

    // 收集要移除的方块
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          _tempVec3.set(x, y, z);
          const distance = center.distanceTo(_tempVec3);
          if (distance > radius + seededNoise(x, y, z) * 0.8) continue;
          const block = blocks.get(keyOf(x, y, z));
          if (!block || block.type === 'bedrock') continue;
          if (block.type === 'tnt') {
            primeTnt(x, y, z, THREE.MathUtils.randFloat(0.35, 0.9));
          } else {
            blocksToRemove.push({ x, y, z });
          }
        }
      }
    }

    // 直接移除方块，不触发下落检查
    for (const { x, y, z } of blocksToRemove) {
      const key = keyOf(x, y, z);
      const block = blocks.get(key);
      if (!block) continue;
      blocks.delete(key);
      if (isSolidBlock(block.type)) removeSolidColumnY(x, y, z);
      queueWaterNeighbors(x, y, z);
      affectedChunks.add(chunkKeyOf(x, z));
    }

    for (const entity of placedModels.values()) {
      const distance = entity.root.position.distanceTo(center);
      if (distance < radius + 2) damagePlacedModel(entity, Math.round((radius + 2 - distance) * 12));
    }

    for (const chunkKey of affectedChunks) rebuildChunk(chunkKey);
    emitSnapshot();
  }

  function updatePrimedTnt(delta: number) {
    for (let index = primedTnts.length - 1; index >= 0; index -= 1) {
      const tnt = primedTnts[index];
      tnt.timer -= delta;
      tnt.flash += delta;
      tnt.mesh.position.y = tnt.position.y + Math.sin(tnt.flash * 16) * 0.04;
      tnt.mesh.material = Math.floor(tnt.flash * 8) % 2 === 0
        ? [tntFlashMaterial, tntFlashMaterial, tntFlashMaterial, tntFlashMaterial, tntFlashMaterial, tntFlashMaterial]
        : [blockMaterials[78], blockMaterials[78], blockMaterials[79], blockMaterials[80], blockMaterials[78], blockMaterials[78]];
      if (tnt.timer > 0) continue;
      scene.remove(tnt.mesh);
      tnt.mesh.geometry.dispose();
      primedTnts.splice(index, 1);
      explodeAt(tnt.position, 4.2);
    }
  }

  function updateFallingBlocks(delta: number) {
    for (let index = fallingBlocks.length - 1; index >= 0; index -= 1) {
      const entity = fallingBlocks[index];
      entity.velocityY -= 18 * delta;
      entity.mesh.position.y += entity.velocityY * delta;

      const x = Math.round(entity.mesh.position.x);
      const z = Math.round(entity.mesh.position.z);
      const targetY = Math.round(entity.mesh.position.y);
      const belowY = targetY - 1;
      const below = blocks.get(keyOf(x, belowY, z));
      const landed = belowY <= worldBottom || (below && isSolidBlock(below.type));

      if (!landed) continue;

      const placeY = Math.max(worldBottom + 1, belowY + 1);
      scene.remove(entity.mesh);
      entity.mesh.geometry.dispose();
      fallingBlocks.splice(index, 1);

      const replace = blocks.get(keyOf(x, placeY, z));
      if (replace && isReplaceableBlock(replace.type)) removeBlockAt(x, placeY, z, false);
      if (!blocks.has(keyOf(x, placeY, z))) addBlock(x, placeY, z, entity.type);
      queueFallingCheck(x, placeY + 1, z);
      rebuildAroundBlock(x, z);
      emitSnapshot();
    }
  }

  function flowWaterFrom(block: WaterCell) {
    const { x, y, z } = block.position;
    const distance = block.distance;
    let level = block.level;
    if (y <= worldBottom + 1) return;

    if (!block.source) {
      let suppliedLevel = 0;
      const aboveKey = keyOf(x, y + 1, z);
      const above = waterCells.get(aboveKey);
      if (above) suppliedLevel = 7;

      const xPlus = waterCells.get(keyOf(x + 1, y, z));
      const xMinus = waterCells.get(keyOf(x - 1, y, z));
      const zPlus = waterCells.get(keyOf(x, y, z + 1));
      const zMinus = waterCells.get(keyOf(x, y, z - 1));

      if (xPlus) suppliedLevel = Math.max(suppliedLevel, xPlus.source ? 6 : xPlus.level - 1);
      if (xMinus) suppliedLevel = Math.max(suppliedLevel, xMinus.source ? 6 : xMinus.level - 1);
      if (zPlus) suppliedLevel = Math.max(suppliedLevel, zPlus.source ? 6 : zPlus.level - 1);
      if (zMinus) suppliedLevel = Math.max(suppliedLevel, zMinus.source ? 6 : zMinus.level - 1);

      if (suppliedLevel <= 0) {
        removeWaterCell(x, y, z);
        return;
      }

      const nextLevel = Math.min(level, suppliedLevel);
      if (nextLevel < level) {
        block.level = nextLevel;
        level = nextLevel;
        markWaterChunkDirty(x, z);
        queueWaterNeighbors(x, y, z);
      }
    }

    const belowKey = keyOf(x, y - 1, z);
    const below = blocks.get(belowKey);
    const belowWater = waterCells.get(belowKey);
    if (!belowWater && (!below || isPlantBlock(below.type))) {
      if (below && isPlantBlock(below.type)) removeBlockAt(x, y - 1, z, false);
      addWaterCell(x, y - 1, z, 0, 7, false);
      return;
    }

    if (distance >= maxWaterSpreadDistance || level <= 1) return;

    const nextLevel = level - 1;
    const nxPlus = x + 1;
    const nxMinus = x - 1;
    const nzPlus = z + 1;
    const nzMinus = z - 1;

    const keyXP = keyOf(nxPlus, y, z);
    const keyXM = keyOf(nxMinus, y, z);
    const keyZP = keyOf(x, y, nzPlus);
    const keyZM = keyOf(x, y, nzMinus);

    const blockXP = blocks.get(keyXP);
    const blockXM = blocks.get(keyXM);
    const blockZP = blocks.get(keyZP);
    const blockZM = blocks.get(keyZM);

    const waterXP = waterCells.get(keyXP);
    const waterXM = waterCells.get(keyXM);
    const waterZP = waterCells.get(keyZP);
    const waterZM = waterCells.get(keyZM);

    const isVoidBelow = (tx: number, tz: number) => {
      for (let cy = y - 1; cy >= worldBottom; cy--) {
        if (blocks.has(keyOf(tx, cy, tz))) return false;
      }
      return true;
    };

    const anyNeighborVoid = !settings.infiniteWaterSpread && (
      (!blockXP && isVoidBelow(nxPlus, z)) ||
      (!blockXM && isVoidBelow(nxMinus, z)) ||
      (!blockZP && isVoidBelow(x, nzPlus)) ||
      (!blockZM && isVoidBelow(x, nzMinus))
    );

    if (!anyNeighborVoid) {
      if ((!blockXP || isPlantBlock(blockXP.type)) && (!waterXP || waterXP.level < nextLevel)) {
        if (blockXP && isReplaceableBlock(blockXP.type)) removeBlockAt(nxPlus, y, z, false);
        addWaterCell(nxPlus, y, z, distance + 1, nextLevel, false);
      }
      if ((!blockXM || isPlantBlock(blockXM.type)) && (!waterXM || waterXM.level < nextLevel)) {
        if (blockXM && isReplaceableBlock(blockXM.type)) removeBlockAt(nxMinus, y, z, false);
        addWaterCell(nxMinus, y, z, distance + 1, nextLevel, false);
      }
      if ((!blockZP || isPlantBlock(blockZP.type)) && (!waterZP || waterZP.level < nextLevel)) {
        if (blockZP && isReplaceableBlock(blockZP.type)) removeBlockAt(x, y, nzPlus, false);
        addWaterCell(x, y, nzPlus, distance + 1, nextLevel, false);
      }
      if ((!blockZM || isPlantBlock(blockZM.type)) && (!waterZM || waterZM.level < nextLevel)) {
        if (blockZM && isReplaceableBlock(blockZM.type)) removeBlockAt(x, y, nzMinus, false);
        addWaterCell(x, y, nzMinus, distance + 1, nextLevel, false);
      }
    }
  }

  function updateWater(delta: number) {
    waterUpdateTimer += delta;
    if (waterUpdateTimer < 0.25) return;
    waterUpdateTimer = 0;

    const toProcess = [...queuedWaterUpdates];
    queuedWaterUpdates.clear();
    waterUpdates.length = 0;

    const requeue = new Set<string>();
    for (const key of toProcess) {
      const block = waterCells.get(key);
      if (block) flowWaterFrom(block);
    }

    for (const key of requeue) {
      if (!queuedWaterUpdates.has(key)) {
        queuedWaterUpdates.add(key);
        waterUpdates.push(key);
      }
    }
  }

  function animate(timestamp?: number) {
    if (isDisposed) return;

    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.05);
    
    // FPS 计算
    const now = timestamp ?? 0;
    fpsFrameCount += 1;
    if (now - fpsLastTime >= 1000) {
      currentFps = fpsFrameCount;
      fpsFrameCount = 0;
      fpsLastTime = now;
      if (settings.showFps) {
        emitSnapshot();
      }
    }
    
    updateLight(delta);
    updateChunkVisibility(false, delta);
    const hit = controls.isLocked ? updateSelection(delta) : null;
    if (controls.isLocked) updateBreaking(delta, hit);

    if (controls.isLocked && isPlacing && hit) {
      placeTimer += delta;
      if (placeTimer >= placeInterval) {
        placeTimer = 0;
        placeBlock(hit);
      }
    }

    if (!controls.isLocked) {
      outline.visible = false;
      isPlacing = false;
      placeTimer = 0;
    }
    updateCreatures(timer.getElapsed());
    updatePlacedModels(delta, timer.getElapsed());
    updatePrimedTnt(delta);
    updateFallingBlocks(delta);
    updateWater(delta);
    rebuildDirtyWaterChunks();
    updateSelectedModelHelper();
    if (controls.isLocked) updatePlayer(delta);
    renderer.render(scene, camera);
  }

  function onPointerDown(event: PointerEvent) {
    if (!controls.isLocked) return;

    if (event.button === 0 && placedModelRaycastRoots.length > 0) {
      raycaster.setFromCamera(_tempVec2, camera);
      const modelHits = raycaster.intersectObjects(placedModelRaycastRoots, true);
      const modelEntity = modelHits.length > 0 ? findPlacedModelFromObject(modelHits[0].object) : null;
      if (modelEntity) {
        selectPlacedModel(modelEntity);
        camera.getWorldDirection(_tempKnockback);
        _tempKnockback.y = 0.2;
        _tempKnockback.normalize().multiplyScalar(4.5);
        damagePlacedModel(modelEntity, 8, _tempKnockback);
        return;
      }
    }

    const hit = updateSelection();
    if (!hit) return;
    if (event.button === 0) {
      isBreaking = true;
      updateBreaking(0, hit);
    }
    if (event.button === 2) {
      placeBlock(hit);
      isPlacing = true;
      placeTimer = 0;
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (event.button === 0) resetBreaking();
    if (event.button === 2) {
      isPlacing = false;
      placeTimer = 0;
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!controls.isLocked) return;
    if (uiKeyCodes.has(event.code)) return;

    if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      removeSelectedPlacedModel();
      return;
    }

    if (event.code === 'KeyF') {
      const entity = selectedPlacedModelId ? placedModels.get(selectedPlacedModelId) : null;
      if (entity && controls.object.position.distanceTo(entity.root.position) <= 6.5) {
        event.preventDefault();
        onModelMenuRequest?.();
        return;
      }
    }

    if (selectedModelId && event.code === 'KeyR') {
      event.preventDefault();
      modelPlacementRotation = (modelPlacementRotation + Math.PI / 8) % (Math.PI * 2);
      emitSnapshot();
      return;
    }

    if (selectedModelId && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
      event.preventDefault();
      const delta = event.code === 'BracketRight' ? 0.1 : -0.1;
      modelPlacementScale = THREE.MathUtils.clamp(modelPlacementScale + delta, 0.2, 3);
      emitSnapshot();
      return;
    }

    keys.add(event.code.toLowerCase());
    if (event.code === 'Space' && canJump) {
      physicalY = Math.max(physicalY, groundHeightAt(Math.round(controls.object.position.x), Math.round(controls.object.position.z), physicalY + 0.2));
      visualY = controls.object.position.y;
      verticalVelocity = 6.9;
      canJump = false;
    }

  }

  function onKeyUp(event: KeyboardEvent) {
    keys.delete(event.code.toLowerCase());
  }

  function onResize() {
    const width = Math.max(mount.clientWidth, 1);
    const height = Math.max(mount.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function onContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  function lockControls() {
    return controls.lock();
  }

  function unlockControls() {
    keys.clear();
    controls.unlock();
  }

  function onControlsLock() {
    keys.clear();
    cameraYaw = camera.rotation.y;
    cameraPitch = camera.rotation.x;
    applyCameraRotation();
    emitSnapshot(true);
  }

  function onControlsUnlock() {
    keys.clear();
    resetBreaking();
    emitSnapshot(false);
  }

  function importGltfModel(url: string, position = new THREE.Vector3()) {
    return gltfLoader.loadAsync(url).then((gltf) => {
      gltf.scene.position.copy(position);
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = settings.shadows;
          object.receiveShadow = true;
        }
      });
      scene.add(gltf.scene);
      return gltf.scene;
    });
  }

  function tuneMmdMaterial(material: THREE.Material) {
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

  function registerImportedMaterial(material: THREE.Material) {
    const mat = material as THREE.Material & { color?: THREE.Color };
    if (mat.color instanceof THREE.Color && !material.userData.baseColor) material.userData.baseColor = mat.color.clone();
    if (material.userData.baseOpacity === undefined) material.userData.baseOpacity = material.opacity;
    if (material.userData.baseTransparent === undefined) material.userData.baseTransparent = material.transparent;
    if (material.userData.baseDepthWrite === undefined) material.userData.baseDepthWrite = material.depthWrite;
    importedModelMaterials.add(material);
  }

  function applyModelBrightness() {
    for (const material of importedModelMaterials) {
      const mat = material as THREE.Material & { color?: THREE.Color };
      const baseColor = material.userData.baseColor as THREE.Color | undefined;
      if (mat.color instanceof THREE.Color && baseColor) {
        mat.color.copy(baseColor).multiplyScalar(settings.modelBrightness);
      }
    }
  }

  function applyPlacedModelSettings(entity: PlacedModelEntity) {
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

  function updateSelectedPlacedModel(nextSettings: Partial<Omit<PlacedModelSettings, 'id' | 'name'>>) {
    if (!selectedPlacedModelId) return;
    const entity = placedModels.get(selectedPlacedModelId);
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
    applyPlacedModelSettings(entity);
    emitSnapshot();
  }

  function updateSelectedModelPart(partId: string, nextSettings: Partial<Omit<ModelPartSettings, 'id' | 'name'>>) {
    if (!selectedPlacedModelId) return;
    const entity = placedModels.get(selectedPlacedModelId);
    if (!entity) return;
    const part = entity.parts.find((modelPart) => modelPart.id === partId);
    if (!part) return;
    if (nextSettings.visible !== undefined) part.visible = nextSettings.visible;
    if (nextSettings.opacity !== undefined) part.opacity = THREE.MathUtils.clamp(nextSettings.opacity, 0, 1);
    applyPlacedModelSettings(entity);
    emitSnapshot();
  }

  function flashEntityMaterials(entity: PlacedModelEntity, strength: number) {
    for (const material of entity.materials) {
      const mat = material as THREE.Material & { color?: THREE.Color };
      const baseColor = material.userData.baseColor as THREE.Color | undefined;
      if (mat.color instanceof THREE.Color && baseColor) {
        mat.color.copy(baseColor).lerp(_colorHurtFlash, strength).multiplyScalar(settings.modelBrightness * entity.brightness);
      }
    }
  }

  function damagePlacedModel(entity: PlacedModelEntity, amount: number, knockback?: THREE.Vector3) {
    if (!entity.damageable || entity.hurtCooldown > 0 || entity.health <= 0) return;
    entity.health = Math.max(0, entity.health - amount);
    entity.hurtCooldown = 0.22;
    entity.hurtFlash = 0.18;
    if (knockback) {
      entity.velocity.add(knockback);
      entity.velocityY = 6;
    }
    selectedPlacedModelId = entity.id;
    updateSelectedModelHelper();
    if (entity.health <= 0) destroyPlacedModel(entity);
    emitSnapshot();
  }

  function destroyPlacedModel(entity: PlacedModelEntity) {
    scene.remove(entity.root);
    placedModels.delete(entity.id);
    const index = placedModelRaycastRoots.indexOf(entity.root);
    if (index >= 0) placedModelRaycastRoots.splice(index, 1);
    if (selectedPlacedModelId === entity.id) selectedPlacedModelId = null;
    updateSelectedModelHelper();
  }

  function tuneMmdObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => tuneMmdMaterial(material));
    });
  }

  function collectObjectMaterials(object: THREE.Object3D) {
    const materials: THREE.Material[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
      materials.push(...childMaterials);
    });
    return materials;
  }

  function collectModelParts(object: THREE.Object3D) {
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

  function prepareImportedObject(object: THREE.Object3D) {
    const materials = collectObjectMaterials(object);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = settings.shadows;
        child.receiveShadow = true;
      }
    });
    materials.forEach((material) => registerImportedMaterial(material));
    return materials;
  }

  function updateProgress(options: ModelImportOptions | undefined, progress: number, label: string, fileName?: string) {
    options?.onProgress?.({ progress: THREE.MathUtils.clamp(progress, 0, 1), label, fileName });
  }



  function updateSelectedModelHelper() {
    // 逻辑已移除，保持空函数签名兼容其他调用
  }

  function selectPlacedModel(entity: PlacedModelEntity | null) {
    selectedPlacedModelId = entity?.id ?? null;
    updateSelectedModelHelper();
    emitSnapshot();
  }

  function removeSelectedPlacedModel() {
    if (!selectedPlacedModelId) return;
    const entity = placedModels.get(selectedPlacedModelId);
    if (!entity) return;
    scene.remove(entity.root);
    placedModels.delete(entity.id);
    const index = placedModelRaycastRoots.indexOf(entity.root);
    if (index >= 0) placedModelRaycastRoots.splice(index, 1);
    selectedPlacedModelId = null;
    updateSelectedModelHelper();
    emitSnapshot();
  }

  function findPlacedModelFromObject(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
      const id = current.userData.placedModelId as string | undefined;
      if (id) return placedModels.get(id) ?? null;
      current = current.parent;
    }
    return null;
  }

  function placeImportedObject(object: THREE.Object3D, position: THREE.Vector3, scale = 1, kind: 'generic' | 'mmd' = 'generic') {
    object.position.copy(position);
    object.scale.setScalar(scale);
    if (kind === 'mmd') tuneMmdObject(object);
    prepareImportedObject(object);
    applyModelBrightness();
    scene.add(object);
    return object;
  }

  function findSkinnedMesh(root: THREE.Object3D) {
    let skinnedMesh: THREE.SkinnedMesh | undefined;
    root.traverse((child) => {
      if (!skinnedMesh && child instanceof THREE.SkinnedMesh) skinnedMesh = child;
    });
    return skinnedMesh;
  }

  function registerImportedModel(root: THREE.Object3D, name: string, kind: 'generic' | 'mmd', scale = 1, mmdModel?: MmdModelHandle): ImportedModelItem {
    const id = `model-${Date.now().toString(36)}-${modelItemSequence.toString(36)}`;
    modelItemSequence += 1;
    root.visible = false;
    if (kind === 'mmd') tuneMmdObject(root);
    const preparedRoot = SkeletonUtils.clone(root);
    preparedRoot.visible = false;
    const materials = prepareImportedObject(preparedRoot);
    const previewBox = new THREE.Box3().setFromObject(preparedRoot);
    const previewSize = previewBox.getSize(new THREE.Vector3());
    const previewCenter = previewBox.getCenter(new THREE.Vector3());
    storedModels.set(id, { id, name, kind, root: preparedRoot, mmdModel, scale, materials, previewSize, previewCenter });
    return { id, name, kind };
  }

  function placeStoredModel(modelId: string, position: THREE.Vector3) {
    const stored = storedModels.get(modelId);
    if (!stored) return null;
    const clone = SkeletonUtils.clone(stored.root);
    clone.visible = true;
    clone.position.copy(position);
    clone.rotation.y = modelPlacementRotation;
    clone.scale.setScalar(stored.scale * modelPlacementScale);

    const sharedMaterials = stored.materials;
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = settings.shadows;
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
    materials.forEach((material) => registerImportedMaterial(material));
    const parts = collectModelParts(clone);
    const partByMaterial = new Map(parts.map((part) => [part.material, part]));
    applyModelBrightness();
    const placedId = `placed-${Date.now().toString(36)}-${placedModelSequence.toString(36)}`;
    placedModelSequence += 1;
    clone.userData.placedModelId = placedId;
    clone.traverse((child) => {
      child.userData.placedModelId = placedId;
    });
    const entity = {
      id: placedId,
      modelId,
      name: stored.name,
      root: clone,
      anchor: position.clone(),
      baseScale: stored.scale,
      scale: modelPlacementScale,
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
      animation: 'none' as const,
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
    placedModels.set(placedId, entity);
    placedModelRaycastRoots.push(clone);
    scene.add(clone);
    applyPlacedModelSettings(entity);
    selectPlacedModel(entity);
    return clone;
  }

  async function loadMmdTools() {
    return import('@yohawing/three-mmd-loader');
  }

  async function createMmdRuntimeForEntity(entity: PlacedModelEntity) {
    if (entity.mmdRuntime || !entity.mmdMesh) return entity.mmdRuntime;
    const { DefaultMmdRuntime } = await loadMmdTools();
    entity.mmdRuntime = new DefaultMmdRuntime({ physics: 'none' }) as MmdRuntimeHandle;
    if (entity.vmdAnimation) entity.mmdRuntime.setAnimation?.(entity.vmdAnimation, entity.mmdMesh);
    return entity.mmdRuntime;
  }

  async function importVmdForSelectedModel(file: File) {
    if (!selectedPlacedModelId) throw new Error('No placed model selected.');
    const entity = placedModels.get(selectedPlacedModelId);
    if (!entity || !entity.mmdMesh) throw new Error('Selected model does not support VMD.');
    const { ThreeMmdLoader } = await loadMmdTools();
    const loader = new ThreeMmdLoader();
    const loaded = await loader.loadAnimation(file);
    entity.vmdAnimation = loaded.animation;
    entity.vmdName = file.name;
    entity.vmdPlaying = false;
    entity.vmdTime = 0;
    entity.animation = 'none';
    const runtime = await createMmdRuntimeForEntity(entity);
    runtime?.setAnimation?.(entity.vmdAnimation, entity.mmdMesh);
    emitSnapshot();
  }

  async function importMmdModel(source: File | string, position = new THREE.Vector3()): Promise<THREE.Object3D> {
    const { ThreeMmdLoader } = await loadMmdTools();
    const mmdLoader = new ThreeMmdLoader();
    const model = await mmdLoader.loadModel(source);
    return placeImportedObject(model.root, position, 0.12, 'mmd');
  }

  async function importMmdModelFiles(files: File[], modelFile: File, options?: ModelImportOptions, progressStart = 0, progressSpan = 1) {
    updateProgress(options, progressStart + progressSpan * 0.08, '读取 MMD 文件', modelFile.name);
    const { createMmdTextureMapFromFiles, ThreeMmdLoader } = await loadMmdTools();
    updateProgress(options, progressStart + progressSpan * 0.18, '准备贴图映射', modelFile.name);
    const loader = new ThreeMmdLoader({ textureMap: createMmdTextureMapFromFiles(files, modelFile) });
    updateProgress(options, progressStart + progressSpan * 0.28, '解析 PMX/PMD', modelFile.name);
    const model = await loader.loadModel(modelFile);
    updateProgress(options, progressStart + progressSpan * 0.82, '注册可放置模型', modelFile.name);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    return registerImportedModel(model.root, modelFile.name, 'mmd', 0.12, model as MmdModelHandle);
  }

  async function importGltfModelFile(file: File, options?: ModelImportOptions) {
    const url = URL.createObjectURL(file);
    try {
      updateProgress(options, 0.15, '读取 GLTF/GLB', file.name);
      const gltf = await gltfLoader.loadAsync(url);
      updateProgress(options, 0.85, '注册可放置模型', file.name);
      return registerImportedModel(gltf.scene, file.name, 'generic', 1);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function importModelFiles(files: File[], options?: ModelImportOptions) {
    const hasMmdFiles = files.some((file) => file.name.match(/\.(pmx|pmd)$/i));
    if (!hasMmdFiles) {
      const gltfModel = files.find((file) => file.name.match(/\.(glb|gltf)$/i));
      if (gltfModel) return importModelFile(gltfModel, options);
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
          imported.push(await importMmdModelFiles(files, mmdModel, options, start, span));
          updateProgress(options, start + span, `已处理 ${index + 1}/${mmdModels.length}`, mmdModel.name);
        } catch (error) {
          console.warn(`Failed to import MMD model ${mmdModel.name}`, error);
        }
      }
      updateProgress(options, 1, '导入完成');
      if (imported.length > 0) return imported;
    }

    const gltfModel = files.find((file) => file.name.match(/\.(glb|gltf)$/i));
    if (gltfModel) return importModelFile(gltfModel, options);

    return Promise.reject(new Error('No supported model file found.'));
  }

  async function importModelFile(file: File, options?: ModelImportOptions): Promise<ImportedModelItem[]> {
    if (file.name.match(/\.(pmx|pmd)$/i)) {
      const item = await importMmdModelFiles([file], file, options);
      updateProgress(options, 1, '导入完成', file.name);
      return [item];
    }
    const item = await importGltfModelFile(file, options);
    updateProgress(options, 1, '导入完成', file.name);
    return [item];
  }

  function noteMmdSupport() {
    return 'PMX/PMD folders are supported through @yohawing/three-mmd-loader texture maps.';
  }

  // 异步初始化世界
  await new Promise<void>((resolve) => {
    onProgress?.('生成地形', 0);
    
    // 使用 setTimeout 分批处理
    const batchSize = 20;
    const xCoords: number[] = [];
    const zCoords: number[] = [];
    
    for (let x = -worldRadius; x <= worldRadius; x += 1) {
      for (let z = -worldRadius; z <= worldRadius; z += 1) {
        xCoords.push(x);
        zCoords.push(z);
      }
    }
    
    let index = 0;
    const totalBlocks = xCoords.length;
    
    // 树木密度倍率
    const treeDensityMultiplier = worldGen.treeDensity === 'none' ? 0 
      : worldGen.treeDensity === 'sparse' ? 1.5 
      : worldGen.treeDensity === 'dense' ? 0.7 
      : 1;

    // 结构密度倍率
    const structureDensityOffset = worldGen.structureDensity === 'none' ? 1 
      : worldGen.structureDensity === 'sparse' ? 0.05 
      : worldGen.structureDensity === 'dense' ? -0.05 
      : 0;

    // 矿物密度倍率
    const oreDensityMultiplier = worldGen.oreDensity === 'none' ? 0 
      : worldGen.oreDensity === 'sparse' ? 1.5 
      : worldGen.oreDensity === 'rich' ? 0.7 
      : 1;

    function processBatch() {
      const endIndex = Math.min(index + batchSize, totalBlocks);
      
      for (let i = index; i < endIndex; i += 1) {
        const x = xCoords[i];
        const z = zCoords[i];
        const distance = Math.hypot(x, z);
        if (distance > worldRadius + Math.sin(x * z) * 0.8) continue;

        const biome = getBiome(x, z);
        const config = biomeConfig[biome];
        const river = worldGen.flatWorld ? { bed: false, bank: false, bankBlend: 0, depth: 0 } : riverProfile(x, z);

        let h: number;
        if (worldGen.flatWorld) {
          h = waterLevel;
        } else {
          h = terrainHeight(x, z);
          if (river.bed) h = Math.min(h - river.depth, waterLevel - river.depth);
          if (!river.bed && river.bank && river.bankBlend > 0.5 && h > waterLevel + 1) h -= 1;
          if (!river.bed && river.bank) h = Math.max(h, waterLevel);
        }

        for (let y = worldBottom; y <= h; y += 1) {
          const bankRoll = seededNoise(x, y, z);
          let surfaceType: BlockType;
          if (river.bed) {
            surfaceType = bankRoll > 0.38 ? 'sand' : 'gravel';
          } else if (river.bank && bankRoll < river.bankBlend * 0.58) {
            surfaceType = 'sand';
          } else if (biome === 'desert') {
            surfaceType = 'sand';
          } else if (biome === 'snow') {
            surfaceType = y === h ? 'snow' : 'grass';
          } else {
            surfaceType = config.surfaceBlock;
          }
          const type = y === worldBottom ? 'bedrock' : y === h ? surfaceType : biome === 'desert' ? (y > h - 4 ? 'sand' : 'stone') : y > h - 3 ? 'dirt' : 'stone';
          addBlock(x, y, z, type);
        }

        // 矿物生成 - 只在地下深处生成
        if (oreDensityMultiplier > 0 && h > waterLevel + 3) {
          const mineralNoise = seededNoise(x * 3, h * 3, z * 3);
          const oreThreshold = 0.96 * oreDensityMultiplier;
          if (mineralNoise > oreThreshold) buildMineralVein(x, h - 5, z, 'coalOre');
          if (mineralNoise > oreThreshold + 0.01) buildMineralVein(x, h - 8, z, 'ironOre');
          if (mineralNoise > oreThreshold + 0.02) buildMineralVein(x, h - 11, z, 'copperOre');
          if (mineralNoise > oreThreshold + 0.03) buildMineralVein(x, h - 14, z, 'goldOre');
          if (mineralNoise > oreThreshold + 0.035) buildMineralVein(x, h - 17, z, 'diamondOre');
        }

        if (river.bed) {
          for (let y = h + 1; y <= waterLevel; y += 1) addBlock(x, y, z, 'water', 0);
          continue;
        }

        // 树木生成 - 根据生物群系和设置
        if (treeDensityMultiplier > 0 && distance > 8 && !river.bank && config.treeTypes.length > 0) {
          const treeNoise = seededNoise(x, h, z);
          const treeThreshold = config.treeDensity * treeDensityMultiplier;
          if (treeNoise > treeThreshold) {
            const treeType = config.treeTypes[Math.floor(seededNoise(x, h + 1, z) * config.treeTypes.length)];
            if (treeType === 'oak') buildTree(x, h, z);
            else if (treeType === 'jungle') buildJungleTree(x, h, z);
            else if (treeType === 'cherry') buildCherryTree(x, h, z);
            else if (treeType === 'spruce') buildSpruceTree(x, h, z);
          }
        }

        // 植被和结构生成
        if (h >= waterLevel && worldGen.structureDensity !== 'none') {
          const structNoise = seededNoise(x + 11, h, z - 7);
          const structThreshold = config.plantDensity + structureDensityOffset;
          if (structNoise > structThreshold) addVegetation(x, h, z);
          else if (biome === 'desert' && structNoise > 0.92 - structureDensityOffset) buildCactus(x, h, z);
          else if (biome !== 'desert' && biome !== 'snow' && structNoise > 0.93 - structureDensityOffset) buildPumpkinPatch(x, h, z);
          else if (biome === 'forest' && structNoise > 0.91 - structureDensityOffset) buildMushroomCluster(x, h, z);
          else if (biome !== 'desert' && structNoise > 0.89 - structureDensityOffset) buildRockFormation(x, h, z);
          else if (biome !== 'desert' && structNoise > 0.87 - structureDensityOffset) buildPond(x, h, z);
          else if (biome === 'snow' && structNoise > 0.85 - structureDensityOffset) buildSnowPile(x, h, z);
        }
      }
      
      index = endIndex;
      onProgress?.('生成地形', index / totalBlocks);
      
      if (index < totalBlocks) {
        setTimeout(processBatch, 0);
      } else {
        onProgress?.('处理物理', 0);
        settleInitialFallingBlocks();
        queueInitialWater();
        onProgress?.('构建网格', 0);
        rebuildAllChunks();
        while (dirtyWaterChunks.size > 0) rebuildDirtyWaterChunks(64);
        updateChunkVisibility(true);
        blockMeshesReady = true;
        for (const [key, block] of blocks) {
          const cfg = lightConfig(block.type);
          if (cfg) {
            const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance);
            light.position.set(block.position.x, block.position.y + 0.2, block.position.z);
            scene.add(light);
            blockLights.set(key, light);
          }
        }
        spawnCreatures();
        onProgress?.('完成', 1);
        resolve();
      }
    }
    
    setTimeout(processBatch, 0);
  });

  emitSnapshot();

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', resetBreaking);
  controls.addEventListener('lock', onControlsLock);
  controls.addEventListener('unlock', onControlsUnlock);
  renderer.setAnimationLoop(animate);

  function save(name: string): WorldSaveData {
    const { blocksBin, blockDict } = serializeBlocks(blocks);

    const waterEntries: [string, { distance: number; level: number; source: boolean }][] = [];
    for (const [key, cell] of waterCells) waterEntries.push([key, { distance: cell.distance, level: cell.level, source: cell.source }]);

    const placed: WorldSaveData['placedModels'] = [];
    for (const entity of placedModels.values()) {
      placed.push({
        id: entity.id,
        modelId: entity.modelId,
        name: entity.name,
        x: entity.anchor.x, y: entity.anchor.y, z: entity.anchor.z,
        scale: entity.scale,
        baseScale: entity.baseScale,
        rotation: entity.root.rotation.y,
        brightness: entity.brightness,
        opacity: entity.opacity,
        visible: entity.visible,
        shadows: entity.shadows,
        animation: entity.animation,
        animationSpeed: entity.animationSpeed,
        animationDistance: entity.animationDistance,
        parts: entity.parts.map(p => ({ id: p.id, name: p.name, opacity: p.opacity, visible: p.visible })),
      });
    }

    const imported: WorldSaveData['importedModels'] = [];
    for (const model of storedModels.values()) {
      imported.push({ id: model.id, name: model.name, kind: model.kind });
    }

    return {
      version: 2,
      name,
      savedAt: Date.now(),
      seed: worldSeed,
      worldGen: { ...worldGen },
      blocksBin,
      blockDict,
      waterCells: waterEntries,
      player: {
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        yaw: cameraYaw, pitch: cameraPitch,
        physicalY,
      },
      timeOfDay,
      settings: { ...settings },
      hotbar: [],
      activeSlot: 0,
      placedModels: placed,
      importedModels: imported,
    };
  }

  function load(data: WorldSaveData) {
    worldSeed = data.seed;

    for (const [, chunkMesh] of chunkMeshes) {
      for (const m of chunkMesh.meshes) { scene.remove(m); m.geometry.dispose(); }
    }
    for (const [, wm] of waterChunkMeshes) {
      scene.remove(wm.mesh); wm.mesh.geometry.dispose();
    }
    for (const c of creatures) scene.remove(c.root);

    blocks.clear();
    waterCells.clear();
    columnSolidY.clear();
    chunkMeshes.clear();
    waterChunkMeshes.clear();
    dirtyWaterChunks.clear();
    waterKeys.clear();
    waterUpdates.length = 0;
    queuedWaterUpdates.clear();
    creatures.length = 0;
    fallingBlocks.length = 0;
    placedModels.clear();

    if (data.version === 2 && data.blocksBin && data.blockDict) {
      deserializeBlocks(data, blocks, addSolidColumnY, keyOf, THREE.Vector3);
    }

    for (const [key, cell] of data.waterCells) {
      const [xs, ys, zs] = key.split(',');
      const x = +xs, y = +ys, z = +zs;
      waterCells.set(key, { position: new THREE.Vector3(x, y, z), ...cell });
      waterKeys.add(key);
      markWaterChunkDirty(x, z);
    }

    camera.position.set(data.player.x, data.player.y, data.player.z);
    cameraYaw = data.player.yaw;
    cameraPitch = data.player.pitch;
    physicalY = data.player.physicalY;
    applyCameraRotation();

    timeOfDay = data.timeOfDay;
    settings.timeOfDay = data.timeOfDay;

    rebuildAllChunks();
    while (dirtyWaterChunks.size > 0) rebuildDirtyWaterChunks(64);

    for (const light of blockLights.values()) { scene.remove(light); light.dispose(); }
    blockLights.clear();
    for (const [key, block] of blocks) {
      const cfg = lightConfig(block.type);
      if (cfg) {
        const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance);
        light.position.set(block.position.x, block.position.y + 0.2, block.position.z);
        scene.add(light);
        blockLights.set(key, light);
      }
    }

    blockMeshesReady = true;
    emitSnapshot();
  }

  function respawn() {
    const spawnX = 0;
    const spawnZ = 7;
    const spawnY = terrainHeight(spawnX, spawnZ) + playerHeight + 2;
    camera.position.set(spawnX, spawnY, spawnZ);
    cameraYaw = 0;
    cameraPitch = 0;
    physicalY = spawnY;
    visualY = spawnY;
    verticalVelocity = 0;
    canJump = false;
    headBob = 0;
    landingDip = 0;
    isDead = false;
    applyCameraRotation();
    emitSnapshot();
  }

  return {
    setSelectedBlock,
    setSelectedModel,
    lockControls,
    unlockControls,
    importModelFile,
    importModelFiles,
    importGltfModel,
    importMmdModel,
    updateSettings,
    updateSelectedPlacedModel,
    updateSelectedModelPart,
    importVmdForSelectedModel,
    deleteSelectedPlacedModel: removeSelectedPlacedModel,
    getSettings,
    noteMmdSupport,
    save,
    load,
    respawn,
    dispose() {
      isDisposed = true;
      renderer.setAnimationLoop(null);
      for (const light of blockLights.values()) { scene.remove(light); light.dispose(); }
      blockLights.clear();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', resetBreaking);
      controls.removeEventListener('lock', onControlsLock);
      controls.removeEventListener('unlock', onControlsUnlock);
      controls.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      Object.values(blockMaterials).forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
      // clearModelPreview() removed
      destroyStageMaterials.forEach((material) => material.dispose());
      destroyStageTextures.forEach((texture) => texture.dispose());
      waterMaterial.map?.dispose();
      waterMaterial.dispose();
      skyDome.geometry.dispose();
      skyMaterial.dispose();
      outlineMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
