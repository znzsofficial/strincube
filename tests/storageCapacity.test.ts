import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCapacity, formatCapacity, formatSaveWriteError } from '../src/storageCapacity';

test('storage estimates distinguish unavailable/denied from a full origin', async () => {
  for (const values of [{}, { usage: NaN, quota: 10 }, { usage: 1, quota: 0 }]) {
    assert.equal(await estimateCapacity(async () => values), null);
  }
  assert.equal(await estimateCapacity(async () => { throw new Error('unavailable'); }), null);
  assert.deepEqual(await estimateCapacity(async () => ({ usage: 20, quota: 19 })), { usage: 20, quota: 19, remaining: 0 });
  assert.equal(formatCapacity(1536 * 1024), '1.5 MiB');
});

test('quota recovery guidance preserves live state and does not recommend clearing site data', () => {
  assert.match(formatSaveWriteError({ name: 'QuotaExceededError' }), /空间不足.*保留当前页面.*不要清除本站数据/);
  assert.match(formatSaveWriteError(new Error('索引损坏')), /索引损坏/);
});
