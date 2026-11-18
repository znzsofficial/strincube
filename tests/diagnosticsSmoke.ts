import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { FrameDiagnostics } from '../src/engine/diagnostics';
import type { GameSnapshot } from '../src/engine/types';
import { GameOverlays } from '../src/ui/GameOverlays';

/** Runs with the app stylesheet; keepPreview leaves the final fixture visible for viewport checks. */
export function verifyDiagnosticsHud(
  assert: (condition: unknown, label: string) => void,
  keepPreview = false,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const diagnostics = new FrameDiagnostics();
  const noop = () => {};
  const snapshot: GameSnapshot = {
    selectedBlock: 'stone',
    blockCount: 0,
    timeOfDay: 0,
    creatureCount: 0,
    isLocked: false,
    isDead: false,
    worldDebug: {
      x: 12,
      y: 60,
      z: -128,
      height: 60,
      biome: '温带森林',
      baseBiome: '森林',
      temperature: 0.3,
      humidity: 0.4,
      continentalness: 0.5,
      erosion: 0.1,
      ridge: 0.2,
      oceanDepth: 0,
      lakeDepth: 0,
      lakeBank: false,
      river: false,
      riverBank: false,
    },
  };
  const render = (showFps: boolean) =>
    flushSync(() =>
      root.render(
        createElement(GameOverlays, {
          heldItemLabel: '',
          isNight: false,
          showClickPrompt: false,
          showFps,
          showTouchFullscreenPrompt: false,
          snapshot: { ...snapshot, performance: diagnostics.snapshot() },
          onClickToLock: noop,
          onEnterTouchFullscreen: noop,
          onRespawn: noop,
        }),
      ),
    );
  const cleanup = () => {
    root.unmount();
    host.remove();
  };
  try {
    render(true);
    assert(host.querySelector('.fps-hud')?.textContent?.includes('— FPS'), '未采样的诊断不伪报 0 FPS');
    for (let i = 0; i < 120; i++)
      diagnostics.recordFrame({
        frameMs: 16 + (i % 3),
        cpu: { total: 8, simulation: 1, streaming: 0.2, meshMain: 2, models: 1, renderSubmission: 3 },
        resources: {
          drawCalls: 250,
          triangles: 1543210,
          geometries: 340,
          textures: 78,
          programs: 12,
          residentChunks: 121,
          renderedChunks: 119,
          meshQueueDepth: 3,
          terrainQueueDepth: 1,
        },
      });
    diagnostics.recordMeshWorker(6);
    render(true);
    let hud = host.querySelector('.fps-hud')!;
    assert(
      hud.textContent?.includes('59 FPS') && hud.textContent.includes('P95 18.0 ms'),
      'HUD 显示最新帧间隔与 P95',
    );
    assert(
      hud.textContent?.includes('渲染提交 3.0 ms') && hud.textContent.includes('Worker 6.0 ms / 任务'),
      'CPU 提交和 Worker 任务使用独立单位',
    );
    assert(
      hud.textContent?.includes('1,543,210') && hud.textContent.includes('温带森林'),
      '资源计数与原地形调试信息共存',
    );
    render(false);
    assert(!host.querySelector('.fps-hud'), '关闭 showFps 隐藏整个诊断 HUD');
    diagnostics.recordFrame({ frameMs: 5000, hidden: true });
    render(true);
    hud = host.querySelector('.fps-hud')!;
    assert(hud.textContent?.includes('后台采样暂停'), '后台样本明确标记为暂停');
    flushSync(() =>
      root.render(
        createElement(GameOverlays, {
          heldItemLabel: '',
          isNight: false,
          showClickPrompt: false,
          showFps: true,
          showTouchFullscreenPrompt: false,
          snapshot: {
            ...snapshot,
            performance: {
              ...diagnostics.snapshot(),
              meshExecution: { mode: 'main-thread-fallback', fallback: 'fixture' },
            },
          },
          onClickToLock: noop,
          onEnterTouchFullscreen: noop,
          onRespawn: noop,
        }),
      ),
    );
    hud = host.querySelector('.fps-hud')!;
    assert(
      hud.textContent?.includes('网格已回退主线程') && !hud.textContent.includes('Worker 6.0'),
      'Worker 回退后不把历史任务耗时显示成当前执行模式',
    );
    if (keepPreview) return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
  cleanup();
  return noop;
}
