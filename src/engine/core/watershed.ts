import type { WorldGenSettings } from '../types';
import { Drainage } from './drainage';
import { fbm, mix, smooth } from './noise';
import { SEA } from './voxel';
import type { Column } from './voxelTerrain';

/** Continuous surface interpreter: ocean shelf → floodplain/terrace → shoulder → ridge. */
export class WatershedSurface {
  private readonly drainage:Drainage;
  private readonly seed:number;
  private readonly settings:WorldGenSettings;
  constructor(seed:number, settings:WorldGenSettings, radius:number|null) {
    this.seed=seed; this.settings=settings;
    this.drainage=new Drainage(seed,radius,settings.riverScale);
  }
  column(x:number,z:number):Column {
    const s=this.seed, cfg=this.settings, scale=210*Math.max(.3,cfg.biomeScale);
    const c=this.drainage.continent(x,z), coast=smooth(.29,.53,c+(1-cfg.oceanScale)*.085);
    const {bank,lake}=this.drainage.sample(x,z);
    const rough=fbm(s+421,x/75,z/75), folds=fbm(s+291,x/125,z/125);
    const ridge=smooth(.53,.82,c) * (.28+.72*(1-Math.abs(2*folds-1))**2);
    const upland=5+rough*4+20*ridge*cfg.mountainScale;
    const terrace=SEA+1.6+rough*1.6;
    // Blend over strips scaled to the landscape. Carve with min so rivers meet the sea floor.
    const band=this.drainage.spacing/64;
    const valley=bank<=0 ? SEA-.55-Math.min(3,-bank*.85) :
      mix(SEA-.55,terrace,smooth(0,3.8*band,bank)) + (upland-terrace)*smooth(10*band,25*band,bank);
    const h=Math.floor(Math.min(mix(-10+rough*4,upland,coast),valley));
    const water=h<SEA?SEA:null, river=bank<0 && coast>.35 && !lake;
    const temperature=fbm(s+31,x/scale,z/scale,2)-Math.max(0,h-10)*.006;
    const humidity=fbm(s+61,(x+300)/scale,z/scale,2)+.09*(1-smooth(0,18,bank));
    const biome=water!==null ? river?'river':lake&&bank<0?'lake':'ocean' :
      h>21 && temperature<.46?'snowyPeaks':temperature<.29?'snow':temperature>.65&&humidity<.40?'desert':
      humidity>.65?'jungle':humidity>.48?'forest':'plains';
    const rock=water===null && biome!=='snowyPeaks' && ridge>.48 && h>13 && rough>.52;
    return {height:h,water,river,biome,temperature,humidity,continentalness:c,rock};
  }
}
