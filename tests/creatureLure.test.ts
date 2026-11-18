import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AmbientEntities } from '../src/engine/render/entities';
import { TerrainGenerator } from '../src/engine/core/generator';
import { World } from '../src/engine/core/world';
import { defaultWorldGenSettings } from '../src/engine/types';

test('creatures follow a treat, reuse ground queries and notice terrain edits', () => {
  const gen = new TerrainGenerator(42, { ...defaultWorldGenSettings, flatWorld: true });
  const world = new World(gen), scene = new THREE.Scene();
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) world.ensure(x, z);
  const entities = new AmbientEntities(world, scene, 0, 0);
  try {
    const body = scene.children[0];
    const p = new THREE.Vector3(0, body.position.y + 1.5, 0);
    const column = gen.column.bind(gen);
    let queries = 0;
    gen.column = (x,z) => { queries++; return column(x,z); };
    for (let i=0; i<180; i++) entities.tick(1/60, p, true);
    assert.ok(Math.hypot(body.position.x,body.position.z) < 1.6);
    assert.ok(queries < entities.count * 25, `Ground queries: ${queries}`);
    const old = body.position.y;
    world.set(Math.round(body.position.x), Math.round(old + .5), Math.round(body.position.z), { type:'stone' });
    entities.tick(0, p, true);
    assert.equal(body.position.y, old+1);
  } finally { entities.dispose(); world.dispose(); }
});
