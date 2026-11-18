import type { GameSettings } from './types';

export type ShadowSettings = Pick<GameSettings, 'shadowResolution' | 'shadowRange' | 'shadowUpdateHz'>;

export const defaultShadowSettings: Readonly<ShadowSettings> = Object.freeze({
  shadowResolution: 1024,
  shadowRange: 40,
  shadowUpdateHz: 15,
});

export function normalizeShadowSettings(settings: Partial<ShadowSettings>): ShadowSettings {
  const finite = (value: number | undefined, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    shadowResolution: [512, 1024, 2048].includes(settings.shadowResolution ?? 0)
      ? settings.shadowResolution! : defaultShadowSettings.shadowResolution,
    shadowRange: finite(settings.shadowRange, defaultShadowSettings.shadowRange, 16, 96),
    shadowUpdateHz: finite(settings.shadowUpdateHz, defaultShadowSettings.shadowUpdateHz, 1, 60),
  };
}

export type ShadowPose = {
  x: number; y: number; z: number;
  /** Unit vector pointing toward the light. */
  lightX: number; lightY: number; lightZ: number;
};

/** No simulation delta, browser globals, or renderer dependencies. */
export class ShadowUpdatePolicy {
  private lastTime = -Infinity;
  private lastPose?: ShadowPose;
  private dirty = true;

  invalidate() { this.dirty = true; }

  /** A missing/disposed target must be repopulated on the first enabled frame. */
  reset() {
    this.lastTime = -Infinity;
    this.lastPose = undefined;
    this.dirty = true;
  }

  shouldUpdate(elapsed: number, enabled: boolean, settings: ShadowSettings, pose: ShadowPose) {
    if (!enabled || !Number.isFinite(elapsed)) return false;
    // A new clock origin should not freeze updates until it catches the old clock.
    if (elapsed < this.lastTime) this.reset();
    if (elapsed - this.lastTime + 1e-9 < 1 / settings.shadowUpdateHz) return false;
    const previous = this.lastPose;
    if (!previous || this.dirty) return true;
    const texel = 2 * settings.shadowRange / settings.shadowResolution;
    const distance = (pose.x - previous.x) ** 2 + (pose.y - previous.y) ** 2 + (pose.z - previous.z) ** 2;
    const direction = (pose.lightX - previous.lightX) ** 2
      + (pose.lightY - previous.lightY) ** 2 + (pose.lightZ - previous.lightZ) ** 2;
    return distance >= texel ** 2 || direction >= 0.002 ** 2;
  }

  /** Commit only after the renderer actually refreshed the map. */
  updated(elapsed: number, pose: ShadowPose) {
    this.lastTime = elapsed;
    this.lastPose = { ...pose };
    this.dirty = false;
  }
}
