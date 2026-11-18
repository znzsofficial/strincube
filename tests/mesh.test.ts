import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh, meshResultTransfers } from '../src/engine/core/meshBuilder';
import { captureMeshSnapshot, MeshSnapshotGuard, meshSnapshotTransfers } from '../src/engine/core/meshSnapshot';
import { BOTTOM, TOP, CHUNK, indexOf, type Chunk, type Cell } from '../src/engine/core/voxel';
import { World } from '../src/engine/core/world';
import { TerrainGenerator } from '../src/engine/core/generator';
import { defaultWorldGenSettings } from '../src/engine/types';

const chunk = (x = 0, z = 0): Chunk => ({ x, z, cells: new Map() });
const add = (c: Chunk, x: number, y: number, z: number, cell: Cell = { type: 'stone' }) => c.cells.set(indexOf(x, y, z), cell);
const snapshot = (c: Chunk, refs: (Chunk | undefined)[] = [c]) => captureMeshSnapshot(c, refs, () => [0, 0, 0, 0, 0, 0]);
const mesh = (c: Chunk, refs?: (Chunk | undefined)[]) => buildMesh(snapshot(c, refs));
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('cube has exact UVs, outward winding, flat normals and twelve triangles', () => {
  const c = chunk(); add(c, 3, 8, 5);
  const [part] = mesh(c);
  assert.equal(part.positions.length, 72);
  assert.equal(part.indices.length, 36);
  assert.deepEqual([...part.uvs.slice(0, 8)], [0, 0, 1, 0, 1, 1, 0, 1]);
  for (let f = 0; f < 6; f++) {
    const offset = f * 12, p = part.positions, n = part.normals;
    const a = [p[offset + 3] - p[offset], p[offset + 4] - p[offset + 1], p[offset + 5] - p[offset + 2]];
    const b = [p[offset + 6] - p[offset], p[offset + 7] - p[offset + 1], p[offset + 8] - p[offset + 2]];
    const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    assert.ok(cross.reduce((sum, v, i) => sum + v * n[offset + i], 0) > 0);
  }
  assert.deepEqual(part.sphere, { x: 3, y: 8, z: 5, radius: Math.sqrt(.75) });
});

test('opaque adjacency hides shared faces, transparent adjacency retains correct asymmetric face', () => {
  const c = chunk(); add(c, 1, 0, 1); add(c, 2, 0, 1);
  assert.equal(mesh(c)[0].indices.length, 60);
  add(c, 2, 0, 1, { type: 'glass' });
  assert.equal(mesh(c)[0].indices.length, 66);
  add(c, 1, 0, 1, { type: 'glass' });
  assert.equal(mesh(c)[0].indices.length, 60);
});

test('all four halo directions, negative chunks and vertical limits preserve visibility', () => {
  const center = chunk(-2, -3), left = chunk(-3, -3), right = chunk(-1, -3), back = chunk(-2, -4), front = chunk(-2, -2);
  for (const [x, z] of [[0, 6], [15, 6], [6, 0], [6, 15]]) add(center, x, 0, z);
  add(left, 15, 0, 6); add(right, 0, 0, 6); add(back, 6, 0, 15); add(front, 6, 0, 0);
  assert.equal(mesh(center)[0].indices.length, 144);
  const [part] = mesh(center, [center, left, right, back, front]);
  assert.equal(part.indices.length, 120);
  assert.ok(Math.max(...part.positions.filter((_, i) => i % 3 === 0)) < 0);
  const edges = chunk(); add(edges, 0, BOTTOM, 0); add(edges, 0, TOP, 0);
  assert.equal(mesh(edges)[0].indices.length, 72);
});

test('plants retain crossed quads and diagonal normals', () => {
  const c = chunk(); add(c, 0, 0, 0, { type: 'fern' });
  const [part] = mesh(c);
  assert.equal(part.indices.length, 12);
  assert.equal(part.positions.length, 24);
  close(part.positions[0], -.4); close(part.positions[1], -.5);
  close(part.normals[0], -.707); close(part.normals[2], .707);
  close(part.normals[14], -.707);
});

test('water levels and a water block above keep exact side heights and suppress shared faces', () => {
  const c = chunk(); add(c, 0, 0, 0, { type: 'water', level: 3 });
  const [lower] = mesh(c);
  close(Math.max(...lower.positions.filter((_, i) => i % 3 === 1)), -.5 + .95 * 3 / 7);
  add(c, 0, 1, 0, { type: 'water', level: 1 });
  const [column] = mesh(c);
  assert.equal(column.indices.length, 60);
  close(column.positions[7], .5);
  close(Math.max(...column.positions.filter((_, i) => i % 3 === 1)), .5 + .95 / 7);
});

