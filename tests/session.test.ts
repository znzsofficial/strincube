import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedClock } from '../src/engine/core/clock.ts';
import { GameSession } from '../src/engine/core/session.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';
import { isSolid } from '../src/engine/core/voxel.ts';

const flat = { ...defaultWorldGenSettings, flatWorld: true };
const idle = { x: 0, z: 0, jump: false };
function create() {
  const session = new GameSession({ seed: 42, worldGen: flat });
  for (const r of session.stream.requests(session.player.state.x, session.player.state.z, 1))
    session.world.ensure(r.x, r.z);
  return session;
}

test('one-shot jump survives render frames without a fixed update and is consumed once', () => {
  const clock = new FixedClock(),
    jumps: boolean[] = [];
  clock.advance(1 / 240, { ...idle, jump: true }, (_dt, jump) => {
    jumps.push(jump);
  });
  assert.equal(jumps.length, 0);
  for (let i = 0; i < 11; i++)
    clock.advance(1 / 240, idle, (_dt, jump) => {
      jumps.push(jump);
    });
  assert.deepEqual(jumps, [true, false, false]);
  clock.advance(1 / 60, { ...idle, jumpHeld: true }, (_dt, jump) => {
    jumps.push(jump);
  });
  assert.equal(jumps.at(-1), true);
});

test('fixed simulation is independent of render frame rate', () => {
  const slow = create(),
    fast = create();
  for (let i = 0; i < 60; i++) slow.advance(1 / 60, { ...idle, z: -1 }, true);
  for (let i = 0; i < 144; i++) fast.advance(1 / 144, { ...idle, z: -1 }, true);
  assert.deepEqual(slow.player.state, fast.player.state);
  assert.equal(slow.timeOfDay, fast.timeOfDay);
  slow.dispose();
  fast.dispose();
});

test('pause freezes simulation and drops buffered jump instead of replaying on resume', () => {
  const session = create();
  session.advance(1 / 60, idle, true);
  session.advance(1 / 240, { ...idle, jump: true }, true);
  const state = session.snapshot(),
    time = session.timeOfDay;
  session.advance(5, idle, false);
  assert.deepEqual(session.snapshot(), state);
  assert.equal(session.timeOfDay, time);
  session.advance(1 / 60, idle, true);
  assert.ok(session.player.velocityY <= 0);
  session.dispose();
});

test('respawn rejects a previously valid floor after flooding or excavation', () => {
  const session = create();
  const original = { ...session.player.state },
    floor = Math.floor(original.y);
  session.world.set(original.x, floor + 1, original.z, { type: 'water', source: true, level: 7 });
  session.respawn();
  assert.notDeepEqual(session.player.state, original);
  const next = { ...session.player.state };
  session.world.set(next.x, Math.floor(next.y), next.z, null);
  session.respawn();
  assert.notDeepEqual(session.player.state, next);
  const p = session.player.state;
  assert.ok(isSolid(session.world.get(p.x, Math.floor(p.y), p.z)));
  session.dispose();
});

test('session saves restore edits and clock and do not alias live state', () => {
  const session = create();
  session.updateSettings({ timeOfDay: 0.7 });
  session.world.set(2, 12, 2, { type: 'itemFrame', item: 'dice' });
  const saved = session.snapshot();
  session.world.set(2, 12, 2, null);
  session.player.state.x += 1;
  const restored = new GameSession({ seed: 42, worldGen: flat, state: saved, timeOfDay: session.timeOfDay });
  restored.world.ensure(0, 0);
  assert.equal(restored.world.get(2, 12, 2)?.item, 'dice');
  assert.notEqual(restored.player.state.x, session.player.state.x);
  assert.equal(restored.timeOfDay, 0.7);
  session.dispose();
  session.dispose();
  assert.throws(() => session.snapshot(), /无法保存/);
  restored.dispose();
});

test('unknown generator fails before world construction', () => {
  const session = create();
  assert.throws(
    () => new GameSession({ seed: 0, state: { ...session.snapshot(), generator: 'future' } }),
    /版本/,
  );
  session.dispose();
});
