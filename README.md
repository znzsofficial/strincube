# StrinCube

A Minecraft-like voxel sandbox game built with Three.js + React + TypeScript.

## Features

- **World Generation** — 7 biomes (plains, forest, jungle, desert, snow, taiga, savanna), terrain, rivers, caves, structures, ores
- **120+ Block Types** — Dirt, stone, wood, leaves, wool, glass, ice, and more
- **Water Physics** — Flowing water with MC-style spread (7 block range, 250ms tick), waterfall at void edges
- **Day/Night Cycle** — Dynamic sun/moon, sky color transitions
- **Save System** — Compressed binary format (pako), unlimited save slots
- **Inventory** — Hotbar with 9 slots, block picker, item icons
- **Model Import** — GLTF and MMD model support with placement, animation, and per-part settings
- **Creatures** — Auto-spawning ambient creatures
- **Continuous Mining & Placing** — Hold to break/place blocks
- **Settings** — Mouse sensitivity, move speed, view distance, shadows, time of day, and more

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Space | Jump |
| Mouse | Look around |
| Left click | Mine |
| Right click | Place |
| E | Inventory |
| O | Settings |
| M | Import model |
| Esc | Pause menu |

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

## Project Structure

```
src/
  App.tsx              — UI layer (title, loading, inventory, settings)
  main.tsx             — React entry point
  styles.css           — All styles
  game/
    blockGame.ts       — Core game engine (rendering, physics, world gen)
    blocks.ts          — Block type definitions, materials, textures
    types.ts           — Shared TypeScript types
    save.ts            — Save/load serialization (pako compression)
```

## Texture Assets

Block textures are sourced from Minecraft's resource packs and are **not included** in this repository due to copyright. Place the `assets/` directory (containing `minecraft/textures/block/`) in the project root for textures to load.

## Tech Stack

- [Three.js](https://threejs.org/) — 3D rendering
- [React](https://react.dev/) — UI
- [TypeScript](https://www.typescriptlang.org/) — Type safety
- [Vite](https://vite.dev/) — Build tool
- [pako](https://github.com/nodeca/pako) — Save compression

## License

[MIT](LICENSE)
