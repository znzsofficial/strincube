import assert from 'node:assert/strict';
import test from 'node:test';
import { submergedDepth } from '../src/engine/core/immersion';
import { Player } from '../src/engine/core/player';
import { World } from '../src/engine/core/world';
import { TerrainGenerator } from '../src/engine/core/generator';
import { defaultWorldGenSettings } from '../src/engine/types';

test('a single jump from the bottom of a one-cell water hole clears a one-block bank, not a two-block wall', () => {
  for (const bank of [1, 2]) {
    const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
    world.install({x:0,z:0,cells:new Map()});
    for (let x=1; x<=5; x++) for (let z=1; z<=7; z++) {
      const hole = x===3 && z===5;
      for(let y=0; y<=(hole?0:bank); y++) world.set(x,y,z,{type:'stone'});
      if(hole) world.set(x,1,z,{type:'water',level:7});
    }
    const p = new Player({x:3,y:.51,z:5,yaw:0,pitch:0});
    for(let i=0;i<45;i++) p.update(world,1/60,0,-1,false,5.4);
    for(let i=0;i<28;i++) p.update(world,1/60,0,-1,i===0,5.4);
    if(bank===1) { assert.ok(p.state.z<4.5); assert.ok(p.state.y>=1.49); }
    else assert.ok(p.state.z>4.5);
    world.dispose();
  }
});

test('submersion respects flowing water height and the air above a covered cell', () => {
  const column = { get: (_x:number,y:number,_z:number) => y < 0 ? {type:'water' as const} : y === 0 ? {type:'water' as const,level:2} : null };
  assert.equal(submergedDepth(column,0,0,0),0);
  assert.ok(Math.abs(submergedDepth(column,0,-1,0) - (.5+.95*2/7)) < 1e-9);
  assert.equal(submergedDepth(column,0,-90,0),8);
});

test('forward strokes follow pitch; jump overrides diving; released swimmer settles slowly', () => {
  const world = new World(new TerrainGenerator(42,defaultWorldGenSettings));
  world.install({x:0,z:0,cells:new Map()});
  for(let y=0;y<8;y++) for(let z=0;z<12;z++) world.set(2,y,z,{type:'water',level:7});
  const swim = (pitch:number, move:number,jump:boolean) => {
    const p = new Player({x:2,y:3,z:7,yaw:0,pitch});
    for(let i=0;i<20;i++) p.update(world,1/60,0,move,jump,5.4);
    return p.state.y;
  };
  assert.ok(swim(.9,-1,false)>3.3); assert.ok(swim(-.9,-1,false)<2.7);
  assert.ok(swim(-.9,-1,true)>3.5); assert.ok(swim(0,0,false)>2.8 && swim(0,0,false)<3);
  world.dispose();
});
