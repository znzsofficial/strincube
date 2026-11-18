// Loaded on demand when native WebGPU is requested.
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { PerformanceResources } from '../diagnostics';
import type { GameSettings, RendererBackend } from '../types';
import type { RuntimeView } from './runtimeView';
import { GameScene } from './scene';
import { lightCycle, waterAtmosphere } from './daylight';

export class NativeWebGPUUnavailableError extends Error {
  readonly name = 'NativeWebGPUUnavailableError';
}

type Backend = WebGPURenderer['backend'] & {
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
  device?: GPUDevice;
};

export async function createExperimentalView(mount: HTMLElement, settings: GameSettings, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!navigator.gpu) throw new NativeWebGPUUnavailableError('WebGPU is unavailable in this browser context.');
  const { WebGPURenderer } = await import('three/webgpu');
  signal?.throwIfAborted();
  const canvas = document.createElement('canvas');
  const renderer = new WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const attemptedBackend = renderer.backend as Backend;
  try {
    // Do not attach the canvas or observer until init() finishes. Abandoned late
    // results take the same cleanup path as any other initialization failure.
    await renderer.init();
    signal?.throwIfAborted();
    const backend = renderer.backend as Backend;
    if (backend.isWebGLBackend) {
      throw new NativeWebGPUUnavailableError('Three initialized WebGLBackend instead of native WebGPUBackend.');
    }
    if (!backend.isWebGPUBackend || !backend.device) throw new Error('Unknown renderer backend or missing GPUDevice.');
    return new ExperimentalWebgpuView(mount, settings, renderer, canvas, backend.device);
  } catch (error) {
    canvas.remove();
    // In r187 dispose() awaits the same init promise; on a failed init it
    // may reject without freeing a device acquired by the original backend.
    try { await renderer.dispose(); } catch { /* Preserve the startup failure. */ }
    attemptedBackend.device?.destroy();
    throw error;
  }
}

