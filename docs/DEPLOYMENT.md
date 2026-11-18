# Deployment

[Verification](TESTING.md) · [Remaining work](ROADMAP.md)

Cloudflare Pages project: `strincube`, production branch: `master`.

- Production: https://strincube.pages.dev
- Custom domain: https://game.nekolaska.vip
- Current deployment: https://ada963e1.strincube.pages.dev
- Previous stable deployment: https://c7d25129.strincube.pages.dev

## 2026-11-18 — valley launcher, textured sky and live renderer switching

Application source: [`921fc22`](https://github.com/znzsofficial/strincube/commit/921fc22).
The launcher shows the seed-42 river valley. In play, both renderers draw the sun,
moon and pixel clouds. Rock and snow use original tiles, and loaded water surfaces
have a ripple texture on their first draw. This release also updates fast-turn
input and lets a player jump from a one-cell pool onto a one-block bank.

**Pause → Settings → 渲染后端** switches the running world's renderer. On the live
Pages site, Edge created a world and switched WebGL → native WebGPU → WebGL in
its pause menu. Each switch left one canvas with the requested context. Both
production domains served `index-4NM7JU8P.js` and `index-BBR9WAZX.css`.
97 Node tests, 109 browser assertions and the production build passed. Save
format and terrain generator are unchanged.

## 2026-11-18 — opt-in WebGPU and walkable atlas

Direct upload from the working tree based on `d69e3fb`. That commit identifies the
previous revision, not the exact source of this deployment. Production Edge checks on
the Pages domain selected native WebGPU, entered a world, and confirmed the canvas
and settings reported the same backend. With the GPU API unavailable, startup used
WebGL and the panel reported the fallback. Selecting a different preference during
play did not restart the world. The public `/atlas/` opened a walkable sample.
The custom domain served `index-BmhWF7X6.js` and `index-JA5BDGq1.css`.
96 Node tests, 107 browser assertions and the production build passed.

## 2026-11-18 — small-screen menus and touch HUD

Application source: [`e2ecf7e`](https://github.com/znzsofficial/strincube/commit/e2ecf7e).
The title screen and in-game menus scroll on short viewports. Touch players can
swipe through the hotbar while keeping the inventory button in reach. This
UI-only release uses the same saves and terrain generator as `dde2dab5`.

96 Node tests, 107 browser assertions and the production build passed. Both
production domains served `index-CqlxD500.js` and `index-DnsB57Yj.css`. On the
live Pages site, Chromium with emulated touch created and entered a world,
checked the HUD at 844×390, 568×320 and 320×568, and selected slot 9 by swiping
before opening the inventory. Physical phone testing remains outstanding.

## 2026-11-18 — watershed worlds and building feedback

Application source: [`5b20ad5`](https://github.com/znzsofficial/strincube/commit/5b20ad5).
New worlds use `terrain-watershed-2`; earlier supported terrain profiles remain
available when loading saves. This release adds riverbank/forest/meadow detail,
per-stone picking and outlines, original terrain tiles, contact lighting, edit
particles, creature lures, swimming and underwater fog. Production uses WebGL.

`npm test` (96 tests), 107 browser assertions and the production build passed.
Both production domains returned `index-BJyrPWGi.js` and `index-pFwEY8Pu.css`;
creating a world on the Pages domain reached the ready-to-play screen. Keep a
portable backup: the previous deployment cannot load the new terrain generator ID.

## 2026-11-18 — backups and autosave

Source: [`f79c748`](https://github.com/znzsofficial/strincube/commit/f79c748).
The verified `dist/` was uploaded directly to Pages with this source SHA attached.
Both public domains served `index-3qqORQ7z.js` and `index-DkQjTO7O.css`.
On the production Pages domain, the backup import control appeared and a newly
created world reached the ready-to-play screen. The production renderer is WebGL;
WebGPU fixtures run only on the development server.

Release checks: 81 Node tests, 104 browser assertions and a production build.
This release adds portable `.strincube` backups, structural validation, opt-in
60-second autosave and origin storage estimates. Rolling back the hosted app will
not roll back local browser saves. Keep a downloaded backup before switching origins.

## 2026-11-17 — rebuilt engine (`cb479810`)

Deployed the verified local `dist/` using Wrangler Pages direct upload. This release
contains the engine rebuild, worker generation/meshing, atlas batching, shadow
budgets and quality presets. This upload was built from an uncommitted working tree.
The subsequent `master` commit `d22dda6` archives the rebuild together with later
backup and WebGPU-fixture work; it is not an exact source revision for `cb479810`.

Verification before deployment: 63 Node tests, 91 browser assertions, production
build and local production-preview world creation passed. Both production domains
serve `index-DvPXg3Cd.js` and `index-CeYHxHNS.css`.

Post-deployment verification also created a new world on the production Pages
domain and reached the game without reported runtime errors.

## Publishing procedure

1. Complete the [verification workflow](TESTING.md) and build the intended source
   into `dist/`, including the required local texture assets.
2. Check the Pages project and production branch. This project uses direct upload,
   not an automatic Git-provider deployment.
3. With deployment authorization and an authenticated Wrangler installation, upload
   `dist/` to project `strincube`, branch `master`.
4. Record the deployment URL, source state and entry asset filenames. Confirm both
   public domains serve the new entry assets and create a world on production.

The command used for the historical engine-rebuild release (Wrangler 4.158.0) was:

```bash
wrangler pages deploy dist --project-name strincube --branch master --commit-dirty=true --commit-message "Rebuilt engine, worker terrain and meshing, atlas batching and quality presets"
```

`--commit-dirty=true` describes this release's uncommitted source state; use metadata
that reflects the actual checkout for future uploads. Publishing does not commit
or push code. See [ROADMAP.md](ROADMAP.md) for current development status.

## Storage and recovery boundaries

The Pages domain, custom domain and per-deployment URLs are different origins, so
their browser saves are separate. Use the same domain when checking an existing
save. Neither deployment nor switching domains transfers browser saves.

The previous deployment URL is retained above as a release reference. Reverting
the hosted application does not revert IndexedDB state or make v3 saves readable
by the old engine. The `cb479810` release does not include portable backup controls
or automatic backups; the later development backup implementation is not part of
this deployment.
