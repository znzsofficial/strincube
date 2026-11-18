import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { defaultSettings } from '../src/engine/core/session';
import type { GameSettings } from '../src/engine/types';
import { SettingsPanel } from '../src/ui/SettingsPanel';

/** Check that a multi-setting preset reaches the runtime as one patch, not stale per-key updates. */
export function verifyQualitySettings(assert: (condition: unknown, label: string) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let settings = defaultSettings(1);
  let patches = 0;
  const apply = (patch: Partial<GameSettings>) => { settings = { ...settings, ...patch }; patches++; render(); };
  const render = () => flushSync(() => root.render(createElement(SettingsPanel, {
    settings, onReturnToMenu: () => {}, onUpdateSettings: apply,
    onUpdateSetting: (key, value) => apply({ [key]: value }),
  })));
  const select = (value: string) => {
    const input = host.querySelector<HTMLSelectElement>('[aria-label="画质预设"]')!;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  try {
    render();
    select('low');
    assert(patches === 1 && !settings.shadows && !settings.postProcessing, '低画质一次应用完整设置，关闭阴影与后处理');
    select('high');
    assert(patches === 2 && settings.shadows && settings.postProcessing, '高画质一次恢复阴影与后处理');
    apply({ viewDistance: settings.viewDistance - 1 });
    assert(host.querySelector<HTMLSelectElement>('[aria-label="画质预设"]')!.value === 'custom', '手动调整画质后预设显示自定义');
    apply({ shadows: false });
    assert(!host.querySelector('[aria-label="阴影分辨率"]'), '关闭阴影后隐藏无效的阴影细节控件');
  } finally { root.unmount(); host.remove(); }
}
