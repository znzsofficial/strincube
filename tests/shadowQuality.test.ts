import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, GameSession } from '../src/engine/core/session.ts';
import { defaultWorldGenSettings } from '../src/engine/types.ts';
import { qualityPreset, matchingQualityPreset } from '../src/engine/quality.ts';
import { normalizeShadowSettings, ShadowUpdatePolicy } from '../src/engine/shadowPolicy.ts';

const settings = normalizeShadowSettings({ shadowUpdateHz: 10 });
const pose = { x: 0, y: 0, z: 0, lightX: 0, lightY: 1, lightZ: 0 };

test('shadow work obeys raw elapsed budget, coalesces invalidations, and never catches up in bursts', () => {
  for (const fps of [30, 60, 144, 240]) {
    const policy = new ShadowUpdatePolicy();
    let count = 0;
    let last = -Infinity;
    for (let frame = 0; frame <= fps; frame++) {
      const elapsed = frame / fps;
      policy.invalidate();
      if (policy.shouldUpdate(elapsed, true, settings, pose)) {
        assert.ok(elapsed - last >= 0.1 - 1e-9);
        policy.updated(elapsed, pose);
        last = elapsed;
        count++;
      }
    }
    assert.ok(count >= 10 && count <= 11, `${fps} FPS: ${count} refreshes`);
    policy.invalidate();
    assert.equal(policy.shouldUpdate(20, true, settings, pose), true);
    policy.updated(20, pose);
    policy.invalidate();
    assert.equal(policy.shouldUpdate(20, true, settings, pose), false);
  }
});

test('stationary scenes skip refreshes; accumulated position/light changes and explicit edits invalidate', () => {
  const policy = new ShadowUpdatePolicy();
  assert.equal(policy.shouldUpdate(0, false, settings, pose), false);
  assert.equal(policy.shouldUpdate(0, true, settings, pose), true);
  policy.updated(0, pose);
  assert.equal(policy.shouldUpdate(100, true, settings, pose), false);
  assert.equal(policy.shouldUpdate(100, true, settings, { ...pose, x: 0.001 }), false);
  assert.equal(policy.shouldUpdate(100, true, settings, { ...pose, x: 1 }), true);
  assert.equal(policy.shouldUpdate(100, true, settings, { ...pose, lightX: 0.01 }), true);
  policy.invalidate();
  assert.equal(policy.shouldUpdate(0.01, true, settings, pose), false);
  assert.equal(policy.shouldUpdate(0.1, true, settings, pose), true);
  policy.updated(0.1, pose);
  policy.reset();
  assert.equal(policy.shouldUpdate(0.101, true, settings, pose), true);
});

test('shadow budget handles invalid/backward clocks and commits only rendered work', () => {
  const policy = new ShadowUpdatePolicy();
  assert.equal(policy.shouldUpdate(NaN, true, settings, pose), false);
  assert.equal(policy.shouldUpdate(1, true, settings, pose), true);
  assert.equal(policy.shouldUpdate(1, true, settings, pose), true);
  policy.updated(1, pose);
  assert.equal(policy.shouldUpdate(0, true, settings, pose), true);
});

test('quality patches are independent and matching/custom is derived without affecting gameplay settings', () => {
  for (const id of ['low', 'medium', 'high'] as const) {
    const original = { ...defaultSettings(), mouseSensitivity: 2.7, daySpeed: 0.01, moveSpeed: 8 };
    const combined = { ...original, ...qualityPreset(id) };
    assert.equal(matchingQualityPreset(combined), id);
    assert.equal(combined.mouseSensitivity, original.mouseSensitivity);
    assert.equal(combined.daySpeed, original.daySpeed);
    assert.equal(combined.moveSpeed, original.moveSpeed);
    assert.equal(matchingQualityPreset({ ...combined, shadowRange: 33 }), 'custom');
    const patch = qualityPreset(id);
    patch.shadowRange = 93;
    assert.notEqual(qualityPreset(id).shadowRange, patch.shadowRange);
  }
});

test('old/invalid saves and live shadow settings normalize to bounded defaults', () => {
  const session = new GameSession({ seed: 1, worldGen: { ...defaultWorldGenSettings, flatWorld: true },
    settings: { shadowRange: NaN, shadowUpdateHz: Infinity } });
  try {
    assert.deepEqual(normalizeShadowSettings(session.settings), normalizeShadowSettings({}));
    session.updateSettings({ shadowRange: -1, shadowUpdateHz: 900 });
    assert.equal(session.settings.shadowRange, 16);
    assert.equal(session.settings.shadowUpdateHz, 60);
    session.updateSettings({ shadowResolution: 123 as 512, shadowRange: 1000 });
    assert.equal(session.settings.shadowResolution, 1024);
    assert.equal(session.settings.shadowRange, 96);
  } finally { session.dispose(); }
});
