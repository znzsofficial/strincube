import * as T from 'three';

// Fixed pixel artwork wrapped in longitude. No image request, per-frame texture
// upload or world geometry: both renderers see the same camera-centred sky.
function cloudMap() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const ctx = c.getContext('2d')!;
  let seed = 531;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
  for (let band = 0; band < 3; band++) for (let i = 0; i < 9; i++) {
    const x = Math.floor(i * 57 + random() * 30), y = Math.floor(45 + band * 19 + random() * 8);
    const w = Math.floor(13 + random() * 28), h = 8 - band * 2;
    for (let p = 0; p < 5; p++) {
      const dx = Math.floor(p * w / 6), dy = Math.floor(random() * h / 2), width = Math.floor(w / 3 + random() * w / 4);
      for (const wrap of [-512, 0]) {
        ctx.fillStyle = '#d9e6ec'; ctx.fillRect(x + dx + wrap, y - dy, width, h);
        ctx.fillStyle = '#fffaf0'; ctx.fillRect(x + dx + wrap + 1, y - dy - 1, width - 2, Math.max(2,h-2));
      }
    }
  }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  tex.magFilter = T.NearestFilter; tex.wrapS = T.RepeatWrapping; return tex;
}

export class VoxelSky {
  readonly root = new T.Group();
  private readonly tex = cloudMap();
  private readonly clouds = new T.Mesh(new T.SphereGeometry(1, 40, 20), new T.MeshBasicMaterial({map:this.tex, side:T.BackSide, fog:false, toneMapped:false, alphaTest:.4, depthWrite:false, depthTest:false}));
  private readonly disc = new T.Mesh(new T.PlaneGeometry(1,1), new T.MeshBasicMaterial({fog:false, toneMapped:false, depthWrite:false, depthTest:false}));
  private readonly rim = new T.Mesh(new T.PlaneGeometry(1,1), new T.MeshBasicMaterial({fog:false, toneMapped:false, depthWrite:false, depthTest:false}));
  private readonly orbit = new T.Vector3();
  constructor(scene:T.Scene) {
    this.root.name = 'Voxel sky'; this.root.renderOrder = -100;
    this.rim.renderOrder=-3; this.disc.renderOrder=-2; this.clouds.renderOrder=-1;
    this.root.add(this.rim,this.disc,this.clouds); scene.add(this.root);
  }
  update(time:number,camera:T.PerspectiveCamera,sky:T.Color,depth:number,sunOffset:T.Vector3) {
    const a = time * Math.PI * 2, alt = -Math.cos(a), night = alt < 0;
    this.orbit.set(.57*Math.sin(a),alt,-.82*Math.sin(a)).normalize();
    if(night) this.orbit.negate(); // the opposite body lights the night
    sunOffset.copy(this.orbit).multiplyScalar(70);
    this.root.visible = depth <= .05;
    if(!this.root.visible) return;
    this.root.position.copy(camera.position); this.root.scale.setScalar(camera.far*.8);
    this.tex.offset.x = time * 2;
    this.clouds.material.color.copy(sky).lerp(newWhite, night ? .04 : .55);
    const size = night ? .074 : .098;
    this.disc.position.copy(this.orbit).multiplyScalar(.9); this.rim.position.copy(this.disc.position);
    this.disc.quaternion.copy(camera.quaternion); this.rim.quaternion.copy(camera.quaternion);
    this.disc.scale.setScalar(size); this.rim.scale.setScalar(size*1.32);
    this.disc.material.color.setHex(night ? 0xe2edff : 0xfff5bb);
    this.rim.material.color.copy(sky).lerp(this.disc.material.color,night ? .25 : .46);
  }
  dispose() { this.root.removeFromParent(); this.tex.dispose(); for(const m of [this.clouds,this.disc,this.rim]) { m.geometry.dispose(); m.material.dispose(); } }
}
const newWhite = new T.Color(0xffffff);
