# Parking to code — technical design

- **Status:** Built 2026-10-09 — lots drawn to code (P1, 2026-10-08); the kerb stall layout shared by the renderer and the sim (P2a, 2026-10-09); the small-use exemption, kerb credit and larger lots in growth and on the map (P2b, 2026-10-09)
- **Date:** 2026-10-08
- **Author:** line cook, for the coordinator

## What we are building, and why now

Suburban commercial and industrial lots draw the parking their code asks of
their floor, laid out in real modules, with accessible spaces, loading berths
and planting, while the body keeps the floor its jobs come from. The design
and every figure are in
[the design document](../../game-design/features/parking-to-code.md); this
is how it is built. P1 draws the lots; P2 adds kerb credit and larger lots
for the kinds that fall short.

## What it touches

| Module                         | Change |
| ------------------------------ | ------ |
| `src/shared/floorarea.ts`      | New. The body rules (`bodyMetresFor`, moved from `render/massing.ts`), `storeysOf`, `grossFloorM2`/`grossFloorSqFt` and `FLOOR_HEIGHT_METERS` (moved from `render/facade.ts`). Massing, facade and the contract tests read them from here. |
| `src/shared/parkingcode.ts`    | New. Spaces per 1,000 sq ft by kind, `requiredSpaces`, `loadingBerths`, `islandsInRow`, `treesFor`, `drawsLotParking`, `lotParkingRequirement`, the stall, aisle, module, berth, island and curb-cut sizes in exact feet, and `adaAccessibleSpaces`/`adaVanSpaces` (moved from `render/kerbstalls.ts`; the hospital kit imports them from here). |
| `src/shared/lotlayout.ts`      | New. `layoutLot`: the pure, cached layout in the lot's frontage frame. |
| `src/render/lotplan.ts`        | New. `lotPlanFor`: one building's layout turned and fronting its street, with the frame onto the world; re-exports `lotLayoutFor` and the fuel forecourt and tank-farm sizes the kit draws, which live in `src/shared/lotparking.ts` since P2b. |
| `src/render/massing.ts`        | `frontageSetbackFor` moves a com/ind body to the layout's body centre and cuts nothing; downtown stands centred. |
| `src/render/parked.ts`         | The bay row (`BAY_*`, `computeStallCount`, `computeStallPlacements`, `frontageInsetTiles`, `CURB_CUT_WIDTH_M`) is gone. Cars stand one per layout stall (`lotStallPlacement`); the stripe mesh draws stall lines, the accessible paint, berths, islands, the verge apron and the curb cut; island trees are one `InstancedSlotPool` of the broadleaf. |
| `src/render/buildingkit.ts`    | Kit parts are placed at the body's centre (lot centre plus the frontage shift), not the lot's. |

No save format change and no worker protocol change. Since P2b growth reads
the floor, the code and the kerb's stalls through the same shared modules to
choose a kind's lot; nothing new is stored or sent.

## The design

**Data.** Nothing is stored. A lot's requirement derives from its catalog
entry (kind, footprint, height); its layout from the requirement, the lot
and body sizes in the frontage frame, and the kit's forecourt and rear-yard
needs. `layoutLot` caches by its input (512 entries, oldest dropped).

**The requirement.** `lotParkingRequirement(entry)` is null unless
`drawsLotParking`: category com or ind, not a farm, not ComHigh or Mixed,
not an office or hotel. Spaces are `ceil(rate × floor sq ft / 1000)`, a
shop's or a restaurant's floor first less its exempt 3,000 sq ft; a
kindless com entry parks as retail (5), a kindless works as manufacturing
(1). Berths read the retail table for com and the industrial for ind.

**The layout** works in (p, q): p along a stall row, q across the rows. Rows
along the street are p = u; rows into the lot are p = v. Four arrangements
are tried — rows along the street or into the lot, each with or without an
outer row along the drive — for each body position: on each axis centred,
held an island's width (5 ft) off the far lot line, or on it, the depth axis
inside the forecourt and rear yard. Candidates sort by slide from the centre,
then arrangement; the first that meets its code (spaces provided ≥ required,
every berth clear of the body and touching an aisle along its length) wins.
If none does, each candidate is also tried without its berths, and the
winner is the one providing the most spaces among those that place their
berths and provide at least one, else the one providing the most.

- The drive runs from the curb cut across the rows until the body or the
  forecourt stops it. Modules stack from q = 0: row, aisle, row; then a last
  row and aisle where a whole module will not go. An aisle runs from the
  drive until the body, the forecourt or the rear yard stops it; a row runs
  along its aisle until anything (berths too) stands in it. An aisle beyond
  the drive's reach is dropped with its rows.
- Berths are fixed in (u, v): at the rear of the lot, end to end, just
  inside the drive on the lot line's side (6 to 18 ft in from that line,
  where the outer row would be), or, for rows along the street with no outer
  row, against the drive's inner side.
