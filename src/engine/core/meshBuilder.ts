import { BOTTOM, TOP, CHUNK, isPlant, transparent, positionOf, type Cell } from './voxel';
import { MESH_LAYER, MESH_WIDTH, meshCellIndex, type MeshSnapshot, type MeshBatchMaterial } from './meshSnapshot';

import { waterTop } from './immersion';
import { pebbleShapes } from './pebbles';

export const meshFaces = [
  {
    n: [1, 0, 0],
    c: [
      [0.5, -0.5, 0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
    ],
  },
  {
    n: [-1, 0, 0],
    c: [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
    ],
  },
  {
    n: [0, 1, 0],
    c: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
  },
  {
    n: [0, -1, 0],
    c: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
  },
  {
    n: [0, 0, 1],
    c: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
  },
  {
    n: [0, 0, -1],
    c: [
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
    ],
  },
];
export type MeshPart = {
  material: number | string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors?: Float32Array;
  indices: Uint16Array | Uint32Array;
  sphere: { x: number; y: number; z: number; radius: number };
};
type Build = { p: number[]; n: number[]; uv: number[]; i: number[]; color: number[] };
const isSmall = (type: Cell['type']) => type === 'torch' || type === 'lantern' || type === 'soulLantern' || type === 'itemFrame';
const faceSteps = meshFaces.map(({ n: [x, y, z] }) => x + y * MESH_LAYER + z * MESH_WIDTH);
const white = [1, 1, 1] as const;
const sideContact = [0.80, 0.80, 1, 1] as const; // Bottom two vertices, in side quad order.
// Precompute the 16 top-face patterns: corners touching two raised edges darken more.
const topContact = Array.from({ length: 16 }, (_, mask) => {
  if (!mask) return undefined;
  return meshFaces[2].c.map(([x, , z]) => {
    const wallX = mask & (x < 0 ? 1 : 2), wallZ = mask & (z < 0 ? 4 : 8);
    return 1 - (wallX ? 0.16 : 0) - (wallZ ? 0.16 : 0);
  });
});

function quad(b: Build, corners: number[][], normal: number[], x: number, y: number, z: number,
  batch?: MeshBatchMaterial, shade?: readonly number[]) {
  const start = b.p.length / 3;
  // Original materials keep their uniform tint. Only create their neutral RGB stream
  // on first contact, including neutral vertices emitted earlier in the same group.
  const colored = batch || shade || b.color.length;
  if (colored && !b.color.length && start) b.color = new Array(b.p.length).fill(1);
  const tint = batch?.color ?? white;
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    b.p.push(x + c[0], y + c[1], z + c[2]);
    b.n.push(normal[0], normal[1], normal[2]);
    if (colored) {
      const s = shade?.[i] ?? 1;
      b.color.push(tint[0] * s, tint[1] * s, tint[2] * s);
    }
  }
  const [u, v, w, h] = batch?.uv ?? [0, 0, 1, 1];
  b.uv.push(u, v, u + w, v, u + w, v + h, u, v + h);
  b.i.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

/** Pure meshing: no world ownership, DOM, texture loading, or GPU dependencies. */
export function buildMesh(snapshot: MeshSnapshot): MeshPart[] {
  const builds = new Map<number | string, Build>();
  const build = (id: number | string) => {
    if (typeof id === 'number') id = snapshot.batches?.[id]?.material ?? id;
    let b = builds.get(id);
    if (!b) {
      b = { p: [], n: [], uv: [], i: [], color: [] };
      builds.set(id, b);
    }
    return b;
  };
  const { cells, palette } = snapshot;
  // Resolve type rules once per palette, including halo-only cells. Small models
  // retain their face-culling behavior but don't cast cube-shaped contact shadows.
  const opaque = new Uint8Array(palette.length + 1), contact = new Uint8Array(palette.length + 1);
  palette.forEach((cell, i) => {
    opaque[i + 1] = Number(!transparent(cell));
    contact[i + 1] = opaque[i + 1] && Number(!isSmall(cell.type));
  });
  for (const index of snapshot.indices) {
    const lx = index % CHUNK,
      lz = Math.floor(index / CHUNK) % CHUNK;
    const { x, y, z } = positionOf(index, snapshot.x, snapshot.z);
    const center = meshCellIndex(lx, y, lz), cellId = cells[center];
    const cell = palette[cellId - 1];
    const type = cell.type,
      materials = snapshot.materials[type]!;
    if (type === 'riverPebbles') {
      // Three low stones share the gravel material batch; omit buried undersides.
      for (const stone of pebbleShapes(x,z)) {
        for (let i=0; i<meshFaces.length; i++) {
          if(i===3) continue;
          const f=meshFaces[i], id=materials[i];
          quad(build(id), f.c.map(([a,b,c]) => [stone.x+a*stone.w,stone.y+b*stone.h,stone.z+c*stone.d]),
            f.n,x,y,z,snapshot.batches?.[id]);
        }
      }
      continue;
    }
    if (isPlant(type)) {
      const b = build(materials[2]);
      quad(
        b,
        [
          [-0.4, -0.5, -0.4],
          [0.4, -0.5, 0.4],
          [0.4, 0.5, 0.4],
          [-0.4, 0.5, -0.4],
        ],
        [-0.707, 0, 0.707],
        x,
        y,
        z,
        snapshot.batches?.[materials[2]],
      );
      quad(
        b,
        [
          [0.4, -0.5, -0.4],
          [-0.4, -0.5, 0.4],
          [-0.4, 0.5, 0.4],
          [0.4, 0.5, -0.4],
        ],
        [-0.707, 0, -0.707],
        x,
        y,
        z,
        snapshot.batches?.[materials[2]],
      );
      continue;
    }
    const special = isSmall(type);
    for (let face = 0; face < meshFaces.length; face++) {
      const f = meshFaces[face], adjacent = center + faceSteps[face];
      const neighbor = cells[adjacent] ?? 0; // out of vertical bounds is air
      if (!special && neighbor && (opaque[neighbor] || palette[neighbor - 1].type === type)) continue;
      const id = type === 'itemFrame' && cell.item ? cell.item : materials[face];
      let corners = f.c;
      if (type === 'water') {
        const above = palette[cells[center + MESH_LAYER] - 1]?.type === 'water';
        const top = waterTop(cell.level, above);
        corners = f.c.map(([a, b, c]) => [a, b > 0 ? top : b, c]);
      } else if (special) {
        const sx = type === 'torch' ? 0.14 : type === 'itemFrame' ? 0.8 : 0.45;
        const sy = type === 'torch' ? 0.7 : type === 'itemFrame' ? 0.8 : 0.6;
        const sz = type === 'itemFrame' ? 0.12 : sx;
        corners = f.c.map(([a, b, c]) => [a * sx, b * sy - (1 - sy) / 2, c * sz]);
      }
      let shade: readonly number[] | undefined;
      if (contact[cellId]) {
        if (face === 2 && y < TOP) {
          // Four cardinal samples in the layer above, never a diagonal chunk.
          const mask = contact[cells[adjacent - 1]] | (contact[cells[adjacent + 1]] << 1) |
            (contact[cells[adjacent - MESH_WIDTH]] << 2) | (contact[cells[adjacent + MESH_WIDTH]] << 3);
          shade = topContact[mask];
        } else if (f.n[1] === 0 && y > BOTTOM && contact[cells[adjacent - MESH_LAYER]]) {
          shade = sideContact;
        }
      }
      quad(build(id), corners, f.n, x, y, z, typeof id === 'number' ? snapshot.batches?.[id] : undefined, shade);
    }
  }
  return [...builds].map(([material, b]) => {
    const positions = new Float32Array(b.p);
    // Same box-centered sphere as BufferGeometry.computeBoundingSphere, on final Float32 data.
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }
    const x = (minX + maxX) / 2,
      y = (minY + maxY) / 2,
      z = (minZ + maxZ) / 2;
    let radiusSq = 0;
    for (let i = 0; i < positions.length; i += 3)
      radiusSq = Math.max(
        radiusSq,
        (positions[i] - x) ** 2 + (positions[i + 1] - y) ** 2 + (positions[i + 2] - z) ** 2,
      );
    return {
      material,
      positions,
      normals: new Float32Array(b.n),
      uvs: new Float32Array(b.uv),
      ...(b.color.length ? { colors: new Float32Array(b.color) } : {}),
      indices: positions.length / 3 > 65535 ? new Uint32Array(b.i) : new Uint16Array(b.i),
      sphere: { x, y, z, radius: Math.sqrt(radiusSq) },
    };
  });
}

export function meshResultTransfers(parts: MeshPart[]): ArrayBuffer[] {
  return parts.flatMap(
    (part) =>
      [part.positions.buffer, part.normals.buffer, part.uvs.buffer, part.indices.buffer,
        ...(part.colors ? [part.colors.buffer] : [])] as ArrayBuffer[],
  );
}
