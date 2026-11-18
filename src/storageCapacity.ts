/** Origin-wide estimates are informational. Only the write transaction can tell
 * whether there is enough space for a particular save. */
export async function estimateCapacity(read: () => Promise<StorageEstimate> = () => navigator.storage.estimate()) {
  try {
    const { usage, quota } = await read();
    if (typeof usage !== 'number' || typeof quota !== 'number' || !Number.isFinite(usage) ||
        !Number.isFinite(quota) || usage < 0 || quota <= 0) return null;
    return { usage, quota, remaining: Math.max(0, quota - usage) };
  } catch { return null; }
}

export function formatCapacity(bytes: number) {
  if (bytes < 1024) return `${Math.ceil(bytes)} B`;
  const unit = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Number((bytes / 1024 ** unit).toFixed(1))} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`;
}

export function quotaExceeded(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'QuotaExceededError';
}

export function formatSaveWriteError(error: unknown): string {
  if (quotaExceeded(error)) return '浏览器空间不足。请保留当前页面，释放设备空间后重试；不要清除本站数据。';
  const reason = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message : typeof error === 'string' ? error : '';
  return `${reason ? reason + '。' : ''}请保留当前页面并重试。`;
}
