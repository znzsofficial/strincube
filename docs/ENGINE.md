# StrinCube rebuilt runtime

This document describes the deployed runtime architecture. For commands and test
coverage see [verification](TESTING.md); for observations see [performance](PERFORMANCE.md).

## Entry and compatibility

All worlds enter `createGame` in `src/engine/runtime.ts`. The legacy engine and
v2/localStorage readers have been removed; no legacy compatibility is required.
Existing localStorage data is not automatically erased or offered in the save list.
Saves have `next_` IDs and live in `strincube-next` IndexedDB. A v3 save stores
its generator identity, normalized settings, seed, edit journal, player, model
assets, placements and VMD files. Unknown generator identities fail visibly.
New worlds use `terrain-watershed-2` with seeded riverbank stones,
meadow flower patches and forest undergrowth (`groundDetails.ts`). Saved `terrain-watershed-1`, `terrain-v2.1` and
`terrain-v2.2` worlds retain their original elevation profile on both the
main thread and terrain worker, including after re-saving. Save format v3 and IndexedDB schema version
2 are separate contracts. Shadow settings are normalized; this is not a complete
corrupt-save validation layer.

The React UI calls the `BlockGameApi` facade. The factory takes
`initialSave` and `AbortSignal`; restoration finishes before returning the API.
There is no imperative `load()` method or engine-selection branch.

`saveValidation.ts` validates the v3 structure and
cross-references before restoration. Portable `.strincube` backups use a separate
archive version (v1): a length-prefixed UTF-8 manifest and the original binary
files, checked with SHA-256. A digest detects corruption, not authorship. Archive
limits include 256 MiB total, 64 MiB per file and 8 MiB for the manifest. The title
screen prepares a download link on demand. Import validates before writing; new
world and metadata rows use IndexedDB `add` in one transaction, never overwriting
an existing key. Relative asset paths are carried separately from browser `File`
metadata so restored model folders can be reconstructed on another origin.

`SaveCoordinator` serializes detached snapshots per world, keeping at most one
replacement behind the active write. Requests replaced before writing share the
newest queued result. Successful commits and metadata-list refresh errors are
reported separately. World ID/name are reserved before the first write starts;
session/revision guards prevent stale callbacks changing another world's UI.
Opt-in autosave is per world (60 s while the game is open), not an unload hook or a
cross-tab lock. Browser storage estimates are optional, approximate and origin-wide.

## Modules

| Module | Owns |
| --- | --- |
| core/voxel.ts | Coordinates, cell types, simulation properties |
| core/session.ts | Headless world/player/simulation session, settings, respawn and state snapshot |
| core/clock.ts | Fixed simulation steps and buffered one-shot input |
| core/noise.ts | Seeded hash, interpolated 2D/3D noise |
| core/generator.ts | Terrain, coast, river valleys, caves, ore, global tree anchors |
| core/world.ts | Resident chunks, persistent edits, installation and notifications |
| core/chunkStream.ts | Bounded async generation scheduling, stale-result rejection and mesh backpressure |
| core/chunkTransfer.ts | Transferable-buffer chunk encoding, independent of save format |
| workers/terrainSource.ts | Worker lifecycle, cancellation, failure fallback and CPU counters |
| workers/terrain.worker.ts | Off-main-thread terrain generation and packing |
| core/meshSnapshot.ts | Packed center/halo mesh input and stale-result guard |
| core/meshBuilder.ts | Pure face extraction and transferable vertex/index buffers |
| workers/mesh.worker.ts | Off-main-thread geometry building |
| diagnostics.ts | Bounded frame/CPU/worker windows and renderer resource counters |
| core/player.ts | Player state, fixed-step collision, dry spawn selection |
| core/raycast.ts | DDA voxel selection independent of render readiness |
| core/simulation.ts | Bounded water/gravity updates and TNT |
| input.ts | Keyboard, mouse, touch and gamepad input with abortable listeners |
| render/chunks.ts | Mesh dispatch/publication, stale guards, geometry and material ownership |
| render/materialBatching.ts | Compatible atlas families, padded mip levels and per-family fallback |
| render/scene.ts | WebGL, camera, lighting, postprocessing and resize lifecycle |
| render/postProcessing.ts | On-demand composer, passes and render targets |
| render/entities.ts | Ambient creatures and nearby block lights |
| quality.ts | Atomic quality preset patches and derived custom state |
| shadowPolicy.ts | Pure shadow invalidation and raw-time refresh budget |
| modelSystem.ts | Format adapters, asset ownership, instance settings and restoration |
| modelHelpers.ts | Shared GLTF/MMD material, placement and animation helpers |
| blocks.ts | Block textures, materials, labels and icon assets |
| types.ts | UI/runtime contracts and the v3-only save shape |
| persistence.ts | Atomic IndexedDB saves and lightweight metadata |
| runtime.ts | Composition, frame scheduling, API, initialization and disposal |

