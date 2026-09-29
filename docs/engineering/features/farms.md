# Farms — technical design

- **Status:** Shipped 2026-09-29
- **Date:** 2026-09-29
- **Author:** Claude, from the player-facing design in
  [../../game-design/features/farms.md](../../game-design/features/farms.md)

## What we are building, and why now

A painted Agriculture zone. Farms grow on it where the soil allows, their jobs
count as the town's basic industrial jobs, and they draw as farmsteads, fields,
orchards and paddocks. It follows directly from the small-town demand model,
which made industry the sector a town lives by. That model needs a face for
the sector other than a workshop.

## What it touches

| Module                                                                                      | Change                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/soil.ts` (new)                                                                  | The soil grade of every tile, from height, water and the map seed: one pure function both threads call                                                      |
| `src/shared/types.ts`                                                                       | `ZoneType.Agriculture` (9); `FarmKind`; `BuildingCatalogEntry.farm`; `GridState.soil` (derived); lens `'soil'`; tool id                                     |
| `src/shared/constants.ts`                                                                   | `SAND_BAND_METERS` moves here from `src/render/terrain.ts`, so the sand the ground draws and the sand that cannot be farmed are one number                  |
| `src/data/catalog.json`                                                                     | Nine farm entries: crops, orchard and pasture at levels 1–3                                                                                                 |
| `src/world/zonable.ts`                                                                      | The frontage march takes the roads that front and the cells that may be marked; `computeFarmableMask` runs it from dirt roads over farmable soil at depth 8 |
| `src/world/grid.ts`                                                                         | `setZones` gates Agriculture on the farmable mask, and builds each mask once per call rather than once per tile                                             |
| `src/sim/growth.ts`                                                                         | Agriculture reads industrial demand; farm spawn, problems and level-up                                                                                      |
| `src/sim/economy.ts`, `services.ts`                                                         | Residents count for any building that has them, not only the residential category                                                                           |
| `src/sim/worker.entry.ts`                                                                   | Derives `soil` on init, load and after terraforming                                                                                                         |
| `src/app/clientgrid.ts`                                                                     | Derives the mirror's `soil` the same way, whenever heights change                                                                                           |
| `src/render/zonegrid.ts`                                                                    | Shows the farmable tiles while the Agriculture tool is in hand; farm tint                                                                                   |
| `src/render/overlays.ts`                                                                    | The Soil lens                                                                                                                                               |
| `src/render/archetypes.ts`                                                                  | `isFarmEntry`, and a `farm` archetype with no kit parts                                                                                                     |
| `src/render/farmlot.ts` (new)                                                               | The farm plan: where the farmhouse, barn, silos, bins, field, orchard rows, paddock and drive stand                                                         |
| `src/render/farms.ts` (new)                                                                 | `FarmRenderer`: the field surfaces and the instanced farm kit, with grazing cattle                                                                          |
| `src/render/buildings.ts`                                                                   | A farm's pickable body is its barn, with a plain board-sided material                                                                                       |
| `src/render/lots.ts`, `massing.ts`, `props.ts`, `parked.ts`, `facade.ts`                    | Farms are left out of the industrial lot, massing, props, parking and facade                                                                                |
| `src/ui/categories.ts`, `InfoviewGrid.tsx`, `InfoPanel.tsx`, `AssetDrawer.tsx`, `icons.tsx` | Agriculture card, Soil lens, zone label, icons                                                                                                              |
| `src/tools/tools.ts`                                                                        | `zone.agriculture`                                                                                                                                          |

**Save format: unchanged.** Soil is derived and never saved, and the zone
byte already holds any `ZoneType`. A save made before farms loads with no
Agriculture zone, and its soil is worked out on load like everyone else's.
**Worker protocol: unchanged.** The mirror derives soil from the heights it
already receives, and `paintZone` already carries a zone.

## The design

### Soil

`soilGradeAt(src, seed, x, z)` returns a `SoilGrade`, an `as const` object:
`Unfit` 0, `Marginal` 1, `Fertile` 2, `Prime` 3. It checks these rules in
order:

1. Water, or orthogonally beside water, is `Unfit`: the wet shore.
2. A height below `SEA_LEVEL + SAND_BAND_METERS` is `Unfit`: the beach the
   terrain draws as sand.
3. The slope is the largest height step to an orthogonal neighbour, the same
   measure `isBuildable` uses:
   - over `MAX_BUILD_SLOPE` (20%) is `Unfit`: the rock the terrain draws;
   - over 12% of a tile is `Marginal`;
   - over 6% is `Fertile`;
   - anything flatter is `Prime`.
4. A stony patch is `Marginal` at best. Patches come from value noise on a
   lattice of 6 tiles, hashed from the seed and the lattice point, and cover
   about one tile in six.

`soilGrades(src, seed)` fills a whole-map `Uint8Array`. `GridState.soil` is
that array, derived like `roadMask`:

- the worker computes it in `init` and `loadSave`, and again after every
  terraform command;
- the mirror computes it from its own heights and the seed `main.ts` already
  holds.

Both run the one function, so the Soil lens, the zoning grid, `paintZone` and
growth can never disagree.

### Painting

`computeZonableMask` becomes one march with two parameters: which road tiles
front, and which cells may be marked. Every zone but Agriculture keeps today's
arguments (`isStreetTier`, any buildable cell) and depth 4.

`computeFarmableMask` runs the same march from dirt roads only
(`RoadTier.Gravel`, on the grid or off it) to depth 8 (`FARM_DEPTH`). It marks
only cells whose soil is `Marginal` or better. A stony or sandy cell stops
nothing: the march still passes over it, as a tractor would, and only a block
stops it.

`setZones` picks the mask by zone and builds it once per call.
`ZoneGridRenderer.rebuild(grid, zone)` shows the same mask for the zone in
hand.

### Growth

- `zoneSector(Agriculture)` is `'ind'`.
- **Spawn.** For an Agriculture tile the scan tries the level-1 farm lot, one
  size for all three kinds. The catalog test pins that the three share it.
  Every tile of the lot must be Agriculture-zoned, farmable and free
  (`farmLotFits`). A dirt road must lie within `ROAD_CHECK_RADIUS` of the
  lot's ring (`hasNearbyDirtRoad`), and the lot must be powered.
- **The farm kind.** The kind is `farmKindFor(lotGrade)`: `Prime` → crops,
  `Fertile` → orchard, `Marginal` → pasture. `lotGrade` is the grade at least
  half the lot's tiles reach.
- **Desirability.** 0.6, 0.8 or 1.0 by lot grade, in place of land value.
- **Water.** A building whose entry draws no water is never refused for, or
  flagged with, `NoWater`. This is general, and farms are the first grown
  entries it applies to.
- **Problems.** A farm's `NoRoad` means no dirt road within reach of its lot.
  Every other rule, abandonment included, is unchanged.
- **Level-up.** The next level is the same kind, one level up. It needs:
  - the larger lot at the same origin to fit;
  - every tile Agriculture and farmable;
  - the larger lot's grade at least the kind's own;
  - spare power for the difference;
  - industrial demand above zero;
  - and it passes a roll of `rng.next() < demand.ind`.

  Land value is not read.

### Population and jobs

Residents count for any Active building whose entry has them. Before this,
only the residential category counted. A farm's jobs are industrial because
its category is `ind`, so demand, employment, taxes and traffic need nothing
new.

### Rendering

`isFarmEntry(entry)` is `entry.zone === ZoneType.Agriculture`. Every renderer
that branches on the industrial category asks it first, and farms get no
asphalt lot, massing tiers, stacks, roof props, parking or corrugated facade.

`farmPlan(building, entry, street)` is pure, like `HouseLotPlan`. It finds the
dirt-road edge with the existing frontage search, restricted to dirt. The
farmstead goes in the strip along that edge:

- the house nearest the gate;
- the barn beside it;
- the silo and grain bins behind the barn;
- a drive from the gate to the road.

The rest of the lot is the field, the orchard or the paddock.

- **The pickable body.** `BuildingInstancer` draws the barn's walls as the
  farm's body, using the barn rectangle from the plan and a plain
  board-sided material with no window grid, so picking, outline and bulldoze
  work as they do everywhere.
- **`FarmRenderer`.** It owns:
  - a merged conforming ground mesh per farm set: furrow bands across the
    field, grazed grass in the paddock, mown rows in the orchard, and bare
    soil while a farm is under construction or abandoned;
  - one `InstancedMesh` pool each for the gambrel roof, the silo, the silo
    cap, the grain bin, the farmhouse body and roof, the fence post, the fence
    rail, the orchard tree and the cow.
- **Cattle.** Cattle drift across the paddock as a pure function of the farm id
  and the frame clock, as pedestrians do. None graze on an abandoned farm.
- **Stocking.** Stocking is drawn and not simulated: one cow per 4 paddock
  tiles, the published 2–4 acres a cow-calf pair scaled to the compressed lot.

The rules the implementation must satisfy, which become the tests and then the
spec:

1. The soil grade is a pure function of height, water and seed, and the
   worker and the mirror agree tile for tile.
2. Beach sand, the water's edge and rock are `Unfit`, and the sand and rock
   bands are the ones the terrain draws.
3. An Agriculture tile is paintable exactly when a dirt road fronts it within 8
   tiles and its soil is `Marginal` or better. A paved road fronts no farmland
   but may border it.
4. A farm grows only on a whole lot of farmable Agriculture land, with a dirt
   road within 3 of the lot and power, and it needs no water.
5. The lot's soil decides the kind, and a level-up keeps the kind and needs
   the kind's own grade.
6. Farm jobs are industrial jobs, and farm residents are population.
7. No renderer draws a farm as industry.

## What could go wrong

- **Terraforming changes soil.** A stroke that flattens a hillside makes it
  prime, so farms on it can change kind at their next level-up. Only a new
  farm or a level-up reads the grade; a standing farm never flips kind.
- **Recomputing soil on the mirror** is a 65,536-tile pass on every terrain
  change. It is cheaper than the zonable mask the same change already
  rebuilds.
- **The stony-patch share** depends on the noise. A test pins it to 10–25% of
  land tiles on a sample map, so a later change to the noise cannot silently
  empty or flood the map.
- **Big lots on slopes.** A 6×7 lot can span 20 m of rise. The farm ground is
  conforming, and the barn sits on the highest terrain under its own
  rectangle, not the lot's.
- **The industrial bar serves two zones.** A player who zones both gets
  whichever lot the scan reaches first. That is correct, but it could read as
  "my farms don't grow" when workshops took the demand. The Advisor's
  existing demand reporting covers it, and no new issue is added.

## Alternatives

- **A saved soil layer.** Rejected. It would need a save version and a second
  truth beside the terrain's own sand and rock colours, and terraforming
  would have to decide what to do with it.
- **A separate `farm` category.** Rejected. It would make every sim path that
  reads `ind` (jobs, taxes, traffic) learn a second name for the same sector.
  The render branches are fewer, and they are where farms genuinely differ.
- **Three paintable farm zones.** The player chose the soil deciding.

## How we will know it works

- **Unit tests.**
  - Soil grades on hand-built terrain for every rule, and the stony-patch
    share.
  - The farmable mask: dirt fronts, paved does not, depth 8, unfit soil
    unmarked but passable.
  - `setZones` for Agriculture.
  - Growth: kind by soil, dirt road and power required, water not required,
    level-up keeps kind and gate.
  - Occupancy counts farm residents and industrial jobs.
  - The farm plan: the gate on the dirt edge and every part inside the lot.
  - Archetype exclusions.
- **A worker test.** A few thousand ticks of a farm town on dirt roads and a
  power line with no water tower, which grows farms whose jobs are industrial.
- **Looked at in a browser.**
  - A crop farm, an orchard and a pasture farm at each level.
  - The Soil lens over a coast and a hillside.
  - The zoning grid with the Agriculture tool in hand.
  - An abandoned farm.
  - Night.

## Out of scope

Yields, harvests, seasons, supply chains, soil improvement, ploppable farm
buildings, and animal agents. See the design document's "What it is not".
