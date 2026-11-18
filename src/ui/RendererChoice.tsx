import type { RendererPreference } from '../rendererPreference';

export function RendererChoice({ value, onChange, disabled }: { value: RendererPreference; onChange: (value: RendererPreference) => void; disabled?: boolean }) {
  return <label className="renderer-choice">渲染后端
    <select aria-label="渲染后端" disabled={disabled} value={value} onChange={e => onChange(e.target.value === 'webgpu' ? 'webgpu' : 'webgl')}>
      <option value="webgl">WebGL</option><option value="webgpu">WebGPU（实验）</option>
    </select>
  </label>;
}
