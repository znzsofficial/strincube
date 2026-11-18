import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveCoordinator } from '../src/saveCoordinator.ts';
import { GameSession, type WorldState } from '../src/engine/core/session.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';

function gate() {
  let open!: () => void;
  const wait = new Promise<void>(resolve => { open = resolve; });
  return { wait, open };
}

test('reload after slow autosave and two manual requests restores the latest requested edits and position', async () => {
  const first = gate(), second = gate(), startedSecond = gate();
  const disk = new Map<string, WorldState>();
  const writes: number[] = [];
  const saves = new SaveCoordinator(async (id: string, state: WorldState) => {
    writes.push(state.player.x);
    if (writes.length === 1) await first.wait;
    else { startedSecond.open(); await second.wait; }
    disk.set(id, structuredClone(state));
  }, async () => [...disk.keys()]);
  const options = { seed: 42, worldGen: { ...defaultWorldGenSettings, flatWorld: true } };
  const game = new GameSession(options);
  game.world.ensure(0, 0);
  game.player.state.x = 1;
  const auto = saves.request('world', game.snapshot());
  game.player.state.x = 2;
  const manual = saves.request('world', game.snapshot());
  game.player.state.x = 3;
  game.world.set(2, 20, 2, { type: 'itemFrame', item: 'dice' });
  const latest = saves.request('world', game.snapshot());
  game.world.set(2, 20, 2, null);
  game.dispose();
  assert.deepEqual(writes, [1]);
  let idle = false;
  const drained = saves.whenIdle('world').then(() => { idle = true; });
  first.open(); await auto; await startedSecond.wait;
  assert.deepEqual(writes, [1, 3]);
  assert.equal(idle, false);
  assert.equal(saves.busy('world'), true);
  second.open(); await drained;
  assert.deepEqual(await manual, await latest);
  assert.equal(saves.busy('world'), false);
  const restored = new GameSession({ ...options, state: disk.get('world')! });
  restored.world.ensure(0, 0);
  assert.equal(restored.player.state.x, 3);
  assert.deepEqual(restored.world.get(2, 20, 2), { type: 'itemFrame', item: 'dice' });
  restored.dispose();
});

test('failed writes leave the last commit intact, and queued work and other worlds can still commit', async () => {
  const blocker = gate(), failure = new Error('quota'), listFailure = new Error('metadata unavailable');
  const disk = new Map<string, number>([['a', 0]]);
  let listCalls = 0;
  const saves = new SaveCoordinator(async (id: string, n: number) => {
    if (id === 'a' && n === 1) { await blocker.wait; throw failure; }
    if (n === 4) throw failure;
    disk.set(id, n);
  }, async () => { if (++listCalls === 2) throw listFailure; return [...disk.keys()]; });
  const a1 = saves.request('a', 1), a2 = saves.request('a', 2);
  assert.equal((await saves.request('b', 9)).status, 'committed');
  assert.equal(disk.get('a'), 0);
  blocker.open();
  assert.deepEqual(await a1, { status: 'write-failed', error: failure });
  assert.deepEqual(await a2, { status: 'committed-list-failed', error: listFailure });
  assert.equal(listCalls, 2);
  assert.equal(disk.get('a'), 2);
  assert.equal((await saves.request('a', 4)).status, 'write-failed');
  assert.equal(disk.get('a'), 2);
  assert.equal(listCalls, 2);
  assert.equal((await saves.request('a', 5)).status, 'committed');
  assert.equal(disk.get('a'), 5);
});
