/** All durations are milliseconds; these are wall-clock/CPU observations, never GPU timings. */
export type TimingSummary = {
  samples: number;
  meanMs: number | null;
  /** Nearest-rank percentile: sorted[ceil(0.95 * samples) - 1]. */
  p95Ms: number | null;
  lastMs: number | null;
};

export const CPU_STAGES = [
  'simulation',
  'streaming',
  'meshMain',
  'models',
  'renderSubmission',
  'total',
] as const;
export type CpuStage = (typeof CPU_STAGES)[number];

const RESOURCE_KEYS = [
  'drawCalls',
  'triangles',
  'geometries',
  'textures',
  'programs',
  'residentChunks',
  'renderedChunks',
  'meshQueueDepth',
  'terrainQueueDepth',
  'terrainAtlases',
  'shadowUpdates',
] as const;
export type PerformanceResources = Partial<Record<(typeof RESOURCE_KEYS)[number], number>>;

export type PerformanceSnapshot = {
  meshExecution?: { mode: 'worker' | 'main-thread-fallback'; fallback?: string };
  windowCapacity: number;
  frame: TimingSummary;
  /** 1000 / mean raw frame interval; not GPU throughput or an average of reciprocal samples. */
  fps: number | null;
  cpu: Record<CpuStage, TimingSummary>;
  /** Recent completed worker jobs, in a separate bounded window, not part of main-thread CPU total. */
  meshWorker: TimingSummary;
  /** Latest accepted frame's counters. Geometry/texture/program values are object counts, not bytes. */
  resources: PerformanceResources;
  hidden: boolean;
  skippedHiddenFrames: number;
  rejectedFrames: number;
};

export type FrameMeasurement = {
  /** Raw RAF timestamp difference in ms, before simulation delta clamping. Must be positive. */
  frameMs: number;
  /** Also true for an interval spanning a visibility transition; that entire frame is omitted. */
  hidden?: boolean;
  /** Sum repeated stages within this frame before recording. Missing stages are unknown, not zero. */
  cpu?: Partial<Record<CpuStage, number>>;
  resources?: PerformanceResources;
};

class TimingWindow {
  private readonly values: Float64Array;
  private cursor = 0;
  private size = 0;

  constructor(capacity: number) {
    this.values = new Float64Array(capacity);
  }

  push(value: number | undefined) {
    this.values[this.cursor] =
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : NaN;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.size = Math.min(this.size + 1, this.values.length);
  }

  snapshot(): TimingSummary {
    // Allocation/sorting is only done when the runtime publishes its UI snapshot (~250 ms).
    const samples: number[] = [];
    let sum = 0;
    for (let i = 0; i < this.size; i++) {
      const value = this.values[i];
      if (Number.isFinite(value)) {
        samples.push(value);
        sum += value;
      }
    }
    const last = this.size ? this.values[(this.cursor + this.values.length - 1) % this.values.length] : NaN;
    samples.sort((a, b) => a - b);
    return {
      samples: samples.length,
      meanMs: samples.length ? sum / samples.length : null,
      p95Ms: samples.length ? samples[Math.ceil(samples.length * 0.95) - 1] : null,
      lastMs: Number.isFinite(last) ? last : null,
    };
  }
}

/**
 * Per-runtime collector. Recording is O(fixed stage count), with bounded typed-array storage.
 * Inject measured durations rather than reading clocks here so unit tests are deterministic.
 * Call snapshot() only at the existing UI cadence, after recording the completed frame.
 *
 * For whole-frame draw counts, set renderer.info.autoReset = false, reset once before all
 * scene/postprocessing passes, then read info.render after the last pass. Never reset per pass.
 */
export class FrameDiagnostics {
  private readonly capacity: number;
  private readonly frames: TimingWindow;
  private readonly stages: Record<CpuStage, TimingWindow>;
  private readonly worker: TimingWindow;
  private readonly resources = new Float64Array(RESOURCE_KEYS.length).fill(NaN);
  private hidden = false;
  private skippedHiddenFrames = 0;
  private rejectedFrames = 0;

  constructor(capacity = 120) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 3600) {
      throw new RangeError('Diagnostics capacity must be an integer from 1 to 3600.');
    }
    this.capacity = capacity;
    this.frames = new TimingWindow(capacity);
    this.stages = Object.fromEntries(
      CPU_STAGES.map((stage) => [stage, new TimingWindow(capacity)]),
    ) as Record<CpuStage, TimingWindow>;
    this.worker = new TimingWindow(capacity);
  }

  recordFrame(measurement: FrameMeasurement): boolean {
    this.hidden = measurement.hidden === true;
    if (this.hidden) {
      this.skippedHiddenFrames++;
      return false;
    }
    if (!Number.isFinite(measurement.frameMs) || measurement.frameMs <= 0) {
      this.rejectedFrames++;
      return false;
    }
    this.frames.push(measurement.frameMs);
    for (const stage of CPU_STAGES) this.stages[stage].push(measurement.cpu?.[stage]);
    for (let i = 0; i < RESOURCE_KEYS.length; i++) {
      const value = measurement.resources?.[RESOURCE_KEYS[i]];
      this.resources[i] =
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : NaN;
    }
    return true;
  }

  /** Pass worker-reported computation time, not main-thread dispatch-to-reply latency. */
  recordMeshWorker(durationMs: number, hidden = false): boolean {
    if (hidden || !Number.isFinite(durationMs) || durationMs < 0) return false;
    this.worker.push(durationMs);
    return true;
  }

  snapshot(): PerformanceSnapshot {
    const frame = this.frames.snapshot();
    const resources: PerformanceResources = {};
    for (let i = 0; i < RESOURCE_KEYS.length; i++) {
      if (Number.isFinite(this.resources[i])) resources[RESOURCE_KEYS[i]] = this.resources[i];
    }
    return {
      windowCapacity: this.capacity,
      frame,
      fps: frame.meanMs === null ? null : 1000 / frame.meanMs,
      cpu: Object.fromEntries(CPU_STAGES.map((stage) => [stage, this.stages[stage].snapshot()])) as Record<
        CpuStage,
        TimingSummary
      >,
      meshWorker: this.worker.snapshot(),
      resources,
      hidden: this.hidden,
      skippedHiddenFrames: this.skippedHiddenFrames,
      rejectedFrames: this.rejectedFrames,
    };
  }
}
