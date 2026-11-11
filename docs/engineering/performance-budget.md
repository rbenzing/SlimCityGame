# Performance budget

The CPU, GPU, memory and simulation targets the implementation is sized
against. These figures used to live in `ROADMAP.md` section 8; they move
here because a budget is a standing engineering constraint, not a roadmap
item, and because [ADR-0010](adr/0010-map-size-is-capped.md) points at them
directly when it justifies the map-size cap.

**Honesty rule for this document:** a figure is marked _measured_ only if a
test or the code's own structure enforces it; everything else is a stated
target nobody currently checks by automation.

## The four figures moved from ROADMAP §8

- **60 fps** render at a 256×256 map with 10k buildings and 1k visible
  vehicles, via `InstancedMesh` + frustum-culled chunks, at **≤ ~300 draw
  calls**. — _measured by hand, not enforced._ `tools/frame-budget.mjs`
  builds a synthetic city by command and reads frame time, draw calls and
  triangles over four fixed camera views, beside the same views of the empty
  map (see below); no test or CI step fails on it. The instancing
  architecture
  ([ADR-0006](adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md))
  is what the target rests on.
- **Sim tick ≤ 10 ms at 20 Hz** in the worker, with field diffusion
  identified as the largest cost — mitigated by staggering (not every
  field diffuses every tick). — _partially measured_: the staggering is
  real code (see below), but nothing asserts the 10 ms figure itself; no
  test times a tick.
- **Initial load ≤ 5 s** — compressed textures, lazy map assets. —
  _stated, not measured._ No test or CI step times page load.
- **Memory**: all grid layers for a 256² map are a few MB — called
  "trivial"; instance buffers are expected to dominate instead. — _stated,
  not measured._ No test asserts a memory ceiling.
- **Death care adds two InstancedMeshes, permanently**: one for the hearse (a
  sixth service-vehicle kind, one mesh per kind) and one for every cemetery's
  headstones together (a slot per interment, at most 780 a cemetery, resized
  only when a count changes). The cemetery kit's other parts (lawn and drive,
  gatehouse, fence, trees) are one mesh each, instanced per cemetery, like the
  hospital's. _Counted, not timed._

## What the code actually verifies

