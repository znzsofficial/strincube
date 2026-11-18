import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENERATOR } from '../src/engine/core/generator.ts';
import { BOTTOM, CHUNK, TOP } from '../src/engine/core/voxel.ts';
import { GameSession } from '../src/engine/core/session.ts';
import { worldSaves } from '../src/engine/persistence.ts';
import { validateWorldSave } from '../src/engine/saveValidation.ts';
import { defaultWorldGenSettings, type WorldSaveData } from '../src/engine/types.ts';
import { getSaveMetaList, loadSaveData } from '../src/saveStorage.ts';

function save(): WorldSaveData {
  return {
    version: 3, name: '', seed: -42, savedAt: 100, timeOfDay: 0.5,
    worldGen: { ...defaultWorldGenSettings }, settings: {}, hotbar: [], activeSlot: 0, importedModels: [],
    engineData: { generator: GENERATOR, player: { x: 0, y: 4.51, z: -0.25, pitch: 0, yaw: 9 },
      edits: [], assets: [], placements: [] },
  };
}

function folderSave() {
  const s = save(), modelId = 'model-1', id = 'placed-1';
  const files = ['雪.PMX', 'skin.png', 'skin.png'].map(name => new File([name], name));
  s.engineData.assets.push({ id: modelId, files, name: '人物/雪.PMX',
    paths: ['人物/雪.PMX', '人物/昼/skin.png', '人物/夜/skin.png'] });
  s.importedModels.push({ id: modelId, name: files[0].name, kind: 'mmd' });
  s.engineData.placements.push({ id, modelId, x: 1.5, y: 4.5, z: -3, vmd: new File([], '动作.vmd'),
    settings: { id, name: files[0].name, rotation: 16, scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0,
      brightness: 1, opacity: 0.7, visible: true, shadows: true, damageable: true, health: 30, maxHealth: 40,
      animation: 'none', vmdName: '动作.vmd', vmdPlaying: true, animationSpeed: 1, animationDistance: 48,
      parts: [{ id: 'part-0', name: '面料', opacity: 0.45, visible: false }] } });
  s.hotbar.push({ type: 'block', block: 'stringSeaBeacon' }, { type: 'model', modelId });
  s.activeSlot = 1;
  return s;
}

test('accepts real session state, empty runtime hotbar and older partial v3 settings without mutating', () => {
  const s = save();
  validateWorldSave(s); // Older snapshot: no simulation or shadow policy fields.
  const session = new GameSession({ seed: s.seed, worldGen: { ...s.worldGen, flatWorld: true } });
  try {
    session.world.ensure(-1, 0);
    session.world.set(-1, TOP, 0, { type: 'itemFrame', item: undefined });
    session.world.set(-2, BOTTOM, 0, { type: 'ice' });
    Object.assign(s.engineData, session.snapshot());
    s.settings = { ...session.settings };
    const before = structuredClone(s);
    validateWorldSave(s);
    assert.deepEqual(s, before);
  } finally { session.dispose(); }
  s.engineData.simulation = { pending: [], bombs: [] }; // optional timer and deferred were added later
  s.settings = { shadows: false, pixelRatio: 0.6, mouseSensitivity: 2.7 };
  validateWorldSave(s);
});

test('accepts folder import with nested, same-basename textures, shared file sets and per-instance VMD', () => {
  const s = folderSave(), a = s.engineData.assets[0], second = new File([], 'preview.GLTF');
  a.files.push(second); a.paths.push('人物/preview.GLTF');
  s.engineData.assets.push({ ...a, id: 'model-2', name: a.paths.at(-1)! });
  s.importedModels.push({ id: 'model-2', name: second.name, kind: 'generic' });
  validateWorldSave(s);
});

test('rejects incompatible versions, settings and positions before runtime construction', () => {
  for (const [path, patch] of [
    ['version', { version: 2 }], ['generator', { engineData: { ...save().engineData, generator: 'future' } }],
    ['seed', { seed: '42' }], ['savedAt', { savedAt: Infinity }], ['activeSlot', { activeSlot: 1 }],
    ['hotbar', { hotbar: new Array(2) }], ['hotbar', { hotbar: [{ type: 'block', block: 'fake' }] }],
    ['worldGen.oreDensity', { worldGen: { ...save().worldGen, oreDensity: 'heavy' } }],
    ...Object.entries({ moveSpeed: 1e20, shadows: 'false', autosave: 'false', pixelRatio: -1, filmNoise: NaN, rendererBackend: 'webgpu',
      shadowResolution: 513, shadowRange: 1, shadowUpdateHz: 0 }).map(([k, v]) => [`settings.${k}`, { settings: { [k]: v } }]),
    ...Object.entries({ x: 1e40, y: -1e18, z: Infinity, pitch: null, yaw: NaN }).map(([k, v]) =>
      [`player.${k}`, { engineData: { ...save().engineData, player: { ...save().engineData.player, [k]: v } } }]),
  ] as const) {
    assert.throws(() => validateWorldSave({ ...save(), ...patch }), (e: Error) => e.message.includes(path as string));
  }
});