- Filling: runs sort by distance from the entrance (the middle of the body's
  street face); a run's spaces are laid as one block — an island, up to ten
  spaces, an island, …, a closing island — centred on the door's position
  along the run and held inside it. The accessible spaces (cars, then vans,
  each followed by its access aisle) go into the nearest run that holds them,
  at the place in its block whose centre comes nearest the door; the block's
  length does not depend on where they sit, so this costs no space. The accessible count follows the spaces
  provided and is settled by iteration; a lot that cannot lay
  `adaAccessibleSpaces(provided)` provides fewer, down to none.
- Trees: `treesFor(provided)`, one per island, spread evenly over the
  islands in the order they were laid.

- Aisles drawn: the drive as far as its farthest use, each module aisle
  as far as the stalls it serves reach, and, for a berth reached from a
  module aisle, that aisle on from the drive to the berth. Where the rows run
  into the lot behind a row along the street, the drive turns along the lot
  behind that row and the throat (the curb cut's width, 18 ft deep) brings
  it in from the street.
- Walks: the front walk runs along the body's street face, the body's
  width and 8 ft deep (`ENTRANCE_WALK_M`), cut short by any stall, access
  aisle, island or berth in front of it; the entrance walk runs 8 ft wide
  from the street to the front walk, centred on the door and held inside the
  lot, where none of those stands across it and no forecourt is in front.

Output: the body, forecourt, rear yard, entrance, front and entrance walks,
stalls (rect, nose, accessible kind), access aisles, aisles, berths,
islands, trees, curb cut, throat, and `required`, `provided`, `capacity`,
`accessible`, `vans`, `fits`, `shortfall`. `lotPaving(layout)` lists the
paved ground from it: the yard (aisles, throat, stalls, access aisles,
berths, forecourt, rear yard) and the concrete (body, walks).

**Placement on the map.** `lotPlanFor` finds the road-facing edge, builds
its `EdgeFrame` and calls `lotLayoutFor` with the lot and the turned body
mapped onto along/depth. `lotPointToWorld(frame, u, v)` is
`frameToWorld(frame, u, −v / TILE_METERS)`. A stall's car yaw is its nose's
world direction, `atan2(dx, dz)`.

**Rules the implementation satisfies** (the tests):

- One floor implementation: the massing base tier is the whole plate
  `bodyMetresFor` gives, and the catalog's job and draw derivations read
  `grossFloorM2`.
- Every fitting kind's layout provides its required spaces at every level;
  accessible counts follow §208.2 and vans one in six; berths follow the
  tables; every row has its islands and the trees their count.
- Everything lies inside the lot at all four rotations, nothing overlaps the
  body, and the layout is deterministic.
- One car per stall; downtown draws no lot parking and parks at the kerb.

## P2a: one kerb layout for the renderer and the sim

Kerb credit counts the stalls a street paints along a lot's frontage, so the
sim has to count exactly the stalls the paint shows. The stall layout, the
no-parking zones that keep it off a junction, and the block face it is laid
along are therefore worked out in `src/shared`, and the road mesh calls the
same functions it used to hold.

| Module                         | Change |
| ------------------------------ | ------ |
| `src/shared/kerbstalls.ts`     | Moved from `src/render`, unchanged: the stall ticks, the block-face layout in each style, the accessible stalls and the stall orientation. |
| `src/shared/junctionpaint.ts`  | New. `junctionArmLayout`, `junctionArmPaint` and `noParkingReach`, moved from `render/roadsmesh.ts`: what a junction paints across each arm, and how far back that keeps a kerb clear. |
| `src/shared/travellanes.ts`    | New. `carriagewaySpans`, `travelLaneSpans`, `travelLanes`, `approachingLanes` and `approachingSpan`, moved from `render/roadmarkings.ts`. |
| `src/shared/kerblayout.ts`     | New. `KerbSurroundings` and `roadSurroundings`; the section reads (`drawnSectionAt`, `paintedSectionAt`, `halfAt`, `roadAlong`, `junctionAlong`, `walkableAlong`); `junctionEndsAt`, `parkingSetbacksAt`, `parkingTicksAt`, `parkingStyleAt`, `blockFaceAt`, `stallsOnTile` and `paintedKerbStallsAlong`. |
| `src/sim/kerbsurroundings.ts`  | New. `gridKerbSurroundings(grid, nodes, profileById)`: the sim's surroundings. |
| `src/world/roads.ts`           | `roadTileOf` and `overRoadStateOf`: a road tile as the render thread is told it. The worker builds its road deltas from them. |
| `src/render/roadsmesh.ts`      | Its section, setback and block-face methods call the shared ones through one `KerbSurroundings`; it keeps its cache of laid faces. |

**The surroundings.** `KerbSurroundings` is the approach zone's
`ApproachSurroundings` plus `roadAt(x, z)`, the road tile exactly as the
worker sends it (tier, mask, profile id, flow, the road passing over it, the
arms held apart), and `profileById(id)`. `roadSurroundings(roads, junctions)`
derives every other answer from those two and a junction reader (control,
turns, lane turns), so a road reads the same on both threads. The renderer
hands it its chunk tiles and the junction controls from the snapshots. The
sim hands it the grid, the road graph's junctions of three arms or more
(`control`, else `none`, and `turns`), the grid's `junctionLaneTurns` and its
profile table. Every input is grid state: no terrain, roundabout or free-road
junction reaches the stalls. Build a fresh sim surroundings after the roads
change; it reads each tile once.

**The entry point.** `paintedKerbStallsAlong(s, { x, z, alongX, tiles, side })`
returns, low to high, the stalls of one kerb whose middles lie on that run of
road tiles, each with its lane's style. They are the stalls
`RoadMeshRenderer.parkingStallsAt` returns tile by tile. A tile that runs
across the frontage, or paints no lane on that kerb, adds none. P2b counts a
lot's kerb credit with it.

**Proof.** `tests/interaction/kerbstalls.test.ts` grows a town of parked
streets in the worker: parallel, angled and head-in parking, one-way and
two-way roads, a minor-road stop at a T, all-way stops, signals, an
uncontrolled T, a side road the warrant decides, and a long block along z.
It feeds the snapshots to the road mesh the way `main.ts` does. Every tile's
setbacks and stalls, including the accessible stalls, their aisles and the
car yaw, must equal `kerbstalls.golden.json`, which was captured from the
renderer before the move. The sim's surroundings must give the same setbacks
and stalls on every tile.

## P2b: the exemption, kerb credit and larger lots

| Module                         | Change |
| ------------------------------ | ------ |
| `src/shared/parkingcode.ts`    | `SMALL_USE_EXEMPT_SQ_FT` (3,000): `requiredSpaces` takes it off a shop's or a restaurant's floor before the rate. `onSiteSpaces(required, credit)` = `max(0, required − credit)`. |
| `src/shared/roadedge.ts`       | New. `findRoadFacingEdge`, `Side`, `RoadFacingEdge` (moved from `render/frontage.ts`, which re-exports them) and `kerbSideFacing`, `KerbSide` (moved from `render/parked.ts`, which re-exports them). |
| `src/shared/kerblayout.ts`     | `kerbCreditFor(s, lot, side)`: the stalls `paintedKerbStallsAlong` counts on the kerb the lot faces, along its edge. |
| `src/shared/lotparking.ts`     | New. `lotLayoutFor` (moved from `render/lotplan.ts`, which re-exports it) lays out `onSiteSpaces(required, credit)`; `lotYardsFor` gives the fuel forecourt and the tank farm by kind, with their sizes (moved from `render/lotplan.ts`); `lotParkingAt` finds the edge, the credit and the layout for a building where it stands; `holdsLotParkingAt` is growth's fit. |
| `src/shared/types.ts`, `src/shared/floorarea.ts` | `BuildingCatalogEntry.bodyFootprint`: a larger lot's body is sized on its kind's own footprint, so its floor, and everything derived from it, is the kind's. |
| `src/data/catalog.json`        | 22 larger lots for shop, restaurant, strip, supermarket and flex, `<kind id>-lot<w>x<d>`, no `share`. |
| `src/sim/growth.ts`            | `footprintsOf`; `spawnCandidates` never returns a larger lot; the spawn fit and the level-up (`levelUpSite`) take the smallest footprint that also passes the parking check; `tick` takes the kerb surroundings as a factory, built once a pass on first ask. |
| `src/sim/worker.entry.ts`      | Hands growth `gridKerbSurroundings(grid, network nodes, profileForId)`. |
| `src/render/lotplan.ts`, `massing.ts`, `parked.ts`, `buildings.ts`, `buildingkit.ts`, `props.ts`, `main.ts` | Every lot plan takes the road mesh's `KerbSurroundings` (`RoadMeshRenderer.kerbSurroundings()`), so the body, its kit, its roof clutter, its car park and its curb cut agree on the credited layout. |
| `src/render/roadsmesh.ts`      | `groundAt` reads nothing off the map. |
| `src/shared/lotlayout.ts`, `parkingcode.ts` | The layout gives its walks, throat and rear yard, draws the aisle a berth is reached from, and `lotPaving` lists its paved ground; `ENTRANCE_WALK_M` (8 ft). |
| `src/render/lots.ts`, `parked.ts`, `main.ts` | `LotRenderer` takes the `KerbSurroundings`; a lot with a plan is lawn (`LOT_Y_OFFSET`) with its yard paving at `DRIVE_Y_OFFSET` and its concrete at `WALK_Y_OFFSET` (0.11), and paves the verge across the curb cut (where it has a drive) and the entrance walk. `parked.ts` no longer paves the verge the whole frontage long; it keeps the curb cut across the sidewalk. |

**The credit.** A lot's frontage is the edge `findRoadFacingEdge` picks over
the tiles that carry a road (the renderer's `roadAt`, the sim's road tier),
and its kerb is the side of that street the lot lies on. `kerbCreditFor`
counts every painted stall on that kerb whose middle lies on the edge's road
tiles: any style, accessible ones too, no cap. The layout then holds
`onSiteSpaces(required, credit)` and its own ADA §208.2 accessible spaces
over what it provides; at 0 it draws no stall and owes no accessible space.

**The larger lots.** For each short kind and level, a ladder widens the
kind's own footprint a tile at a time along its frontage, at its own depth,
to the first lot whose layout fits with no credit at all four turns and
frontages (the audit in the design document). Each rung is the kind's entry
with a new `id` and `footprint`, a `bodyFootprint` of the kind's own, and no
`share`. The catalog keeps each kind's own entry first, so ties in area keep
catalog order.

**Growth.** `spawnCandidates` lists one entry a kind (no `bodyFootprint`).
For each, `footprintsOf` gives its lots smallest first, and the first that is
placed on the plat's frontage, zoned, placeable and `holdsLotParkingAt` is
where it stands; a kind none of whose lots fits is no candidate. `drawKind`
then draws among kinds by share, as before. A level-up finds the next
level's kind entry, then tries its lots smallest first, skipping any smaller
than the current footprint on either axis, through the same street-edge and
frontage rules, plus the parking check. The parking check is never applied
to a standing building, so removing kerb parking abandons nothing.

**Proof.** `src/shared/parkingcode.test.ts` (the exemption and the credit
arithmetic), `src/shared/contracts.zoning.test.ts` (a larger lot is its
kind's entry in every figure but id and footprint), `src/render/lotplan.test.ts`
(every short kind's largest lot fits with no credit at every turn and
frontage; each lot fits once credited what it cannot hold; the yards follow
the kit's parts; every berth is reached by a drawn aisle and the drive meets
the street at its curb cut; a lot credited its whole code paves only its
body, its walks and what its berths and yards need; a supermarket's paving
lies on its layout and its lawn covers the lot at every turn and frontage;
the same ground is laid every time), `src/sim/growth.test.ts` (a smaller lot on a parked street,
angled over parallel, the corner shop on a one-deep strip, shares not
doubled, the level-up re-check, no abandonment),
`tests/interaction/kerbstalls.test.ts` (the sim and the road mesh credit the
same stalls; the far kerb and the no-parking zones count nothing; the drawn
lot holds required − credit) and `tests/interaction/kerbcredit.test.ts` (a
parked street on the map's edge gives the same stalls on both threads).

## What could go wrong

- **A drawn lot is laid out when its building arrives.** Painting or
  removing a street's parking later does not re-lay the lots already drawn
  along it until their building next changes, as with the curb cut's edge.
- **A credited lot's customers** park in its car park and never at the
  kerb, so the kerb stalls it counts stand empty of its own cars.
- **Bodies on the lot line** can meet a neighbour's; the 85% fill ceiling
  still holds the body's size, not its position.
- **The interior landscaping share** comes out at 2–11% of the paved car
  park, drive included, rather than inside the codes' 5–10%; the island and
  tree rules are what is applied. The ground the layout leaves is planted,
  9–60% of the lot (see the design document), but that is lot landscaping,
  not interior planting, and is not counted toward the 5–10%.
- **A lot with berths and no space on site** paves its berths and their
  drive, but `parked.ts` draws no car park for it, so its drive has no curb
  cut across the sidewalk.
- **Box trucks** are 7 m in an 18 ft stall: they stand nose to the head with
  their tail over the aisle.
- The hospital kit keeps its own rounded accessible widths (2.44/3.35/1.52 m)
  beside these exact ones.

## Alternatives

- Area arithmetic (300 sf a space all in) instead of a layout: what the
  first audit used, and what wrongly passed flex. The layout is what is
  drawn, so it is what is counted.
- Shrinking the body to make room: what the bay row did; it drew a floor
  smaller than the one the jobs came from.

## How we will know it works

`src/render/lotplan.test.ts` (the contract over the catalog, rotations,
determinism, plate equality, downtown), `src/shared/parkingcode.test.ts`,
`src/render/parked.test.ts` (one car per stall), and screenshots of a
supermarket, a strip, a restaurant, a filling station, a warehouse, a
factory and a strip with cars, looked at against the rules.

## Out of scope

Parking decks off the hospital; any sim effect of parking beyond where a
building may stand.
