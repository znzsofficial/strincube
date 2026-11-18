import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';

/** Exercise the real App/effects with controllable browser lock-event ordering. */
export async function verifyMenuFlow(assert: (condition: unknown, label: string) => void) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const requestDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'requestPointerLock');
  const exitDescriptor = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');
  const lockDescriptor = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
  let locked: Element | null = null;
  let defer = false, pending: (() => void) | undefined;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: () => {
    locked = null; queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
  } });
  Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: function(this: HTMLCanvasElement) {
    return new Promise<void>(resolve => {
      const acquire = () => { locked = this; document.dispatchEvent(new Event('pointerlockchange')); resolve(); };
      if (defer) pending = acquire; else acquire();
    });
  } });
  const wait = async (condition: () => boolean) => {
    const start = performance.now();
    while (!condition()) {
      if (performance.now() - start > 20000) throw new Error('菜单状态转换超时');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  const click = (label: string) => {
    const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
    if (!button) throw new Error(`没有按钮 ${label}`); button.click();
  };
  const key = (code: string, value: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code, key: value, bubbles: true }));
  const prompt = () => host.querySelector('.click-prompt') as HTMLElement | null;
  const inventory = () => !!host.querySelector('[aria-label="背包"]') || !!host.querySelector('.inventory-panel');
  try {
    root.render(createElement(App));
    await wait(() => !!host.querySelector('.start-button'));
    click('创建新世界');
    await wait(() => !!host.querySelector('[role="radio"]'));
    ([...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.textContent?.includes('超平坦')))!.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    click('创建并进入'); await wait(() => !!prompt());
    prompt()!.click(); await wait(() => !!locked && !prompt());
    assert(!prompt(), '真实 App 切换到游戏后继续接收锁定快照并移除提示');
    key('KeyE', 'e'); await wait(() => inventory() && !locked);
    assert(!prompt(), '背包开启时立即暂停且不显示继续提示');
    key('KeyE', 'e'); await wait(() => !!locked && !inventory());
    key('Escape', 'Escape'); await wait(() => !!host.querySelector('.menu-primary') && !locked);
    assert(!prompt(), 'Esc 解锁与菜单顺序一致');
    defer = true;
    click('回到游戏');
    key('KeyO', 'o'); await wait(() => !!host.querySelector('.settings-panel'));
    pending!(); await wait(() => !locked);
    assert(!!host.querySelector('.settings-panel') && !prompt(), '延迟锁定成功不会关闭刚打开的设置');
    const preset = host.querySelector<HTMLSelectElement>('[aria-label="画质预设"]')!;
    preset.value = 'low'; preset.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(() => !host.querySelector('[aria-label="阴影分辨率"]'));
    assert(preset.value === 'low', '真实 App 一次应用低画质并保持预设选择');
    preset.value = 'high'; preset.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(() => !!host.querySelector('[aria-label="阴影分辨率"]'));
    assert(preset.value === 'high' && host.querySelector<HTMLSelectElement>('[aria-label="阴影分辨率"]')!.value === '2048', '真实 App 一次应用高画质并同步阴影设置');
    defer = false;
    click('返回菜单'); await wait(() => !!host.querySelector('.menu-primary'));
    click('回到游戏'); await wait(() => !!locked && !prompt());
    window.dispatchEvent(new Event('blur')); await wait(() => !!host.querySelector('.menu-primary') && !locked);
    assert(!prompt(), '失焦回到暂停菜单而非残留继续提示');
    click('返回主菜单'); await wait(() => !!host.querySelector('.title-screen'));
    assert(!locked && !host.querySelector('canvas'), '返回标题释放输入和画布');
  } finally {
    root.unmount(); host.remove();
    if (requestDescriptor) Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', requestDescriptor);
    if (exitDescriptor) Object.defineProperty(document, 'exitPointerLock', exitDescriptor); else Reflect.deleteProperty(document, 'exitPointerLock');
    if (lockDescriptor) Object.defineProperty(document, 'pointerLockElement', lockDescriptor); else Reflect.deleteProperty(document, 'pointerLockElement');
  }
}
