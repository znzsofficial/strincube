import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodeSaveArchive, encodeSaveArchive } from '../src/engine/saveArchive.ts';
import { defaultWorldGenSettings, type WorldSaveData } from '../src/engine/types.ts';
import { GENERATOR } from '../src/engine/core/generator.ts';

function resource(path: string, bytes: number[], type: string, lastModified: number) {
  const file = new File([Uint8Array.from(bytes)], path.split('/').at(-1)!, { type, lastModified });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}
function fixture(): WorldSaveData {
  const files = [resource('角色/雪.pmx', [80, 77, 88, 32, 0, 255], 'application/octet-stream', 123),
    resource('角色/day/skin.png', [137, 80, 78, 71, 0], 'image/png', 124),
    resource('角色/night/skin.png', [137, 80, 78, 71, 255], 'image/png', 125)];
  const move = resource('动作/舞.vmd', [86, 77, 68, 0, 129], '', 126);
  const id = 'placed-1';
  return {
    version: 3, name: '海岸 · 模型测试', savedAt: 1700000000000, seed: 42,
    worldGen: { ...defaultWorldGenSettings, seed: 42 }, timeOfDay: 0.28, settings: { shadows: true },
    importedModels: [{ id: 'model-1', name: '雪.pmx', kind: 'mmd' }],
    hotbar: [{ type: 'block', block: 'stone' }, { type: 'model', modelId: 'model-1' }], activeSlot: 1,
    engineData: {
      generator: GENERATOR, player: { x: 0, y: 20.5, z: 0, yaw: 0, pitch: 0 },
      edits: [{ x: -1, z: 0, cells: [[50, null], [711, { type: 'stone' }]] }],
      simulation: { pending: ['1,0,1'], deferred: [{ chunk: '1,0', pending: ['15,0,0'] }],
        bombs: [{ x: 0, y: 10, z: 4, time: 0.2 }], timer: 0.02 },
      assets: [{ id: 'model-1', name: '角色/雪.pmx', paths: files.map(f => f.webkitRelativePath), files }],
      placements: [{ id, modelId: 'model-1', x: 4, y: 1, z: -1, vmd: move,
        settings: { id, name: '雪', rotation: 0.2, scale: 1, offsetX: 0, offsetY: 0.5, offsetZ: 0,
          brightness: 0.8, opacity: 1, visible: true, shadows: true, damageable: false,
          health: 10, maxHealth: 10, animation: 'none', vmdName: '舞.vmd', vmdPlaying: true,
          animationSpeed: 1, animationDistance: 40, parts: [{ id: 'part-0', name: '衣服', visible: true, opacity: 0.7 }] } }],
    },
  };
}
async function assertFile(f: File, original: File) {
  assert.ok(f instanceof File);
  for (const k of ['name', 'type', 'lastModified', 'size', 'webkitRelativePath'] as const) assert.equal(f[k], original[k]);
  assert.deepEqual(new Uint8Array(await f.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
}

test('v3 archive preserves edits, deferred simulation, same-name nested textures and instance VMDs', async () => {
  const save = fixture(), first = save.engineData.placements[0], id = 'placed-2';
  save.engineData.placements.push({ ...first, id, vmd: resource('alt/舞.vmd', [255, 192], '', 200),
    settings: { ...first.settings, id, vmdPlaying: false } });
  const blob = await encodeSaveArchive(save);
  const restored = await decodeSaveArchive(new Blob([await blob.arrayBuffer()]));
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(save)));
  for (const [i, file] of restored.engineData.assets[0].files.entries()) await assertFile(file, save.engineData.assets[0].files[i]);
  for (const [i, p] of restored.engineData.placements.entries()) await assertFile(p.vmd!, save.engineData.placements[i].vmd!);
});

test('world with no binary resources round trips; shared Files occupy one payload', async () => {
  const save = fixture(), a = save.engineData.assets[0];
  const second = resource('角色/雪2.pmx', [80, 77, 88, 32, 0, 255], '', 300);
  a.files.push(second); a.paths.push(second.webkitRelativePath);
  save.engineData.assets.push({ ...a, id: 'model-2', name: second.webkitRelativePath });
  save.importedModels.push({ ...save.importedModels[0], id: 'model-2', name: second.name });
  const packed = new Uint8Array(await (await encodeSaveArchive(save)).arrayBuffer());
  const start = 48 + new DataView(packed.buffer).getUint32(12, true);
  assert.equal(packed.length - start, a.files.reduce((n, f) => n + f.size, save.engineData.placements[0].vmd!.size));
  const restored = await decodeSaveArchive(new Blob([packed]));
  assert.equal(restored.engineData.assets[0].files[1], restored.engineData.assets[1].files[1]);
  save.engineData.assets = []; save.engineData.placements = []; save.importedModels = [];
  save.hotbar = [{ type: 'block', block: 'grass' }]; save.activeSlot = 0;
  assert.deepEqual(await decodeSaveArchive(await encodeSaveArchive(save)), save);
});

