import { Cuboid } from 'lucide-react';
import type { WorldGenSettings } from '../game/blockGame';

type WorldMode = 'infinite' | 'finite' | 'flat';
type SaveMeta = { id: string; name: string; savedAt: number };

interface TitleScreenProps {
  densitySummary: string;
  finiteWorldRadius: number;
  saveMetaList: SaveMeta[];
  showAdvancedWorldSettings: boolean;
  showWorldSettings: boolean;
  worldGenSettings: WorldGenSettings;
  worldMode: WorldMode;
  worldSummary: string;
  onConfirmStartNewWorld: () => void;
  onDeleteSave: (id: string) => void;
  onLoadGame: (id: string) => void;
  onSetShowAdvancedWorldSettings: (value: boolean | ((current: boolean) => boolean)) => void;
  onSetShowWorldSettings: (value: boolean) => void;
  onSetWorldGenSettings: (settings: WorldGenSettings) => void;
  onSetWorldMode: (mode: WorldMode) => void;
  onStartNewWorld: () => void;
  onUpdateWorldGenScale: (key: 'mountainScale' | 'oceanScale' | 'riverScale' | 'biomeScale', value: number) => void;
}

function formatUiNumber(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function TitleScreen({
  densitySummary,
  finiteWorldRadius,
  saveMetaList,
  showAdvancedWorldSettings,
  showWorldSettings,
  worldGenSettings,
  worldMode,
  worldSummary,
  onConfirmStartNewWorld,
  onDeleteSave,
  onLoadGame,
  onSetShowAdvancedWorldSettings,
  onSetShowWorldSettings,
  onSetWorldGenSettings,
  onSetWorldMode,
  onStartNewWorld,
  onUpdateWorldGenScale,
}: TitleScreenProps) {
  return (
    <main className="game-shell title-screen">
      <div className={showWorldSettings ? 'title-content world-creator-open' : 'title-content'}>
        <div className="title-logo">
          <Cuboid size={52} className="title-icon" />
        </div>
        <h1>StrinCube</h1>
        <p className="title-subtitle">一个可爱的方块世界</p>
        {showWorldSettings ? (
          <div className="world-settings">
            <div className="world-settings-header">
              <div>
                <h3>创建新世界</h3>
                <p>{worldSummary}</p>
              </div>
              <Cuboid size={30} aria-hidden="true" />
            </div>
            <div className="world-settings-grid">
              <section className="world-settings-section" aria-labelledby="world-mode-heading">
                <h4 id="world-mode-heading">世界模式</h4>
                <div className="world-mode-grid" role="radiogroup" aria-label="世界模式">
                  <button type="button" role="radio" aria-checked={worldMode === 'infinite'} className={`world-mode-card ${worldMode === 'infinite' ? 'active' : ''}`} onClick={() => onSetWorldMode('infinite')}>
                    <span className="world-mode-icon">∞</span>
                    <strong>无限</strong>
                    <small>边走边生成区块</small>
                  </button>
                  <button type="button" role="radio" aria-checked={worldMode === 'finite'} className={`world-mode-card ${worldMode === 'finite' ? 'active' : ''}`} onClick={() => onSetWorldMode('finite')}>
                    <span className="world-mode-icon">□</span>
                    <strong>有限</strong>
                    <small>固定半径世界</small>
                  </button>
                  <button type="button" role="radio" aria-checked={worldMode === 'flat'} className={`world-mode-card ${worldMode === 'flat' ? 'active' : ''}`} onClick={() => onSetWorldMode('flat')}>
                    <span className="world-mode-icon">▣</span>
                    <strong>超平坦</strong>
                    <small>测试建造最快</small>
                  </button>
                </div>
              </section>

              <section className="world-settings-section world-settings-inline" aria-labelledby="world-seed-heading">
                <div>
                  <h4 id="world-seed-heading">世界种子</h4>
                  <p>{worldGenSettings.seed == null ? '留空会随机生成' : `固定种子 ${worldGenSettings.seed}`}</p>
                </div>
                <input
                  type="text"
                  className="seed-input"
                  inputMode="numeric"
                  placeholder="随机"
                  value={worldGenSettings.seed ?? ''}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    onSetWorldGenSettings({ ...worldGenSettings, seed: raw ? Number(raw) || undefined : undefined });
                  }}
                />
              </section>

              {worldMode === 'finite' && (
                <section className="world-settings-section slider-label" aria-labelledby="world-size-heading">
                  <span id="world-size-heading">世界大小 <small>{finiteWorldRadius} 格半径</small></span>
                  <input
                    type="range"
                    min={30}
                    max={200}
                    step={10}
                    value={finiteWorldRadius}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const preset: WorldGenSettings['worldSize'] = value <= 50 ? 'small' : value <= 100 ? 'medium' : value <= 150 ? 'large' : 'huge';
                      onSetWorldGenSettings({ ...worldGenSettings, worldSizeCustom: value, worldSize: preset });
                    }}
                  />
                  <div className="slider-marks">
                    <span>小</span><span>中</span><span>大</span><span>巨大</span>
                  </div>
                </section>
              )}

              <section className="world-settings-section" aria-labelledby="world-density-heading">
                <div className="world-section-title">
                  <h4 id="world-density-heading">生成内容</h4>
                  <p>{densitySummary}</p>
                </div>
                <div className="world-density-grid">
                  <label>
                    <span>树木</span>
                    <select value={worldGenSettings.treeDensity} onChange={(event) => onSetWorldGenSettings({ ...worldGenSettings, treeDensity: event.target.value as WorldGenSettings['treeDensity'] })}>
                      <option value="none">无</option>
                      <option value="sparse">稀疏</option>
                      <option value="normal">正常</option>
                      <option value="dense">茂密</option>
                    </select>
                  </label>
                  <label>
                    <span>结构</span>
                    <select value={worldGenSettings.structureDensity} onChange={(event) => onSetWorldGenSettings({ ...worldGenSettings, structureDensity: event.target.value as WorldGenSettings['structureDensity'] })}>
                      <option value="none">无</option>
                      <option value="sparse">稀疏</option>
                      <option value="normal">正常</option>
                      <option value="dense">丰富</option>
                    </select>
                  </label>
                  <label>
                    <span>矿物</span>
                    <select value={worldGenSettings.oreDensity} onChange={(event) => onSetWorldGenSettings({ ...worldGenSettings, oreDensity: event.target.value as WorldGenSettings['oreDensity'] })}>
                      <option value="none">无</option>
                      <option value="sparse">稀少</option>
                      <option value="normal">正常</option>
                      <option value="rich">丰富</option>
                    </select>
                  </label>
                  <label>
                    <span>植物</span>
                    <select value={worldGenSettings.plantDensity ?? 'normal'} onChange={(event) => onSetWorldGenSettings({ ...worldGenSettings, plantDensity: event.target.value as WorldGenSettings['plantDensity'] })}>
                      <option value="none">无</option>
                      <option value="sparse">稀疏</option>
                      <option value="normal">正常</option>
                      <option value="lush">繁茂</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="world-settings-section" aria-labelledby="world-advanced-heading">
                <button type="button" className="world-advanced-toggle" onClick={() => onSetShowAdvancedWorldSettings((value) => !value)} aria-expanded={showAdvancedWorldSettings} aria-controls="world-advanced-controls">
                  <span>
                    <strong id="world-advanced-heading">高级世界生成</strong>
                    <small>山地、海洋、河流、群系尺度</small>
                  </span>
                  <iconify-icon icon={showAdvancedWorldSettings ? 'lucide:chevron-up' : 'lucide:chevron-down'} width="16"></iconify-icon>
                </button>
                {showAdvancedWorldSettings && (
                  <div id="world-advanced-controls" className="world-advanced-controls">
                    <label className="slider-label compact">
                      <span>山地强度 <small>{formatUiNumber(worldGenSettings.mountainScale ?? 1, 2)}x</small></span>
                      <input type="range" min={0.4} max={1.8} step={0.05} value={worldGenSettings.mountainScale ?? 1} onChange={(event) => onUpdateWorldGenScale('mountainScale', Number(event.target.value))} />
                    </label>
                    <label className="slider-label compact">
                      <span>海洋比例 <small>{formatUiNumber(worldGenSettings.oceanScale ?? 1, 2)}x</small></span>
                      <input type="range" min={0.5} max={1.8} step={0.05} value={worldGenSettings.oceanScale ?? 1} onChange={(event) => onUpdateWorldGenScale('oceanScale', Number(event.target.value))} />
                    </label>
                    <label className="slider-label compact">
                      <span>河流密度 <small>{formatUiNumber(worldGenSettings.riverScale ?? 1, 2)}x</small></span>
                      <input type="range" min={0.4} max={1.8} step={0.05} value={worldGenSettings.riverScale ?? 1} onChange={(event) => onUpdateWorldGenScale('riverScale', Number(event.target.value))} />
                    </label>
                    <label className="slider-label compact">
                      <span>群系大小 <small>{formatUiNumber(worldGenSettings.biomeScale ?? 1, 2)}x</small></span>
                      <input type="range" min={0.5} max={2.2} step={0.05} value={worldGenSettings.biomeScale ?? 1} onChange={(event) => onUpdateWorldGenScale('biomeScale', Number(event.target.value))} />
                    </label>
                  </div>
                )}
              </section>
            </div>
            <div className="world-create-summary">
              <span>{worldSummary}</span>
              <span>{worldGenSettings.seed == null ? '随机种子' : `种子 ${worldGenSettings.seed}`}</span>
            </div>
            <div className="world-settings-actions">
              <button type="button" className="start-button" onClick={onConfirmStartNewWorld}>
                <iconify-icon icon="lucide:play" width="16"></iconify-icon> 创建并进入
              </button>
              <button type="button" className="back-button" onClick={() => onSetShowWorldSettings(false)}>
                返回
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="world-select-list">
              {saveMetaList.length > 0 ? (
                saveMetaList.map((meta) => (
                  <div key={meta.id} className="world-select-item">
                    <div className="world-select-info">
                      <strong>{meta.name}</strong>
                      <small>{new Date(meta.savedAt).toLocaleString()}</small>
                    </div>
                    <div className="world-select-actions">
                      <button type="button" className="world-play-btn" onClick={() => onLoadGame(meta.id)}><iconify-icon icon="lucide:play" width="14"></iconify-icon> 进入世界</button>
                      <button type="button" className="world-delete-btn" onClick={() => { if (confirm('确定删除此存档？')) onDeleteSave(meta.id); }}><iconify-icon icon="lucide:trash-2" width="14"></iconify-icon> 删除</button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="world-select-empty">还没有存档，创建一个新世界吧</div>
              )}
            </div>
            <button type="button" className="start-button" onClick={onStartNewWorld}>
              <iconify-icon icon="lucide:plus" width="18"></iconify-icon> 创建新世界
            </button>
            <div className="title-controls">
              <div className="title-controls-row">
                <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                <span><iconify-icon icon="lucide:move" width="12"></iconify-icon> 移动</span>
              </div>
              <div className="title-controls-row">
                <kbd>空格</kbd>
                <span><iconify-icon icon="lucide:arrow-up" width="12"></iconify-icon> 跳跃</span>
              </div>
              <div className="title-controls-row">
                <kbd>鼠标</kbd>
                <span><iconify-icon icon="lucide:mouse-pointer-click" width="12"></iconify-icon> 挖掘 / 放置</span>
              </div>
              <div className="title-controls-row">
                <kbd>手柄</kbd>
                <span><iconify-icon icon="lucide:gamepad-2" width="12"></iconify-icon> 摇杆 / LT / RT</span>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
