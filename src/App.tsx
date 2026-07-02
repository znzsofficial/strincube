import {
  Box,
  Cuboid,
  Eye,
  Gauge,
  Hammer,
  Loader,
  Moon,
  MousePointer2,
  Package,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  createBlockGame,
  setWorldSeed,
  type BlockGameApi,
  type GameSettings,
  type GameSnapshot,
  type ImportedModelItem,
  type ModelImportProgress,
  type ModelPartSettings,
  type PlacedModelSettings,
  type WorldGenSettings,
  type WorldSaveData,
  defaultWorldGenSettings,
  getWorldRadius,
} from './game/blockGame';
import {
  type BlockType,
  blockLabels,
  blockIconUrls,
  blockIconTints,
} from './game/blocks';
import { useTouchMode } from './mobile/useTouchMode';
import { TouchControls } from './mobile/TouchControls';

const blockItems = Object.keys(blockLabels) as BlockType[];
const directoryInputProps = { webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>;
type Overlay = 'menu' | 'inventory' | 'settings' | 'model' | 'file' | null;
type GameScreen = 'title' | 'loading' | 'game';
type InventoryItem = { type: 'block'; block: BlockType } | { type: 'model'; model: ImportedModelItem };
const initialHotbarItems: InventoryItem[] = blockItems.slice(0, 9).map((block) => ({ type: 'block', block }));

const SAVE_KEY_PREFIX = 'strincube_save_';

function getSaveMetaList(): { id: string; name: string; savedAt: number }[] {
  const list: { id: string; name: string; savedAt: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key)!) as WorldSaveData;
        list.push({ id: key.replace(SAVE_KEY_PREFIX, ''), name: data.name, savedAt: data.savedAt });
      } catch { /* ignore corrupt saves */ }
    }
  }
  return list.sort((a, b) => b.savedAt - a.savedAt);
}

function loadSaveData(id: string): WorldSaveData | null {
  try {
    const raw = localStorage.getItem(`${SAVE_KEY_PREFIX}${id}`);
    return raw ? JSON.parse(raw) as WorldSaveData : null;
  } catch { return null; }
}

function storeSaveData(id: string, data: WorldSaveData) {
  localStorage.setItem(`${SAVE_KEY_PREFIX}${id}`, JSON.stringify(data));
}

function deleteSaveData(id: string) {
  localStorage.removeItem(`${SAVE_KEY_PREFIX}${id}`);
}

function itemKey(item: InventoryItem) {
  return item.type === 'block' ? `block:${item.block}` : `model:${item.model.id}`;
}

