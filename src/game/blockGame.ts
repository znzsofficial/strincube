import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  type BlockType,
  blockMaterials,
  blockIconUrls,
  materialIndexFor,
  isPlantBlock,
  isTransparentBlock,
  loadBlockTexture,
  createItemFrameTexture,
  waterMaterial,
} from './blocks';
import {
  type ChunkData,
  type ChunkSaveData,
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
  type StoredModel,
  type PlacedModelEntity,
  worldSizePresets,
  getWorldRadius,
  defaultWorldGenSettings,
} from './types';
import { applyChunkData, deserializeBlocks, serializeChunkData } from './save';
import { CHUNK_SIZE, chunkKey, chunkKeyFromWorld, toChunkCoord } from './chunk';
import { createChunkManager } from './chunkManager';

import type { ModelContext } from './models';
import {
  applyModelBrightness as _applyModelBrightness,
  applyPlacedModelSettings as _applyPlacedModelSettings,
  flashEntityMaterials as _flashEntityMaterials,
  selectPlacedModel as _selectPlacedModel,
  removeSelectedPlacedModel as _removeSelectedPlacedModel,
  findPlacedModelFromObject as _findPlacedModelFromObject,
  placeStoredModel as _placeStoredModel,
  importGltfModel as _importGltfModel,
  importMmdModel as _importMmdModel,
  importModelFiles as _importModelFiles,
  importModelFile as _importModelFile,
  importVmdForSelectedModel as _importVmdForSelectedModel,
  noteMmdSupport as _noteMmdSupport,
  updateSelectedPlacedModel as _updateSelectedPlacedModel,
  updateSelectedModelPart as _updateSelectedModelPart,
  damagePlacedModel as _damagePlacedModel,
} from './models';

import type { WaterContext } from './water';
import {
  createWaterContext as _createWaterContext,
  addSolidColumnY as _addSolidColumnY,
  removeSolidColumnY as _removeSolidColumnY,
  queueWaterUpdate as _queueWaterUpdate,
  queueWaterNeighbors as _queueWaterNeighbors,
  markWaterChunkDirty as _markWaterChunkDirty,
  addWaterCell as _addWaterCell,
  removeWaterCell as _removeWaterCell,
  wakeStaticWaterAround as _wakeStaticWaterAround,
  rebuildDirtyWaterChunks as _rebuildDirtyWaterChunks,
  updateWater as _updateWater,
  columnKeyOf as _columnKeyOf,
} from './water';

import type { WorldGenContext } from './worldgen';
import {
  seededNoise as _seededNoise,
  getSurfaceHeight as _getSurfaceHeight,
  findSafeSpawnPoint as _findSafeSpawnPoint,
  generateChunk as _generateChunk,
  getWorldDebugSample as _getWorldDebugSample,
  spawnCreatures as _spawnCreatures,
} from './worldgen';
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
export { worldSizePresets, getWorldRadius, defaultWorldGenSettings };

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

type FallingBlockEntity = {
  mesh: THREE.Mesh;
  type: BlockType;
  velocityY: number;
};

type PrimedTnt = {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  timer: number;
  flash: number;
};

const uiKeyCodes = new Set(['Escape', 'KeyE', 'KeyM', 'KeyO']);
const chunkSize = CHUNK_SIZE;
let worldRadius: number | null = 80;
const waterLevel = 1;
const maxWaterSpreadDistance = 7;
const worldBottom = -32;
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