| Figure                                              | Constant                                                                                  | File                                                                                                                                           | Measured how                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sim tick rate                                       | `TICK_RATE = 20` (ticks/real-second at 1× speed)                                          | [`src/shared/constants.ts:34`](../../src/shared/constants.ts)                                                                                  | Structural: `FixedTimestep` (`src/core/loop.ts`) drives the worker at this rate. `TICK_MS = 1000 / TICK_RATE` derives the per-tick budget (50 ms) the 10 ms target above is a fraction of. Not itself timed by a test.                                                                                        |
| Snapshot rate                                       | `SNAPSHOT_HZ = 10`                                                                        | [`src/shared/constants.ts:56`](../../src/shared/constants.ts)                                                                                  | Structural: a snapshot falls due every `SNAPSHOT_TICKS` ticks (`TICK_RATE / SNAPSHOT_HZ` = 2) and `pump` posts at most one after its ticks, so every other tick at 1× speed and one a pump at 4×. Not timed by a test; the cadence itself is exercised by snapshot-diff tests in `src/sim/*.test.ts`.                                                                         |
| Field diffusion staggering                          | `DIFFUSING_FIELDS` schedule (`period`/`offset` per field)                                 | [`src/sim/fields.ts:75`](../../src/sim/fields.ts)                                                                                              | Real code: `tick()` skips a field whose `tickNo % period !== offset`, so not every scalar field diffuses on every tick — this is the concrete mechanism behind the "fields diffusion is the big cost" note in the original budget. Covered by field tests, not by a timing assertion.                         |
| Trip budget per tick                                | `TRIPS_PER_TICK = 4` (flat fallback), `BASE_TRIPS_PER_TICK = 5` (population-scaled floor) | [`src/sim/traffic.ts:49,64`](../../src/sim/traffic.ts)                                                                                         | Real code: `tripsForTick(population, tickNo)` computes a per-tick ceiling so trip (re)assignment cost stays bounded regardless of city size. Covered by `src/sim/traffic.test.ts`'s behavior tests, not a timing test.                                                                                        |
| Vehicle instance cap                                | `MAX_VEHICLES = 1024`                                                                     | [`src/shared/types.ts:542`](../../src/shared/types.ts), consumed in [`src/render/servicevehicles.ts:216`](../../src/render/servicevehicles.ts) | Structural: the service-vehicle `InstancedMesh` is allocated at this fixed capacity up front — a hard ceiling, not a soft target. No test asserts the numeric value is "enough"; it bounds worst-case draw cost by construction.                                                                              |
| Terrain chunking                                    | `CHUNK_TILES = 16` (chunk edge, in tiles), `CHUNKS_PER_SIDE = MAP_SIZE / CHUNK_TILES`     | [`src/shared/constants.ts:139-140`](../../src/shared/constants.ts)                                                                             | Structural: this is the unit the frustum-culled chunking in the 60 fps target is built from. Not itself timed.                                                                                                                                                                                                |
| Map size (what every quadratic cost scales against) | `MAP_SIZE = 256`                                                                          | [`src/shared/constants.ts:7`](../../src/shared/constants.ts)                                                                                   | Structural cap — see [constraints.md](constraints.md) and [ADR-0010](adr/0010-map-size-is-capped.md). Every figure above is sized to this ceiling; there is no test enforcing that a run stays at 256² (nothing prevents constructing a differently-sized `GridState` outside the tools that use `MAP_SIZE`). |
| Instance buffer growth                              | `INITIAL_CAPACITY` + capacity-doubling in `BuildingInstancer`                             | [`src/render/buildings.ts:507,748`](../../src/render/buildings.ts)                                                                             | Real code: instance buckets grow by doubling rather than a fixed worst-case allocation, trading a predictable memory ceiling for amortized-cheap growth. Covered by `src/render/buildings.test.ts` behaviorally, not by a memory-footprint assertion.                                                         |

## The main thread while a city grows

The rule is `[R-render-037]`: a snapshot's cost follows what it changed.

A snapshot falls due every `SNAPSHOT_TICKS` sim ticks, and the worker posts
at most one a pump, after the pump's ticks have run. Deltas gather in the
worker until a post drains them, so a pump of several ticks loses nothing:

| Speed | Ticks a second | Snapshots a second |
| ----- | -------------- | ------------------ |
| 1×    | 6.7            | 3.3                |
| 2×    | 26.7           | 13.3               |
| 4×    | 106.7          | 20                 |

Source: `TICK_RATE`, `SPEED_MULTIPLIERS` and `SNAPSHOT_HZ` in
`src/shared/constants.ts`; `pump` in `src/sim/worker.entry.ts`. Before the
one-a-pump rule 4× posted 53 a second, and any work a snapshot did over the
whole city was done 53 times a second.

**Target:** while `tools/services-shots.mjs` grows its city of a hundred
zoned blocks at 4×, no read-back from the page takes longer than 1 s. —
_measured by that tool, which fails over `STALL_LIMIT_MS`, on any page error
and on a read-back that never returns; no CI step runs it._

| Measured on that city at 4×     | Before                                  | Now         |
| ------------------------------- | --------------------------------------- | ----------- |
| Longest read-back               | 57 s, then the page never came back     | 1.1 s       |
| Page errors                     | 12,000 "Array buffer allocation failed" | 0           |
| JS heap                         | 2.1 GB                                  | 0.6 GB      |
| Snapshots taken while growing   | 50 a second                             | 20 a second |
| Shader programs linked in a run | 280                                     | 64          |

The target is missed by a tenth of a second: the longest read-back is 1.1 s
and none passes 2 s. The 64 links left are first compiles.

Where the main thread went before the first fix, from a CPU profile of that
city growing to 4,800 people (408 s sampled):

