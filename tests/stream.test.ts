import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/engine/core/generator.ts';
import { World } from '../src/engine/core/world.ts';
import { ChunkStream, type ChunkSource } from '../src/engine/core/chunkStream.ts';
import { packChunk, unpackChunk } from '../src/engine/core/chunkTransfer.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';
import { indexOf, type Chunk } from '../src/engine/core/voxel.ts';

function fixture() {
  const generator = new TerrainGenerator(42, { ...defaultWorldGenSettings, flatWorld: true });
  const world = new World(generator);
  const jobs: {
    x: number;
    z: number;
    resolve: (chunk: Chunk) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
  }[] = [];
  let disposed = false;
  const source: ChunkSource = {
    generate: (x, z, signal) =>
      new Promise((resolve, reject) => {
        jobs.push({ x, z, signal, resolve, reject });
      }),
    dispose: () => {
      disposed = true;
    },
  };
  const stream = new ChunkStream(world, source);
  const finish = (i: number) => jobs[i].resolve(generator.generate(jobs[i].x, jobs[i].z));
  return { generator, world, jobs, stream, finish, isDisposed: () => disposed };
}

test('stream deduplicates requests, limits concurrency and chooses closest first', async () => {
  const { stream, jobs, finish, world } = fixture();
  for (let i = 0; i < 10; i++) stream.tick(1, 1, 1);
  assert.equal(jobs.length, 1);
  assert.deepEqual([jobs[0].x, jobs[0].z], [0, 0]);
  finish(0);
  await stream.idle();
  assert.equal(world.loadedCount, 1);
  stream.tick(1, 1, 1);
  assert.equal(jobs.length, 2);
  assert.equal(Math.abs(jobs[1].x) + Math.abs(jobs[1].z), 1);
  finish(1);
  await stream.idle();
  stream.dispose();
});

test('teleport discards unwanted results and prioritizes the new center', async () => {
  const { stream, jobs, finish, world } = fixture();
  stream.tick(0, 0, 1);
  stream.tick(160, 160, 1);
  finish(0);
  await stream.idle();
  assert.equal(world.loadedCount, 0);
  stream.tick(160, 160, 1);
  assert.deepEqual([jobs[1].x, jobs[1].z], [10, 10]);
  finish(1);
  await stream.idle();
  assert.ok(world.getChunk(10, 10));
  stream.dispose();
});

test('late results preserve resident edits and apply latest journal after eviction', async () => {
  const { stream, finish, world, generator } = fixture();
  stream.tick(0, 0, 0);
  world.ensure(0, 0);
  world.set(1, 8, 1, { type: 'glass' });
  finish(0);
  await stream.idle();
  assert.equal(world.get(1, 8, 1)?.type, 'glass');
  const stale = generator.generate(0, 0);
  world.set(1, 8, 1, { type: 'itemFrame', item: 'dice' });
  world.unload(0, 0);
  world.install(stale);
  assert.equal(world.get(1, 8, 1)?.item, 'dice');
  stream.dispose();
});

test('disposing stream rejects late installation and disposes source', async () => {
  const { stream, finish, jobs, world, isDisposed } = fixture();
  stream.tick(0, 0, 1);
  stream.dispose();
  stream.dispose();
  assert.equal(isDisposed(), true);
  assert.equal(jobs[0].signal.aborted, true);
  finish(0);
  await stream.idle();
  assert.equal(world.loadedCount, 0);
  world.dispose();
  assert.throws(() => world.install({ x: 0, z: 0, cells: new Map() }), /关闭/);
});

test('initial loading cancellation cannot install a late response or emit progress', async () => {
  const { stream, finish, jobs, world } = fixture();
  const controller = new AbortController();
  let progress = 0;
  const promise = stream.prepare(0, 0, 0, () => progress++, controller.signal);
  const rejection = assert.rejects(promise, { name: 'AbortError' });
  controller.abort();
  assert.equal(jobs[0].signal.aborted, true);
  finish(0);
  await rejection;
  assert.equal(world.loadedCount, 0);
  assert.equal(progress, 0);
  stream.dispose();
});

test('worker failures become observable once, not an endless retry loop', async () => {
  const { stream, jobs } = fixture();
  stream.tick(0, 0, 1);
  jobs[0].reject(new Error('test-worker-failure'));
  await stream.idle();
  assert.match(stream.error!.message, /test-worker-failure/);
  stream.tick(0, 0, 1);
  assert.equal(jobs.length, 1);
  stream.dispose();
});

test('mesh backlog applies backpressure to generation', async () => {
  const { stream, jobs, world, finish } = fixture();
  for (let i = 0; i < 17; i++) world.dirty.add(`${i},0`);
  stream.tick(0, 0, 1);
  assert.equal(jobs.length, 0);
  world.dirty.clear();
  stream.tick(0, 0, 1);
  assert.equal(jobs.length, 1);
  finish(0);
  await stream.idle();
  stream.dispose();
});

test('transfer codec preserves generation, negative chunks, water and independent cells', () => {
  const generator = new TerrainGenerator(42, defaultWorldGenSettings);
  for (const [x, z] of [
    [-1, 0],
    [0, 0],
    [2, -3],
  ]) {
    const chunk = generator.generate(x, z),
      packed = packChunk(chunk);
    const received = structuredClone(packed, { transfer: [packed.indices.buffer, packed.values.buffer] });
    assert.equal(packed.indices.byteLength, 0);
    const copy = unpackChunk(received);
    assert.deepEqual(copy, chunk);
    const first = copy.cells.values().next().value!;
    first.type = 'glass';
    assert.notDeepEqual(copy, chunk);
  }
  const custom: Chunk = {
    x: -1,
    z: 2,
    cells: new Map([
      [indexOf(-1, 8, 32), { type: 'itemFrame', item: 'dice' }],
      [indexOf(-2, 8, 32), { type: 'water', level: 3, static: false, source: false }],
    ]),
  };
  assert.deepEqual(unpackChunk(packChunk(custom)), custom);
});
