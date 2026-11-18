import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../src/engine/core/meshBuilder';
import { captureMeshSnapshot } from '../src/engine/core/meshSnapshot';
import { CHUNK, indexOf, type Chunk, type Cell } from '../src/engine/core/voxel';

const chunk = (x: number, z: number): Chunk => ({ x, z, cells: new Map() });
const put = (c: Chunk, x: number, y: number, z: number, type: Cell['type'] = 'stone') =>
  c.cells.set(indexOf(x, y, z), { type });
const materials = (type: Cell['type']) => Array(6).fill(type === 'stone' ? 1 : 2);

test('top corners and side feet follow raised walls and adjoining ground across all cardinal seams', () => {
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    const c = chunk(-2, -2), alongX = chunk(c.x + dx, c.z), alongZ = chunk(c.x, c.z + dz);
    const x = c.x * CHUNK + (dx < 0 ? 0 : CHUNK - 1), z = c.z * CHUNK + (dz < 0 ? 0 : CHUNK - 1);
    put(c, x, 0, z);
    put(alongX, x + dx, 1, z); put(alongZ, x, 1, z + dz);
    put(alongX, x + dx, -1, z);
    const refs = [c, dx < 0 ? alongX : undefined, dx > 0 ? alongX : undefined,
      dz < 0 ? alongZ : undefined, dz > 0 ? alongZ : undefined];
    const [part] = buildMesh(captureMeshSnapshot(c, refs, materials));
    assert.equal(part.indices.length, 36);
    const rgb = part.colors!;
    assert.equal(rgb.length, part.positions.length);
    const corners: number[][] = [[], [], []];
    for (let i = 0; i < rgb.length; i += 3) {
      const [px, py, pz] = part.positions.subarray(i, i + 3);
      assert.equal(rgb[i], rgb[i + 1]); assert.equal(rgb[i], rgb[i + 2]);
      if (part.normals[i + 1] === 1) {
        corners[Number((px - x) * dx > 0) + Number((pz - z) * dz > 0)].push(rgb[i]);
      } else if (part.normals[i] === dx && py < 0) {
        assert.ok(rgb[i] > 0 && rgb[i] < 1, 'only the side meeting ground fades at its foot');
      } else assert.equal(rgb[i], 1);
    }
    assert.deepEqual(corners[0], [1]);
    assert.equal(corners[1].length, 2); assert.equal(corners[1][0], corners[1][1]);
    assert.ok(corners[1][0] < 1 && corners[1][0] > corners[2][0] && corners[2][0] > 0);
  }
});

test('cutouts, transparent cells and small specials neither cast nor receive cube contact', () => {
  for (const type of ['fern', 'water', 'ice', 'glass', 'birchLeaves', 'torch', 'soulLantern', 'lantern', 'itemFrame'] as const) {
    const c = chunk(0, 0);
    put(c, 5, 0, 5); put(c, 6, 1, 5, type); put(c, 6, -1, 5, type);
    const parts = buildMesh(captureMeshSnapshot(c, [c], materials));
    assert.ok(parts.every((p) => !p.colors), `unexpected contact from/on ${type}`);
  }
  const c = chunk(0, 0);
  put(c, 5, 0, 5); put(c, 6, 1, 6); put(c, 6, -1, 6);
  assert.equal(buildMesh(captureMeshSnapshot(c, [c], materials))[0].colors, undefined, 'diagonals alone do not darken');
});

test('atlas contact multiplies linear tint once, matching original material shading on the same triangles', () => {
  const c = chunk(0, 0);
  put(c, 0, 0, 0); // emitted before the first shadow; neutral colors must be backfilled
  put(c, 4, 0, 4); put(c, 5, 1, 4, 'dirt');
  const snapshot = captureMeshSnapshot(c, [c], materials);
  const original = buildMesh(snapshot);
  const batches = {
    1: { material: 10, uv: [0, 0, .5, 1], color: [.7, .3, .1] },
    2: { material: 10, uv: [.5, 0, .5, 1], color: [.2, .4, .8] },
  } as const;
  const merged = buildMesh({ ...snapshot, batches });
  assert.equal(original.length, 2); assert.equal(merged.length, 1);
  const [part] = merged;
  assert.equal(part.indices.length, original.reduce((n, p) => n + p.indices.length, 0));
  assert.ok(original[0].colors!.slice(0, 72).every((v) => v === 1));
  let offset = 0;
  for (const p of original) {
    const tint = batches[p.material as 1 | 2].color;
    assert.equal(p.colors!.length, p.positions.length);
    assert.deepEqual(part.positions.slice(offset, offset + p.positions.length), p.positions);
    assert.ok(p.colors!.some((v) => v < 1));
    for (let i = 0; i < p.colors!.length; i++)
      assert.ok(Math.abs(part.colors![offset + i] - p.colors![i] * tint[i % 3]) < 1e-6);
    offset += p.positions.length;
  }
});
