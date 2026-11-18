import { BOTTOM, TOP, CHUNK, isPlant, transparent, positionOf } from './voxel';
import { meshCellIndex, type MeshSnapshot, type MeshBatchMaterial } from './meshSnapshot';

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
function quad(b: Build, corners: number[][], normal: number[], x: number, y: number, z: number, batch?: MeshBatchMaterial) {
  const start = b.p.length / 3;
  for (const c of corners) {
    b.p.push(x + c[0], y + c[1], z + c[2]);
    b.n.push(...normal);
    if (batch) b.color.push(...batch.color);
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
  const read = (x: number, y: number, z: number) =>
    y < BOTTOM || y > TOP ? null : (snapshot.palette[snapshot.cells[meshCellIndex(x, y, z)] - 1] ?? null);
  for (const index of snapshot.indices) {
    const lx = index % CHUNK,
      lz = Math.floor(index / CHUNK) % CHUNK;
    const { x, y, z } = positionOf(index, snapshot.x, snapshot.z);
    const cell = read(lx, y, lz)!;
    const type = cell.type,
      materials = snapshot.materials[type]!;
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
    const special = type === 'torch' || type === 'lantern' || type === 'soulLantern' || type === 'itemFrame';
    for (let face = 0; face < meshFaces.length; face++) {
      const f = meshFaces[face],
        [dx, dy, dz] = f.n;
      const neighbor = read(lx + dx, y + dy, lz + dz);
      if (!special && (!transparent(neighbor) || neighbor?.type === type)) continue;
      if (type === 'water' && neighbor?.type === 'water') continue;
      const id = type === 'itemFrame' && cell.item ? cell.item : materials[face];
      let corners = f.c;
      if (type === 'water') {
        const above = read(lx, y + 1, lz)?.type === 'water';
        const top = above ? 0.5 : -0.5 + (0.95 * (cell.level ?? 7)) / 7;
        corners = f.c.map(([a, b, c]) => [a, b > 0 ? top : b, c]);
      } else if (special) {
        const sx = type === 'torch' ? 0.14 : type === 'itemFrame' ? 0.8 : 0.45;
        const sy = type === 'torch' ? 0.7 : type === 'itemFrame' ? 0.8 : 0.6;
        const sz = type === 'itemFrame' ? 0.12 : sx;
        corners = f.c.map(([a, b, c]) => [a * sx, b * sy - (1 - sy) / 2, c * sz]);
      }
      quad(build(id), corners, f.n, x, y, z, typeof id === 'number' ? snapshot.batches?.[id] : undefined);
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
