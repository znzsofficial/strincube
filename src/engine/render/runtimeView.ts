import type { PerspectiveCamera, Scene } from 'three';
import type { PerformanceResources } from '../diagnostics';
import type { GameSettings } from '../types';

/** The scene and camera outlive any renderer or canvas replacement. */
export interface RuntimeView {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly contextLost: boolean;
  readonly error?: Error;
  draw(time: number, dt: number, nowMs: number, eyeDepth?: number): void;
  apply(settings: GameSettings): void;
  invalidateShadows(): void;
  frameResources(): PerformanceResources;
  dispose(): void;
}
