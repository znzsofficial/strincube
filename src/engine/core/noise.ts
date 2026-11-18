export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export function smooth(lo: number, hi: number, x: number) {
  const t = clamp((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}
export function hash(seed: number, x: number, z: number, salt = 0) {
  let n =
    Math.imul(x | 0, 374761393) ^
    Math.imul(z | 0, 668265263) ^
    Math.imul(seed | 0, 1274126177) ^
    Math.imul(salt, 1597334677);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function noise(seed: number, x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const tx = smooth(0, 1, x - ix),
    tz = smooth(0, 1, z - iz);
  return mix(
    mix(hash(seed, ix, iz), hash(seed, ix + 1, iz), tx),
    mix(hash(seed, ix, iz + 1), hash(seed, ix + 1, iz + 1), tx),
    tz,
  );
}
export function fbm(seed: number, x: number, z: number, octaves = 3) {
  let sum = 0,
    weight = 0,
    amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(seed + i * 43, x, z) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    x *= 2;
    z *= 2;
  }
  return sum / weight;
}
export function noise3(seed: number, x: number, y: number, z: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const tx = smooth(0, 1, x - ix),
    ty = smooth(0, 1, y - iy),
    tz = smooth(0, 1, z - iz);
  const slice = (h: number) =>
    mix(
      mix(hash(seed, ix, iz, h), hash(seed, ix + 1, iz, h), tx),
      mix(hash(seed, ix, iz + 1, h), hash(seed, ix + 1, iz + 1, h), tx),
      tz,
    );
  return mix(slice(iy), slice(iy + 1), ty);
}