## Data flow

Input / simulation -> World.set -> edit journal + dirty chunks + subscribers.
Chunk renderer consumes dirty chunks. Collision and picking read World directly.
Eviction releases resident chunks and meshes, not their edit journals. Reloading a
chunk runs the versioned generator and applies the journal. Multiple worlds have
independent state and seeds.

`GameSession` can run without a renderer or browser. Render-frame input is fed into
its fixed clock; jump presses survive frames shorter than 1/60 second. Pausing
resets the accumulator and pending jump. Respawn checks actual edited cells, not
only generated terrain height. Model settings updates never temporarily select
other instances; snapshots copy mutable collections and preserve placement IDs.

Generated water is static at one sea/river datum. A terrain edit wakes its local
neighborhood; flowing water uses bounded work per simulation tick. Dynamic water
is scheduled again when a saved chunk is loaded. Gravity and explosions use the
same mutation path as the player.

### Unloaded simulation boundaries

Unloaded neighboring cells are unknown, not air. Water updates wait in per-chunk
deferred queues until their immediate in-world neighbors become resident. Deferred
work and simulation timer phase are saved. Chunk installs schedule budgeted scans
for dynamic water/falling blocks without activating all generated static water.
Active updates, deferred wakeups and scan entries each have a 384-item budget.

TNT freezes its fuse until all in-world chunks intersecting the blast footprint are
resident, so leaving an area cannot silently discard the explosion. At most 64
fuses are serviced per fixed tick in round-robin order; excess fuses also pause under
extreme load. This intentionally trades elapsed-time precision for bounded work.

## Generation design

The rebuilt generator is a deliberately bounded terrain model, not a hydrological
erosion simulation. Continental noise blends ocean shelves into rolling land;
mountain masks fade toward broad river valleys. Meandering river corridors share
a fixed water datum. Beaches require neighboring water. Caves use continuous 3D
noise below a protected surface band. Trees use world-grid anchors and a halo, so
their cross-chunk parts are independent of load order. Density options apply to
separate feature passes.

The current profile routes jittered regional nodes to a lower cardinal neighbor.
Tributaries can share outlets, and terminal basin nodes carve lakes. Distance to
each reach shapes banks and buildable terraces before quantization. Finite maps
use an island-scaled coastline. Shared rasterization exposes cave mouths in rocky
uplands. See [the design and measurements](TERRAIN-DESIGN.md).

## Resource and model ownership

Shared block textures are application assets; chunk renderers own cloned materials
and generated geometry. Models retain original files plus relative paths for folder
textures. Placements clone materials so per-part opacity and visibility are local
to the instance. Model imports and scene restoration are asynchronous and failures
are reported through the loading/import UI.

## Current renderer scope

