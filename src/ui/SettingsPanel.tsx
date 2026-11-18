import { Box, Cuboid, Eye, Gauge, Hammer, Moon, Settings, Sun, UserRound } from 'lucide-react';
import type { GameSettings } from '../engine/types';
import { matchingQualityPreset, qualityPreset, type QualityPreset } from '../engine/quality';

interface SettingsPanelProps {
  isMobile?: boolean;
  settings: GameSettings;
  onReturnToMenu: () => void;
  onUpdateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
}

export function SettingsPanel({ isMobile = false, settings, onReturnToMenu, onUpdateSetting, onUpdateSettings }: SettingsPanelProps) {
  return (
    <section className={isMobile ? 'mobile-settings-panel settings-panel' : 'side-panel settings-panel'} aria-label="设置">
      <header><Settings size={18} aria-hidden="true" /> 设置</header>
      <div className="settings-panel-scroll">
      <label className="quality-preset"><Eye size={15} aria-hidden="true" /> 画质预设
        <select aria-label="画质预设" value={matchingQualityPreset(settings)} onChange={event => {
          if (event.target.value !== 'custom') onUpdateSettings(qualityPreset(event.target.value as QualityPreset));
        }}>
          <option value="custom" disabled>自定义</option>
          <option value="low">低 · 更省资源</option>
          <option value="medium">中 · 均衡</option>
          <option value="high">高 · 更精细</option>
        </select>
      </label>
      <p className="quality-hint">预设统一调整视距、渲染倍率、阴影与后处理，也可逐项微调。</p>
      <label><Gauge size={15} aria-hidden="true" /> 鼠标灵敏度 <input type="range" min="0.4" max="2.4" step="0.1" value={settings.mouseSensitivity} onChange={(event) => onUpdateSetting('mouseSensitivity', Number(event.target.value))} /></label>
      <label><Gauge size={15} aria-hidden="true" /> 手柄视角 <input type="range" min="0.4" max="2.6" step="0.1" value={settings.gamepadLookSensitivity} onChange={(event) => onUpdateSetting('gamepadLookSensitivity', Number(event.target.value))} /></label>
      <label><UserRound size={15} aria-hidden="true" /> 移动速度 <input type="range" min="3" max="9" step="0.2" value={settings.moveSpeed} onChange={(event) => onUpdateSetting('moveSpeed', Number(event.target.value))} /></label>
      <label><Hammer size={15} aria-hidden="true" /> 挖掘速度 <input type="range" min="0.5" max="5" step="0.25" value={settings.breakSpeed} onChange={(event) => onUpdateSetting('breakSpeed', Number(event.target.value))} /></label>
      <label><Sun size={15} aria-hidden="true" /> 昼夜速度 <input type="range" min="0" max="0.012" step="0.001" value={settings.daySpeed} onChange={(event) => onUpdateSetting('daySpeed', Number(event.target.value))} /></label>
      <label><Moon size={15} aria-hidden="true" /> <span>当前时间 · {Math.round(settings.timeOfDay * 24)}:00</span><input type="range" min="0" max="1" step="0.01" value={settings.timeOfDay} onChange={(event) => onUpdateSetting('timeOfDay', Number(event.target.value))} /></label>
      <label><Eye size={15} aria-hidden="true" /> 视距 <input type="range" min="32" max="120" step="2" value={settings.viewDistance} onChange={(event) => onUpdateSetting('viewDistance', Number(event.target.value))} /></label>
      <label><Box size={15} aria-hidden="true" /> 渲染倍率 <input type="range" min="0.75" max="2" step="0.05" value={settings.pixelRatio} onChange={(event) => onUpdateSetting('pixelRatio', Number(event.target.value))} /></label>
      <label><Cuboid size={15} aria-hidden="true" /> 模型亮度 <input type="range" min="0.35" max="1.25" step="0.05" value={settings.modelBrightness} onChange={(event) => onUpdateSetting('modelBrightness', Number(event.target.value))} /></label>
      <label className="toggle-row"><input type="checkbox" checked={settings.shadows} onChange={(event) => onUpdateSetting('shadows', event.target.checked)} /> 阴影</label>
      {settings.shadows && <div className="shadow-settings">
        <label>阴影分辨率
          <select aria-label="阴影分辨率" value={settings.shadowResolution} onChange={event => onUpdateSetting('shadowResolution', Number(event.target.value) as GameSettings['shadowResolution'])}>
            <option value="512">512 · 更省资源</option><option value="1024">1024 · 均衡</option><option value="2048">2048 · 更精细</option>
          </select>
        </label>
        <label>阴影半径 · {settings.shadowRange} 格
          <input aria-label="阴影半径" type="range" min="16" max="96" step="4" value={settings.shadowRange} onChange={event => onUpdateSetting('shadowRange', Number(event.target.value))} />
        </label>
        <label>阴影刷新上限
          <select aria-label="阴影刷新上限" value={settings.shadowUpdateHz} onChange={event => onUpdateSetting('shadowUpdateHz', Number(event.target.value))}>
            {![8, 15, 30, 60].includes(settings.shadowUpdateHz) && <option value={settings.shadowUpdateHz}>{settings.shadowUpdateHz} 次/秒</option>}
            <option value="8">8 次/秒</option><option value="15">15 次/秒</option><option value="30">30 次/秒</option><option value="60">60 次/秒</option>
          </select>
        </label>
        <p className="quality-hint">场景未变化时跳过刷新；更高上限让移动阴影更流畅。</p>
      </div>}
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
      </div>
      <button type="button" className="panel-command" onClick={onReturnToMenu}>{isMobile ? '返回主菜单' : '返回菜单'}</button>
    </section>
  );
}
