import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/engine/core/generator.ts';
import { World } from '../src/engine/core/world.ts';
import { chunkRead } from '../src/engine/core/chunkRead.ts';
import { BOTTOM, TOP, neighbors, positionOf } from '../src/engine/core/voxel.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';

test('cached mesh reads match world lookup for all faces, edits and missing neighbors', () => {
  const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
  const chunk = world.ensure(-1, 0);
  world.ensure(0, 0);
  world.ensure(-1, -1);
  world.set(-1, 20, 4, { type: 'glass' });
  const read = chunkRead(world, chunk);
  for (const [i] of chunk.cells) {
    const p = positionOf(i, chunk.x, chunk.z);
    for (const [dx, dy, dz] of neighbors)
      assert.deepEqual(read(p.x + dx, p.y + dy, p.z + dz), world.get(p.x + dx, p.y + dy, p.z + dz));
  }
  assert.equal(read(-1, BOTTOM - 1, 0), null);
  assert.equal(read(-1, TOP + 1, 0), null);
  world.set(-1, 20, 4, null);
  assert.equal(read(-1, 20, 4), null);
  world.unload(0, 0);
  assert.equal(chunkRead(world, chunk)(0, 0, 0), null);
});
