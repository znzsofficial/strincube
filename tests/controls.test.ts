import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ControlStateMachine } from '../src/ui/controlState.ts';
import { Input } from '../src/engine/input.ts';

test('continue prompt and playing are mutually exclusive across repeated snapshots', () => {
  const ui = new ControlStateMachine();
  ui.ready(); assert.equal(ui.prompt, true);
  ui.request(); ui.observe(true, false);
  for (let i = 0; i < 20; i++) ui.observe(true, false);
  assert.equal(ui.state.mode, 'playing'); assert.equal(ui.prompt, false); assert.equal(ui.panel, null);
});

test('opening a panel cancels a pending lock and rejects late lock success/failure', () => {
  const ui = new ControlStateMachine();
  const request = ui.request(); ui.open('inventory');
  assert.equal(ui.observe(true, false), true);
  ui.failed(request); ui.observe(false, false);
  assert.equal(ui.panel, 'inventory'); assert.equal(ui.prompt, false);
});

test('Escape event order always ends in menu, never continue overlay', () => {
  for (const order of [true, false]) {
    const ui = new ControlStateMachine(); ui.request(); ui.observe(true, false);
    if (order) ui.observe(false, false);
    ui.open('menu');
    if (!order) ui.observe(false, false);
    assert.equal(ui.panel, 'menu'); assert.equal(ui.prompt, false);
  }
});

test('old rejected lock cannot reopen prompt after a newer successful resume', () => {
  const ui = new ControlStateMachine(); const old = ui.request(); ui.open('settings');
  ui.request(); ui.observe(true, false); ui.failed(old);
  assert.equal(ui.state.mode, 'playing');
  ui.observe(false, true); assert.equal(ui.state.mode, 'dead');
  ui.observe(false, false); assert.equal(ui.panel, 'menu');
  const current = ui.request(); ui.failed(current); assert.equal(ui.prompt, true);
});

test('input pauses synchronously and a delayed browser acquisition cannot reactivate it', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const document = Object.assign(new EventTarget(), {
    pointerLockElement: null as unknown,
    exitPointerLock() { this.pointerLockElement = null; },
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  let resolve!: () => void;
  const canvas = Object.assign(new EventTarget(), {
    requestPointerLock: () => new Promise<void>(r => { resolve = r; }),
  });
  const input = new Input(canvas as unknown as HTMLCanvasElement);
  try {
    const promise = input.lock(); input.unlock();
    document.pointerLockElement = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    resolve(); await promise;
    assert.equal(input.active, false); assert.equal(document.pointerLockElement, null);
    input.touchLock(); assert.equal(input.active, true);
    input.unlock(); assert.equal(input.active, false);
    input.dispose(); input.touchLock(); assert.equal(input.active, false);
  } finally {
    input.dispose();
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
