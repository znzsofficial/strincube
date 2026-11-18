import type { GameSettings } from './types';

export type QualityPreset = 'low' | 'medium' | 'high';
export type QualitySettings = Pick<GameSettings,
  'pixelRatio' | 'viewDistance' | 'shadows' | 'shadowResolution' | 'shadowRange' | 'shadowUpdateHz'
  | 'postProcessing' | 'bloomStrength' | 'vignette' | 'filmGrain'>;

export const qualityPresets: Readonly<Record<QualityPreset, Readonly<QualitySettings>>> = Object.freeze({
  low: Object.freeze({
    pixelRatio: 1, viewDistance: 48, shadows: false,
    shadowResolution: 512, shadowRange: 24, shadowUpdateHz: 8,
    postProcessing: false, bloomStrength: 0, vignette: false, filmGrain: false,
  }),
  medium: Object.freeze({
    pixelRatio: 1, viewDistance: 82, shadows: true,
    shadowResolution: 1024, shadowRange: 40, shadowUpdateHz: 15,
    postProcessing: false, bloomStrength: 0.18, vignette: false, filmGrain: false,
  }),
  high: Object.freeze({
    pixelRatio: 1.5, viewDistance: 120, shadows: true,
    shadowResolution: 2048, shadowRange: 56, shadowUpdateHz: 30,
    postProcessing: true, bloomStrength: 0.18, vignette: false, filmGrain: false,
  }),
});

/** Fresh patch; gameplay/input preferences and world generation are untouched. */
export function qualityPreset(preset: QualityPreset): QualitySettings {
  return { ...qualityPresets[preset] };
}

/** Derived UI state, never another setting to persist or synchronize. */
export function matchingQualityPreset(settings: GameSettings): QualityPreset | 'custom' {
  for (const preset of ['low', 'medium', 'high'] as const) {
    const patch = qualityPresets[preset];
    if ((Object.keys(patch) as (keyof QualitySettings)[]).every(key => settings[key] === patch[key])) return preset;
  }
  return 'custom';
}
