import * as THREE from 'three';
import { loadMmdTools } from '../src/engine/modelHelpers';

/** Generated, texture-free PMD triangle: exercises the actual installed loader/WASM. */
function pmdFixture() {
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 255);
  const u16 = (v: number) => {
    u8(v);
    u8(v >> 8);
  };
  const u32 = (v: number) => {
    u16(v);
    u16(v >>> 16);
  };
  const f32 = (v: number) => {
    const a = new ArrayBuffer(4);
    new DataView(a).setFloat32(0, v, true);
    bytes.push(...new Uint8Array(a));
  };
  const text = (s: string, n: number) => {
    const data = new TextEncoder().encode(s);
    for (let i = 0; i < n; i++) u8(data[i] ?? 0);
  };
  text('Pmd', 3);
  f32(1);
  text('smoke', 20);
  text('Generated regression fixture', 256);
  u32(3);
  for (const p of [
    [-1, 0, 0],
    [1, 0, 0],
    [0, 2, 0],
  ]) {
    p.forEach(f32);
    [0, 0, 1].forEach(f32);
    [0, 0].forEach(f32);
    u16(0);
    u16(0);
    u8(100);
    u8(0);
  }
  u32(3);
  [0, 1, 2].forEach(u16);
  u32(1);
  [1, 0.6, 0.3, 1].forEach(f32);
  f32(1);
  [0, 0, 0, 0.2, 0.2, 0.2].forEach(f32);
  u8(255);
  u8(0);
  u32(3);
  text('', 20);
  u16(1);
  text('root', 20);
  u16(65535);
  u16(65535);
  u8(0);
  u16(0);
  [0, 0, 0].forEach(f32);
  u16(0);
  u16(0);
  u8(0);
  u8(0);
  u32(0);
  u8(0);
  for (let i = 0; i < 10; i++) text('', 100);
  u32(0);
  u32(0);
  return new File([new Uint8Array(bytes)], 'smoke.pmd');
}

export async function verifyMmd(assert: (condition: unknown, label: string) => void) {
  const { ThreeMmdLoader, DefaultMmdRuntime } = await loadMmdTools();
  const loader = new ThreeMmdLoader();
  const model = await loader.loadModel(pmdFixture());
  try {
    assert(
      model.mesh instanceof THREE.SkinnedMesh && model.mesh.skeleton.bones.length === 1,
      'MMD 0.8.6 实际加载生成的 PMD 骨骼模型',
    );
    const vmd = new Uint8Array(74);
    vmd.set(new TextEncoder().encode('Vocaloid Motion Data 0002'));
    vmd.set(new TextEncoder().encode('smoke'), 30);
    const motion = await loader.loadAnimation(new File([vmd], 'smoke.vmd'));
    const runtime = new DefaultMmdRuntime({ physics: 'none' });
    runtime.setAnimation(motion.animation, model.mesh);
    runtime.tick(0, { mesh: model.mesh, physics: false, ik: true });
    runtime.tick(1 / 30, { mesh: model.mesh, physics: false, ik: true });
    assert(
      model.mesh.skeleton.bones.every((b) => b.position.toArray().every(Number.isFinite)),
      'MMD 0.8.6 VMD 加载和运行时更新通过',
    );
  } finally {
    const materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    model.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  }
}
