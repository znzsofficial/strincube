import type { BlockType } from '../blockTypes';
import type { WorldGenSettings } from '../types';
import type { Column } from './voxelTerrain';
import { hash } from './noise';
import { CHUNK, SEA, indexOf, type Cell } from './voxel';

/** Small clusters leave gaps between discoveries. Each chunk replays global patch
 * anchors within a three-cell halo, then decorates only its own actual surface. */
export function scatterGroundDetails(seed:number, settings:WorldGenSettings, cx:number, cz:number,
  cells:Map<number,Cell>, sample:(x:number,z:number)=>Column) {
  const plants = { none:0, sparse:.22, normal:.52, lush:.86 }[settings.plantDensity];
  const stones = { none:0, sparse:.26, normal:.62, dense:.95 }[settings.structureDensity];
  if (!plants && !stones) return;
  const startX=cx*CHUNK, startZ=cz*CHUNK, stride=9, radius=3;
  for(let gx=Math.floor((startX-radius)/stride); gx<=Math.floor((startX+CHUNK-1+radius)/stride); gx++) {
    for(let gz=Math.floor((startZ-radius)/stride); gz<=Math.floor((startZ+CHUNK-1+radius)/stride); gz++) {
      const ax=gx*stride+Math.floor(hash(seed,gx,gz,1101)*stride);
      const az=gz*stride+Math.floor(hash(seed,gx,gz,1102)*stride);
      const roll=hash(seed,gx,gz,1103);
      if(roll>=Math.max(plants,stones)) continue;
      const anchor=sample(ax,az);
      if(anchor.water!==null) continue;
      const lowBank=anchor.height<=SEA+2 && [[3,0],[-3,0],[0,3],[0,-3]].some(([dx,dz])=>sample(ax+dx,az+dz).water!==null);
      const kind=lowBank?'bank':anchor.biome==='desert'?'scrub':anchor.biome==='forest'||anchor.biome==='jungle'?'wood':anchor.biome==='plains'?'meadow':null;
      if(!kind || roll >= (kind==='bank'?stones:plants)) continue;
      const palette = hash(seed,gx,gz,1104);
      const flower:BlockType = palette<.45?'dandelion':palette<.8?'poppy':'allium';
      for(let z=Math.max(startZ,az-radius);z<=Math.min(startZ+CHUNK-1,az+radius);z++) {
        for(let x=Math.max(startX,ax-radius);x<=Math.min(startX+CHUNK-1,ax+radius);x++) {
          const d=(x-ax)**2+(z-az)**2;
          if(d && hash(seed,x,z,1105) >= .53*(1-d/11)) continue;
          const c=sample(x,z);
          if(c.water!==null || Math.abs(c.height-anchor.height)>1) continue;
          const ground=cells.get(indexOf(x,c.height,z))?.type, i=indexOf(x,c.height+1,z), occupied=cells.get(i);
          if(!ground || (occupied && occupied.type!=='shortGrass')) continue;
          let type:BlockType;
          if(kind==='bank' && (ground==='grass'||ground==='sand') && c.height<=SEA+2) type='riverPebbles';
          else if(kind==='scrub' && ground==='sand' && c.biome==='desert') type='deadBush';
          else if(kind==='meadow' && ground==='grass' && c.biome==='plains') type=flower;
          else if(kind==='wood' && ground==='grass' && (c.biome==='forest'||c.biome==='jungle'))
            type=hash(seed,x,z,1106)<.5?'fern':palette<.73?'brownMushroom':'redMushroom';
          else continue;
          cells.set(i,{type});
        }
      }
    }
  }
}
