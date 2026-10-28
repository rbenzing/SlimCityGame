# Parcels follow the street

- **Status:** Built

**Owns:** how a parcel stands beside a free-form (curved) street: the kerb plat, the parcel frame, runs of parcels for wide kinds, how buildings, lot plans and car parks are laid in the frame, and the readers keyed to claimed tiles. The lot ladder and its standards are [lots-and-land.md](lots-and-land.md); grid lots are untouched.

**Rules:**

- A parcel beside a free-form street has a frame: a north-fronting grid lot moved to the kerb and turned to the road's heading. A building on it carries `frame` and rotation 0. `[R-world-040]`
- A parcel claims every tile whose centre lies in its rectangle; those tiles are its footprint for every tile-keyed reader. `[R-world-040]`
- Compose every renderer through the one frame transform, never a building's own centre and quarter turn. A grid lot's frame is the identity. `[R-world-040]`
- Cut the plat along the kerb by the zone's own ladder; skip any stretch reaching a grid road, a junction's clearance, water, another parcel or unzoned tile. `[R-world-039]`
- Keep every parcel's kerb chord at 10.7 m or more, widening an outer-bend parcel along the kerb; space inner-bend parcels so no two overlap.
- A kind wider than a lot takes a run of consecutive parcels, only where the road between its ends bends 8° or less.
- A building with no frame is a grid building and nothing about it changes. `[R-world-040]`

