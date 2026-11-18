# Development and verification

[Overview](../README.md) · [Architecture](ENGINE.md) · [Performance](PERFORMANCE.md) · [Remaining work](ROADMAP.md)

## Prerequisites

- Node 22.18+ for the Node test runner and TypeScript test registration.
- Install the dependencies recorded in `package-lock.json` with `npm ci`.
- Supply the block textures imported by `src/engine/blocks.ts` under
  `assets/minecraft/textures/block/`. `assets/` and `resourcepacks/` are gitignored;
  dependency installation does not restore these local resources. Preserve the
  imported filenames and folder layout. Custom item assets are in `src/assets/items/`.
- Use a browser with WebGL, IndexedDB and module Worker support for integration checks.

## Standard verification

From the repository root:

```bash
npm test
npm run build
```

Then start the development server:

```bash
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180
```

Open `http://127.0.0.1:5180/tests/browser.html`, click **运行完整验证**, and wait for
`ALL PASSED`. Inspect browser errors as well as the assertion output. Test routes
are development-only entries and are not included in the production bundle.

The direct Vite entry above was used successfully in this Windows environment;
`npm run dev` remains the normal package script. No server is assumed to be running
between work sessions. Stop local servers when their checks are complete.

## What each check covers

| Check | Scope |
| --- | --- |
| `npm test` | Deterministic generation, chunk transfer/streaming, edit persistence, collision, fixed clock, water/TNT boundaries, mesh geometry/stale guards, control state, diagnostics and shadow policy |
| `npm run build` | Production TypeScript compilation and Vite bundle, including Worker assets |
| `/tests/browser.html` | Real WebGL, module Workers, IndexedDB, GLTF persistence, generated PMD/VMD smoke, input/menu races, atlas pixel comparisons/fallback, quality settings and repeated context loss/restoration |
| `/tests/performance.html` | Fixed-seed A/B rendering plus separate terrain/mesh Worker measurements; click **运行基准** and wait for `DONE` |
| `/tests/webgpu.html` | Standalone terrain test: compare captured WebGPU and WebGL frames, inspect the actual backend after initialization, and exercise both fallback paths |
| `/tests/webgpu-mmd.html` | Click **运行验证**: compare pixel regions and interpolated bone motion at four frames with a generated textured PMD and three VMD keys. `?forceWebGL` exercises explicit native-test skip. |
| `/tests/settings.html` | Actual desktop settings component, interactive preset and detail controls |
| `/tests/settings.html?mobile` | Actual touch settings panel; inspect at a mobile viewport |

The integration suite creates uniquely named test saves and deletes those saves in
cleanup. It also removes its own temporary legacy-data fixture; it does not clear
all browser storage. Browser smoke helpers are called by the integration entry,
not by `npm test`.

For settings layout, check desktop and mobile widths, high/low/custom states,
scrolling to every control, keyboard focus and the return button. Viewport checks
do not substitute for real touch/fullscreen or device endurance testing.

## Production preview and online smoke

After building:

```bash
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5181
```

Create a world at `http://127.0.0.1:5181/` and confirm loading reaches the game with
terrain visible and no runtime errors. After an authorized deployment, repeat on
the production domain and verify the entry asset filenames match `dist/index.html`.
Localhost, production and per-deployment URLs use separate browser storage.

## Last completed verification

**2026-11-18 release `80162abe` (source `f79c748`):** 81 Node tests, 104 top-level browser
assertions and the production build passed. The Chromium menu/autosave subset
also passed independently (15/15) with real IndexedDB and WebGL. It covers a
stale timer callback after disabling autosave, delayed and coalesced writes,
quota versus metadata-refresh failures, and restoring the latest hotbar and
autosave preference after reopening. These are single-tab checks. The periodic
timer runs while a world is open, including while paused; background tabs can be
throttled. There is no guaranteed final write on browser/tab close. The in-game
return action is blocked during pending writes and prompts before discarding
progress after a failed save.

For the **2026-11-17** release:

- 63 Node tests passed.
- 91 top-level browser assertions passed with no reported console problems in the
  final run. Helpers include additional internal assertions and image comparisons.
- Production build and local production-preview world creation passed.
- Desktop and mobile settings layouts were inspected.
- Production world creation passed after deployment; both domains served the new assets.

These counts record that release, not a fixed expected count for future work.
Real PMX/PMD + texture + VMD appearance/playback/save acceptance and real-device
endurance remain open in [ROADMAP.md](ROADMAP.md).

## Known build notices

The MMD loader references `node:fs/promises` and `node:url`, which Vite externalizes
for browser compatibility. The production bundle also exceeds the large-chunk
warning threshold. These notices were present in the successful release build;
the generated-model smoke does not establish compatibility with every MMD asset.
