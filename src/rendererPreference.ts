export type RendererPreference = 'webgl' | 'webgpu';
const key = 'strincube.renderer';
export function readRendererPreference(): RendererPreference {
  try { return localStorage.getItem(key) === 'webgpu' ? 'webgpu' : 'webgl'; }
  catch { return 'webgl'; }
}
export function storeRendererPreference(value: RendererPreference) {
  try { localStorage.setItem(key, value); } catch { /* App state still applies this visit. */ }
}
