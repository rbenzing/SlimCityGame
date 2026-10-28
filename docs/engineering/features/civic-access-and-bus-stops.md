# Civic access and bus stops — technical design

- **Status:** Built 2026-10-28 (agreed 2026-10-27)
- **Date:** 2026-10-27
- **Author:** Claude Fable 5.1

The design is
[../../game-design/features/civic-access-and-bus-stops.md](../../game-design/features/civic-access-and-bus-stops.md),
which owns the rules and their sources; this owns how the code gets there.

## What we are building, and why now

A bus stop is the catalog ploppable `bus-stop` (`src/data/catalog.json`,
category `transit`, 1×1), placed by the generic ploppable tool onto a tile
beside a road and drawn by `computeBusStopLayout` in
`src/render/utilitykits.ts` as a pad, shelter, sign and bin set back from
the kerb; a transit line's stop is a `TilePoint` the route computer snaps
to the network. A tram stop is already the other thing: a point on the
track tile with a shelter drawn from `src/render/busshelter.ts` and no
land taken. Slice 1 makes the bus stop that thing too, with a kind, a side
and money. Slice 2 gives every hand-placed civic lot the drive the grown
lots have, through the lot layout `parking-to-code` already lays
(`lotLayoutFor` in `src/shared/lotparking.ts`), gated today to commerce and
industry by `lotParkingRequirement` in `src/shared/parkingcode.ts`.

## What it touches

| Module                                                                     | Slice | Change                                                                                                                                  |
| -------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                                                      | 1     | `BusStop { x, z, side: 0 \| 1, kind: 'sign' \| 'shelter' }`; `Command` `placeStop` / `removeStop`; `SimSnapshot.stops`, boardings |
| `src/data/catalog.json`                                                    | 1     | `bus-stop` becomes the shelter (name "Bus shelter"); `bus-stop-sign` added at ₵2 / ₵0; neither has a footprint tile of its own          |
| `src/sim/stops.ts` (new)                                                   | 1     | The stop registry: place, remove, lookup by tile and side, boardings a day, the shelter warrant, save and restore                       |
| `src/sim/transit.ts`                                                       | 1     | A line's stops are street tiles holding a stop; per-stop boardings kept from `estimateRidership`'s summands; removing a stop edits lines |
| `src/sim/economy.ts`                                                       | 1     | Shelter upkeep and advertising income lines                                                                                             |
| `src/sim/worker.entry.ts`                                                  | 1     | `cmdPlaceStop`, `cmdRemoveStop`, the save migration of `bus-stop` buildings                                                             |
| `src/tools/tools.ts`                                                       | 1     | `plop.bus-stop-sign` and `plop.bus-stop` snap to a street tile and side; the transit line tool picks stops                              |
| `src/render/busstops.ts` (new), `utilitykits.ts`, `busshelter.ts`          | 1     | Stops drawn as road furniture from the tile's profile; the pad, pole, shelter and bin pools; the ghost                                  |
| `src/ui` inspector, budget                                                 | 1     | Boardings a day, "warranted", the advertising line                                                                                      |
| `src/shared/parkingcode.ts`, `lotparking.ts`, `lotlayout.ts`               | 2     | A civic access requirement: drive width, apron, bus loop, access point per kit                                                          |
| `src/render/buildingkit.ts`, `ploppables.ts`, `utilitykits.ts`             | 2     | The civic drive and curb cut drawn from the lot plan to the kit's access point                                                          |
| `tools/busstop-shots.mjs`, `tools/civic-access-shots.mjs` (new)            | 1, 2  | Stops on a kerbed street and a gravel road, a sign and a shelter; a fire station, a school, a clinic and a depot with their drives     |

## The design

### Data: a stop

```ts
/** A bus stop: road furniture on one side of a street tile. */
export interface BusStop {
  x: number;
  z: number;
  /** Which side of the tile's road axis, 0 the low side, 1 the high side. */
  side: 0 | 1;
  kind: 'sign' | 'shelter';
}
```

Stops live in a registry on the worker (`src/sim/stops.ts`), keyed by
`tile × 2 + side`, serialised as a list beside `transitLines` in the save's
meta (`payload.meta.busStops`); a save without it loads with none. The
registry is additive data, so `SAVE_VERSION` does not move. A transit line's
`stops: TilePoint[]` keeps its shape and now names the street tile a stop
stands on; the route computer's snapping already takes a point on a run.

### Behaviour: placement

`plop.bus-stop-sign` and `plop.bus-stop` are ploppable tool ids whose entry
has no footprint tile: the tool finds the nearest street tile within one
tile of the pointer (`isStreetTier`, not a junction by the road mask, not a
motorway or ramp, not rail, not a tram reservation) and the side by the
sign of the pointer's offset from the road axis (`parkingLaneOffset`'s
low/high convention), and ghosts the furniture there. `placeStop` refuses a
tile and side that already holds a stop unless the new kind is the shelter
over a sign, which is the upgrade at the price difference. `removeStop`
takes the stop off every line that names its tile when no stop remains on
that tile, and the bulldozer over a stop issues it. Both commands return
their inverse.

### Behaviour: the stop on the tile

