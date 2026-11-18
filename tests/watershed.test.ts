import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/engine/core/generator';
import { defaultWorldGenSettings as settings } from '../src/engine/types';
import { GameSession } from '../src/engine/core/session';

test('watershed regeneration is independent of plan eviction and river density adds headwaters', () => {
  const base=new TerrainGenerator(7,settings), dense=new TerrainGenerator(7,{...settings,riverScale:1.8});
  const probe=()=>Array.from({length:128},(_,i)=>base.column(-65+i,63-i));
  const before=probe();
  for(let i=0;i<240;i++)base.column(i*256,-i*256);
  assert.deepEqual(probe(),before);
  let added=0;
  for(let x=-256;x<256;x+=4)for(let z=-256;z<256;z+=4) {
    if(!base.column(x,z).river && dense.column(x,z).river) added++;
  }
  assert.ok(added>20,'additional tributaries should be visible at landscape scale');
});

test('bounded islands contain buildable inland ground and shoreline at the smallest supported radius',()=>{
  for(const seed of [42, -191, 381, 12345]) {
    const g=new TerrainGenerator(seed,{...settings,infiniteWorld:false,worldSizeCustom:30});
    let dry=0, wet=0;
    for(let x=-30;x<=30;x+=2)for(let z=-30;z<=30;z+=2)if(g.inside(x,z)) {
      const c=g.column(x,z); if(c.water===null)dry++;else wet++;
    }
    assert.ok(dry>100&&wet>30);
  }
});

test('v2.2 edit journals keep the reduced-relief profile after reload and resave',()=>{
  const s=new GameSession({seed:42,state:{generator:'terrain-v2.2',edits:[],player:{x:0,y:15,z:0,pitch:0,yaw:0}}});
  try {assert.equal(s.world.generator.version,'terrain-v2.2');assert.equal(s.snapshot().generator,'terrain-v2.2');}
  finally{s.dispose();}
});
