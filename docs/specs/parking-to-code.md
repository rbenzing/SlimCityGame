# Parking to code

- **Status:** Built

**Owns:** the car park a suburban commercial or industrial lot draws: code requirement, kerb credit, stall layout, paving, planting, larger lots and the growth gate. Downtown parks at the kerb; the kerb paint itself is the roads area's.

**Rules:**

- Draw the code-minimum spaces from the lot's floor (body plate × storeys), with accessible spaces, berths, islands and trees, from one requirement and one layout. `[R-services-033]`
- Slide the body, never cut it, so the floor stays the one its jobs come from. Downtown kinds (office, hotel, mixed) draw no lot parking. `[R-services-033]`
- Pave only what the layout uses; the rest is lawn, and the verge is paved only where the drive and the walk cross it. `[R-services-034]`
- Park nothing for the first 3,000 sq ft of a single-tenant shop or restaurant; strip, supermarket and industry get no exemption. `[R-services-035]`
- Credit one space per stall the street paints on the lot's own side along its frontage, any style, no cap, counted by one shared function. `[R-services-036]`
- Hold on site the requirement less the credit, never below none; count accessible spaces within it, never at the kerb. `[R-services-037]`
- Build and level up only onto a lot that meets the code, smallest first; a larger lot is never a kind of its own; a lot that stops meeting it is legal nonconforming. `[R-services-037]`
- Compute the kerb stalls and no-parking zones in `src/shared`, so the sim counts exactly the stalls the paint shows. `[R-roads-050]`
- Count lot and deck parking by the ADA table, never the kerbside table. `[R-services-032]`

**Numbers:**

