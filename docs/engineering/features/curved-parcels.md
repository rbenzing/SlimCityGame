# Parcels follow the street — technical design

- **Status:** Built 2026-10-27 (agreed 2026-10-23)
- **Date:** 2026-10-23
- **Author:** Claude Fable 5.1

The design is
[../../game-design/features/curved-parcels.md](../../game-design/features/curved-parcels.md),
which owns the rules and their sources; this owns how the code gets there.
It takes up the choice
[ADR-0016](../adr/0016-roads-are-a-network-of-nodes-and-segments.md) deferred.

## What we are building, and why now

Beside a free-form segment the plat finds "street" tiles (the cells the
curve crosses, `streetAt` in `src/world/plat.ts`) and cuts grid parcels
against them, each facing N/E/S/W; the spawner turns a building 0° or 90°
(`frontagePlacement`, `src/sim/growth.ts`); the lot planners look for a
grid road along one of four sides (`findRoadFacingEdge`,
`src/shared/roadedge.ts`; `findStreetFacingEdge`, `src/render/frontage.ts`)
and lay nothing when none is there. The fix is one new idea — **a parcel has
a frame** — carried through the plat, the spawner, the save and the lot
renderers, with the grid path untouched.

## What it touches

| Module                                                                                   | Slice | Change                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                                                                    | 1     | `ParcelFrame`; `BuildingInstance.frame?`; `SAVE_VERSION` 17                                                                            |
| `src/shared/lotframe.ts` (new)                                                           | 1     | `toWorld(frame, u, v)`, `toLocal`, `frameOfGridLot(parcel)` — the one transform every reader uses                                      |
| `src/world/plat.ts`                                                                      | 1     | `streetAt` ignores cells of non-grid segments; `platAlongKerbs(net, src, zone)` cuts framed parcels along free segments; `Plat.framed` |
| `src/shared/roadgeom.ts`                                                                 | 1     | `kerbLine(g, side, halfWidthM)`: the centre samples offset square to the tangent; `headingAt(g, t)`                                    |
| `src/sim/growth.ts`                                                                      | 1     | a framed parcel spawns a building with `frame`, its claimed tiles as its footprint                                                     |
| `src/world/grid.ts` / `src/sim/worker.entry.ts`                                          | 1     | place, bulldoze, flatten and overlap over a claimed tile set; registry serialises `frame`                                              |
| `src/app/clientgrid.ts`                                                                  | 1     | the mirror keeps each framed building's claimed tiles and frame                                                                        |
| `src/render/buildings.ts`                                                                | 1     | a framed body composes from its frame (heading) instead of a quarter turn                                                              |
| `src/render/houselot.ts`, `buildingkit.ts`, `houses.ts`, `houseroofs.ts`, `roofprops.ts` | 1     | house parts, drive, walk, garage, yard and roof laid in the frame                                                                      |
| `src/render/parked.ts`, `pedestrians.ts`                                                 | 1     | the car on the drive and the walker's home anchor read the frame                                                                       |
| `src/render/zonegrid.ts`                                                                 | 1     | the lens draws a framed parcel's outline turned                                                                                        |
| `tools/curve-shots.mjs` (new)                                                            | 1     | an S-bend zoned both sides, shot from above, close on a drive, and through the lens                                                    |
| `src/world/plat.ts`, `src/sim/growth.ts`                                                 | 2     | the kerb plat for every zone; `FramedRun`, `runsAlongKerbs`; the lot-less spawn branch                                                 |
| `src/shared/lotparking.ts`, `kerblayout.ts`, `src/render/buildingkit.ts`, `parked.ts`     | 2     | car park, curb cut, aisles and berths placed through the frame; kerb credit from the free road's section along the frontage            |
| `src/sim/network.ts`, `growth.ts`, `src/render/houselot.ts`                              | 2     | water, sewage and service readers over standing tiles; the lamp set over a framed drive's cut                                          |

## The design

### Data: a parcel's frame

```ts
/** A parcel turned to its street: a grid lot fronting north, moved and turned. */
export interface ParcelFrame {
  /** World metres: the parcel's front-left corner on the kerb line. */
  x: number;
  z: number;
  /** Radians about +Y: the road's direction at the frontage's middle; 0 is +X. */
  heading: number;
}
```

