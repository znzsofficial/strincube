import { MeshToonMaterial, type Material } from 'three';
import { MeshToonNodeMaterial } from 'three/webgpu';
import type { ThreeMmdModel } from '@yohawing/three-mmd-loader';

/** Opaque diffuse-textured, linearly skinned MMD preview. Not the loader's full MMD shader.
 * Use raw loader materials for animation/cleanup; the node materials borrow the diffuse maps. */
export function diffuseSkin(model: ThreeMmdModel) {
  const mesh = model.mesh, original = mesh.material;
  if (model.outlineMeshes.length || model.renderOrderMeshes.length || mesh.geometry.hasAttribute('matricesSdefEnabled') || mesh.geometry.hasAttribute('matricesQdefEnabled'))
    throw Error('Preview requires a single linear-skinned body without proxies');
  const inputs = (Array.isArray(original) ? original : [original]).map((m: Material) => {
    if (!(m instanceof MeshToonMaterial) || !m.map || m.transparent || m.opacity !== 1 || m.userData.mmdSphereTexture)
      throw Error('Preview supports opaque diffuse-textured toon materials only');
    return m;
  });
  const mats = inputs.map(src => new MeshToonNodeMaterial({ name:src.name, map:src.map, side:src.side, alphaTest:src.alphaTest }));
  return {
    update(seconds: number) {
      mesh.material = original;
      model.update(seconds, { physics:false, ik:false });
      mats.forEach((m,i) => { m.color.copy(inputs[i].color); m.visible = inputs[i].visible; });
      mesh.material = Array.isArray(original) ? mats : mats[0];
    },
    dispose() { mesh.material = original; for (const m of mats) m.dispose(); },
  };
}
