import { createGame } from '../src/engine/runtime';
import { GENERATOR } from '../src/engine/core/generator';
import { indexOf, type ChunkEdit } from '../src/engine/core/voxel';
import { GameScene } from '../src/engine/render/scene';
import { defaultWorldGenSettings } from '../src/engine/types';

/** Restore a one-cell pool above a flat world so neither the seed nor decorations
 * can change the bank. Observe the actual rendered camera on each frame. */
export async function verifyShoreControls(mount: HTMLElement, check: (ok: boolean, message: string) => void) {
  const cells: ChunkEdit['cells'] = [];
  for (let x = 1; x <= 7; x++) for (let z = 1; z <= 9; z++) {
    cells.push([indexOf(x, 20, z), { type: 'stone' }]);
    cells.push([indexOf(x, 21, z), x === 4 && z === 8 ? { type: 'water', source: true, level: 7 } : { type: 'snow' }]);
  }
  let view!: GameScene;
  const game = await createGame(mount, () => {}, undefined, {
    viewFactory: async (el, settings) => (view = new GameScene(el, settings)),
    initialSave: { version: 3, seed: 42, name: 'shore', savedAt: 0, timeOfDay: .4,
      worldGen: { ...defaultWorldGenSettings, flatWorld: true }, settings: { shadows: false, viewDistance: 32 },
      hotbar: [], activeSlot: 0, importedModels: [], engineData: { generator: GENERATOR,
        edits: [{ x: 0, z: 0, cells }], player: { x: 4, y: 20.51, z: 8, yaw: 0, pitch: 0 }, assets: [], placements: [] } },
  });
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  try {
    game.touchLock(); game.setTouchMove(0, 1);
    for (let i = 0; i < 10; i++) await frame();
    game.touchJump();
    const deadline = performance.now() + 6000;
    while (view.camera.position.z > 7.2 && performance.now() < deadline) await frame();
    game.setTouchMove(0, 0);
    check(view.camera.position.z <= 7.2 && view.camera.position.y >= 21.49 + 1.62, '一格深水中朝岸跳一次可离开水坑');
    let expected = 0, consistent = true;
    for (const delta of [500, 500, 500, 500, -500, -500, 0, 0]) {
      game.setTouchLook(delta, 0); await frame();
      expected -= delta * .002;
      consistent &&= Math.abs(view.camera.rotation.y - expected) < 1e-6;
    }
    check(consistent, '上岸后快速转过半圈、反转、松手，各帧朝向与输入一致');
  } finally { game.dispose(); }
}
