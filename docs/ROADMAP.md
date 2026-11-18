# Remaining work

The [release record](DEPLOYMENT.md) identifies the live build and its source. The
[verification guide](TESTING.md) distinguishes checks run on the public game
from development fixtures. The WebGPU selector, seed atlas, small-screen menus
and touch HUD are already live.

## Next gameplay iteration

Prioritize a change players can encounter while exploring or building. One
candidate is cave lighting: walk from daylight through a cave mouth, place a
torch, and check that the route remains readable without flattening the contrast
outside. Strinova-inspired traversal remains an idea, not a shipped mechanic.

## Renderer and device acceptance

- [ ] On a physical phone, enter fullscreen, pause, change settings, swipe to
  hotbar slot 9, open the bag, background the browser and resume. Repeat after
  sustained exploration. Record the browser, viewport and actual backend.
- [ ] Import a representative PMX/PMD character with textures and VMD. Compare
  appearance and playback on WebGL and WebGPU; edit an instance, save and reopen.
  Check playback and materials after native device loss and WebGL recovery.
- [ ] Implement and compare native shadows and postprocessing before offering
  them in the WebGPU settings. The dedicated MMD 0.8.6 WebGPU entry expects shadow
  helpers absent from Three r187. The generated two-bone diffuse-material fixture
  does not establish parity for outlines, material morphs or real character assets.

## Performance

On a representative desktop GPU and phone, repeat the same foreground exploration
and editing route. Record preset, pixel ratio, raw frame P95, CPU submission,
worker work, draw calls and queue depth after movement stops. Check resource growth
over repeated chunk loads and evictions. Use those results to choose between mesh
snapshot packing, culling granularity and dynamic resolution. The historical
[fixed-camera benchmark](PERFORMANCE.md) is not a real-device FPS baseline.

## Terrain

Use the [seed atlas](https://strincube.pages.dev/atlas/) and the fixed-seed samples
in [Terrain design](TERRAIN-DESIGN.md) to evaluate biome transitions, regional
structures and elevated watercourses. Compare walkable home sites, river routes
and cave entrances as well as overhead images. If generated output changes, give
new worlds a new generator ID; supported v3 saves must retain their original terrain.
