# Constraints

The limits the implementation must respect. This is a different kind of
document from its two neighbors: an [ADR](adr/README.md) records a decision
and what it cost, weighing alternatives; [DESIGN.md](../DESIGN.md) records
what the project chose not to build. This document records the limits that
follow from those decisions — what breaks, concretely, if the limit is
crossed, and what (if anything) currently stops that from happening.

## Browser-only, no backend

**What it is:** SlimCity is a static single-page app. There is no server
component, no API, no account system. State lives in the tab (in-memory)
and in the browser's IndexedDB (saves) and `localStorage`/`sessionStorage`
(settings, session intent).

**What enforces it:** Nothing programmatic stops someone from adding a
`fetch()` call to a real backend — this is an absence, not a rule a linter
checks. The evidence it holds today: the only `fetch()` in `src/` is in
`src/app/music.ts` (loading a static song asset, not calling an API), and
both `netlify.toml` and the GitHub Pages release workflow
(`.github/workflows/release.yml`) deploy a static build with no server
process behind it.

**What breaks if violated:** the whole "runs entirely in one browser tab"
value proposition, and the assumption every other constraint below leans
on — that all state the player can affect lives in this tab's memory plus
its own IndexedDB, nowhere else.

## No per-agent simulation

**What it is:** population, jobs, and demand are aggregate scalar values,
not discrete simulated citizens or vehicles. Trips are computed as
statistical assignment over the road graph (A* with congestion-aware edge
costs); visible vehicles are cosmetic instances following those computed
routes, not independently simulated agents.

**What enforces it:** convention, upheld by the shape of `src/sim/traffic.ts`
(`tripsForTick`, edge-volume accumulation) having no per-citizen or
per-vehicle state to begin with — there is no data structure a "give this
one citizen a schedule" feature could hang off without adding one. Nothing
stops a future change from adding per-agent state; it would just have
nowhere natural to live.

**What breaks if violated:** the performance budget in
[performance-budget.md](performance-budget.md). [ADR-0001](adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
states the stakes plainly — full agent simulation at city scale is called
"the #1 way this project dies" in the sources it cites, because sim cost
would scale with population/vehicle count instead of road-edge count.

## Determinism: no `Math.random`/`Date.now` in sim or render

**What it is:** every random-seeming value in the simulation or the render
path comes from a seeded PRNG (`src/core/rng.ts`'s `createRng`, or a local
deterministic hash such as the mulberry32/triple32 variants scattered
through `src/render/*.ts`), and every time-seeming value comes from the
sim's own tick counter or an elapsed-ms value the caller owns — never the
wall clock.

**What enforces it:** convention only, checked by grep, not by a lint rule.
Verified today: `grep -rn "Math.random\|Date.now" src/sim src/render`
(excluding tests) finds **zero real calls** — every hit is a comment
documenting the rule (e.g. `src/sim/dispatch.ts:16`,
`src/render/clouds.ts:27`). `eslint.config.js` has no rule that would catch
a real violation if one were added.

**The one legitimate exception:** `src/app/music.ts:174` uses
`options.rng ?? Math.random` to shuffle the playlist. This is deliberate
and correctly placed — `src/app/` is app/session glue, outside both the
worker and the render frame loop, so shuffling a playlist has no effect on
sim state or a rendered frame. See
[standards/architecture-rules.md](standards/architecture-rules.md).

**What breaks if violated:** save/replay determinism
([ADR-0002](adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md))
— the property that a seed plus a command log always reproduces the same
city. A `Math.random()` call inside the worker or a renderer would make
that reproduction unreliable the moment it executed.

## At most two roads per tile, one deck height each

**What it is:** a tile carries the road on it, with one deck height — metres
above that tile's terrain — and, only where one road crosses over another, the
road passing over it, with a deck height of its own. Never more.

**What enforces it:** the data layout. The road on a tile has one set of
layers (`roadTier`, `roadProfile`, `roadFlow`, `roadElevation`) and the road
passing over it one more (`overTier`, `overProfile`, `overFlow`,
`overElevation`), each one field per tile, not a list
([`src/shared/types.ts`](../../src/shared/types.ts)). A third deck over one
tile, or a tunnel beneath one, has nowhere to be stored. The second road was
added as new layers appended to the save, never by reshaping the first, which
is the only way
[ADR-0007](adr/0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md)
lets the format grow.

**What breaks if violated:** [DESIGN.md](../DESIGN.md) lists tunnels and a
third deck level as deferred for exactly this reason, and
[ADR-0015](adr/0015-a-crossing-tile-may-carry-a-second-road-passing-over.md)
records why the second road exists only on a crossing tile.

## Map size is capped at 256² tiles (512² at most, later)

**What it is:** `MAP_SIZE = 256`
([`src/shared/constants.ts:7`](../../src/shared/constants.ts)) sizes the grid,
the field-diffusion cost, and the instance counts every other budget in
[performance-budget.md](performance-budget.md) is tuned against.

**What enforces it:** the constant itself, plus every allocation that reads
`MAP_SIZE`/`MAP_TILES` rather than an independent size. Nothing stops a
future change from constructing a `GridState` at a different size outside
the normal map-generation path — there is no runtime assertion that rejects
an oversized grid.

**What breaks if violated:** field diffusion and instance counts scale
quadratically with map side length
([ADR-0010](adr/0010-map-size-is-capped.md)) — the 60 fps / 10k-building
target in [performance-budget.md](performance-budget.md) is sized to 256²
specifically and was never tested at a larger size.

## Save-format additivity

**What it is:** a save file is a header (version + map size) followed by
every grid layer in a fixed, declared order. A feature needing new
per-tile state appends its layer last and bumps the version; a layer, once
added, is never reordered or removed. Loading an old save defaults every
layer newer than that save's version rather than refusing to load.

**What enforces it:** convention plus the shape of the loader in
`src/world/grid.ts` — every version branch in the decode path is additive
by construction, but nothing stops a future edit from reordering a layer or
repurposing one's meaning; there is no schema-diff check, only the version
integer itself.

**What breaks if violated:** every save from before the offending change —
[ADR-0007](adr/0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md)
calls this out explicitly as the model's one real weakness: a layer that
needs to change what it means, rather than add a new one, has no built-in
escape hatch.

## Roads are grid-aligned; no free-form curves

**What it is:** roads are drawn and stored on the tile grid — straight,
corner, T, cross, end-cap pieces selected by a neighbour bitmask. No
diagonal or curved geometry off the grid.

**What enforces it:** the whole road-authoring and meshing pipeline is
built around a fixed neighbour bitmask
([`src/render/roadsmesh.ts`](../../src/render/roadsmesh.ts) and
`src/world/roads.ts`) with no coordinate model for anything off-grid.
Retrofitting curves would mean rebuilding that pipeline, not extending it.

**What breaks if violated:** see
[ADR-0005](adr/0005-roads-are-grid-aligned-no-freeform-curves.md) for the
full cost/benefit; the short version is that intersection meshing stays a
small enumerable set of cases only because every road shares one grid with
zoning and terrain.

## See also

- [DESIGN.md](../DESIGN.md) — the fuller list of what is deliberately not
  built, several of which exist because of the constraints above.
- [performance-budget.md](performance-budget.md) — the budgets the map-size
  and determinism constraints are sized to protect.
- [adr/README.md](adr/README.md) — the decisions behind each constraint,
  and what alternatives were rejected.
