import { GENERATOR, TerrainGenerator } from '../src/engine/core/generator';
import { defaultWorldGenSettings, type BlockGameApi } from '../src/engine/types';
import { createGame } from '../src/engine/runtime';
import { readRendererPreference } from '../src/rendererPreference';

const maps=document.querySelector<HTMLElement>('#maps')!, status=document.querySelector<HTMLElement>('#status')!;
const field=document.querySelector<HTMLElement>('#field')!, lock=document.querySelector<HTMLButtonElement>('#lock')!;
let api:BlockGameApi|undefined, abort:AbortController|undefined;
function stop() { abort?.abort(); api?.dispose(); api=undefined; lock.disabled=true; }
function atlas() {
  stop(); maps.replaceChildren(); status.textContent='请选择地图上的位置。';
  const seed=Number(document.querySelector<HTMLInputElement>('#seed')!.value)|0;
  for(const version of ['terrain-v2.2',GENERATOR] as const) {
    const gen=new TerrainGenerator(seed,defaultWorldGenSettings,version), fig=document.createElement('figure');
    const canvas=document.createElement('canvas'), caption=document.createElement('figcaption');
    caption.textContent=version===GENERATOR?'新版 · 流域与河阶':'上一版 · 平行河谷';
    canvas.width=canvas.height=240;
    const ctx=canvas.getContext('2d')!, image=ctx.createImageData(240,240);
    for(let j=0;j<240;j++) for(let i=0;i<240;i++) {
      const x=(i-120)*3,z=(j-120)*3,c=gen.column(x,z),h=c.height;
      const k= Math.floor(h/4)*5;
      image.data.set(c.water!==null ? [46,111+h*1.5,150+h,255] : [109+k,150+k*.45,91+k*.7,255],4*(j*240+i));
    }
    ctx.putImageData(image,0,0); fig.append(caption,canvas); maps.append(fig);
    canvas.onclick=async e=>{
      stop(); const ctl=abort=new AbortController();
      const r=canvas.getBoundingClientRect(), x=Math.floor((e.clientX-r.left)/r.width*240-120)*3,z=Math.floor((e.clientY-r.top)/r.height*240-120)*3;
      status.textContent=`加载 ${version} · ${x}, ${z}`;
      try {
        const c=gen.column(x,z);
        const game=await createGame(field,()=>{},undefined,{rendererPreference:readRendererPreference(),signal:ctl.signal,initialSave:{version:3,name:'样区',seed,savedAt:0,timeOfDay:.35,worldGen:defaultWorldGenSettings,settings:{},hotbar:[],activeSlot:0,importedModels:[],engineData:{generator:version,player:{x,y:Math.max(c.height,c.water??c.height)+3.5,z,yaw:0,pitch:-.18},edits:[],assets:[],placements:[]}}});
        if(ctl.signal.aborted) {game.dispose();return;}
        api=game;lock.disabled=false;status.textContent=`样区就绪 · ${version} · (${x}, ${z}) · ${c.biome}`;field.scrollIntoView({block:'nearest'});
      } catch(err) { if(!ctl.signal.aborted)status.textContent=String(err); }
    };
  }
}
document.querySelector<HTMLButtonElement>('#map')!.onclick=atlas;
lock.onclick=()=>{void api?.lockControls();}; window.addEventListener('pagehide',stop); atlas();