export class ExperimentalWebgpuView implements RuntimeView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, .1, 220);
  private readonly mount: HTMLElement;
  private readonly nativeCanvas: HTMLCanvasElement;
  private readonly sun = new THREE.DirectionalLight(0xffedcd);
  private readonly ambient = new THREE.HemisphereLight(0xc4e9ff, 0x8b896c);
  private readonly sky = new THREE.Color();
  private readonly fog: THREE.Fog;
  private readonly observer: ResizeObserver;
  private settings: GameSettings;
  private native?: WebGPURenderer;
  private device?: GPUDevice;
  private stable?: GameScene;
  private disposed = false;
  private failure?: Error;
  private reason?: GPUDeviceLostReason;
  private nativeCount = 0;
  private stableCount = 0;
  private width = 0;
  private height = 0;
  private ratio = 0;

  get canvas() { return this.stable?.canvas ?? this.nativeCanvas; }
  get rendererBackend(): RendererBackend | undefined { return this.stable?.rendererBackend ?? (this.native ? 'webgpu' : undefined); }
  get backend() { return this.rendererBackend === 'webgl' ? 'WebGLRenderer' : this.rendererBackend === 'webgpu' ? 'WebGPUBackend' : null; }
  get contextLost() { return !!this.failure || (this.stable?.contextLost ?? !this.native); }
  get error() { return this.failure; }
  get lossReason() { return this.reason; }
  get nativeFrames() { return this.nativeCount; }
  get fallbackFrames() { return this.stableCount; }

  constructor(mount: HTMLElement, settings: GameSettings, renderer: WebGPURenderer, canvas: HTMLCanvasElement, device: GPUDevice) {
    this.mount = mount;
    this.native = renderer;
    this.device = device;
    this.nativeCanvas = canvas;
    this.settings = settings;
    this.camera.rotation.order = 'YXZ';
    this.scene.background = this.sky;
    this.scene.fog = this.fog = new THREE.Fog(0xa8d4ee, 35, settings.viewDistance);
    this.scene.add(this.ambient, this.sun, this.sun.target);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    // Direct native pass only; shadow caching and composer remain stable-view features.
    renderer.info.autoReset = false;
    this.observer = new ResizeObserver(() => this.fit());
    this.apply(settings);
    mount.append(canvas);
    this.observer.observe(mount);
    // r187 filters reason === 'destroyed' before invoking onDeviceLost. Only
    // the actual device's promise covers both intentional and unexpected loss.
    void device.lost.then(info => this.recover(info));
  }

  private fit() {
    if (!this.native) return;
    const w = Math.max(1, this.mount.clientWidth), h = Math.max(1, this.mount.clientHeight);
    const ratio = Math.min(this.settings.pixelRatio, 2);
    if (w === this.width && h === this.height && ratio === this.ratio) return;
    this.width = w; this.height = h; this.ratio = ratio;
    this.native.setPixelRatio(ratio);
    this.native.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  apply(settings: GameSettings) {
    if (this.disposed || this.failure) return;
    this.settings = settings;
    if (this.stable) {
      try { this.stable.apply(settings); } catch (error) { this.failRecovery(error); }
      return;
    }
    this.fog.far = settings.viewDistance;
    this.fog.near = Math.max(15, this.fog.far * .5);
    this.camera.far = Math.max(100, settings.viewDistance * 2);
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  invalidateShadows() { this.stable?.invalidateShadows(); }

  draw(time: number, dt: number, nowMs: number, eyeDepth = 0) {
    if (this.contextLost || this.disposed) return;
    if (this.stable) {
      try {
        this.stable.draw(time, dt, nowMs, eyeDepth);
        this.stableCount++;
      } catch (error) { this.failRecovery(error); }
    } else if (this.native) {
      const daylight = lightCycle(time, this.sky, this.fog.color, this.sun, this.ambient);
      waterAtmosphere(eyeDepth, this.settings.viewDistance, this.sky, this.fog, this.sun, this.ambient);
      this.sun.position.set(Math.sin(time * Math.PI * 2) * 55, 22 + daylight * 48, 25).add(this.camera.position);
      this.sun.target.position.copy(this.camera.position);
      this.native.info.reset();
      this.native.render(this.scene, this.camera);
      this.nativeCount++;
    }
  }

  frameResources(): PerformanceResources {
    if (this.contextLost) return {};
    if (this.stable) return this.stable.frameResources();
    const { render, memory } = this.native!.info;
    return { drawCalls: render.drawCalls, triangles: render.triangles, geometries: memory.geometries,
      textures: memory.textures, programs: memory.programs, shadowUpdates: 0 };
  }

  async destroyDeviceForTest(): Promise<GPUDeviceLostInfo> {
    const device = this.device;
    if (!device) throw new Error('No active native device to destroy.');
    await device.queue.onSubmittedWorkDone();
    if (this.device !== device) throw new Error('Native device retired before destruction.');
    device.destroy();
    return device.lost;
  }

  private async releaseNative() {
    const renderer = this.native;
    if (!renderer) return;
    this.native = undefined;
    const device = this.device;
    this.device = undefined;
    this.observer.disconnect();
    this.nativeCanvas.remove();
    // Only detach our environment. Meshes, shared textures, model/skeletons and
    // their ownership stay with the live session, not this renderer.
    this.scene.remove(this.ambient, this.sun, this.sun.target);
    try { await renderer.dispose(); } catch (error) {
      device?.destroy();
      console.warn('Could not fully dispose retired WebGPU renderer:', error);
    }
  }

  private async recover(info: GPUDeviceLostInfo) {
    if (this.disposed || !this.native) return;
    this.reason = info.reason;
    await this.releaseNative();
    if (this.disposed) return;
    try {
      // r187 native rendering switches the camera to WebGPU clip space;
      // WebGLRenderer doesn't switch it back. Preserve the camera, not that mode.
      this.camera.coordinateSystem = THREE.WebGLCoordinateSystem;
      this.camera.updateProjectionMatrix();
      this.stable = new GameScene(this.mount, this.settings, { scene: this.scene, camera: this.camera });
    } catch (error) { this.failRecovery(error); }
  }

  private failRecovery(cause: unknown) {
    this.failure = new Error(`WebGPU device lost (${this.reason}); WebGL recovery failed: ${String(cause)}`, { cause });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    void this.releaseNative();
    this.stable?.dispose();
    this.stable = undefined;
  }
}