`createGame` uses `RuntimeView` to draw and read counters, not a concrete renderer's
canvas or `info` layout. The default remains `GameScene`. An injected async
`viewFactory` lets a development fixture exercise the real game loop with the
experimental native WebGPU adapter. Both the scene graph and the camera are retained
when that adapter switches to WebGL; the session, chunk render queue and model system
are not reconstructed. A canvas replacement clears held input and obsolete lock
requests before the next simulation step. A terminal display failure stops RAF
updates and reports an error while the runtime save API remains available.

The default WebGL backend supports FXAA, bloom, vignette, grain and scanlines.
Players can opt into the lazy-loaded native WebGPU direct pass on the title screen.
Changing the selector in the pause menu replaces
the renderer on the live scene and camera. The current renderer stays available
during initialization; simulation, streamed chunks and edit history are not reloaded.
Input rebinds to the replacement canvas and resumes on a fresh gesture. Backend preference is local
to the browser origin, independent of world saves; snapshots report the actual
backend and fallback. The MMD format/runtime adapter uses 0.8.6.
Real PMX/VMD assets still need a visual compatibility check; the browser regression
suite covers GLTF persistence and a generated PMD plus VMD loader/runtime smoke test.

## Verification

Run Node regression tests, a production build and the real browser integration
suite. Desktop/mobile layout fixtures and hardware acceptance are separate checks.
See [TESTING.md](TESTING.md) for routes, coverage and latest verified results.

## Menus and control ownership

`ui/controlState.ts` is the sole owner of panel/ready/requesting/playing/dead modes.
The loading effect may finish while the runtime continues; runtime snapshot callbacks
are guarded by a world epoch, not the loading effect's cancellation flag. Otherwise
switching the React screen to game would silently disable all subsequent snapshots.

Resume happens from a user gesture, not an effect. A browser lock acquisition is
accepted only while requesting or already playing. Opening a panel invalidates its
request revision and immediately gates engine input before asynchronous browser
unlock events. Escape always pauses, regardless of pointerlockchange/key ordering.
File-picker callbacks also carry a revision and world epoch. The browser regression
suite exercises the real App with controlled pointer-lock timing, including delayed
acquisition, inventory toggles, pause/resume, blur and return to title.

## Streaming and rendering

Terrain and mesh construction use separate bounded Workers. The main thread still
packs mesh snapshots, installs chunks, publishes geometry and submits rendering.
Postprocessing is allocated only when enabled, freed on disable, and follows the
configured pixel ratio. Unchanged dimensions do not resize renderer buffers.

### Asynchronous terrain

The browser runtime injects a `TerrainWorkerSource` into the headless session.
Initial area preparation and exploration generate chunks on that worker. The
small synchronous search for a safe spawn (and emergency respawn island) remains
on the main thread. The terrain algorithm and generator ID are unchanged.

`ChunkStream` keeps one job in flight, rebuilds its distance-ordered request list
only when the center/radius changes, and stops submitting while mesh work is backed
up. Results outside the current requested area are discarded. Accepted terrain goes
through `World.install`; current edits are reapplied and an existing resident chunk
is never overwritten. Installation and decoding still cost main-thread time.

Worker messages transfer Uint32 indices and Uint16 palette indices (six bytes per
cell plus a small cell palette), rather than structured-cloning a Map of cell objects.
Initialization cancellation and disposal reject pending work and terminate the worker.
Worker loading/CSP/transport failure falls back to yielded main-thread generation;
algorithm errors stop streaming and surface a save-and-reload error in the UI.

Streaming requests a square area with radius derived from view distance, capped
at eight chunks. Eviction retains one extra ring as hysteresis. Initial preparation
uses radius two; remaining requested chunks stream after the game starts.

### Asynchronous meshing

`ChunkRenderer.flush` submits at most one mesh job and publishes at most the supplied
budget of results. `pending` includes completed buffers waiting to publish. Initial
world loading drains `world.dirty.size || renderer.pending`, so a clean dirty set
cannot incorrectly mark an in-flight mesh as ready. `rebuild` remains synchronous
only for controlled comparison and fallback.

