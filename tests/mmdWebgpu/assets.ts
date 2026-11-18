// Original generated fixture: two quads in ONE skinned mesh, each driven by a different bone.
// One white material; the red/blue regions can only come from the external PNG via the model UVs.
class Bytes {
  private data: number[] = [];
  u8(v: number) { this.data.push(v & 255); }
  u16(v: number) { this.u8(v); this.u8(v >>> 8); }
  u32(v: number) { this.u16(v); this.u16(v >>> 16); }
  floats(...values: number[]) {
    const view = new DataView(new ArrayBuffer(4));
    for (const v of values) { view.setFloat32(0, v, true); this.data.push(...new Uint8Array(view.buffer)); }
  }
  ascii(text: string, length: number) { for (let i = 0; i < length; i++) this.u8(text.charCodeAt(i) || 0); }
  file(name: string) { return new File([new Uint8Array(this.data)], name); }
}

function modelFile() {
  const b = new Bytes(); b.ascii('Pmd', 3); b.floats(1); b.ascii('panels', 20); b.ascii('Two bone texture test', 256);
  b.u32(8);
  for (let bone = 0; bone <= 1; bone++) {
    const cx = bone ? .55 : -.55;
    for (const [x, y, u, v] of [[-.36,-.42,0,0],[.36,-.42,1,0],[.36,.42,1,1],[-.36,.42,0,1]]) {
      b.floats(cx + x, y, 0, 0, 0, -1, (bone + .1 + .8*u)/2, .1 + .8*v);
      b.u16(bone); b.u16(0); b.u8(100); b.u8(1);
    }
  }
  b.u32(12); for (const i of [0,2,1,0,3,2,4,6,5,4,7,6]) b.u16(i);
  b.u32(1); b.floats(1,1,1,1, 1, 0,0,0, .1,.1,.1); b.u8(255); b.u8(0); b.u32(12); b.ascii('maps/panels.png',20);
  b.u16(2);
  for (const i of [0, 1]) {
    b.ascii(i ? 'tip' : 'root',20); b.u16(i ? 0 : 65535); b.u16(i ? 65535 : 1);
    b.u8(1); b.u16(0); b.floats(i ? .55 : 0, 0, 0);
  }
  b.u16(0); b.u16(0); b.u8(0); b.u8(0); b.u32(0); b.u8(0);
  for (let i=0; i<10; i++) b.ascii('',100);
  b.u32(0); b.u32(0); return b.file('panels.pmd');
}

function animationFile() {
  const b = new Bytes(); b.ascii('Vocaloid Motion Data 0002',30); b.ascii('panels',20); b.u32(3);
  for (const [frame, y] of [[0,0],[15,.8],[30,0]]) {
    b.ascii('tip',15); b.u32(frame); b.floats(0,y,0, 0,0,0,1);
    // Four identical linear Bezier channels (X,Y,Z,R), plus VMD's shifted padding blocks.
    const p = [20,20,20,20,20,20,20,20,107,107,107,107,107,107,107,107];
    for (let row=0; row<4; row++) for (let i=0; i<16; i++) b.u8(p[row+i] ?? 0);
  }
  for (let i=0; i<5; i++) b.u32(0); // morph, camera, light, self-shadow, IK
  return b.file('bounce.vmd');
}

export async function panelAssets() {
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ef3421'; ctx.fillRect(0,0,16,16);
  ctx.fillStyle = '#2155ef'; ctx.fillRect(16,0,16,16);
  const png = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('PNG encode failed')), 'image/png'));
  const texture = new File([png],'panels.png',{type:'image/png'}), model = modelFile();
  Object.defineProperty(model,'webkitRelativePath',{value:'panels/panels.pmd'});
  Object.defineProperty(texture,'webkitRelativePath',{value:'panels/maps/panels.png'});
  return { model, texture, animation: animationFile() };
}
