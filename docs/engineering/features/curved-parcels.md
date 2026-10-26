# Parcels follow the street — technical design

- **Status:** Agreed 2026-10-23
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
| `src/world/roadgeom.ts`                                                                  | 1     | `kerbLine(g, side, halfWidthM)`: the centre samples offset square to the tangent; `headingAt(g, t)`                                    |
| `src/sim/growth.ts`                                                                      | 1     | a framed parcel spawns a building with `frame`, its claimed tiles as its footprint                                                     |
| `src/world/grid.ts` / `src/sim/worker.entry.ts`                                          | 1     | place, bulldoze, flatten and overlap over a claimed tile set; registry serialises `frame`                                              |
| `src/app/clientgrid.ts`                                                                  | 1     | the mirror keeps each framed building's claimed tiles and frame                                                                        |
| `src/render/buildings.ts`                                                                | 1     | a framed body composes from its frame (heading) instead of a quarter turn                                                              |
| `src/render/houselot.ts`, `buildingkit.ts`, `houses.ts`, `houseroofs.ts`, `roofprops.ts` | 1     | house parts, drive, walk, garage, yard and roof laid in the frame                                                                      |
| `src/render/parked.ts`, `pedestrians.ts`                                                 | 1     | the car on the drive and the walker's home anchor read the frame                                                                       |
| `src/render/zonegrid.ts`                                                                 | 1     | the lens draws a framed parcel's outline turned                                                                                        |
| `tools/curve-shots.mjs` (new)                                                            | 1     | an S-bend zoned both sides, shot from above, close on a drive, and through the lens                                                    |
| `src/shared/lotparking.ts`, `lotlayout.ts`, kit renderers for the other kinds            | 2     | car park, curb cut, aisles and berths in the frame; kerb credit from the free road's section along the frontage                        |

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
   square to the tangent by the road's half width (`kerbLine`); arc length
   `s` runs along it.
2. **Clearance.** `s` starts at the node's junction half-width plus the
   drive's corner clearance, 6 m, and stops the same short of the far node.
3. **Cutting.** At `s`, the parcel's size comes from the ladder on the land
   value under the tile at the kerb point (the grid plat's own rule); its
   frame is `{ kerb(s), heading(s + w/2) }`; its rectangle is `[0, w] ×
[0, d]` in that frame. The parcel claims every tile its rectangle
   overlaps (polygon-against-tile, exact, no sampling). It stands only if
   every claimed tile is zoned `zone`, free of buildings, roads, water and
   another parcel's claim, and its kerb chord — the distance between
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
turn on `rotation` today; slice 1 converts the ones on the low-density
house's path (body, parts, roof, lot, drive, car, walker) and leaves the rest
on the grid path, since no other kind is platted on a curve until slice 2.
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
- **Tiles claimed on a bend's outside are more than the lot.** A 20×40 m
  rectangle at 30° overlaps 5 to 6 tiles instead of 2; zoning, services and
  land value read those tiles. Accepted in slice 1 and visible on the lens.
- **Saves.** A version-17 save on a version-16 build must refuse, not stand
  framed houses on the grid; the loader already refuses a newer version.
- **Performance.** The curved plat is per segment and cached by segment id
  and the zone's change counter, recomputed only when a segment or the zone
  beside it changes; the polygon-tile claim is a few dozen tiles per parcel.

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

## Out of scope

Slice 2 (the rest of the ladder and the car parks), cul-de-sac bulbs,
wedge-shaped parcels, and parcels on grid streets.
