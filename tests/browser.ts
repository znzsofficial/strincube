import { createGame } from '../src/engine/runtime';
import {
  defaultWorldGenSettings,
  type BlockGameApi,
  type GameSnapshot,
  type WorldSaveData,
} from '../src/engine/types';
import { worldSaves } from '../src/engine/persistence';
import { getSaveMetaList, loadSaveData, storeSaveData, deleteSaveData } from '../src/saveStorage';
import { verifyMenuFlow } from './menuFlow';
import { verifyBackupFlow } from './backupFlow';
import { verifyPostProcessing } from './postProcessing';
import { verifyMmd } from './mmdSmoke';
import { verifyTerrainWorker } from './workerSmoke';
import { verifyShoreControls } from './shoreControls';
import { runMeshSmoke } from './meshSmoke';
import { verifyDiagnosticsHud } from './diagnosticsSmoke';
import { verifyShadowQuality } from './shadowQuality';
import { verifyQualitySettings } from './settingsSmoke';
import { runMaterialBatchingSmoke } from './materialBatchingSmoke';
import { qualityPreset, matchingQualityPreset } from '../src/engine/quality';

const result = document.querySelector('#result')!;
const mount = document.querySelector('#mount') as HTMLElement;
const frames = (n = 4) =>
  new Promise<void>((resolve) => {
    let count = 0;
    const tick = () => {
      if (++count >= n) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  result.textContent += `\nPASS ${message}`;
}
function fixture() {
  const data = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
  let binary = '';
  for (const byte of new Uint8Array(data.buffer)) binary += String.fromCharCode(byte);
  return new File(
    [
      JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        materials: [
          { name: 'test', pbrMetallicRoughness: { baseColorFactor: [1, 0.4, 0.2, 1], metallicFactor: 0 } },
        ],
        buffers: [
          { byteLength: data.byteLength, uri: `data:application/octet-stream;base64,${btoa(binary)}` },
        ],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: data.byteLength, target: 34962 }],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] },
        ],
      }),
    ],
    'fixture.gltf',
    { type: 'model/gltf+json' },
  );
}
document.querySelector('#run')!.addEventListener('click', async () => {
  const button = document.querySelector('#run') as HTMLButtonElement;
  button.disabled = true;
  result.textContent = '运行中';
  let game: BlockGameApi | undefined;
  let snapshot: GameSnapshot | undefined;
  const id = `next_test_${crypto.randomUUID()}`;
  const oldKey = `strincube_save_retired_${crypto.randomUUID()}`;
  try {
    localStorage.setItem(oldKey, JSON.stringify({ version: 2, name: 'retired-test', savedAt: 1 }));
    const list = await getSaveMetaList();
    assert(!list.some(meta => meta.id === oldKey.replace('strincube_save_', '')), '存档列表不读取旧 localStorage 数据');
    assert(await loadSaveData(oldKey.replace('strincube_save_', '')) === null, '旧存档 ID 不会回退到兼容加载器');
    assert(localStorage.getItem(oldKey) !== null, '移除兼容支持不主动清除旧数据');
    const options = {
      worldGen: { ...defaultWorldGenSettings, flatWorld: true, seed: 42 },
      onProgress: () => {},
    };
    game = await createGame(mount, (s) => (snapshot = s), undefined, options);
    assert(mount.querySelectorAll('canvas').length === 1, '只创建一个画布');
    game.touchLock();
    game.setTouchLook(0, 400);
    await frames(12);
    const rect = mount.getBoundingClientRect();
    game.touchTap(rect.left + 320, rect.top + 240);
    await frames();
    const edited = game.save('browser-test');
    assert(
      edited.engineData!.edits.some((c) => c.cells.some(([, v]) => v === null)),
      '触控挖掘写入编辑日志',
    );
    game.setSelectedBlock('stone');
    game.touchPlace(rect.left + 320, rect.top + 240);
    await frames();
    assert(
      game.save('test').engineData!.edits.some((c) => c.cells.some(([, v]) => v?.type === 'stone')),
      '触控放置写入编辑日志',
    );
    const before = game.save('test').engineData!.player;
    game.setTouchMove(0, 1);
    await frames(25);
    game.setTouchMove(0, 0);
    const after = game.save('test').engineData!.player;
    assert(after.z < before.z, '触屏向上推杆为前进');
    game.unlockControls();
    const file = fixture();
    const [model] = await game.importModelFile(file);
    game.setSelectedModel(model.id);
    game.touchLock();
    game.touchPlace(rect.left + 320, rect.top + 240);
    game.unlockControls();
    await frames();
    let saved = game.save('browser-test');
    assert(saved.engineData!.placements.length === 1, '模型成功摆放');
    game.updateSelectedPlacedModel({ scale: 0.7, offsetY: 0.2, opacity: 0.6 });
    game.updateSettings(qualityPreset('low'));
    saved = game.save('browser-test');
    assert(saved.engineData!.placements[0].settings.scale === 0.7, '模型属性保存');
    const selectedId = snapshot?.selectedModelSettings?.id;
    game.updateSettings({ modelBrightness: 0.9 });
    assert(snapshot?.selectedModelSettings?.id === selectedId, '全局模型设置不改变当前选择');
    const detached = game.save('detached');
    detached.engineData!.assets[0].paths[0] = 'corrupted';
    detached.worldGen.treeDensity = 'none';
    const unchanged = game.save('unchanged');
    assert(
      unchanged.engineData!.assets[0].paths[0] !== 'corrupted' && unchanged.worldGen.treeDensity !== 'none',
      '存档快照不暴露运行时可变数组或设置',
    );
    await storeSaveData(id, saved);
    const stored = await worldSaves.get(id);
    assert((await loadSaveData(id))?.version === 3, '统一存档入口读取 v3');
    assert(stored?.data.engineData?.assets[0].files[0] instanceof File, 'IndexedDB 保存原始模型文件');
    game.dispose();
    game = undefined;
    assert(mount.querySelectorAll('canvas').length === 0, '退出释放画布');
    const backupCopy = await verifyBackupFlow(saved, assert);
    const stages: number[] = [];
    game = await createGame(mount, (s) => (snapshot = s), undefined, {
      initialSave: backupCopy,
      onProgress: (_l, p) => stages.push(p),
    });
    await frames();
    const restored = game.save('restored');
    assert(matchingQualityPreset(game.getSettings()) === 'low', '画质预设及阴影预算随存档恢复');
    assert(
      restored.engineData!.placements[0].id === saved.engineData!.placements[0].id,
      '模型实例标识在重载后稳定',
    );
    assert(
      JSON.stringify(saved.engineData!.edits) === JSON.stringify(restored.engineData!.edits),
      '重载保留世界编辑',
    );
    assert(
      restored.engineData!.placements.length === 1 &&
        restored.engineData!.placements[0].settings.opacity === 0.6,
      '重载恢复模型与属性',
    );
    assert(
      stages.every((v, i) => i === 0 || v >= stages[i - 1]),
      '加载进度单调递增',
    );
    assert(snapshot?.isDead === false, '重载后玩家存活');
    game.updateSettings({ showFps: true });
    await frames(4);
    assert(!!snapshot?.performance && (snapshot.performance.frame.samples > 0 || snapshot.performance.hidden), '实际运行时发布有效帧统计或明确后台状态');
    assert(snapshot?.performance?.meshExecution?.mode === 'worker', '实际运行时报告网格 Worker 执行模式');
    game.updateSettings({ postProcessing: true, bloomStrength: 0.2, filmGrain: true, vignette: true });
    await frames(6);
    assert(mount.querySelector('canvas')!.width > 0, '后处理渲染可运行');
    game.dispose();
    game = undefined;
    const bad = {
      ...stored!.data,
      engineData: { ...stored!.data.engineData!, generator: 'unknown' },
    } as WorldSaveData;
    let rejected = false;
    try {
      await createGame(mount, () => {}, undefined, { initialSave: bad });
    } catch {
      rejected = true;
    }
    assert(rejected, '拒绝未知生成器版本');
    let oldRejected = false;
    try {
      await createGame(mount, () => {}, undefined, {
        initialSave: { ...stored!.data, version: 2 } as unknown as WorldSaveData,
      });
    } catch { oldRejected = true; }
    assert(oldRejected && mount.querySelectorAll('canvas').length === 0, '旧格式在初始化之前被拒绝');
    const controller = new AbortController();
    const pending = createGame(mount, () => {}, undefined, { ...options, signal: controller.signal });
    controller.abort();
    let cancelled = false;
    try {
      await pending;
    } catch {
      cancelled = true;
    }
    assert(cancelled && mount.querySelectorAll('canvas').length === 0, '取消初始化无残留画布');
    await verifyTerrainWorker(assert);
    await verifyShoreControls(mount, assert);
    const meshResult = await runMeshSmoke();
    assert(meshResult.mode === 'worker' && meshResult.races === 'PASS', '网格 Worker 实际构建、过期结果丢弃、原子替换与退出清理通过');
    verifyDiagnosticsHud(assert);
    verifyQualitySettings(assert);
    verifyPostProcessing(mount, assert);
    await verifyShadowQuality(mount, assert);
    const batching = await runMaterialBatchingSmoke();
    assert(batching.triangles === 101482 && batching.batchedCalls < batching.baselineCalls, '材质批处理降低绘制调用，保留几何、贴图和透明裁切阴影');
    await verifyMmd(assert);
    await verifyMenuFlow(assert);
    result.textContent += '\nALL PASSED';
  } catch (error) {
    result.textContent += `\nFAIL ${error instanceof Error ? error.stack : String(error)}`;
    console.error(error);
  } finally {
    game?.dispose();
    await deleteSaveData(id);
    localStorage.removeItem(oldKey);
    button.disabled = false;
  }
});
