import * as THREE from 'three';
import { blockMaterials, isPlantBlock, materialIndexFor, type BlockType } from '../blocks';

const CAPACITY = 80;
const TAU = Math.PI * 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const waterColors = [0x629dcb, 0x80c2df, 0xb7e6f0];
const glassColors = [0xb0d1d8, 0xd5eeef, 0xedfafa];

// A single 16x16 read per material, independent of the terrain renderer's atlas.
// Pick actual texels rather than averaging away ore flecks and flower petals.
class FaceColors {
  private cache = new Map<number, number[]>();
  private ctx?: CanvasRenderingContext2D | null;

  get(id: number) {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const mat = blockMaterials[id];
    const img = mat.map?.image as HTMLImageElement | HTMLCanvasElement | undefined;
    if (!img?.width || !img.height) return; // TextureLoader may still be decoding it.
    const pixels: number[] = [];
    try {
      if (this.ctx === undefined) {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        this.ctx = c.getContext('2d', { willReadFrequently: true });
      }
      if (this.ctx) {
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.clearRect(0, 0, 16, 16);
        this.ctx.drawImage(img, 0, 0, 16, 16);
        const data = this.ctx.getImageData(0, 0, 16, 16).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > Math.max(16, mat.alphaTest * 255))
            pixels.push((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        }
      }
    } catch {
      // Cache the fallback for unreadable sources and discard any tainted canvas.
      this.ctx = undefined;
    }
    this.cache.set(id, pixels);
    return pixels;
  }

  clear() { this.cache.clear(); this.ctx = undefined; }
}

export class BlockFeedback {
  private mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial(), CAPACITY);
  private slots = Array.from({ length: CAPACITY }, () => ({
    origin: new THREE.Vector3(), velocity: new THREE.Vector3(), size: new THREE.Vector3(), color: new THREE.Color(),
    age: 0, life: 0, gravity: 0, angle: 0, spin: 0,
  }));
  private next = 0;
  private pose = new THREE.Object3D();
  private n = new THREE.Vector3();
  private u = new THREE.Vector3();
  private v = new THREE.Vector3();
  private colors = new FaceColors();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    const mesh = this.mesh;
    mesh.name = 'block-edit-feedback';
    mesh.visible = false;
    mesh.count = 0;
    mesh.frustumCulled = false; // Bursts are at interaction range; no moving sphere rebuilds.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3)
      .setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
  }

  /** Integer cell center of the broken/newly placed block. Both use the ray hit's outward normal. */
  play(kind: 'place' | 'break', type: BlockType, x: number, y: number, z: number,
    normal: { x: number; y: number; z: number }) {
    if (this.disposed) return;
    const place = kind === 'place', water = type === 'water', glass = type === 'glass' || type === 'ice';
    const plant = isPlantBlock(type), leafy = plant || type === 'leaves' || type.endsWith('Leaves');
    const { n, u, v } = this;
    n.set(normal.x, normal.y, normal.z).normalize();
    if (n.lengthSq() === 0) n.set(0, 1, 0); // Ray began inside a cell.
    u.set(0, Math.abs(n.y) > .9 ? 0 : 1, Math.abs(n.y) > .9 ? 1 : 0).cross(n).normalize();
    v.crossVectors(n, u);
    const id = materialIndexFor(type, place ? this.pose.position.copy(n).negate() : n);
    const pixels = water ? waterColors : type === 'glass' ? glassColors : this.colors.get(id);
    const count = place ? 8 : water || leafy || glass ? 10 : 14;

    // Match the footprint of non-cubes. Each origin is in cell-local unit coordinates first.
    const lantern = type === 'lantern' || type === 'soulLantern';
    const width = plant || type === 'itemFrame' ? .8 : type === 'torch' ? .14 : lantern ? .45 : 1;
    const height = type === 'torch' ? .7 : lantern ? .6 : type === 'itemFrame' ? .8 : water ? .95 : 1;
    const depth = type === 'itemFrame' ? .12 : width;
    const phase = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      const p = this.slots[this.next];
      this.next = (this.next + 1) % CAPACITY;
      const angle = phase + (i + rand(-.19, .19)) * TAU / count;
      const a = Math.cos(angle), b = Math.sin(angle);
      // Placement dust squeezes out past the edges of the shared (occluded) face.
      // Break chips peel off the struck face itself, with an outward launch cone.
      const r = place ? .52 / Math.max(Math.abs(a), Math.abs(b)) : rand(.06, .39);
      const face = place ? -.48 : .5;
      p.origin.copy(n).multiplyScalar(face).addScaledVector(u, a * r).addScaledVector(v, b * r);
      p.origin.set(x + width * p.origin.x, y + height * p.origin.y - (1 - height) / 2, z + depth * p.origin.z);
      const speed = place ? rand(.48, .85) : rand(.75, 1.85);
      p.velocity.copy(n).multiplyScalar(place ? rand(.15, .45) : rand(.95, 2.15))
        .addScaledVector(u, speed * a).addScaledVector(v, speed * b);
      if (n.y === 0) p.velocity.y += place ? .25 : rand(.55, 1.2);
      p.age = 0;
      p.life = place ? rand(.18, .28) : rand(.35, .57);
      p.gravity = place ? 2.5 : leafy ? 4.8 : 10;
      p.angle = angle;
      p.spin = (Math.random() < .5 ? -1 : 1) * rand(3, 9);
      const size = (place ? rand(.035, .055) : rand(.055, .11)) * (water || plant ? .75 : 1);
      p.size.set(size * (glass ? 1.35 : 1), size * (water ? 1.35 : leafy || glass ? .32 : .7), size * .78);
      p.color.setHex(pixels?.length ? pixels[Math.floor(Math.random() * pixels.length)] : 0xb8b4aa);
      if (!water && type !== 'glass') p.color.multiply(blockMaterials[id].color);
      p.color.multiplyScalar(rand(.9, 1.12));
    }
    this.mesh.visible = true;
    this.tick(0);
  }

  tick(dt: number) {
    if (!this.mesh.visible) return;
    let count = 0;
    for (const p of this.slots) {
      if (p.life === 0) continue;
      const t = p.age += dt;
      if (t >= p.life) { p.life = 0; continue; }
      const pose = this.pose;
      pose.position.copy(p.origin).addScaledVector(p.velocity, t);
      pose.position.y -= .5 * p.gravity * t * t;
      pose.rotation.set(p.angle + p.spin * t, p.angle * .7, p.spin * t * .6);
      pose.scale.copy(p.size).multiplyScalar(Math.min(1, 2.8 * (1 - t / p.life)));
      pose.updateMatrix();
      this.mesh.setMatrixAt(count, pose.matrix);
      this.mesh.setColorAt(count++, p.color);
    }
    this.mesh.count = count;
    this.mesh.visible = count !== 0;
    if (count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.visible = false;
    this.mesh.count = 0;
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.colors.clear();
  }
}
