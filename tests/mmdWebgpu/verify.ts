import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createMmdTextureMapFromFiles, disposeMmdModel, ThreeMmdLoader } from '@yohawing/three-mmd-loader';
import { panelAssets } from './assets';
import type { diffuseSkin } from './diffuseSkin';

const run = document.querySelector<HTMLButtonElement>('#run')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const result = document.querySelector<HTMLPreElement>('#result')!;
const pictures = document.querySelector<HTMLDivElement>('#pictures')!;
const size = 192;
function assert(ok: unknown, why: string): asserts ok { if (!ok) throw Error(why); }

function inspect(canvas: HTMLCanvasElement, label: string) {
  const copy = document.createElement('canvas'); copy.width = copy.height = size;
  const ctx = copy.getContext('2d')!; ctx.drawImage(canvas,0,0);
  const bytes = ctx.getImageData(0,0,size,size).data;
  const regions = [0,1].map(() => ({ n:0,x:0,y:0,r:0,g:0,b:0 }));
  for (let i=0; i<bytes.length; i+=4) {
    const [r,g,b] = [bytes[i],bytes[i+1],bytes[i+2]];
    const region = r>60 && r>2*g && r>2*b ? regions[0] : b>60 && b>2*g && b>2*r ? regions[1] : null;
    if (region) {
      region.n++; region.x += i/4 % size; region.y += Math.floor(i/4 / size);
      region.r += r; region.g += g; region.b += b;
    }
  }
  const fig = document.createElement('figure'), caption = document.createElement('figcaption');
  caption.textContent = label; fig.append(caption,copy); pictures.append(fig);
  const [red,blue] = regions.map(p => ({ n:p.n, x:p.x/p.n, y:p.y/p.n, rgb:[p.r,p.g,p.b].map(sum=>Math.round(sum/p.n)) }));
  assert(red.n>900 && blue.n>900 && red.x+45<blue.x, `${label}: expected separate printed panels (${JSON.stringify({red,blue})})`);
  return { red,blue };
}

async function verify(renderer: THREE.WebGLRenderer | WebGPURenderer, assets: Awaited<ReturnType<typeof panelAssets>>, label: string) {
  renderer.setPixelRatio(1); renderer.setSize(size,size); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1.6,1.6,1.6,-1.6,.1,10);
  camera.position.set(0,.35,4); camera.lookAt(0,.35,0); scene.background = new THREE.Color(0x181818);
  const light = new THREE.DirectionalLight(0xffffff,2); light.position.set(0,0,4);
  scene.add(light,new THREE.AmbientLight(0xffffff,.5));
  const loader = new ThreeMmdLoader({ textureMap:createMmdTextureMapFromFiles([assets.model,assets.texture],assets.model) });
  const native = !(renderer instanceof THREE.WebGLRenderer);
  const model = await loader.loadModel(assets.model, native ? { outline:false,materialRenderOrder:false,morphSplit:false } : {});
  let preview: ReturnType<typeof diffuseSkin> | undefined;
  try {
    const mesh = model.mesh, tip = mesh.skeleton.getBoneByName('tip');
    assert(tip && mesh.isSkinnedMesh && mesh.skeleton.bones.length===2, 'PMD skeleton did not load');
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    assert(material instanceof THREE.MeshToonMaterial && material.map?.image instanceof HTMLImageElement && material.map.image.naturalWidth === 32, 'Relative PNG did not load');
    const motion = await loader.loadAnimation(assets.animation); model.setAnimation(motion);
    if (native) preview = (await import('./diffuseSkin')).diffuseSkin(model);
    scene.add(model.root);
    const frames = [];
    for (const key of [0, 7.5, 15, 30]) {
      if (preview) preview.update(key/30); else model.update(key/30,{ physics:false,ik:false });
      if (!frames.length) await renderer.compileAsync(scene,camera);
      renderer.render(scene,camera);
      frames.push({ frame:key, tipY:tip.position.y, ...inspect(renderer.domElement,`${label} · ${key} 帧`) });
    }
    const [rest,mid,peak,end] = frames;
    assert(Math.abs(rest.tipY)<.01 && mid.tipY>.2 && mid.tipY<.6 && Math.abs(peak.tipY-.8)<.01 && Math.abs(end.tipY)<.01, 'VMD bone sampling failed: '+frames.map(f=>f.tipY));
    assert(frames.every(f=>Math.abs(f.red.y-rest.red.y)<1 && Math.abs(f.blue.x-rest.blue.x)<1) && rest.blue.y-mid.blue.y>12 && mid.blue.y-peak.blue.y>12 && Math.abs(end.blue.y-rest.blue.y)<1, 'Pixels did not follow only the keyed child bone');
    return { parser:model.diagnostics.core.kind, frames };
  } finally { preview?.dispose(); disposeMmdModel(model); }
}

