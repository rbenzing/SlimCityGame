# Frame cost: where a frame goes on the card Chrome picks

Measured with `tools/probes/frame-budget.mjs` in its cost mode, on WebGPU, against a dev server. Nothing here changes what a player sees; the dev switches live under `import.meta.env.DEV` (`src/main.ts`, `src/render/framecostprobe.ts`, `?noaa` and `?gputime` in `src/render/scene.ts`).

## Method

- The city is built by command (the probe's synthetic grid of streets and zoned buildings, seed 7, first terrain generator, sim paused, noon). The ticket asked for 3,000 buildings: the probe was asked for a target of 3,000 and **1,396 stood** (3,061 planned, 1,665 refused by the placement rules; the refusal rate falls as the target rises, so a small target stands far fewer than it plans). Standing counts per target: 500 -> 198, 1,500 -> 681, 3,000 -> 1,396, 6,000 -> 2,812. Every table says which it used. The 6,000 target is the nearest to "a city of 3,000 buildings" as standing.
- Each case switches one cost off, waits 0.7 s, then reads 90 frames (30 warm-up). Each pass runs base, every case, base again, per view; three passes. The base spread therefore covers six readings.
- **GPU ms** is from timestamp queries (`?gputime`, median of 12 single-frame reads). **Render-call ms** is main-thread time inside the render call: it includes any wait the call makes on the GPU queue, so it is not pure CPU. **Frame ms** is the page's own `requestAnimationFrame` delta.
- **The frame columns sit at the display cap.** `--disable-frame-rate-limit` does not lift the cap in headless Chromium: frames read 17.4 ms (p95 18.2) in every case once the city has settled, even with every group hidden (GPU 0.2 ms, render call 0.4 ms). Frame ms therefore cannot rank costs under 17.4 ms; **the ranking below is by GPU ms**, with render-call ms for the page side. A cost is "no measurable change" (n.m.) when its change is inside the summed run-to-run spread of the base and the case (and under 0.3 ms GPU, 0.5 ms render call).
- Views: 1-street, 2-oblique, 3-overview, 4-oblique-night, 5-water (the probe's). Frame cap flag off, nothing else of ours running; the user's own Chrome and other agents' tools were open on the machine, which the spread includes.
- Pixel ratio: the probe's page has devicePixelRatio 1, so "ratio-1" is the default. The hook was checked to change the canvas (1280x800 -> 640x400 at 0.5, 2560x1600 at 2).

## Machine

Intel Core Ultra 7 265H, 16 logical cores; Windows 11. Adapters: integrated Intel Arc Pro 140T (xe-lpg; the one Chrome picks) and discrete NVIDIA RTX PRO 500 Blackwell Laptop GPU (`SHOTS_DISCRETE_GPU=1`, `--force_high_performance_gpu`). Chromium 149.0 (Playwright full Chromium, WebGPU on D3D). Viewport 1280x800 at DPR 1. Both adapter names are read back in `result-*.json`.

## Results (3,000 target, 1,396 standing)

Baseline per view (mean, sd over six readings):

| Card | View | GPU ms | render call ms | frame ms | draw calls | triangles |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| integrated | street | 12.8 (3.4) | 9.9 | 17.9 | 378 | 15.1M |
| integrated | oblique | 14.1 (0.3) | 5.9 | 17.4 | 513 | 15.6M |
| integrated | overview | 14.3 (0.2) | 6.8 | 17.4 | 633 | 15.8M |
| integrated | night | 13.8 (0.4) | 5.9 | 17.4 | 514 | 15.7M |
| integrated | water | 11.4 (0.1) | 2.8 | 17.4 | 214 | 13.6M |
| discrete | street | 4.9 (0.4) | 4.8 | 17.5 | 378 | 15.1M |
| discrete | oblique | 5.6 (0.1) | 5.8 | 17.5 | 513 | 15.6M |
| discrete | overview | 5.9 (0.1) | 7.6 | 17.5 | 633 | 15.8M |
| discrete | night | 5.7 (0.1) | 5.9 | 17.5 | 514 | 15.7M |
| discrete | water | 5.1 (0.1) | 3.0 | 17.5 | 214 | 13.6M |

Change in GPU ms from the baseline, oblique and overview (mean change, sd of the case). The other views and the render-call tables are in `ablate-*.md` and `ablate-*.json`.

| Case | integrated oblique | integrated overview | discrete oblique | discrete overview |
| ---- | ---- | ---- | ---- | ---- |
| shadows off | -4.1 (1.8) | n.m. (-1.1, sd 2.5) | -2.0 | -1.9 |
| shadow map 2048 / 1024 | n.m. | n.m. | n.m. | n.m. |
| post pass off (direct render) | n.m. | n.m. | n.m. | n.m. |
| bloom off | -2.5 | -2.6 | -1.7 | -1.8 |
| antialiasing off (page reload) | -4.9 | -4.5 | -1.2 | -1.6 |
| pixel ratio 1 / 2, canvas 0.75 / 0.5 | n.m. | n.m. | n.m. | n.m. |
| hide terrain, water, sea, roads, furniture, lots, power | n.m. | n.m. | n.m. (terrain, lots -0.4 overview) | n.m. |
| hide trees | n.m. (-1.5, sd 1.6) | n.m. (-1.6, sd 1.6) | -1.5 | -1.6 |
| hide buildings | n.m. (-1.2, sd 1.9) | n.m. (-0.8, sd 2.1) | -1.0 | -1.1 |
| hide vehicles | -2.9 | -2.7 | -2.5 | -2.7 |
| hide everything (sky and post only) | -13.9 | -14.2 | -5.2 | -5.5 |

Groups hidden: terrain = terrain chunks; water = the lake/river surface; sea = the far sea mesh alone; trees = tree meshes; roads = road mesh, free roads, bridges, guideway, tram stations; furniture = road furniture, lamps, sound walls, bus stops; buildings = building instancer, massing, utility kits, landmarks, farms, landfill; lots = lot grounds and parked cars; vehicles = traffic, service vehicles, transit, pedestrians; power = pole lines and cables. Groups are identified by the renderer file that added each object to the scene.

Shadow-map size, bloom-off and shadows-off re-allocate or compile on the switch: their first frames cost 20 to 45 ms on the page side (the integrated 2048 and 1024 shadow rows carry that, hence the large spread); their GPU figures are read after the 0.7 s wait.

## Is it the GPU or the page?

- Integrated, steady state (after ~30 s): GPU 14.1 ms and render call 5.9 ms in the oblique view; the GPU is the larger share and sets the frame once it passes 17 ms (the 6,000 target: GPU 23.0 ms, frame 35.7 ms in the overview). Discrete: GPU 5.6 ms, main thread 5.8 to 7.6 ms; the page is the larger share and the frame sits at the cap.
- Right after a build the page is the cost: render-call ms on the integrated card reads 40.6 at 14 s, 27.4 at 22 s, 17.8 at 27 s and holds near 17 to 18 for the next minute (paced frame 43.5, 29.2, 19.7 ms); on the discrete card it is 7 ms from the first read. This is the 29 to 47 ms a fresh city shows. The first city read in `result-integrated.json` (33 ms street) is this tail.
- Main-thread top functions, discrete card (a clean profile, per frame): `updateAttribute`, `_update`, `_projectObject` (three.js renderer internals, about 0.5 ms each), then `updateMatrixWorld`. The integrated profile is distorted by the profiler (frame 21.7 against 17.4) and is dominated by native waits: `writeBuffer` 12.1 ms, `createCommandEncoder` 7.3, `setVertexBuffer` 5.8 per frame (oblique); `writeBuffer` is called from three's `updateBinding` (per-object uniform writes), about 179 calls and 1.95 MB per frame.
- The page writes the same 1.9 MB in 179 `writeBuffer` calls each frame on both cards; with all building meshes hidden it is 46 calls and 1.4 MB.

## Triangles (oblique view, 3,000 target)

The renderer reports 15.6M triangles a frame: 7.35M in the shadow pass and 8.28M in the scene pass (shadows off). The scene holds 10.68M triangles submitted in one pass across 1,423 meshes; **0.83M are in view** (0.26M street, 2.06M overview).

| Group | meshes | instances | triangles submitted | instances in view | triangles in view |
| ---- | ---- | ---- | ---- | ---- | ---- |
| vehicles | 17 | 18,940 | 3.77M | 422 | 0.084M |
| trees | 4 | 42,889 | 2.78M | 500 | 0.040M |
| lots | 344 | 344 | 1.65M | 25 | 0.300M |
| roads | 103 | 109 | 1.17M | 20 | 0.262M |
| buildings | 681 | 66,474 | 0.94M | 3,390 | 0.061M |
| terrain | 260 | 260 | 0.14M | 26 | 0.016M |
| furniture | 5 | 741 | 0.16M | 38 | 0.009M |
| sea, water | 2 | 2 | 0.06M | 2 | 0.061M |

Five largest instanced meshes: trees 23,314 x 92 = 2.14M (408 in view); vehicles 8,363 x 200 = 1.67M (344 in view); trees 13,037 x 30 = 0.39M (92 in view); vehicles 1,024 x 300 = 0.31M (0 in view); vehicles 1,024 x 288 = 0.29M (0 in view). Meshes are named `BufferGeometry` in the scene (no names set), so they are given by group, instances and triangles each.

Culling: three tests each mesh once against its bounding sphere, not each instance. Terrain, road and lot chunks are separate meshes, so whole chunks outside the view are skipped. Instanced meshes spanning the map (trees, vehicles, buildings) always pass, so every instance is submitted and vertex-shaded, and the shadow pass submits them again. Twelve of the vehicle meshes have frustum culling off; the vehicle pools submit all 18,940 slots, active or parked off-map.

## Antialiasing

Built without antialiasing on a fresh page load (GPU ms, with / without): integrated street 12.8 / 7.2, oblique 14.1 / 9.2, overview 14.3 / 9.8, night 13.8 / 9.4, water 11.4 / 7.4. Discrete: 4.9 / 3.8, 5.6 / 4.4, 5.9 / 4.3, 5.7 / 4.3, 5.1 / 4.1.

## Scale (integrated, baseline GPU ms and render-call ms)

| Target | Standing | Street GPU | Street render call | Overview GPU | Overview render call | Overview triangles |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| 500 | 198 | 4.4 | 11.9 | 4.6 | 11.6 | 9.75M |
| 1,500 | 681 | 6.6 | 15.2 | 7.3 | 15.7 | 12.4M |
| 3,000 | 1,396 | 12.8 | 9.9 | 14.3 | 6.8 | 15.8M |
| 6,000 | 2,812 | 12.9 | 23.8 | 23.0 | 34.9 | 24.4M |

GPU ms grows with the buildings and the triangle count; at 6,000 the overview frame is 35.7 ms. The render-call column for 500 and 1,500 is higher than at 3,000 because those runs read earlier in the post-build tail (the 20 s wait was inside it); the GPU column is not affected.

## Where the time goes, ranked (GPU ms in the oblique view; share of the baseline GPU ms)

| Rank | Cost | integrated | share | discrete | share |
| ---- | ---- | ---- | ---- | ---- | ---- |
| 1 | Vehicle pools (18,940 instances submitted, 422 in view) | 2.9 | 21% | 2.5 | 45% |
| 2 | Shadow pass (7.35M of 15.6M triangles) | 4.1 | 29% | 2.0 | 36% |
| 3 | Antialiasing | 4.9 | 35% | 1.2 | 21% |
| 4 | Bloom | 2.5 | 18% | 1.7 | 30% |
| 5 | Trees (42,889 instances, 500 in view) | 1.5 (inside spread) | 11% | 1.5 | 27% |
| 6 | Buildings | 1.2 (inside spread) | 9% | 1.0 | 18% |
| 7 | Lots and parked cars, roads | 0.8, 0.6 (inside spread) | 6%, 4% | 0.2, 0.2 | 4%, 4% |
| - | Terrain, water, sea, furniture, power, post pass, pixel ratio, canvas size, shadow-map size | no measurable change | | no measurable change | |

The shares overlap (the shadow pass and the vehicles and trees it draws are counted in each) and do not sum to 100%. The integrated card shows no sensitivity to pixel count (0.5 to 2 ratio all inside the spread), so its time is per-triangle and per-sample work, not fill.

## Not measured

- A live simulation: the sim is paused, so traffic and walkers do not move and no snapshots arrive. The 29 to 47 ms of a played city may include per-frame buffer updates from motion that this run does not have.
- Pure CPU time on the integrated card: the render call waits on the GPU queue there, and its profile is distorted by the profiler.
- True frame time above 17.4 ms below the cap (the cap hides it); GPU ms stands in for it.
- 3,000 buildings standing on the discrete card and 1,500 or 6,000 on it; the scale runs are integrated only.
- WebGL2 fallback.

## Files

`ablate-<tag>.json` and `.md` (all cases, per view, with spreads), `census-<tag>.json` (triangles by group and mesh, all views), `profile-<tag>.json` (main-thread profile), `result-<tag>.json` and `.md` (the probe's standard report for the run, including the empty-map baseline and the first city read). Tags: `integrated`, `discrete`, `noaa-integrated`, `noaa-discrete`, `scale-500`, `scale-1500`, `scale-6000`. Re-run: `node tools/probes/frame-budget.mjs http://localhost:5173 --webgpu --buildings 3000 --out tools/probes/framecost --ablate --census --profile --tag <name>`.