test('explicit asset paths survive without native directory metadata, including empty files and absent VMD', async () => {
  const save = fixture(), a = save.engineData.assets[0], p = save.engineData.placements[0];
  a.files = a.files.map(f => new File([f], f.name, { type: f.type, lastModified: f.lastModified }));
  a.files.push(new File([], 'notes.txt', { lastModified: 0 })); a.paths.push('角色/readme/notes.txt');
  delete p.vmd; delete p.settings.vmdName; p.settings.vmdPlaying = false;
  const result = await decodeSaveArchive(await encodeSaveArchive(save));
  assert.deepEqual(result.engineData.assets[0].paths, a.paths);
  assert.equal(result.engineData.placements[0].vmd, undefined);
  for (const [i, f] of a.files.entries()) await assertFile(result.engineData.assets[0].files[i], f);
});

test('encoder rejects oversized resources and large UTF-8 manifests', async () => {
  class OversizeFile extends File {
    override get size() { return 64 * 1024 ** 2 + 1; }
    override async arrayBuffer(): Promise<ArrayBuffer> { assert.fail('oversize file must not be read'); }
  }
  const save = fixture(), original = save.engineData.assets[0].files[0];
  save.engineData.assets[0].files[0] = new OversizeFile([], original.name);
  await assert.rejects(encodeSaveArchive(save), /文件数量或大小/);
  save.engineData.assets[0].files[0] = original;
  save.name = '界'.repeat(3 * 1024 ** 2);
  await assert.rejects(encodeSaveArchive(save), /清单/);
});

// Construct checksummed inputs independently so structural rejection cannot pass
// simply because the checksum from a previous manifest no longer matches.
function packet(manifest: Uint8Array, body = new Uint8Array()) {
  const header = new Uint8Array(48), view = new DataView(header.buffer);
  header.set(new TextEncoder().encode('SCUBESAV'));
  view.setUint32(8, 1, true); view.setUint32(12, manifest.length, true);
  header.set(createHash('sha256').update(manifest).digest(), 16);
  return new Blob([header, manifest, body]);
}

test('rejects bad magic/version, truncation, trailing bytes and checksum failures', async () => {
  const bytes = new Uint8Array(await (await encodeSaveArchive(fixture())).arrayBuffer());
  for (const [at, error] of [[0, /标识/], [8, /版本/], [48, /清单校验/], [bytes.length - 1, /文件校验/]] as const) {
    const bad = bytes.slice(); bad[at] ^= 1;
    await assert.rejects(decodeSaveArchive(new Blob([bad])), error);
  }
  await assert.rejects(decodeSaveArchive(new Blob([bytes.subarray(0, 32)])), /头部/);
  await assert.rejects(decodeSaveArchive(new Blob([bytes.subarray(0, 49)])), /清单长度/);
  await assert.rejects(decodeSaveArchive(new Blob([bytes.subarray(0, -1)])), /不完整/);
  await assert.rejects(decodeSaveArchive(new Blob([bytes, new Uint8Array(1)])), /多余/);
  await assert.rejects(decodeSaveArchive(packet(new Uint8Array([255]))), /UTF-8 JSON/);
});

test('declared archive and manifest size caps reject before body allocation', async () => {
  class Oversize extends Blob {
    override get size() { return 256 * 1024 ** 2 + 1; }
    override slice(): Blob { assert.fail('oversize input must not be read'); }
  }
  await assert.rejects(decodeSaveArchive(new Oversize()), /归档过大/);
  const header = new Uint8Array(await packet(new Uint8Array()).arrayBuffer());
  new DataView(header.buffer).setUint32(12, 8 * 1024 ** 2 + 1, true);
  await assert.rejects(decodeSaveArchive(new Blob([header])), /清单长度/);
});

test('checksummed malformed metadata, invalid worlds, missing/unused refs and size/count limits reject', async () => {
  const bytes = new Uint8Array(await (await encodeSaveArchive(fixture())).arrayBuffer());
  const end = 48 + new DataView(bytes.buffer).getUint32(12, true);
  const json = new TextDecoder().decode(bytes.subarray(48, end));
  async function malformed(edit: (m: ReturnType<typeof JSON.parse>) => void, error?: RegExp) {
    const m = JSON.parse(json); edit(m);
    const rejected = decodeSaveArchive(packet(new TextEncoder().encode(JSON.stringify(m)), bytes.slice(end)));
    if (error) await assert.rejects(rejected, error); else await assert.rejects(rejected);
  }
  await malformed(m => { m.files[0].size = 64 * 1024 ** 2 + 1; }, /文件大小/);
  await malformed(m => { m.files = Array(4097).fill(null); }, /文件数量/);
  await malformed(m => { m.files[0].path = '../雪.pmx'; }, /文件描述/);
  await malformed(m => { m.files[0].sha256 = 'abc'; }, /文件描述/);
  await malformed(m => { m.save.engineData.assets[0].files[0] = -1; }, /引用/);
  await malformed(m => { m.save.engineData.assets[0].files = Array(8193).fill(0); }, /文件列表/);
  await malformed(m => { delete m.save.engineData.placements[0].vmd; }, /未引用/);
  await malformed(m => { m.save.engineData.player.x = 'east'; });
  const invalid = fixture(); invalid.engineData.generator = 'unknown';
  await assert.rejects(encodeSaveArchive(invalid));
});
