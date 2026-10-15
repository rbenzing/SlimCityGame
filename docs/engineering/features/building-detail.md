# Building detail — technical design

- **Status:** Slice 1, the measurement, built 2026-10-15; the performance slice next, then the recipes
- **Date:** 2026-10-14
- **Author:** Claude Fable 5.1

The plan for the code behind
[../../game-design/features/building-detail.md](../../game-design/features/building-detail.md),
which holds the reference library, the slice order and the player's
decisions. This document holds how a building gets its parts, what the
budget is and how it is measured, and what each slice must prove.

## What we are building, and why now

A part system for the zoned buildings, the way the civic kits already have
one, and a measured triangle budget it runs inside. Now, because the lots
beneath the buildings were drawn to code in the lots and parking epics and
the service buildings since the hospital have all been kits; the zoned
boxes are the last thing in the city still drawn as a placeholder, and the
player has asked for them.

## What it touches

| Module                           | Change                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/render/buildings.ts`        | The body instancer keeps drawing every zoned body on the facade material; it gains a hook that hands each body's placement to the part system     |
| `src/render/facade.ts`           | Exports the window grid it draws (floors, bays, `BAY_WIDTH_METERS` 2.6) so parts that frame a window land on the window the material draws        |
| `src/render/houses.ts`           | The pitched roof grows eaves, a ridge, dormers and a chimney as parts; gable-vs-hip and pitch stay seeded as today                                |
| `src/render/buildingparts.ts`    | New: one `InstancedSlotPool` bucket per part geometry, a pure `partsFor(entry, inst, seed)` recipe per kind, placement a pure function of the lot |
| `src/render/utilitykits.ts`      | Slices 6–7: kits for the clinic, rail station and bus stop; the earliest kits redone                                                              |
| `src/data/catalog.json`          | **None.** No figure changes; the catalog's `kind` already names the recipe                                                                        |
| `src/sim/`, `src/world/`, saves  | **None.** Render-only; the save holds no geometry                                                                                                 |
| `tools/frame-budget.mjs`         | Slice 1: the frame-time measurement at a Metropolis-scale city                                                                                    |
| `docs/art/modeling-standards.md` | Slice 1: rewritten on the measured budget; it still says a kit part is a 12-triangle box, which the water tower left behind                       |

**Save format and worker protocol: no change.** A building is a catalog id,
a position, a rotation, a level and a state; every part is derived from
those and the lot at draw time. A city saved before this programme draws
with every part after it.

## The design

### How the civic kits do it, which is the pattern

`UtilityKitRenderer` holds one `InstancedMesh` per part kind — a gym, a
school bus, a stack — and an `InstancedSlotPool` that gives each building a
slot in each bucket it uses. A pure layout function turns the catalog
footprint and the rotation into part rects and heights; the renderer builds
the geometry once and sets a matrix and a colour per slot. Variation is a
transform and a colour, never new topology. Picking and outline use the
plinth or body, so a part needs no id colour of its own. Every one of the
seventeen kits since the hospital works this way, and the tests for each
assert the same things: deterministic layout, every part inside the lot at
all four rotations, the stated dimensions.

### The zoned buildings join it

A zoned body stays what it is: one instance in the body instancer's bucket
for its catalog entry, drawn on the facade node material that gives it its
walls, its window grid and its night. That material is the right tool for
glazing on a tower or a supermarket and it is already consistent with
night. What the facade cannot draw — a porch, a garage door, a dock bank, a
cornice, a rooftop unit, a dormer — becomes a **part**: a bucket in a new
`buildingparts.ts` pool, with a recipe per `kind` that says which parts a
building of that kind, level, lot and seed carries, and where. The recipe
reads the lot layout
([../../art/buildings.md](../../art/buildings.md#residential-lots)) for the
door, the pad and the drive it already draws, so a porch stands at the door
the lot put there and a garage door at the head of the drive.

**Variants are parts, never bodies.** The player's choice: a house with a
porch and one without are the same body with and without a porch slot. A
kind's recipe draws from a bounded set — porch yes or no, garage left, right
or none, a chimney, zero to two dormers, shutters, a bay window — seeded
from the building id as the roof already is. Bucket count is the number of
distinct part geometries in the game, a few dozen; slot count is buildings
times parts, which the pool grows by doubling as the body buckets do.

**Parts that frame a window agree with the material.** `facade.ts` exports
the grid it draws — floors at 3.2 m, bays at `BAY_WIDTH_METERS` — and
shutters, lintels and sills are placed on that grid, so the geometry and
the material never disagree by a hand's width. Parts that are windows in
their own right (a storefront's display glass, a tower's balcony glazing)
go on the stations' emissive material and light with the rest.

**The roof stays the house's own.** `houses.ts` seeds gable-vs-hip, pitch
and colour today; it gains overhanging eaves with a fascia, a ridge cap,
dormers on the street slope and a chimney, as parts placed on the roof it
already computes.

### The budget, and how it is measured

The art bible's figure was "under a hundred triangles" per assembly and it
is not what the kits do; the water tower is about 2,500. The player chose
**tiered and measured**, and on 2026-10-15, once the measurement had
counted, chose that a tier covers **everything on the lot** — body, roof,
parts, paving, yard, trees, cars, interments — so the tiers describe what
ships:

| Tier      | Buildings                                 | Triangles, the whole lot | Held by                    |
| --------- | ----------------------------------------- | ------------------------ | -------------------------- |
| House     | detached, duplex, fourplex, townhouse row | 3,000                    | a geometry test per recipe |
| Block     | every other zoned kind                    | 1,500                    | a geometry test per recipe |
| Ploppable | every kit                                 | 30,000                   | a geometry test per kit    |
| The city  | a Metropolis: ~10,000 buildings           | the frame                | `tools/frame-budget.mjs`   |

Slice 1 built the measurement before any recipe existed. No save-sized city
existed and growth is tick-driven, so `tools/frame-budget.mjs` builds a
**synthetic Metropolis by command**: sandbox mode makes the place command
take any catalog entry, so the script lays streets over the dry ground of a
generated map and places about nine thousand zoned buildings in the
catalog's real mix, plus one of every kit, in about eighty seconds, with
the sim paused (a running sim clears a city with no power or zones). It
reads frame time with the browser's frame cap off, and draw calls and
triangles from a dev hook, `window.__slimcity.renderInfo()`, over four
fixed views by day and night, against the empty map, and writes the record
beside the shots. The figures it read, and what they say, are in
[../../art/modeling-standards.md](../../art/modeling-standards.md#what-the-measurement-read):
23–38 ms a frame on a laptop GPU before any detail, an overview at 4,118
draw calls, and yards that cost more than houses. Every later slice runs
it again; a slice that moves the frame past the standard's figure shrinks
its parts, not the budget.

`src/render/geometrybudget.test.ts` counts triangles per kit and per zoned
entry over the whole lot, so a recipe cannot grow past its tier without the
test being edited.

### The performance slice

The measurement put a slice the plan did not have between itself and the
houses, chosen by the player on 2026-10-15: the frame is already past the
stated target on a laptop GPU, so the detail is paid for by what this slice
saves, and the budget the houses build to is the improved frame.

- **The overview's draw calls.** 4,118 against 575 for the oblique of the
  same city: ground geometry is batched per chunk in several materials.
  Find which (lots, paint, kerbs, roads), merge per chunk into as few
  meshes as the materials allow, and re-read the overview.
- **The yard.** A house's trees, bushes and cars are 1,000–2,700 of its
  triangles. Read where the cost is (segments per tree, bushes per yard,
  cars) and bring it down without losing the read; a tree at 40 m needs
  fewer segments than it has.
- **The solar farm.** 9,000 triangles from drawing every module's frame;
  the frame seams become colour, as the stations' panel seams are, and the
  farm lands near a thousand.
- Re-run `tools/frame-budget.mjs`; the standard's table gains the second
  reading beside the first.

### Each slice, the same shape

1. The slice's section in the art bible, every dimension sourced or stated
   as the game's own, written first.
2. The recipe and its parts, pure layout from footprint, lot, level and
   seed.
3. Tests: deterministic; every part inside its lot at all four rotations;
   parts clear of each other and of the body's door and drive; the stated
   dimensions; the triangle tier; night material only on glazing.
4. A shots script: each kind at every level at the default pitch beside the
   4 m car, a street of the kind for the variation read, and the same at
   night; every shot looked at against the reference.
5. The frame test at the Metropolis, before and after.

## What could go wrong

**The frame.** Ten thousand bodies each carrying six parts is sixty thousand
slots across a few dozen buckets: a few dozen draw calls, inside the stated
~300, and the vertex count is what the measurement decides. If the house
tier does not hold at the Metropolis, the recipe loses its smallest parts
first (shutters, sills) and keeps its silhouette (roof, porch, garage).

**Two systems drawing one building.** The body instancer and the part pool
must agree on position, rotation, construction scale and lifecycle tint, or
a porch floats off an abandoned house. The hook hands the part system the
same matrix the body gets, and a test asserts a part follows its body
through construction, abandonment and bulldoze.

**Bodies sized by the sim.** A house body is 4.75 m per lot tile each way and
a block 13.6 m, and both figures feed homes and floor in the design docs.
Parts stand on and beside the body; nothing here moves a wall.

**The reference is single-source.** Several figures in the library are one
permit drawing or a vendor page. Each slice says which it used; a better
source replaces it in that slice's document, not silently in code.

**The old kits.** Redoing the coal plant or the sewage works changes
geometry the cemetery, crematorium and station tests do not touch, but the
kit registry test and the coexistence test do; they change by addition only.

## Alternatives

**Richer facade material, no geometry.** Trim, siding and cornices as more
node-graph detail on the same box. Rejected: a porch, a dock and a canopy
are silhouette, and no amount of surface detail makes a box read as a ranch
house. The material keeps the job it is good at, glazing and night.

**Bespoke body meshes per variant.** A ranch body, a colonial body, a
porch-ranch body. Rejected by the player: variants are parts in slots on
one body, so buckets stay few and the sim's body sizes stay untouched.

**Textures or imported models.** Rejected by the art bible, and not needed:
the water tower is boxes, lathes and a torus.

**Water-tower detail on everything, or a flat 300.** Offered and declined
for the tiered, measured budget.

## How we will know it works

- Slice 1 (built): `tools/frame-budget.mjs` runs and writes a figure for a
  Metropolis city by day and night, and `modeling-standards.md` and
  `performance-budget.md` say what it measured.
- The performance slice: the overview's draw calls fall to the order of the
  oblique's, the house tier's low end drops, the solar farm counts near a
  thousand, and the frame-budget table shows both readings.
- Every slice: the tests above, the shots looked at, the frame figure
  before and after in the PR.
- The first-town test is untouched throughout: nothing here touches growth.

## Out of scope

- Any change to the simulation, the catalog's figures, the lots or the
  save.
- The airport.
- A level-of-detail system. The budget is set so one geometry serves every
  distance; if the measurement says otherwise, LOD is its own epic.
- Street furniture, vehicles and people, which have their own kit.
