import { World } from '../src/engine/core/world';
import { TerrainGenerator } from '../src/engine/core/generator';
import { indexOf, type Cell } from '../src/engine/core/voxel';
import { defaultWorldGenSettings } from '../src/engine/types';
import { defaultSettings } from '../src/engine/core/session';
import { GameScene } from '../src/engine/render/scene';
import { ChunkRenderer } from '../src/engine/render/chunks';
import { BlockFeedback } from '../src/engine/render/blockFeedback';

const mount = document.querySelector<HTMLElement>('#view')!;
const view = new GameScene(mount, { ...defaultSettings(1), shadows: false });
const world = new World(new TerrainGenerator(42, defaultWorldGenSettings));
const cells = new Map<number, Cell>();
const ridge = new URLSearchParams(location.search).has('ridge');
for (let x = 0; x < 7; x++) for (let z = 0; z < 6; z++) {
  const top = z < 2 ? 2 : x < 3 && z < 4 ? 1 : 0;
  for (let y = -1; y <= top; y++) cells.set(indexOf(x,y,z), {type: ridge ? (y===top && (z<2 || x+z<6) ? 'snow' : 'stone') : y === top ? (x === 3 && z < 4 ? 'stone' : 'grass') : 'dirt'});
}
cells.set(indexOf(4,1,3), {type:'grass'});
const chunk = world.install({x:0, z:0, cells});
const chunks = new ChunkRenderer(world, view.scene, {workerFactory:null});
const fx = new BlockFeedback(view.scene);
view.camera.position.set(8.4, 5.1, 9.4); view.camera.lookAt(3,.55,2.5);
const edit = document.querySelector<HTMLButtonElement>('#edit')!, time = document.querySelector<HTMLButtonElement>('#time')!;
let day = .40, placed = true, last = performance.now(), raf = 0;
void chunks.prepareMaterials().then(() => {
  chunks.rebuild(chunk); edit.disabled = false;
  edit.onclick = () => {
    placed = !placed;
    world.set(4,1,3,placed ? {type:'grass'} : null); chunks.rebuild(chunk);
    fx.play(placed ? 'place' : 'break','grass',4,1,3,placed ? {x:0,y:1,z:0} : {x:0,y:0,z:1});
    edit.textContent = placed ? '敲碎草方块' : '放回草方块';
  };
});
time.onclick = () => { day = day === .40 ? .75 : .40; time.textContent = day === .40 ? '切换到黄昏' : '切换到白天'; };
function draw(now:number) { const dt = Math.min(.08,(now-last)/1000); last=now; fx.tick(dt); view.draw(day,dt,now); raf=requestAnimationFrame(draw); }
raf=requestAnimationFrame(draw);
window.addEventListener('pagehide', () => { cancelAnimationFrame(raf); fx.dispose(); chunks.dispose(); view.dispose(); world.dispose(); }, {once:true});