export function App() {
  const isTouch = useTouchMode();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<BlockGameApi | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const vmdInputRef = useRef<HTMLInputElement | null>(null);
  const lockIntentRef = useRef(false);
  const overlayRef = useRef<Overlay>('menu');
  const activeSlotRef = useRef(0);
  const hotbarItemsRef = useRef<InventoryItem[]>(initialHotbarItems);
  const isLockedRef = useRef(false);
  const clickPromptRef = useRef(false);
  const [showClickPrompt, setShowClickPrompt] = useState(false);
  const [screen, setScreen] = useState<GameScreen>('title');
  const [loadingProgress, setLoadingProgress] = useState({ label: '准备中', progress: 0 });
  const [overlay, setOverlay] = useState<Overlay>('menu');
  const [importStatus, setImportStatus] = useState('支持 .glb / .gltf / .pmx / .pmd');
  const [activeSlot, setActiveSlot] = useState(0);
  const [hotbarItems, setHotbarItems] = useState<InventoryItem[]>(initialHotbarItems);
  const [modelItems, setModelItems] = useState<ImportedModelItem[]>([]);
  const [importProgress, setImportProgress] = useState<ModelImportProgress | null>(null);
  const [rendererBackend, setRendererBackend] = useState<GameSettings['rendererBackend']>('webgl');
  const [settings, setSettings] = useState<GameSettings>({
    mouseSensitivity: 1,
    moveSpeed: 5.4,
    daySpeed: 0.004,
    pixelRatio: Math.min(window.devicePixelRatio, 1),
    shadows: true,
    viewDistance: 82,
    modelBrightness: 0.78,
    breakSpeed: 1,
    showFps: false,
    timeOfDay: 0.28,
    infiniteWaterSpread: false,
    rendererBackend: 'webgl',
  });
  const [worldGenSettings, setWorldGenSettings] = useState<WorldGenSettings>(defaultWorldGenSettings);
  const [showWorldSettings, setShowWorldSettings] = useState(false);
  const [saveMetaList, setSaveMetaList] = useState(getSaveMetaList);
  const [saveStatus, setSaveStatus] = useState('');
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    selectedBlock: 'grass',
    blockCount: 0,
    timeOfDay: 0.28,
    creatureCount: 0,
    isLocked: false,
    isDead: false,
    selectedModelName: undefined,
    modelPlacement: undefined,
  });

  function setOverlayState(nextOverlay: Overlay) {
    overlayRef.current = nextOverlay;
    setOverlay(nextOverlay);
  }

  function openFilePicker(input: HTMLInputElement | null) {
    if (!input) return;
    lockIntentRef.current = false;
    setOverlayState('file');
    gameRef.current?.unlockControls();
    input.click();

    window.addEventListener('focus', () => {
      window.setTimeout(() => {
        if (overlayRef.current === 'file') setOverlayState('menu');
      }, 250);
    }, { once: true });
  }

  function requestGameLock() {
    lockIntentRef.current = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    try {
      const lockRequest = gameRef.current?.lockControls();
      void Promise.resolve(lockRequest).catch(() => {
        lockIntentRef.current = false;
        setOverlayState('menu');
      });
    } catch {
      lockIntentRef.current = false;
      setOverlayState('menu');
    }
  }

  function canvasClickToLock() {
    if (isTouch) {
      gameRef.current?.touchLock();
    } else {
      requestGameLock();
    }
  }

  function openOverlayPanel(nextOverlay: Exclude<Overlay, null>) {
    lockIntentRef.current = false;
    setOverlayState(nextOverlay);
    gameRef.current?.unlockControls();
  }

  function returnToMenu() {
    lockIntentRef.current = false;
    setOverlayState('menu');
  }

  function startNewWorld() {
    setShowWorldSettings(true);
  }

  function confirmStartNewWorld() {
    pendingSaveRef.current = null;
    currentSaveIdRef.current = null;
    setShowWorldSettings(false);
    setScreen('loading');
    const r = getWorldRadius(worldGenSettings);
    setLoadingProgress({ label: `准备创建世界 · 半径 ${r} 格`, progress: 0 });
  }

  function saveGame() {
    const game = gameRef.current;
    if (!game) return;
    const now = new Date();
    const id = currentSaveIdRef.current ?? `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existing = currentSaveIdRef.current ? loadSaveData(id) : null;
    const name = existing?.name ?? `存档 ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const data = game.save(name);
    data.hotbar = hotbarItemsRef.current.map(item =>
      item.type === 'block' ? { type: 'block', block: item.block } : { type: 'model', modelId: item.model.id }
    );
    data.activeSlot = activeSlotRef.current;
    storeSaveData(id, data);
    currentSaveIdRef.current = id;
    setSaveMetaList(getSaveMetaList());
    setSaveStatus('已保存');
    window.setTimeout(() => setSaveStatus(''), 2000);
  }

  function loadGameFromId(id: string) {
    const data = loadSaveData(id);
    if (!data) return;
    currentSaveIdRef.current = id;
    setWorldSeed(data.seed);
    if (data.worldGen) setWorldGenSettings(data.worldGen);
    setScreen('loading');
    setLoadingProgress({ label: '加载存档 · 读取数据', progress: 0 });
    pendingSaveRef.current = data;
  }

  function deleteSave(id: string) {
    deleteSaveData(id);
    setSaveMetaList(getSaveMetaList());
  }

  function returnToTitle() {
    if (gameRef.current) {
      gameRef.current.dispose();
      gameRef.current = null;
    }
    pendingSaveRef.current = null;
    currentSaveIdRef.current = null;
    setSaveMetaList(getSaveMetaList());
    setScreen('title');
  }

  const pendingSaveRef = useRef<WorldSaveData | null>(null);
  const currentSaveIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (screen !== 'loading' || !mountRef.current) return;
    let cancelled = false;

    void createBlockGame(mountRef.current, (nextSnapshot) => {
      isLockedRef.current = nextSnapshot.isLocked;
      setSnapshot(nextSnapshot);
      if (nextSnapshot.isLocked) {
        if (lockIntentRef.current || overlayRef.current === null) {
          lockIntentRef.current = false;
          clickPromptRef.current = false;
          setShowClickPrompt(false);
          setOverlayState(null);
        } else {
          gameRef.current?.unlockControls();
        }
      } else if (overlayRef.current === null && !lockIntentRef.current && !clickPromptRef.current) {
        lockIntentRef.current = false;
        setOverlayState('menu');
      }
    }, () => openOverlayPanel('model'), { 
      rendererBackend,
      worldGen: worldGenSettings,
      onProgress: (label, progress) => {
        if (!cancelled) {
          setLoadingProgress({ label, progress });
        }
      },
    }).then((createdGame) => {
      if (cancelled) {
        createdGame.dispose();
        return;
      }
      gameRef.current = createdGame;
      const nextSettings = createdGame.getSettings();
      setRendererBackend(nextSettings.rendererBackend);
      setSettings(nextSettings);

      const pendingSave = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pendingSave) {
        createdGame.load(pendingSave);
        if (pendingSave.hotbar.length > 0) {
          const restored: InventoryItem[] = pendingSave.hotbar.map(item =>
            item.type === 'block' ? { type: 'block', block: item.block } : { type: 'model', model: { id: item.modelId, name: item.modelId, kind: 'generic' } }
          );
          hotbarItemsRef.current = restored;
          setHotbarItems(restored);
          activeSlotRef.current = pendingSave.activeSlot;
          setActiveSlot(pendingSave.activeSlot);
        }
      }

      setScreen('game');
    }).catch(() => {
      if (!cancelled) {
        setRendererBackend('webgl');
        setSettings((currentSettings) => ({ ...currentSettings, rendererBackend: 'webgl' }));
        setScreen('title');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [screen, rendererBackend]);

  useEffect(() => {
    if (screen === 'game' && gameRef.current) {
      lockIntentRef.current = true;
      if (isTouch) {
        gameRef.current.touchLock();
      } else {
        gameRef.current.lockControls();
      }
    }
  }, [screen, isTouch]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;

      const slotNumber = Number(event.key);
      if (slotNumber >= 1 && slotNumber <= 9) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        selectHotbarSlot(slotNumber - 1);
        return;
      }

      if (event.code === 'KeyE') {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (overlayRef.current === 'inventory') {
          requestGameLock();
        } else {
          openOverlayPanel('inventory');
        }
      }

      if (event.code === 'KeyO') {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (overlayRef.current === 'settings') {
          requestGameLock();
        } else {
          openOverlayPanel('settings');
        }
      }

      if (event.code === 'KeyM') {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        openFilePicker(fileInputRef.current);
      }

      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (overlayRef.current === 'menu') {
          clickPromptRef.current = true;
          setShowClickPrompt(true);
          setOverlayState(null);
        } else if (overlayRef.current === null) {
          lockIntentRef.current = false;
          clickPromptRef.current = false;
          setShowClickPrompt(false);
          setOverlayState('menu');
          gameRef.current?.unlockControls();
        }
      }
    }

    function onWheel(event: WheelEvent) {
      if (!isLockedRef.current || overlayRef.current !== null) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 : -1;
      selectHotbarSlot((activeSlotRef.current + direction + hotbarItemsRef.current.length) % hotbarItemsRef.current.length);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  function selectItem(item: InventoryItem) {
    if (item.type === 'model') {
      gameRef.current?.setSelectedModel(item.model.id);
    } else {
      gameRef.current?.setSelectedBlock(item.block);
    }
  }

  function selectHotbarSlot(slot: number) {
    activeSlotRef.current = slot;
    setActiveSlot(slot);
    selectItem(hotbarItemsRef.current[slot]);
  }

  function putBlockInActiveSlot(block: BlockType) {
    putItemInActiveSlot({ type: 'block', block });
  }

  function putModelInActiveSlot(model: ImportedModelItem) {
    putItemInActiveSlot({ type: 'model', model });
  }

  function putItemInActiveSlot(item: InventoryItem) {
    setHotbarItems((currentItems) => {
      const nextItems = [...currentItems];
      nextItems[activeSlotRef.current] = item;
      hotbarItemsRef.current = nextItems;
      return nextItems;
    });
    selectItem(item);
  }

  function addImportedModels(models: ImportedModelItem[]) {
    if (models.length === 0) return;
    setModelItems((currentModels) => [...currentModels, ...models]);
    setHotbarItems((currentItems) => {
      const nextItems = [...currentItems];
      let insertIndex = activeSlotRef.current;
      for (const model of models) {
        const emptyBlockIndex = nextItems.findIndex((item, index) => index !== activeSlotRef.current && item.type === 'block' && item.block === 'grass');
        const targetIndex = nextItems[insertIndex]?.type === 'block' ? insertIndex : emptyBlockIndex;
        if (targetIndex >= 0) {
          nextItems[targetIndex] = { type: 'model', model };
          insertIndex = (targetIndex + 1) % nextItems.length;
        }
      }
      hotbarItemsRef.current = nextItems;
      return nextItems;
    });
    putModelInActiveSlot(models[0]);
  }

  function updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    const next = { ...settings, [key]: value };
    if (key === 'rendererBackend') {
      setRendererBackend(value as GameSettings['rendererBackend']);
      setSettings(next);
      gameRef.current?.unlockControls();
      return;
    }
    setSettings(next);
    gameRef.current?.updateSettings({ [key]: value });
  }

  function updateModelSetting<K extends keyof Omit<PlacedModelSettings, 'id' | 'name'>>(key: K, value: PlacedModelSettings[K]) {
    gameRef.current?.updateSelectedPlacedModel({ [key]: value });
  }

  function updateModelPart<K extends keyof Omit<ModelPartSettings, 'id' | 'name'>>(partId: string, key: K, value: ModelPartSettings[K]) {
    gameRef.current?.updateSelectedModelPart(partId, { [key]: value });
  }

  function deleteSelectedModel() {
    gameRef.current?.deleteSelectedPlacedModel();
    returnToMenu();
  }

  function itemIconClass(block: BlockType, size = '') {
    return `item-icon${size ? ` ${size}` : ''}${block === 'shortGrass' ? ' plant-grass-icon' : ''}${block === 'tnt' ? ' tnt-icon' : ''}`;
  }

  function itemIconStyle(block: BlockType) {
    const texture = blockIconUrls[block];
    const tint = blockIconTints[block];
    if (!texture && !tint) return undefined;
    const style: Record<string, string> = {};
    if (texture) style['--item-texture'] = `url(${texture})`;
    if (tint) { style['--item-tint'] = tint; style['--item-blend'] = 'multiply'; }
    return style as React.CSSProperties;
  }

  function inventoryItemLabel(item: InventoryItem) {
    return item.type === 'model' ? item.model.name : blockLabels[item.block];
  }

  function inventoryItemIcon(item: InventoryItem, size = '') {
    if (item.type === 'model') return <span className={`model-item-icon${size ? ` ${size}` : ''}`}><UserRound size={size === 'large' ? 20 : 16} aria-hidden="true" /></span>;
    return <span className={itemIconClass(item.block, size)} style={itemIconStyle(item.block)} />;
  }

  async function importModel(file: File | undefined) {
    if (!file || !gameRef.current) return;
    if (!file.name.match(/\.(glb|gltf|pmx|pmd)$/i)) {
      setImportStatus('请选择 .glb / .gltf / .pmx / .pmd');
      return;
    }

    setImportStatus(`导入中：${file.name}`);
    setImportProgress({ progress: 0.02, label: '开始导入', fileName: file.name });
    try {
      const models = await gameRef.current.importModelFile(file, { onProgress: setImportProgress });
      addImportedModels(models);
      setImportStatus(`已加入物品栏：${models.map((model) => model.name).join('、')}`);
      window.setTimeout(() => setImportProgress(null), 650);
    } catch {
      setImportStatus('导入失败，检查模型和贴图路径');
      setImportProgress(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (overlayRef.current === 'file') setOverlayState('menu');
    }
  }

  async function importModelFolder(files: FileList | null) {
    if (!files || !gameRef.current) return;
    const fileArray = Array.from(files);
    setImportStatus(`导入文件夹：${fileArray.length} 个文件`);
    setImportProgress({ progress: 0.02, label: '扫描文件夹' });
    try {
      const models = await gameRef.current.importModelFiles(fileArray, { onProgress: setImportProgress });
      addImportedModels(models);
      setImportStatus(`已加入 ${models.length} 个 MMD 模型`);
      window.setTimeout(() => setImportProgress(null), 650);
    } catch {
      setImportStatus('文件夹导入失败，检查是否包含 PMX/PMD');
      setImportProgress(null);
    } finally {
      if (folderInputRef.current) folderInputRef.current.value = '';
      if (overlayRef.current === 'file') setOverlayState('menu');
    }
  }

  async function importVmd(file: File | undefined) {
    if (!file || !gameRef.current) return;
    if (!file.name.match(/\.vmd$/i)) {
      setImportStatus('请选择 .vmd 动作文件');
      return;
    }

    setImportStatus(`导入动作：${file.name}`);
    try {
      await gameRef.current.importVmdForSelectedModel(file);
      setImportStatus(`已绑定动作：${file.name}`);
    } catch {
      setImportStatus('VMD 绑定失败，请先选中一个 PMX/MMD 模型');
    } finally {
      if (vmdInputRef.current) vmdInputRef.current.value = '';
    }
  }

  const isNight = snapshot.timeOfDay > 0.58;
  const heldItem = hotbarItems[activeSlot];
  const selectedModel = snapshot.selectedModelSettings;
  const modelHealthPercent = selectedModel ? Math.max(0, Math.min(100, (selectedModel.health / selectedModel.maxHealth) * 100)) : 0;

  function formatUiNumber(value: number, digits = 1) {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }

  if (screen === 'title') {
    return (
      <main className="game-shell title-screen">
        <div className="title-content">
          <div className="title-logo">
            <Cuboid size={52} className="title-icon" />
          </div>
          <h1>StrinCube</h1>
          <p className="title-subtitle">一个可爱的方块世界</p>
          {showWorldSettings ? (
            <div className="world-settings">
              <h3>创建新世界</h3>
              <div className="world-settings-grid">
                <label className="slider-label">
                  <span>世界大小 <small>{worldGenSettings.worldSizeCustom ?? 80} 格半径</small></span>
                  <input
                    type="range"
                    min={30}
                    max={200}
                    step={10}
                    value={worldGenSettings.worldSizeCustom ?? 80}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const preset: WorldGenSettings['worldSize'] = v <= 50 ? 'small' : v <= 100 ? 'medium' : v <= 150 ? 'large' : 'huge';
                      setWorldGenSettings({ ...worldGenSettings, worldSizeCustom: v, worldSize: preset });
                    }}
                  />
                  <div className="slider-marks">
                    <span>小</span><span>中</span><span>大</span><span>巨大</span>
                  </div>
                </label>
                <label>
                  <span>世界种子</span>
                  <input
                    type="text"
                    className="seed-input"
                    placeholder="留空则随机"
                    value={worldGenSettings.seed ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setWorldGenSettings({ ...worldGenSettings, seed: raw ? Number(raw) || undefined : undefined });
                    }}
                  />
                </label>
                <label>
                  <span>树木密度</span>
                  <select value={worldGenSettings.treeDensity} onChange={(e) => setWorldGenSettings({ ...worldGenSettings, treeDensity: e.target.value as WorldGenSettings['treeDensity'] })}>
                    <option value="none">无</option>
                    <option value="sparse">稀疏</option>
                    <option value="normal">正常</option>
                    <option value="dense">茂密</option>
                  </select>
                </label>
                <label>
                  <span>结构密度</span>
                  <select value={worldGenSettings.structureDensity} onChange={(e) => setWorldGenSettings({ ...worldGenSettings, structureDensity: e.target.value as WorldGenSettings['structureDensity'] })}>
                    <option value="none">无</option>
                    <option value="sparse">稀疏</option>
                    <option value="normal">正常</option>
                    <option value="dense">丰富</option>
                  </select>
                </label>
                <label>
                  <span>矿物密度</span>
                  <select value={worldGenSettings.oreDensity} onChange={(e) => setWorldGenSettings({ ...worldGenSettings, oreDensity: e.target.value as WorldGenSettings['oreDensity'] })}>
                    <option value="none">无</option>
                    <option value="sparse">稀少</option>
                    <option value="normal">正常</option>
                    <option value="rich">丰富</option>
                  </select>
                </label>
                <label>
                  <span>植物密度</span>
                  <select value={worldGenSettings.plantDensity ?? 'normal'} onChange={(e) => setWorldGenSettings({ ...worldGenSettings, plantDensity: e.target.value as WorldGenSettings['plantDensity'] })}>
                    <option value="none">无</option>
                    <option value="sparse">稀疏</option>
                    <option value="normal">正常</option>
                    <option value="lush">繁茂</option>
                  </select>
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={worldGenSettings.flatWorld} onChange={(e) => setWorldGenSettings({ ...worldGenSettings, flatWorld: e.target.checked })} />
                  <span>超平坦世界</span>
                </label>
              </div>
              <div className="world-settings-actions">
                <button type="button" className="start-button" onClick={confirmStartNewWorld}>
                  <iconify-icon icon="lucide:play" width="16"></iconify-icon> 创建并进入
                </button>
                <button type="button" className="back-button" onClick={() => setShowWorldSettings(false)}>
                  返回
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="world-select-list">
                {saveMetaList.length > 0 ? (
                  saveMetaList.map(meta => (
                    <div key={meta.id} className="world-select-item">
                      <div className="world-select-info">
                        <strong>{meta.name}</strong>
                        <small>{new Date(meta.savedAt).toLocaleString()}</small>
                      </div>
                      <div className="world-select-actions">
                        <button type="button" className="world-play-btn" onClick={() => loadGameFromId(meta.id)}><iconify-icon icon="lucide:play" width="14"></iconify-icon> 进入世界</button>
                        <button type="button" className="world-delete-btn" onClick={() => { if (confirm('确定删除此存档？')) deleteSave(meta.id); }}><iconify-icon icon="lucide:trash-2" width="14"></iconify-icon> 删除</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="world-select-empty">还没有存档，创建一个新世界吧</div>
                )}
              </div>
              <button type="button" className="start-button" onClick={startNewWorld}>
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
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  if (screen === 'loading') {
    const isLoadingSave = loadingProgress.label === '加载存档' || loadingProgress.label.startsWith('加载');
    const worldRadius = getWorldRadius(worldGenSettings);
    return (
      <main className="game-shell loading-screen">
        <div ref={mountRef} className="game-canvas" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
        <div className="loading-content">
          <div className="loading-icon">
            <Loader size={36} className="loading-spinner" />
          </div>
          <h2>{isLoadingSave ? '正在加载存档' : '正在创建世界'}</h2>
          <p className="loading-label">{loadingProgress.label}</p>
          <div className="loading-bar">
            <div 
              className="loading-bar-fill" 
              style={{ width: `${Math.round(loadingProgress.progress * 100)}%` }}
            />
          </div>
          <span className="loading-percent">{Math.round(loadingProgress.progress * 100)}%</span>
          {!isLoadingSave && <p className="loading-hint">世界半径 {worldRadius} 格 · 约 {((worldRadius * 2 + 1) * (worldRadius * 2 + 1) / 1000).toFixed(0)}k 个区块</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <div
        ref={mountRef}
        className="game-canvas"
        aria-label="可爱的方块世界游戏画面"
        onPointerDown={() => {
          if (overlayRef.current === null && !isLockedRef.current && !snapshot.isDead) {
            canvasClickToLock();
          }
        }}
      />

      {snapshot.contextLost && (
        <div className="context-lost-overlay">
          <iconify-icon icon="lucide:alert-triangle" width="48"></iconify-icon>
          <h2>渲染上下文丢失</h2>
          <p>显卡内存可能不足，请减少放置的模型数量后刷新页面。</p>
          <button type="button" onClick={() => location.reload()}>
            <iconify-icon icon="lucide:refresh-cw" width="16"></iconify-icon> 刷新页面
          </button>
        </div>
      )}

      {showClickPrompt && !snapshot.isDead && (
        <div className="click-prompt" onClick={canvasClickToLock} onPointerDown={(e) => e.stopPropagation()}>
          <MousePointer2 size={28} aria-hidden="true" />
          <p>点击画面继续</p>
        </div>
      )}

      {isTouch && screen === 'game' && snapshot.isLocked && !snapshot.isDead && (
        <TouchControls
          onMove={(x, y) => gameRef.current?.setTouchMove(x, y)}
          onJump={() => gameRef.current?.touchJump()}
          onLook={(dx, dy) => gameRef.current?.setTouchLook(dx, dy)}
          onTap={(x, y) => gameRef.current?.touchTap(x, y)}
          onPlace={(x, y) => gameRef.current?.touchPlace(x, y)}
          onPause={() => { lockIntentRef.current = false; gameRef.current?.unlockControls(); setOverlayState('menu'); setSnapshot(s => ({ ...s, isLocked: false })); }}
        />
      )}

      {!snapshot.isLocked && !snapshot.isDead && overlay === 'menu' && (
        <section className="pause-menu" aria-label="暂停菜单">
          <Cuboid size={34} aria-hidden="true" />
          <h1>StrinCube</h1>
          <button type="button" onClick={() => {
            clickPromptRef.current = true;
            setShowClickPrompt(true);
            setOverlayState(null);
          }}><iconify-icon icon="lucide:play" width="16"></iconify-icon> 回到游戏</button>
          <button type="button" onClick={() => openOverlayPanel('inventory')}><iconify-icon icon="lucide:package" width="16"></iconify-icon> 背包</button>
          <button type="button" onClick={() => openOverlayPanel('settings')}><iconify-icon icon="lucide:settings" width="16"></iconify-icon> 设置</button>
          <button type="button" onClick={saveGame}><iconify-icon icon="lucide:save" width="16"></iconify-icon> 保存游戏</button>
          {saveStatus && <p className="save-status">{saveStatus}</p>}
          <button type="button" onClick={() => openFilePicker(fileInputRef.current)}><iconify-icon icon="lucide:upload" width="16"></iconify-icon> 导入模型</button>
          <button type="button" onClick={() => openFilePicker(folderInputRef.current)}><iconify-icon icon="lucide:folder-open" width="16"></iconify-icon> 导入 MMD 文件夹</button>
          <button type="button" className="back-button" onClick={returnToTitle}><iconify-icon icon="lucide:log-out" width="16"></iconify-icon> 返回主菜单</button>
          <p>Esc 菜单，E 背包，O 设置，M 导入模型，选中模型后靠近按 F</p>
        </section>
      )}

      {snapshot.isLocked && !snapshot.isDead && <div className="crosshair" aria-hidden="true" />}

      {snapshot.isDead && (
        <div className="death-screen">
          <h2>你死了</h2>
          <p>坠入虚空</p>
          <button type="button" className="start-button" onClick={() => { gameRef.current?.respawn(); requestGameLock(); }}>重生</button>
        </div>
      )}

      <section className="hud top-right" aria-label="昼夜">
        <span>{isNight ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />} {isNight ? '梦蓝夜晚' : '晴朗白天'}</span>
      </section>

      {settings.showFps && snapshot.fps !== undefined && (
        <section className="hud top-left fps-hud" aria-label="帧数">
          <span>{snapshot.fps} FPS</span>
        </section>
      )}

      <input ref={fileInputRef} className="hidden-file" type="file" accept=".glb,.gltf,.pmx,.pmd,model/gltf-binary,model/gltf+json" onChange={(event) => void importModel(event.target.files?.[0])} />
      <input ref={folderInputRef} className="hidden-file" type="file" multiple {...directoryInputProps} onChange={(event) => void importModelFolder(event.target.files)} />
      <input ref={vmdInputRef} className="hidden-file" type="file" accept=".vmd" onChange={(event) => void importVmd(event.target.files?.[0])} />

      {overlay === 'inventory' && (
        <section className="side-panel inventory-panel mc-inventory" aria-label="背包">
          <header><Package size={18} aria-hidden="true" /> 创造模式物品栏</header>
          <div className="inventory-selected">
            {inventoryItemIcon(heldItem, 'large')}
            <strong>{inventoryItemLabel(heldItem)}</strong>
            <span>点击物品会放入当前热栏槽 {activeSlot + 1}</span>
          </div>
          <div className="inventory-grid">
            {blockItems.map((block, index) => (
              <button key={block} type="button" className={heldItem.type === 'block' && heldItem.block === block ? 'inventory-item active' : 'inventory-item'} title={blockLabels[block]} aria-label={`${blockLabels[block]}，放入热栏 ${activeSlot + 1}`} onClick={() => putBlockInActiveSlot(block)}>
                <span className={itemIconClass(block, 'large')} style={itemIconStyle(block)} />
                <small>{hotbarItems.some((item) => item.type === 'block' && item.block === block) ? '•' : index + 1}</small>
              </button>
            ))}
            {modelItems.map((model) => (
              <button key={model.id} type="button" className={heldItem.type === 'model' && heldItem.model.id === model.id ? 'inventory-item model active' : 'inventory-item model'} title={model.name} aria-label={`${model.name}，放入热栏 ${activeSlot + 1}`} onClick={() => putModelInActiveSlot(model)}>
                <span className="model-item-icon large"><UserRound size={20} aria-hidden="true" /></span>
                <small>M</small>
              </button>
            ))}
          </div>
          <div className="inventory-hotbar" aria-label="当前热栏">
            {hotbarItems.map((item, index) => (
              <button key={`${itemKey(item)}-inventory-${index}`} type="button" className={activeSlot === index ? 'inventory-hotbar-slot active' : 'inventory-hotbar-slot'} title={`${index + 1}: ${inventoryItemLabel(item)}`} onClick={() => selectHotbarSlot(index)}>
                {inventoryItemIcon(item)}
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
          <p>{importStatus}</p>
          {importProgress && (
            <div className="import-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(importProgress.progress * 100)}>
              <div className="import-progress-track"><span style={{ width: `${Math.round(importProgress.progress * 100)}%` }} /></div>
              <strong>{Math.round(importProgress.progress * 100)}%</strong>
              <span>{importProgress.fileName ? `${importProgress.label}：${importProgress.fileName}` : importProgress.label}</span>
            </div>
          )}
          <div className="inventory-actions">
            <button type="button" className="panel-command" onClick={() => openFilePicker(fileInputRef.current)}>导入模型</button>
            <button type="button" className="panel-command" onClick={() => openFilePicker(folderInputRef.current)}>导入 MMD 文件夹</button>
            <button type="button" className="panel-command" onClick={returnToMenu}>返回菜单</button>
          </div>
        </section>
      )}

      {overlay === 'settings' && (
        <section className="side-panel settings-panel" aria-label="设置">
          <header><Settings size={18} aria-hidden="true" /> 设置</header>
          <label><Cuboid size={15} aria-hidden="true" /> 渲染后端 <select value={settings.rendererBackend} onChange={(event) => updateSetting('rendererBackend', event.target.value as GameSettings['rendererBackend'])}><option value="webgl">WebGL 稳定</option><option value="webgpu">WebGPU 实验性</option></select></label>
          <label><Gauge size={15} aria-hidden="true" /> 鼠标灵敏度 <input type="range" min="0.4" max="2.4" step="0.1" value={settings.mouseSensitivity} onChange={(event) => updateSetting('mouseSensitivity', Number(event.target.value))} /></label>
          <label><UserRound size={15} aria-hidden="true" /> 移动速度 <input type="range" min="3" max="9" step="0.2" value={settings.moveSpeed} onChange={(event) => updateSetting('moveSpeed', Number(event.target.value))} /></label>
          <label><Hammer size={15} aria-hidden="true" /> 挖掘速度 <input type="range" min="0.5" max="5" step="0.25" value={settings.breakSpeed} onChange={(event) => updateSetting('breakSpeed', Number(event.target.value))} /></label>
          <label><Sun size={15} aria-hidden="true" /> 昼夜速度 <input type="range" min="0" max="0.012" step="0.001" value={settings.daySpeed} onChange={(event) => updateSetting('daySpeed', Number(event.target.value))} /></label>
          <label><Moon size={15} aria-hidden="true" /> 当前时间 <input type="range" min="0" max="1" step="0.01" value={settings.timeOfDay} onChange={(event) => updateSetting('timeOfDay', Number(event.target.value))} /> {Math.round(settings.timeOfDay * 24)}:00</label>
          <label><Eye size={15} aria-hidden="true" /> 视距 <input type="range" min="32" max="110" step="2" value={settings.viewDistance} onChange={(event) => updateSetting('viewDistance', Number(event.target.value))} /></label>
          <label><Box size={15} aria-hidden="true" /> 渲染倍率 <input type="range" min="0.75" max="2" step="0.05" value={settings.pixelRatio} onChange={(event) => updateSetting('pixelRatio', Number(event.target.value))} /></label>
          <label><Cuboid size={15} aria-hidden="true" /> 模型亮度 <input type="range" min="0.35" max="1.25" step="0.05" value={settings.modelBrightness} onChange={(event) => updateSetting('modelBrightness', Number(event.target.value))} /></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.shadows} onChange={(event) => updateSetting('shadows', event.target.checked)} /> 阴影</label>
          <label className="toggle-row"><input type="checkbox" checked={settings.showFps} onChange={(event) => updateSetting('showFps', event.target.checked)} /> 显示帧数</label>
          <label className="toggle-row"><input type="checkbox" checked={settings.infiniteWaterSpread} onChange={(event) => updateSetting('infiniteWaterSpread', event.target.checked)} /> 水流无限蔓延</label>
          <button type="button" className="panel-command" onClick={returnToMenu}>返回菜单</button>
        </section>
      )}

      {overlay === 'model' && selectedModel && (
        <section className="side-panel settings-panel model-panel" aria-label="模型设置">
          <header><UserRound size={18} aria-hidden="true" /> 模型设置</header>
          <div className="model-card">
            <div className="model-card-icon"><UserRound size={22} aria-hidden="true" /></div>
            <div className="model-card-copy">
              <strong>{selectedModel.name}</strong>
              <span>{selectedModel.vmdName ? `VMD：${selectedModel.vmdName}` : '未绑定 VMD 动作'}</span>
            </div>
          </div>
          <div className="model-health-card">
            <div><span>生命</span><strong>{Math.round(selectedModel.health)} / {Math.round(selectedModel.maxHealth)}</strong></div>
            <div className="model-health-track"><span style={{ width: `${modelHealthPercent}%` }} /></div>
          </div>
          <div className="control-cluster"><span>核心</span>
            <label>最大生命 <b>{Math.round(selectedModel.maxHealth)}</b><input type="range" min="5" max="300" step="5" value={selectedModel.maxHealth} onChange={(event) => updateModelSetting('maxHealth', Number(event.target.value))} /></label>
            <label>旋转 <b>{Math.round(selectedModel.rotation / Math.PI * 180)}°</b><input type="range" min="0" max={Math.PI * 2} step="0.05" value={selectedModel.rotation} onChange={(event) => updateModelSetting('rotation', Number(event.target.value))} /></label>
            <label>缩放 <b>{Math.round(selectedModel.scale * 100)}%</b><input type="range" min="0.15" max="4" step="0.05" value={selectedModel.scale} onChange={(event) => updateModelSetting('scale', Number(event.target.value))} /></label>
          </div>
          <div className="control-cluster"><span>位置</span>
            <label>X 偏移 <b>{formatUiNumber(selectedModel.offsetX)}</b><input type="range" min="-8" max="8" step="0.1" value={selectedModel.offsetX} onChange={(event) => updateModelSetting('offsetX', Number(event.target.value))} /></label>
            <label>Y 偏移 <b>{formatUiNumber(selectedModel.offsetY)}</b><input type="range" min="-8" max="8" step="0.1" value={selectedModel.offsetY} onChange={(event) => updateModelSetting('offsetY', Number(event.target.value))} /></label>
            <label>Z 偏移 <b>{formatUiNumber(selectedModel.offsetZ)}</b><input type="range" min="-8" max="8" step="0.1" value={selectedModel.offsetZ} onChange={(event) => updateModelSetting('offsetZ', Number(event.target.value))} /></label>
          </div>
          <div className="control-cluster"><span>显示</span>
            <label>亮度 <b>{Math.round(selectedModel.brightness * 100)}%</b><input type="range" min="0.2" max="2" step="0.05" value={selectedModel.brightness} onChange={(event) => updateModelSetting('brightness', Number(event.target.value))} /></label>
            <label>透明度 <b>{Math.round(selectedModel.opacity * 100)}%</b><input type="range" min="0.15" max="1" step="0.05" value={selectedModel.opacity} onChange={(event) => updateModelSetting('opacity', Number(event.target.value))} /></label>
            <label>动画 <select value={selectedModel.animation} onChange={(event) => updateModelSetting('animation', event.target.value as PlacedModelSettings['animation'])}><option value="none">关闭</option><option value="idle">待机呼吸</option><option value="spin">慢转</option><option value="lookAtPlayer">看向玩家</option></select></label>
            <label>动画速度 <b>{formatUiNumber(selectedModel.animationSpeed)}</b><input type="range" min="0" max="3" step="0.05" value={selectedModel.animationSpeed} onChange={(event) => updateModelSetting('animationSpeed', Number(event.target.value))} /></label>
            <label>动画距离 <b>{Math.round(selectedModel.animationDistance)}</b><input type="range" min="8" max="120" step="2" value={selectedModel.animationDistance} onChange={(event) => updateModelSetting('animationDistance', Number(event.target.value))} /></label>
          </div>
          <div className="model-parts-panel"><span>部件管理</span>
            {selectedModel.parts.length === 0 && <small>这个模型没有可分离的材质部件</small>}
            {selectedModel.parts.map((part) => (
              <div className="model-part-row" key={part.id}>
                <label className="toggle-row"><input type="checkbox" checked={part.visible} onChange={(event) => updateModelPart(part.id, 'visible', event.target.checked)} /> <span title={part.name}>{part.name}</span></label>
                <label>透明度 <b>{Math.round(part.opacity * 100)}%</b><input type="range" min="0" max="1" step="0.05" value={part.opacity} onChange={(event) => updateModelPart(part.id, 'opacity', Number(event.target.value))} /></label>
              </div>
            ))}
          </div>
          <div className="model-toggle-grid">
            <label className="toggle-row"><input type="checkbox" checked={selectedModel.vmdPlaying} disabled={!selectedModel.vmdName} onChange={(event) => updateModelSetting('vmdPlaying', event.target.checked)} /> 播放 VMD</label>
            <label className="toggle-row"><input type="checkbox" checked={selectedModel.visible} onChange={(event) => updateModelSetting('visible', event.target.checked)} /> 可见</label>
            <label className="toggle-row"><input type="checkbox" checked={selectedModel.shadows} onChange={(event) => updateModelSetting('shadows', event.target.checked)} /> 模型阴影</label>
            <label className="toggle-row"><input type="checkbox" checked={selectedModel.damageable} onChange={(event) => updateModelSetting('damageable', event.target.checked)} /> 可受伤</label>
          </div>
          <div className="model-actions">
            <button type="button" className="panel-command" onClick={() => openFilePicker(vmdInputRef.current)}>绑定 VMD 动作</button>
            <button type="button" className="panel-command danger" onClick={deleteSelectedModel}>删除模型</button>
            <button type="button" className="panel-command" onClick={requestGameLock}>返回游戏</button>
          </div>
        </section>
      )}

      {snapshot.isLocked && <div className="held-name" aria-live="polite">{inventoryItemLabel(heldItem)}</div>}
      {snapshot.isLocked && snapshot.selectedModelName && (
        <section className="model-edit-status" aria-label="模型编辑状态">
          <strong>{snapshot.selectedModelName}</strong>
          {snapshot.modelPlacement && <span>R {Math.round(snapshot.modelPlacement.rotation / Math.PI * 180)}° · [{Math.round(snapshot.modelPlacement.scale * 100)}%]</span>}
          {!snapshot.modelPlacement && <span>{snapshot.canOpenModelMenu ? 'F 设置 · Delete 删除' : '靠近后按 F 设置'}</span>}
        </section>
      )}

      <section className="hotbar" aria-label="快捷物品栏">
        {hotbarItems.map((item, index) => (
          <button
            key={`${itemKey(item)}-${index}`}
            type="button"
            className={activeSlot === index ? 'slot active' : 'slot'}
            style={item.type === 'block' ? itemIconStyle(item.block) : undefined}
            aria-label={`${index + 1}: ${inventoryItemLabel(item)}`}
            disabled={!snapshot.isLocked}
            onClick={() => selectHotbarSlot(index)}
          >
            {inventoryItemIcon(item)}
            <span>{index + 1}</span>
          </button>
        ))}
      </section>

    </main>
  );
}
