import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/engine/core/generator.ts';
import { World } from '../src/engine/core/world.ts';
import { ChunkStream } from '../src/engine/core/chunkStream.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';
import { BOTTOM, SEA, indexOf, positionOf } from '../src/engine/core/voxel.ts';
import { findSpawn, Player } from '../src/engine/core/player.ts';
import { Simulation } from '../src/engine/core/simulation.ts';
import { raycast } from '../src/engine/core/raycast.ts';

const settings = { ...defaultWorldGenSettings };
const canonical = (chunk: ReturnType<TerrainGenerator['generate']>) =>
  [...chunk.cells].sort(([a], [b]) => a - b);

test('chunk output is identical regardless of neighboring generation order', () => {
  for (const seed of [0, 1, 83917, -191]) {
    const a = new TerrainGenerator(seed, settings),
      b = new TerrainGenerator(seed, settings);
    const first = canonical(a.generate(-1, 0));
    a.generate(0, 0);
    b.generate(0, 0);
    const second = canonical(b.generate(-1, 0));
    assert.deepEqual(first, second);
    assert.deepEqual(canonical(a.generate(0, 0)), canonical(b.generate(0, 0)));
  }
});
test('modified chunks evict, restore, and round-trip deletions, water and frame contents', () => {
  const world = new World(new TerrainGenerator(77, settings));
  world.ensure(-1, 0);
  world.set(-1, 20, 2, { type: 'water', level: 4, source: false });
  world.set(-2, 21, 2, { type: 'itemFrame', item: 'dice' });
  world.set(-3, BOTTOM + 1, 2, null);
  const saved = structuredClone(world.snapshot());
  world.unload(-1, 0);
  assert.equal(world.loadedCount, 0);
  world.ensure(-1, 0);
  assert.equal(world.get(-2, 21, 2)?.item, 'dice');
  assert.equal(world.get(-3, BOTTOM + 1, 2), null);
  const restored = new World(new TerrainGenerator(77, settings), saved);
  restored.ensure(-1, 0);
  assert.deepEqual(canonical(world.getChunk(-1, 0)!), canonical(restored.getChunk(-1, 0)!));
});
test('edits are snapshotted by value and world instances are independent', () => {
  const a = new World(new TerrainGenerator(4, settings)),
    b = new World(new TerrainGenerator(5, settings));
  a.ensure(0, 0);
  b.ensure(0, 0);
  a.set(2, 50, 2, { type: 'stone' });
  const saved = a.snapshot();
  a.set(2, 50, 2, { type: 'dirt' });
  assert.equal(saved[0].cells[0][1]?.type, 'stone');
  assert.equal(b.get(2, 50, 2), null);
});
test('generated water has one surface datum and integer coordinates across chunk boundaries', () => {
  const g = new TerrainGenerator(42, { ...settings, oceanScale: 2 });
  let water = 0;
  for (let cx = -2; cx <= 2; cx++)
    for (let cz = -1; cz <= 1; cz++) {
      const c = g.generate(cx, cz);
      for (const [i, cell] of c.cells)
        if (cell.type === 'water') {
          const p = positionOf(i, cx, cz);
          assert.ok(Number.isInteger(p.y));
          assert.ok(p.y <= SEA);
          assert.equal(c.cells.get(indexOf(p.x, SEA, p.z))?.type, 'water');
          water++;
        }
    }
  assert.ok(water > 0);
});
test('spawn is dry and standing collision remains stable for fixed seeds', () => {
  for (const seed of [0, 1, 42, 983, -77]) {
    const w = new World(new TerrainGenerator(seed, settings)),
      spawn = findSpawn(w),
      p = new Player(spawn);
    new ChunkStream(w).requests(spawn.x, spawn.z, 1).forEach((r) => w.ensure(r.x, r.z));
    assert.notEqual(w.get(Math.round(spawn.x), Math.round(spawn.y), Math.round(spawn.z))?.type, 'water');
    for (let i = 0; i < 120; i++) p.update(w, 1 / 60, 0, 0, false, 5);
    assert.equal(p.dead, false);
    assert.ok(Math.abs(p.state.y - spawn.y) < 0.1);
    assert.equal(p.grounded, true);
  }
});
test('falling blocks and placed water use the same persistent mutation path', () => {
  const w = new World(new TerrainGenerator(0, { ...settings, flatWorld: true }));
  w.ensure(0, 0);
  const sim = new Simulation(w);
  w.set(4, 6, 4, { type: 'sand' });
  for (let i = 0; i < 30; i++) sim.tick(0.15);
  assert.equal(w.get(4, 4, 4)?.type, 'sand');
  assert.equal(w.get(4, 6, 4), null);
  w.set(8, 4, 8, { type: 'water', level: 7, source: true });
  for (let i = 0; i < 12; i++) sim.tick(0.15);
  assert.equal(w.get(8, 4, 8)?.level, 7);
  assert.equal(w.get(9, 4, 8)?.type, 'water');
  assert.ok(w.snapshot()[0].cells.length > 1);
  sim.dispose();
});
test('voxel selection sees edits without a rendered mesh', () => {
  const w = new World(new TerrainGenerator(1, { ...settings, flatWorld: true }));
  w.ensure(0, 0);
  w.set(4, 7, 4, { type: 'stone' });
  const h = raycast(w, { x: 4, y: 7, z: 7 }, { x: 0, y: 0, z: -1 });
  assert.equal(h?.z, 4);
  assert.equal(h?.normal.z, 1);
  w.set(4, 7, 4, null);
  assert.equal(raycast(w, { x: 4, y: 7, z: 7 }, { x: 0, y: 0, z: -1 }), null);
});
test('negative coordinates do not collide in chunk indexing', () => {
  for (const x of [-33, -17, -16, -1, 0, 15, 16])
    for (const z of [-17, -1, 0, 16]) {
      const p = positionOf(indexOf(x, -7, z), Math.floor(x / 16), Math.floor(z / 16));
      assert.deepEqual(p, { x, y: -7, z });
    }
});

test('pending TNT survives save/restore and bedrock remains intact', () => {
  const generator = new TerrainGenerator(1, { ...settings, flatWorld: true });
  const world = new World(generator);
  world.ensure(0, 0);
  const simulation = new Simulation(world);
  world.set(7, 4, 7, { type: 'tnt' });
  simulation.prime(7, 4, 7);
  simulation.tick(0.5);
  const restored = new World(generator, world.snapshot());
  const next = new Simulation(restored, simulation.snapshot());
  restored.ensure(0, 0);
  for (let i = 0; i < 20; i++) next.tick(0.15);
  assert.equal(restored.get(7, 3, 7), null);
  assert.equal(restored.get(7, BOTTOM, 7)?.type, 'bedrock');
  simulation.dispose();
  next.dispose();
});
