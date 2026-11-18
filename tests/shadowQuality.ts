import * as THREE from 'three';
import { GameScene } from '../src/engine/render/scene';
import { defaultSettings } from '../src/engine/core/session';
import { qualityPreset, matchingQualityPreset } from '../src/engine/quality';

export async function verifyShadowQuality(
  mount: HTMLElement,
  assert: (condition: unknown, message: string) => void,
) {
  const settings = { ...defaultSettings(1), shadowUpdateHz: 10 };
  const view = new GameScene(mount, settings);
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshStandardMaterial();
  const caster = new THREE.Mesh(geometry, material);
  caster.castShadow = true;
  caster.receiveShadow = true;
  let depthDraws = 0;
  caster.onBeforeShadow = () => { depthDraws++; };
  view.scene.add(caster);
  view.camera.position.set(5, 4, 8);
  view.camera.lookAt(0, 0, 0);
  const light = view.scene.children.find(object => object instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
  const gl = view.renderer.getContext();
  let completed = false;
  try {
    view.draw(0.28, 1 / 60, 0);
    assert(view.shadowDiagnostics.frameUpdates === 1 && depthDraws > 0, '首次渲染执行真实阴影深度绘制');
    assert(view.shadowDiagnostics.mapWidth === 1024, '阴影默认使用 1024 分辨率');
    const initialTarget = light.shadow.map!;
    const matrix = light.shadow.matrix.clone();
    const sunPosition = light.position.clone();
    view.draw(0.29, 1 / 60, 10);
    assert(view.shadowDiagnostics.frameUpdates === 0, '连续日照变化遵守原始时间刷新上限');
    assert(!light.position.equals(sunPosition), '阴影缓存期间日照仍平滑移动');
    assert(light.shadow.matrix.equals(matrix), '缓存阴影与投影矩阵保持配对');
    view.draw(0.28, 1 / 60, 1000);
    assert(view.shadowDiagnostics.frameUpdates === 0, '静止视角与日照跳过阴影更新');
    const before = view.shadowDiagnostics.totalUpdates;
    for (let frame = 0; frame <= 100; frame++) {
      view.invalidateShadows();
      // dt deliberately disagrees with RAF time: no clamped-simulation budget.
      view.draw(0.28, 0.0001, 1100 + frame * 10);
    }
    const updates = view.shadowDiagnostics.totalUpdates - before;
    assert(updates === 11, '每秒连续无效化仍最多刷新十次（包含首尾帧）');
    assert(light.shadow.map === initialTarget, '持续刷新重用阴影目标而非每帧分配');
    view.camera.position.x += 2;
    view.draw(0.28, 1 / 60, 2300);
    assert(view.shadowDiagnostics.frameUpdates === 1, '相机位移自动刷新阴影');
    view.apply({ ...settings, postProcessing: true });
    view.draw(0.28, 1 / 60, 2500);
    assert(view.shadowDiagnostics.frameUpdates === 1, '后处理多 Pass 每帧仅刷新一次阴影');
    let disposed = 0;
    initialTarget.addEventListener('dispose', () => { disposed++; });
    view.apply({ ...settings, shadowResolution: 2048 });
    assert(disposed === 1 && !view.shadowDiagnostics.mapAllocated, '分辨率变化立即释放旧阴影目标');
    view.draw(0.28, 1 / 60, 2510);
    assert(view.shadowDiagnostics.mapWidth === 2048 && view.shadowDiagnostics.frameUpdates === 1,
      '新分辨率目标立即初始化');
    const largerTarget = light.shadow.map!;
    let largerDisposed = false;
    largerTarget.addEventListener('dispose', () => { largerDisposed = true; });
    view.apply({ ...settings, shadows: false });
    view.draw(0.28, 1 / 60, 2600);
    assert(largerDisposed && !view.shadowDiagnostics.mapAllocated && view.shadowDiagnostics.frameUpdates === 0,
      '关闭阴影释放目标并停止刷新');
    view.apply(settings);
    view.draw(0.28, 1 / 60, 2610);
    assert(view.shadowDiagnostics.frameUpdates === 1, '重新开启立即生成阴影');
    for (const id of ['low', 'medium', 'high'] as const) {
      const next = { ...settings, ...qualityPreset(id) };
      view.apply(next);
      view.draw(0.28, 1 / 60, 3000 + ['low', 'medium', 'high'].indexOf(id) * 1000);
      assert(matchingQualityPreset(next) === id, `${id} 画质设置可识别`);
      assert(view.shadowDiagnostics.mapAllocated === next.shadows, `${id} 画质阴影资源符合设置`);
    }
    // Exercise real WebGL loss/restoration rather than only dispatching DOM events.
    for (let cycle = 0; cycle < 2; cycle++) {
      const extension = view.renderer.getContext().getExtension('WEBGL_lose_context');
      if (!extension) break;
      const previousRenderer = view.renderer;
      const canvas = previousRenderer.domElement;
      const event = (name: string) => new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`Timed out: ${name}`)), 5000);
        view.renderer.domElement.addEventListener(name, () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
      const lost = event('webglcontextlost');
      extension.loseContext();
      await lost;
      view.draw(0.28, 1 / 60, 6000);
      assert(view.contextLost && view.shadowDiagnostics.frameUpdates === 0, '上下文丢失不刷新阴影');
      // Let the loss event finish dispatching (including preventDefault) before
      // requesting restoration; Chromium rejects restoration in that dispatch.
      await new Promise<void>(resolve => window.setTimeout(resolve, 100));
      const restored = event('webglcontextrestored');
      extension.restoreContext();
      await restored;
      view.draw(0.28, 1 / 60, 6010);
      assert(!view.contextLost && view.shadowDiagnostics.frameUpdates === 1,
        '真实上下文恢复使阴影缓存失效并重新生成');
      assert(view.renderer !== previousRenderer && view.renderer.domElement === canvas,
        '恢复重建渲染器缓存且保留原画布与输入绑定');
      assert(gl.getError() === gl.NO_ERROR, '恢复渲染没有旧上下文资源操作错误');
      view.apply({ ...settings, postProcessing: false });
      view.draw(0.28, 1 / 60, 6200);
      assert(gl.getError() === gl.NO_ERROR, '恢复后关闭后处理不删除旧上下文 VAO');
      view.apply({ ...settings, ...qualityPreset('high') });
      view.draw(0.28, 1 / 60, 6400);
    }
    completed = true;
    return { updatesPerSecond: updates - 1, depthDraws, totalUpdates: view.shadowDiagnostics.totalUpdates };
  } finally {
    view.dispose();
    geometry.dispose();
    material.dispose();
    if (completed) assert(gl.getError() === gl.NO_ERROR, '恢复后最终释放场景无 WebGL 资源错误');
  }
}
