# Modeling standards

Geometry budgets, topology, and scale for procedural assets — the
constraints an `archetypes.ts`/`buildingkit.ts`/`houses.ts`-style function
has to respect. See [asset-guidelines.md](asset-guidelines.md) for how
that code is structured; this page is what it has to stay within.

## Scale

[README.md](README.md) — the scale bible — is the authority on
proportion: the 4.0 m × 1.8 m cosmetic car as the human-scale anchor,
`TILE_METERS = 20`, and the road cross-section table. Nothing here
restates those numbers; two derived rules worth stating explicitly because
they govern every building kit:

- **Floor count is height ÷ 3.2 m.** A catalog entry's `height` is not a
  free-floating number — a taller entry is meant to read as more storeys,
  not one box stretched taller with the same window band. See
  [buildings.md](buildings.md) for the facade shader that draws this grid.
- **Footprints are in tiles; kit-part dimensions are in real metres.** A
  catalog entry's `footprint: { w, d }` is tile counts and scales with
  `TILE_METERS`; everything `buildingkit.ts`/`houses.ts` place on top of
  that footprint (a dock's depth, a garage's width, a canopy's thickness)
  is a named metre constant that does **not** rescale with the tile — see
  the scale bible's own reasoning for why lane and vehicle sizes are the
  same real-world rule.

## Geometry budget

A building's budget is a **tier**, in triangles over **everything it stands
with** — body, roof, parts, its paving and paint, its yard, its trees, its
parked cars, its interments — held by a test; the city's budget is the
**frame**, held by a measurement. The player chose both on 2026-10-15: the
tier counts the whole lot, because that is what the player sees and the
frame pays for, and the tiers are set where the measurement found the
buildings that ship.

| Tier      | Buildings                                 | Triangles, the whole lot | Held by                                 |
| --------- | ----------------------------------------- | ------------------------ | --------------------------------------- |
| House     | detached, duplex, fourplex, townhouse row | 3,000                    | `src/render/geometrybudget.test.ts`     |
| Block     | every other zoned kind but a farm         | 1,500                    | `src/render/geometrybudget.test.ts`     |
| Farm      | a crop, orchard or pasture farm           | 40,000                   | `src/render/geometrybudget.test.ts`     |
| Ploppable | every kit                                 | 30,000                   | `src/render/geometrybudget.test.ts`     |
| The city  | a Metropolis, about 10,000 buildings      | the frame                | `tools/frame-budget.mjs`, run per slice |

A recipe that grows past its tier fails the test; a slice that moves the
frame past the figure below shrinks its parts, never the budget. The old
rule here, that a kit part is one 12-triangle box and an assembly stays
under a hundred, was true of the archetype parts and not of the kits: the
water tower is a lathe, a torus and braced legs, and it is the standard
the rest are drawn to.

A tier is a ceiling per building, and what the frame pays is the tier
**times the count**: a Metropolis holds six thousand houses and one
hospital, so a hundred triangles on a house costs the frame what a hundred
thousand on the hospital does. A kind that a city builds by the hundred —
a house, a solar farm — is drawn to the low end of its tier.

### What the measurement read

Measured 2026-10-15 by `tools/frame-budget.mjs` on an Intel Arc Pro 140T
(a laptop-class GPU) at 1280 × 800, headless, the browser's frame cap off:
a synthetic Metropolis of 8,759 buildings in the catalog's real mix and one
of every kit, placed by command on seed 7, the sim paused. The record is
`tools/shots-framebudget/result.md`.

| View           | Frame, mean | Draw calls | Triangles | The buildings' share  |
| -------------- | ----------- | ---------- | --------- | --------------------- |
| Street         | 23.4 ms     | 809        | 38.0 M    | +743 calls, +24.2 M   |
| Oblique        | 25.0 ms     | 575        | 40.7 M    | +497 calls, +26.9 M   |
| Overview       | 38.5 ms     | 4,118      | 44.4 M    | +3,956 calls, +30.5 M |
| Oblique, night | 26.1 ms     | 583        | 40.7 M    | +505 calls, +26.9 M   |

The second reading, the same seed, views and flags after the performance
slice (lots one mesh per chunk, the species and yard parts at their
ceilings, the solar row and fence thinned; the record is
`tools/shots-framebudget/result.md`, the first kept beside it as
`result-2026-10-15-before.md`):

| View           | Frame, mean, before → after | Draw calls, before → after | Triangles, before → after |
| -------------- | --------------------------- | -------------------------- | ------------------------- |
| Street         | 27 → 24 ms                  | 809 → 282                  | 38.0 → 27.2 M             |
| Oblique        | 29 → 28 ms                  | 575 → 389                  | 40.7 → 30.3 M             |
| Overview       | 45 → 44 ms                  | 4,118 → 1,125              | 44.4 → 34.4 M             |
| Oblique, night | 29 → 28 ms                  | 583 → 397                  | 40.7 → 30.3 M             |

The before and after are the means of three interleaved runs of each build
on one machine in one session (`result-runs.md` holds all of them). The
draw calls fall by half to two-thirds and every view sheds 10 M triangles;
the frame falls 2–3 ms at the street and holds on the overview, which is now
bound by triangles on this GPU, at roughly 1.2–1.4 G a second. The empty
map's 13.8 M triangles fell to 8.4 M, which is the trees. The next gain is
triangles, not calls, and the overview still draws three times the
oblique's calls.

**Reading a single frame's percentiles.** A build that submits fewer calls
lets the browser queue frames ahead of the GPU, and the animation loop's
deltas then alternate fast and slow: the single-frame median falls to
13–26 ms and the 95th percentile rises to 67–98 ms while the mean stays the
real cost. The tool therefore reports the 95th percentile of eight-frame
averages beside the single-frame figures, and that is the percentile to
read; the lot renderer's chunk flush was checked and does nothing when
nothing changed, held by a test.

The empty map drew 13.8 M triangles of terrain, water and scattered trees
at 66–162 calls; its frame time is a CPU submission rate and is not
comparable, so the buildings' share is read from calls and triangles. What
the first reading said:

- The frame is **23–38 ms, 26–43 fps**, before the building-detail
  programme adds a triangle; the stated 60 fps and ~300 draw calls in
  [../engineering/performance-budget.md](../engineering/performance-budget.md)
  are not met on this GPU today. The programme's performance slice comes
  before its houses for that reason.
- The **overview draws 4,118 calls, seven times the oblique** of the same
  buildings: ground geometry is drawn per chunk in several materials, so
  every visible chunk costs a dozen calls.
- **A house's yard costs more than the house.** The body is 12 triangles;
  with its roof, trees, bushes and parked cars a house is 1,170 on a half
  lot and 2,758 on an acre, and six thousand of them are most of the
  city's triangles. Every zoned block is under 400. The kits run from 64
  (the drain) to 27,616 (a full cemetery, 780 headstones) and 24,920 (the
  hospital, its deck full of cars); the solar farm is 9,000 for drawing
  every module's frame, which at three hundred farms is a frame of its own.

The commonly cited per-mesh vertex cap is never the binding constraint
here: every building instance shares one `InstancedMesh` bucket per part
regardless of how many exist (see
[asset-guidelines.md](asset-guidelines.md)), so the cost of a part is its
triangles times its instances, in a handful of draw calls. The **ground**
is the other cost, and it is batched **one mesh per 16-tile chunk** per
renderer — terrain, roads, and from the performance slice the lots too.
Nothing on the ground is a mesh per building: the overview's 4,118 calls
were the lots, one mesh each, and the fix is the chunk the roads already
use. A chunk is rebuilt when a lot in it changes, as a road chunk is.

## Topology

- **Boxes first, lathes where the thing is round.** A procedural part — a
  body mass, a dock platform, a monitor roof, a garage — is an axis-aligned
  box or a small merge of a few, placed and rotated with the building's
  own footprint frame. A part that is round in the world (a tank, a silo, a
  stack, a cooling-tower cell) is a lathe or a cylinder at the segment
  count the tier allows. Nothing sculpts freeform geometry.
- **Merged multi-part geometry where a single shape needs internal colour
  variation.** The vehicle kit (`src/render/vehicles.ts`, covered in
  [props-and-vehicles.md](props-and-vehicles.md)) merges a body slab, a
  darker cabin/window mass, and wheel cylinders into one `BufferGeometry`
  per kind, carrying a region-mask vertex attribute so the per-instance
  tint colours only the body vertices while windows and wheels keep their
  own fixed colours. This is the pattern to follow whenever one instanced
  shape needs more than one material region without spending a second
  draw call on it.
- **Per-instance variation is a transform and a colour, never new
  topology.** A roof's pitch, a wall's hue jitter, a building's
  construction-height scale — all move or recolour the same fixed
  geometry (`setMatrixAt`/`setColorAt` on the shared `InstancedMesh`), so
  variety never costs an extra vertex.

## What this document does not cover

Archetype-specific proportions (how tall a monitor roof sits, how a
warehouse's dock is sized against its frontage) belong to
[buildings.md](buildings.md), [streets.md](streets.md), and
[props-and-vehicles.md](props-and-vehicles.md), not here — this page is
the budget and the topology rule those files' specifics have to satisfy,
kept apart so it does not repeat with every new archetype.