The convention that keeps every reader simple: **a framed parcel is a grid
lot fronting north, rotated.** A grid parcel with `front: 'N'` at tile
`(x, z)` is the identity frame (`x·20, z·20, heading 0`): local `u` runs
east along the street, local `v` runs south into the lot, the street is at
`v = 0`, and every lot layout the game already computes for a north-fronting
lot — the drive, the walk, the garage, the yard, the body's setback — is a
layout in `(u, v)`. `toWorld(frame, u, v)` is a rotation and a translation.
A building on a framed parcel carries `frame` and `rotation: 0`; its `x, z`
remain the min tile of the tiles it claims, so every tile-keyed reader
(coverage, overlap, picking, bulldoze) sees it where it is. A building with
no `frame` is a grid building and nothing about it changes.

`frame` rides in the registry's JSON in the save; `SAVE_VERSION` goes to 17
so a build without this feature refuses a save it would stand on the grid
wrongly, and a version-16 save loads unchanged, every building unframed.

### Behaviour: the plat along a kerb

`platAlongKerbs(net, src, zone)` runs after the grid plat and only over
free-form segments (`!isGridSegment(g)`), both sides, each side only where
the zone lies within the zoning depth of that kerb. For each:

1. **The kerb line** is the centre line sampled at `SAMPLE_STEP_M` and offset
   square to the tangent by the road's half width, kerb to kerb including
   its footways (`kerbLine`, `segmentHalfWidthM`), so it is the right-of-way
   edge where a lot line sits; arc length `s` runs along it.
2. **Clearance.** `s` starts at the node's junction half-width plus the
   drive's corner clearance, 6 m, and stops the same short of the far node.
3. **Cutting.** At `s`, the parcel's size comes from the ladder on the land
   value under the tile at the kerb point (the grid plat's own rule); its
   frame is `{ kerb(s), heading(s + w/2) }`; its rectangle is `[0, w] ×
[0, d]` in that frame. The parcel claims every tile whose centre lies in
   its rectangle (`claimedTiles`): centres partition the tiles between
   rectangles that do not overlap, so parcels stand end to end at any angle,
   where an exact overlap test would make every pair of neighbours share
   the tiles their common side line crosses and leave half a street empty.
   A parcel that holds no centre is not cut. It stands only if every
   claimed tile is zoned `zone`, free of buildings, grid roads, other free
   segments' footprints and water (its own segment's band always holds the
   kerb tile) and another parcel's claim, and its kerb chord — the distance between
   `kerb(s)` and the kerb point nearest its front-right corner — is at least
   `MIN_KERB_FRONTAGE_M` (10.7). Otherwise `s` advances 2 m and the cut is
   tried again; a stretch that never fits is verge.
4. **Spacing.** After a parcel stands at `s`, the next cut begins at `s + w`
   and advances further until its rectangle overlaps no standing parcel
   (inner bends), so no tile is claimed twice.
5. **Order.** The grid plat runs first and `streetAt` no longer counts a
   non-grid segment's cells as street, so a tile beside a curve gets a grid
   parcel only from a grid street; the curved plat skips every tile
   `parcelAt` already holds. The result is deterministic in segment id order.
   Slice 1 held both for the low-density residential zone only; slice 2
   holds them for every platted zone and both industrial zones, farmland
   aside.

The grid `Plat` gains `framed: FramedParcel[]` (`frame`, `lot`, `w`, `d`,
`tiles`), and `parcelAt` indexes them past the grid parcels, so the lens and
the spawner read one plat.

### Behaviour: a building stands in the frame

The spawner, on a framed parcel whose lot size and zone a kind takes, places
the kind with `frame` and `rotation 0` and the parcel's claimed tiles as its
footprint. The world's placement commands (`placeBuilding`, bulldoze, the
footprint flatten, the overlap check) gain a tile-set form the framed path
uses; the grid path keeps its rectangle. `flattenFootprint` levels the
claimed tiles as it levels a grid footprint (a bend's lots are a little
wider on the ground than their rectangle; slice 1 accepts that).

### Behaviour: the renderers compose from the frame

Every renderer that today computes `centerX = (x + w/2)·20` and turns by
`rotation·π/2` composes, for a framed building, `T(frame) · R_y(−heading) ·
T(local)` through `toWorld`. Seventeen such sites across twenty render files
turn on `rotation` today; slice 1 converted the ones on the low-density
house's path (body, parts, roof, lot, drive, car, walker) and slice 2 the
lot plan, car park, curb cut and stall cars of every other kind.
The facade material's window grid is computed in the body's local axes, so
it needs nothing. Picking raycasts instance matrices, so it needs nothing.
The lens draws a framed parcel's four corners through `toWorld`.