test('small blocks and item-frame contents retain dimensions, anchoring and material groups', () => {
  for (const [type, sx, sy, sz] of [
    ['torch', .14, .7, .14], ['lantern', .45, .6, .45], ['soulLantern', .45, .6, .45], ['itemFrame', .8, .8, .12],
  ] as const) {
    const c = chunk(); add(c, 0, 0, 0, { type, item: type === 'itemFrame' ? 'dice' : undefined });
    add(c, 1, 0, 0); // small blocks render their side even next to opaque terrain
    const parts = buildMesh(captureMeshSnapshot(c, [c], (t) => t === 'stone' ? [1, 1, 1, 1, 1, 1] : [0, 0, 0, 0, 0, 0]));
    const part = parts.find((p) => p.material === (type === 'itemFrame' ? 'dice' : 0))!;
    assert.equal(part.indices.length, 36);
    const axis = (n: number) => [...part.positions].filter((_, i) => i % 3 === n);
    close(Math.max(...axis(0)) - Math.min(...axis(0)), sx);
    close(Math.max(...axis(1)) - Math.min(...axis(1)), sy);
    close(Math.min(...axis(1)), -.5);
    close(Math.max(...axis(2)) - Math.min(...axis(2)), sz);
  }
});

test('snapshot copies only boundary cells and is independent of subsequent edits; buffers transfer', () => {
  const c = chunk(), right = chunk(1, 0);
  add(c, 15, 0, 4, { type: 'water', level: 2 });
  add(right, 0, 0, 4); add(right, 5, 0, 5, { type: 'goldBlock' });
  const s = snapshot(c, [c, undefined, right]);
  assert.equal(s.palette.length, 2);
  c.cells.get(indexOf(15, 0, 4))!.level = 7;
  const moved = structuredClone(s, { transfer: meshSnapshotTransfers(s) });
  assert.equal(s.cells.byteLength, 0);
  assert.equal(moved.palette[0].level, 2);
  const parts = buildMesh(moved), movedParts = structuredClone(parts, { transfer: meshResultTransfers(parts) });
  assert.equal(parts[0].positions.byteLength, 0);
  assert.equal(movedParts[0].indices.length, 30);
});

test('large material batches use 32-bit indices without wrapping vertex references', () => {
  const c = chunk();
  for (let y = BOTTOM; c.cells.size < 3000; y += 2)
    for (let z = 0; z < CHUNK && c.cells.size < 3000; z += 2)
      for (let x = 0; x < CHUNK && c.cells.size < 3000; x += 2) add(c, x, y, z);
  const [part] = mesh(c);
  assert.ok(part.indices instanceof Uint32Array);
  assert.equal(part.positions.length / 3, 72000);
  assert.equal(part.indices[part.indices.length - 1], 71999);
});

test('snapshot guard rejects center edits, unloaded/replaced neighbors and previously missing neighbors', () => {
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  const c = world.install(chunk()); add(c, 15, 0, 0);
  world.dirty.clear();
  let guard = new MeshSnapshotGuard(world, c);
  assert.ok(guard.valid(world));
  world.set(15, 0, 0, { type: 'dirt' });
  assert.equal(guard.valid(world), false);
  world.dirty.clear(); guard = new MeshSnapshotGuard(world, c);
  world.install(chunk(1, 0)); world.dirty.clear();
  assert.equal(guard.valid(world), false); // identity check survives accidental dirty consumption
  guard = new MeshSnapshotGuard(world, c);
  world.unload(1, 0); world.install(chunk(1, 0)); world.dirty.clear();
  assert.equal(guard.valid(world), false);
  guard = new MeshSnapshotGuard(world, c);
  world.unload(0, 0); world.install(chunk()); world.dirty.clear();
  assert.equal(guard.valid(world), false);
  world.dispose();
});

test('seed42 25-chunk deterministic fixture preserves 101482 triangles', () => {
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.ensure(x, z);
  let triangles = 0;
  for (const c of world.loaded) {
    const guard = new MeshSnapshotGuard(world, c);
    triangles += mesh(c, guard.refs).reduce((sum, p) => sum + p.indices.length / 3, 0);
  }
  assert.equal(triangles, 101482);
  assert.equal(CHUNK, 16);
  world.dispose();
});
