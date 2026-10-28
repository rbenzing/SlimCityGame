# Farms

- **Status:** Built

**Owns:** the Agriculture zone: soil grades, where farmland can be painted, how farms grow and level, their jobs, power and water, and how they are drawn. Not a harvest, a supply chain or a soil you improve.

**Rules:**

- Grade soil by one pure function of height, water and seed, for worker and mirror alike; never save it. `[R-world-035]`
- Treat beach sand, the water's edge, rock and stony ground better than pasture as never cropland; the sand and rock are the bands the terrain draws. `[R-world-035]`
- Paint farmland only where a dirt road's frontage reaches within `FARM_DEPTH` and the soil is somewhat fertile or better; a paved road fronts none. `[R-world-046]`
- Grow a farm on a whole farmable lot with a dirt road within 3 tiles and power; it needs no water or drain. `[R-world-046]`
- Let the lot's soil decide the kind; a level-up keeps the kind and needs the kind's own grade. `[R-world-046]`
- Level up on industrial demand above zero and never on land value; count farm jobs as industrial and farm residents as population. `[R-world-045]`
- Ask `isFarmEntry` first in every renderer that dresses industry; a farm is never drawn as industry. `[R-render-016]`

**Numbers:**

| Constant                | Value                                                                    | Unit        | Source                                                                         |
| ----------------------- | ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------ |
| Very fertile (`Prime`)  | slope under 6; row crops                                                 | %           | [USDA classes](../sources/farms.md#soil-grades-and-the-usda-classes)           |
| Fertile                 | slope 6–12; orchards                                                     | %           | same                                                                           |
| Somewhat fertile (`Marginal`) | slope 12–20, or stony ground; pasture                              | %           | same                                                                           |
| Unfit (`Unfit`)         | sand under `SAND_BAND_METERS`, water's edge, slope over `MAX_BUILD_SLOPE` (20) | m, %  | same; 20% is 4 m over a 20 m tile, the steepest ground built on               |
| Stony patches           | lattice of 6 tiles; about one tile in six; pinned at 10–25 of land tiles | tiles, %    | dial                                                                           |
| Generated map           | about two-thirds very fertile, a sixth somewhat fertile, a tenth fertile, rest unfit | % | dial                                                                      |
| `FARM_DEPTH`            | 8, painting depth from a dirt road                                       | tiles       | dial                                                                           |
| Dirt road reach         | 3 from the lot                                                           | tiles       | `ROAD_CHECK_RADIUS`, the reach every lot has to a street                       |
| Farm lot                | level 1 4×5; level 2 5×6; level 3 6×7                                    | tiles       | the compression in [the sources](../sources/farms.md#scale-why-a-lot-stands-for-a-farm) |
| Tile and map            | tile 0.0988 acres; map about 6,500; median farm 72 acres ≈ 730 tiles; farmstead about 2.9 acres ≈ 30 tiles | acres | [AFBF, ERS](../sources/farms.md#scale-why-a-lot-stands-for-a-farm) |
| Desirability            | 0.6, 0.8, 1.0 by lot grade (marginal, fertile, prime)                    | —           | dial                                                                           |
| Jobs                    | crops 1, 2, 2; orchard 1, 2, 4; pasture 1, 2, 5 by level                 | jobs        | labour hours ÷ 2,000, [derivation](../sources/farms.md#jobs)                   |
| Labour hours            | crops 6.0 h/ac (under 500 ac), 2.3 (1,000–2,000 ac); orchard 126 h/ac; dairy 39 h/cow | h | [FINBIN, UC Davis](../sources/farms.md#jobs)                          |
| Residents               | 4, at every level                                                        | people      | one farm household, same as a small house                                      |
| Power, crops            | 0.2, 0.3, 0.4                                                            | MW          | game scale against the small house's 0.1 MW                                    |
| Power, orchard          | 0.2, 0.3, 0.5 (cold storage)                                             | MW          | same                                                                           |
| Power, pasture          | 0.3, 0.6, 1.5 (milking and cooling scale with the herd)                  | MW          | same                                                                           |
| Water                   | 0 for every farm                                                         | —           | the farm pumps its own well                                                    |
| Pollution               | pasture 12 (a fifth of the workshop's 60); crops, orchards 0             | —           | dial                                                                           |
| Abandonment             | after 3 growth passes cut off                                            | passes      | the shared growth rule                                                         |
| Drawn stock             | orchard 4.9 × 6.1 m; silo 6 × 16 m; grain bin 5.5 m, eaves 4 m; barn 11 m wide; crop rows 0.76 m (30 in), banded in fours | m | [sources](../sources/farms.md#drawn-stock)                        |
| Cattle                  | one cow per 4 paddock tiles                                              | tiles       | published 2–4 acres a cow-calf pair, scaled to the lot                         |
| Farmhouse windows       | 8, each 0.91 × 1.52 m (36 × 60 in), sills 0.9 m, inside the 44 in limit  | m           | [sources](../sources/farms.md#drawn-stock)                                     |
| Farm truck              | 5.31 × 2.03 × 1.91 m; 15 km/h; works 06:00–18:00; stops 15 s at the silos; corners rounded to 4 m | m | F-150 regular cab, [sources](../sources/farms.md#drawn-stock)       |

**Code:**

- `src/shared/soil.ts` `soilGradeAt`, `soilGrades`, `SoilGrade`: the one grading function.
- `src/shared/types.ts` `ZoneType.Agriculture` (9), `FarmKind`, `BuildingCatalogEntry.farm`, `GridState.soil`, lens `'soil'`, tool id.
- `src/shared/constants.ts` `SAND_BAND_METERS`: shared with `src/render/terrain.ts`.
- `src/data/catalog.json`: nine farm entries, crops, orchard and pasture at levels 1–3.
- `src/world/zonable.ts` `computeZonableMask`, `computeFarmableMask`, `FARM_DEPTH`: the frontage march from dirt roads.
- `src/world/grid.ts` `setZones`: gates Agriculture on the farmable mask, one mask a call.
- `src/sim/growth.ts` `zoneSector`, `trySpawnFarm`, `farmLotFits`, `hasNearbyDirtRoad`, `farmKindFor`, `tryLevelUp`: spawn, kind, problems, level-up.
- `src/sim/economy.ts`: residents count for any building that has them.
- `src/sim/services.ts`: service demand counts residents the same way.
- `src/sim/worker.entry.ts`: derives soil on init, load and after terraforming.
- `src/app/clientgrid.ts`: derives the mirror's `soil` whenever heights change, from the seed `main.ts` holds.
- `src/render/zonegrid.ts`: shows the farmable tiles while the Agriculture tool is in hand; farm tint.
- `src/render/overlays.ts`: the Soil lens.
- `src/render/archetypes.ts` `isFarmEntry`: the farm archetype with no kit parts.
- `src/render/farmlot.ts` `planFarm`, `farmPlan`, `FarmPlan.houseWindows`, `FarmPlan.truckRoute`: where each part stands.
- `src/render/farms.ts` `FarmRenderer`, `truckPose`, `isWindowLit`, `isWindowCool`: fields, instanced kit, cattle, windows, truck.
- `src/render/buildings.ts` `BuildingInstancer`: a farm's pickable body is its barn.
- `src/render/lots.ts`, `massing.ts`, `props.ts`, `parked.ts`, `facade.ts`: farms are left out of lot, massing, props, parking and facade.
- `src/ui/categories.ts`, `InfoviewGrid.tsx`, `InfoPanel.tsx`, `AssetDrawer.tsx`, `icons.tsx`: Agriculture card, Soil lens, zone label, icons.
- `src/tools/tools.ts` `zone.agriculture`: the zone tool.

**Tests:**

- Soil — grades on hand-built terrain for every rule; the stony-patch share pinned to 10–25% of land tiles.
- Farmable mask — dirt fronts, paved does not, depth 8, unfit soil unmarked but passable; `setZones` for Agriculture.
- Growth — kind by soil, dirt road and power required, water not required, level-up keeps kind and gate; the catalog test pins that the three kinds share a level-1 lot.
- Occupancy counts farm residents and industrial jobs.
- Farm plan — the gate on the dirt edge, every part inside the lot; windows on the walls facing out; the truck's round inside the lot and clear of barn, silos and bins; its pose, stop and hours; windows lit by the town's rule and never on an abandoned farm.
- Archetype exclusions.
- Worker test — a few thousand ticks of a farm town on dirt roads and a power line with no water tower grows farms whose jobs are industrial.
- Browser check — each kind at each level, the Soil lens over a coast and a hillside, the zoning grid with the tool in hand, an abandoned farm, night with the farmhouse lit, the truck on its round and parked.

**Open:** none.

## Why the rules are what they are

### What the player gets

A painted Agriculture zone, the fourth kind. Farms grow on it as homes do on residential land. A farm is the industry a small town lives by: its jobs are basic jobs, like a mill's, and they support the town's shops. The demand model already treats a small town as a farming or mill town; until farms, "industry" meant a workshop yard, a mill town and never a farm town. It also gives the terrain a job: with soil, a flat river plain and a stony hillside are different places to build a town.

It serves legible cause and effect (the soil you paint on decides what grows) and the realism pillar ([gdd](../game-design/gdd.md)).

### Soil

Every land tile has a grade read from the ground, and the Soil lens shows it. The `soilGradeAt(src, seed, x, z)` rules, in order:

1. Water, or orthogonally beside water, is `Unfit`: the wet shore.
2. A height below `SEA_LEVEL + SAND_BAND_METERS` is `Unfit`: the beach the terrain draws as sand.
3. The slope is the largest height step to an orthogonal neighbour, the measure `isBuildable` uses. Over `MAX_BUILD_SLOPE` is `Unfit`, the rock the terrain draws; over 12% of a tile `Marginal`; over 6% `Fertile`; flatter `Prime`.
4. A stony patch is `Marginal` at best. Patches come from value noise on a lattice of 6 tiles, hashed from the seed and the lattice point.

Stony ground is shallow soil over rock; it takes a plough badly on any slope. The research behind the grades is in [the sources](../sources/farms.md#soil-grades-and-the-usda-classes).

`soilGrades(src, seed)` fills a whole-map `Uint8Array`, `GridState.soil`, derived like `roadMask`. The worker computes it in `init` and `loadSave` and after every terraform command; the mirror computes it from its own heights and the seed. Both run one function, so the Soil lens, the zoning grid, `paintZone` and growth never disagree. Soil is a property of the land's shape, so terraforming changes it: raise a beach and it stops being a beach. Only a new farm or a level-up reads the grade; a standing farm never flips kind.

### Painting farmland

The Agriculture card is free to paint, like every zone. While it is in hand the zoning grid shows only the tiles a farm could take: soil somewhat fertile or better, reached from a dirt road marching straight out from the road's side up to 8 tiles. The march stops at a building, water, another road or ground too steep to build on.

`computeZonableMask` is one march with two parameters: which road tiles front, and which cells may be marked. Every other zone keeps its arguments (`isStreetTier`, any buildable cell) and depth 4. `computeFarmableMask` fronts from dirt roads only (`RoadTier.Gravel`, on the grid or off it) and marks only `Marginal` or better. A stony or sandy cell stops nothing: the march passes over it, as a tractor would; only a block stops it. `setZones` picks the mask by zone, once per call, and `ZoneGridRenderer.rebuild(grid, zone)` shows the same mask.

A farm's entrance is on a dirt road and nothing else. Fields can run to the edge of a paved street or motorway, but only a dirt road gives the land access. A paved road beside a field still carries power to it.

### Growing a farm

A farm needs four things:

- **A lot of farmable land.** A new farm takes a 4×5 lot, every tile Agriculture-zoned, farmable and free (`farmLotFits`). The three kinds share this one level-1 size.
- **A dirt road within three tiles** of the lot's ring (`hasNearbyDirtRoad`): its drive and gate.
- **Power on the lot.** A dirt road carries none, so a farm on dirt roads needs a power line run out to it, as farms were actually electrified. A farm beside a paved street takes power from it.
- **Industrial demand.** Farm jobs are basic jobs.

A farm draws no city water and is never refused for, or flagged with, `NoWater`: it pumps its own well, so a town with farmland and no water tower still farms. This is general for any building whose entry draws no water; farms are the first it applies to.

The kind is `farmKindFor(lotGrade)`, where `lotGrade` is the grade at least half the lot's tiles reach: `Prime` crops, `Fertile` orchard, `Marginal` pasture. Desirability is 0.6, 0.8 or 1.0 by lot grade in place of land value, so better soil starts more farms. A farm's `NoRoad` means no dirt road within reach.

### Farms growing larger

A farm levels up from homestead to family farm to large farm by taking more land at the same origin: 5×6, then 6×7. The level-up needs:

- the larger lot to fit, every tile Agriculture and farmable;
- the larger lot's grade at least the kind's own: a crop farm expands only onto very fertile land, an orchard onto fertile or better, a pasture onto anything farmable;
- spare power for the difference;
- industrial demand above zero, and a roll of `rng.next() < demand.ind`.

Land value plays no part: high land value is what pushes real farms out, so it would be the wrong signal. The industrial bar serves workshops and farms alike; a player who zones both gets whichever lot the scan reaches first, and the Advisor's demand reporting covers a farm waiting on a workshop's demand.

### Population, power and pollution

Residents count for any Active building whose entry has them, not only the residential category. A farmhouse is home to four, so on a homestead there are more working-age people than farm jobs and the town looks for work beyond it, as real farm households do. A farm's jobs are industrial because its category is `ind`, so demand, employment, taxes and traffic need nothing new.

A farm needs power and no water; the power rule is the one every building follows. A pasture farm emits a little manure smell, a fifth of a workshop's pollution; crops and orchards none. A farm without power sits dark and says why in the info panel and the Advisor; a farm cut off from its dirt road reads "no road". After three growth passes cut off it is abandoned: fields fallow, herd gone. Wild trees give way to a farm's lot as to any building.

### How a farm is drawn

A crop farm shows a farmhouse, a gambrel-roofed barn and a tower silo at the gate, fields in furrowed rows behind, and grain bins as it grows. An orchard has a farmhouse and packing barn, then rows of round-headed fruit trees. A pasture farm has a farmhouse, barn and silo, and a fenced paddock with cattle.

`isFarmEntry(entry)` is `entry.zone === ZoneType.Agriculture`. Farms get no asphalt lot, massing tiers, stacks, roof props, parking or corrugated facade. `farmPlan(building, entry, street)` is pure, like `HouseLotPlan`. It finds the dirt-road edge with the existing frontage search, restricted to dirt. The farmstead goes in the strip along that edge: house nearest the gate, barn beside it, silo and bins behind, a drive from gate to road. The rest is field, orchard or paddock.

- **The pickable body.** `BuildingInstancer` draws the barn's walls as the body, from the barn rectangle, in a plain board-sided material with no window grid, so picking, outline and bulldoze work as everywhere. The barn sits on the highest terrain under its own rectangle.
- **`FarmRenderer`.** A merged conforming ground mesh per farm set (furrow bands, grazed grass, mown orchard rows, bare soil while under construction or abandoned) and one `InstancedMesh` pool each for gambrel roof, silo, silo cap, grain bin, farmhouse body and roof, fence post, fence rail, orchard tree and cow.
- **Cattle** drift across the paddock as a pure function of the farm id and the frame clock, as pedestrians do; none on an abandoned farm. Stocking is drawn, not simulated.
- **Windows.** The plan places eight (`FarmPlan.houseWindows`): two front, two behind, one in each gable end at ground level, one high in each gable. By day a pane is dark glass. At night `isWindowLit` and `isWindowCool`, keyed by building id and window index, decide each. Only an Active farm lights. A lit pane moves from the glass pool to a warm or cool emissive pool, since kit pools carry only a transform and a colour.
- **The truck.** Each Active farm has one `VehicleKitPool` pickup. The plan gives its round (`FarmPlan.truckRoute`), a loop from a spot on the drive by the house: out along the drive to behind the barn and bins, along behind them to the far side of the silos, back along the barn's front. It drives the yard at 15 km/h, a speed for a yard with people and stock in it. A lap under way at 18:00 is finished before the truck parks, so it never jumps; it parks on the drive from sunset to sunrise. Its position is a pure function of its route and the time since its lap began (`truckPose`); its lights are off.

### What it interacts with

- **Demand.** Farm jobs count towards the basic jobs and the shops they support. Which of workshop or farm grows is whichever the player zoned, where a lot is ready.
- **Utilities.** Power travels along paved roads and power lines; a dirt road carries none.
- **Big lots on slopes.** A 6×7 lot can span 20 m of rise; the farm ground conforms to it.
- **Save and protocol.** Unchanged: soil is derived, the zone byte already holds any `ZoneType`, and `paintZone` already carries a zone. A save from before farms loads with no Agriculture zone.

## Decided

- Soil is derived, never saved: a saved layer would need a save version and a second truth beside the terrain's own sand and rock colours.
- Farm is `ind`, not a `farm` category: a new category would make every sim path that reads `ind` learn a second name for one sector.
- One Agriculture zone with soil deciding the kind, over three paintable farm zones, by the player's choice.
- Recomputing soil on the mirror is a 65,536-tile pass per terrain change, cheaper than the zonable mask that change already rebuilds.
- The stony-patch share is pinned by a test to 10–25% of land tiles so a noise change cannot silently empty or flood the map.
- The farm truck is drawn, not simulated: it carries nothing and never leaves its own yard.
- Not built: yield, season, harvest or market price; farms shipping to factories; irrigation, fertiliser or drainage tools; ploppable farm buildings; animal agents.
