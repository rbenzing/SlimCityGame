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

## At 5,023 standing (target 13,700)

Target found by `--build-only`: 8,000 stood 3,739; 10,700 stood 4,499; 12,000 stood 4,670; 13,700 stood 5,023 (10,716 planned). Each run below waits for the render-call time to stop falling (read every ~5 s, at most 120 s) before it reads; the 5,023 city settled flat after 32 s on the integrated card and 21 s on the discrete card, the 2,812 city after 33 s. Frames here are above the 17.4 ms cap, so frame ms ranks directly. Spread is the sd over six readings in brackets.

Baseline, integrated:

| View | GPU ms | render call ms | upload ms | upload calls | frame mean ms | frame p95 ms | draw calls | triangles |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| street | 19.6 (2.5) | 22.4 (3.5) | 9.4 | 163 | 23.2 (3.2) | 34.7 | 434 | 24.28M |
| oblique | 20.2 (1.3) | 20.7 (2.1) | 7.8 | 223 | 21.9 (1.6) | 35.3 | 615 | 24.59M |
| overview | 33.2 (2.4) | 34.2 (2.4) | 10.5 | 232 | 34.9 (2.3) | 41.9 | 1016 | 27.70M |
| night | 20.4 (1.4) | 21.0 (2.4) | 8.2 | 224 | 22.1 (1.8) | 35.4 | 615 | 24.59M |
| water | 19.2 (1.5) | 16.7 (6.3) | 0.5 | 151 | 20.1 (2.3) | 29.6 | 444 | 24.01M |

Baseline, discrete:

| View | GPU ms | render call ms | upload ms | upload calls | frame mean ms | frame p95 ms | draw calls | triangles |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| street | 7.1 (0.2) | 11.1 (0.4) | 2.9 | 183 | 11.6 (0.4) | 13.3 | 447 | 24.28M |
| oblique | 7.3 (0.2) | 11.3 (0.4) | 2.7 | 248 | 11.8 (0.3) | 14.2 | 628 | 24.59M |
| overview | 10.7 (0.4) | 15.1 (0.6) | 1.5 | 256 | 15.7 (0.7) | 25.1 | 1029 | 27.70M |
| night | 7.1 (0.1) | 11.1 (0.3) | 2.6 | 248 | 11.7 (0.3) | 14.1 | 628 | 24.59M |
| water | 7.5 (0.2) | 11.4 (0.3) | 3.7 | 175 | 12.0 (0.3) | 13.8 | 457 | 24.01M |

On the discrete card the frame is below the cap in every view and the render call (11 to 15 ms) is larger than the GPU (7 to 11 ms): the page is the limit there.

Integrated, every case, street and overview:

| Case | street GPU | street render call | street upload ms / calls | street frame (p95) | overview GPU | overview render call | overview upload ms / calls | overview frame (p95) |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| base | 19.6 | 22.4 | 9.4 / 163 | 23.2 (34.7) | 33.2 | 34.2 | 10.5 / 232 | 34.9 (41.9) |
| shadows off | 10.0 (sd 8.2) | 11.5 (sd 13.0) | 18.2 / 94 | 20.7 (22.0) | 26.4 | 15.1 | 26.3 / 139 | 21.4 (35.4) |
| bloom off | 18.7 | 18.2 | 15.7 / 160 | 21.9 (34.9) | 32.8 | 33.5 | 10.0 / 233 | 34.4 (41.5) |
| hide vehicles | 11.8 | 6.2 | 0.2 / 131 | 17.5 (18.3) | 24.0 | 24.7 | 13.4 / 203 | 25.3 (35.7) |
| hide trees | 18.2 | 8.2 | 0.4 / 155 | 17.8 (23.8) | 31.0 | 31.8 | 19.8 / 231 | 32.8 (42.2) |
| hide buildings | 16.2 | 6.9 (sd 7.1) | 0.2 / 41 | 17.8 (18.5) | 27.6 | 28.1 | 4.3 / 45 | 28.7 (36.1) |
| hide lots | 19.5 | 15.5 (sd 8.1) | 7.8 / 159 | 20.0 (29.5) | 24.8 | 26.7 | 6.0 / 233 | 27.4 (35.7) |
| hide roads | 19.6 | 20.5 | 13.8 / 156 | 21.0 (35.5) | 27.0 | 28.1 | 0.5 / 229 | 28.8 (35.9) |
| hide everything | 0.2 | 0.9 | 0.0 / 6 | 17.8 (18.6) | 0.2 | 0.9 | 0.0 / 6 | 18.0 (18.7) |

Antialiasing off (separate page load, integrated, 5,023 standing; GPU / render call / frame ms): street 15.9 / 24.5 / 25.1, oblique 15.5 / 24.9 / 25.5, overview 26.9 / 36.3 / 37.0, night 15.2 / 24.7 / 25.3, water 14.7 / 23.6 / 24.2. GPU falls 3.7 to 6.3 ms; the render call and the frame do not fall (they read higher).

