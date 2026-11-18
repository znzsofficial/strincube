import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainWorkerSource } from '../src/engine/workers/terrainSource.ts';
import { TerrainGenerator } from '../src/engine/core/generator.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';
import type { TerrainRequest } from '../src/engine/workers/protocol.ts';

test('blocked workers fall back without losing terrain determinism', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: class {
      constructor() {
        throw new Error('blocked by test policy');
      }
    },
  });
  const generator = new TerrainGenerator(42, { ...defaultWorldGenSettings, flatWorld: true });
  const source = new TerrainWorkerSource(generator);
  try {
    const chunk = await source.generate(-1, 0, new AbortController().signal);
    assert.equal(source.mode, 'main-thread-fallback');
    assert.match(source.fallback!, /blocked/);
    assert.deepEqual(chunk, generator.generate(-1, 0));
  } finally {
    source.dispose();
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('cancel and dispose settle pending worker promises without fallback generation', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  let terminated = 0,
    generated = 0;
  class FakeWorker {
    onmessage: unknown;
    onerror: unknown;
    onmessageerror: unknown;
    postMessage(_message: TerrainRequest) {}
    terminate() {
      terminated++;
    }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  const generator = new TerrainGenerator(42, defaultWorldGenSettings);
  generator.generate = () => {
    generated++;
    throw new Error('must not run');
  };
  const source = new TerrainWorkerSource(generator);
  try {
    const abort = new AbortController();
    const first = source.generate(0, 0, abort.signal);
    const rejected = assert.rejects(first, { name: 'AbortError' });
    abort.abort();
    await rejected;
    const second = source.generate(1, 0, new AbortController().signal);
    const closed = assert.rejects(second, /关闭/);
    source.dispose();
    await closed;
    assert.equal(generated, 0);
    assert.equal(terminated, 1);
  } finally {
    source.dispose();
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
