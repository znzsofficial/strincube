import { isBlockType } from './blockTypes';
import { GENERATOR } from './core/generator';
import { BOTTOM, CHUNK, TOP } from './core/voxel';
import type { SaveSummary } from './persistence';
import type { GameSettings, WorldSaveData } from './types';

type Obj = Record<string, unknown>;
type Check = (value: unknown) => boolean;
function requireField(condition: unknown, path: string, reason = '字段无效'): asserts condition {
  if (!condition) throw new Error(`存档 ${path}：${reason}`);
}
function record(v: unknown, path: string): Obj {
  requireField(v !== null && typeof v === 'object' &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null), path);
  return v as Obj;
}
function array(v: unknown, path: string): unknown[] {
  requireField(Array.isArray(v), path);
  return v;
}
function each(v: unknown, path: string, check: (value: unknown, path: string) => void) {
  const a = array(v, path);
  // Index explicitly: Array.every/forEach silently skip corrupt sparse entries.
  for (let i = 0; i < a.length; i++) check(a[i], `${path}[${i}]`);
}
const text = (v: unknown): v is string => typeof v === 'string';
const id = (v: unknown): v is string => text(v) && v.trim().length > 0;
const bool = (v: unknown) => typeof v === 'boolean';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const range = (lo: number, hi: number) => (v: unknown): v is number => finite(v) && lo <= v && v <= hi;
const intRange = (lo: number, hi: number) => (v: unknown) => Number.isSafeInteger(v) && range(lo, hi)(v);
const oneOf = (...options: unknown[]) => (v: unknown) => options.includes(v);
const optional = (check: Check) => (v: unknown) => v === undefined || check(v);
const unit = range(0, 1);
// Leave headroom for chunk halos, sub-cell motion and incrementing physics/generation loops.
const coordLimit = 2 ** 40;
const coord = range(-coordLimit, coordLimit);
const blockCoord = intRange(-coordLimit, coordLimit);
const chunkCoord = intRange(-coordLimit / CHUNK, coordLimit / CHUNK);
const timestamp = intRange(0, 8.64e15);
function fields(o: Obj, path: string, checks: Record<string, Check>) {
  for (const [k, check] of Object.entries(checks)) requireField(check(o[k]), `${path}.${k}`);
}
function unique<T>(seen: Set<T>, key: T, path: string) {
  requireField(!seen.has(key), path, '重复条目');
  seen.add(key);
}

const density = oneOf('none', 'sparse', 'normal', 'dense');
const scale = range(0, 3);
function worldGen(v: unknown, p: string) {
  fields(record(v, p), p, {
    worldSize: oneOf('small', 'medium', 'large', 'huge'), worldSizeCustom: optional(intRange(1, Number.MAX_SAFE_INTEGER)),
    treeDensity: density, structureDensity: density, oreDensity: oneOf('none', 'sparse', 'normal', 'rich'),
    plantDensity: oneOf('none', 'sparse', 'normal', 'lush'), flatWorld: bool, infiniteWorld: bool,
    mountainScale: scale, oceanScale: scale, riverScale: scale, biomeScale: scale, seed: optional(Number.isSafeInteger),
  });
}

/** Metadata has its own small shape; listing worlds must never read their File payloads. */
export function validateSaveSummary(value: unknown): asserts value is SaveSummary {
  const row = record(value, 'metadata');
  fields(row, 'metadata', { id, name: text, savedAt: timestamp, seed: Number.isSafeInteger });
  worldGen(row.worldGen, 'metadata.worldGen');
}

// Runtime safety bounds rather than slider steps: older/custom presets need not align with the current UI.
const settingChecks: Record<keyof GameSettings, Check> = {
  mouseSensitivity: range(0, 100), gamepadLookSensitivity: range(0, 100), moveSpeed: range(0, 100),
  daySpeed: range(0, 1), breakSpeed: range(0, 100), timeOfDay: unit, viewDistance: range(1, 256),
  pixelRatio: v => finite(v) && v > 0 && v <= 4, modelBrightness: range(0, 10),
  shadows: bool, shadowResolution: oneOf(512, 1024, 2048), shadowRange: range(16, 96), shadowUpdateHz: range(1, 60),
  showFps: bool, infiniteWaterSpread: bool, rendererBackend: oneOf('webgl'), postProcessing: bool,
  bloomStrength: range(0, 10), vignette: bool, vignetteDarkness: range(0, 10),
  filmGrain: bool, filmNoise: range(0, 10), filmScanlines: range(0, 10),
};

