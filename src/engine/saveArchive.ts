import type { WorldSaveData } from './types';
import { validateWorldSave } from './saveValidation';

// v1: magic[8], version:u32le, manifestBytes:u32le, SHA256(manifest)[32],
// UTF-8 JSON {save, files}, then file bodies in descriptor order, with no padding.
// File slots in save are zero-based descriptor indices. Digests detect corruption,
// not authorship. Read/hashing buffers are bounded to one file at a time.
const MAGIC = new TextEncoder().encode('SCUBESAV');
const HEADER = 48;
const MiB = 1024 * 1024;
const MAX_TOTAL = 256 * MiB, MAX_FILE = 64 * MiB, MAX_MANIFEST = 8 * MiB;
const MAX_FILES = 4096, MAX_REFS = 8192;
// A small table of shared Files must not expand into an unbounded model restore.
const MAX_REFERENCED_BYTES = 512 * MiB;

function check(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`世界归档：${reason}`);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function uint(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function safePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
    !/[\\:\x00-\x1f\x7f]/.test(value) && value.split('/').every(p => p && p !== '.' && p !== '..');
}
type Descriptor = {
  name: string; type: string; lastModified: number; path: string; size: number; sha256: string;
};
function checkDescriptor(d: unknown): asserts d is Descriptor {
  check(record(d) && safePath(d.name) && !d.name.includes('/') &&
    (d.path === '' || (safePath(d.path) && d.path.split('/').at(-1) === d.name)) &&
    typeof d.type === 'string' && d.type.length <= 1024 && /^[\x20-\x7e]*$/.test(d.type) && d.type === d.type.toLowerCase() &&
    typeof d.lastModified === 'number' && Number.isSafeInteger(d.lastModified) &&
    uint(d.size, MAX_FILE) && typeof d.sha256 === 'string' && /^[0-9a-f]{64}$/.test(d.sha256),
    '文件描述或文件大小无效');
}
async function digest(bytes: ArrayBuffer) {
  check(globalThis.crypto?.subtle, '当前环境不支持 SHA-256 校验');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Stop stringify itself before it can materialize an arbitrarily large manifest.
// This lower-bound check leaves escaping and the exact UTF-8 limit to the encoder.
function boundedJson(value: unknown) {
  let visited = 0;
  return JSON.stringify(value, function (key, item) {
    visited += 1 + (Array.isArray(this) ? 0 : key.length) + (typeof item === 'string' ? item.length : 0);
    check(visited <= MAX_MANIFEST, '清单过大');
    return item;
  });
}

export async function encodeSaveArchive(save: WorldSaveData): Promise<Blob> {
  validateWorldSave(save);
  const files: File[] = [], ids = new Map<File, number>();
  let total = HEADER, refs = 0, referencedBytes = 0;
  function index(file: File) {
    check(++refs <= MAX_REFS, '文件引用过多');
    referencedBytes += file.size;
    check(referencedBytes <= MAX_REFERENCED_BYTES, '文件引用总大小超限');
    const existing = ids.get(file);
    if (existing !== undefined) return existing;
    check(files.length < MAX_FILES && uint(file.size, MAX_FILE), '文件数量或大小超限');
    total += file.size;
    check(total <= MAX_TOTAL, '归档总大小超限');
    ids.set(file, files.length);
    return files.push(file) - 1;
  }
  const engine = save.engineData;
  check(engine.assets.length <= MAX_FILES && engine.placements.length <= MAX_REFS, '资源或实例数量超限');
  const assets = engine.assets.map(asset => {
    check(asset.files.length <= MAX_REFS - refs, '文件引用过多');
    return { ...asset, files: asset.files.map(index) };
  });
  const placements = engine.placements.map(p => ({ ...p, vmd: p.vmd === undefined ? undefined : index(p.vmd) }));
  // Freeze the logical snapshot before any asynchronous reads of immutable Files.
  const state = boundedJson({ ...save, engineData: { ...engine, assets, placements } });
  check(state.length <= MAX_MANIFEST, '清单过大');
  const descriptors: Descriptor[] = [];
  for (const file of files) {
    const d = { name: file.name, type: file.type, lastModified: file.lastModified,
      path: file.webkitRelativePath || '', size: file.size, sha256: hex(await digest(await file.arrayBuffer())) };
    checkDescriptor(d);
    descriptors.push(d);
  }
  const json = `{"save":${state},"files":${boundedJson(descriptors)}}`;
  check(json.length <= MAX_MANIFEST, '清单过大');
  const manifest = new TextEncoder().encode(json);
  check(manifest.length <= MAX_MANIFEST && total + manifest.length <= MAX_TOTAL, '清单或归档总大小超限');
  const header = new Uint8Array(HEADER), view = new DataView(header.buffer);
  header.set(MAGIC);
  view.setUint32(8, 1, true);
  view.setUint32(12, manifest.length, true);
  header.set(await digest(manifest.buffer), 16);
  return new Blob([header, manifest, ...files], { type: 'application/octet-stream' });
}

export async function decodeSaveArchive(blob: Blob): Promise<WorldSaveData> {
  check(blob.size >= HEADER && uint(blob.size, MAX_TOTAL), '归档过大或头部不完整');
  const header = new Uint8Array(await blob.slice(0, HEADER).arrayBuffer()), view = new DataView(header.buffer);
  check(MAGIC.every((v, i) => header[i] === v), '文件标识无效');
  check(view.getUint32(8, true) === 1, '不支持此归档版本');
  const length = view.getUint32(12, true);
  let offset = HEADER + length;
  check(length > 0 && length <= MAX_MANIFEST && offset <= blob.size, '清单长度无效');
  const manifest = await blob.slice(HEADER, offset).arrayBuffer();
  check((await digest(manifest)).every((v, i) => v === header[16 + i]), '清单校验失败');
  let root: unknown;
  try {
    root = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest));
  } catch { throw new Error('世界归档：清单不是有效的 UTF-8 JSON'); }
  check(record(root) && record(root.save) && record(root.save.engineData) && Array.isArray(root.files) &&
    root.files.length <= MAX_FILES, '清单结构或文件数量无效');
  const descriptors: Descriptor[] = [], bodies: Blob[] = [];
  for (const d of root.files) {
    checkDescriptor(d);
    check(offset + d.size <= blob.size, '文件内容不完整');
    descriptors.push(d);
    bodies.push(blob.slice(offset, offset + d.size));
    offset += d.size;
  }
  check(offset === blob.size, '存在多余的文件内容');

  const { assets, placements } = root.save.engineData;
  check(Array.isArray(assets) && assets.length <= MAX_FILES && Array.isArray(placements) &&
    placements.length <= MAX_REFS, '资源或实例列表无效');
  const files: File[] = [];
  let used = 0;
  let refs = 0, referencedBytes = 0;
  function fileAt(id: unknown): File {
    check(++refs <= MAX_REFS && uint(id, descriptors.length - 1), '文件引用无效或过多');
    referencedBytes += descriptors[id].size;
    check(referencedBytes <= MAX_REFERENCED_BYTES, '文件引用总大小超限');
    if (files[id]) return files[id];
    const d = descriptors[id];
    const file = new File([bodies[id]], d.name, { type: d.type, lastModified: d.lastModified });
    if (d.path) Object.defineProperty(file, 'webkitRelativePath', { value: d.path });
    files[id] = file;
    used++;
    return file;
  }
  for (const a of assets) {
    check(record(a) && Array.isArray(a.files) && a.files.length <= MAX_REFS - refs, '模型文件列表无效');
    a.files = a.files.map(fileAt);
  }
  for (const p of placements) {
    check(record(p), '模型实例无效');
    if (Object.hasOwn(p, 'vmd')) p.vmd = fileAt(p.vmd);
  }
  check(used === descriptors.length, '存在未引用的文件');
  validateWorldSave(root.save);
  for (const [i, body] of bodies.entries()) {
    check(hex(await digest(await body.arrayBuffer())) === descriptors[i].sha256, `文件校验失败：${descriptors[i].name}`);
  }
  return root.save;
}
