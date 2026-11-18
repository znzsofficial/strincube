import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import { worldSaves } from '../src/engine/persistence';
import type { WorldSaveData } from '../src/engine/types';

/** Drive the actual title screen, read its download and feed that file back to
 * its picker. Use a unique test name so cleanup never touches an unrelated save. */
export async function verifyBackupFlow(save: WorldSaveData, assert: (value: unknown, message: string) => void) {
  const name = `backup-smoke-${crypto.randomUUID()}`;
  const original = `next_${crypto.randomUUID()}`;
  await worldSaves.insert(original, { ...save, name });
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  const wait = async <T>(read: () => T) => {
    const until = performance.now() + 15000;
    for (;;) {
      const result = read();
      if (result) return result;
      if (performance.now() > until) throw new Error('备份界面超时：' + host.querySelector('[role="status"]')?.textContent);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  const upload = (blob: Blob) => {
    const input = host.querySelector<HTMLInputElement>('[aria-label="选择世界备份文件"]')!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'world.strincube'));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  try {
    root.render(createElement(App));
    (await wait(() => host.querySelector<HTMLButtonElement>(`[aria-label="导出备份：${name}"]`)))!.click();
    const link = (await wait(() => host.querySelector<HTMLAnchorElement>('a[download]')))!;
    const blob = await (await fetch(link.href)).blob();
    assert(blob.size > 0 && link.download.endsWith('.strincube'), '标题页可下载包含模型的世界备份');
    host.querySelector<HTMLElement>('.storage-capacity summary')!.click();
    await wait(() => /约剩余|未提供容量估算/.test(host.querySelector('.storage-capacity p')?.textContent ?? ''));
    assert(!host.querySelector<HTMLButtonElement>('.storage-capacity button')?.disabled, '容量估算完成或不可用后仍可刷新和导入');
    let collision = false;
    try { await worldSaves.insert(original, { ...save, name: 'collision' }); }
    catch (error) { collision = error instanceof DOMException && error.name === 'ConstraintError'; }
    assert(collision && (await worldSaves.get(original))?.data.name === name &&
      (await worldSaves.list()).find(row => row.id === original)?.name === name,
      '新建存档遇到重复标识时回滚，原正文和摘要均不变');
    upload(blob.slice(0, -1));
    await wait(() => host.querySelector('[role="status"]')?.textContent?.includes('导入失败'));
    assert((await worldSaves.list()).filter(s => s.name === name).length === 1, '损坏备份未写入或覆盖已有世界');
    const insert = worldSaves.insert;
    try {
      worldSaves.insert = async () => { throw new DOMException('fixture', 'QuotaExceededError'); };
      upload(blob);
      await wait(() => host.querySelector('[role="status"]')?.textContent?.includes('浏览器空间不足'));
      assert((await worldSaves.list()).filter(s => s.name === name).length === 1, '导入遇到配额不足时保留原世界并提示备份重试');
    } finally { worldSaves.insert = insert; }
    upload(blob);
    await wait(() => host.querySelector('[role="status"]')?.textContent?.includes('导入为独立存档'));
    const copies = (await worldSaves.list()).filter(s => s.name === name);
    const copy = copies.find(s => s.id !== original);
    assert(copies.length === 2 && copy && host.querySelectorAll(`[aria-label="导出备份：${name}"]`).length === 2, '导入后刷新列表并保留原存档');
    return (await worldSaves.get(copy!.id))!.data;
  } finally {
    root.unmount(); host.remove();
    for (const row of await worldSaves.list()) if (row.name === name) await worldSaves.delete(row.id);
  }
}