Census at this size, integrated (submitted in one pass against in view). The renderer reports 24.3M triangles in the street view (12.8M with shadows off) and 27.7M in the overview (16.0M); the scene submits 20.29M and has 1.31M in view in the street, 6.55M in the overview.

| Group | instances | triangles submitted | street: instances in view | street: triangles in view | overview: instances in view | overview: triangles in view |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| vehicles | 30,059 | 5.99M | 481 | 0.096M | 6,079 | 1.216M |
| lots | 728 | 4.60M | 26 | 0.411M | 245 | 2.088M |
| roads | 254 | 3.29M | 23 | 0.370M | 111 | 1.544M |
| buildings | 202,711 | 2.96M | 15,535 | 0.229M | 62,971 | 0.987M |
| trees | 42,889 | 2.78M | 1,366 | 0.089M | 7,077 | 0.437M |
| furniture | 2,077 | 0.47M | 160 | 0.036M | 695 | 0.157M |
| terrain, water, sea | 262 | 0.20M | 27 | 0.075M | 115 | 0.123M |

## At 2,812 standing (target 6,000)

Settled flat after 33 s (render call by reading: 16, 26, 27, 26 ms; the earlier scale row for this size read in the tail and is superseded by this one). Integrated.

| Case | street GPU | street render call | street upload ms / calls | street frame (p95) | overview GPU | overview render call | overview upload ms / calls | overview frame (p95) |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| base | 15.4 (1.3) | 9.0 (7.3) | 0.3 / 177 | 18.7 (19.7) | 26.9 (0.4) | 28.1 (0.1) | 15.8 / 232 | 28.8 (36.0) |
| shadows off | 7.9 (6.3) | 8.0 | 15.0 / 101 | 17.8 (23.9) | 21.7 | 6.8 | 37.1 / 137 | 17.6 (18.4) |
| bloom off | 14.0 (2.6) | 10.5 | 15.8 / 175 | 18.5 (23.8) | 28.6 (2.5) | 27.5 | 27.3 / 233 | 28.7 (35.8) |
| hide vehicles | 9.2 | 5.1 | 0.2 / 147 | 17.5 (18.1) | 18.5 | 19.6 | 8.9 / 203 | 20.3 (35.0) |
| hide trees | 13.8 | 6.1 | 0.3 / 171 | 17.5 (18.3) | 24.8 | 26.5 | 15.5 / 231 | 27.2 (35.8) |
| hide buildings | 12.9 | 2.0 | 0.1 / 41 | 17.5 (18.2) | 23.9 | 23.4 | 1.6 / 45 | 24.0 (35.5) |
| hide lots | 15.4 | 5.5 | 0.3 / 173 | 17.5 (18.4) | 19.5 | 20.7 | 1.3 / 233 | 21.2 (35.3) |
| hide roads | 15.3 | 5.5 | 0.3 / 169 | 17.4 (18.2) | 23.3 | 24.8 | 12.4 / 229 | 25.4 (35.7) |
| hide everything | 0.2 | 0.8 | 0.0 / 6 | 17.9 (18.6) | 0.2 | 0.8 | 0.0 / 6 | 18.0 (18.6) |

Draw calls (street / overview): base 426 / 1,107; hide buildings 83 / 612. Triangles: base 21.10M / 24.38M. Antialiasing off (GPU / frame ms): street 12.2 / 20.9, overview 23.0 / 32.0.

In the overview the render call equals the GPU time plus about 1 ms (28.1 against 26.9), so the call is waiting on the GPU there and the GPU sets the frame; in the street view the GPU (15.4) is under the cap and the frame is at it. The street render-call baseline of 23.8 ms in the scale table above is a read taken inside the post-build tail.

## Not measured

- A live simulation: the sim is paused, so traffic and walkers do not move and no snapshots arrive. The 29 to 47 ms of a played city may include per-frame buffer updates from motion that this run does not have.
- Pure CPU time on the integrated card: the render call waits on the GPU queue there, and its profile is distorted by the profiler.
- True frame time above 17.4 ms below the cap (the cap hides it); GPU ms stands in for it.
- 3,000 buildings standing on the discrete card and 1,500 or 6,000 on it; the scale runs are integrated only.
- WebGL2 fallback.

## Files

`ablate-<tag>.json` and `.md` (all cases, per view, with spreads), `census-<tag>.json` (triangles by group and mesh, all views), `profile-<tag>.json` (main-thread profile), `result-<tag>.json` and `.md` (the probe's standard report for the run, including the empty-map baseline and the first city read). Tags: `integrated`, `discrete`, `noaa-integrated`, `noaa-discrete`, `scale-500`, `scale-1500`, `scale-6000`. Re-run: `node tools/probes/frame-budget.mjs http://localhost:5173 --webgpu --buildings 3000 --out tools/probes/framecost --ablate --census --profile --tag <name>`.
