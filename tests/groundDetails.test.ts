import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/engine/core/generator';
import { CHUNK, indexOf, isSolid, transparent } from '../src/engine/core/voxel';
import { defaultWorldGenSettings as settings } from '../src/engine/types';
import { World } from '../src/engine/core/world';
import { raycast } from '../src/engine/core/raycast';

test('pebble picking hits the actual top and side, passes over the pile and through its gaps', () => {
  const world = new World(new TerrainGenerator(42, settings));
  world.install({x:0,z:0,cells:new Map([[indexOf(0,0,0),{type:'riverPebbles'}],[indexOf(1,0,0),{type:'stone'}],[indexOf(0,-1,0),{type:'dirt'}]])});
  try {
    const top = raycast(world,{x:-.16,y:1,z:.09},{x:0,y:-1,z:0});
    assert.equal(top?.y,0); assert.equal(top?.normal.y,1); assert.ok(Math.abs(top!.distance-1.33)<1e-10);
    const side = raycast(world,{x:-1,y:-.4,z:.09},{x:1,y:0,z:0});
    assert.equal(side?.normal.x,-1); assert.equal(side?.shape?.h,.17);
    assert.equal(raycast(world,{x:-1,y:0,z:.09},{x:1,y:0,z:0})?.x,1);
    assert.equal(raycast(world,{x:.04,y:1,z:.03},{x:0,y:-1,z:0})?.y,-1);
    assert.equal(raycast(world,{x:-.16,y:1,z:.09},{x:0,y:-1,z:0},1),null);
  } finally {world.dispose();}
});

test('riverbank pebbles sit on real ground, preserve the previous generator and obey the structure slider', () => {
  const gen = new TerrainGenerator(42,settings), cx=Math.floor(-65/CHUNK), cz=Math.floor(34/CHUNK);
  const key=indexOf(-65,3,34);
  const chunk=gen.generate(cx,cz), c=chunk.cells.get(key);
  assert.equal(c?.type,'riverPebbles'); assert.ok(transparent(c)); assert.ok(!isSolid(c));
  assert.ok(isSolid(chunk.cells.get(indexOf(-65,2,34))));
  for(const old of [new TerrainGenerator(42,settings,'terrain-watershed-1'),new TerrainGenerator(42,{...settings,structureDensity:'none'})]) {
    assert.ok(![...old.generate(cx,cz).cells.values()].some(v=>v.type==='riverPebbles'));
    assert.deepEqual(old.column(-65,34),gen.column(-65,34));
  }
});

test('forest undergrowth is seeded, independently disabled by plant density', () => {
  const gen=new TerrainGenerator(42,settings), quiet=new TerrainGenerator(42,{...settings,plantDensity:'none'});
  const vegetation = new Set(['redMushroom','brownMushroom','fern']);
  const chunk=gen.generate(-5,-5);
  assert.ok([...chunk.cells.values()].some(v=>vegetation.has(v.type)));
  assert.ok(![...quiet.generate(-5,-5).cells.values()].some(v=>vegetation.has(v.type)));
});
