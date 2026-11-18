import { worldSaves } from '../src/engine/persistence';
import { AUTOSAVE_INTERVAL_MS } from '../src/saveCoordinator';

/** Start on the pause menu of the fixture's new world. Use the normal App,
 * transaction and loader, controlling only timer delivery and slow/error I/O. */
export async function verifyAutosaveFlow(host: HTMLElement, click: (label: string) => void,
  wait: (read: () => boolean) => Promise<void>, assert: (condition: unknown, label: string) => void) {
  const put = worldSaves.put, list = worldSaves.list;
  const existing = new Set((await list()).map(s => s.id));
  const originalInterval = window.setInterval, originalClear = window.clearInterval;
  const clock = new Map<number, () => void>();
  window.setInterval = (callback, delay, ...args) => {
    const id = originalInterval.call(window, callback, delay, ...args);
    if (delay === AUTOSAVE_INTERVAL_MS && typeof callback === 'function') clock.set(id, () => callback(...args));
    return id;
  };
  window.clearInterval = (id) => { clock.delete(id!); originalClear.call(window, id); };
  const writes: { id: string; slot: number }[] = [];
  let release!: () => void;
  const firstWrite = new Promise<void>(resolve => { release = resolve; });
  let failWrite = false;
  worldSaves.put = async (id, data) => {
    if (existing.has(id)) throw new Error('测试拒绝修改已有世界');
    writes.push({ id, slot: data.activeSlot });
    if (writes.length === 1) await firstWrite;
    if (failWrite) throw new DOMException('fixture quota', 'QuotaExceededError');
    await put(id, data);
  };
  const toggle = () => host.querySelector<HTMLInputElement>('[aria-label="自动保存"]')!;
  const status = () => host.querySelector('.save-status')?.textContent ?? '';
  const slot = (n: number) => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit' + n, key: String(n) }));
  try {
    click('设置'); await wait(() => !!toggle());
    assert(!toggle().checked, '新世界默认关闭自动保存');
    toggle().click(); await wait(() => clock.size === 1);
    const tick = [...clock.values()][0];
    toggle().click(); await wait(() => clock.size === 0);
    tick(); assert(writes.length === 0, '关闭自动保存取消定时器，过期回调不写入');
    toggle().click(); await wait(() => clock.size === 1);
    click('返回菜单'); await wait(() => !!host.querySelector('.menu-primary'));
    [...clock.values()][0](); await wait(() => !!host.querySelector('.back-button:disabled'));
    slot(2); click('保存游戏'); slot(3); click('保存游戏');
    assert(writes.length === 1, '手动保存不会与正在执行的自动保存重叠');
    release(); await wait(() => status().includes('已保存'));
    const id = writes[0].id;
    assert(writes.length === 2 && writes[1].id === id && writes[1].slot === 2, '稳定存档 ID，仅写入最新的排队快照');

    failWrite = true; slot(4); click('保存游戏');
    await wait(() => !!host.querySelector('[role="alert"]')?.textContent?.includes('空间不足'));
    assert((await worldSaves.get(id))?.data.activeSlot === 2, '写入失败保留上次提交并显示空间回收提示');
    failWrite = false;
    worldSaves.list = async () => { throw new Error('fixture list failure'); };
    click('保存游戏'); await wait(() => status().includes('列表刷新失败'));
    const restored = (await worldSaves.get(id))!.data;
    assert(!host.querySelector('[role="alert"]') && restored.activeSlot === 3, '刷新失败不掩盖已提交的进度，成功重试清除写入错误');
    worldSaves.list = list;

    click('返回主菜单'); await wait(() => !!host.querySelector('.title-screen') && clock.size === 0);
    const row = () => [...host.querySelectorAll('.world-select-item')].find(el =>
      el.querySelector('strong')?.textContent === restored.name && el.textContent?.includes(`种子 ${restored.seed}`));
    await wait(() => !!row());
    row()!.querySelector<HTMLButtonElement>('.world-play-btn')!.click();
    await wait(() => !!host.querySelector('.click-prompt') && clock.size === 1);
    assert(host.querySelector('.hotbar .active')?.textContent === '4', '重新进入世界恢复最新手动存档的快捷栏和自动保存开关');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await wait(() => !!host.querySelector('.menu-primary'));
  } finally {
    release(); worldSaves.put = put; worldSaves.list = list;
    window.setInterval = originalInterval; window.clearInterval = originalClear;
    for (const id of new Set(writes.map(w => w.id))) await worldSaves.delete(id);
  }
}
