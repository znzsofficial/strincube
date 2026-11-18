import * as THREE from 'three';
import { PostProcessing } from './postProcessing';
import type { GameSettings } from '../types';
import type { RuntimeView } from './runtimeView';
import { lightCycle, waterAtmosphere } from './daylight';
import { VoxelSky } from './sky';
import { normalizeShadowSettings, ShadowUpdatePolicy, type ShadowSettings } from '../shadowPolicy';

export type ShadowDiagnostics = Readonly<{
  /** Actual directional shadow matrix/render preparations, not requested updates. */
  frameUpdates: number;
  totalUpdates: number;
  mapAllocated: boolean;
  mapWidth: number;
  mapHeight: number;
}>;

export class GameScene implements RuntimeView {
  readonly rendererBackend = 'webgl';
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private currentRenderer: THREE.WebGLRenderer;
  private rendererReleased = false;
  get renderer() { return this.currentRenderer; }
  get canvas() { return this.currentRenderer.domElement; }
  frameResources() {
    const info = this.renderer.info;
    return { drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries,
      textures: info.memory.textures, programs: info.programs?.length ?? 0, shadowUpdates: this.shadowFrameUpdates };
  }
  private post?: PostProcessing;
  private size = { width: 0, height: 0, ratio: 0 };
  private sunOffset = new THREE.Vector3();
  private sun = new THREE.DirectionalLight(0xffedcd, 2.2);
  // This light is only a shadow-camera pose, never added to the scene. Direct
  // lighting follows the sun every frame while the cached depth map and its
  // projection remain paired until the next bounded refresh.
  private shadowPoseLight = new THREE.DirectionalLight();
  private shadowPolicy = new ShadowUpdatePolicy();
  private shadowSettings: ShadowSettings;
  private shadowRight = new THREE.Vector3();
  private shadowUp = new THREE.Vector3();
  private shadowDirection = new THREE.Vector3();
  private shadowCenter = new THREE.Vector3();
  private shadowFrameUpdates = 0;
  private shadowTotalUpdates = 0;
  private ambient = new THREE.HemisphereLight(0xc4e9ff, 0x8b896c, 1.7);
  private observer?: ResizeObserver;
  private mount: HTMLElement;
  private settings: GameSettings;
  private readonly skyLayer: VoxelSky;
  contextLost = false;
  private abort = new AbortController();
  constructor(mount: HTMLElement, settings: GameSettings, retained?: Pick<RuntimeView, 'scene' | 'camera'>) {
    this.scene = retained?.scene ?? new THREE.Scene();
    this.camera = retained?.camera ?? new THREE.PerspectiveCamera(72, 1, 0.1, 220);
    this.mount = mount;
    this.settings = settings;
    this.shadowSettings = normalizeShadowSettings(settings);
    this.currentRenderer = this.createRenderer();
    this.skyLayer = new VoxelSky(this.scene);
    this.sun.shadow.autoUpdate = false;
    // Three r187 only refreshes a directional shadow matrix in WebGLShadowMap,
    // after both needsUpdate gates; WebGLLights reuses that matrix. Unlike spot
    // lights, moving the visible directional light cannot change it between maps.
    const updateShadowMatrices = this.sun.shadow.updateMatrices.bind(this.sun.shadow);
    this.sun.shadow.updateMatrices = () => {
      updateShadowMatrices(this.shadowPoseLight);
      this.shadowFrameUpdates++;
      this.shadowTotalUpdates++;
    };
    this.camera.rotation.order = 'YXZ';
    this.scene.background = new THREE.Color(0xa8d4ee);
    this.scene.fog = new THREE.Fog(0xa8d4ee, 35, settings.viewDistance);
    Object.assign(this.sun.shadow.camera, {
      left: -40,
      right: 40,
      top: 40,
      bottom: -40,
      near: 0.1,
      far: 180,
    });
    this.sun.shadow.bias = -0.0005;
    try {
      this.scene.add(this.sun, this.sun.target, this.ambient);
      mount.append(this.renderer.domElement);
      this.bindContextEvents();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(mount);
      this.apply(settings);
    } catch (cause) {
      // A failed constructor cannot return its canvas/resources to the caller.
      this.dispose();
      throw cause;
    }
  }
  private bindContextEvents() {
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.contextLost = true;
        // r187's built-in restoration replaces caches without detaching old
        // geometry/target dispose listeners. Dispose while GL is still lost,
        // before old native handles can be deleted against the restored context.
        this.post?.dispose();
        this.post = undefined;
        this.releaseShadowTargets();
        this.renderer.dispose();
        this.rendererReleased = true;
      },
      { signal: this.abort.signal },
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      () => {
        const canvas = this.renderer.domElement;
        this.currentRenderer = this.createRenderer(canvas);
        this.rendererReleased = false;
        this.contextLost = false;
        this.size = { width: 0, height: 0, ratio: 0 };
        this.apply(this.settings);
      },
      { signal: this.abort.signal },
    );
  }
  private createRenderer(canvas?: HTMLCanvasElement) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    // EffectComposer performs multiple render calls per frame. Keep one complete
    // frame's counters instead of letting each pass reset the previous pass.
    renderer.info.autoReset = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    return renderer;
  }
  apply(settings: GameSettings) {
    this.settings = settings;
    const shadowSettings = normalizeShadowSettings(settings);
    if (!settings.shadows || shadowSettings.shadowResolution !== this.shadowSettings.shadowResolution) {
      this.releaseShadowTargets();
    }
    this.shadowSettings = shadowSettings;
    const resolution = Math.min(shadowSettings.shadowResolution, this.renderer.capabilities.maxTextureSize);
    this.sun.shadow.mapSize.set(resolution, resolution);
    const range = shadowSettings.shadowRange;
    Object.assign(this.sun.shadow.camera, { left: -range, right: range, top: range, bottom: -range,
      far: Math.max(180, range * 3) });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.autoUpdate = false;
    this.sun.castShadow = settings.shadows;
    this.invalidateShadows();
    this.camera.far = Math.max(100, settings.viewDistance * 2);
    this.camera.updateProjectionMatrix();
    if (settings.postProcessing && !this.contextLost) {
      this.post ??= new PostProcessing(this.renderer, this.scene, this.camera);
      this.post.apply(settings);
    } else if (this.post) {
      this.post.dispose();
      this.post = undefined;
    }
    this.resize();
  }
  private resize() {
    if (this.contextLost) return;
    const w = Math.max(1, this.mount.clientWidth),
      h = Math.max(1, this.mount.clientHeight);
    const ratio = Math.min(this.settings.pixelRatio, 2);
    if (ratio !== this.size.ratio) this.renderer.setPixelRatio(ratio);
    if (w !== this.size.width || h !== this.size.height) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }
    this.post?.resize(w, h, ratio);
    this.size = { width: w, height: h, ratio };
  }
  /** Changes to world meshes, model transforms/appearance, or animated casters. */
  invalidateShadows() {
    this.shadowPolicy.invalidate();
  }

  get shadowDiagnostics(): ShadowDiagnostics {
    const map = this.sun.shadow.map;
    return Object.freeze({ frameUpdates: this.shadowFrameUpdates, totalUpdates: this.shadowTotalUpdates,
      mapAllocated: map !== null, mapWidth: map?.width ?? 0, mapHeight: map?.height ?? 0 });
  }

  private releaseShadowTargets() {
    const shadow = this.sun.shadow;
    shadow.dispose();
    // LightShadow.dispose releases resources but does not clear references.
    shadow.map = null;
    shadow.mapPass = null;
    shadow.needsUpdate = false;
    this.renderer.shadowMap.needsUpdate = false;
    this.shadowPolicy.reset();
  }

  private prepareShadowPose() {
    const direction = this.shadowDirection.copy(this.sunOffset).normalize();
    const right = this.shadowRight.set(direction.z, 0, -direction.x).normalize();
    const up = this.shadowUp.crossVectors(direction, right).normalize();
    const center = this.shadowCenter.copy(this.camera.position);
    const texel = 2 * this.shadowSettings.shadowRange / this.sun.shadow.mapSize.x;
    // Quantize in light space, not world X/Z (the sun is oblique).
    const x = center.dot(right), y = center.dot(up);
    center.addScaledVector(right, Math.round(x / texel) * texel - x);
    center.addScaledVector(up, Math.round(y / texel) * texel - y);
    this.shadowPoseLight.position.copy(center).add(this.sunOffset);
    this.shadowPoseLight.target.position.copy(center);
    this.shadowPoseLight.updateMatrixWorld();
    this.shadowPoseLight.target.updateMatrixWorld();
  }

  /** nowMs is raw RAF time; dt remains the postprocessing animation delta. */
  draw(time: number, dt: number, nowMs = performance.now(), eyeDepth = 0) {
    this.renderer.info.reset();
    this.shadowFrameUpdates = 0;
    const fog = this.scene.fog as THREE.Fog;
    lightCycle(time, this.scene.background as THREE.Color, fog.color, this.sun, this.ambient);
    waterAtmosphere(eyeDepth, this.settings.viewDistance, this.scene.background as THREE.Color, fog, this.sun, this.ambient);
    this.skyLayer.update(time,this.camera,this.scene.background as THREE.Color,eyeDepth,this.sunOffset);
    this.sun.position.copy(this.camera.position).add(this.sunOffset);
    this.sun.target.position.copy(this.camera.position);
    if (this.contextLost) return;
    const direction = this.shadowDirection.copy(this.sunOffset).normalize();
    const pose = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z,
      lightX: direction.x, lightY: direction.y, lightZ: direction.z };
    const elapsed = nowMs / 1000;
    const refresh = this.shadowPolicy.shouldUpdate(elapsed, this.settings.shadows, this.shadowSettings, pose);
    if (refresh) this.prepareShadowPose();
    this.renderer.shadowMap.needsUpdate = refresh;
    this.sun.shadow.needsUpdate = refresh;
    if (this.post) this.post.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    if (this.shadowFrameUpdates > 0) this.shadowPolicy.updated(elapsed, pose);
  }
  dispose() {
    this.skyLayer.dispose();
    this.abort.abort();
    this.observer?.disconnect();
    this.scene.remove(this.sun, this.sun.target, this.ambient);
    this.post?.dispose();
    this.releaseShadowTargets();
    if (!this.rendererReleased) this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