test('checks tuple arity, safe chunk and cell indices, real block keys and nested cell metadata', () => {
  const s = save(), end = (TOP - BOTTOM + 1) * CHUNK * CHUNK;
  const validateCells = (cells: unknown, x = -7) => validateWorldSave({ ...s,
    engineData: { ...s.engineData, edits: [{ x, z: 2, cells }] } });
  validateCells([[0, null], [end - 1, { type: 'itemFrame', item: 'dice' }], [2, { type: 'water', level: 7, static: true }]]);
  for (const cells of [[[-1, null]], [[end, null]], [[0.1, null]], [[0]], [[0, null, false]], [[0, null], [0, null]],
    [[0, {}]], [[0, { type: 'prototype' }]], [[1, { type: 'water', level: 99 }]], [[0, { type: 'itemFrame', item: false }]],
    [[0, { type: 'water', source: 'false' }]], new Array(1)]) {
    assert.throws(() => validateCells(cells), /edits\[0\].cells/);
  }
  assert.throws(() => validateCells([], 0.5), /edits\[0\].x/);
});

test('checks queued and deferred coordinate keys, including nested entries and bomb positions', () => {
  const s = save();
  const base = { pending: ['-2,4,8'], deferred: [{ chunk: '1,0', pending: ['15,4,8'] }], bombs: [{ x: 0, y: 4, z: 0, time: 2 }] };
  const validateSim = (patch: object) => validateWorldSave({ ...s, engineData: { ...s.engineData, simulation: { ...base, ...patch } } });
  validateSim({});
  for (const patch of [{ timer: '0' }, { pending: '1,0,1' }, { pending: ['0,97,1'] }, { pending: ['1,,1'] },
    { pending: ['-0,1,1'] }, { pending: ['0,1.5,1'] }, { pending: ['0,1,1,2'] }, { pending: ['10e2,1,1'] },
    { deferred: [{ chunk: '1,0,4', pending: [] }] }, { deferred: [{ chunk: '0,0', pending: ['1,2'] }] },
    { deferred: [{ chunk: '0,0', pending: ['-2,4,8'] }] }, { bombs: [{ ...base.bombs[0], y: TOP + 1 }] },
    { bombs: [{ ...base.bombs[0], z: 0.3 }] }, { bombs: [{ ...base.bombs[0], time: -2 }] }]) {
    assert.throws(() => validateSim(patch), /simulation\./);
  }
});

test('rejects dangling model IDs, conflicting IDs, invalid file/path pairs, malformed appearance and VMD', () => {
  for (const change of [
    (s: WorldSaveData) => { s.importedModels[0].id = 'missing'; }, s => { s.hotbar[1].modelId = 'missing'; },
    s => { s.engineData.placements[0].modelId = 'missing'; }, s => { s.engineData.placements[0].settings.id = 'different'; },
    s => { s.engineData.assets.push(s.engineData.assets[0]); }, s => { s.engineData.placements[0].settings.parts[0].visible = 1; },
    s => { s.engineData.assets[0].files[0] = new Blob(); }, s => { s.engineData.assets[0].paths.pop(); },
    s => { s.engineData.placements[0].vmd = { name: 'fake.vmd' }; }, s => { s.engineData.assets[0].name = '雪.PMX'; },
    ...['/雪.PMX', '../雪.PMX', '%2e%2e/雪.PMX', 'https://somewhere/雪.PMX', 'dir\\雪.PMX', 'dir/other.PMX'].map(path =>
      (s: WorldSaveData) => { s.engineData.assets[0].paths[0] = path; s.engineData.assets[0].name = path; }),
  ]) {
    const s = folderSave(); change(s);
    assert.throws(() => validateWorldSave(s), /存档/);
  }
});

test('storage only reports missing records as null, and lists intact summaries despite malformed neighbors', async t => {
  const s = save(), summary = { id: 'a', name: 'A', savedAt: 10, seed: -5, worldGen: s.worldGen };
  const get = t.mock.method(worldSaves, 'get', async () => undefined);
  assert.equal(await loadSaveData('a'), null);
  get.mock.mockImplementation(async () => ({ id: 'a' }));
  await assert.rejects(loadSaveData('a'), /存档/);
  get.mock.mockImplementation(async () => ({ id: 'a', data: { ...s, activeSlot: 3 } }));
  await assert.rejects(loadSaveData('a'), /activeSlot/);
  get.mock.mockImplementation(async () => ({ id: 'a', data: s }));
  assert.equal(await loadSaveData('a'), s);
  const list = t.mock.method(worldSaves, 'list', async () => [null, summary, {}, { ...summary, worldGen: null }, { ...summary, id: 'b', savedAt: 90 }]);
  assert.deepEqual((await getSaveMetaList()).map(s => s.id), ['b', 'a']);
  assert.equal(get.mock.callCount(), 4);
  list.mock.mockImplementation(async () => { throw new Error('storage unavailable'); });
  await assert.rejects(getSaveMetaList(), /storage unavailable/);
});
