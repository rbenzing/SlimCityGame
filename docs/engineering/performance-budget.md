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
  calls**. — _stated, not measured._ No test counts draw calls or measures
  frame time; this is a target the instancing architecture
  ([ADR-0006](adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md))
  is built to hit.
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

## What the code actually verifies

| Figure                                              | Constant                                                                                  | File                                                                                                                                           | Measured how                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sim tick rate                                       | `TICK_RATE = 20` (ticks/real-second at 1× speed)                                          | [`src/shared/constants.ts:34`](../../src/shared/constants.ts)                                                                                  | Structural: `FixedTimestep` (`src/core/loop.ts`) drives the worker at this rate. `TICK_MS = 1000 / TICK_RATE` derives the per-tick budget (50 ms) the 10 ms target above is a fraction of. Not itself timed by a test.                                                                                        |
| Snapshot rate                                       | `SNAPSHOT_HZ = 10`                                                                        | [`src/shared/constants.ts:56`](../../src/shared/constants.ts)                                                                                  | Structural: `postSnapshot()` fires every `SNAPSHOT_TICKS` ticks (`TICK_RATE / SNAPSHOT_HZ` = 2), so every other tick at 1× speed. Not timed by a test; the cadence itself is exercised by snapshot-diff tests in `src/sim/*.test.ts`.                                                                         |
| Field diffusion staggering                          | `DIFFUSING_FIELDS` schedule (`period`/`offset` per field)                                 | [`src/sim/fields.ts:75`](../../src/sim/fields.ts)                                                                                              | Real code: `tick()` skips a field whose `tickNo % period !== offset`, so not every scalar field diffuses on every tick — this is the concrete mechanism behind the "fields diffusion is the big cost" note in the original budget. Covered by field tests, not by a timing assertion.                         |
| Trip budget per tick                                | `TRIPS_PER_TICK = 4` (flat fallback), `BASE_TRIPS_PER_TICK = 5` (population-scaled floor) | [`src/sim/traffic.ts:49,64`](../../src/sim/traffic.ts)                                                                                         | Real code: `tripsForTick(population, tickNo)` computes a per-tick ceiling so trip (re)assignment cost stays bounded regardless of city size. Covered by `src/sim/traffic.test.ts`'s behavior tests, not a timing test.                                                                                        |
| Vehicle instance cap                                | `MAX_VEHICLES = 1024`                                                                     | [`src/shared/types.ts:542`](../../src/shared/types.ts), consumed in [`src/render/servicevehicles.ts:216`](../../src/render/servicevehicles.ts) | Structural: the service-vehicle `InstancedMesh` is allocated at this fixed capacity up front — a hard ceiling, not a soft target. No test asserts the numeric value is "enough"; it bounds worst-case draw cost by construction.                                                                              |
| Terrain chunking                                    | `CHUNK_TILES = 16` (chunk edge, in tiles), `CHUNKS_PER_SIDE = MAP_SIZE / CHUNK_TILES`     | [`src/shared/constants.ts:139-140`](../../src/shared/constants.ts)                                                                             | Structural: this is the unit the frustum-culled chunking in the 60 fps target is built from. Not itself timed.                                                                                                                                                                                                |
| Map size (what every quadratic cost scales against) | `MAP_SIZE = 256`                                                                          | [`src/shared/constants.ts:7`](../../src/shared/constants.ts)                                                                                   | Structural cap — see [constraints.md](constraints.md) and [ADR-0010](adr/0010-map-size-is-capped.md). Every figure above is sized to this ceiling; there is no test enforcing that a run stays at 256² (nothing prevents constructing a differently-sized `GridState` outside the tools that use `MAP_SIZE`). |
| Instance buffer growth                              | `INITIAL_CAPACITY` + capacity-doubling in `BuildingInstancer`                             | [`src/render/buildings.ts:507,748`](../../src/render/buildings.ts)                                                                             | Real code: instance buckets grow by doubling rather than a fixed worst-case allocation, trading a predictable memory ceiling for amortized-cheap growth. Covered by `src/render/buildings.test.ts` behaviorally, not by a memory-footprint assertion.                                                         |

## What is not measured anywhere

No test or CI step in this repository:

- times a sim tick and fails if it exceeds a threshold,
- counts draw calls submitted to the renderer,
- measures or bounds initial page-load time,
- measures process or GPU memory,
- runs a sustained-frame-rate benchmark.

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