### What a framed lot keeps from the grid

The drive meets the kerb at `v = 0` of the frame by construction, square to
the road at the frontage's middle; the kerb's own curve departs from the
front edge by at most the chord's sagitta, 1.25 m at a 40 m radius for a 20 m
frontage, and the drive's last metres are drawn to the kerb sample nearest
its foot so the join reads flush. The front yard is the house kit's 7 m
setback, so width is measured at the building line as the codes measure it.

## What could go wrong

- **The seventeen rotation sites.** Converting them piecemeal risks a part
  drawn on the grid path under a framed body. The guard is one helper every
  site calls and a test per converted renderer that a framed building's
  parts land within its rectangle.
- **A turned parcel's tiles are not its rectangle.** A 20×40 m rectangle at
  30° holds one to three tile centres, and the tiles it claims stick out of
  it or fall short of it; zoning, services and land value read those tiles,
  and the readers keyed to a rectangle from the min tile (water use, service
  coverage, the restamp) read a grid box there. Accepted in slice 1 and
  visible on the lens.
- **Saves.** A version-17 save on a version-16 build must refuse, not stand
  framed houses on the grid; the loader already refuses a newer version.
- **Performance.** The grid plat is pure and recomputed per call today (the
  spawner memoises it per zone for one pass, the client per road-network
  version); the curved plat joins it under the same memo, and the client's
  key must also turn over when zoning or buildings change beside a curve,
  since a framed parcel depends on both. The centre claim tests a few dozen
  tile centres per parcel.
- **The grid's south and west frames are mirrored, not turned.** The house
  renderers' edge frame maps "along" and "outward" by axis flags, so a lot
  fronting south or west is the north layout reflected, not rotated. The
  general frame keeps that reflection as a mirror sign for grid lots, so no
  grid lot moves a pixel, and a framed parcel carries no mirror.

## Alternatives

- **Wedge parcels drawn as trapezoids.** Truer to a plat, but every kit is a
  rectangle and the sliver is lawn; rejected for now, noted in the design.
- **Turn the grid itself.** No: the grid is every system's address space.
- **Snap the curve's tiles to fake fronts.** That is what happens today, and
  it is the bug.

## How we will know it works

- `kerbLine` offsets every sample square to its tangent by the half width,
  and `headingAt` matches `leavingDirection` at both ends.
- `platAlongKerbs` on a straight non-grid segment at 30° cuts parcels end to
  end of the ladder's widths with no overlapping claims; on an outer bend of
  40 m radius the chords stay above 10.7 m; on an inner bend consecutive
  rectangles never overlap and the kerb gap is reported; nothing is cut
  within 6 m plus the junction half-width of a node; a tile the grid plat
  claims is never claimed again.
- `toWorld(frameOfGridLot(northParcel), u, v)` is the identity on a grid lot,
  and a frame at `heading π/2` turns `(u, v)` to `(−v, u)`.
- The spawner stands a house on a framed parcel with `frame` and `rotation
0`, claims the parcel's tiles, and bulldozing it frees them all.
- A save round-trips `frame`; a version-16 save loads with none.
- In the renderer, a framed house's body centre, its drive's kerb end and
  its roof all lie inside the frame's rectangle, and the drive's kerb end is
  within 1.3 m of the kerb line.

**What has to be looked at in a browser** (`tools/curve-shots.mjs`):

1. An S-bend street zoned low-density both sides, grown, from above: every
   house square to the street in front of it, drives meeting the kerb, the
   slivers on the outer bend reading as lawn.
2. Close on one drive at the bend: the drive meets the kerb flush, no gap,
   no overlap with the footway.
3. The same bend through the zoning lens: parcel outlines turned with the
   road, none crossing another.
4. A grid street beside the bend: its lots exactly as before.

## Slice 2: the rest of the ladder and the car parks

### The plat for every zone

`platOf` runs the kerb plat for every zone in `PLATTED_ZONES` and for the
two industrial zones, each by its own `lotsOfZone` ladder, and swaps
`gridStreetAt` in for all of them, so no zone plats a grid parcel against a
curve's crossed tiles any more. Farmland is untouched.

### A run of parcels

```ts
/** Consecutive framed parcels on one kerb a wide kind takes as one lot. */
export interface FramedRun {
  frame: ParcelFrame; // the first parcel's corner, the heading at the run's middle
  parcels: readonly number[]; // indices into Plat.framed, in kerb order
  w: number; // frontage, metres: the parcels' widths summed
  d: number; // the shallowest parcel's depth, metres
  tiles: TilePoint[]; // the union of the parcels' claims
}
```