| Work                                                                | Share | Why it was whole-city                                       |
| ------------------------------------------------------------------- | ----- | ----------------------------------------------------------- |
| Shader pipelines compiled in the render loop                        | 28%   | an instanced pool doubling: a new program each time         |
| Every house's ground re-planned (`planHouseGround`)                 | 19%   | the driveway loop and every walker's door, on every snapshot |
| Road chunks rebuilt after a junction-control change (`rebuildChunk`) | 15%   | every chunk along the junction's straight arms              |
| Every pedestrian's path and both meshes rebuilt                     | 14%   | on every snapshot                                           |
| Lot chunks re-laid (`LotRenderer.apply`)                            | 7%    | each touched chunk rebuilt whole                            |

What each cost was met with:

- **Kept per building:** the tiles a lot's drive crosses (`DrivewayTiles` in
  `src/render/drivewaytiles.ts`) and a walker's path
  (`PedestrianRenderer.apply`). A delta lays only what it names; a changed
  road, section or moved junction control lays all again.
- **Pools start large:** no instanced pool is allocated for fewer than
  `MIN_INSTANCE_CAPACITY` = 2,048 instances (`src/render/groundquad.ts`).
  Below about a thousand, three compiles the capacity into the shader as a
  uniform array, so every doubling linked a new program in the render loop.
- **Meshes kept alive:** pedestrians, median trees, lamps and road furniture
  keep their meshes and set a live count. A replaced mesh is disposed; the
  ones that were only taken off the scene were the leak.
- **Road lookups:** `groundAt` in `src/render/roadsmesh.ts` is one index into
  a flat array, where it was two map lookups forty times a tile.
- **Lots:** a lot's normals are laid once with the lot, not with every flush
  of its chunk.
## What is not measured anywhere

No test or CI step in this repository:

- times a sim tick and fails if it exceeds a threshold,
- fails on the draw calls submitted to the renderer or on frame time,
- measures or bounds initial page-load time,
- measures process or GPU memory.

`tools/frame-budget.mjs` is the one thing that reads frame time. Run by hand
against a dev server, it lays a grid of streets over the dry ground of a
generated map, places zoned buildings at their catalog footprints in the
catalog's real mix and one of every kit, and reads frame time (mean, median
and 95th percentile of `requestAnimationFrame` deltas with the browser's frame
cap off), draw calls and triangles over a street-level view, the default
oblique, a high overview and the oblique at night, then writes `result.json`
and `result.md` beside one picture per view. The empty map is read first from
the same views, so the buildings' cost is a difference. The renderer's counters
come from the dev hook `window.__slimcity.renderInfo()`. The sim stays paused
throughout: a running sim clears a city that has no power, water or zones. A
frame time on an empty map is a CPU-submission rate and reads far under what the
GPU takes, so only the city's figures are a frame time.
`src/render/geometrybudget.test.ts` is the other half: it counts triangles per
kit and per zoned building, over everything on the lot, and holds each to its
tier in [../art/modeling-standards.md](../art/modeling-standards.md#geometry-budget),
where the first run's figures are read.

`npm test` (Vitest, `node` environment — see
[standards/testing.md](standards/testing.md)) has no access to a real GPU
or a browser frame loop, so none of the render-side figures above could be
asserted there even if someone wrote the assertion. The closest thing to a
performance regression check is a human looking at
`tools/*-shots.mjs` output in a real browser (see
[standards/debugging.md](standards/debugging.md)) and judging it by eye —
which catches visibly broken frames, not a slow but still-passing one.

## See also

- [constraints.md](constraints.md) — the map-size cap and the other hard
  limits this budget is built around.
- [ADR-0010](adr/0010-map-size-is-capped.md) — why 256² and not larger.
- [ADR-0006](adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md)
  — the rendering strategy the draw-call budget assumes.
- [ADR-0001](adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
  — why traffic is statistical assignment, the decision that keeps sim cost
  bounded by road-edge count rather than population.
