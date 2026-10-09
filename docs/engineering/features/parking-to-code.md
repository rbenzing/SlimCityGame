# Parking to code — technical design

- **Status:** Partly built — lots drawn to code (P1, 2026-10-08); kerb credit and larger lots for the kinds that fall short not built
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
| `src/render/lotplan.ts`        | New. `lotLayoutFor`/`lotPlanFor`: one building's layout turned and fronting its street, with the frame onto the world; holds the fuel forecourt and tank-farm sizes the kit draws (`buildingkit.ts` re-exports them). |
| `src/render/massing.ts`        | `frontageSetbackFor` moves a com/ind body to the layout's body centre and cuts nothing; downtown stands centred. |
| `src/render/parked.ts`         | The bay row (`BAY_*`, `computeStallCount`, `computeStallPlacements`, `frontageInsetTiles`, `CURB_CUT_WIDTH_M`) is gone. Cars stand one per layout stall (`lotStallPlacement`); the stripe mesh draws stall lines, the accessible paint, berths, islands, the verge apron and the curb cut; island trees are one `InstancedSlotPool` of the broadleaf. |
| `src/render/buildingkit.ts`    | Kit parts are placed at the body's centre (lot centre plus the frontage shift), not the lot's. |

No save format change and no worker protocol change: the sim reads neither
floor area nor parking.

## The design

**Data.** Nothing is stored. A lot's requirement derives from its catalog
entry (kind, footprint, height); its layout from the requirement, the lot
and body sizes in the frontage frame, and the kit's forecourt and rear-yard
needs. `layoutLot` caches by its input (512 entries, oldest dropped).

**The requirement.** `lotParkingRequirement(entry)` is null unless
`drawsLotParking`: category com or ind, not a farm, not ComHigh or Mixed,
not an office or hotel. Spaces are `ceil(rate × floor sq ft / 1000)`; a
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

Output: the body, forecourt, entrance, stalls (rect, nose, accessible
kind), access aisles, aisles, berths, islands, trees, curb cut, and
`required`, `provided`, `capacity`, `accessible`, `vans`, `fits`,
`shortfall`.

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

## What could go wrong

- **Flex falls short** at levels 1 and 3 on the geometry, though an area
  count said it fits; P2 has to add it to the kinds that get larger lots.
- **Bodies on the lot line** can meet a neighbour's; the 85% fill ceiling
  still holds the body's size, not its position.
- **The interior landscaping share** comes out at 2–11% of the paved car
  park, drive included, rather than inside the codes' 5–10%; the island and
  tree rules are what is applied.
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

Kerb credit and larger lot variants (P2); parking decks off the hospital;
any sim effect of parking.
