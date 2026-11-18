import assert from 'node:assert/strict';
import test from 'node:test';
import { submergedDepth } from '../src/engine/core/immersion';
import { Player } from '../src/engine/core/player';
import { World } from '../src/engine/core/world';
import { TerrainGenerator } from '../src/engine/core/generator';
import { defaultWorldGenSettings } from '../src/engine/types';

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
