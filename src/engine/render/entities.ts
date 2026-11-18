import * as THREE from 'three';
import { World } from '../core/world';
import { BOTTOM, TOP, chunkCoord, indexOf, isSolid, positionOf, type Chunk } from '../core/voxel';

export class AmbientEntities {
  private creatures: { root: THREE.Group; x: number; z: number; phase: number;
    tileX?: number; tileZ?: number; chunk?: Chunk; ground?: number }[] = [];
  private lights = new Map<string, THREE.PointLight>();
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private material = new THREE.MeshLambertMaterial({ color: 0xffd879 });
  private eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x292431 });
  private timer = 0;
  private candidates = new Map<string, { x: number; y: number; z: number; type: string }>();
  private cleanup: (() => void)[] = [];
  private world: World;
  private scene: THREE.Scene;
  constructor(world: World, scene: THREE.Scene, x: number, z: number) {
    this.world = world;
    this.scene = scene;
    const index = (chunk: ReturnType<World['ensure']>) => {
      for (const [i, c] of chunk.cells)
        if (['torch', 'lantern', 'soulLantern'].includes(c.type)) {
          const p = positionOf(i, chunk.x, chunk.z);
          this.candidates.set(`${p.x},${p.y},${p.z}`, { ...p, type: c.type });
        }
    };
    for (const chunk of world.loaded) index(chunk);
    this.cleanup.push(
      world.onChunk(index),
      world.subscribe(({ x, y, z, after }) => {
        for (const c of this.creatures) if (c.tileX === x && c.tileZ === z) c.tileX = undefined;
        const key = `${x},${y},${z}`;
        if (after && ['torch', 'lantern', 'soulLantern'].includes(after.type))
          this.candidates.set(key, { x, y, z, type: after.type });
        else this.candidates.delete(key);
      }),
    );
    for (const [dx, dz] of [
      [5, 5],
      [-6, 4],
      [8, -6],
      [-4, -8],
    ]) {
      const c = world.generator.column(x + dx, z + dz);
      if (c.water !== null) continue;
      const root = new THREE.Group(),
        body = new THREE.Mesh(this.geometry, this.material),
        head = new THREE.Mesh(this.geometry, this.material);
      body.scale.set(0.65, 0.45, 0.85);
      body.position.y = 0.35;
      head.scale.set(0.45, 0.4, 0.45);
      head.position.set(0, 0.65, -0.35);
      root.add(body, head);
      for (const ex of [-0.12, 0.12]) {
        const eye = new THREE.Mesh(this.geometry, this.eyeMaterial);
        eye.scale.set(0.06, 0.06, 0.04);
        eye.position.set(ex, 0.7, -0.59);
        root.add(eye);
      }
      root.position.set(x + dx, c.height + 0.5, z + dz);
      scene.add(root);
      this.creatures.push({ root, x: x + dx, z: z + dz, phase: dx });
    }
  }
  get count() {
    return this.creatures.length;
  }
  tick(dt: number, player: THREE.Vector3, lure = false) {
    for (const c of this.creatures) {
      c.phase += dt * 0.3;
      const pos = c.root.position;
      const following = lure && Math.hypot(pos.x - player.x, pos.z - player.z) < 9 && Math.abs(player.y - pos.y) < 5;
      const dx = (following ? player.x : c.x + Math.sin(c.phase) * 2) - pos.x;
      const dz = (following ? player.z : c.z + Math.cos(c.phase) * 2) - pos.z;
      const distance = Math.hypot(dx, dz);
      const step = distance ? Math.max(0, Math.min(dt * (following ? 2.2 : 1.4), distance - (following ? 1.5 : 0))) / distance : 0;
      const x = pos.x + dx * step, z = pos.z + dz * step;
      const tx = Math.round(x), tz = Math.round(z), chunk = this.world.getChunk(chunkCoord(tx), chunkCoord(tz));
      if (c.tileX !== tx || c.tileZ !== tz || c.chunk !== chunk) {
        c.tileX = tx; c.tileZ = tz; c.chunk = chunk; c.ground = undefined;
        if (chunk) for (let y = Math.min(TOP, this.world.generator.column(tx, tz).height + 4); y >= BOTTOM; y--) {
          if (isSolid(chunk.cells.get(indexOf(tx, y, tz)) ?? null)) { c.ground = y + .5; break; }
        }
      }
      const ground = c.ground;
      c.root.visible = ground !== undefined;
      if (ground !== undefined) {
        c.root.position.set(x, ground, z);
        if (distance > .01) c.root.rotation.y = Math.atan2(-dx, -dz);
      }
    }
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    const wanted = new Map<string, { x: number; y: number; z: number; type: string }>();
    for (const [key, p] of this.candidates) {
      if (!this.world.isLoaded(p.x, p.z)) {
        this.candidates.delete(key);
        continue;
      }
      if (Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z) > 24) continue;
      wanted.set(key, p);
      if (wanted.size >= 24) break;
    }
    for (const [key, light] of this.lights)
      if (!wanted.has(key)) {
        light.removeFromParent();
        light.dispose();
        this.lights.delete(key);
      }
    for (const [key, p] of wanted)
      if (!this.lights.has(key)) {
        const light = new THREE.PointLight(p.type === 'soulLantern' ? 0x59d6ff : 0xffc36b, 3, 9, 1.4);
        light.position.set(p.x, p.y + 0.25, p.z);
        this.scene.add(light);
        this.lights.set(key, light);
      }
  }
  dispose() {
    for (const fn of this.cleanup) fn();
    this.candidates.clear();
    for (const c of this.creatures) c.root.removeFromParent();
    for (const l of this.lights.values()) {
      l.removeFromParent();
      l.dispose();
    }
    this.lights.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.eyeMaterial.dispose();
  }
}
