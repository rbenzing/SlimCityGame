# Building detail — technical design

- **Status:** The measurement, the performance slice, the houses, the storefronts, industry and farms and the apartment blocks and towers built 2026-10-15; the kitless ploppables next
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

| Module                           | Change                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/render/buildings.ts`        | The body instancer keeps drawing every zoned body on the facade material; it gains a hook that hands each body's placement to the part system                       |
| `src/render/facade.ts`           | Exports the window grid it draws (`windowGrid`: two columns a tile of footprint, a row a storey) so parts that frame a window land on the window the material draws |
| `src/render/houses.ts`           | The pitched roof grows eaves, a ridge, dormers and a chimney as parts; gable-vs-hip and pitch stay seeded as today                                                  |
| `src/render/buildingparts.ts`    | New: one `InstancedSlotPool` bucket per part geometry, a pure `partsFor(entry, inst, seed)` recipe per kind, placement a pure function of the lot                   |
| `src/render/utilitykits.ts`      | Slices 6–7: kits for the clinic, rail station and bus stop; the earliest kits redone                                                                                |
| `src/data/catalog.json`          | **None.** No figure changes; the catalog's `kind` already names the recipe                                                                                          |
| `src/sim/`, `src/world/`, saves  | **None.** Render-only; the save holds no geometry                                                                                                                   |
| `tools/frame-budget.mjs`         | Slice 1: the frame-time measurement at a Metropolis-scale city                                                                                                      |
| `docs/art/modeling-standards.md` | Slice 1: rewritten on the measured budget; it still says a kit part is a 12-triangle box, which the water tower left behind                                         |

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
the grid it draws as `windowGrid` — the same function the material's grid
size comes from: two columns a tile of footprint, a row a storey, so a 9.5 m
house face has three bays of 3.17 m — and shutters, lintels and sills are
placed on that grid, so the geometry and the material never disagree by a
hand's width. Parts that are windows in
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

- **The overview's draw calls are the lots.** `src/render/lots.ts` adds a
  `THREE.Mesh` per building for its paving, so the overview draws thousands
  of them where the oblique's frustum holds a few hundred; terrain and roads
  are already one mesh per 16-tile chunk (`src/render/terrain.ts`,
  `src/render/roadsmesh.ts`). The lot renderer takes the road renderer's
  shape: one merged mesh per chunk on the one lot material, a chunk rebuilt
  when a lot in it is added, changed or removed. A test asserts a scene of
  many lots in one chunk holds one lot mesh, and that removing a lot
  rebuilds only its chunk. The overview's calls fall to the order of the
  oblique's.
- **The yard.** A broadleaf is 192 triangles (three seven-by-five sphere
  blobs), a bush 56, a pool about 160, a trampoline up to 360, under every
  yard and, for the trees, across every forest. The species take the
  ceilings in
  [../../visual-render/vegetation.md](../../visual-render/vegetation.md#trees)
  (broadleaf 100, pine 40, poplar 50, shrub 30) and the yard parts the
  ceilings in
  [../../art/buildings.md](../../art/buildings.md#residential-lots) (pool
  under 60, trampoline under 110); a home on a normal lot lands under 900
  triangles and on an acre under 1,500. The geometry test gains a row per
  species and the house rows take the new ceilings. The species and pool and
  trampoline alone were not enough: the fence's panels (up to 80 on an acre,
  twelve triangles each) are cut at 5 m and drawn without their underside,
  and the grill's legs lose theirs. Built figures: a home on a normal lot is
  894 triangles at most and on an acre 1,370.
- **The solar farm.** 9,000 triangles: 34 post boxes and 10 seam boxes a
  row. A row is a frame-coloured slab, the panel and the module seam as
  quads, on one line of two-sided posts every 6 m: 84 triangles. The
  chain-link fence round the lot, which was most of the rest, takes a post
  every 10 m. The farm is 1,944, held by the geometry test under 2,000.
- `tools/frame-budget.mjs` ran again on the same seed and views, three
  interleaved runs of each build; the standard's table holds both readings
  and the lesson about single-frame percentiles (a cheaper CPU side lets
  the browser queue frames, so the tool now reports the 95th percentile of
  eight-frame averages). The shots were looked at: the lots are identical,
  and the trees, bushes, pools and trampolines read at the street.
- **Built 2026-10-15.** Draw calls fell by half to two-thirds and every
  view shed 10 M triangles; the frame fell 2–3 ms at the street and held on
  the overview, which is now triangle-bound on the measured GPU. The
  overview still draws three times the oblique's calls, not the same order;
  that, and the triangles the city still adds over the empty map, are the
  next performance work, logged in the ROADMAP rather than taken here.

### The houses

The house kit in `src/render/houses.ts` already is the part pool the plan
described: a `HousePart` union with one `InstancedSlotPool` per part (roof,
garage, carport, door, fence, pool, trampoline, grill, bush, tree), placed
from the pure `HouseLotPlan` in `src/render/houselot.ts`. The slice extends
that rather than opening `buildingparts.ts`, which waits for the blocks:

- `HousePart` gains `chimney`, `stoop`, `portico`, `porch`, `porchRoof`,
  `dormer`, `shutter`, `garageLeaf` and `parapet`; each is one low-poly
  geometry on the kit material (the roof's day/night tint), with the
  dimensions in
  [../../art/buildings.md](../../art/buildings.md#the-house-kits-parts).
- The roof prism overhangs the walls by the eave and rake figures, and its
  pitch is chosen by level: 5:12 for level 1 (the existing 0.42), 8:12 for
  levels 2 and 3, under the 4.5 m rise cap.
- `houselot.ts` grows the plan with the parts' rects: the stoop or porch at
  the door, the chimney's plan, the dormers' positions, the parapets at a
  row's boundaries. Pure, seeded, in metres, as the plan is today.
- `src/render/facade.ts` exports `windowGrid(entry, tierHeight)`, the
  function the material's own grid size comes from, so `houselot.ts` places
  shutters on the facade's windows and a test asserts a shutter pair tiles
  its bay. The pitch is a share of the half-span, fixed by level; the ridge
  runs along the frontage.
- Wall colours stay the facade's (the catalog colour desaturated with a hue
  jitter, mirrored in the shader, so the survey's wall weights are not
  applied); a `trimColor(seed, wall)` in `houses.ts` picks the one trim
  colour a house, at the survey weights, white whenever the wall is dark,
  for the shutters, fascia, garage leaf and door.
- The geometry ceilings in `geometrybudget.test.ts` go to 1,300 (normal
  lot) and 1,800 (acre); the house tier stays 3,000.
- Tests, in `houses.test.ts` and `houselot.test.ts`'s style: the three
  levels carry the three houses' parts; a ranch has no shutters and a Cape
  two dormers; a colonial's chimney stands at a gable end and clears the
  ridge by 0.6 m; a porch is 1.8 m deep and its floor 0.6 m up on three
  risers; shutters land on bays; a row has parapets at its two boundaries;
  parts follow the body through construction (hidden at the construction
  scale as the roof is), abandonment (kept) and removal (freed); every part
  inside the lot at all four street sides; determinism.
- Shots, `tools/yard-shots.mjs` extended: a street of ranches, a street of
  Capes, a street of colonials, each at the default pitch beside the 4 m
  car; a duplex, a fourplex and a townhouse row; the same at night; a close
  shot of a porch and a stoop beside a person-height reference (the 1.75 m
  car-to-roof read, since no pedestrian hook exists).
- `tools/frame-budget.mjs` before and after.

### The storefronts

The commercial kit in `src/render/buildingkit.ts` is the part pool for the
blocks: one `InstancedSlotPool` per part kind, placed by
`computePartPlacements` against the road-facing wall `findRoadFacingEdge`
finds, skipped without a frontage, drawn only while a building is Active.
This slice extends it, as the houses slice extended `houses.ts`; the
`buildingparts.ts` of the first plan is not needed, and the plan's table
above is read with that correction.

- `PART` kinds gain awning, bulkhead, cornice, stripCanopy, stripColumn,
  anchorParapet, pylon, entryTower, brickBase, cartCorral, menuBoard,
  clearanceBar, pickupCanopy, dumpsterEnclosure, fuelFascia, fuelIsland,
  dispenser, bollard, priceSign, lobbyPortal, roofScreen, coolingTower,
  porteCochere, rooftopUnit, roofHatch, and two the lit material needs apart
  from the unlit body they sit on: signPole (the pole or post under a pylon,
  price sign, menu board, clearance bar or corral sign) and towerGlazing (the
  lit glazing on the supermarket's tower); anchorParapet also stands the
  supermarket's stepped parapet. Each is one low-poly geometry at the
  dimensions in
  [../../art/buildings.md](../../art/buildings.md#the-storefront-kits-parts);
  the unit-box pools stay as they are.
- A **lit material** for the kit, `kitLightMaterial`, on the pattern of
  `stationLightMaterial` in `utilitykits.ts`: emissive white driven by the
  night factor, carrying the sign bands, the pylon and price-sign faces, the
  supermarket tower's glazing and the office lobby portal. The kit already
  draws only Active buildings, so a dark building has no lit sign, as
  [../../visual-render/lighting.md](../../visual-render/lighting.md) asks of
  windows; `lighting.md` gains the sentence that says so.
- **Rooftop units** are placed from the top tier's rect (`massing.ts`
  `computeSetbacks`), one per 232 m² of its plate, at most eight, spaced on
  the long axis, 2 m inside the parapet, plus a hatch; the office tower
  takes a screen and a cooling tower instead.
- **The drive-through lane** is paving, so it belongs to the lot layout:
  `src/shared/lotlayout.ts` gains a `driveThrough` path for a restaurant
  whose lot leaves a 3.66 m lane room along the far side of the body from
  the drive to the pickup wall, and `lots.ts` lays it in the darker drive
  colour in the chunk mesh; the kit places the board, bar, canopy and
  enclosure on that path, and places nothing where there is no path.
- The strip's **tenant bays** are the frontage cut into bays of about 8 m
  from the body width, the anchor two bays at the end away from the drive;
  the **pylon** stands at the lot's drive mouth 1.5 m inside the street
  edge, read from the lot plan's drive.
- Tests, in `archetypes.test.ts` and a new `buildingkit.test.ts`: each
  kind's part list; every part against the road-facing wall or on the roof,
  inside the lot, at all four street sides; the awning's underside at
  2.45 m and the canopy's at 2.75 m; the pylon 6.1 m tall and 1.5 m inside
  the lot line; the supermarket tower at 1.28 × the body; the unit count
  per roof area and its cap; the drive-through present on a lot with room
  and absent without; lit parts on the lit material and nothing else; parts
  freed on removal and absent while Constructing; determinism; the block
  tier.
- Shots, `tools/storefront-shots.mjs`: a Main Street of shops, a strip with
  its pylon, a supermarket from its car park, a drive-through restaurant
  from above, a filling station, an office and a hotel downtown, each at
  the default pitch beside the 4 m car; the same at night, where sign bands,
  the pylon and the lobby glow and the rest does not.
- `tools/frame-budget.mjs` before and after.

### Industry and farms

Industry extends the commercial kit as the storefronts did; the farms
extend their own kit in `src/render/farms.ts` from the plan in
`src/render/farmlot.ts`, which already draws the barn, house, silos, bins,
orchard and paddock.

- `PART` kinds gain wainscot, walkDoor, gutter, downspout, ridgeVent,
  dockShelter, dockBumper, dockLight, officeCorner, officeCanopy,
  panelReveal, parapetBand, clerestory, entryCanopy, condenser, bundWall,
  bullet, pipeRack, processColumn, furnace, stove, skipBridge, duct,
  chipPile, stacker; the existing loadingDock, rollUpDoors, monitorRoof,
  roofArray and tanks stay. Industrial parts get a per-kind table like
  `STOREFRONT_PARTS`.
- **The loading side.** `kitPlanFor` already carries the lot plan; the
  dock bank reads the plan's loading berths and stands on that side, the
  office corner on the street face. `lotlayout.ts` stripes trailer stalls
  3.66 × 16.8 m in the truck court where the berths are, in the lot mesh.
  Without berths the dock keeps the street face.
- **Lit parts:** the office corner's glazing and the factory's clerestory
  go on `kitLightMaterial`.
- **The farms:** `farms.ts` gains the loft door, cupola, sliding doors,
  silo chute, bin cone and cap, the foursquare's porch and dormer, and the
  equipment shed as pools; the silo and bin geometry gain vertex-colour
  bands; the barn's roof profile and the fence's rail height take the
  figures in [../../art/buildings.md](../../art/buildings.md#the-farmsteads-parts).
  The farmhouse's trim follows the house kit's `trimColor`.
- Tests: each industrial kind's part list; the dock bank on the loading
  side with doors at 4.3 m centres and on the street face without berths;
  trailer stalls in the lot plan; door counts by frontage; the furnace,
  stoves and column heights as multiples of the body; the chip pile only
  where the yard has room; lit parts on the lit material and nothing else;
  all four street sides; determinism; the block tier. Farms: the gambrel
  rise, the loft door in the yard gable, cupola count by ridge length, the
  porch's depth and floor, fence rail at 1.22 m, the orchard's tree count,
  and a farm tier of 40,000 that the geometry test gains rows for, with the
  measured figures reported.
- Shots, `tools/industry-shots.mjs`: a warehouse from its truck court and
  from the street, a workshop, a factory, a flex building, a food plant, a
  chemical plant, a steelworks and a paper mill, each at the default pitch
  beside a 7 m box truck; a crop farm, an orchard and a pasture with their
  farmsteads; the same at night.
- `tools/frame-budget.mjs` before and after.

### Apartment blocks and towers

The four block kinds — multiplex, garden (courtyard apartments), midrise
and tower — reach `archetypeFor` as `'apartment'` with an empty part list
today, and their level 2 and 3 bodies are stacked setback tiers. The slice
gives them the apartment kit in
[../../art/buildings.md](../../art/buildings.md#the-apartment-kits-parts)
and one body each.

- **One body, a podium for two.** `tierCountOf` in `massing.ts` returns 1
  for the four kinds as it does for a house, so `computeSetbacks` yields one
  box at the catalog height; the podium it already makes for a tower it
  makes for a midrise too, `PODIUM_STOREYS` becoming per kind: two for the
  tower, one of 4.6 m for the midrise (a named metre constant, not a
  storey count, because the 15 ft retail floor is taller than 3.2 m). The
  facade's window rows keep cutting to the body's own height.
- **Parts.** `PART` gains hipRoofBlock, brickBase, mailKiosk, stoop,
  entryHood, breezeway, landing, landingGuard, stairFlight, balconySlab,
  balconyGuard, patio, storefrontBand, brickPier, boxBay, bulkhead,
  penthouse; the existing parapetBand, lobbyPortal, rooftop units and
  hatch are reused. An `APARTMENT_PARTS` table per kind, keyed like
  `STOREFRONT_PARTS`, replaces `PARTS.apartment`'s empty list, and
  `partsFor` dispatches the four residential block kinds to it.
- **The hip roof** reuses the house kit's hip geometry at the block's
  span, pitch 5:12, rise capped at 4.5 m, ridge along the frontage; it is a
  kit part so the block's body stays the body instancer's box.
- **By the bay.** Box bays, balconies and patios go by the facade's window
  columns (`windowGrid` in `facade.ts`, two to the tile), so they line up
  with the windows the shader draws. The box bay's alternate colour is the
  instance colour: the wall colour times 0.78.
- **The glass guard** is the only part in the kit's glazing blue; it is a
  solid thin slab on the kit's own material, not a transparent one, because
  the kit draws in one material and one lit material and a third would be a
  draw call per pool for a guard nobody sees through at the default pitch.
- **Lit parts:** storefrontBand joins `LIT_PARTS`; lobbyPortal is there
  already.
- **The car park.** `lots.ts` sends the multiplex and the garden kinds down
  the commercial car-park path in `lotlayout.ts` with a code of 1.4 spaces
  per `units`, lawn on the rest of the pad; the midrise and the tower keep
  the downtown pad. The stalls, islands, curb cut and cars are the existing
  ones.
- **The tall tier:** `geometrybudget.test.ts` gains `TALL_TIER = 4000` and
  applies it to the midrise and tower rows; the two walk-ups stay in
  `BLOCK_TIER`, car park and cars included.
- Tests: each kind's part list; one tier for every block kind at every
  level and the midrise's 4.6 m podium; the breezeway on the street and
  rear faces with a landing and guard per upper floor; balconies in every
  bay clear of the breezeway and on no ground floor, patios on it; box bays
  on alternate bays and balconies on the rest; the tower's continuous
  balcony per floor on the long faces and none on the podium; the bulkhead
  and penthouse 3 m back from the street face and the penthouse at 30% of
  the plate; the stair pitch; every part inside the lot at all four
  rotations; lit parts on the lit material only; the car park's space count
  from `units`; determinism; the tiers with the measured figures reported.
- Shots, `tools/apartment-shots.mjs`: each of the four kinds at every level
  at the default pitch beside the 4 m car, a street of each kind, a close-up
  of the walk-up's breezeway and of the tower's podium, and the same at
  night.
- `tools/frame-budget.mjs` before and after; the industry record is kept
  beside it as `result-2026-10-15-industry.md`.

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
  oblique's, the house tier's low end drops, the solar farm counts under
  2,000, and the frame-budget table shows both readings.
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