`FramedParcel` gains `seg`, `side` and `s` (the kerb and arc length it was
cut at), so `runsAlongKerbs(plat, wM)` can walk each kerb's parcels in
order and return every run whose parcels abut end to end or stand at most
`MAX_RUN_GAP_M` (4 m, two cut steps, the gap an inner bend's no-overlap
spacing leaves) apart, whose widths sum to `wM` and whose first and last
headings differ by at most `MAX_RUN_BEND_RAD` (8°). A building on a run stands in the run's frame and
claims `claimedTiles(run.frame, wM, dM)`, the tiles of its own rectangle,
as every framed building does (the registry, the worker and the mirror
derive a framed building's tiles from its frame and footprint, never from
a list); `run.tiles`, the union of the parcels' claims, is the set the
spawner checks is free, and a tile of the rectangle outside the run must
be zoned, unparcelled and placeable, which is how a kind deeper than its
lots runs into the ground behind.

### The spawner

`trySpawnFramed` gains the lot-less branch: for a framed parcel in a zone
whose kinds have no `lot`, the candidates are the zone's kinds whose
unturned frontage `footprint.w` × 20 equals the parcel's width (one-parcel
kinds) or is met by a run starting at that parcel, drawn by the same
`share` as on the grid; a kind is placed with `frame` = the run's frame,
rotation 0, `x, z` = the min tile of the claimed set, and the claimed set
as its footprint. The dense residential kinds take their lots the same way.
The parking gate for a framed lot reads `lotLayoutFor(entry, 0, true,
kerbCredit)` with the credit below; it has a frontage by construction.

### Car parks in the frame

`lotPlanFor` (the kit renderer's lot plan) and the curb cut, aisles and
berths it draws are already computed for a north-fronting lot in local
metres; for a framed building the renderer places them through
`edgeFrameOfParcel(building.frame)` instead of the building's tile corner
and quarter turn, the one helper `framedBodyPlacement` already uses.
`parked.ts` reads the same frame for the cars in the stalls.

### The kerb credit from a free road

`kerbCreditFor` today counts painted kerb stalls on the grid road along the
lot. For a framed lot `kerbCreditAlongFrame(net, frame, wM, profileOf)` in
`src/world/kerbcredit.ts` finds the segment under the frame's kerb and the
side of travel the lot lies on, and `kerbCreditOnSection` in
`kerblayout.ts` credits `floor(wM / PARKING_STALL_LENGTH_M)` stalls where
that side's profile carries a parking lane (`parkingLaneOffset`), zero
where none does. The helper lives in `src/world` because it reads the road
network; `src/shared` imports nothing above it.

### The readers

`cityWaterUse`, `sewageOf` and `footprintServed` take the building's
standing tiles (`standingTiles`) instead of `x, z, w, d`; the dirt-road
well rule reads "a main beside any standing tile". `restampShrunkPloppables`
never touches a framed building (ploppables are never framed).
`driveRoadTiles` on a framed home returns the road tiles under its drive's
cut, found by `toWorld` on the cut's rectangle, so the lamp set keeps a
lamp off the drive mouth.

### How we will know it works

- `platOf` cuts framed parcels for every platted zone and both industrial
  zones beside a curve, and cuts no grid parcel against a curve's cells.
- `runsAlongKerbs` on a 30° straight returns runs of two and three normal
  lots end to end; on a 40 m bend returns none wider than one lot.
- A 2×2 strip mall spawns on a run with `frame`, rotation 0 and the union
  of its parcels' tiles; its car park's curb cut lies on the kerb line.
- A framed lot beside a free road with a parking lane earns the stall
  credit its frontage holds; beside one without, none.
- `cityWaterUse` over a framed house's standing tiles equals the grid
  figure for the same entry; a framed house beside a dirt main is on the
  main.
- The lamp placements skip the tiles under a framed drive's cut.

**In the browser** (`tools/curve-shots.mjs`, extended): the S-bend zoned
low commercial on one side and medium residential on the other, grown: a
shop with its car park and curb cut square to the road, a strip on a run,
a walk-up; the bend through the lens with runs' parcels outlined; a street
lamp beside a framed drive standing clear of it.

## Out of scope

Cul-de-sac bulbs, wedge-shaped parcels, and parcels on grid streets.
