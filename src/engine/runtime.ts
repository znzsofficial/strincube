import * as THREE from 'three';
import type { BlockType } from './blocks';
import { type BlockGameApi, type BlockGameOptions, type GameSnapshot, type WorldSaveData } from './types';
import { GameSession } from './core/session';
import { validateWorldSave } from './saveValidation';
import { EYE } from './core/player';
import { submergedDepth } from './core/immersion';
import { raycast, type VoxelHit } from './core/raycast';
import { isPlant, SEA } from './core/voxel';
import { Input } from './input';
import { GameScene } from './render/scene';
import type { RuntimeView } from './render/runtimeView';
import type { GameSettings } from './types';
import { ChunkRenderer } from './render/chunks';
import { AmbientEntities } from './render/entities';
import { BlockFeedback } from './render/blockFeedback';
import { ModelSystem } from './modelSystem';
import { TerrainWorkerSource } from './workers/terrainSource';
import { FrameDiagnostics } from './diagnostics';

export type RuntimeOptions = BlockGameOptions & {
  initialSave?: WorldSaveData;
  signal?: AbortSignal;
  viewFactory?: (mount: HTMLElement, settings: GameSettings, signal?: AbortSignal) => Promise<RuntimeView>;
};

export async function createGame(
  mount: HTMLElement,
  onSnapshot: (s: GameSnapshot) => void,
  onModelMenu?: () => void,
  options: RuntimeOptions = {},
): Promise<BlockGameApi> {
  options.signal?.throwIfAborted();
  const save = options.initialSave;
  if (save !== undefined) validateWorldSave(save);
  const seed = save?.seed ?? options.worldGen?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  const session = new GameSession({
    seed,
    worldGen: save?.worldGen ?? options.worldGen,
    state: save?.engineData,
    settings: save?.settings,
    timeOfDay: save?.timeOfDay,
    pixelRatio: window.devicePixelRatio,
    terrainSource: (generator) => new TerrainWorkerSource(generator),
  });
  const { world, stream, simulation, player, settings } = session;
  const generator = world.generator;
  const diagnostics = new FrameDiagnostics();
  const diagnosticEvents = new AbortController();
  let visibilityChanged = false;
  document.addEventListener(
    'visibilitychange',
    () => {
      visibilityChanged = true;
    },
    { signal: diagnosticEvents.signal },
  );
  let view: RuntimeView | undefined,
    meshes: ChunkRenderer | undefined,
    input: Input | undefined,
    models: ModelSystem | undefined,
    feedback: BlockFeedback | undefined,
    ambient: AmbientEntities | undefined;
  let disposed = false,
    raf = 0,
    selectedBlock: BlockType = 'grass',
    selectedModel: string | null = null;
  const direction = new THREE.Vector3(),
    raycaster = new THREE.Raycaster();
  const selectionBox = new THREE.BoxGeometry(1.005, 1.005, 1.005);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(selectionBox),
    new THREE.LineBasicMaterial({ color: 0xfff3c4 }),
  );
  selectionBox.dispose();
  let target: VoxelHit | null = null;
  const emit = () => {
    if (disposed || !models || !input) return;
    const p = player.state,
      c = generator.column(Math.round(p.x), Math.round(p.z));
    const selected = models.selectedSettings;
    const perf = settings.showFps ? diagnostics.snapshot() : undefined;
    if (perf && meshes) perf.meshExecution = { mode: meshes.mode, fallback: meshes.fallback };
    onSnapshot({
      selectedBlock,
      blockCount: world.blockCount,
      timeOfDay: session.timeOfDay,
      creatureCount: ambient?.count ?? 0,
      isLocked: input.active,
      isDead: player.dead,
      fps: perf?.fps == null ? undefined : Math.round(perf.fps),
      performance: perf,
      contextLost: view?.contextLost,
      selectedModelName: selected?.name ?? models.items.find((m) => m.id === selectedModel)?.name,
      canOpenModelMenu: !!selected,
      selectedModelSettings: selected,
      modelPlacement: selectedModel ? models.placement : undefined,
      worldDebug: settings.showFps
        ? {
            x: Math.round(p.x),
            y: Math.round(p.y),
            z: Math.round(p.z),
            height: c.height,
            biome: c.biome,
            baseBiome: c.biome,
            temperature: c.temperature,
            humidity: c.humidity,
            continentalness: c.continentalness,
            erosion: 0,
            ridge: 0,
            oceanDepth: c.water !== null ? SEA - c.height : 0,
            lakeDepth: 0,
            lakeBank: false,
            river: c.river,
            riverBank: false,
            riverSource: generator.version,
          }
        : undefined,
    });
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    diagnosticEvents.abort();
    input?.dispose();
    ambient?.dispose();
    feedback?.dispose();
    models?.dispose();
    meshes?.dispose();
    outline.geometry.dispose();
    (outline.material as THREE.Material).dispose();
    view?.dispose();
    session.dispose();
  };
  try {
    options.onProgress?.(save ? '加载存档 · 初始化新版世界' : '创建世界 · 寻找安全陆地', 0.03);
    await stream.prepare(
      player.state.x,
      player.state.z,
      2,
      (done, total) =>
        options.onProgress?.(
          `${save ? '恢复' : '生成'}出生区块 · ${done}/${total}`,
          0.05 + (0.6 * done) / total,
        ),
      options.signal,
    );
    options.signal?.throwIfAborted();
    view = options.viewFactory ? await options.viewFactory(mount, settings, options.signal) : new GameScene(mount, settings);
    options.signal?.throwIfAborted();
    meshes = new ChunkRenderer(world, view.scene);
    meshes.updateShadows(settings.shadows);
    input = new Input(view.canvas);
    models = new ModelSystem(view.scene, settings, () => {
      view?.invalidateShadows();
      emit();
    });
    input.onChange = emit;
    input.onPause = () => options.onPauseRequest?.();
    input.onHotbar = (d) => options.onHotbarStep?.(d);
    input.sensitivity = settings.mouseSensitivity;
    input.gamepadSensitivity = settings.gamepadLookSensitivity;
    view.scene.add(outline);
    outline.visible = false;
    const total = world.loadedCount;
    while (world.dirty.size || meshes.pending) {
      options.signal?.throwIfAborted();
      if (view.error) throw view.error;
      meshes.flush(2);
      if (meshes.error) throw meshes.error;
      const built = meshes.metrics.published;
      options.onProgress?.(
        `构建画面 · ${Math.min(built, total)}/${total}`,
        0.65 + 0.2 * Math.min(1, built / Math.max(1, total)),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (save?.engineData)
      await models.restore(save.engineData.assets, save.engineData.placements, (label) =>
        options.onProgress?.(label, 0.88),
      );
    options.signal?.throwIfAborted();
    ambient = new AmbientEntities(world, view.scene, player.state.x, player.state.z);
    feedback = new BlockFeedback(view.scene);
    options.onProgress?.('准备控制与光照 · 完成', 1);
  } catch (error) {
    dispose();
    throw error;
  }
  const scene = view!,
    chunkRenderer = meshes!,
    controls = input!,
    modelSystem = models!;
  const camera = scene.camera;
  const syncCamera = () => {
    const p = player.state;
    camera.position.set(p.x, p.y + EYE, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
  };
  const getHit = (screenX?: number, screenY?: number) => {
    syncCamera();
    if (screenX !== undefined && screenY !== undefined) {
      const rect = scene.canvas.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((screenX - rect.left) / rect.width) * 2 - 1,
          (-(screenY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      direction.copy(raycaster.ray.direction);
    } else camera.getWorldDirection(direction);
    return raycast(world, camera.position, direction, 7);
  };
  controls.onCommand = (code) => {
    if (code === 'KeyF' && modelSystem.selectedSettings) {
      onModelMenu?.();
      return;
    }
    if (code === 'Pick') {
      const hit = getHit();
      if (hit) {
        const c = world.get(hit.x, hit.y, hit.z);
        if (c) {
          selectedBlock = c.type;
          selectedModel = null;
          emit();
        }
      }
      return;
    }
    if (!selectedModel) return;
    if (code === 'KeyR') modelSystem.adjustPlacement(Math.PI / 4);
    if (code === 'BracketLeft') modelSystem.adjustPlacement(0, -0.1);
    if (code === 'BracketRight') modelSystem.adjustPlacement(0, 0.1);
    emit();
  };
  const interact = (placing: boolean, screenX?: number, screenY?: number) => {
    if (controls.rebind(scene.canvas) || scene.error || scene.contextLost) return;
    if (!controls.active || player.dead) return;
    const hit = getHit(screenX, screenY);
    raycaster.set(camera.position, direction);
    raycaster.far = 7;
    const modelHit = modelSystem.intersect(raycaster);
    if (!placing && modelHit && (!hit || modelHit.distance < hit.distance)) {
      modelSystem.select(modelHit.object);
      if (modelSystem.selectedSettings) onModelMenu?.();
      return;
    }
    if (!hit) return;
    const { x, y, z, normal } = hit,
      cell = world.get(x, y, z);
    if (cell?.type === 'itemFrame' && !placing) {
      world.set(x, y, z, { ...cell, item: cell.item === selectedBlock ? undefined : selectedBlock });
      emit();
      return;
    }
    if (placing) {
      const px = x + normal.x,
        py = y + normal.y,
        pz = z + normal.z;
      if (selectedModel) {
        modelSystem.place(selectedModel, new THREE.Vector3(px, py - 0.5, pz));
        emit();
        return;
      }
      if (player.overlaps(px, py, pz)) return;
      const current = world.get(px, py, pz);
      if (current && current.type !== 'water' && !isPlant(current.type)) return;
      if (world.set(
        px,
        py,
        pz,
        selectedBlock === 'water' ? { type: 'water', level: 7, source: true } : { type: selectedBlock },
      )) feedback?.play('place', selectedBlock, px, py, pz, normal);
    } else if (cell?.type !== 'bedrock') {
      if (cell?.type === 'tnt') simulation.prime(x, y, z);
      else if (cell && world.set(x, y, z, null)) feedback?.play('break', cell.type, x, y, z, normal);
    }
    emit();
  };
  let last: number | undefined,
    lastSnapshot = performance.now(),
    actionTimer = 0;
  let reportedStreamError = false;
  let reportedMeshError = false;
  let completedMeshJobs = chunkRenderer.metrics.completed;
  let shadowMeshRevision = chunkRenderer.renderRevision;
  let previouslyHidden = document.hidden;
  let viewWasLost = false;
  const frame = (now: number) => {
    if (disposed) return;
    if (scene.error) {
      controls.unlock();
      options.onError?.(scene.error);
      return; // Terminal display failure. Keep the session available for saving.
    }
    controls.rebind(scene.canvas);
    if (scene.contextLost && !viewWasLost) controls.unlock();
    viewWasLost = scene.contextLost;
    const frameStart = performance.now();
    const frameMs = last === undefined ? 0 : now - last;
    const hiddenSample = document.hidden || previouslyHidden || visibilityChanged;
    previouslyHidden = document.hidden;
    visibilityChanged = false;
    const dt = Math.min(0.08, frameMs / 1000);
    last = now;
    if (controls.active && !player.dead) {
      const movement = controls.sample(player.state, dt);
      session.advance(dt, movement, controls.active);
      actionTimer -= dt;
      if (actionTimer <= 0 && (controls.primary || controls.secondary)) {
        interact(controls.secondary);
        actionTimer = controls.secondary ? 0.15 : 0.28 / Math.max(0.1, settings.breakSpeed);
      }
      if (player.dead) {
        controls.unlock();
        emit();
      }
    } else {
      session.advance(0, { x: 0, z: 0, jump: false }, false);
      actionTimer = 0;
    }
    syncCamera();
    const simulationEnd = performance.now();
    stream.tick(
      player.state.x,
      player.state.z,
      Math.min(8, Math.max(2, Math.ceil(settings.viewDistance / 16))),
    );
    if (stream.error && !reportedStreamError) {
      reportedStreamError = true;
      controls.unlock();
      options.onError?.(stream.error);
    }
    const streamingEnd = performance.now();
    chunkRenderer.flush(2, 4);
    if (chunkRenderer.renderRevision !== shadowMeshRevision) {
      shadowMeshRevision = chunkRenderer.renderRevision;
      scene.invalidateShadows();
    }
    if (chunkRenderer.error && !reportedMeshError) {
      reportedMeshError = true;
      controls.unlock();
      options.onError?.(chunkRenderer.error);
    }
    const meshEnd = performance.now();
    if (chunkRenderer.metrics.completed !== completedMeshJobs) {
      completedMeshJobs = chunkRenderer.metrics.completed;
      diagnostics.recordMeshWorker(chunkRenderer.metrics.buildMs, hiddenSample);
    }
    if (modelSystem.tick(controls.active ? dt : 0, camera)) scene.invalidateShadows();
    ambient?.tick(dt, camera.position, controls.active && !selectedModel && (selectedBlock === 'catTreat' || selectedBlock === 'purpleCatTreat'));
    feedback?.tick(dt);
    target = controls.active ? getHit() : null;
    outline.visible = !!target;
    if (target) {
      const s = target.shape;
      outline.position.set(target.x + (s?.x ?? 0), target.y + (s?.y ?? 0), target.z + (s?.z ?? 0));
      outline.scale.set(s?.w ?? 1, s?.h ?? 1, s?.d ?? 1);
    }
    const modelsEnd = performance.now();
    scene.draw(session.timeOfDay, dt, now, submergedDepth(world, camera.position.x, camera.position.y, camera.position.z));
    const renderEnd = performance.now();
    diagnostics.recordFrame({
      frameMs,
      hidden: hiddenSample,
      cpu: {
        simulation: simulationEnd - frameStart,
        streaming: streamingEnd - simulationEnd,
        meshMain: meshEnd - streamingEnd,
        models: modelsEnd - meshEnd,
        renderSubmission: renderEnd - modelsEnd,
        total: renderEnd - frameStart,
      },
      resources: {
        ...scene.frameResources(),
        residentChunks: world.loadedCount,
        renderedChunks: chunkRenderer.root.children.length,
        meshQueueDepth: world.dirty.size + chunkRenderer.pending,
        terrainQueueDepth: stream.queuedCount + Number(stream.pending),
        terrainAtlases: chunkRenderer.atlasCount,
      },
    });
    if (now - lastSnapshot >= 250) {
      lastSnapshot = now;
      emit();
    }
    raf = requestAnimationFrame(frame);
  };
  syncCamera();
  emit();
  raf = requestAnimationFrame(frame);
  const api: BlockGameApi = {
    setSelectedBlock(type) {
      selectedBlock = type;
      selectedModel = null;
      emit();
    },
    setSelectedModel(id) {
      selectedModel = id;
      modelSystem.clearSelection();
      emit();
    },
    lockControls: () => {
      controls.rebind(scene.canvas);
      if (scene.contextLost || scene.error) return Promise.reject(new Error('画面尚未恢复'));
      return controls.lock();
    },
    unlockControls: () => controls.unlock(),
    importModelFile: (file, opts) => modelSystem.import([file], opts),
    importModelFiles: (files, opts) => modelSystem.import(files, opts),
    async importGltfModel(url, position) {
      const blob = await (await fetch(url)).blob();
      const items = await modelSystem.import([new File([blob], url.split('/').pop() ?? 'model.glb')]);
      return modelSystem.place(items[0].id, position ?? new THREE.Vector3()) as THREE.Group;
    },
    async importMmdModel(source, position) {
      const file =
        typeof source === 'string'
          ? new File([await (await fetch(source)).blob()], source.split('/').pop() ?? 'model.pmx')
          : source;
      const items = await modelSystem.import([file]);
      return modelSystem.place(items[0].id, position ?? new THREE.Vector3())!;
    },
    updateSettings(next) {
      session.updateSettings(next);
      controls.sensitivity = settings.mouseSensitivity;
      controls.gamepadSensitivity = settings.gamepadLookSensitivity;
      scene.apply(settings);
      chunkRenderer.updateShadows(settings.shadows);
      modelSystem.applySettings();
      emit();
    },
    updateSelectedPlacedModel: (next) => modelSystem.update(next),
    updateSelectedModelPart: (id, next) => modelSystem.updatePart(id, next),
    importVmdForSelectedModel: (file) => modelSystem.motion(file),
    deleteSelectedPlacedModel: () => modelSystem.remove(),
    getSettings: () => ({ ...settings }),
    noteMmdSupport: () => '支持 PMX/PMD 文件夹和 VMD；模型文件随新版存档保存。',
    save(name) {
      const data = modelSystem.snapshot();
      return {
        version: 3,
        name,
        savedAt: Date.now(),
        seed: generator.seed,
        worldGen: { ...generator.settings },
        timeOfDay: session.timeOfDay,
        settings: { ...settings },
        hotbar: [],
        activeSlot: 0,
        importedModels: modelSystem.items,
        engineData: { ...session.snapshot(), ...data },
      };
    },
    respawn() {
      session.respawn();
      syncCamera();
      emit();
    },
    setTouchMove: (x, y) => controls.move(x, -y),
    setTouchLook: (dx, dy) => controls.look(dx, dy),
    touchJump: () => controls.jump(),
    touchTap: (x, y) => interact(false, x, y),
    touchPlace: (x, y) => interact(true, x, y),
    touchLock: () => {
      controls.rebind(scene.canvas);
      if (scene.contextLost || scene.error) return;
      controls.touchLock();
      const root = mount.closest('main') ?? mount;
      if (!document.fullscreenElement && navigator.userActivation?.isActive)
        void root.requestFullscreen?.().catch(() => {});
    },
    dispose,
  };
  return api;
}
