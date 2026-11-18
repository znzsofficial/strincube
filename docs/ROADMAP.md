# Remaining work

Planning baseline: stable WebGL deployment `8a4f83e4`, source `e2ecf7e`.
This is the repository's handoff checklist; update it when acceptance is completed.
Deployment authorization does not imply authorization to commit or push source.

## Recommended next iteration

Prioritize additions players can try immediately: creature interactions, more
distinctive landscapes, and visual upgrades with a modest frame cost. Use play
sessions (exploring, building and editing), not edge-case coverage, to pick the
next performance target.

Lead with familiar Minecraft-style play and natural lighting. The development
water pass couples pitch-directed swimming to depth-dependent fog and daylight;
the Strinova-inspired traversal ideas remain optional experiments.

1. **Establish the comparison point.** Preserve the release/source relationship
   described below. On a desktop GPU and physical phone, run the existing WebGL
   fixture and the same exploration/edit route in the foreground. Record raw frame
   P95, CPU stages, draw calls and queue recovery after movement stops. Collect
   symmetric frame samples on both sides before comparing frame rates. The working
   tree now samples RAF intervals on both sides; real-device baselines are pending.
2. **Validate the optional renderer and real models.** Terrain and a generated
   textured PMD/VMD now run in WebGPU fixtures. Next check real character materials,
   shadows, effects and device loss against the stable WebGL renderer. Keep backend
   selection independent of the low/medium/high quality presets.
3. **Use the results to choose the next release.** Expose an optional renderer only
   once native execution, fallback and gameplay compatibility are demonstrated.
   Schedule optimization by measured bottleneck. Collect fixed-seed terrain images
   now; change generated output only after agreeing how existing delta saves load.

## WebGPU experiment: release criteria

The old engine had an experimental WebGPU path with simplified effects. The current
release uses `WebGLRenderer` only. Restoring the old selector on its own would not
select a different backend.

- In the seed-42 fixture, start with terrain only and shadows/postprocessing off.
  After renderer initialization, report requested and actual backend; show real
  native WebGPU output on a supported device and exercise the WebGL fallback.
  Compare water, cutouts and atlas mip levels against the same WebGL view.
- The dedicated MMD loader 0.8.6 WebGPU entry currently imports shadow helpers
  absent from the installed Three r187 TSL exports. Resolve this compatibility
  issue and test real textured PMX/PMD + VMD before claiming model support.
- Before adding a player-facing selector, verify shadow updates, device-loss
  recovery, accurate diagnostics, and supported effects (or clearly label unavailable
  effects). Prefer applying backend changes on the next world entry to protect edits.

## Completed baseline

- [x] Single rebuilt runtime with deterministic generation and evictable edited chunks.
- [x] IndexedDB v3 saves with model files, relative paths and deferred simulation state.
- [x] Separate terrain/mesh Workers, bounded queues, stale rejection and failure fallback.
- [x] Material atlas batching, shadow refresh budgets and low/medium/high quality presets.
- [x] Menu/input race fixes, performance diagnostics and repeated WebGL restoration.
- [x] 96 Node tests, 107 browser assertions, production build and online world-creation smoke.
- [x] Production deployment; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Source archival

Use `f79c748` as the application source reference for `80162abe`. A fresh build
still requires the separately supplied texture inputs documented in the setup guide.

- [x] Rebuild and subsequent backup/WebGPU prototype changes were committed and
  pushed as `d22dda6`. The deployment record distinguishes this development
  snapshot from the earlier direct upload and setup documents local texture inputs.

Acceptance: source history identifies what was released; a deployment's older Git
metadata is not presented as the complete source revision of this dirty-tree upload.

## Hardware and model acceptance — high priority

Inputs for the next round: one representative textured character and its VMD,
one physical phone and one desktop GPU/browser. Record which backend actually
ran, the selected preset, viewport and pixel ratio with each result. Use a test
world rather than the only copy of a player's save.

- [ ] Real PMX/PMD + textures + VMD: appearance, playback, instance properties,
  save, close and reload.
- [ ] Physical mobile devices: touch controls, fullscreen, menus, background/resume
  and extended exploration.
- [ ] Representative GPUs/browsers: foreground performance for each quality preset,
  prolonged memory/resource behavior and context recovery.