Snapshots contain center cells and just the four one-cell neighboring boundary
strips, not five full chunks. A small material-index table is supplied by the main
thread; worker modules never import texture initialization or Three.js. The worker
returns transferred attributes, indices and bounding spheres. BufferAttribute uses
these arrays directly. Old meshes remain until the full replacement is constructed.

Edits latch snapshot invalidity. Center/neighbor object identities and the dirty
marker also reject unload/reload and newly installed neighbors. Stale results are
discarded and requeued against current world data. Worker failures/timeouts expose
their fallback reason and switch to fresh synchronous builds; a failed fallback is
terminal and is surfaced through the runtime error callback. Disposing releases
worker jobs, buffered results, subscriptions and owned geometry/materials.

### Runtime diagnostics

Enable the existing FPS setting to see a 120-sample rolling frame mean/P95, CPU
simulation, scheduling, mesh-main-thread, model/ambient and render-submission costs,
plus a separate worker-job window. Total CPU is the runtime frame callback, not all
browser work: async worker message decoding may occur outside it. Resource numbers
are object counts, not byte estimates. `renderer.info.autoReset=false` with one reset
at draw start counts complete multi-pass frames rather than just the last pass.
Hidden/visibility-transition samples are omitted and indicated in the HUD. Snapshot
sorting and React publication use 250 ms of raw RAF time, not clamped simulation
time. The first frame is omitted until two RAF timestamps exist. The HUD explicitly
marks mesh fallback rather than presenting historical worker timings as current work.

The HUD also exposes active terrain atlas count and the latest accepted frame's
actual shadow refresh count. The fixed-scene benchmark and its measurement limits
are documented in [PERFORMANCE.md](PERFORMANCE.md).

### Material batching and shadow budgets

Compatible static 16×16 sRGB opaque maps and cutout leaves now use two atlas
families. Each mip level is filtered per source tile in linear light and padded
independently; per-vertex linear tint preserves material colors. Water, transparent,
emissive, canvas, transformed and nonstandard maps keep their original materials.
Atlas resources belong to each renderer; shared source textures are never disposed.
Loading is progressive. Atlas activation invalidates old worker layouts and dirties
resident meshes; failed atlas families retain original materials with an exposed
`materialBatchingFallbacks` reason. `prepareMaterials()` is a bounded benchmark
warm-up that settles including fallback, not a guarantee every material was batched.

`materialBatching: false` preserves an unbatched comparison path. `renderRevision`
changes on publication, removal and atlas activation so runtime can invalidate
shadows. Merged bounds change culling granularity; vertex colors add transfer bytes.

`ShadowUpdatePolicy` budgets by raw elapsed time and skips unchanged camera/light
poses. Refreshes coalesce mesh publication/removal/atlas changes and actual model
animation/appearance changes. The cached shadow matrix stays paired with its depth
map while direct sunlight moves smoothly; shadow camera positions snap in light space.
Disabling or resizing shadows releases their targets. Context-loss handling releases
old renderer caches and recreates the renderer on the same canvas at restoration,
preventing old VAO disposal listeners from touching restored WebGL handles.

### Quality settings

Presets in `engine/quality.ts` apply one atomic settings patch; manual edits derive
the custom state from actual values. Settings persist with saves.

| Preset | Pixel ratio | View distance | Shadows | Resolution | Half-range | Refresh cap | Postprocessing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Low | 1 | 48 | Off | 512 | 24 | 8 Hz | Off |
| Medium | 1 | 82 | On | 1024 | 40 | 15 Hz | Off |
| High | 1.5 | 120 | On | 2048 | 56 | 30 Hz | On |

Low retains shadow detail values for later manual enablement but allocates no shadow
target. These are refresh ceilings, not target game frame rates. Initial runtime
defaults use the medium shadow/view settings with device pixel ratio capped at 1.5;
the selected preset can therefore initially read custom on high-DPI devices.