const cellChecks = { type: isBlockType, level: optional(intRange(0, 7)), source: optional(bool),
  static: optional(bool), item: optional(isBlockType) };
function edits(v: unknown, path: string) {
  const chunks = new Set<string>();
  each(v, path, (value, p) => {
    const edit = record(value, p);
    fields(edit, p, { x: chunkCoord, z: chunkCoord });
    unique(chunks, `${edit.x},${edit.z}`, p);
    const indices = new Set<number>();
    each(edit.cells, `${p}.cells`, (entry, q) => {
      const pair = array(entry, q);
      requireField(pair.length === 2 && intRange(0, (TOP - BOTTOM + 1) * CHUNK * CHUNK - 1)(pair[0]), q);
      unique(indices, pair[0] as number, `${q}[0]`);
      if (pair[1] === null) return;
      const cell = record(pair[1], `${q}[1]`);
      fields(cell, `${q}[1]`, cellChecks);
      // Cells are copied into meshes, compared with JSON.stringify and sent to workers as-is.
      requireField(Object.keys(cell).every(k => Object.hasOwn(cellChecks, k)), `${q}[1]`);
    });
  });
}

function coordinateKey(v: unknown, p: string, size: 2 | 3): string {
  requireField(text(v) && v.length < 64, p);
  const parts = v.split(',').map(Number);
  // Round trip to reject whitespace, fractions, hex, leading zeroes and empty components.
  requireField(parts.length === size && parts.join(',') === v && (size === 2
    ? parts.every(chunkCoord)
    : blockCoord(parts[0]) && intRange(BOTTOM + 1, TOP)(parts[1]) && blockCoord(parts[2])), p);
  return v;
}
function simulation(v: unknown, path: string) {
  const sim = record(v, path), cells = new Set<string>(), chunks = new Set<string>();
  function pending(v: unknown, p: string) {
    each(v, p, (key, q) => unique(cells, coordinateKey(key, q, 3), q));
  }
  pending(sim.pending, `${path}.pending`);
  each(sim.bombs, `${path}.bombs`, (b, p) => fields(record(b, p), p, {
    x: blockCoord, y: intRange(BOTTOM, TOP), z: blockCoord, time: range(0, 2),
  }));
  if (sim.deferred !== undefined) each(sim.deferred, `${path}.deferred`, (entry, p) => {
    const e = record(entry, p);
    unique(chunks, coordinateKey(e.chunk, `${p}.chunk`, 2), `${p}.chunk`);
    pending(e.pending, `${p}.pending`);
  });
  requireField(optional(range(0, 0.15))(sim.timer), `${path}.timer`);
}