`busStopPlacement(stop, profile)` in `src/render/busstops.ts` is the one
function that lays the furniture, in the tile's road frame (the road axis
along, the side's normal out): the kerb face at the carriageway's edge, its
half width; on a tile whose profile has a `sidewalk` piece the pad begins
at the footway's outer edge (kerb face plus `sidewalkDepthMeters`) and runs
2.44 m beyond it, 3.66 m along, centred on the tile, so the footway stays
clear; the pole at the pad's road-side edge at its leading end in the
road's flow direction; the shelter (`BUS_SHELTER` from `busshelter.ts`)
along the back of the pad facing the road; the bin at the pad's trailing
end. On a tile with no `sidewalk` piece the pad's near edge is the kerb
reserve's outer edge, up to the road, and the pole, shelter and bin stand
on it the same way. The
pools are the shelter's existing one and three new instanced pools (pad,
pole, bin); the pads conform to the terrain like the lot pads.

### Behaviour: riders and money

`estimateRidership` already sums `nearbyPopulationJobs(stop)` a stop; the
summand per stop, times the line's rate and its length bonus, is that
stop's boardings a day for that line, and the registry sums it over lines
on the cadence the transit system ticks. A shelter whose boardings reach
`SHELTER_WARRANT_BOARDINGS` (25) is warranted; `economy.ts` charges every
shelter its upkeep and pays `SHELTER_AD_INCOME` (₵7) a month for each
warranted one, as an income line "advertising". A sign costs and earns
nothing. The snapshot carries each stop's boardings and warrant for the
inspector.

### The save migration

On load, every building with `catalogId === 'bus-stop'` is removed from
the registry, its tile freed, and a shelter stop placed on the street tile
it fronts (the road-facing edge by `findRoadFacingEdge`; failing that, the
nearest street tile within one tile) on the side facing the old tile; lines
naming the old tile are rewritten to the street tile. A building with no
street in reach is dropped, and the loader logs it.

### Slice 2: the civic drive

Every civic kit already draws its own apron, yard, drive, canopy or
forecourt inside its footprint (`src/render/utilitykits.ts` holds all 37
civic kits; the airport is a landmark). What none of them has is the way
from the footprint's front edge over the verge and the footway to the
carriageway. So the civic access is a **crossing**, the one thing the kits
share, and each kit declares where along its front it wants one:

```ts
/** Where a civic kit's front edge meets the street, in local metres from its front-left corner. */
export interface CivicAccess {
  spans: readonly {
    u0: number;
    u1: number;
    /** A vehicle crossing (7.3 m two-way, a fire apron the bays' width) or a 1.8 m walk. */
    kind: 'drive' | 'apron' | 'walk';
  }[];
}
```

`CIVIC_ACCESS_BY_ID` in `src/shared/civicaccess.ts` names every civic
catalog id (a test mirrors `UTILITY_KIT_CATALOG_IDS` plus the airport so
none is missed): a fire station's apron the width of its bays, a works or
depot's drive at its gate, a hospital's and a clinic's drive at the
porte-cochère plus a walk at the door, a school's drive at its loop and a
walk at the entrance, a library's and a station's walk and drive, a park's
walk at its entrance, a cemetery's drive at the gatehouse. A shore kit
(water tower, turbine, pump, drain, sewage works) declares its spans on
its land side. The lot renderer lays each span from the footprint's front
edge to the carriageway as the house drive's cut is laid (verge then
footway, concrete, `CIVIC_DRIVE_WIDTH_M` 7.3 for a drive, the span's width
for an apron, 1.8 m for a walk) on the frontage the building faces, with
the curb cut the commercial lot draws; `curbCutTileFor` covers the civic
cuts so lamps and kerb furniture keep off them. A kit whose apron stops
short of its front edge is extended to it. An entry with no street along
its front draws nothing, as nothing grows there. A deeper fire apron or a
school bus loop inside a footprint that cannot hold one is a kit follow-up,
not this slice.

## What could go wrong

- **A stop's tile and a line's stop drift apart.** The registry is the one
  owner: a line may only name a tile that holds a stop, checked on commit
  and on load, and removing the last stop on a tile edits the lines.
- **Two stops on one tile.** One a side, the ghost refuses the second.
- **Old saves.** The migration runs once, before the transit restore, so
  lines are rewritten against stops that exist.
- **A kit with no sensible access point.** The registry has an entry for
  every civic catalog id or the build fails a test that lists them.

## Alternatives

- **Keep the stop a building and shrink it.** It would still take a tile
  and still stand off the footway; rejected.
- **One stop kind with an upkeep toggle.** The sign's point is that it is
  cheap to put everywhere; two entries at their real prices say that.

## How we will know it works

- `busStopPlacement` puts the pad's near edge on the kerb face, the pole
  0.46 m out, the shelter's front 0.9 m out, on a kerbed two-lane and on a
  gravel road with no footway, on both sides.
- `placeStop` refuses a junction tile, a motorway, rail and a taken side;
  upgrades a sign to a shelter; `removeStop` takes a tile off its lines.
- A shelter with 25 boardings a day earns ₵7 and one with 24 earns none; a
  sign earns and costs nothing.
- A version-17 save with two `bus-stop` buildings loads with two shelter
  stops on the street tiles they fronted and their tiles free.
- `civicAccessFor` names an access for every civic catalog entry; a fire
  station's apron spans its bays 14 m deep; a clinic's drive is 7.3 m wide
  and its curb cut on the kerb line.

**In the browser** (`tools/busstop-shots.mjs`, `tools/civic-access-shots.mjs`):
a sign and a shelter on a kerbed street, close; the same on a gravel road;
a stop on each side of one tile; a fire station's apron, a school's bus
loop, a clinic's drive and a depot's gate drive from above.

## Out of scope

Bus bays, bulb-outs, stop spacing, civic car-park sizing, rail stations
and tram stops.
