# Performance measurements

[Architecture](ENGINE.md) · [Verification](TESTING.md) · [Remaining work](ROADMAP.md)

## Measurement contract

`tests/performance.ts` is the reproducible fixture behind `/tests/performance.html`.
It uses seed **42**, default world-generation settings, **25 chunks** at coordinates
−2 through 2, **256,693 cells**, a **640×480** viewport, pixel ratio **1**, time of
day **0.28**, and no shadows or postprocessing. The camera is at `(18, 25, 26)`,
looking at `(0, 5, 0)`. Neighbor chunks are present before geometry is built.

The page measures synchronous generation/meshing, render submission, raw RAF
intervals, draw/triangle counts, and separate terrain/mesh Worker jobs. Material
A/B uses the same world, camera and renderer with only one terrain root visible.
It waits for atlas preparation before measuring the batched path.

Keep the browser foregrounded for device comparisons and record browser, hardware,
viewport, settings and thermal conditions. The observations below came from the
development browser panel; throttling prevents an FPS claim.

## Latest fixed-camera A/B: 2026-11-17

| Metric | Unbatched | Atlas batching |
| --- | ---: | ---: |
| Draw calls | 233 | 127 |
| Total geometry triangles | 101,482 | 101,482 |
| Mesh objects | 318 | 142 |
| Submitted visible triangles | 76,552 | 87,014 |
| CPU render submission median / P95 | 1.3 / 2.8 ms | 0.8 / 1.1 ms |

Draw calls fell **45.5%**. Larger merged bounding spheres submit more triangles,
and per-vertex tint adds geometry bytes. The decrease in draw calls is established;
overall GPU throughput, memory savings and real-device FPS improvement are not.
Both roots coexist during A/B, so their combined renderer resource counters cannot
be used as isolated GPU-memory comparisons. Geometry/texture counters count objects,
not bytes. The separate material smoke camera reported 202 → 114 calls; those
counts must not be mixed with this fixed-camera baseline.

## Worker observations from the same latest run

| Stage | Median | P95 |
| --- | ---: | ---: |
| Terrain Worker generation | 1.9 ms | 3.8 ms |
| Terrain Worker packing | 0.7 ms | 1.2 ms |
| Main-thread terrain decode | 0.4 ms | 0.5 ms |
| Main-thread install with simulation listeners | 0.0 ms | 0.1 ms |
| Terrain round trip | 3.2 ms | 5.6 ms |
| Main-thread mesh snapshot | 1.2 ms | 1.5 ms |
| Mesh Worker build | 2.3 ms | 8.3 ms |
| Main-thread mesh publication | 0.0 ms | 0.1 ms |

Terrain startup plus first chunk: **14.1 ms**. Terrain index/value buffers:
**1,540,158 bytes**. Batched mesh drain: **322.6 ms**, including material preparation,
Worker startup and task scheduling; transferred geometry: **9,188,620 bytes**.
Values displayed as 0.0 ms are rounded observations, not zero-cost work. Transfer
counts are buffer payloads, not total application or GPU memory.

## Historical observations

Before batching, a separate mesh Worker run measured snapshot median/P95
**1.9/4.0 ms**, build **4.1/16.4 ms**, publication **0.1/0.2 ms**, drain **394.8 ms**
and **7,103,740 geometry bytes**. It retained 101,482 triangles and 233 fixed-camera
draw calls. These timings came from another run and cannot attribute speed changes
to batching alone. The increase to 9,188,620 bytes reflects the batched geometry's
additional vertex-color attributes.

## Shadow verification

`tests/shadowQuality.ts` uses controlled raw timestamps and real depth draws.
Continuous invalidation with a 10 Hz cap produces 11 updates over a one-second
interval including both endpoints. Static poses skip refreshes; multiple
postprocessing passes do not redraw the shadow map repeatedly within one frame.
Resolution changes, disable/re-enable and two real context-loss/restoration cycles
are covered. This verifies the scheduling/resource contract, not a GPU speedup.

## Runtime diagnostics and next measurements

The FPS setting exposes raw frame mean/P95, CPU stages, independent Worker timing,
queues, object counts, atlas count and per-frame shadow refresh count. Hidden and
visibility-transition intervals are excluded. Runtime CPU total is the frame
callback's measured work, not all asynchronous browser activity.

Next measurements should cover foreground hardware, long exploration and edit
bursts, main-thread snapshot packing, culling granularity and geometry transfer
cost. Dynamic resolution remains unimplemented; see [ROADMAP.md](ROADMAP.md).
