# StrinCube

StrinCube is a Minecraft-like voxel sandbox built with Three.js, React, and TypeScript. It focuses on quick world creation, playful building, procedural terrain, persistent edits, water simulation, TNT interactions, imported models, and mobile-friendly controls.

**Play online:** https://strincube.pages.dev · https://game.nekolaska.vip

## Documentation

- [Engine architecture](docs/ENGINE.md): module ownership, workers, saves and rendering.
- [Development and verification](docs/TESTING.md): setup, regression suites and browser checks.
- [Performance measurements](docs/PERFORMANCE.md): reproducible scene, measured tradeoffs and limits.
- [Deployment record](docs/DEPLOYMENT.md): production release and publishing procedure.
- [Remaining work](docs/ROADMAP.md): prioritized tasks and acceptance criteria.

The stable WebGL release with small-screen menu and touch HUD fixes is deployed as `8a4f83e4`. Its verification completed with
96 Node tests, 107 browser assertions and a production build; see the deployment
record for source-control status and online smoke-test results.

## Current Highlights

### Rebuilt engine

New worlds now use the independent runtime in `src/engine/`: pure deterministic
world generation, evictable modified chunks, mesh-independent collision/picking,
and IndexedDB saves including imported model files. This is the only engine;
v2/localStorage saves are not supported. See [engine architecture](docs/ENGINE.md)
for boundaries, renderer scope and verification instructions.

Run `npm test` with Node 22.18+ for core regression checks. The development route
`/tests/browser.html` exercises rendering, controls and persistence in a browser.

### Gameplay

- **Infinite chunk world**: new worlds stream chunks around the player instead of generating a fixed map up front.
- **Background terrain**: a dedicated Worker generates streamed terrain; bounded requests and transferable buffers keep generation off the rendering thread while preserving player edits.
- **Background meshing**: a separate Worker builds geometry; stale results are rejected and old meshes remain visible until replacement is ready.
- **Material batching**: compatible textures share padded atlases. The fixed-camera benchmark reduced draw calls from 233 to 127; this is not a measured GPU/FPS gain.
- **Quality controls**: low/medium/high presets, individual shadow resolution/range/refresh budgets and optional postprocessing.
- **Persistent edits**: block and water changes survive chunk eviction and reload; model files and placement settings are saved alongside them.
- **Deterministic generation**: rolling land, oceans, beaches, mountains, caves, ores and meandering river valleys with order-independent cross-chunk trees.
- **Dry spawn**: spawning checks actual ground and clearance, including player edits on respawn.
- **Water simulation**: generated water starts static, nearby terrain changes wake it, and dynamic water state is saved.
- **World creation controls**: create infinite or finite worlds, then tune mountain, ocean, river, and biome scale from the advanced setup panel.
- **Debug HUD**: raw frame mean/P95, CPU stages, Worker time, draw calls, resource/queue counts, atlas/shadow activity and world coordinates.
- **Building sandbox**: 120+ blocks, block picker, inventory, continuous mining/placing, TNT, falling blocks, item frames, and ambient creatures.
- **Model import**: GLTF and MMD model support with placement, animation, and per-part settings.
- **Desktop and mobile play**: pointer-lock controls on desktop and touch controls on mobile.

## Controls

To swim, look down or up while moving forward, or use
jump to rise. Submerging the camera shortens visibility and tints daylight; deep
water is darker than shallow water. Flowing water uses its visible surface height.

Equip a cat treat (ordinary or purple) and walk near
a roaming creature: it follows the treat and stops a short distance away. Switch
items to let it wander back. Try the time slider around 06:00 and 18:00 for the
new sunrise and dusk lighting.

| Input | Action |
| --- | --- |
| WASD | Move |
| Space | Jump |
| Mouse | Look around |
| Left click | Mine / interact |
| Right click | Place block |
| E | Inventory |
| O | Settings |
| M | Import model |
| Esc | Pause menu |

Mobile controls appear automatically on touch devices.

## Getting Started

