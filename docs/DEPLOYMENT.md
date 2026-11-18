# Deployment

[Verification](TESTING.md) · [Remaining work](ROADMAP.md)

Cloudflare Pages project: `strincube`, production branch: `master`.

- Production: https://strincube.pages.dev
- Custom domain: https://game.nekolaska.vip
- Current deployment (2026-11-18): https://80162abe.strincube.pages.dev
- Previous stable deployment: https://cb479810.strincube.pages.dev

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
