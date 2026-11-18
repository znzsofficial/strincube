import { useEffect, useState } from 'react';
import { estimateCapacity, formatCapacity } from '../storageCapacity';

export function StorageCapacity({ revision }: { revision: unknown }) {
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [estimate, setEstimate] = useState<Awaited<ReturnType<typeof estimateCapacity>> | undefined>();
  useEffect(() => {
    if (!open) return;
    let active = true;
    setEstimate(undefined);
    void estimateCapacity().then(next => { if (active) setEstimate(next); });
    return () => { active = false; };
  }, [open, revision, refresh]);

  return <details className="storage-capacity" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>本站存储空间</summary>
    {open && <>
      <p aria-live="polite">{estimate === undefined ? '正在估算…' : estimate === null
        ? '浏览器未提供容量估算，仍可保存或导入。'
        : `约已用 ${formatCapacity(estimate.usage)}，约剩余 ${formatCapacity(estimate.remaining)}。`}</p>
      <small>包括此站点的存档及其他数据。建议定期下载世界备份。</small>
      <button type="button" className="world-backup-btn" disabled={estimate === undefined} onClick={() => setRefresh(n => n + 1)}>刷新估算</button>
    </>}
  </details>;
}
