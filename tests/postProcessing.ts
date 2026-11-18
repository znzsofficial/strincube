import { GameScene } from '../src/engine/render/scene';
import { defaultSettings } from '../src/engine/core/session';

export function verifyPostProcessing(
  mount: HTMLElement,
  assert: (condition: unknown, message: string) => void,
) {
  const settings = { ...defaultSettings(1), shadows: false };
  const view = new GameScene(mount, settings);
  try {
    view.draw(0.28, 1 / 60);
    const baseline = view.renderer.info.memory.textures;
    assert(baseline === 0, '关闭后处理时不分配渲染目标纹理');
    const fog = view.scene.fog as import('three').Fog;
    const air = fog.color.getHex();
    view.draw(.28, 1 / 60, 100, .6);
    const shallow = fog.color.getHex(), shallowFar = fog.far;
    view.draw(.28, 1 / 60, 120, 7);
    assert(air !== shallow && shallow !== fog.color.getHex() && fog.far < shallowFar, '浅水与深水光色和能见度随眼睛深度变化');
    view.draw(.28, 1 / 60, 140, 0);
    assert(fog.color.getHex() === air && fog.far === settings.viewDistance && view.renderer.info.memory.textures === baseline, '出水恢复空气光色与视距，水雾无需额外渲染目标');
    view.apply({ ...settings, postProcessing: true, pixelRatio: 1.5 });
    view.draw(0.28, 1 / 60);
    assert(view.renderer.info.memory.textures > baseline, '开启后处理按需创建渲染目标');
    const fullFrameCalls = view.renderer.info.render.calls;
    assert(fullFrameCalls > 1, '渲染统计累计完整后处理帧而非只统计最后一个 Pass');
    view.draw(0.28, 1 / 60);
    assert(view.renderer.info.render.calls === fullFrameCalls, '绘制调用统计每帧重置、不跨帧累积');
    view.apply({ ...settings, postProcessing: false });
    view.draw(0.28, 1 / 60);
    assert(view.renderer.info.memory.textures === baseline, '关闭后处理释放 GPU 纹理');
    view.apply({ ...settings, postProcessing: true, bloomStrength: 0 });
    view.draw(0.28, 1 / 60);
    assert(view.renderer.info.render.calls > 0, '后处理可重复开启且允许关闭 Bloom');
  } finally {
    view.dispose();
  }
}