**Numbers:** the standards are in [the sources](../sources/curved-parcels.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `MIN_KERB_FRONTAGE_M` | 10.7 (35 ft) | m | [Provo UT, Midvale UT](../sources/curved-parcels.md); Fowler MI and Corry PA 40 ft |
| Junction clearance | 6 m (the drive's 20 ft corner clearance), plus the junction half-width | m | [Minneapolis](../sources/curved-parcels.md) |
| Cottage lot | 20 m wide at the building line, 20 m deep (1×1) | m | [lots-and-land.md](lots-and-land.md) |
| Normal lot | 20 m, 40 m deep (1×2) | m | same |
| Large lot | 40 m, 40 m deep (2×2) | m | same |
| Estate lot | 40 m or 60 m, 60 m deep (2×3, 3×3) | m | same |
| Building line | 7 m in from the kerb (the house kit's front yard) | m | dial |
| Minimum side line | at right angles or radial to the street | — | [Corry PA, Dunes City OR](../sources/curved-parcels.md) |
| Frontage floor in the codes | 35 ft outer curve or bulb; 50 ft minimum width at the building line | ft | [Fowler MI, Salina KS](../sources/curved-parcels.md) |
| Cut advance when a cut does not fit | 2 m | m | dial: `SAMPLE_STEP_M` cut step |
| `MAX_RUN_GAP_M` | 4 (two cut steps) | m | dial: the gap an inner bend leaves |
| `MAX_RUN_BEND_RAD` | 8° | degrees | dial: a 60 m frontage leaves its parcels by 1 m at most |
| Chord sagitta | 1.25 at a 40 m radius for a 20 m frontage | m | geometry |
| Drive kerb end | within 1.3 m of the kerb line | m | test bound |
| Render rotation sites converted | seventeen, across twenty render files | sites | audit |
| Kerb credit | `floor(wM / PARKING_STALL_LENGTH_M)` stalls where the side has a parking lane, else 0 | stalls | [parking-to-code.md](parking-to-code.md) |
| `SAVE_VERSION` | 17 (a version-16 save loads with every building unframed) | — | `src/shared/types.ts` |

**Code:**

- `src/shared/types.ts` `ParcelFrame`, `BuildingInstance.frame`, `SAVE_VERSION`: the frame and its save.
- `src/shared/lotframe.ts` `toWorld`, `toLocal`, `frameOfGridLot`, `frameCorners`, `claimedTiles`: the one transform every reader uses.
- `src/shared/roadgeom.ts` `kerbLine`, `headingAt`: the kerb offset square to the tangent; the heading.
- `src/world/plat.ts` `platAlongKerbs`, `Plat.framed`, `streetAt`, `runsAlongKerbs`, `FramedRun`, `parcelAt`: the kerb plat, framed parcels, runs; `streetAt` ignores non-grid cells.
- `src/world/kerbcredit.ts` `kerbCreditAlongFrame`: the kerb credit from a free road's section.
- `src/shared/kerblayout.ts` `kerbCreditOnSection`, `parkingLaneOffset`: stalls credited where the profile has a parking lane.
- `src/shared/lotparking.ts` `lotLayoutFor`: the parking gate for a framed lot.
- `src/shared/roadedge.ts` `findRoadFacingEdge`: the grid road search a framed lot bypasses.
- `src/sim/growth.ts` `trySpawnFramed`, `frontagePlacement`: a framed parcel spawns a building with `frame`; the lot-less branch.
- `src/sim/network.ts`: `cityWaterUse`, `sewageOf`, `footprintServed` over standing tiles.
- `src/world/grid.ts`, `src/sim/worker.entry.ts`: place, bulldoze, flatten and overlap over a claimed tile set; the registry serialises `frame`.
- `src/app/clientgrid.ts`: the mirror keeps each framed building's claimed tiles and frame.
- `src/render/buildings.ts` `framedBodyPlacement`: a framed body composes from its frame.
- `src/render/frontage.ts` `edgeFrameOfParcel`, `findStreetFacingEdge`: the frame the lot planners use.
- `src/world/plat.ts` `platOf`: runs the kerb plat for every zone in `PLATTED_ZONES` and both industrial zones by each `lotsOfZone` ladder, with `gridStreetAt` swapped in for `streetAt`; a `FramedParcel` carries `seg`, `side` and `s`.
- `src/shared/roadgeom.ts` `segmentHalfWidthM`: the kerb offset, footways included.
- `src/sim/growth.ts` `placeBuilding` (world command, `zone` and `rotation` 0 on a framed parcel): the lot-less spawn draws by `share`; `runsAlongKerbs(plat, wM)` returns the runs a frontage `wM` takes.
- `src/render/buildingkit.ts` `lotPlanFor`: the lot plan placed through the frame; `src/world/kerbcredit.ts` replaces `kerbCreditFor`'s grid count for a framed lot.
- `src/sim/network.ts` `standingTiles`: the tiles water, sewage and service readers use instead of `x, z, w, d`.
- `kerblayout.ts` and `growth.ts`: the credit and the spawner named above.
- `src/render/houselot.ts`, `buildingkit.ts`, `houses.ts`, `houseroofs.ts`, `roofprops.ts`: house parts, drive, walk, garage, yard, roof, car park and curb cut in the frame; `driveRoadTiles` keeps a lamp off the drive mouth.
- `src/render/parked.ts`, `pedestrians.ts`: the car on the drive and the walker's home anchor read the frame.
- `src/render/zonegrid.ts`: the lens draws a framed parcel's outline turned.
- `tools/curve-shots.mjs`: an S-bend zoned, shot from above, close on a drive, and through the lens.

**Tests:**

- `src/shared/lotframe.test.ts` — `toWorld` of a grid lot's frame is the identity; a frame at heading π/2 turns `(u, v)` to `(−v, u)`.
- `src/shared/roadgeom.test.ts` — `kerbLine` offsets square to the tangent; `headingAt` matches `leavingDirection` at both ends.
- `src/world/plat.kerbs.test.ts` — a 30° straight cut end to end with no shared claims; outer-bend chords above 10.7 m; inner-bend rectangles never overlap; nothing within the junction clearance; runs of two and three lots on a straight, none wider than one on a 40 m bend.
- `src/sim/growth.test.ts` — a house spawns on a framed parcel with `frame` and rotation 0, claims its tiles and frees them on bulldoze; a save round-trips `frame`.
- `src/render/frontage.test.ts`, `src/render/houselot.test.ts`, `src/shared/kerblayout.test.ts` — a framed building's body, drive kerb end and roof lie in the frame's rectangle; the kerb credit follows the parking lane.
- Browser check, `tools/curve-shots.mjs` — an S-bend zoned both sides from above, close on a drive, through the lens, with a grid street beside it unchanged.

**Open:**

- Beside a curve an industrial box can still grow on verge tiles outside any framed parcel, since industry has no frontage rule on the grid.
- A framed building never levels up into a larger footprint.
- A framed lot that lays no car park still reads its kerbside allowance from grid edges.

## Why the rules are what they are

### What the player gets

Zone beside a curved street and lots come out the way a plat draws them: each parcel square to the road where it fronts it, its side lines running back at right angles, its house facing the street with a drive down to the kerb. A bend reads as a bend of houses, not a staircase of boxes with their backs to the road. The lot ladder runs along a curve as along a grid street, and a shop or a plant on a curve lays its car park and curb cut square to the road too.

Before this a parcel was a rectangle of whole tiles fronting north, east, south or west, a grown building turned through 0° or 90° only, and a drive or car park looked for a grid road tile on one side. Beside a free-form road none of that found the road. The tiles the curve crosses counted as street, so lots were platted against them tile by tile, each facing the nearest grid side. The result: buildings at 30° to the street they face, square lots on a bend, and no drive. Every lot rule was right and none reached the curve.

### Parcels on the tile

The ladder keeps its sizes, because the kits are built for them and a bend changes nothing about how big a lot a household buys. A parcel on a curve is that rectangle, stood square to the road at the point it fronts, measured at the building line. The radial wedge the codes would add on an outer bend, or take on an inner one, is not part of the parcel: the sliver is open ground, as a pie lot's side strip is lawn nobody builds on.

On an inner bend the rectangles' backs converge, so parcels are spaced along the kerb far enough apart that none overlap; the gap at the kerb is verge. The kerb frontage floor is the one figure that moves a parcel along the road. The sizes come from the ladder and are not re-tuned here.

### The plat runs along the kerb

When a free-form segment gains a zonable side, the plat walks that side's kerb from the segment's start to its end, cutting parcels end to end by the grid plat's own ladder: the land value under the parcel picks its size. A stretch shorter than a cottage's width is left as verge. `platAlongKerbs` runs after the grid plat, over free-form segments only, both sides, each only where the zone lies within the zoning depth of that kerb.

1. **The kerb line** is the centre line sampled and offset square to the tangent by the road's half width, footways included, so it is the right-of-way edge where a lot line sits.
2. **Clearance.** Cutting starts at the node's junction half-width plus the 6 m corner clearance and stops the same short of the far node.
3. **Cutting.** At arc length `s` the size comes from the land value under the tile at the kerb point. The frame is the kerb point with the heading at the frontage's middle; the rectangle is `[0, w] × [0, d]` in it.
4. **Standing.** A parcel stands only if every claimed tile is zoned, free of buildings, grid roads, other free segments' footprints, water and another parcel's claim, and its kerb chord is at least 10.7 m. Its own segment's band always holds the kerb tile. Otherwise `s` advances 2 m and the cut is tried again; a stretch that never fits is verge.
5. **Spacing.** After a parcel stands, the next cut begins at `s + w` and advances until its rectangle overlaps no standing parcel.
6. **Order.** The grid plat runs first and `streetAt` no longer counts a free segment's cells as street, so a tile beside a curve gets a grid parcel only from a grid street. The curved plat skips every tile `parcelAt` already holds. The result is deterministic in segment id order, for every platted zone and both industrial zones, farmland aside.

The grid `Plat` gains `framed` parcels (`frame`, `lot`, `w`, `d`, `tiles`), and `parcelAt` indexes them past the grid parcels, so the lens and the spawner read one plat. A parcel's frontage at the kerb is the chord between its two front corners; on an outer bend under 10.7 m it is widened along the kerb until it is.

### The frame, and why claiming by centre

A framed parcel is a grid lot fronting north, rotated. A grid parcel with `front: 'N'` at tile `(x, z)` is the identity frame: local `u` runs east along the street, local `v` runs south into the lot, the street at `v = 0`. Every layout the game computes for a north-fronting lot is a layout in `(u, v)`, and `toWorld` is a rotation and a translation.

A framed building carries `frame` and rotation 0; its `x, z` stay the min tile it claims, so every tile-keyed reader sees it where it is. A building with no `frame` is a grid building.

Centres partition the tiles between rectangles that do not overlap, so parcels stand end to end at any angle. An exact overlap test would make every pair of neighbours share the tiles their common side line crosses and leave half a street empty. A parcel that holds no centre is not cut. The world's one rule, a tile holds one building, holds unchanged, while power, water, services and road frontage walk the tiles as before.

The parcel's front line is the edge of the right of way, the back of its footway, where a plat draws a lot line. The drive crosses the footway to the carriageway as it does from a grid lot, and meets the kerb square at the parcel's frontage.

The south and west grid frames are mirrored, not turned: the house renderers map "along" and "outward" by axis flags. The general frame keeps that mirror sign for grid lots, so no grid lot moves; a framed parcel carries no mirror.

Saves: `frame` rides in the registry's JSON. The version bump makes an older build refuse a save it would stand on the grid wrongly; an older save loads with every building unframed. The loader already refuses a newer version.

### A building stands in its frame

A building on a curved parcel is placed as on a grid lot: at the parcel's front, set back its front yard, facing the street. The street is the parcel's own front edge, so it is turned by the road's heading rather than a quarter turn. The drive, walk, yard and trees, car park and curb cut, and loading berths are laid in the parcel's frame, then turned with it. Beside the kerb the lot's lens outline is drawn turned too, so the player sees the lots before anything grows.

- The world's placement commands gain a tile-set form the framed path uses; the grid path keeps its rectangle. `flattenFootprint` levels the claimed tiles, though a bend's lots are a little wider on the ground than their rectangle.
- Every renderer that computed `centerX = (x + w/2)·20` and turned by `rotation·π/2` composes a framed building through `toWorld`: seventeen sites across twenty render files. The facade's window grid is in the body's local axes and picking raycasts instance matrices, so those need nothing.
- Converting sites piecemeal risks a part drawn on the grid path under a framed body. The guard is one helper every site calls, and a test per renderer that a framed building's parts land within its rectangle.
- The renderers keyed to a rectangle from the min tile read a grid box over a turned parcel's tiles. This is visible on the lens and accepted.
- The memo: the curved plat joins the grid plat's per-pass memo, and the client's key turns over when zoning or buildings change beside a curve, since a framed parcel depends on both.

### The rest of the ladder takes the same kerb

A shop, plant, walk-up or tower on a curve stands in a framed parcel as a house does. The kerb plat cuts every zone but farmland by the zone's own ladder: normal lots in dense and commercial zones, a corner shop's half lot in low commercial, every size by land value elsewhere. A kind one lot wide stands in one parcel.

A kind wider than a lot takes a run (`FramedRun`) of consecutive parcels on one kerb, whose frontages add up to its width. It stands in the run's one frame: the first parcel's corner and the heading at the run's middle. A parcel records its segment, side and arc length so `runsAlongKerbs` can walk each kerb's parcels in order.

- On an inner bend a run bridges the spacing gap, up to 4 m, as a strip's frontage runs over the verge strip between two lots; the ground under the gap is checked as the lot behind is.
- A run is allowed only where the road between its ends bends 8° or less, so its one rectangle never leaves its parcels by more than a metre. On a tighter bend only kinds one lot wide grow, which is what a tight bend holds in a real town.
- A building on a run claims the tiles of its own rectangle. `run.tiles`, the union of the parcels' claims, is the set the spawner checks is free; a rectangle tile outside the run must be zoned, unparcelled and placeable, which is how a kind deeper than its lots runs into the ground behind.
- Where the kind is shallower than its lots the rest is its yard.

The spawner's lot-less branch takes the zone's kinds whose unturned frontage `footprint.w` × 20 equals a parcel's width, or is met by a run starting there, drawn by the same share as on the grid. The dense residential kinds take lots the same way. The parking gate reads the kerb credit below.

### Car parks and the kerb credit

The lot plan and the curb cut, aisles and berths it draws are computed for a north-fronting lot in local metres. A framed building places them through `edgeFrameOfParcel(building.frame)`, the one helper `framedBodyPlacement` uses, so the curb cut meets the kerb square to the road. `parked.ts` reads the same frame for the cars in the stalls.

The kerb credit a lot earns from on-street parking along its frontage is read from the free road's own cross-section: one stall per stall length of frontage where a kerb parking lane runs, none where the section has none. The helper lives in `src/world` because it reads the road network; `src/shared` imports nothing above it.

### The readers

Water use, sewage and service coverage take a framed house's standing tiles, the ones its parcel claims, as every tile-keyed reader does. The dirt-road well rule reads "a main beside any standing tile". `restampShrunkPloppables` never touches a framed building, since ploppables are never framed. A street lamp keeps off its drive mouth as it keeps off a grid drive.

### What the player sees

A row of houses on a bend, each square to the street in front of it, with drives meeting the kerb. On an outer bend a little more lawn between them, on an inner bend a little less. The inspector names the lot as on a grid street. A shop on a curve has its car park square to the road and its curb cut on the kerb. Nothing on a grid street changes.

## Decided

- Rectangular parcels in a frame, over wedge parcels drawn as trapezoids: every kit is a rectangle and the sliver is lawn.
- Keep the grid as every system's address space, over turning it.
- Replace snapping a curve's crossed tiles to fake fronts: that was the bug.
- Cul-de-sac bulbs are nodes and are not cut; parcels run along segments.
- A parcel is cut shorter and dropped if it falls under a cottage, never bent, and never crosses a grid road or a segment end.
- Kits are unchanged and composed with a heading instead of a quarter turn ([building-types.md](building-types.md), [building-detail.md](building-detail.md)).
- The kerb plat reads a segment's centre line and width; zoning depth is still measured square to the road from the kerb ([road-network.md](../world-sim/road-network/README.md)).
