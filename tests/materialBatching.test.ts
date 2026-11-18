import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh, meshResultTransfers } from '../src/engine/core/meshBuilder';
import { captureMeshSnapshot, type MeshBatchMaterials } from '../src/engine/core/meshSnapshot';
import { indexOf, type Chunk } from '../src/engine/core/voxel';

const batches: MeshBatchMaterials = {
  1: { material: 100, uv: [.125, .25, .0625, .0625], color: [.25, .5, .75] },
  2: { material: 100, uv: [.375, .5, .0625, .0625], color: [.8, .6, .4] },
};

test('atlas batching preserves every triangle and normal, transforms only UV/tint, leaves water/plants/frames separate', () => {
  const chunk: Chunk = { x: -1, z: 2, cells: new Map([
    [indexOf(0, 0, 0), { type: 'stone' }],
    [indexOf(2, 0, 0), { type: 'dirt' }],
    [indexOf(4, 0, 0), { type: 'water', level: 2 }],
    [indexOf(6, 0, 0), { type: 'fern' }],
    [indexOf(8, 0, 0), { type: 'itemFrame', item: 'dice' }],
  ]) };
  const snapshot = captureMeshSnapshot(chunk, [chunk], (type) => Array(6).fill(
    type === 'stone' ? 1 : type === 'dirt' ? 2 : type === 'water' ? 43 : 45));
  const baseline = buildMesh(snapshot);
  const batched = buildMesh({ ...snapshot, batches });
  assert.equal(batched.length, baseline.length - 1);
  assert.equal(batched.reduce((n, part) => n + part.indices.length, 0), baseline.reduce((n, part) => n + part.indices.length, 0));
  const merged = batched.find((part) => part.material === 100)!;
  let offset = 0;
  for (const id of [1, 2]) {
    const original = baseline.find((part) => part.material === id)!;
    const count = original.positions.length;
    assert.deepEqual(merged.positions.slice(offset, offset + count), original.positions);
    assert.deepEqual(merged.normals.slice(offset, offset + count), original.normals);
    const batch = batches[id]!;
    for (let vertex = 0; vertex < count / 3; vertex++) {
      for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(merged.colors![offset + vertex * 3 + axis] - batch.color[axis]) < 1e-6);
      const uvOffset = offset / 3 * 2 + vertex * 2;
      assert.equal(merged.uvs[uvOffset], batch.uv[0] + original.uvs[vertex * 2] * batch.uv[2]);
      assert.equal(merged.uvs[uvOffset + 1], batch.uv[1] + original.uvs[vertex * 2 + 1] * batch.uv[3]);
    }
    offset += count;
  }
  for (const id of [43, 45, 'dice']) {
    const part = batched.find((part) => part.material === id)!;
    assert.deepEqual(part, baseline.find((part) => part.material === id));
    assert.equal(part.colors, undefined);
  }
  const clone = structuredClone(batched, { transfer: meshResultTransfers(batched) });
  assert.equal(merged.colors!.byteLength, 0, 'tint buffer transfers rather than copying');
  assert.equal(clone.find((part) => part.material === 100)!.colors!.length, offset);
});

test('merged atlas groups select 32-bit indices and retain bounds enclosing all original vertices', () => {
  const chunk: Chunk = { x: 0, z: 0, cells: new Map() };
  for (let y = -20; chunk.cells.size < 3000; y += 2)
    for (let z = 0; z < 16 && chunk.cells.size < 3000; z += 2)
      for (let x = 0; x < 16 && chunk.cells.size < 3000; x += 2)
        chunk.cells.set(indexOf(x, y, z), { type: chunk.cells.size % 2 ? 'stone' : 'dirt' });
  const snapshot = captureMeshSnapshot(chunk, [chunk], (type) => Array(6).fill(type === 'stone' ? 1 : 2), batches);
  const [part] = buildMesh(snapshot);
  assert.ok(part.indices instanceof Uint32Array);
  assert.equal(part.indices.at(-1), 71999);
  assert.equal(part.colors!.length, part.positions.length);
  const { x, y, z, radius } = part.sphere;
  for (let i = 0; i < part.positions.length; i += 3)
    assert.ok(Math.hypot(part.positions[i] - x, part.positions[i + 1] - y, part.positions[i + 2] - z) <= radius + 1e-6);
});
