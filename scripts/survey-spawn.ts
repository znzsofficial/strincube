// Terrain-only walking audit: reach dry ground by cardinal single-block steps;
// test every tile of a 12x12 house footprint, ignoring removable vegetation.
import { TerrainGenerator } from '../src/engine/core/generator.ts';
import { findSpawn } from '../src/engine/core/player.ts';
import { World } from '../src/engine/core/world.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';

const records = [];
for (const seed of [42, 7, 12345, 2026, 381, -191, 983, 7193]) {
  const gen = new TerrainGenerator(seed, defaultWorldGenSettings), world = new World(gen);
  const spawn = findSpawn(world), R = 80, size = 2 * R + 1;
  const heights = new Int16Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const c = gen.column(spawn.x + x - R, spawn.z + z - R);
    heights[z * size + x] = c.water === null ? c.height : -1000;
  }
  const start = R * size + R, queue = [start], dist = new Int16Array(size * size).fill(-1);
  dist[start] = 0;
  let walk:number|null = null;
  for (let k=0;k<queue.length;k++) {
    const i=queue[k], x=i%size, z=Math.floor(i/size);
    if(x>=5 && z>=5 && x+6<size && z+6<size) {
      let lo=Infinity, hi=-Infinity;
      for(let dz=-5;dz<=6 && hi-lo<=2;dz++) for(let dx=-5;dx<=6;dx++) {
        const h=heights[i+dz*size+dx];lo=Math.min(lo,h);hi=Math.max(hi,h);
      }
      if(lo>-1000 && hi-lo<=2){walk=dist[i];break;}
    }
    if(dist[i]>=R)continue;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,nz=z+dz,j=nz*size+nx;
      if(nx<0||nz<0||nx>=size||nz>=size||dist[j]>=0||heights[j]===-1000||Math.abs(heights[j]-heights[i])>1)continue;
      dist[j]=dist[i]+1;queue.push(j);
    }
  }
  records.push({seed,spawnX:spawn.x,spawnZ:spawn.z,walkToHousePlot:walk}); world.dispose();
}
console.table(records);
