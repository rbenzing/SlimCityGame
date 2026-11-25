# Frame cost

- **Status:** Proposed

**Owns:** the frame-time target on the card the browser picks, what a frame may submit, and how a render cost is measured.

**Rules:**

- Hold 16.7 ms a frame, settled, with 5,000 buildings standing, on the integrated card, in the five probe views. Proposed.
- Submit only what the view or the shadow square can show: a layer that spans the map is split by map cell. Proposed.
- An instanced pool draws its live instances; it never draws a full count with the unused slots hidden. Proposed.
- A frame-time figure names the buildings standing, the card and that the read was settled `[R-process-012]`.
- Rank a cost by frame ms above the display's cap and by GPU ms below it `[R-process-012]`.
- A cut merges with its gain measured by the probe on both cards; a cut the player can see is the user's choice.

**Numbers:**

| Constant               | Value  | Unit      | Source                                             |
| ---------------------- | ------ | --------- | -------------------------------------------------- |
| Frame target           | 16.7   | ms        | 60 frames a second                                 |
| City the target holds  | 5,000  | buildings | the user's goal; standing, not the probe's target  |
| `SHADOW_SPAN_METERS`   | 360    | m         | `src/render/scene.ts`; a 720 m square, 2% of a map |
| `MAX_VEHICLES`         | 1,024  | slots     | `src/shared/types.ts`; drawn in full for each kind |
| Map cell (proposed)    | 320    | m         | 16 tiles; fixed by measurement in slice 1          |

**Code:** `tools/probes/frame-budget.mjs` `--ablate --census --profile` — the cost mode; `src/render/framecostprobe.ts` — dev-only switches and the mesh census; `src/render/vehicles.ts` `VehicleRenderer`, `VehicleKitPool` — the pools the first cut changes.

**Tests:** `src/render/framecostprobe.test.ts` — the census counts triangles, live instances and instances in view; a switch hides its group only.

**Open:** the build has not started; the four items under "Not known yet" are logged in [the roadmap](../ROADMAP.md).

## What a city of 5,000 costs today

Settled, sim paused, 5,023 buildings standing, 1280 by 800. Frame ms is the mean; the findings and every other table are in `tools/probes/framecost/README.md`.

| View     | Integrated frame | Frames a second | Integrated GPU | Discrete frame | Discrete GPU |
| -------- | ---------------- | --------------- | -------------- | -------------- | ------------ |
| Street   | 23.2 ms          | 43              | 19.6 ms        | 11.6 ms        | 7.1 ms       |
| Oblique  | 21.9 ms          | 46              | 20.2 ms        | 11.8 ms        | 7.3 ms       |
| Overview | 34.9 ms          | 29              | 33.2 ms        | 15.7 ms        | 10.7 ms      |
| Night    | 22.1 ms          | 45              | 20.4 ms        | 11.7 ms        | 7.1 ms       |
| Water    | 20.1 ms          | 50              | 19.2 ms        | 12.0 ms        | 7.5 ms       |

The discrete card holds the target today, with 1 ms to spare in the overview. The integrated card, the one a browser picks on a laptop, misses it in every view.

## Where it goes

The scene submits 20.3 million triangles in one pass. In the street view 1.3 million of them are on screen; in the overview, 6.6 million. The shadow pass submits about 11.7 million more for a square covering 2% of the map.

Three tests each mesh once against the view. A mesh that spans the map always passes, so every instance in it is drawn. Terrain, roads and lot grounds are already cut into chunks; the layers below are not.

| Layer                        | Instances | Triangles a pass | On screen, street | On screen, overview |
| ---------------------------- | --------- | ---------------- | ----------------- | ------------------- |
| Parked cars, 2 meshes        | 20,336    | 4.07 M           | 481 with the next | 6,071               |
| Traffic and service pools    | 9,723     | 1.92 M           | (counted above)   | 8                   |
| Trees, 4 meshes              | 42,889    | 2.78 M           | 1,366             | 7,077               |
| Building parts, 684 meshes   | 202,711   | 2.96 M           | 15,535            | 62,971              |

The traffic pools hold 1,024 slots for each kind of car and draw them all, parked off the map when unused; twelve of them are never tested against the view.

