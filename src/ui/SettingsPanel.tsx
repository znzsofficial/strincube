import { Box, Cuboid, Eye, Gauge, Hammer, Moon, Settings, Sun, UserRound } from 'lucide-react';
import type { GameSettings } from '../game/blockGame';

interface SettingsPanelProps {
  settings: GameSettings;
  onReturnToMenu: () => void;
  onUpdateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
}

export function SettingsPanel({ settings, onReturnToMenu, onUpdateSetting }: SettingsPanelProps) {
  return (
    <section className="side-panel settings-panel" aria-label="设置">
      <header><Settings size={18} aria-hidden="true" /> 设置</header>
      <label><Cuboid size={15} aria-hidden="true" /> 渲染后端 <select value={settings.rendererBackend} onChange={(event) => onUpdateSetting('rendererBackend', event.target.value as GameSettings['rendererBackend'])}><option value="webgl">WebGL 稳定</option><option value="webgpu">WebGPU 实验性</option></select></label>
      <label><Gauge size={15} aria-hidden="true" /> 鼠标灵敏度 <input type="range" min="0.4" max="2.4" step="0.1" value={settings.mouseSensitivity} onChange={(event) => onUpdateSetting('mouseSensitivity', Number(event.target.value))} /></label>
      <label><Gauge size={15} aria-hidden="true" /> 手柄视角 <input type="range" min="0.4" max="2.6" step="0.1" value={settings.gamepadLookSensitivity} onChange={(event) => onUpdateSetting('gamepadLookSensitivity', Number(event.target.value))} /></label>
      <label><UserRound size={15} aria-hidden="true" /> 移动速度 <input type="range" min="3" max="9" step="0.2" value={settings.moveSpeed} onChange={(event) => onUpdateSetting('moveSpeed', Number(event.target.value))} /></label>
      <label><Hammer size={15} aria-hidden="true" /> 挖掘速度 <input type="range" min="0.5" max="5" step="0.25" value={settings.breakSpeed} onChange={(event) => onUpdateSetting('breakSpeed', Number(event.target.value))} /></label>
      <label><Sun size={15} aria-hidden="true" /> 昼夜速度 <input type="range" min="0" max="0.012" step="0.001" value={settings.daySpeed} onChange={(event) => onUpdateSetting('daySpeed', Number(event.target.value))} /></label>
      <label><Moon size={15} aria-hidden="true" /> 当前时间 <input type="range" min="0" max="1" step="0.01" value={settings.timeOfDay} onChange={(event) => onUpdateSetting('timeOfDay', Number(event.target.value))} /> {Math.round(settings.timeOfDay * 24)}:00</label>
      <label><Eye size={15} aria-hidden="true" /> 视距 <input type="range" min="32" max="110" step="2" value={settings.viewDistance} onChange={(event) => onUpdateSetting('viewDistance', Number(event.target.value))} /></label>
      <label><Box size={15} aria-hidden="true" /> 渲染倍率 <input type="range" min="0.75" max="2" step="0.05" value={settings.pixelRatio} onChange={(event) => onUpdateSetting('pixelRatio', Number(event.target.value))} /></label>
      <label><Cuboid size={15} aria-hidden="true" /> 模型亮度 <input type="range" min="0.35" max="1.25" step="0.05" value={settings.modelBrightness} onChange={(event) => onUpdateSetting('modelBrightness', Number(event.target.value))} /></label>
      <label className="toggle-row"><input type="checkbox" checked={settings.shadows} onChange={(event) => onUpdateSetting('shadows', event.target.checked)} /> 阴影</label>
      <label className="toggle-row"><input type="checkbox" checked={settings.showFps} onChange={(event) => onUpdateSetting('showFps', event.target.checked)} /> 显示帧数</label>
      <label className="toggle-row"><input type="checkbox" checked={settings.postProcessing} disabled={settings.rendererBackend !== 'webgl'} onChange={(event) => onUpdateSetting('postProcessing', event.target.checked)} /> 后处理 FXAA/Bloom</label>
      {settings.postProcessing && settings.rendererBackend === 'webgl' && (
        <div className="postprocess-panel">
          <label>Bloom 强度 <input type="range" min="0" max="0.55" step="0.01" value={settings.bloomStrength} onChange={(event) => onUpdateSetting('bloomStrength', Number(event.target.value))} /></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.vignette} onChange={(event) => onUpdateSetting('vignette', event.target.checked)} /> 晕影效果 (Vignette)</label>
          {settings.vignette && (
            <label>晕影强度 <input type="range" min="0.2" max="2.2" step="0.05" value={settings.vignetteDarkness} onChange={(event) => onUpdateSetting('vignetteDarkness', Number(event.target.value))} /></label>
          )}
          <label className="toggle-row"><input type="checkbox" checked={settings.filmGrain} onChange={(event) => onUpdateSetting('filmGrain', event.target.checked)} /> 胶片噪点 (Film Grain)</label>
          {settings.filmGrain && (
            <>
              <label>噪点强度 <input type="range" min="0.05" max="0.45" step="0.01" value={settings.filmNoise} onChange={(event) => onUpdateSetting('filmNoise', Number(event.target.value))} /></label>
              <label>扫描线强度 <input type="range" min="0" max="0.25" step="0.01" value={settings.filmScanlines} onChange={(event) => onUpdateSetting('filmScanlines', Number(event.target.value))} /></label>
            </>
          )}
        </div>
      )}
      <label className="toggle-row"><input type="checkbox" checked={settings.infiniteWaterSpread} onChange={(event) => onUpdateSetting('infiniteWaterSpread', event.target.checked)} /> 水流无限蔓延</label>
      <button type="button" className="panel-command" onClick={onReturnToMenu}>返回菜单</button>
    </section>
  );
}