function file(v: unknown, p: string): File {
  requireField(typeof File !== 'undefined' && v instanceof File && safePath(v.name) && !v.name.includes('/') &&
    Number.isSafeInteger(v.size) && v.size >= 0 && Number.isSafeInteger(v.lastModified), p, '需要原始 File 文件');
  if (v.webkitRelativePath) requireField(safePath(v.webkitRelativePath) &&
    v.webkitRelativePath.split('/').at(-1) === v.name, `${p}.webkitRelativePath`);
  return v;
}
function safePath(v: string) {
  const relative = (s: string) => !/[\\\x00-\x1f\x7f]/.test(s) && !/^[a-z][a-z\d+.-]*:/i.test(s) &&
    s.split('/').every(part => part !== '' && part !== '.' && part !== '..');
  if (!relative(v)) return false;
  // The generic loader decodes URL escapes once. Literal '%' is legal in MMD folder names.
  try { return relative(decodeURIComponent(v)); } catch { return true; }
}
function models(save: Obj, engine: Obj) {
  const assets = new Map<string, 'generic' | 'mmd'>(), inventory = new Set<string>();
  each(engine.assets, 'engineData.assets', (v, p) => {
    const a = record(v, p);
    requireField(id(a.id) && !assets.has(a.id), `${p}.id`);
    requireField(text(a.name) && /\.(gltf|glb|pmd|pmx)$/i.test(a.name), `${p}.name`);
    const paths = array(a.paths, `${p}.paths`), files = array(a.files, `${p}.files`), names = new Set<string>();
    requireField(paths.length > 0 && paths.length === files.length, `${p}.paths`, '路径与文件数量不符');
    for (let i = 0; i < paths.length; i++) {
      const f = file(files[i], `${p}.files[${i}]`), path = paths[i];
      requireField(text(path) && safePath(path) && path.split('/').at(-1) === f.name, `${p}.paths[${i}]`);
      unique(names, path, `${p}.paths[${i}]`);
    }
    requireField(names.has(a.name), `${p}.name`, '缺少模型主文件');
    assets.set(a.id, /\.(pmd|pmx)$/i.test(a.name) ? 'mmd' : 'generic');
  });
  each(save.importedModels, 'importedModels', (v, p) => {
    const m = record(v, p);
    requireField(id(m.id) && assets.has(m.id), `${p}.id`, '缺少模型资源');
    unique(inventory, m.id, `${p}.id`);
    fields(m, p, { name: text, kind: oneOf(assets.get(m.id)) });
  });
  requireField(inventory.size === assets.size, 'importedModels', '模型资源与物品不匹配');
  const placements = new Set<string>();
  each(engine.placements, 'engineData.placements', (v, p) => {
    const m = record(v, p);
    requireField(id(m.id), `${p}.id`);
    unique(placements, m.id, `${p}.id`);
    requireField(id(m.modelId) && assets.has(m.modelId), `${p}.modelId`, '缺少模型资源');
    fields(m, p, { x: coord, y: coord, z: coord });
    const q = `${p}.settings`, s = record(m.settings, q);
    fields(s, q, { id: oneOf(m.id), name: text, rotation: finite, scale: range(0.15, 4), offsetX: range(-8, 8),
      offsetY: range(-8, 8), offsetZ: range(-8, 8), brightness: range(0.2, 2), opacity: unit, visible: bool,
      shadows: bool, damageable: bool, maxHealth: range(5, 300), health: v => finite(s.maxHealth) && range(0, s.maxHealth)(v),
      animation: oneOf('none', 'idle', 'spin', 'lookAtPlayer'), animationSpeed: range(0, 3),
      animationDistance: range(8, 120), vmdName: optional(text), vmdPlaying: bool });
    const parts = new Set<string>();
    each(s.parts, `${q}.parts`, (v, r) => {
      const part = record(v, r);
      requireField(id(part.id), `${r}.id`);
      unique(parts, part.id, `${r}.id`);
      fields(part, r, { name: text, visible: bool, opacity: unit });
    });
    if (m.vmd !== undefined) {
      requireField(assets.get(m.modelId) === 'mmd', `${p}.vmd`, '该模型不支持 VMD');
      file(m.vmd, `${p}.vmd`);
    }
  });
  each(save.hotbar, 'hotbar', (v, p) => {
    const slot = record(v, p);
    if (slot.type === 'block') requireField(isBlockType(slot.block), `${p}.block`);
    else requireField(slot.type === 'model' && id(slot.modelId) && inventory.has(slot.modelId), p);
  });
}

/** Validate an already materialized v3 snapshot in place, without decoding assets or creating a session. */
export function validateWorldSave(value: unknown): asserts value is WorldSaveData {
  const save = record(value, 'world');
  requireField(save.version === 3, 'version', '不支持此存档格式');
  const engine = record(save.engineData, 'engineData');
  requireField(engine.generator === GENERATOR, 'engineData.generator', '不支持此地形生成器版本');
  fields(save, 'world', { name: text, savedAt: timestamp, seed: Number.isSafeInteger, timeOfDay: unit });
  worldGen(save.worldGen, 'worldGen');
  for (const [k, v] of Object.entries(record(save.settings, 'settings'))) {
    requireField(Object.hasOwn(settingChecks, k) && settingChecks[k as keyof GameSettings](v), `settings.${k}`);
  }
  const bar = array(save.hotbar, 'hotbar');
  requireField(intRange(0, Math.max(0, bar.length - 1))(save.activeSlot), 'activeSlot');
  fields(record(engine.player, 'engineData.player'), 'engineData.player', {
    x: coord, y: range(BOTTOM - 32, TOP + 16), z: coord, yaw: finite, pitch: range(-Math.PI / 2, Math.PI / 2),
  });
  edits(engine.edits, 'engineData.edits');
  if (engine.simulation !== undefined) simulation(engine.simulation, 'engineData.simulation');
  models(save, engine);
}
