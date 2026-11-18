import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/engine/core/generator.ts';
import { World } from '../src/engine/core/world.ts';
import { Simulation } from '../src/engine/core/simulation.ts';
import { CHUNK, cellKey, indexOf, type Chunk } from '../src/engine/core/voxel.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';

const generator = () => new TerrainGenerator(0, { ...defaultWorldGenSettings, flatWorld: true });
function floor(cx: number, cz = 0): Chunk {
  const chunk: Chunk = { x: cx, z: cz, cells: new Map() };
  for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++)
    for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) chunk.cells.set(indexOf(x, 3, z), { type: 'stone' });
  return chunk;
}
function steps(simulation: Simulation, count = 8) {
  for (let i = 0; i < count; i++) simulation.tick(0.15);
}

test('border source retries after its blocked neighbor installs, including a saved deferred source', () => {
  const world = new World(generator());
  world.install(floor(0));
  const sim = new Simulation(world);
  // Static water can be explicitly disturbed without being converted before deferral.
  world.set(15, 4, 8, { type: 'water', level: 7, source: true, static: true });
  steps(sim);
  assert.equal(world.loadedCount, 1);
  assert.ok(sim.snapshot().deferred?.some((e) => e.chunk === '1,0' && e.pending.includes('15,4,8')));
  const restored = new World(generator(), world.snapshot());
  const next = new Simulation(restored, structuredClone(sim.snapshot()));
  restored.install(floor(0));
  steps(next);
  assert.equal(restored.get(16, 4, 8), null);
  restored.install(floor(1));
  steps(next);
  assert.equal(restored.get(16, 4, 8)?.type, 'water');
  assert.equal(restored.get(16, 4, 8)?.level, 6);
  assert.equal(restored.loadedCount, 2);
});

test('non-source water retains its level while an unloaded neighbor may supply it', () => {
  const world = new World(generator());
  world.install(floor(0));
  world.install(floor(1));
  world.set(16, 4, 8, { type: 'water', level: 7, source: true, static: true });
  const sim = new Simulation(world);
  world.set(15, 4, 8, { type: 'water', level: 6, source: false });
  world.unload(1, 0);
  steps(sim, 20);
  assert.deepEqual(world.get(15, 4, 8), { type: 'water', level: 6, source: false });
  world.install(floor(1));
  steps(sim);
  assert.equal(world.get(15, 4, 8)?.level, 6);
});

test('falling sand survives pending eviction, deferred save, reload and a second eviction', () => {
  const world = new World(generator());
  world.install(floor(0));
  const sim = new Simulation(world);
  world.set(8, 8, 8, { type: 'sand' });
  world.unload(0, 0);
  steps(sim);
  const saved = structuredClone(sim.snapshot());
  assert.ok(saved.deferred?.some((e) => e.pending.includes('8,8,8')));
  const restored = new World(generator(), world.snapshot());
  const next = new Simulation(restored, saved);
  steps(next, 20);
  assert.equal(restored.loadedCount, 0);
  restored.install(floor(0));
  next.tick(0.15);
  assert.ok([5, 6, 7].some((y) => restored.get(8, y, 8)?.type === 'sand'));
  restored.unload(0, 0);
  steps(next);
  restored.install(floor(0));
  steps(next);
  assert.equal(restored.get(8, 4, 8)?.type, 'sand');
  assert.equal(restored.get(8, 8, 8), null);
  assert.equal(restored.get(8, 7, 8), null);
});

test('boundary TNT freezes its remaining fuse, survives save, and blasts exactly once with bedrock intact', () => {
  const world = new World(generator());
  world.install(floor(0));
  world.install(floor(1));
  const sim = new Simulation(world);
  world.set(15, 4, 8, { type: 'tnt' });
  world.set(16, 4, 8, { type: 'stone' });
  world.set(16, 3, 8, { type: 'bedrock' });
  sim.prime(15, 4, 8);
  sim.tick(0.5);
  world.unload(1, 0);
  sim.tick(10);
  assert.equal(sim.snapshot().bombs[0].time, 1.5);
  assert.equal(world.get(15, 3, 8)?.type, 'stone');
  const restored = new World(generator(), world.snapshot());
  const next = new Simulation(restored, structuredClone(sim.snapshot()));
  restored.install(floor(0));
  next.tick(10);
  assert.equal(next.snapshot().bombs[0].time, 1.5);
  restored.install(floor(1));
  let destroyed = 0;
  restored.subscribe(({ x, y, z, after }) => {
    if (x === 16 && y === 4 && z === 8 && after === null) destroyed++;
  });
  next.tick(1);
  assert.equal(restored.get(16, 4, 8)?.type, 'stone');
  next.tick(0.5);
  assert.equal(restored.get(16, 4, 8), null);
  assert.equal(restored.get(16, 3, 8)?.type, 'bedrock');
  assert.equal(next.snapshot().bombs.length, 0);
  restored.set(16, 4, 8, { type: 'stone' });
  steps(next, 20);
  assert.equal(destroyed, 1);
  assert.equal(restored.get(16, 4, 8)?.type, 'stone');
});

