import { Moon, MousePointer2, Sun } from 'lucide-react';
import type { GameSnapshot } from '../engine/types';

function formatUiNumber(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

interface GameOverlaysProps {
  heldItemLabel: string;
  isNight: boolean;
  showClickPrompt: boolean;
  showFps: boolean;
  showTouchFullscreenPrompt: boolean;
  snapshot: GameSnapshot;
  onClickToLock: () => void;
  onEnterTouchFullscreen: () => void;
  onRespawn: () => void;
}

export function GameOverlays({
  heldItemLabel,
  isNight,
  showClickPrompt,
  showFps,
  showTouchFullscreenPrompt,
  snapshot,
  onClickToLock,
  onEnterTouchFullscreen,
  onRespawn,
}: GameOverlaysProps) {
  const performance = snapshot.performance;
  const milliseconds = (value: number | null) => value === null ? '—' : value.toFixed(1);
  const count = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('zh-CN');
  return (
    <>
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

      {showClickPrompt && !snapshot.isLocked && !snapshot.isDead && (
        <div className="click-prompt" onClick={onClickToLock} onPointerDown={(event) => event.stopPropagation()}>
          <MousePointer2 size={28} aria-hidden="true" />
          <p>点击画面继续</p>
        </div>
      )}

      {showTouchFullscreenPrompt && !snapshot.isLocked && !snapshot.isDead && (
        <div className="click-prompt touch-fullscreen-prompt" onClick={onEnterTouchFullscreen} onPointerDown={(event) => event.stopPropagation()}>
          <MousePointer2 size={28} aria-hidden="true" />
          <p>点击进入全屏</p>
          <span>加载已完成，进入横屏触控模式</span>
        </div>
      )}

      {snapshot.isLocked && !showTouchFullscreenPrompt && !snapshot.isDead && <div className="crosshair" aria-hidden="true" />}

      {snapshot.isDead && (
        <div className="death-screen">
          <h2>你死了</h2>
          <p>坠入虚空</p>
          <button type="button" className="start-button" onClick={onRespawn}>重生</button>
        </div>
      )}

      <section className="hud top-right" aria-label="昼夜">
        <span>{isNight ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />} {isNight ? '梦蓝夜晚' : '晴朗白天'}</span>
      </section>

      {showFps && (snapshot.fps !== undefined || performance) && (
        <section className="hud top-left fps-hud" aria-label="性能诊断">
          <span>{performance ? (performance.fps === null ? '—' : Math.round(performance.fps)) : snapshot.fps} FPS</span>
          {performance && (
            <>
              <span title={`最近 ${performance.frame.samples} 个有效帧；原始帧间隔，不是 GPU 耗时`}>帧间隔 {milliseconds(performance.frame.meanMs)} · P95 {milliseconds(performance.frame.p95Ms)} ms</span>
              <span title="主线程平均耗时；渲染是 CPU 提交时间，不是 GPU 执行时间">CPU {milliseconds(performance.cpu.total.meanMs)} · 渲染提交 {milliseconds(performance.cpu.renderSubmission.meanMs)} ms</span>
              <span>模拟 {milliseconds(performance.cpu.simulation.meanMs)} · 模型 {milliseconds(performance.cpu.models.meanMs)} ms</span>
              <span>流式 {milliseconds(performance.cpu.streaming.meanMs)} · 网格主线程 {milliseconds(performance.cpu.meshMain.meanMs)} ms</span>
              <span title="图集是已启用的地形材质批次；阴影刷新为最近有效帧的实际次数">地形图集 {count(performance.resources.terrainAtlases)} · 阴影刷新 {count(performance.resources.shadowUpdates)}</span>
              {performance.meshExecution?.mode === 'main-thread-fallback'
                ? <span title={performance.meshExecution.fallback}>网格已回退主线程</span>
                : performance.meshWorker.samples > 0 && <span title="最近完成的网格任务；Worker 计算耗时，独立于主线程 CPU">网格 Worker {milliseconds(performance.meshWorker.meanMs)} ms / 任务</span>}
              <span>绘制 {count(performance.resources.drawCalls)} · 三角形 {count(performance.resources.triangles)}</span>
              <span title="对象数量，不代表显存字节数">几何体 {count(performance.resources.geometries)} · 纹理 {count(performance.resources.textures)} · 程序 {count(performance.resources.programs)}</span>
              <span>区块 {count(performance.resources.residentChunks)} · 网格 {count(performance.resources.renderedChunks)}</span>
              <span>队列 地形 {count(performance.resources.terrainQueueDepth)} · 网格 {count(performance.resources.meshQueueDepth)}</span>
              {(performance.hidden || performance.skippedHiddenFrames > 0) && <span>{performance.hidden ? '后台采样暂停 · ' : ''}已略过 {performance.skippedHiddenFrames} 个后台帧</span>}
            </>
          )}
          {snapshot.worldDebug && (
            <>
              <span>{snapshot.worldDebug.biome} <small>({snapshot.worldDebug.baseBiome})</small></span>
              <span>XYZ {snapshot.worldDebug.x}, {snapshot.worldDebug.y}, {snapshot.worldDebug.z} · H {snapshot.worldDebug.height}</span>
              <span>T {formatUiNumber(snapshot.worldDebug.temperature, 2)} H {formatUiNumber(snapshot.worldDebug.humidity, 2)} C {formatUiNumber(snapshot.worldDebug.continentalness, 2)}</span>
              <span>E {formatUiNumber(snapshot.worldDebug.erosion, 2)} R {formatUiNumber(snapshot.worldDebug.ridge, 2)} O {snapshot.worldDebug.oceanDepth} L {snapshot.worldDebug.lakeDepth}</span>
              {snapshot.worldDebug.riverFlow != null && <span>F {formatUiNumber(snapshot.worldDebug.riverFlow, 0)} S {formatUiNumber(snapshot.worldDebug.riverSlope ?? 0, 2)} {snapshot.worldDebug.riverSource}</span>}
              {(snapshot.worldDebug.river || snapshot.worldDebug.riverBank || snapshot.worldDebug.lakeBank) && <span>{snapshot.worldDebug.river ? 'river' : snapshot.worldDebug.lakeBank ? 'lake bank' : 'river bank'}</span>}
            </>
          )}
        </section>
      )}

      {snapshot.isLocked && <div className="held-name" aria-live="polite">{heldItemLabel}</div>}
      {snapshot.isLocked && snapshot.selectedModelName && (
        <section className="model-edit-status" aria-label="模型编辑状态">
          <strong>{snapshot.selectedModelName}</strong>
          {snapshot.modelPlacement && <span>R {Math.round(snapshot.modelPlacement.rotation / Math.PI * 180)}° · [{Math.round(snapshot.modelPlacement.scale * 100)}%]</span>}
          {!snapshot.modelPlacement && <span>{snapshot.canOpenModelMenu ? 'F 设置 · Delete 删除' : '靠近后按 F 设置'}</span>}
        </section>
      )}
    </>
  );
}
