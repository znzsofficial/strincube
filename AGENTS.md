# StrinCube architecture

Documentation map: `docs/ENGINE.md` owns runtime design, `docs/TESTING.md` verification,
`docs/PERFORMANCE.md` measured results, `docs/DEPLOYMENT.md` release records, and
`docs/ROADMAP.md` unfinished work. Keep completed features out of roadmap backlog
and label release-specific counts/timings with their measurement context.

`src/engine/runtime.ts` is the only game entry (`createGame`). The user explicitly
does not require legacy engine/save compatibility. Do not restore a v2 runtime,
localStorage save adapter or migration branch. Existing browser data is not erased
automatically; the application reads only its IndexedDB saves.

## Boundaries

- `engine/core` is DOM-, GPU-, and React-free. Import block types with `import type`;
  `engine/blocks.ts` has texture-loading side effects and must not enter this layer.
- `GameSession` owns world/player/simulation state and fixed-step advancement.
  `FixedClock` buffers one-shot commands until an actual simulation step; pausing
  drops buffered commands. Runtime composes browser adapters, not another physics loop.
- `ModelSystem` owns its context privately. Use its selection, placement, picking
  and settings methods rather than mutating maps or temporarily changing selection.
- `World` owns resident cell data and a separate persistent edit journal. Every
  gameplay mutation goes through `World.set`. Generation and hydration are explicit
  operations, not global suppression flags. Modified chunks must remain evictable.
- `TerrainGenerator` is deterministic for seed, settings, version, and coordinates.
  Structure anchors are global, write only the requested chunk, and include a halo.
  Generation cannot depend on which neighbor happened to load first.
- Browser chunk generation runs through `workers/terrainSource.ts`; core streaming
  depends only on `ChunkSource`. Keep one in-flight request, prioritize current
  coordinates, and apply mesh backpressure. Worker results enter `World.install`,
  which replays the latest edits and never overwrites a resident chunk. Dispose the
  stream before the world. Never put browser/GPU imports in the worker dependency tree.
- Bump `GENERATOR` whenever generated output changes after release. Do not silently
  apply a new generator to an older delta save. Format v3 and generator identity are
  separate contracts.
- Rendering observes world data; selection and collisions do not read meshes.
- Mesh neighbor caches are scoped to one rebuild, never persisted across chunk
  eviction. Postprocessing owns its render targets and releases them when disabled.
  Use `/tests/performance.html` for fixed-scene measurements; distinguish CPU time,
  draw counts and throttled frame intervals from actual GPU/FPS results.
- Mesh construction runs in a separate bounded worker using a center+boundary halo
  snapshot. Check edits, chunk identity and neighbor identity before publishing;
  retain the old mesh until replacement is ready. Initial loading drains both dirty
  chunks and pending/ready mesh work. Worker failure falls back without hiding errors
  from the fallback itself. Worker code imports no Three.js or texture assets.
- Diagnostics use raw RAF intervals, not clamped simulation delta. Exclude hidden
  frames and visibility transitions. Count all postprocessing passes once per frame;
  CPU render submission and worker computation are not GPU timings or memory bytes.
- Terrain atlas batching is conservative and renderer-owned: preserve material render
  state, linear tints and isolated padded mip levels; keep unsupported textures on
  their original materials. Atlas activation invalidates in-flight mesh layouts.
  Compare A/B using the same world/camera; merged bounds change visible triangles.
- Shadows cache the depth map and projection together. Budget refreshes using raw
  RAF time; invalidate on mesh renderRevision and model changes. Dispose targets
  on disable/resolution change. Context loss releases renderer caches before native
  restoration; recreate the renderer on the same canvas to preserve input bindings.
- Quality presets are atomic setting patches from engine/quality.ts; derive custom
  status from actual settings. Keep UI initialization on core/session defaults.
- Simulation defers unknown neighboring water dependencies by chunk. TNT countdown
  pauses when any in-world blast chunk is unloaded; deferred work survives saves.
- Runtime instances own their input handlers, animation frames, models and GPU
  resources. Shared texture assets are not disposed by an individual runtime.
- Model format loading uses `engine/modelHelpers.ts` through `ModelSystem`.
  Instance appearance must use independent materials. Save original files and paths.
- `engine/persistence.ts` atomically stores saves and metadata in IndexedDB. Do not
  put model blobs in localStorage or fetch full blobs just to draw the save list.
- Loading v3 creates the runtime from the save directly. Never generate a temporary
  new world and discard it as part of loading.
- UI control state belongs to `ui/controlState.ts`: panels, resume prompts and play
  are exclusive modes. Loading-effect cleanup must not disable a running game's
  snapshot callback; runtime epochs reject callbacks only from superseded worlds.
  Lock requests and file-picker callbacks use revisions so late results cannot
  dismiss a newly opened panel. Input unlock immediately gates simulation even
  before the browser has delivered pointerlockchange.

## Verification

`npm test` (Node 22.18+), `npm run build`, then `/tests/browser.html` on the Vite
development server for real WebGL/IndexedDB/import/save/restore integration checks.
Check UI at desktop and mobile widths. The browser test deletes only its own save ID.
Do not commit or deploy unless the user asks.
