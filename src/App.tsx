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
} from './game/blocks';
import { useTouchMode } from './mobile/useTouchMode';
import { TouchControls } from './mobile/TouchControls';
import { DesktopInventory } from './ui/DesktopInventory';
import { DesktopPauseMenu } from './ui/DesktopPauseMenu';
import { GameOverlays } from './ui/GameOverlays';
import { Hotbar } from './ui/Hotbar';
import { LoadingScreen } from './ui/LoadingScreen';
import { MobileInventory } from './ui/MobileInventory';
import { MobilePauseMenu } from './ui/MobilePauseMenu';
import { ModelPanel } from './ui/ModelPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { TitleScreen } from './ui/TitleScreen';
import { deleteSaveData, getSaveMetaList, loadSaveData, storeSaveData } from './saveStorage';
import {
  initialHotbarItems,
  inventoryItemLabel,
  type InventoryItem,
} from './ui/inventoryUi';

const directoryInputProps = { webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>;
type Overlay = 'menu' | 'inventory' | 'settings' | 'model' | 'file' | null;
type GameScreen = 'title' | 'loading' | 'game';
type WorldMode = 'infinite' | 'finite' | 'flat';
type LoadingRequest = { type: 'new' } | { type: 'save'; id: string };

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function worldModeOf(settings: WorldGenSettings): WorldMode {
  if (settings.flatWorld) return 'flat';
  return settings.infiniteWorld ?? true ? 'infinite' : 'finite';
}

function densityLabel(value: string | undefined) {
  if (value === 'none') return '无';
  if (value === 'sparse') return '稀疏';
  if (value === 'dense') return '茂密';
  if (value === 'rich') return '丰富';
  if (value === 'lush') return '繁茂';
  return '正常';
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
  const [showTouchFullscreenPrompt, setShowTouchFullscreenPrompt] = useState(false);
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
    gamepadLookSensitivity: 1,
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
    postProcessing: false,
    bloomStrength: 0.18,
    vignette: false,
    vignetteDarkness: 1.0,
    filmGrain: false,
    filmNoise: 0.15,
    filmScanlines: 0.05,
  });
  const [worldGenSettings, setWorldGenSettings] = useState<WorldGenSettings>(defaultWorldGenSettings);
  const [showWorldSettings, setShowWorldSettings] = useState(false);
  const [showAdvancedWorldSettings, setShowAdvancedWorldSettings] = useState(false);
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
      setShowTouchFullscreenPrompt(false);
    } else {
      requestGameLock();
    }
  }

  function enterTouchFullscreen() {
    lockIntentRef.current = true;
    clickPromptRef.current = false;
    setShowClickPrompt(false);
    setShowTouchFullscreenPrompt(false);
    setOverlayState(null);
    gameRef.current?.touchLock();
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

  function closeOverlayAndResume() {
    lockIntentRef.current = true;
    clickPromptRef.current = false;
    setShowClickPrompt(false);
    setShowTouchFullscreenPrompt(false);
    setOverlayState(null);
    if (isTouch) gameRef.current?.touchLock();
    else requestGameLock();
  }

  function startNewWorld() {
    setShowWorldSettings(true);
  }

  function confirmStartNewWorld() {
    loadingRequestRef.current = { type: 'new' };
    pendingSaveRef.current = null;
    currentSaveIdRef.current = null;
    setShowWorldSettings(false);
    setScreen('loading');
    const r = getWorldRadius(worldGenSettings);
    const mode = worldModeOf(worldGenSettings);
    setLoadingProgress({ label: mode === 'finite' ? `准备创建世界 · 半径 ${r} 格` : '准备创建世界 · 区块生成', progress: 0 });
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
    loadingRequestRef.current = { type: 'save', id };
    currentSaveIdRef.current = id;
    setScreen('loading');
    setLoadingProgress({ label: '加载存档 · 读取数据', progress: 0 });
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
    loadingRequestRef.current = null;
    currentSaveIdRef.current = null;
    setShowTouchFullscreenPrompt(false);
    setSaveMetaList(getSaveMetaList());
    setScreen('title');
  }

  const pendingSaveRef = useRef<WorldSaveData | null>(null);
  const loadingRequestRef = useRef<LoadingRequest | null>(null);
  const currentSaveIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (screen !== 'loading' || !mountRef.current) return;
    let cancelled = false;

    async function runLoading() {
      await waitForNextPaint();
      if (cancelled || !mountRef.current) return;

      const loadingRequest = loadingRequestRef.current ?? { type: 'new' as const };
      let effectiveWorldGen = worldGenSettings;

      if (loadingRequest.type === 'save') {
        const data = loadSaveData(loadingRequest.id);
        if (!data) {
          if (!cancelled) setScreen('title');
          return;
        }
        currentSaveIdRef.current = loadingRequest.id;
        pendingSaveRef.current = data;
        setWorldSeed(data.seed);
        if (data.worldGen) {
          effectiveWorldGen = data.worldGen;
          setWorldGenSettings(data.worldGen);
        }
        setLoadingProgress({ label: '加载存档 · 初始化世界', progress: 0.02 });
        await waitForNextPaint();
        if (cancelled || !mountRef.current) return;
      }

      try {
        const createdGame = await createBlockGame(mountRef.current, (nextSnapshot) => {
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
          worldGen: effectiveWorldGen,
          onHotbarStep: (direction) => {
            selectHotbarSlot((activeSlotRef.current + direction + hotbarItemsRef.current.length) % hotbarItemsRef.current.length);
          },
          onPauseRequest: () => {
            lockIntentRef.current = false;
            gameRef.current?.unlockControls();
            setOverlayState('menu');
            setSnapshot((s) => ({ ...s, isLocked: false }));
          },
          onProgress: (label, progress) => {
            if (!cancelled) {
              setLoadingProgress({ label, progress });
            }
          },
        });

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
        loadingRequestRef.current = null;
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

        if (isTouch) {
          lockIntentRef.current = true;
          setOverlayState(null);
          if (document.fullscreenElement) {
            createdGame.touchLock();
          } else {
            setShowTouchFullscreenPrompt(true);
          }
        }
        setScreen('game');
      } catch {
        if (!cancelled) {
          setRendererBackend('webgl');
          setSettings((currentSettings) => ({ ...currentSettings, rendererBackend: 'webgl' }));
          setScreen('title');
        }
      }
    }

    void runLoading();

    return () => {
      cancelled = true;
    };
  }, [screen, rendererBackend]);

  useEffect(() => {
    if (screen === 'game' && gameRef.current) {
      lockIntentRef.current = true;
      if (isTouch) {
        if (!showTouchFullscreenPrompt) gameRef.current.touchLock();
      } else {
        gameRef.current.lockControls();
      }
    }
  }, [screen, isTouch, showTouchFullscreenPrompt]);

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
  const worldMode = worldModeOf(worldGenSettings);
  const finiteWorldRadius = worldGenSettings.worldSizeCustom ?? 80;
  const worldSummary = worldMode === 'flat'
    ? '超平坦测试 · 快速建造'
    : worldMode === 'finite'
      ? `有限世界 · 半径 ${finiteWorldRadius} 格`
      : '无限世界 · 动态区块';
  const densitySummary = `树木 ${densityLabel(worldGenSettings.treeDensity)} · 矿物 ${densityLabel(worldGenSettings.oreDensity)} · 植物 ${densityLabel(worldGenSettings.plantDensity)}`;

  function setWorldMode(mode: WorldMode) {
    setWorldGenSettings({
      ...worldGenSettings,
      flatWorld: mode === 'flat',
      infiniteWorld: mode === 'infinite',
    });
  }

  function updateWorldGenScale(key: 'mountainScale' | 'oceanScale' | 'riverScale' | 'biomeScale', value: number) {
    setWorldGenSettings({ ...worldGenSettings, [key]: value });
  }

  if (screen === 'title') {
    return (
      <TitleScreen
        densitySummary={densitySummary}
        finiteWorldRadius={finiteWorldRadius}
        saveMetaList={saveMetaList}
        showAdvancedWorldSettings={showAdvancedWorldSettings}
        showWorldSettings={showWorldSettings}
        worldGenSettings={worldGenSettings}
        worldMode={worldMode}
        worldSummary={worldSummary}
        onConfirmStartNewWorld={confirmStartNewWorld}
        onDeleteSave={deleteSave}
        onLoadGame={loadGameFromId}
        onSetShowAdvancedWorldSettings={setShowAdvancedWorldSettings}
        onSetShowWorldSettings={setShowWorldSettings}
        onSetWorldGenSettings={setWorldGenSettings}
        onSetWorldMode={setWorldMode}
        onStartNewWorld={startNewWorld}
        onUpdateWorldGenScale={updateWorldGenScale}
      />
    );
  }

  const isLoadingScreen = screen === 'loading';
  const loadingWorldRadius = getWorldRadius(worldGenSettings);
  const loadingWorldMode = worldModeOf(worldGenSettings);

  return (
    <main className={isLoadingScreen ? 'game-shell loading-screen' : 'game-shell'}>
      <div
        ref={mountRef}
        className="game-canvas"
        style={isLoadingScreen ? { position: 'absolute', opacity: 0, pointerEvents: 'none' } : undefined}
        aria-label="可爱的方块世界游戏画面"
        onPointerDown={() => {
          if (overlayRef.current === null && !isLockedRef.current && !snapshot.isDead) {
            canvasClickToLock();
          }
        }}
      />

      {isLoadingScreen && <LoadingScreen loadingProgress={loadingProgress} worldMode={loadingWorldMode} worldRadius={loadingWorldRadius} />}

      {!isLoadingScreen && (
        <>

      <GameOverlays
        heldItemLabel={inventoryItemLabel(heldItem)}
        isNight={isNight}
        showClickPrompt={showClickPrompt}
        showFps={settings.showFps}
        showTouchFullscreenPrompt={showTouchFullscreenPrompt}
        snapshot={snapshot}
        onClickToLock={canvasClickToLock}
        onEnterTouchFullscreen={enterTouchFullscreen}
        onRespawn={() => { gameRef.current?.respawn(); requestGameLock(); }}
      />

      {isTouch && screen === 'game' && overlay === null && !showTouchFullscreenPrompt && snapshot.isLocked && !snapshot.isDead && (
        <TouchControls
          onMove={(x, y) => gameRef.current?.setTouchMove(x, y)}
          onJump={() => gameRef.current?.touchJump()}
          onLook={(dx, dy) => gameRef.current?.setTouchLook(dx, dy)}
          onTap={(x, y) => gameRef.current?.touchTap(x, y)}
          onPlace={(x, y) => gameRef.current?.touchPlace(x, y)}
          onPause={() => { lockIntentRef.current = false; gameRef.current?.unlockControls(); setOverlayState('menu'); setSnapshot(s => ({ ...s, isLocked: false })); }}
        />
      )}

      {isTouch && !snapshot.isDead && overlay === 'menu' && (
        <MobilePauseMenu
          saveStatus={saveStatus}
          onContinue={enterTouchFullscreen}
          onOpenInventory={() => openOverlayPanel('inventory')}
          onOpenSettings={() => openOverlayPanel('settings')}
          onSave={saveGame}
          onImportModel={() => openFilePicker(fileInputRef.current)}
          onImportMmdFolder={() => openFilePicker(folderInputRef.current)}
          onReturnToTitle={returnToTitle}
        />
      )}

      {!isTouch && !snapshot.isLocked && !snapshot.isDead && overlay === 'menu' && (
        <DesktopPauseMenu
          saveStatus={saveStatus}
          onContinue={() => {
            clickPromptRef.current = true;
            setShowClickPrompt(true);
            setOverlayState(null);
          }}
          onImportMmdFolder={() => openFilePicker(folderInputRef.current)}
          onImportModel={() => openFilePicker(fileInputRef.current)}
          onOpenInventory={() => openOverlayPanel('inventory')}
          onOpenSettings={() => openOverlayPanel('settings')}
          onReturnToTitle={returnToTitle}
          onSave={saveGame}
        />
      )}

      <input ref={fileInputRef} className="hidden-file" type="file" accept=".glb,.gltf,.pmx,.pmd,model/gltf-binary,model/gltf+json" onChange={(event) => void importModel(event.target.files?.[0])} />
      <input ref={folderInputRef} className="hidden-file" type="file" multiple {...directoryInputProps} onChange={(event) => void importModelFolder(event.target.files)} />
      <input ref={vmdInputRef} className="hidden-file" type="file" accept=".vmd" onChange={(event) => void importVmd(event.target.files?.[0])} />

      {overlay === 'inventory' && isTouch && (
        <MobileInventory
          activeSlot={activeSlot}
          heldItem={heldItem}
          hotbarItems={hotbarItems}
          modelItems={modelItems}
          onClose={closeOverlayAndResume}
          onPutBlockInActiveSlot={putBlockInActiveSlot}
          onPutModelInActiveSlot={putModelInActiveSlot}
          onSelectHotbarSlot={selectHotbarSlot}
        />
      )}

      {overlay === 'inventory' && !isTouch && (
        <DesktopInventory
          activeSlot={activeSlot}
          heldItem={heldItem}
          hotbarItems={hotbarItems}
          importProgress={importProgress}
          importStatus={importStatus}
          modelItems={modelItems}
          onImportFolder={() => openFilePicker(folderInputRef.current)}
          onImportModel={() => openFilePicker(fileInputRef.current)}
          onPutBlockInActiveSlot={putBlockInActiveSlot}
          onPutModelInActiveSlot={putModelInActiveSlot}
          onReturnToMenu={returnToMenu}
          onSelectHotbarSlot={selectHotbarSlot}
        />
      )}

      {overlay === 'settings' && (
        <SettingsPanel isMobile={isTouch} settings={settings} onReturnToMenu={returnToMenu} onUpdateSetting={updateSetting} />
      )}

      {overlay === 'model' && selectedModel && (
        <ModelPanel
          model={selectedModel}
          onBindVmd={() => openFilePicker(vmdInputRef.current)}
          onDeleteModel={deleteSelectedModel}
          onReturnToGame={requestGameLock}
          onUpdateModelPart={updateModelPart}
          onUpdateModelSetting={updateModelSetting}
        />
      )}

      {(!isTouch || (overlay === null && !showTouchFullscreenPrompt)) && (
        <Hotbar
          activeSlot={activeSlot}
          hotbarItems={hotbarItems}
          isLocked={snapshot.isLocked}
          isTouch={isTouch}
          onOpenInventory={() => openOverlayPanel('inventory')}
          onSelectHotbarSlot={selectHotbarSlot}
        />
      )}

        </>
      )}

    </main>
  );
}