const itemFrameFaceDefs = (() => {
  const h = 0.4375;
  const d = 0.0625;
  return [
    { normal: new THREE.Vector3(1, 0, 0), corners: [[d, -h, -h], [d, h, -h], [d, h, h], [d, -h, h]] },
    { normal: new THREE.Vector3(-1, 0, 0), corners: [[-d, -h, h], [-d, h, h], [-d, h, -h], [-d, -h, -h]] },
    { normal: new THREE.Vector3(0, 1, 0), corners: [[-d, h, h], [d, h, h], [d, h, -h], [-d, h, -h]] },
    { normal: new THREE.Vector3(0, -1, 0), corners: [[-d, -h, -h], [d, -h, -h], [d, -h, h], [-d, -h, h]] },
    { normal: new THREE.Vector3(0, 0, 1), corners: [[d, -h, h], [d, h, h], [-d, h, h], [-d, -h, h]] },
    { normal: new THREE.Vector3(0, 0, -1), corners: [[-d, -h, -h], [-d, h, -h], [d, h, -h], [d, -h, -h]] },
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

export async function createBlockGame(mount: HTMLElement, onSnapshot: (snapshot: GameSnapshot) => void, onModelMenuRequest?: () => void, options: BlockGameOptions = {}) {
  const { onProgress } = options;
  const worldGen = options.worldGen ?? defaultWorldGenSettings;
  if (worldGen.seed != null) worldSeed = worldGen.seed;
  worldRadius = worldGen.infiniteWorld ? null : getWorldRadius(worldGen);
  
  let rendererBackend: GameSettings['rendererBackend'] = 'webgl';
  let renderer: GameRenderer;

  if (options.rendererBackend === 'webgpu') {
    const [{ WebGPURenderer }, { default: WebGPU }] = await Promise.all([
      import('three/webgpu'),
      import('three/addons/capabilities/WebGPU.js'),
    ]);
    if (WebGPU.isAvailable()) {
      rendererBackend = 'webgpu';
      renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance' }) as GameRenderer;
    } else {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }) as GameRenderer;
    }
  } else {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }) as GameRenderer;
  }

  let _contextLost = false;
  if (rendererBackend !== 'webgpu') {
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      _contextLost = true;
    });
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
    postProcessing: false,
    bloomStrength: 0.18,
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcecff);
  scene.fog = new THREE.Fog(0xbcecff, 20, settings.viewDistance);

  const spawnPoint = worldGen.flatWorld ? { x: 0, z: 7 } : _findSafeSpawnPoint(worldSeed, 0, 7, worldRadius, waterLevel, worldGen);
  const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.1, 180);
  camera.rotation.order = 'YXZ';
  camera.position.set(spawnPoint.x, _getSurfaceHeight(worldSeed, spawnPoint.x, spawnPoint.z, worldRadius, waterLevel, worldGen.flatWorld, worldGen) + playerHeight + 2, spawnPoint.z);

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

  const stats = new Stats();
  stats.dom.style.position = 'absolute';
  stats.dom.style.left = '10px';
  stats.dom.style.top = '10px';
  stats.dom.style.zIndex = '60';
  stats.dom.style.display = 'none';
  mount.appendChild(stats.dom);

  const composer = rendererBackend === 'webgl' && renderer instanceof THREE.WebGLRenderer
    ? new EffectComposer(renderer)
    : null;
  let fxaaPass: FXAAPass | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    fxaaPass = new FXAAPass();
    composer.addPass(fxaaPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(mount.clientWidth, mount.clientHeight), settings.bloomStrength, 0.18, 0.82);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    updatePostProcessingSize(mount.clientWidth, mount.clientHeight);
  }

  const controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(controls.object);
  controls.pointerSpeed = 0;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = Math.PI - 0.16;

  const hemiLight = new THREE.HemisphereLight(0xe9f8ff, 0xb9c5cf, 2.4);
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

  const blocks = new Map<string, { position: THREE.Vector3; type: BlockType }>();
  const blockLights = new Map<string, THREE.PointLight>();
  const itemFrameContents = new Map<string, BlockType>();
  const itemFrameMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
  const loadedChunks = new Map<string, ChunkData>();
  const chunkBlockKeys = new Map<string, Set<string>>();
  const chunkWaterKeys = new Map<string, Set<string>>();
  const chunkMeshes = new Map<string, { meshes: THREE.Mesh[]; faceBlockKeysByMesh: Map<THREE.Mesh, string[]> }>();
  const creatures: { root: THREE.Group; phase: number; home: THREE.Vector3 }[] = [];
  const fallingBlocks: FallingBlockEntity[] = [];
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
  let suppressWorldRebuilds = false;
  let suppressChunkEditRecording = false;
  let isBreaking = false;
  let breakingKey: string | null = null;
  let breakingProgress = 0;
  let cameraYaw = 0;
  let cameraPitch = 0;
  let modelRaycastTimer = 0;
  let lastShadowUpdateX = 0;
  let lastShadowUpdateZ = 0;
  let lastRequestedPlayerChunkKey = '';
  const chunkManager = createChunkManager(3);
  const initialSpawnChunkRadius = 5;

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
  let touchMoveX = 0;
  let touchMoveY = 0;
  let touchActive = false;
  const timer = new THREE.Timer();
  const dracoLoader = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG);
  const gltfLoader = new GLTFLoader().setDRACOLoader(dracoLoader);
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
  const _colorHemiGroundDay = new THREE.Color(0xb9c5cf);
  const _colorHemiGroundNight = new THREE.Color(0x24344d);
  const _colorHorizon = new THREE.Color(0xffb36b);
  const _colorNight = new THREE.Color(0x111a3d);
  const _colorDay = new THREE.Color(0xbcecff);
  const _colorZenithDay = new THREE.Color(0x69bdff);
  const _colorBottomDay = new THREE.Color(0x91ca71);
  const _colorBottomNight = new THREE.Color(0x172338);
  const _tempColor1 = new THREE.Color();
  const _tempColor2 = new THREE.Color();
  const _tempVec3 = new THREE.Vector3();
  const _tempVec2 = new THREE.Vector2(0, 0);
  const _tempFlow = new THREE.Vector3();
  const _tempFlowDir = new THREE.Vector3();
  const _tempDirection = new THREE.Vector3();
  const _tempKnockback = new THREE.Vector3();

  function updateSelectedModelHelper() {
    // placeholder - logic removed, kept for compatibility
  }

  const modelCtx: ModelContext = {
    scene,
    settings,
    gltfLoader,
    importedModelMaterials,
    storedModels,
    placedModels,
    placedModelRaycastRoots,
    selectedPlacedModelId,
    modelItemSequence,
    placedModelSequence,
    modelPlacementRotation,
    modelPlacementScale,
    emitSnapshot: () => emitSnapshot(),
    updateSelectedModelHelper,
    _colorHurtFlash: new THREE.Color(0xff4444),
  };

  function emitSnapshot(isLocked = controls.isLocked || touchActive) {
    const selectedPlacedModel = modelCtx.selectedPlacedModelId ? placedModels.get(modelCtx.selectedPlacedModelId) : null;
    const selectedStoredModel = selectedModelId ? storedModels.get(selectedModelId) : null;
    const canOpenModelMenu = Boolean(selectedPlacedModel && controls.object.position.distanceTo(selectedPlacedModel.root.position) <= 6.5);
    const debugPosition = controls.object.position;
    const debugX = Math.round(debugPosition.x);
    const debugY = Math.round(debugPosition.y);
    const debugZ = Math.round(debugPosition.z);
    const debugSample = settings.showFps ? _getWorldDebugSample(worldSeed, debugX, debugZ, waterLevel, worldGen.flatWorld, worldGen) : null;
    onSnapshot({
      selectedBlock,
      blockCount: blocks.size,
      timeOfDay,
      creatureCount: creatures.length,
      isLocked,
      isDead,
      fps: settings.showFps ? currentFps : undefined,
      worldDebug: debugSample ? {
        x: debugX,
        y: debugY,
        z: debugZ,
        height: debugSample.height,
        biome: debugSample.biome,
        baseBiome: debugSample.baseBiome,
        temperature: debugSample.climate.temperature,
        humidity: debugSample.climate.humidity,
        continentalness: debugSample.climate.continentalness,
        erosion: debugSample.climate.erosion,
        ridge: debugSample.climate.ridge,
        oceanDepth: debugSample.climate.oceanDepth,
        lakeDepth: debugSample.climate.lakeDepth,
        lakeBank: debugSample.climate.lakeBank,
        river: debugSample.river.bed,
        riverBank: debugSample.river.bank,
        riverFlow: debugSample.river.flowAccumulation,
        riverSlope: debugSample.river.slope,
        riverSource: debugSample.river.source,
      } : undefined,
      contextLost: _contextLost || undefined,
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
    return type === 'sand' || type === 'gravel' || type === 'redSand';
  }

  function isReplaceableBlock(type: BlockType) {
    return isPlantBlock(type);
  }

  function getBlock(x: number, y: number, z: number) {
    return blocks.get(keyOf(x, y, z));
  }

  function hasBlock(x: number, y: number, z: number) {
    return blocks.has(keyOf(x, y, z));
  }

  function getWaterCell(x: number, y: number, z: number) {
    return waterCtx.waterCells.get(keyOf(x, y, z));
  }

  function addChunkIndex(index: Map<string, Set<string>>, chunkKey: string, itemKey: string) {
    let keys = index.get(chunkKey);
    if (!keys) {
      keys = new Set<string>();
      index.set(chunkKey, keys);
    }
    keys.add(itemKey);
  }

  function removeChunkIndex(index: Map<string, Set<string>>, chunkKey: string, itemKey: string) {
    const keys = index.get(chunkKey);
    if (!keys) return;
    keys.delete(itemKey);
    if (keys.size === 0) index.delete(chunkKey);
  }

  function setBlockRecord(x: number, y: number, z: number, type: BlockType) {
    const blockKey = keyOf(x, y, z);
    blocks.set(blockKey, { position: new THREE.Vector3(x, y, z), type });
    addChunkIndex(chunkBlockKeys, chunkKeyFromWorld(x, z), blockKey);
    if (suppressChunkEditRecording) return;
    const chunk = markChunkDirtyAt(x, z);
    const existing = chunk.blockEdits.find((entry) => entry.x === x && entry.y === y && entry.z === z);
    if (existing) existing.type = type;
    else chunk.blockEdits.push({ x, y, z, type });
  }

  function deleteBlockRecord(x: number, y: number, z: number) {
    const blockKey = keyOf(x, y, z);
    blocks.delete(blockKey);
    removeChunkIndex(chunkBlockKeys, chunkKeyFromWorld(x, z), blockKey);
    if (suppressChunkEditRecording) return;
    const chunk = markChunkDirtyAt(x, z);
    const existing = chunk.blockEdits.find((entry) => entry.x === x && entry.y === y && entry.z === z);
    if (existing) existing.type = null;
    else chunk.blockEdits.push({ x, y, z, type: null });
  }

  function setWaterCellRecord(x: number, y: number, z: number, cell: { distance: number; level: number; source: boolean; falling?: boolean; static?: boolean }) {
    const waterKey = keyOf(x, y, z);
    const normalizedCell = { distance: cell.distance, level: cell.level, source: cell.source, falling: cell.falling ?? false, static: cell.static ?? false };
    waterCtx.waterCells.set(waterKey, { position: new THREE.Vector3(x, y, z), ...normalizedCell });
    addChunkIndex(chunkWaterKeys, chunkKeyFromWorld(x, z), waterKey);
    if (suppressChunkEditRecording) return;
    const chunk = markChunkDirtyAt(x, z);
    const existing = chunk.waterEdits.find((entry) => entry.x === x && entry.y === y && entry.z === z);
    if (existing) {
      existing.distance = normalizedCell.distance;
      existing.level = normalizedCell.level;
      existing.source = normalizedCell.source;
      existing.falling = normalizedCell.falling;
      existing.static = normalizedCell.static;
      existing.removed = false;
    } else {
      chunk.waterEdits.push({ x, y, z, distance: normalizedCell.distance, level: normalizedCell.level, source: normalizedCell.source, falling: normalizedCell.falling, static: normalizedCell.static });
    }
  }

  function deleteWaterCellRecord(x: number, y: number, z: number) {
    _removeWaterCell(waterCtx, x, y, z);
  }

  function clearWorldData() {
    blocks.clear();
    waterCtx.waterCells.clear();
    loadedChunks.clear();
    chunkBlockKeys.clear();
    chunkWaterKeys.clear();
  }

  function ensureLoadedChunkMeta(chunkX: number, chunkZ: number) {
    const key = chunkKey(chunkX, chunkZ);
    let chunk = loadedChunks.get(key);
    if (!chunk) {
      chunk = {
        chunkX,
        chunkZ,
        state: 'empty',
        generatedStage: 'none',
        dirtyMesh: false,
        dirtyWaterMesh: false,
        modified: false,
        structureRefs: [],
        blockEdits: [],
        waterEdits: [],
      };
      loadedChunks.set(key, chunk);
    }
    chunk.lastAccessTime = Date.now();
    return chunk;
  }

  function markChunkGenerated(chunkX: number, chunkZ: number, stage: ChunkData['generatedStage']) {
    const chunk = ensureLoadedChunkMeta(chunkX, chunkZ);
    chunk.generatedStage = stage;
    chunk.state = 'populated';
    chunk.dirtyMesh = true;
    chunk.dirtyWaterMesh = true;
    return chunk;
  }

  function markChunkDirtyAt(x: number, z: number, modified = true) {
    const { chunkX, chunkZ } = toChunkCoord(x, z);
    const chunk = ensureLoadedChunkMeta(chunkX, chunkZ);
    chunk.dirtyMesh = true;
    chunk.dirtyWaterMesh = true;
    if (modified) chunk.modified = true;
    if (chunk.state === 'empty') chunk.state = 'terrain';
    if (chunk.generatedStage === 'none') chunk.generatedStage = 'terrain';
    return chunk;
  }

  function collectModifiedChunkSaves(): ChunkSaveData[] {
    return [...loadedChunks.values()]
      .filter((chunk) => chunk.modified)
      .map((chunk) => serializeChunkData({
        version: 1,
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        generatedStage: chunk.generatedStage,
        blockEdits: chunk.blockEdits.map((entry) => ({ ...entry })),
        waterEdits: chunk.waterEdits.map((entry) => ({ ...entry })),
        structureRefs: [...chunk.structureRefs],
        modified: chunk.modified,
      }));
  }

  function restoreChunkSaveMeta(chunkSave: ChunkSaveData) {
    const chunk = ensureLoadedChunkMeta(chunkSave.chunkX, chunkSave.chunkZ);
    chunk.generatedStage = chunkSave.generatedStage;
    chunk.state = 'populated';
    chunk.dirtyMesh = true;
    chunk.dirtyWaterMesh = true;
    chunk.modified = chunkSave.modified ?? (chunkSave.blockEdits.length > 0 || chunkSave.waterEdits.length > 0);
    chunk.structureRefs = [...chunkSave.structureRefs];
    chunk.blockEdits = chunkSave.blockEdits.map((entry) => ({ ...entry }));
    chunk.waterEdits = chunkSave.waterEdits.map((entry) => ({ ...entry }));
  }

  function rebuildLoadedChunkMetaFromBlocks() {
    loadedChunks.clear();
    chunkBlockKeys.clear();
    chunkWaterKeys.clear();
    for (const block of blocks.values()) {
      const { chunkX, chunkZ } = toChunkCoord(block.position.x, block.position.z);
      addChunkIndex(chunkBlockKeys, chunkKey(chunkX, chunkZ), keyOf(block.position.x, block.position.y, block.position.z));
      const chunk = ensureLoadedChunkMeta(chunkX, chunkZ);
      chunk.generatedStage = 'populated';
      chunk.state = 'meshed';
      chunk.modified = false;
      chunk.dirtyMesh = false;
      chunk.dirtyWaterMesh = false;
      chunk.blockEdits.length = 0;
      chunk.waterEdits.length = 0;
    }
    for (const cell of waterCtx.waterCells.values()) {
      const { chunkX, chunkZ } = toChunkCoord(cell.position.x, cell.position.z);
      addChunkIndex(chunkWaterKeys, chunkKey(chunkX, chunkZ), keyOf(cell.position.x, cell.position.y, cell.position.z));
      const chunk = ensureLoadedChunkMeta(chunkX, chunkZ);
      if (chunk.generatedStage === 'none') chunk.generatedStage = 'terrain';
      if (chunk.state === 'empty') chunk.state = 'terrain';
      chunk.modified = false;
      chunk.blockEdits.length = 0;
      chunk.waterEdits.length = 0;
    }
  }

  function rebuildChunkIndexesFromWorldData() {
    chunkBlockKeys.clear();
    chunkWaterKeys.clear();
    for (const block of blocks.values()) {
      const { chunkX, chunkZ } = toChunkCoord(block.position.x, block.position.z);
      addChunkIndex(chunkBlockKeys, chunkKey(chunkX, chunkZ), keyOf(block.position.x, block.position.y, block.position.z));
      const chunk = ensureLoadedChunkMeta(chunkX, chunkZ);
      if (chunk.generatedStage === 'none') chunk.generatedStage = 'populated';
      if (chunk.state === 'empty') chunk.state = 'populated';
    }
    for (const cell of waterCtx.waterCells.values()) {
      const { chunkX, chunkZ } = toChunkCoord(cell.position.x, cell.position.z);
      addChunkIndex(chunkWaterKeys, chunkKey(chunkX, chunkZ), keyOf(cell.position.x, cell.position.y, cell.position.z));
      const chunk = ensureLoadedChunkMeta(chunkX, chunkZ);
      if (chunk.generatedStage === 'none') chunk.generatedStage = 'terrain';
      if (chunk.state === 'empty') chunk.state = 'terrain';
    }
  }

  function unloadChunk(chunk: ChunkData) {
    if (chunk.modified) return false;

    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    removeChunkMesh(key);
    const waterMesh = waterCtx.waterChunkMeshes.get(key);
    if (waterMesh) {
      scene.remove(waterMesh.mesh);
      waterMesh.mesh.geometry.dispose();
      waterCtx.waterChunkMeshes.delete(key);
    }

    for (const blockKey of [...(chunkBlockKeys.get(key) ?? [])]) {
      const block = blocks.get(blockKey);
      if (!block) continue;
      blocks.delete(blockKey);
      if (isSolidBlock(block.type)) _removeSolidColumnY(waterCtx, block.position.x, block.position.y, block.position.z);
      removeBlockLight(block.position.x, block.position.y, block.position.z);
    }
    chunkBlockKeys.delete(key);

    for (const waterKey of [...(chunkWaterKeys.get(key) ?? [])]) {
      waterCtx.waterCells.delete(waterKey);
      waterCtx.waterKeys.delete(waterKey);
    }
    chunkWaterKeys.delete(key);

    loadedChunks.delete(key);
    chunkManager.unmarkRequested(chunk.chunkX, chunk.chunkZ);
    visibleChunkRaycastDirty = true;
    return true;
  }

  function processChunkUnloads(maxChunks = 1) {
    const player = controls.object.position;
    let processed = 0;
    for (const chunk of [...loadedChunks.values()]) {
      if (processed >= maxChunks) break;
      if (!chunkManager.isOutsideUnloadRadius(player.x, player.z, chunk.chunkX, chunk.chunkZ)) continue;
      if (unloadChunk(chunk)) processed += 1;
    }
  }

  function canMoveInto(x: number, y: number, z: number) {
    const block = getBlock(x, y, z);
    return !block || isReplaceableBlock(block.type);
  }

  const waterCtx: WaterContext = _createWaterContext(scene, waterMaterial, settings, chunkSize, maxWaterSpreadDistance, waterLevel, worldBottom, () => {});
  waterCtx.blocks = blocks;
  waterCtx.chunkMeshes = chunkMeshes;
  waterCtx.visibleChunkRaycastMeshes = visibleChunkRaycastMeshes;
  waterCtx.onWaterCellSet = (x, y, z, cell) => setWaterCellRecord(x, y, z, cell);
  waterCtx.onWaterCellRemove = (x, y, z) => {
    removeChunkIndex(chunkWaterKeys, chunkKeyFromWorld(x, z), keyOf(x, y, z));
    if (suppressChunkEditRecording) return;
    const chunk = markChunkDirtyAt(x, z);
    const existing = chunk.waterEdits.find((entry) => entry.x === x && entry.y === y && entry.z === z);
    if (existing) {
      existing.removed = true;
      existing.distance = undefined;
      existing.level = undefined;
      existing.source = undefined;
    } else {
      chunk.waterEdits.push({ x, y, z, removed: true });
    }
  };

  function groundHeightAt(x: number, z: number, maxCameraY = Infinity) {
    const solidY = waterCtx.columnSolidY.get(_columnKeyOf(x, z));
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
    modelCtx.selectedPlacedModelId = null;
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
    composer?.setPixelRatio(settings.pixelRatio);
    if (bloomPass) bloomPass.strength = settings.bloomStrength;
    updatePostProcessingSize(mount.clientWidth, mount.clientHeight);
    stats.dom.style.display = settings.showFps ? 'block' : 'none';
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

    for (const [chunkKey, chunk] of waterCtx.waterChunkMeshes) {
      const center = chunkCenterFromKey(chunkKey);
      chunk.mesh.visible = (center.x - player.x) ** 2 + (center.z - player.z) ** 2 <= visibleRadiusSq;
    }

    if (changed || visibleChunkRaycastDirty) {
      visibleChunkRaycastMeshes = [...chunkMeshes.values()].flatMap((chunk) => chunk.meshes.filter((mesh) => mesh.visible));
      waterCtx.visibleChunkRaycastMeshes = visibleChunkRaycastMeshes;
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

  function getItemFrameMaterialIndex(key: string): number {
    const contents = itemFrameContents.get(key);
    if (!contents) return 148;

    const cached = itemFrameMaterialCache.get(key);
    if (cached) {
      const idx = blockMaterials.indexOf(cached);
      if (idx >= 0) return idx;
    }

    const textureUrl = blockIconUrls[contents];
    if (!textureUrl) return 148;

    const frameCanvas = createItemFrameTexture().image as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(frameCanvas, 0, 0);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(frameCanvas, 0, 0);
      ctx.drawImage(img, 10, 10, 44, 44);
      texture.needsUpdate = true;
    };
    img.src = textureUrl;

    const material = new THREE.MeshLambertMaterial({ map: texture });
    const idx = blockMaterials.length;
    (blockMaterials as THREE.Material[]).push(material);
    itemFrameMaterialCache.set(key, material);
    return idx;
  }

  function rebuildChunk(chunkKey: string) {
    const chunkMeta = loadedChunks.get(chunkKey);
    if (chunkMeta) {
      chunkMeta.dirtyMesh = false;
      chunkMeta.state = 'meshed';
      chunkMeta.lastAccessTime = Date.now();
    }
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
      const safeMaterialIndex = blockMaterials[materialIndex] ? materialIndex : 3;
      if (!build.materialGroups.has(safeMaterialIndex)) build.materialGroups.set(safeMaterialIndex, []);
      build.materialGroups.get(safeMaterialIndex)!.push({ indices: faceIndices, key });
    }

    for (const key of chunkBlockKeys.get(chunkKey) ?? []) {
      const block = blocks.get(key);
      if (!block) continue;

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
      const isItemFrame = block.type === 'itemFrame';
      const activeFaceDefs = isLantern ? lanternFaceDefs : isTorch ? torchFaceDefs : isItemFrame ? itemFrameFaceDefs : faceDefs;

      for (const face of activeFaceDefs) {
        const nx = block.position.x + face.normal.x;
        const ny = block.position.y + face.normal.y;
        const nz = block.position.z + face.normal.z;
        const neighbor = getBlock(nx, ny, nz);
        const neighborIsSmall = neighbor && (neighbor.type === 'lantern' || neighbor.type === 'soulLantern' || neighbor.type === 'torch' || neighbor.type === 'itemFrame');
        if (!isLantern && !isTorch && !isItemFrame && neighbor && !isPlantBlock(neighbor.type) && !neighborIsSmall) {
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

        const materialIndex = block.type === 'itemFrame'
          ? getItemFrameMaterialIndex(key)
          : materialIndexFor(block.type, face.normal);
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

    if (opaqueBuild.positions.length === 0 && glassBuild.positions.length === 0 && leavesBuild.positions.length === 0) return;

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
    for (const key of chunkBlockKeys.keys()) chunkKeys.add(key);
    for (const chunkKey of chunkKeys) rebuildChunk(chunkKey);
  }

  function rebuildAroundBlock(x: number, z: number) {
    rebuildChunk(chunkKeyOf(x, z));
    rebuildChunk(chunkKeyOf(x - 1, z));
    rebuildChunk(chunkKeyOf(x + 1, z));
    rebuildChunk(chunkKeyOf(x, z - 1));
    rebuildChunk(chunkKeyOf(x, z + 1));
  }

  function addRebuildKeysAroundBlock(keys: Set<string>, x: number, z: number) {
    keys.add(chunkKeyOf(x, z));
    keys.add(chunkKeyOf(x - 1, z));
    keys.add(chunkKeyOf(x + 1, z));
    keys.add(chunkKeyOf(x, z - 1));
    keys.add(chunkKeyOf(x, z + 1));
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

  function addBlock(x: number, y: number, z: number, type: BlockType, waterDistance = 0, staticWater = false) {
    if (type === 'water') {
      _addWaterCell(waterCtx, x, y, z, waterDistance, 7, waterDistance === 0, false, staticWater);
      return;
    }

    if (hasBlock(x, y, z)) return;

    if (getWaterCell(x, y, z)) deleteWaterCellRecord(x, y, z);
    setBlockRecord(x, y, z, type);
    if (isSolidBlock(type)) _addSolidColumnY(waterCtx, x, y, z);
    if (isFallingBlock(type)) queueFallingCheck(x, y, z);
    _queueWaterNeighbors(waterCtx, x, y, z);
    if (blockMeshesReady && !suppressWorldRebuilds) rebuildAroundBlock(x, z);
    addBlockLight(x, y, z, type);
  }

  function afterBlockRemoved(x: number, y: number, z: number, block: { type: BlockType }) {
    if (isSolidBlock(block.type)) _removeSolidColumnY(waterCtx, x, y, z);
    _wakeStaticWaterAround(waterCtx, x, y, z);
    _queueWaterNeighbors(waterCtx, x, y, z);
    queueFallingNeighbors(x, y, z);
  }

  function removeBlockAt(x: number, y: number, z: number, rebuild = true) {
    const block = getBlock(x, y, z);
    if (!block) return null;
    deleteBlockRecord(x, y, z);
    afterBlockRemoved(x, y, z, block);
    if (rebuild && !suppressWorldRebuilds) rebuildAroundBlock(x, z);
    removeBlockLight(x, block.position.y, z);
    return block;
  }

  waterCtx.removeBlockAt = removeBlockAt;

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
    _queueWaterNeighbors(waterCtx, x, y, z);
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
    const block = getBlock(x, y, z);
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
    const [x, y, z] = key.split(',').map(Number);
    const block = getBlock(x, y, z);
    return block ? { key, block } : null;
  }

  function resetBreaking() {
    isBreaking = false;
    breakingKey = null;
    breakingProgress = 0;
    destroyOverlay.visible = false;
  }

  function finishBreaking(key: string) {
    const [xs, ys, zs] = key.split(',').map(Number);
    const target = getBlock(xs, ys, zs);
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
      if (!hasBlock(x, dy, z)) break;
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

  function settleInitialFallingBlocks() {
    const candidates = [...blocks.values()].filter((block) => isFallingBlock(block.type));
    for (const block of candidates) queueFallingCheck(block.position.x, block.position.y, block.position.z);
  }

  function queueInitialWater() {
    for (const cell of waterCtx.waterCells.values()) _queueWaterUpdate(waterCtx, cell.position.x, cell.position.y, cell.position.z);
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

    if (hitBlock && hitBlock.block.type === 'itemFrame') {
      const current = itemFrameContents.get(hitBlock.key);
      if (current === selectedBlock) {
        itemFrameContents.delete(hitBlock.key);
        itemFrameMaterialCache.delete(hitBlock.key);
      } else {
        itemFrameContents.set(hitBlock.key, selectedBlock);
      }
      rebuildAroundBlock(hitBlock.block.position.x, hitBlock.block.position.z);
      emitSnapshot();
      return;
    }

    if (!hitBlock) return;
    const target = rounded(hitBlock.block.position.clone().add(hit.face.normal));
    const player = controls.object.position;
    if (target.distanceTo(player) < 1.45) return;
    if (selectedModelId) {
      _placeStoredModel(modelCtx, selectedModelId, new THREE.Vector3(target.x + 0.5, target.y - 0.5, target.z + 0.5));
      return;
    }
    addBlock(target.x, target.y, target.z, selectedBlock);
    emitSnapshot();
  }

  function updatePlayer(delta: number) {
    const speed = keys.has('shiftleft') || keys.has('shiftright') ? settings.moveSpeed * 1.58 : settings.moveSpeed;
    const kbForward = Number(keys.has('keyw')) - Number(keys.has('keys'));
    const kbRight = Number(keys.has('keyd')) - Number(keys.has('keya'));
    const forward = kbForward || touchMoveY;
    const right = kbRight || touchMoveX;
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
      creature.root.position.y = _getSurfaceHeight(worldSeed, Math.round(newX), Math.round(newZ), worldRadius, waterLevel, worldGen.flatWorld, worldGen) + 1 + Math.sin(t * 4) * 0.04;
      creature.root.rotation.y = Math.atan2(Math.cos(t), Math.sin(t * 0.8));
    }
  }

  function waterFlowAt(position: THREE.Vector3) {
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const z = Math.round(position.z);
    const current = getWaterCell(x, y, z) ?? getWaterCell(x, y - 1, z) ?? getWaterCell(x, y + 1, z);
    if (!current) return _tempFlow.set(0, 0, 0);

    _tempFlow.set(0, 0, 0);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of directions) {
      const neighbor = getWaterCell(x + dx, current.position.y, z + dz);
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
    const pos = entity.root.position;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const z = Math.round(pos.z);
    const waterCell = getWaterCell(x, y, z) ?? getWaterCell(x, y - 1, z);
    if (!waterCell) return;
    if (entity.anchor.y + entity.offset.y > waterCell.position.y + 1) return;

    const strength = waterCell.level / 7;
    entity.velocityY += (strength * 32 + 3) * delta;

    const flow = waterFlowAt(pos);
    if (flow.lengthSq() > 0) {
      entity.velocity.x += flow.x * strength * 5 * delta;
      entity.velocity.z += flow.z * strength * 5 * delta;
    }
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
        entity.velocityY -= 28 * delta;
        entity.anchor.x += entity.velocity.x * delta;
        entity.anchor.y += entity.velocityY * delta;
        entity.anchor.z += entity.velocity.z * delta;
        const groundY = _getSurfaceHeight(worldSeed, Math.round(entity.anchor.x), Math.round(entity.anchor.z), worldRadius, waterLevel, worldGen.flatWorld, worldGen) + 0.5;
        if (entity.anchor.y < groundY) {
          entity.anchor.y = groundY;
          entity.velocityY = 0;
          entity.velocity.set(0, 0, 0);
        }
        entity.root.position.copy(entity.anchor).add(entity.offset);
        entity.velocity.x *= Math.max(0, 1 - delta * 5);
        entity.velocity.z *= Math.max(0, 1 - delta * 5);
      }

      if (!entity.visible || entity.animationSpeed <= 0) continue;
      const ePos = entity.root.position;
      const dx = ePos.x - playerPosition.x;
      const dy = ePos.y - playerPosition.y;
      const dz = ePos.z - playerPosition.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const animDistSq = entity.animationDistance * entity.animationDistance;
      if (distSq > animDistSq) {
        if (entity.root.visible) entity.root.visible = false;
        continue;
      }
      if (!entity.root.visible) entity.root.visible = true;

      const horizDistSq = dx * dx + dz * dz;
      if (distSq > 324 && (dx * viewDirection.x + dz * viewDirection.z) / Math.sqrt(horizDistSq) < -0.15) continue;

      entity.animationTick += delta;
      const minInterval = distSq > 1764 ? 0.18 : distSq > 576 ? 0.08 : 0;
      if (entity.animationTick < minInterval) continue;
      const step = entity.animationTick;
      entity.animationTick = 0;

      if (distSq <= 900 && entity.vmdAnimation && entity.mmdRuntime?.tick && entity.vmdPlaying) {
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
          if (distance > radius + _seededNoise(worldSeed, x, y, z) * 0.8) continue;
          const block = getBlock(x, y, z);
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
      const block = getBlock(x, y, z);
      if (!block) continue;
      deleteBlockRecord(x, y, z);
      afterBlockRemoved(x, y, z, block);
      addRebuildKeysAroundBlock(affectedChunks, x, z);
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
      const below = getBlock(x, belowY, z);
      const landed = belowY <= worldBottom || (below && isSolidBlock(below.type));

      if (!landed) continue;

      const placeY = Math.max(worldBottom + 1, belowY + 1);
      scene.remove(entity.mesh);
      entity.mesh.geometry.dispose();
      fallingBlocks.splice(index, 1);

      const replace = getBlock(x, placeY, z);
      if (replace && isReplaceableBlock(replace.type)) removeBlockAt(x, placeY, z, false);
      if (!hasBlock(x, placeY, z)) addBlock(x, placeY, z, entity.type);
      queueFallingCheck(x, placeY + 1, z);
      rebuildAroundBlock(x, z);
      emitSnapshot();
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
    _updateWater(waterCtx, delta);
    _rebuildDirtyWaterChunks(waterCtx);
    updateSelectedModelHelper();
    if (controls.isLocked || touchActive) updatePlayer(delta);
    requestChunksAroundPlayer();
    processPendingChunkGeneration(1);
    processChunkUnloads(1);
    if (composer && settings.postProcessing) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    if (settings.showFps) stats.update();
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
        _tempKnockback.y = 0.5;
        _tempKnockback.normalize().multiplyScalar(15);
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
      const entity = modelCtx.selectedPlacedModelId ? placedModels.get(modelCtx.selectedPlacedModelId) : null;
      if (entity && controls.object.position.distanceTo(entity.root.position) <= 6.5) {
        event.preventDefault();
        onModelMenuRequest?.();
        return;
      }
    }

    if (selectedModelId && event.code === 'KeyR') {
      event.preventDefault();
      modelPlacementRotation = (modelPlacementRotation + Math.PI / 8) % (Math.PI * 2);
      modelCtx.modelPlacementRotation = modelPlacementRotation;
      emitSnapshot();
      return;
    }

    if (selectedModelId && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
      event.preventDefault();
      const delta = event.code === 'BracketRight' ? 0.1 : -0.1;
      modelPlacementScale = THREE.MathUtils.clamp(modelPlacementScale + delta, 0.2, 3);
      modelCtx.modelPlacementScale = modelPlacementScale;
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
    updatePostProcessingSize(width, height);
  }

  function updatePostProcessingSize(width: number, height: number) {
    if (!composer) return;
    composer.setPixelRatio(settings.pixelRatio);
    composer.setSize(width, height);
    bloomPass?.setSize(width, height);
    fxaaPass?.material.uniforms.resolution.value.set(
      1 / Math.max(width * settings.pixelRatio, 1),
      1 / Math.max(height * settings.pixelRatio, 1),
    );
  }

  function onContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  function lockControls() {
    renderer.domElement.focus({ preventScroll: true });
    controls.lock();
    renderer.domElement.requestPointerLock();
  }

  function unlockControls() {
    keys.clear();
    touchActive = false;
    controls.unlock();
  }

  function touchLock() {
    keys.clear();
    touchActive = true;
    cameraYaw = camera.rotation.y;
    cameraPitch = camera.rotation.x;
    applyCameraRotation();
    emitSnapshot(true);
    try {
      document.documentElement.requestFullscreen?.();
      screen.orientation?.lock?.('landscape');
    } catch { /* ignore */ }
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

  function applyModelBrightness() {
    _applyModelBrightness(importedModelMaterials, settings.modelBrightness);
  }

  function applyPlacedModelSettings(entity: PlacedModelEntity) {
    _applyPlacedModelSettings(entity, settings, updateSelectedModelHelper);
  }

  function updateSelectedPlacedModel(nextSettings: Partial<Omit<PlacedModelSettings, 'id' | 'name'>>) {
    _updateSelectedPlacedModel(modelCtx, nextSettings);
  }

  function updateSelectedModelPart(partId: string, nextSettings: Partial<Omit<ModelPartSettings, 'id' | 'name'>>) {
    _updateSelectedModelPart(modelCtx, partId, nextSettings);
  }

  function flashEntityMaterials(entity: PlacedModelEntity, strength: number) {
    _flashEntityMaterials(entity, strength, modelCtx._colorHurtFlash, settings.modelBrightness);
  }

  function damagePlacedModel(entity: PlacedModelEntity, amount: number, knockback?: THREE.Vector3) {
    _damagePlacedModel(modelCtx, entity, amount, knockback);
  }

  function selectPlacedModel(entity: PlacedModelEntity | null) {
    _selectPlacedModel(modelCtx, entity);
  }

  function removeSelectedPlacedModel() {
    _removeSelectedPlacedModel(modelCtx);
  }

  function findPlacedModelFromObject(object: THREE.Object3D) {
    return _findPlacedModelFromObject(modelCtx, object);
  }

  function importGltfModel(url: string, position = new THREE.Vector3()) {
    return _importGltfModel(modelCtx, url, position) as Promise<THREE.Group>;
  }

  function importMmdModel(source: File | string, position = new THREE.Vector3()) {
    return _importMmdModel(modelCtx, source, position);
  }

  function importModelFiles(files: File[], options?: ModelImportOptions) {
    return _importModelFiles(modelCtx, files, options);
  }

  function importModelFile(file: File, options?: ModelImportOptions) {
    return _importModelFile(modelCtx, file, options);
  }

  function importVmdForSelectedModel(file: File) {
    return _importVmdForSelectedModel(modelCtx, file);
  }

  function noteMmdSupport() {
    return _noteMmdSupport();
  }

  async function ensureSpawnAreaGenerated(centerX: number, centerZ: number) {
    chunkManager.enqueueRadius(centerX, centerZ, initialSpawnChunkRadius);
    const total = chunkManager.pendingRequests.length;
    let completed = 0;

    while (true) {
      const request = chunkManager.takeNextRequest();
      if (!request) break;
      if (!chunkManager.markRequested(request.chunkX, request.chunkZ)) continue;
      suppressWorldRebuilds = true;
      suppressChunkEditRecording = true;
      _generateChunk(worldgenCtx, worldGen, worldSeed, request.chunkX, request.chunkZ);
      suppressChunkEditRecording = false;
      suppressWorldRebuilds = false;
      completed += 1;
      const progress = total > 0 ? completed / total : 1;
      const label = progress < 0.4
        ? '生成区块 · 建立出生地附近地形'
        : progress < 0.85
          ? '生成区块 · 放置矿脉与结构'
          : '生成区块 · 构建出生区块';
      onProgress?.(label, progress * 0.9);
      if (completed % 2 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    onProgress?.('处理物理 · 计算重力与沙子下落', 0.92);
    settleInitialFallingBlocks();
    onProgress?.('构建网格 · 渲染区块与水面', 0.95);
    rebuildAllChunks();
    while (waterCtx.dirtyWaterChunks.size > 0) _rebuildDirtyWaterChunks(waterCtx, 64);
    updateChunkVisibility(true);
    onProgress?.('放置光源与生物', 0.98);
    for (const [key, block] of blocks) {
      const cfg = lightConfig(block.type);
      if (!cfg || blockLights.has(key)) continue;
      const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance);
      light.position.set(block.position.x, block.position.y + 0.2, block.position.z);
      scene.add(light);
      blockLights.set(key, light);
    }
    _spawnCreatures(worldgenCtx, worldSeed);
    onProgress?.('完成 · 世界已就绪', 1);
    lastRequestedPlayerChunkKey = chunkKeyFromWorld(centerX, centerZ);
  }

  function finalizeGeneratedChunk(chunkX: number, chunkZ: number) {
    const chunk = markChunkGenerated(chunkX, chunkZ, 'populated');
    const rebuildKeys = new Set<string>();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        addRebuildKeysAroundBlock(rebuildKeys, (chunkX + dx) * chunkSize, (chunkZ + dz) * chunkSize);
      }
    }
    for (const key of rebuildKeys) rebuildChunk(key);
    while (waterCtx.dirtyWaterChunks.size > 0) _rebuildDirtyWaterChunks(waterCtx, 64);
    updateChunkVisibility(true);
    chunk.modified = false;
    chunk.dirtyWaterMesh = false;
    chunk.blockEdits.length = 0;
    chunk.waterEdits.length = 0;
  }

  function generateChunkForLoad(chunkX: number, chunkZ: number) {
    if (chunkManager.markRequested(chunkX, chunkZ)) {
      suppressWorldRebuilds = true;
      suppressChunkEditRecording = true;
      _generateChunk(worldgenCtx, worldGen, worldSeed, chunkX, chunkZ);
      suppressChunkEditRecording = false;
      suppressWorldRebuilds = false;
    }
    const chunk = markChunkGenerated(chunkX, chunkZ, 'populated');
    chunk.modified = false;
    chunk.blockEdits.length = 0;
    chunk.waterEdits.length = 0;
  }

  function requestChunksAroundPlayer() {
    const player = controls.object.position;
    const playerChunkKey = chunkKeyFromWorld(player.x, player.z);
    if (playerChunkKey === lastRequestedPlayerChunkKey) return;
    chunkManager.enqueueRadius(player.x, player.z);
    lastRequestedPlayerChunkKey = playerChunkKey;
  }

  function processPendingChunkGeneration(maxChunks = 1) {
    let processed = 0;
    while (processed < maxChunks) {
      const request = chunkManager.takeNextRequest();
      if (!request) return;
      if (!chunkManager.markRequested(request.chunkX, request.chunkZ)) continue;
      suppressWorldRebuilds = true;
      suppressChunkEditRecording = true;
      _generateChunk(worldgenCtx, worldGen, worldSeed, request.chunkX, request.chunkZ);
      suppressChunkEditRecording = false;
      suppressWorldRebuilds = false;
      finalizeGeneratedChunk(request.chunkX, request.chunkZ);
      processed += 1;
    }
  }

  // 异步初始化世界
  const worldgenCtx: WorldGenContext = {
    blocks, worldSeed, worldRadius, waterLevel, worldBottom, scene, creatures,
    addBlock, settleInitialFallingBlocks, queueInitialWater, rebuildAllChunks,
    rebuildDirtyWaterChunks: (limit) => _rebuildDirtyWaterChunks(waterCtx, limit),
    dirtyWaterChunks: waterCtx.dirtyWaterChunks, updateChunkVisibility,
    lightConfig, blockLights, onProgress,
  };
  await ensureSpawnAreaGenerated(spawnPoint.x, spawnPoint.z);
  blockMeshesReady = true;

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
    const chunkSaves = collectModifiedChunkSaves();

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
      saveMode: 'chunkDelta',
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
      itemFrameContents: [...itemFrameContents.entries()],
      chunks: chunkSaves,
    };
  }

  function load(data: WorldSaveData) {
    onProgress?.('加载存档 · 清理旧世界', 0);
    worldSeed = data.seed;
    chunkManager.clear();
    lastRequestedPlayerChunkKey = '';

    for (const [, chunkMesh] of chunkMeshes) {
      for (const m of chunkMesh.meshes) { scene.remove(m); m.geometry.dispose(); }
    }
    for (const [, wm] of waterCtx.waterChunkMeshes) {
      scene.remove(wm.mesh); wm.mesh.geometry.dispose();
    }
    for (const c of creatures) scene.remove(c.root);
    for (const entity of placedModels.values()) scene.remove(entity.root);
    for (const model of storedModels.values()) {
      model.materials.forEach((m) => { importedModelMaterials.delete(m); });
    }

    clearWorldData();
    waterCtx.columnSolidY.clear();
    chunkMeshes.clear();
    waterCtx.waterChunkMeshes.clear();
    waterCtx.dirtyWaterChunks.clear();
    waterCtx.waterKeys.clear();
    waterCtx.waterUpdates.length = 0;
    waterCtx.queuedWaterUpdates.clear();
    creatures.length = 0;
    fallingBlocks.length = 0;
    placedModels.clear();
    placedModelRaycastRoots.length = 0;
    storedModels.clear();
    importedModelMaterials.clear();

    const hasLegacySnapshot = Boolean(data.blocksBin && data.blockDict);

    onProgress?.('加载存档 · 读取方块数据', 0.2);
    if (hasLegacySnapshot) {
      deserializeBlocks(data, blocks, (x, y, z) => _addSolidColumnY(waterCtx, x, y, z), keyOf, THREE.Vector3);
    } else {
      for (const request of chunkManager.getChunksInRadius(data.player.x, data.player.z)) {
        generateChunkForLoad(request.chunkX, request.chunkZ);
      }
    }

    onProgress?.('加载存档 · 恢复水体', 0.4);
    for (const [key, cell] of data.waterCells ?? []) {
      const [xs, ys, zs] = key.split(',');
      const x = +xs, y = +ys, z = +zs;
      setWaterCellRecord(x, y, z, cell);
      waterCtx.waterKeys.add(key);
      _markWaterChunkDirty(waterCtx, x, z);
    }

    if (data.chunks?.length) {
      onProgress?.('加载存档 · 应用区块数据', 0.46);
      for (const chunk of data.chunks) {
        if (!hasLegacySnapshot) generateChunkForLoad(chunk.chunkX, chunk.chunkZ);
        suppressChunkEditRecording = true;
        applyChunkData(
          chunk,
          (x, y, z, type) => {
            const existing = getBlock(x, y, z);
            if (existing) {
              deleteBlockRecord(x, y, z);
              if (isSolidBlock(existing.type)) _removeSolidColumnY(waterCtx, x, y, z);
              _wakeStaticWaterAround(waterCtx, x, y, z);
              _queueWaterNeighbors(waterCtx, x, y, z);
            }
            if (type) {
              setBlockRecord(x, y, z, type);
              if (isSolidBlock(type)) _addSolidColumnY(waterCtx, x, y, z);
            }
          },
          (x, y, z, cell) => {
            if (cell) {
              setWaterCellRecord(x, y, z, cell);
              waterCtx.waterKeys.add(keyOf(x, y, z));
            } else {
              deleteWaterCellRecord(x, y, z);
            }
            _markWaterChunkDirty(waterCtx, x, z);
          },
        );
        suppressChunkEditRecording = false;
        restoreChunkSaveMeta(chunk);
      }
    }

    onProgress?.('加载存档 · 恢复物品与模型', 0.5);
    itemFrameContents.clear();
    itemFrameMaterialCache.clear();
    if (data.itemFrameContents) {
      for (const [key, val] of data.itemFrameContents) itemFrameContents.set(key, val as BlockType);
    }

    camera.position.set(data.player.x, data.player.y, data.player.z);
    cameraYaw = data.player.yaw;
    cameraPitch = data.player.pitch;
    physicalY = data.player.physicalY;
    applyCameraRotation();

    timeOfDay = data.timeOfDay;
    settings.timeOfDay = data.timeOfDay;
    if (data.settings) {
      if (data.settings.mouseSensitivity !== undefined) settings.mouseSensitivity = data.settings.mouseSensitivity;
      if (data.settings.moveSpeed !== undefined) settings.moveSpeed = data.settings.moveSpeed;
      if (data.settings.daySpeed !== undefined) settings.daySpeed = data.settings.daySpeed;
      if (data.settings.shadows !== undefined) settings.shadows = data.settings.shadows;
      if (data.settings.viewDistance !== undefined) settings.viewDistance = data.settings.viewDistance;
      if (data.settings.modelBrightness !== undefined) settings.modelBrightness = data.settings.modelBrightness;
      if (data.settings.breakSpeed !== undefined) settings.breakSpeed = data.settings.breakSpeed;
      if (data.settings.showFps !== undefined) settings.showFps = data.settings.showFps;
      if (data.settings.infiniteWaterSpread !== undefined) settings.infiniteWaterSpread = data.settings.infiniteWaterSpread;
      if (data.settings.postProcessing !== undefined) settings.postProcessing = data.settings.postProcessing;
      if (data.settings.bloomStrength !== undefined) settings.bloomStrength = data.settings.bloomStrength;
    }

    onProgress?.('加载存档 · 构建区块网格', 0.7);
    if (hasLegacySnapshot) rebuildLoadedChunkMetaFromBlocks();
    else rebuildChunkIndexesFromWorldData();
    rebuildAllChunks();
    while (waterCtx.dirtyWaterChunks.size > 0) _rebuildDirtyWaterChunks(waterCtx, 64);

    onProgress?.('加载存档 · 放置光源', 0.9);
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

    _spawnCreatures(worldgenCtx, worldSeed);

    onProgress?.('加载存档 · 完成', 1);
    blockMeshesReady = true;
    emitSnapshot();
  }

  function respawn() {
    const spawn = worldGen.flatWorld ? { x: 0, z: 7 } : _findSafeSpawnPoint(worldSeed, 0, 7, worldRadius, waterLevel, worldGen);
    const spawnY = _getSurfaceHeight(worldSeed, spawn.x, spawn.z, worldRadius, waterLevel, worldGen.flatWorld, worldGen) + playerHeight + 2;
    camera.position.set(spawn.x, spawnY, spawn.z);
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

  function setTouchMove(x: number, y: number) {
    touchMoveX = x;
    touchMoveY = y;
  }

  function setTouchLook(dx: number, dy: number) {
    const sensitivity = settings.mouseSensitivity * 0.003;
    cameraYaw -= dx * sensitivity;
    cameraPitch -= dy * sensitivity;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    applyCameraRotation();
  }

  function touchJump() {
    if (canJump) {
      physicalY = Math.max(physicalY, groundHeightAt(Math.round(camera.position.x), Math.round(camera.position.z), physicalY + 0.2));
      verticalVelocity = 6.9;
      canJump = false;
    }
  }

  function touchTap(screenX: number, screenY: number) {
    const ndc = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(visibleChunkRaycastMeshes, false);
    if (hits.length === 0) return;
    const hit = hits[0];
    const hitBlock = getHitBlock(hit);
    if (!hitBlock) return;

    if (hitBlock.block.type === 'itemFrame') {
      const current = itemFrameContents.get(hitBlock.key);
      if (current === selectedBlock) {
        itemFrameContents.delete(hitBlock.key);
        itemFrameMaterialCache.delete(hitBlock.key);
      } else {
        itemFrameContents.set(hitBlock.key, selectedBlock);
      }
      rebuildAroundBlock(hitBlock.block.position.x, hitBlock.block.position.z);
      emitSnapshot();
      return;
    }

    const { x, y, z } = hitBlock.block.position;
    if (hitBlock.block.type === 'tnt') {
      primeTnt(x, y, z);
    } else {
      removeBlockAt(x, y, z);
    }
    emitSnapshot();
  }

  function touchPlace(screenX: number, screenY: number) {
    const ndc = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(visibleChunkRaycastMeshes, false);
    if (hits.length === 0) return;
    placeBlock(hits[0]);
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
    setTouchMove,
    setTouchLook,
    touchJump,
    touchTap,
    touchPlace,
    touchLock,
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
      stats.dom.remove();
      dracoLoader.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
