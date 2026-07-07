import { UserRound } from 'lucide-react';
import type { ModelPartSettings, PlacedModelSettings } from '../game/blockGame';

function formatUiNumber(value: number, digits = 1) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(digits);
}

interface ModelPanelProps {
  model: PlacedModelSettings;
  onBindVmd: () => void;
  onDeleteModel: () => void;
  onReturnToGame: () => void;
  onUpdateModelPart: <K extends keyof Omit<ModelPartSettings, 'id' | 'name'>>(partId: string, key: K, value: ModelPartSettings[K]) => void;
  onUpdateModelSetting: <K extends keyof Omit<PlacedModelSettings, 'id' | 'name'>>(key: K, value: PlacedModelSettings[K]) => void;
}

export function ModelPanel({ model, onBindVmd, onDeleteModel, onReturnToGame, onUpdateModelPart, onUpdateModelSetting }: ModelPanelProps) {
  const modelHealthPercent = Math.max(0, Math.min(100, (model.health / model.maxHealth) * 100));

  return (
    <section className="side-panel settings-panel model-panel" aria-label="模型设置">
      <header><UserRound size={18} aria-hidden="true" /> 模型设置</header>
      <div className="model-card">
        <div className="model-card-icon"><UserRound size={22} aria-hidden="true" /></div>
        <div className="model-card-copy">
          <strong>{model.name}</strong>
          <span>{model.vmdName ? `VMD：${model.vmdName}` : '未绑定 VMD 动作'}</span>
        </div>
      </div>
      <div className="model-health-card">
        <div><span>生命</span><strong>{Math.round(model.health)} / {Math.round(model.maxHealth)}</strong></div>
        <div className="model-health-track"><span style={{ width: `${modelHealthPercent}%` }} /></div>
      </div>
      <div className="control-cluster"><span>核心</span>
        <label>最大生命 <b>{Math.round(model.maxHealth)}</b><input type="range" min="5" max="300" step="5" value={model.maxHealth} onChange={(event) => onUpdateModelSetting('maxHealth', Number(event.target.value))} /></label>
        <label>旋转 <b>{Math.round(model.rotation / Math.PI * 180)}°</b><input type="range" min="0" max={Math.PI * 2} step="0.05" value={model.rotation} onChange={(event) => onUpdateModelSetting('rotation', Number(event.target.value))} /></label>
        <label>缩放 <b>{Math.round(model.scale * 100)}%</b><input type="range" min="0.15" max="4" step="0.05" value={model.scale} onChange={(event) => onUpdateModelSetting('scale', Number(event.target.value))} /></label>
      </div>
      <div className="control-cluster"><span>位置</span>
        <label>X 偏移 <b>{formatUiNumber(model.offsetX)}</b><input type="range" min="-8" max="8" step="0.1" value={model.offsetX} onChange={(event) => onUpdateModelSetting('offsetX', Number(event.target.value))} /></label>
        <label>Y 偏移 <b>{formatUiNumber(model.offsetY)}</b><input type="range" min="-8" max="8" step="0.1" value={model.offsetY} onChange={(event) => onUpdateModelSetting('offsetY', Number(event.target.value))} /></label>
        <label>Z 偏移 <b>{formatUiNumber(model.offsetZ)}</b><input type="range" min="-8" max="8" step="0.1" value={model.offsetZ} onChange={(event) => onUpdateModelSetting('offsetZ', Number(event.target.value))} /></label>
      </div>
      <div className="control-cluster"><span>显示</span>
        <label>亮度 <b>{Math.round(model.brightness * 100)}%</b><input type="range" min="0.2" max="2" step="0.05" value={model.brightness} onChange={(event) => onUpdateModelSetting('brightness', Number(event.target.value))} /></label>
        <label>透明度 <b>{Math.round(model.opacity * 100)}%</b><input type="range" min="0.15" max="1" step="0.05" value={model.opacity} onChange={(event) => onUpdateModelSetting('opacity', Number(event.target.value))} /></label>
        <label>动画 <select value={model.animation} onChange={(event) => onUpdateModelSetting('animation', event.target.value as PlacedModelSettings['animation'])}><option value="none">关闭</option><option value="idle">待机呼吸</option><option value="spin">慢转</option><option value="lookAtPlayer">看向玩家</option></select></label>
        <label>动画速度 <b>{formatUiNumber(model.animationSpeed)}</b><input type="range" min="0" max="3" step="0.05" value={model.animationSpeed} onChange={(event) => onUpdateModelSetting('animationSpeed', Number(event.target.value))} /></label>
        <label>动画距离 <b>{Math.round(model.animationDistance)}</b><input type="range" min="8" max="120" step="2" value={model.animationDistance} onChange={(event) => onUpdateModelSetting('animationDistance', Number(event.target.value))} /></label>
      </div>
      <div className="model-parts-panel"><span>部件管理</span>
        {model.parts.length === 0 && <small>这个模型没有可分离的材质部件</small>}
        {model.parts.map((part) => (
          <div className="model-part-row" key={part.id}>
            <label className="toggle-row"><input type="checkbox" checked={part.visible} onChange={(event) => onUpdateModelPart(part.id, 'visible', event.target.checked)} /> <span title={part.name}>{part.name}</span></label>
            <label>透明度 <b>{Math.round(part.opacity * 100)}%</b><input type="range" min="0" max="1" step="0.05" value={part.opacity} onChange={(event) => onUpdateModelPart(part.id, 'opacity', Number(event.target.value))} /></label>
          </div>
        ))}
      </div>
      <div className="model-toggle-grid">
        <label className="toggle-row"><input type="checkbox" checked={model.vmdPlaying} disabled={!model.vmdName} onChange={(event) => onUpdateModelSetting('vmdPlaying', event.target.checked)} /> 播放 VMD</label>
        <label className="toggle-row"><input type="checkbox" checked={model.visible} onChange={(event) => onUpdateModelSetting('visible', event.target.checked)} /> 可见</label>
        <label className="toggle-row"><input type="checkbox" checked={model.shadows} onChange={(event) => onUpdateModelSetting('shadows', event.target.checked)} /> 模型阴影</label>
        <label className="toggle-row"><input type="checkbox" checked={model.damageable} onChange={(event) => onUpdateModelSetting('damageable', event.target.checked)} /> 可受伤</label>
      </div>
      <div className="model-actions">
        <button type="button" className="panel-command" onClick={onBindVmd}>绑定 VMD 动作</button>
        <button type="button" className="panel-command danger" onClick={onDeleteModel}>删除模型</button>
        <button type="button" className="panel-command" onClick={onReturnToGame}>返回游戏</button>
      </div>
    </section>
  );
}
