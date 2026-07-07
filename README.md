# StrinCube

StrinCube is a Minecraft-like voxel sandbox built with Three.js, React, and TypeScript. It focuses on quick world creation, playful building, procedural terrain, persistent edits, water simulation, TNT interactions, imported models, and mobile-friendly controls.

**Play online:** https://strincube.pages.dev

## Current Highlights

- **Infinite chunk world**: new worlds stream chunks around the player instead of generating a fixed map up front.
- **Chunk-delta saves**: saves store generated chunk metadata plus block and water edits, keeping new saves smaller while preserving older snapshot saves.
- **Natural world generation**: large biome regions, smoother plains, oceans, beaches, stony shores, mountain slopes, snowy peaks, caves, ores, lakes, and hydrology-driven rivers.
- **Lowland river spawn**: new worlds try to start the player on safe land near a real lowland river.
- **Minecraft-style water behavior**: static generated water wakes when disturbed, placed water flows dynamically, falling water keeps its spread cost, and saves persist water state.
- **World creation controls**: create infinite or finite worlds, then tune mountain, ocean, river, and biome scale from the advanced setup panel.
- **Debug HUD**: optional FPS/worldgen overlay with coordinates, biome, climate, river/lake markers, and hydrology data.
- **Building sandbox**: 120+ blocks, block picker, inventory, continuous mining/placing, TNT, falling blocks, item frames, and ambient creatures.
- **Model import**: GLTF and MMD model support with placement, animation, and per-part settings.
- **Desktop and mobile play**: pointer-lock controls on desktop and touch controls on mobile.

## Controls

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

StrinCube keeps saves in the browser. Current saves use `chunkDelta` mode:

- generated chunks are recreated from the world seed;
- player edits are stored per chunk;
- water additions, removals, falling state, and static state are stored as water edits;
- legacy full-world snapshot saves remain loadable.

This lets infinite worlds stay persistent without serializing every generated block.

## World Generation

World generation combines climate noise, continentalness, erosion, ridge noise, ocean depth, lake/depression sampling, and a local hydrology patch for rivers. The generator currently includes:

- plains, forest, jungle, desert, savanna, taiga, snowy, ocean, beach, stony shore, meadow, slope, and peak-style terrain;
- lowland river carving guarded against high mountain cuts;
- caves below the shallow surface band, with deeper ores and cave decoration;
- static generated rivers, lakes, and sea water that wake when the terrain changes.

## Project Structure

```text
src/
  App.tsx              UI shell, world creation, menus, HUD
  main.tsx             React entry point
  styles.css           Application styles
  game/
    blockGame.ts       Main runtime: rendering, input, physics, chunk lifecycle
    blocks.ts          Block definitions, textures, materials
    chunk.ts           Chunk coordinate helpers
    chunkManager.ts    Chunk request queue and load/unload radius logic
    models.ts          Imported model helpers
    save.ts            Save/load serialization and chunk data application
    types.ts           Shared game, world, save, and water types
    water.ts           Water simulation, rendering, and static-water wake-up
    worldgen.ts        Terrain, biome, hydrology, cave, ore, and spawn generation
```

## Tech Stack

- [Three.js](https://threejs.org/) for 3D rendering
- [React](https://react.dev/) for UI
- [TypeScript](https://www.typescriptlang.org/) for type safety
- [Vite](https://vite.dev/) for development and builds
- [pako](https://github.com/nodeca/pako) for compressed saves
- [@yohawing/three-mmd-loader](https://github.com/yohawing/three-mmd-loader) for MMD support

## Assets

Block textures use [Pixel Perfection Legacy](https://www.planetminecraft.com/texture-pack/pixel-perfection-legacy/), a free Minecraft resource pack. Some item, torch, lantern, frame, and coin-style textures are generated or provided in the project assets.

## Notes

- `npm run build` may show Vite warnings about Node modules externalized by the MMD loader package. These warnings are currently non-blocking for the browser build.
- Large bundle warnings are expected because the app includes Three.js/WebGPU and MMD-related runtime code.

## License

[MIT](LICENSE)