test('TNT chain reactions begin their own fuse on the next tick', () => {
  const world = new World(generator());
  world.install(floor(0));
  const sim = new Simulation(world);
  world.set(8, 4, 8, { type: 'tnt' });
  world.set(9, 4, 8, { type: 'tnt' });
  sim.prime(8, 4, 8);
  sim.tick(2);
  assert.deepEqual(sim.snapshot().bombs, [{ x: 9, y: 4, z: 8, time: 2 }]);
  sim.tick(2);
  assert.equal(sim.snapshot().bombs.length, 0);
});

test('finite-world edges neither defer water forever nor require out-of-world blast chunks', () => {
  const gen = new TerrainGenerator(0, {
    ...defaultWorldGenSettings,
    infiniteWorld: false,
    worldSizeCustom: 32,
    flatWorld: true,
  });
  const world = new World(gen);
  world.install(floor(1));
  const sim = new Simulation(world);
  world.set(31, 4, 4, { type: 'water', level: 7, source: true });
  sim.tick(0.15);
  assert.equal(world.get(30, 4, 4)?.type, 'water');
  assert.ok(!sim.snapshot().deferred?.some((e) => e.chunk === '2,0'));
  world.set(31, 4, 4, { type: 'tnt' });
  sim.prime(31, 4, 4);
  sim.tick(2);
  assert.equal(sim.snapshot().bombs.length, 0);
  assert.equal(world.get(30, 3, 4), null);
  assert.equal(world.loadedCount, 1);
});

test('loading and reloading generated static rivers never activates them', () => {
  const world = new World(generator());
  const sim = new Simulation(world);
  const river = () => {
    const chunk = floor(0);
    for (let x = 0; x < CHUNK; x++)
      for (let z = 0; z < CHUNK; z++)
        chunk.cells.set(indexOf(x, 4, z), { type: 'water', level: 7, source: true, static: true });
    return chunk;
  };
  world.install(river());
  world.install(floor(1));
  steps(sim, 20);
  world.unload(0, 0);
  world.install(river());
  steps(sim, 20);
  assert.deepEqual(world.snapshot(), []);
  assert.deepEqual(sim.snapshot().pending, []);
  assert.deepEqual(sim.snapshot().deferred, []);
});

test('old pending-only saves drain in bounded batches and deferred work is not polled', () => {
  const world = new World(generator());
  let lookups = 0;
  const isLoaded = world.isLoaded.bind(world);
  world.isLoaded = (x, z) => {
    lookups++;
    return isLoaded(x, z);
  };
  const pending = Array.from({ length: 2000 }, (_, x) => cellKey(x, 4, 8));
  const sim = new Simulation(world, { pending, bombs: [] });
  sim.tick(0.15);
  assert.equal(sim.snapshot().pending.length, 2000 - 384);
  assert.equal(lookups, 384);
  steps(sim, 6);
  assert.equal(sim.snapshot().pending.length, 0);
  lookups = 0;
  steps(sim, 10);
  assert.equal(lookups, 0);
  assert.equal(
    sim.snapshot().deferred?.reduce((n, e) => n + e.pending.length, 0),
    2000,
  );
});

test('evicting an installed chunk before its wake budget runs keeps its whole deferred bucket asleep', () => {
  const world = new World(generator());
  const pending = Array.from({ length: 1024 }, (_, i) =>
    cellKey(i % CHUNK, 4 + Math.floor(i / (CHUNK * CHUNK)), Math.floor(i / CHUNK) % CHUNK),
  );
  const sim = new Simulation(world, { pending, bombs: [] });
  steps(sim);
  world.install(floor(0));
  world.unload(0, 0);
  let lookups = 0;
  const isLoaded = world.isLoaded.bind(world);
  world.isLoaded = (x, z) => {
    lookups++;
    return isLoaded(x, z);
  };
  steps(sim);
  assert.equal(lookups, 0);
  assert.deepEqual(sim.snapshot().pending, []);
  assert.equal(sim.snapshot().deferred?.[0].pending.length, 1024);
  world.install(floor(0));
  steps(sim);
  assert.deepEqual(sim.snapshot().deferred, []);
});