run.disabled = false; status.textContent = '就绪';
run.onclick = async () => {
  run.disabled = true; delete result.dataset.outcome; result.textContent = ''; pictures.replaceChildren();
  const report: Record<string,unknown> = {};
  try {
    const assets = await panelAssets(); status.textContent = 'WebGL 对照…';
    const gl = new THREE.WebGLRenderer({antialias:false});
    let baseline: Awaited<ReturnType<typeof verify>>;
    try {
      report.webgl = baseline = await verify(gl,assets,'WebGL');
      assert(!gl.getContext().isContextLost() && gl.getContext().getError()===gl.getContext().NO_ERROR,'WebGL draw failed');
    } finally { gl.dispose(); gl.forceContextLoss(); }
    status.textContent = 'WebGPU 验证…';
    const { WebGPURenderer } = await import('three/webgpu');
    const renderer = new WebGPURenderer({ antialias:false, forceWebGL:new URLSearchParams(location.search).has('forceWebGL') });
    let initialized = false;
    try {
      await renderer.init(); initialized = true;
      const backend = renderer.backend as typeof renderer.backend & { isWebGPUBackend?:boolean; isWebGLBackend?:boolean; device?:GPUDevice };
      if (backend.isWebGLBackend) {
        report.candidate = 'WebGLBackend (Three fallback); native WebGPU test skipped';
        status.textContent = 'WebGL 通过；WebGPU 不可用'; result.dataset.outcome = 'fallback';
      } else {
        assert(backend.isWebGPUBackend && backend.device,'Unknown backend after init');
        const info = backend.device.adapterInfo;
        report.adapter = info && {vendor:info.vendor,architecture:info.architecture,isFallbackAdapter:info.isFallbackAdapter};
        const issues: unknown[] = []; renderer.onDeviceLost = e=>issues.push(e); renderer.onError = e=>issues.push(e);
        const native = await verify(renderer,assets,'WebGPU');
        for (const [i, sample] of native.frames.entries()) for (const panel of ['red','blue'] as const) {
          const ref = baseline.frames[i][panel], actual = sample[panel];
          assert(Math.abs(ref.x-actual.x)<1 && Math.abs(ref.y-actual.y)<1 && Math.abs(actual.n/ref.n-1)<.05, 'WebGPU panel shape/pose differs from WebGL');
        }
        await backend.device.queue.onSubmittedWorkDone(); await new Promise<void>(r=>requestAnimationFrame(()=>r()));
        assert(!issues.length,'WebGPU reported: '+JSON.stringify(issues));
        report.candidate = {actual:'WebGPUBackend', ...native};
        status.textContent = 'WebGL 与原生 WebGPU 均通过'; result.dataset.outcome = 'native';
      }
    } finally { if (initialized) await renderer.dispose(); }
  } catch(e) { report.error = e instanceof Error ? e.message : String(e); status.textContent = '验证失败'; result.dataset.outcome = 'error'; }
  finally { result.textContent = JSON.stringify(report,null,2); run.disabled = false; }
};
