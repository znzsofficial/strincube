// node --import ./tests/register.mjs scripts/survey-terrain.ts
// Count possible house footprints on raw terrain, before vegetation or player edits.
import { GENERATOR, PREVIOUS_GENERATOR, TerrainGenerator } from '../src/engine/core/generator.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';

const rows = [];
for (const version of [PREVIOUS_GENERATOR, 'terrain-v2.2', GENERATOR] as const) {
  for (const seed of [42, 7, 12345, 2026]) {
    const gen = new TerrainGenerator(seed, defaultWorldGenSettings, version);
    let plots = 0, dry = 0, buildable = 0;
    for (let x = -256; x < 256; x += 16) for (let z = -256; z < 256; z += 16) {
      let low = Infinity, high = -Infinity, flooded = false;
      for (let dx = 0; dx < 12; dx++) for (let dz = 0; dz < 12; dz++) {
        const c = gen.column(x + dx, z + dz);
        flooded ||= c.water !== null;
        low = Math.min(low, c.height); high = Math.max(high, c.height);
      }
      plots++;
      if (!flooded) { dry++; if (high - low <= 2) buildable++; }
    }
    rows.push({ version, seed, plots, dry, buildable });
  }
}
console.table(rows);