What moving one cost does to the integrated card's frame at 5,023 standing:

| Switched off                  | Street, from 23.2 ms | Overview, from 34.9 ms |
| ----------------------------- | -------------------- | ---------------------- |
| Parked cars and traffic slots | 17.5 (the cap)       | 25.3                   |
| Shadow pass                   | 20.7 (noisy)         | 21.4                   |
| Buildings                     | 17.8                 | 28.7                   |
| Lot grounds                   | 20.0                 | 27.4                   |
| Roads                         | 21.0                 | 28.8                   |
| Trees                         | 17.8                 | 32.8                   |
| Bloom                         | 21.9, inside spread  | 34.4, inside spread    |
| Antialiasing                  | 25.1, no gain        | 37.0, no gain          |

Resolution is not the cost: a canvas at half or double size reads the same GPU time. Antialiasing off lowers GPU time by 3.7 to 6.3 ms, yet the frame does not fall, because the page's own render call then holds it.

## The cuts, in order

Each slice re-runs the probe at 5,023 standing on both cards and reports its gain. The bounds below are what the switches measured, so they are ceilings.

| Slice | Cut | Ceiling on the integrated card | What the player loses |
| ----- | --- | ------------------------------ | --------------------- |
| 1 | Traffic pools draw their live cars only | part of the 5.7 ms street, 9.6 ms overview gain of "parked cars and traffic slots" | nothing |
| 1 | Parked cars and trees split by map cell, so cells outside the view and the shadow square are skipped | the rest of that gain, plus up to 5.4 ms street and 2.1 ms overview for trees | nothing |
| 1 | The shadow pass then draws its square, not the map | up to 13.5 ms in the overview | nothing |
| 2 | Building parts split by map cell, or merged into fewer draws | up to 5.4 ms street, 6.2 ms overview | nothing |
| 3 | Far detail: a simpler parked car and lot ground past a set distance | not measured; 3.3 M triangles of cars and lots stay on screen in the overview | detail too small to see at that distance, to be shown in frames first |
| 3 | Antialiasing by a post pass in place of the built-in kind | 3.7 to 6.3 ms of GPU time, none of the frame today | thin lines (wires, paint, poles) shimmer more in motion |

Slice 1 is expected to bring the four close views to the cap: hiding the cars alone already does in the street view, where 98% of them are off screen. The overview is the open case. The ceilings overlap, so they do not add; slice 1 should land it between 18 and 25 ms, and slices 2 and 3 are there to close the rest. Slice 3 is put to the user with fresh numbers, since it is the first cut that can be seen.

Splitting a layer by cell adds draws, and each draw is a buffer write on the page. The cell size is therefore set by measurement: 320 m gives 256 cells a map, 640 m gives 64. A slice that lowers GPU time but raises the frame is not merged.

## What was measured wrong before

The figure of 29 to 47 ms for "a city of 3,000 buildings" was wrong twice. The probe's `--buildings` is a target: 3,000 stood 1,396, since the placement rules refuse more than half. And the frames were read within 30 seconds of the build, while the page's render call was still settling. Settled, the 1,396-building city holds 60 frames a second on the integrated card. Standing counts by target: 500 stood 198; 1,500 stood 681; 6,000 stood 2,812; 13,700 stood 5,023.

## Not known yet

- A running simulation. The probe city has no power or water, so the sim stays paused: no car moves and no snapshot arrives. A played save must be measured before slice 1 is called done.
- Why the page's render call takes about 30 seconds to settle after a build, and whether one placed building starts it.
- The page's own time on the integrated card. Its render call waits on the GPU, so the two cannot be told apart until the GPU time falls.
- Why the probe stands 37% to 47% of what it is asked for. It should take the count to stand.

## Decided

- The target city is 5,000 buildings standing, not 3,000: the user's goal, and the size the first measurement claimed but never built.
- The target card is the integrated one, since a browser picks it; the discrete card must not get slower.
- Cuts that lose nothing come first, over turning off shadows, bloom or antialiasing: the measured waste is larger than any of the three.
- Layers are split by map cell rather than culled per instance on the page: 250,000 tests a frame would move the cost to the page, which already limits the discrete card.
