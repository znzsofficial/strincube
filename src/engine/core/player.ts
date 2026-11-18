import { BOTTOM, TOP, chunkCoord, isSolid, type Position } from './voxel';
import { World } from './world';
import { submergedDepth } from './immersion';

export const EYE = 1.62;
const HEIGHT = 1.8,
  RADIUS = 0.28;
export type PlayerState = Position & { yaw: number; pitch: number };
export class Player {
  state: PlayerState;
  velocityY = 0;
  grounded = false;
  dead = false;
  constructor(state: PlayerState) {
    this.state = { ...state };
  }
  overlaps(x: number, y: number, z: number) {
    const p = this.state;
    return (
      p.x + RADIUS > x - 0.5 &&
      p.x - RADIUS < x + 0.5 &&
      p.z + RADIUS > z - 0.5 &&
      p.z - RADIUS < z + 0.5 &&
      p.y + HEIGHT > y - 0.5 &&
      p.y < y + 0.5
    );
  }
  private collides(world: World, p: Position) {
    for (let x = Math.floor(p.x - RADIUS + 0.5); x <= Math.floor(p.x + RADIUS + 0.5); x++)
      for (let z = Math.floor(p.z - RADIUS + 0.5); z <= Math.floor(p.z + RADIUS + 0.5); z++) {
        if (!world.isLoaded(x, z) && world.generator.inside(x, z)) return true;
        for (let y = Math.floor(p.y + 0.5 + 0.001); y <= Math.floor(p.y + HEIGHT + 0.5 - 0.001); y++)
          if (isSolid(world.get(x, y, z))) return true;
      }
    return false;
  }
  update(world: World, dt: number, moveX: number, moveZ: number, jump: boolean, speed: number) {
    if (this.dead) return;
    const p = this.state;
    const swim = submergedDepth(world, p.x, p.y + .8, p.z, .01) > 0;
    if (swim) {
      const forward = Math.max(0, -moveZ) / Math.max(1, Math.hypot(moveX, moveZ));
      const targetY = forward * Math.sin(p.pitch) * speed * .65 - .45;
      this.velocityY = jump ? 3.2 : targetY + (this.velocityY - targetY) * Math.exp(-5 * dt);
      moveZ *= 1 - forward * (1 - Math.cos(p.pitch));
    } else {
      if (jump && this.grounded) this.velocityY = 7.2;
      this.velocityY = Math.max(-35, this.velocityY - 22 * dt);
    }
    const len = Math.max(1, Math.hypot(moveX, moveZ));
    const vx = ((Math.cos(p.yaw) * moveX + Math.sin(p.yaw) * moveZ) / len) * speed * (swim ? 0.6 : 1);
    const vz = ((-Math.sin(p.yaw) * moveX + Math.cos(p.yaw) * moveZ) / len) * speed * (swim ? 0.6 : 1);
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(vx * dt), Math.abs(vz * dt), Math.abs(this.velocityY * dt)) / 0.2),
    );
    this.grounded = false;
    for (let i = 0; i < steps; i++) {
      for (const [axis, v] of [
        ['x', vx],
        ['z', vz],
        ['y', this.velocityY],
      ] as const) {
        const old = p[axis];
        p[axis] += (v * dt) / steps;
        if (this.collides(world, p)) {
          p[axis] = old;
          if (axis === 'y') {
            if (v < 0) this.grounded = true;
            this.velocityY = 0;
          }
        }
      }
    }
    if (p.y < BOTTOM - 15) this.dead = true;
  }
  teleport(p: PlayerState) {
    this.state = { ...p };
    this.velocityY = 0;
    this.grounded = false;
    this.dead = false;
  }
}

export function findSpawn(world: World): PlayerState {
  for (let radius = 0; radius <= 256; radius += 2)
    for (const [dx, dz] of perimeter(radius)) {
      const x = dx,
        z = dz + 7,
        c = world.generator.column(x, z);
      if (
        !world.generator.inside(x - 2, z - 2) ||
        !world.generator.inside(x + 2, z + 2) ||
        c.water !== null ||
        c.height > 30
      )
        continue;
      if (
        [-1, 0, 1].some((ox) =>
          [-1, 0, 1].some((oz) => {
            const n = world.generator.column(x + ox, z + oz);
            return n.water !== null || Math.abs(n.height - c.height) > 1;
          }),
        )
      )
        continue;
      world.ensure(chunkCoord(x), chunkCoord(z));
      // On respawn the generated height is only a candidate: edits may have
      // removed the floor, flooded it, or filled the player's clearance.
      if (!isSolid(world.get(x, c.height, z))) continue;
      if (
        [1, 2, 3].some((dy) => {
          const cell = world.get(x, c.height + dy, z);
          return isSolid(cell) || cell?.type === 'water';
        })
      )
        continue;
      return { x, y: c.height + 0.51, z, yaw: 0, pitch: 0 };
    }
  // Deterministic emergency island for an all-ocean finite seed.
  world.ensure(0, 0);
  let floor = 3;
  for (let x = 1; x <= 3; x++)
    for (let z = 1; z <= 3; z++)
      for (let y = 3; y <= TOP - 4; y++) if (world.get(x, y, z)) floor = Math.max(floor, y);
  for (let x = 1; x <= 3; x++)
    for (let z = 1; z <= 3; z++) {
      world.set(x, floor, z, { type: 'grass' });
      for (let y = floor + 1; y <= floor + 4; y++) world.set(x, y, z, null);
    }
  return { x: 2, y: floor + 0.51, z: 2, yaw: 0, pitch: 0 };
}

function* perimeter(radius: number): Generator<[number, number]> {
  if (radius === 0) {
    yield [0, 0];
    return;
  }
  for (let offset = -radius; offset <= radius; offset += 2) {
    yield [offset, -radius];
    yield [offset, radius];
  }
  for (let offset = -radius + 2; offset < radius; offset += 2) {
    yield [-radius, offset];
    yield [radius, offset];
  }
}