Use Node **22.18+**. Before building, supply the block texture files referenced by
`src/engine/blocks.ts` under `assets/minecraft/textures/block/`. The `assets/` directory
is gitignored and is not supplied by dependency installation; a source-only clone
needs these files separately. See [setup details](docs/TESTING.md#prerequisites).

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build

```bash
npm run build
npm run preview
```

The production build is written to `dist/`.

## Save System

StrinCube keeps saves in the browser. New v3 saves use IndexedDB with an independent
edit journal and original model resources; the save list reads lightweight metadata.
- generated chunks are recreated from the world seed;
- player edits are stored per chunk;
- water state and pending simulation work are persisted;
- original model files, texture paths, placements and VMD files are persisted.

This lets infinite worlds stay persistent without serializing every generated block.

Saves are local to the browser profile and site origin. The Pages domain, custom
domain and individual deployment URLs have separate save databases. Use the same
address to revisit a world, or select **导出 → 下载备份**
beside a saved world to keep a `.strincube` file. On another origin or device,
**导入世界备份** validates that file and adds a separate save; it does not replace
the original. Settings also offer per-world autosave (off by
default, every 60 seconds when enabled). Manual and automatic requests serialize
per world; newer queued snapshots replace older queued snapshots. Use **本站存储空间**
on the title screen for an approximate origin-wide capacity reading. Before closing
the tab, save manually and wait for confirmation if you need the latest edits.

## World Generation

World generation combines continental and climate noise, mountain masks, fixed-datum
river valleys and continuous 3D cave noise. Beaches require adjacent water; trees
use global anchors and a halo so neighboring chunk load order does not change them.
The generator plans branching tributaries and terminal lakes, then
samples riverbeds, terraces and inland ridges. Finite worlds use an island-scale
coastline. Save format and generator identity are independent. Copy a world's seed
by clicking its seed label in the save list; matching world settings and generator
version are also needed to reproduce its terrain.

New worlds use `terrain-watershed-2`: low riverbanks have small, walk-through pebble
piles, woodland has ferns and mushrooms, and meadows have flower patches. The
crosshair picks individual stone shapes or passes through gaps to the ground behind.
Previously saved worlds continue using their recorded generator.

## Project Structure

```text
src/
  App.tsx              UI shell, world creation, menus, HUD
  main.tsx             React entry point
  styles.css           Application styles
  saveStorage.ts        Save list and IndexedDB access
  engine/
    runtime.ts          Single game entry and browser adapter composition
    types.ts            Runtime/UI contracts and v3 saves
    blocks.ts           Block definitions and texture assets
    modelHelpers.ts     Model format/material helpers
    modelSystem.ts      Model assets, instances and restoration
    persistence.ts      Atomic IndexedDB saves and metadata
    quality.ts          Atomic low/medium/high preset patches
    shadowPolicy.ts     Headless shadow invalidation and refresh budget
    diagnostics.ts      Bounded CPU/frame/Worker statistics
    input.ts            Mouse, keyboard, touch and gamepad
    core/               Headless session, clock, world, generation and simulation
    render/             Scene, chunk meshes and ambient entities
    workers/            Terrain/mesh worker entry points and transport
  ui/
    controlState.ts     Exclusive menu, resume and play modes
tests/                  Node tests and development-only browser fixtures
docs/                   Architecture, verification, measurements and roadmap
```

## Tech Stack

- [Three.js](https://threejs.org/) for 3D rendering
- [React](https://react.dev/) for UI
- [TypeScript](https://www.typescriptlang.org/) for type safety
- [Vite](https://vite.dev/) for development and builds
- [@yohawing/three-mmd-loader](https://github.com/yohawing/three-mmd-loader) for MMD support

## Assets

The meadow set (grass cap, side and exposed earth) is original pixel
art in `src/assets/terrain/`. Edit the 16×16 palette drawings in
`scripts/paint-meadow.py` and rasterize them with Python; the game loads the PNGs
directly. The grass side shares the dirt drawing below its uneven fringe.

Block textures use [Pixel Perfection Legacy](https://www.planetminecraft.com/texture-pack/pixel-perfection-legacy/), a free Minecraft resource pack. Some item, torch, lantern, frame, and coin-style textures are generated or provided in the project assets.

## Notes

- `npm run build` may show Vite warnings about Node modules externalized by the MMD loader package. These warnings are currently non-blocking for the browser build.
- Large bundle warnings may appear for Three.js and MMD-related runtime code.

## License

[MIT](LICENSE)
