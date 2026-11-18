import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameDiagnostics } from '../src/engine/diagnostics.ts';

test('raw frame intervals use nearest-rank p95 and reciprocal mean FPS', () => {
  const diagnostics = new FrameDiagnostics(20);
  for (let frameMs = 1; frameMs <= 20; frameMs++) diagnostics.recordFrame({ frameMs });
  const result = diagnostics.snapshot();
  assert.deepEqual(result.frame, { samples: 20, meanMs: 10.5, p95Ms: 19, lastMs: 20 });
  assert.equal(result.fps, 1000 / 10.5);
  diagnostics.recordFrame({ frameMs: 1000 });
  assert.equal(diagnostics.snapshot().frame.lastMs, 1000, 'slow foreground frames must not be clamped away');
});

test('rolling window evicts old frames and missing stages together', () => {
  const diagnostics = new FrameDiagnostics(3);
  diagnostics.recordFrame({ frameMs: 100, cpu: { simulation: 10 } });
  for (const frameMs of [10, 20, 30]) diagnostics.recordFrame({ frameMs, cpu: { meshMain: frameMs / 10 } });
  const result = diagnostics.snapshot();
  assert.deepEqual(result.frame, { samples: 3, meanMs: 20, p95Ms: 30, lastMs: 30 });
  assert.deepEqual(result.cpu.simulation, { samples: 0, meanMs: null, p95Ms: null, lastMs: null });
  assert.equal(result.cpu.meshMain.meanMs, 2);
  for (let i = 0; i < 10000; i++) diagnostics.recordFrame({ frameMs: 16 });
  assert.equal(diagnostics.snapshot().frame.samples, 3);
});

test('invalid and hidden frames are omitted; unknown timings do not become zero', () => {
  const diagnostics = new FrameDiagnostics();
  assert.equal(diagnostics.snapshot().fps, null);
  for (const frameMs of [NaN, Infinity, -Infinity, -1, 0])
    assert.equal(diagnostics.recordFrame({ frameMs }), false);
  diagnostics.recordFrame({
    frameMs: 16,
    cpu: { simulation: 0, meshMain: NaN, models: -1, renderSubmission: Infinity },
  });
  assert.equal(diagnostics.recordFrame({ frameMs: 5000, hidden: true, cpu: { simulation: 5000 } }), false);
  let result = diagnostics.snapshot();
  assert.equal(result.hidden, true);
  assert.equal(result.skippedHiddenFrames, 1);
  assert.equal(result.rejectedFrames, 5);
  assert.equal(result.frame.meanMs, 16);
  assert.equal(result.cpu.simulation.meanMs, 0);
  for (const stage of ['meshMain', 'models', 'renderSubmission'] as const)
    assert.equal(result.cpu[stage].meanMs, null);
  diagnostics.recordFrame({ frameMs: 20 });
  result = diagnostics.snapshot();
  assert.equal(result.hidden, false);
  assert.equal(result.cpu.simulation.meanMs, 0);
  assert.equal(result.cpu.simulation.lastMs, null);
});

test('worker task times remain independent of main-thread frame costs', () => {
  const diagnostics = new FrameDiagnostics(2);
  diagnostics.recordFrame({ frameMs: 16, cpu: { total: 8, meshMain: 2, renderSubmission: 3 } });
  for (const duration of [100, 10, 20]) assert.equal(diagnostics.recordMeshWorker(duration), true);
  for (const duration of [NaN, Infinity, -1]) assert.equal(diagnostics.recordMeshWorker(duration), false);
  assert.equal(diagnostics.recordMeshWorker(10000, true), false);
  const result = diagnostics.snapshot();
  assert.deepEqual(result.meshWorker, { samples: 2, meanMs: 15, p95Ms: 20, lastMs: 20 });
  assert.equal(result.cpu.total.meanMs, 8);
  assert.equal(result.cpu.meshMain.meanMs, 2);
});

test('resource snapshots reject invalid counts, do not retain stale values, and are detached', () => {
  const diagnostics = new FrameDiagnostics();
  const resources = {
    drawCalls: 10,
    triangles: 200,
    textures: 0,
    geometries: NaN,
    programs: -1,
    meshQueueDepth: 1.5,
    terrainQueueDepth: Infinity,
  };
  diagnostics.recordFrame({ frameMs: 16, resources });
  resources.drawCalls = 999;
  const first = diagnostics.snapshot();
  assert.deepEqual(first.resources, { drawCalls: 10, triangles: 200, textures: 0 });
  first.resources.drawCalls = 50;
  first.cpu.total.meanMs = 999;
  assert.equal(diagnostics.snapshot().resources.drawCalls, 10);
  assert.equal(diagnostics.snapshot().cpu.total.meanMs, null);
  diagnostics.recordFrame({ frameMs: 20, resources: { residentChunks: 5, renderedChunks: 4 } });
  assert.deepEqual(diagnostics.snapshot().resources, { residentChunks: 5, renderedChunks: 4 });
});

test('capacity is finite and bounded, including single-frame windows', () => {
  for (const capacity of [0, -1, 1.5, NaN, Infinity, 3601])
    assert.throws(() => new FrameDiagnostics(capacity), RangeError);
  const diagnostics = new FrameDiagnostics(1);
  diagnostics.recordFrame({ frameMs: 10 });
  diagnostics.recordFrame({ frameMs: 20 });
  assert.deepEqual(diagnostics.snapshot().frame, { samples: 1, meanMs: 20, p95Ms: 20, lastMs: 20 });
});
