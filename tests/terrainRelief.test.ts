import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator, GENERATOR, PREVIOUS_GENERATOR } from '../src/engine/core/generator';
import { GameSession } from '../src/engine/core/session';
import { defaultWorldGenSettings } from '../src/engine/types';

test('default uplands are lower and gentler across representative seeds, with distinct ridges', () => {
  const records = [PREVIOUS_GENERATOR, GENERATOR].map(version => {
    const heights:number[] = [], steps:number[] = [];
    for (const seed of [42,7,12345,2026]) {
      const g = new TerrainGenerator(seed, defaultWorldGenSettings, version);
      for (let x=-512; x<=512; x+=8) for (let z=-512; z<=512; z+=8) {
        const c = g.column(x,z);
        if (c.water !== null) continue;
        heights.push(c.height - 1); steps.push(Math.abs(c.height - g.column(x+8,z).height));
      }
    }
    const p95 = (a:number[]) => a.sort((a,b)=>a-b)[Math.floor(a.length*.95)];
    return { upland:p95(heights), slope:p95(steps), peak:heights.at(-1)! };
  });
  const [old, next] = records;
  assert.ok(next.upland <= old.upland*.6 && next.slope < old.slope);
  assert.ok(next.peak > 18 && next.peak < 30);
});

test('loading and resaving a v2.1 edit journal keeps its generator identity', () => {
  const session = new GameSession({ seed:42, state:{generator:PREVIOUS_GENERATOR, edits:[], player:{x:0,y:10,z:0,yaw:0,pitch:0}} });
  try { assert.equal(session.world.generator.version, PREVIOUS_GENERATOR); assert.equal(session.snapshot().generator, PREVIOUS_GENERATOR); }
  finally { session.dispose(); }
});