| Constant                         | Value                                                                  | Unit            | Source                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| Rates by kind                    | shop, strip, supermarket 5; restaurant 10; fuel kiosk 5; office 3 (downtown, reference); manufacturing 1; warehouse 0.5; flex 2 | per 1,000 sq ft | [modal US codes](../sources/parking-to-code.md#the-requirement-where-the-rates-come-from) |
| `SMALL_USE_EXEMPT_SQ_FT`         | 3,000 (median of 13 codes, range 1,500–10,000)                         | sq ft           | [survey](../sources/parking-to-code.md#the-small-use-exemption)                         |
| Storey height                    | 3.2 (shop, flex); one high-bay floor otherwise                         | m               | [building-types.md](building-types.md)                          |
| Body plate                       | 13.6 a lot tile                                                        | m               | massing rule                                                                            |
| Stall                            | 9 × 18 ft (2.74 × 5.49 m), 90°                                         | ft              | [Forest Lake MN](https://codelibrary.amlegal.com/codes/forestlake/latest/forestlake_mn/0-0-0-40825) |
| Aisle, two-way                   | 24 ft (7.32 m)                                                         | ft              | same                                                                                    |
| Module                           | 60 ft (18.3 m) double-loaded; 42 ft (12.8 m) single row                | ft              | same, ULI                                                                               |
| Curb cut                         | 24 ft wide, inside the 24–36 ft (7.3–11 m) codes allow                 | ft              | [sources](../sources/parking-to-code.md#the-module)                                     |
| Throat                           | the curb cut's width, 18 ft deep                                       | ft              | dial                                                                                    |
| Accessible spaces                | 1 per 25–100, 1 per 50–200, 1 per 100–500; 1 in 6 a van                | spaces          | ADA 2010 §208.2, §208.2.4                                                               |
| Accessible space                 | car 96 in (2.44 m), van 132 in (3.35 m), aisle 60 in (1.52 m)          | in              | [US Access Board](https://www.access-board.gov/ada/guides/chapter-5-parking/)           |
| Loading berth                    | 12 × 50 ft (3.66 × 15.24 m), 14 ft (4.27 m) clear; counts by floor     | ft              | Wadsworth OH, [sources](../sources/parking-to-code.md#accessible-spaces-and-loading)    |
| Planted island                   | at least 5 ft wide, at every row end and after every ten spaces        | ft              | [Tyler TX](https://codelibrary.amlegal.com/codes/tyler/latest/tyler_tx/0-0-0-81565)     |
| Trees                            | one per ten spaces or part of ten                                      | trees           | Moses Lake WA, Chardon OH, Raleigh NC                                                   |
| Island kerb                      | 6                                                                      | in              | dial                                                                                    |
| Interior landscaping, not applied | 5–10 asked; ours 2–11                                                 | % of paved park | [sources](../sources/parking-to-code.md#planting)                                       |
| `ENTRANCE_WALK_M`                | 8 ft (2.44 m) deep, and wide from street to door                       | ft              | Fort Collins LUC 3.5.4                                                                  |
| Fuel forecourt / tank farm       | 12 in front of the kiosk / 8 behind the body                           | m               | dial                                                                                    |
| `WALK_Y_OFFSET`                  | 0.11                                                                   | m               | dial                                                                                    |
| `layoutLot` cache                | 512, oldest dropped                                                    | entries         | dial                                                                                    |
| Larger lots                      | 22 catalog entries `<kind id>-lot<w>x<d>`, no `share`                  | lots            | the audit in the sources                                                                |
| Kerb stalls a tile               | parallel about 3, angled about 7, head-in about 8                      | stalls          | `[R-roads-048]`                                                                         |
| Box truck                        | 7, in an 18 ft stall                                                   | m               | dial                                                                                    |
| Hospital kit widths              | 2.44 / 3.35 / 1.52, beside the exact ones                              | m               | kit                                                                                     |
| Retired bay row                  | 2–4 bays; body 13.6 m of a lot tile, 46% of the lot; 0.2–0.3 coverage was never true | —   | `BAY_*`, `computeStallCount`, `computeStallPlacements`, `frontageInsetTiles`, `CURB_CUT_WIDTH_M`, gone |

**Code:**

- `src/shared/floorarea.ts` `bodyMetresFor`, `storeysOf`, `grossFloorM2`, `grossFloorSqFt`, `FLOOR_HEIGHT_METERS`: the one floor.
- `src/shared/parkingcode.ts` `requiredSpaces`, `loadingBerths`, `islandsInRow`, `treesFor`, `drawsLotParking`, `lotParkingRequirement`, `onSiteSpaces`, `adaAccessibleSpaces`, `adaVanSpaces`, `SMALL_USE_EXEMPT_SQ_FT`, `ENTRANCE_WALK_M`: requirement and sizes.
- `src/shared/lotlayout.ts` `layoutLot`, `lotPaving`: the pure cached layout and its paved ground.
- `src/shared/lotparking.ts` `lotLayoutFor`, `lotYardsFor`, `lotParkingAt`, `holdsLotParkingAt`: layout with credit, yards, growth's fit.
- `src/shared/kerbstalls.ts`: stall ticks, block-face layout, accessible stalls, orientation.
- `src/shared/kerblayout.ts` `KerbSurroundings`, `roadSurroundings`, `parkingSetbacksAt`, `parkingTicksAt`, `parkingStyleAt`, `blockFaceAt`, `stallsOnTile`, `paintedKerbStallsAlong`, `kerbCreditFor`, `junctionEndsAt`, `drawnSectionAt`, `paintedSectionAt`, `halfAt`, `roadAlong`, `junctionAlong`, `walkableAlong`.
- `src/shared/junctionpaint.ts` `junctionArmLayout`, `junctionArmPaint`, `noParkingReach`: the kerb a junction keeps clear.
- `src/shared/travellanes.ts` `carriagewaySpans`, `travelLaneSpans`, `travelLanes`, `approachingLanes`, `approachingSpan`.
- `src/shared/roadedge.ts` `findRoadFacingEdge`, `Side`, `RoadFacingEdge`, `kerbSideFacing`, `KerbSide`: the frontage edge and kerb a lot faces.
- `src/shared/types.ts` `BuildingCatalogEntry.bodyFootprint`; `src/data/catalog.json`: larger lots sized on the kind's footprint.
- `src/sim/kerbsurroundings.ts` `gridKerbSurroundings`: the sim's surroundings.
- `src/sim/growth.ts` `footprintsOf`, `spawnCandidates`, `levelUpSite`, `tick`: smallest fitting lot; surroundings built once a pass.
- `src/sim/worker.entry.ts`: hands growth `gridKerbSurroundings(grid, network nodes, profileForId)`.
- `src/world/roads.ts` `roadTileOf`, `overRoadStateOf`: a road tile as the render thread is told it.
- `src/render/lotplan.ts` `lotPlanFor`: one building's layout turned to its street; re-exports `lotLayoutFor`.
- `src/render/massing.ts` `frontageSetbackFor`; `src/render/parked.ts` `lotStallPlacement`; `src/render/lots.ts` `LotRenderer`, `LOT_Y_OFFSET`, `DRIVE_Y_OFFSET`, `WALK_Y_OFFSET`: body, cars, lawn and paving.
- `src/render/massing.ts` `InstancedSlotPool`: one pool the island trees draw from.
- `src/world/freeroads.ts` `groundAt`: ground height read from the grid's height field, nothing off the map.
- `src/render/roadsmesh.ts` `RoadMeshRenderer.kerbSurroundings`, `RoadMeshRenderer.parkingStallsAt`: the shared kerb calls.
- `src/render/buildingkit.ts`, `src/render/buildings.ts`, `src/render/props.ts`, `src/main.ts`: kit at the body's centre; lot plans take the mesh's surroundings.

**Tests:**

- `src/render/lotplan.test.ts` — catalog kinds at four rotations, determinism, plate equality, downtown; short kinds' largest lot fits; credited lots fit; berths reached; paving on the layout.
- `src/shared/parkingcode.test.ts` — the exemption and the credit arithmetic.
- `src/shared/contracts.zoning.test.ts` — a larger lot is its kind's entry in every figure but id and footprint.
- `src/render/parked.test.ts` — one car per stall.
- `src/sim/growth.test.ts` — smaller lot on a parked street, corner shop on a one-deep strip, shares not doubled, level-up re-check, no abandonment.
- `tests/interaction/kerbstalls.test.ts` — sim and mesh credit the same stalls against `kerbstalls.golden.json`; far kerb and no-parking zones count nothing.
- `tests/interaction/kerbcredit.test.ts` — a parked street on the map's edge gives the same stalls on both threads.
- Browser check — supermarket, strip, restaurant, filling station, warehouse, factory and a strip with cars, against the rules.

**Open:**

- The kerb paints stalls across curb cuts and house drives, so a lot's kerb credit can count a stall a driveway would block.
- Customers of a kerb-credited lot still park on the lot, not in its credited kerb stalls.
- A framed lot beside a curve that lays no car park still reads its kerbside allowance from grid edges.

## Why the rules are what they are

### What the player gets

A suburban shop, restaurant, filling station, strip, supermarket or works stands in the car park its zoning code asks for. Downtown builds to the pavement and parks at the kerb, as downtowns do. It serves the realism pillar ([gdd](../game-design/gdd.md)): a car park is the biggest thing on a suburban lot, and now it is the size the code says.

Before, a lot drew two to four bays whatever its floor, and the body was cut back to make room. Bodies filled 13.6 m of each lot tile, so the coverage [lots-and-land.md](lots-and-land.md) claimed was never true.

### The requirement

A lot's floor is its body's plate times its storeys; spaces are `ceil(rate × floor sq ft / 1000)`. The rates are the modal minimums in US municipal codes. `lotParkingRequirement(entry)` is null unless `drawsLotParking`: category com or ind, not a farm, not ComHigh or Mixed, not an office or hotel. A kindless com entry parks as retail, a kindless works as manufacturing. Berths read the retail table for com and the industrial for ind.

**The small-use exemption.** The floor above the first 3,000 sq ft parks at the full rate. A strip and a supermarket are the multi-tenant and shopping-centre configurations the codes leave out, and industry has none. So the corner shop owes nothing and keeps growing on a strip one tile deep.

**The kerb counts.** A stall whose middle lies along the lot's frontage is one space, accessible stalls included; the middle decides a stall straddling two lots. The far kerb and the no-parking zones count nothing. What the lot holds on site is the requirement less that credit, never below none. A lot left nothing to hold draws no car park and owes no accessible space.

**Accessible spaces** follow ADA 2010 §208.2 over the spaces the lot provides, counted inside the total. A lot that cannot lay one provides fewer spaces, and none at all if not even one fits.

**Planting.** An island at every row end and after every ten spaces; the trees per ten spaces. The codes' separate interior-landscaping minimum is not applied on top.

### The car park

Every stall is 9 × 18 ft at 90°, on a two-way 24 ft aisle. One curb cut opens onto one drive, and every aisle opens off it. The layout tries four arrangements, in order:

1. rows along the street, off a drive into the lot along one side, with a row of stalls on the drive's outer side;
2. rows into the lot, off a drive along the street behind a row backing onto the sidewalk (the curb cut is a gap in that row);
3. and 4. the same two without the outer row, for lots too narrow for it.

From the street the modules stack row, aisle, row, then a last row and aisle where a whole module will not go. A row runs from the drive until the body, a berth or a yard stops it. Where the lot is deep enough in front of the body for a module, the parking is in front; otherwise it is beside the body.

The body keeps its size and may stand anywhere. On each axis it is centred, held an island's 5 ft off the lot line, or on the line. The layout takes the least slide from the centre that meets the code, the body to the far side from the drive; for a lot that cannot, the slide that holds the most spaces. A body on its lot line can meet its neighbour's: the price of keeping the floor whole.

A filling station keeps a forecourt clear before its kiosk, where canopy and pumps stand. A chemical plant and a paper mill keep a tank farm behind their body.

Spaces fill nearest the entrance first, the middle of the body's street face. Each row's spaces are one block centred on the door's place along it. Accessible spaces go in the nearest row that holds them, nearest the door.

Berths stand at the rear along the drive's side, end to end, each beside the drive or first aisle a truck reaches it from. A lot that falls short keeps its berths unless that leaves it no space; then it draws the spaces and no berth. A berth reached from an aisle is reached along that aisle from the drive, even where no stall is drawn on it.

### How the layout is searched

The layout works in (p, q): p along a stall row, q across the rows. Rows along the street are p = u; rows into the lot are p = v. Candidates (each arrangement at each body position, the depth axis held inside forecourt and rear yard) sort by slide from the centre, then arrangement. The first that meets its code wins: spaces at least required, every berth clear of the body and touching an aisle along its length.

If none does, each candidate is also tried without berths. The winner provides the most spaces among those that place their berths and provide at least one, else the most overall.

- The drive runs from the curb cut until the body or forecourt stops it. An aisle runs from the drive until the body, forecourt or rear yard stops it; an aisle beyond the drive's reach is dropped with its rows.
- Berths are fixed in (u, v) at the rear, 6 to 18 ft in from the lot line where the outer row would be, or against the drive's inner side where there is no outer row.
- A run is one block: an island, up to ten spaces, an island, and a closing island. Its length does not depend on where the accessible spaces sit, so placing them costs no space.
- The accessible count follows the spaces provided and is settled by iteration, down to none.
- Trees are `treesFor(provided)`, one per island, spread evenly in the order the islands were laid.

The output carries `required`, `provided`, `capacity`, `accessible`, `vans`, `fits` and `shortfall`. `lotPlanFor` finds the road-facing edge, builds its `EdgeFrame` and calls `lotLayoutFor`. `lotPointToWorld(frame, u, v)` is `frameToWorld(frame, u, −v / TILE_METERS)`. A stall's car yaw is its nose's world direction, `atan2(dx, dz)`.

### The paved ground

The codes landscape the land a lot does not build on, park on, drive on or load from. So only what the layout uses is paved:

- the body's slab, and a walk 8 ft deep along its street face, cut short where a parked car, access aisle, island or berth stands before it;
- an 8 ft walk from the street to the door, where nothing parked crosses its line and no forecourt is in front;
- the drive, its throat in from the curb cut where the drive turns along the lot behind a row of stalls, and every aisle as far as the stalls and berths it serves;
- the spaces and access aisles, the berths, and the forecourt or tank farm.

The rest is lawn, islands among it. A lot whose kerb credit carries its whole code is lawn with its body, walks and, with berths, their drive. Downtown kinds and every lot that parks no lot to code keep the pads they had. `lotPaving(layout)` lists the yard (asphalt) and the concrete (body, walks).

On screen: asphalt for commerce, dark asphalt for industry, concrete for slab and walks; white stall lines; the accessibility symbol with a hatched aisle; outlined berths; islands with a 6 in kerb and a young broadleaf. Cars stand one to a stall, nose in. Industrial lots mix box trucks and pickups; a truck longer than its stall stands with its tail over the aisle.

### Which kinds fit, and larger lots

The audit measured every kind and level on its own lot with no kerb credit ([tables](../sources/parking-to-code.md#the-audit-which-kinds-fit)). The fuel station and seven of the eight works fit at every level. The four retail kinds fall short at every level but the corner shop's, and so does flex at its first and third. An area count wrongly passed flex; the layout is what is drawn, so it is what is counted.

A short kind has larger lots in the catalog for the same building: same floor, height, staff and draw, more car park along its street. Each rung widens the frontage a tile at a time at the kind's own depth, to the first lot that holds the whole code with no credit at every turn ([ladders](../sources/parking-to-code.md#larger-lots)). It is the kind's entry with a new `id` and `footprint`, a `bodyFootprint` of the kind's own, and no `share`.

The lot draws a kind by its share, once; the kind then stands on the smallest of its lots that meets its code where it would stand. A strip on a street painting parallel parking takes four lots, and on a street painting none, five.

### Growth, levels and the nonconforming lot

- `spawnCandidates` lists one entry a kind, never a larger lot. `footprintsOf` gives its lots smallest first; the first placed on the plat's frontage, zoned, placeable and `holdsLotParkingAt` is where it stands. `drawKind` then draws by share.
- A level-up tries the next level's lots smallest first, skipping any smaller than the current footprint on either axis, with the same frontage rules plus the parking check.
- The parking check never applies to a standing building. A lot whose kerb parking is painted out keeps trading and is never abandoned; only a level-up must meet the code again.
- Saved buildings keep their footprints; no save or protocol changes.

### One kerb layout for the renderer and the sim

Kerb credit counts the stalls the street paints, so the sim must count exactly the stalls the paint shows. The stall layout, the no-parking zones and the block face are worked out in `src/shared`; the road mesh calls the same functions.

`KerbSurroundings` is the approach zone's `ApproachSurroundings` plus `roadAt`, the road tile exactly as the worker sends it (tier, mask, profile id, flow, the road passing over it, the arms held apart), and `profileById`. `roadSurroundings(roads, junctions)` derives every other answer from those, so a road reads the same on both threads.

The renderer hands it its chunk tiles and the snapshots' junction controls. The sim hands it the grid, the road graph's junctions of three arms or more (`control`, else `none`, and `turns`), the grid's `junctionLaneTurns` and its profile table. Every input is grid state: no terrain, roundabout or free-road junction reaches the stalls. Build a fresh sim surroundings after the roads change.

`paintedKerbStallsAlong(s, { x, z, alongX, tiles, side })` returns, low to high, the stalls of one kerb whose middles lie on that run of tiles, each with its lane's style. `kerbCreditFor(s, lot, side)` counts them on the kerb the lot faces; the frontage is the edge `findRoadFacingEdge` picks over the road tiles.

`tests/interaction/kerbstalls.test.ts` grows a worker town of parked streets: all three styles, one-way and two-way, stops, signals, an uncontrolled T, a warrant-decided side road and a long block along z. Every tile's setbacks, stalls and car yaw must equal the golden file captured before the move.

### What it interacts with

- **Body renderers** place the body where the lot plan puts it; nothing is cut off its plate for parking.
- **The kerb**: a lot that parks on site does not also line the kerb. Downtown, and a suburban lot holding no space, parks at the kerb where the street allows.
- **Kerb furniture** keeps off the road tile in front of the curb cut.
- **Farms** draw no lot parking and no pad; the farm plan owns its ground.

## Decided

- A stall layout, over area arithmetic (300 sf a space): the count wrongly passed flex, and the layout is what is drawn.
- Slide the body, over shrinking it: shrinking drew a floor smaller than the one the jobs came from.
- Larger lots in the catalog, over larger kind footprints: a kind's share counts once and its floor never changes.
- Nothing stored, no protocol change: layout and credit derive from the catalog entry and the grid.
- A drawn lot is laid out when its building arrives; painting kerb parking later does not re-lay it until the building changes.
- A lot with berths and no space on site paves its berths and drive but has no curb cut across the sidewalk.
- A body on its lot line can meet a neighbour's; the 85% fill ceiling holds its size, not its position.
- Not a parking simulation: cars do not search for spaces and a full lot costs nothing.
- Not built: downtown decks and garages, parking maximums, shared-parking reductions, transit waivers, angled lot stalls, one-way aisles.
- Figures are code figures, not dials, named in [balancing.md](../game-design/balancing/parking-to-code.md).