Acceptance: record models/devices/browser versions, reproduction steps and observed
results. Generated PMD/VMD fixtures and mobile viewport layouts are not substitutes.

## Save management

- **Order:** share a v3 validator between loading and importing, then implement
  export/import, then coordinate writes before enabling autosave. A portable
  archive needs a manifest and binary model, texture and motion files; JSON alone
  cannot restore those files. Import as a new world by default. Check that a
  truncated archive or missing asset leaves all existing saves intact.
- Separate a failed write from a successful write followed by a failed list refresh.
  If a manual save arrives during another write, test that the latest requested
  state for that world survives a close/reload.

- [x] Released: title-screen export/import of v3 edits and model resources;
  import validates the portable file before inserting a distinct world and metadata.
- [x] Released: opt-in 60-second per-world autosave, coordinated with manual
  saves, with committed/list-refresh-failed and write-failed states distinguished.
- [x] Released: origin-wide capacity estimation and actionable quota feedback.
- [x] Released: shared v3 structural validation before runtime construction,
  local loading and portable import. Actual model decoding still happens on load.

Acceptance: populated worlds round-trip through export/import; concurrent save paths
do not overwrite newer state; malformed data and storage failures have controlled
outcomes. Existing version/generator rejection and shadow normalization already work.

## Performance follow-up

- [ ] Stress continuous edits, chunk churn and long exploration; inspect bounded
  queues, stale results, resource release and frame spikes.
- [ ] Profile and optimize main-thread mesh snapshot packing with the same fixture.
- [ ] Evaluate merged-mesh culling and added transfer bytes on real hardware.
- [ ] Evaluate dynamic resolution after collecting representative device data.

Acceptance: preserve geometry/material behavior and async lifecycle guarantees;
report CPU, GPU, draw counts and frame intervals separately. Compare against
[PERFORMANCE.md](PERFORMANCE.md), not timings from a differently throttled run.

## Terrain appearance

Design and baseline: [地图生成器设计](TERRAIN-DESIGN.md). The development default now
uses regional drainage; `/tests/watershed.html` compares old and new maps and supports walking at selected coordinates.

- [x] Regional drainage, converging tributaries, terminal lakes and buildable terraces.
- [ ] Further biome transitions and additional structures.
- [ ] Fixed-seed visual acceptance for coastlines, valleys, caves, trees and transitions.

Acceptance: deterministic output and cross-chunk consistency remain intact. Any
released generation-output change updates `GENERATOR`; do not silently regenerate
existing delta saves with a different algorithm. New worlds use `terrain-watershed-2`;
v2.1/v2.2 saves and historical fixed-geometry benchmarks keep their original profiles.

## Scope retained

Production remains WebGL. WebGPU is a candidate for an opt-in prototype; a public
selector or default-backend change is a separate release decision. Legacy v2/localStorage
migration remains out of scope; existing old browser data is not automatically erased.

Development checkpoint: the WebGPU terrain prototype at `/tests/webgpu.html` has
rendered on a native NVIDIA adapter and exercised both Three's WebGL2 backend and
the stable WebGL renderer after an initialization failure. The fixture adds a pond
to the fixed world; its 101,564 triangles are not the main benchmark's 101,482.
Real MMD materials, shadows, postprocessing and gameplay/device-loss lifecycle
remain gates for a player-facing backend selector.

Controlled device loss after native drawing now falls back successfully in the
terrain fixture and in the real game loop with active streaming. Camera, edit
journal, selected block and existing geometry survive; after a fresh user gesture,
the replacement canvas supports picking and movement. Remaining gates include
real-character materials and playback during recovery, effects/shadows, mobile
device validation, and an explicit UI policy for selecting a backend on world entry.

The development fixture `/tests/webgpu-mmd.html` now exercises a generated PMD
with two bones, a relative diffuse PNG and a keyed VMD. The standard loader supplies
the skeleton/animation; a narrow node-material adapter borrows the diffuse map.
This bypasses the incompatible dedicated WebGPU shadow entry for this experiment.
It does not establish parity for sphere maps, SDEF/QDEF, proxy meshes, outlines,
material morphs, self-shadows, IK/physics or a real character's appearance.
