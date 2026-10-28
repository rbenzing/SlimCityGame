# Civic access and bus stops

- **Status:** Built

**Owns:** the bus stop as road furniture on one side of a street tile (kind, side, pad, ad income, warrant, save migration), and the crossing every civic building lays from its front edge to the carriageway. Parking to code is [parking-to-code.md](parking-to-code.md); lots are [lots-and-land.md](lots-and-land.md).

**Rules:**

- Place a bus stop as furniture on a street tile and side, never as a building taking land: a sign or a shelter on a pad at the footway's outer edge, or up to the road where there is no footway. `[R-roads-037]`
- Refuse a stop on a junction tile, a motorway, a ramp, rail, a tram reservation, or a side already holding one. `[R-roads-037]`
- A bus line names only tiles that hold a stop; removing the last stop on a tile takes the tile off every line. `[R-roads-037]`
- A shelter with 25 boardings a day is warranted and earns its ad income; a sign costs and earns nothing. `[R-roads-037]`
- Show none of the zoning grid, tint or plat for a stop tool, which takes no land. `[R-world-041]`
- Give every civic catalog id a declared access, and lay its crossing from the footprint's front edge over verge and footway; a kit with no street along its front draws nothing. `[R-render-022]`
- Keep the civic crossing's cut tiles clear of lamps and kerb furniture. `[R-render-022]`

**Numbers:**

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Boarding pad, deep by along the kerb | 2.44 by 3.66 (96 by 60 in, 8 ft by 5 ft) | m | [pad](../sources/civic-access-and-bus-stops.md#the-boarding-pad) |
| Pole and vertical elements off the kerb face | 0.46 (18 in) | m | same |
| Shelter path to the kerb | 0.9 (3 ft) | m | same |
| Bus stop sign: cost, upkeep, income | ₵2, ₵0, none | ₵ | [sign against shelter](../sources/civic-access-and-bus-stops.md#sign-against-shelter) |
| Bus shelter: cost, upkeep | ₵150, ₵10 | ₵, ₵ a month | same |
| Real cost ratio sign to shelter | 1 to 83 | ratio | same |
| `SHELTER_AD_INCOME` | 7 | ₵ a month | same; seven tenths of upkeep |
| `SHELTER_WARRANT_BOARDINGS` | 25 (suburb; 40 downtown) | boardings a day | same |
| Real sign cost, with install | $296 + $126 | $ | same |
| Real shelter cost; upkeep | $30,000–40,000; $4,000–7,000 a year | $ | same |
| Real shelter ad income; monthly upkeep | $100–300 a month or 15–35% of gross; $417 | $ | same |
| Stop clearance from a crossing | 90 far side, 100 near side (40 ft bus) | ft | [where a stop may stand](../sources/civic-access-and-bus-stops.md#where-a-stop-may-stand) |
| Stop spacing (not enforced) | 750 urban, 1,000 suburb | ft | same; the player chooses |
| Stops a tile | 1 a side, 2 a tile | stops | dial |
| `CIVIC_DRIVE_WIDTH_M` | 7.3 (24 ft; codes 24 min, 30–36 max) | m | [civic drive](../sources/civic-access-and-bus-stops.md#the-civic-drive) |
| `CIVIC_WALK_WIDTH_M` | 1.8 | m | accessible route |
| Fire apron depth | 14 (45–50 ft real) | m | same |
| Fire apparatus road; two-way fire lane | 20; 24 | ft | same |
| School bus loop radius; lane | 15 (50 ft real); 24 ft | m | same; dial |
| Corner clearance a drive keeps | 20 | ft | [lots-and-land.md](lots-and-land.md) |
| Civic kits | 37 | kits | the airport is a landmark |
| Save version of the migrated saves | 17 | save version | `SAVE_VERSION` does not move |

**Code:**

- `src/shared/types.ts` `BusStop { x, z, side, kind }`, `Command` `placeStop` / `removeStop`, `SimSnapshot.stops`, `SHELTER_WARRANT_BOARDINGS`, `SHELTER_AD_INCOME`: the stop, its commands, the dials.
- `src/data/catalog.json`: `bus-stop` is the shelter ("Bus shelter"); `bus-stop-sign` at ₵2 and ₵0; neither has a footprint tile; category `transit`.
- `src/sim/stops.ts`: the registry keyed `tile × 2 + side`; place, remove, lookup, boardings a day, the warrant, save and restore, `payload.meta.busStops`.
- `src/sim/transit.ts` `estimateRidership` `nearbyPopulationJobs`: a line's stops are street tiles holding a stop; per-stop boardings; removing a stop edits lines.
- `src/sim/economy.ts`: shelter upkeep and the "advertising" income line.
- `src/sim/worker.entry.ts` `cmdPlaceStop`, `cmdRemoveStop`: the commands and the migration of `bus-stop` buildings.
- `src/tools/tools.ts` `plop.bus-stop-sign`, `plop.bus-stop`, `isStreetTier`, `parkingLaneOffset`: snap to a street tile and side; the line tool picks stops.
- `src/render/busstops.ts` `busStopPlacement`: the one function that lays the furniture in the tile's road frame; `utilitykits.ts`, `busshelter.ts` `BUS_SHELTER`: pad, pole, shelter, bin pools and the ghost.
- `src/ui/StopPanel.tsx`, the budget in `src/ui`: boardings a day, "warranted", the advertising line.
- `src/shared/lotlayout.ts`, `src/render/buildingkit.ts`, `utilitykits.ts`: the civic drive and curb cut drawn from the lot plan to the kit's access point. `computeBusStopLayout` in `utilitykits.ts` drew the old bus-stop building; `busStopPlacement` replaces it.
- `src/shared/civicaccess.ts` `CIVIC_ACCESS_BY_ID`, `civicAccessFor`, `civicCrossingWidth`, `CivicAccess`, `CivicSpan`: the span table, one entry per civic catalog id.
- `src/render/civiccrossing.ts` `civicSiteFor`, `civicCrossingRects`, `civicCutTiles`, `crossingsOf`, `civicEdgeSide`: the crossing laid from the span table; `curbCutTileFor` covers the civic cuts.
- `src/shared/parkingcode.ts` `lotParkingRequirement`, `src/shared/lotparking.ts` `lotLayoutFor`: the lot layout the civic drive reuses; `findRoadFacingEdge` for the migration.
- `tools/busstop-shots.mjs`, `tools/civic-access-shots.mjs`: browser checks of stops and civic drives.

**Tests:**

- `src/render/busstops.test.ts` — pad's near edge on the kerb face, pole 0.46 m out, shelter 0.9 m out, kerbed and gravel, both sides.
- `src/sim/stops.test.ts`, `src/tools/tools.test.ts`, `tests/interaction/transit.test.ts` — refusals, sign to shelter upgrade, line edits, warrant at 25 and not 24, migration.
- `src/ui/StopPanel.test.tsx` — the inspector.
- `src/render/civiccrossing.test.ts` — an access for every civic id, the spans held to each kit's layout, the cut tiles.

**Open:**

- A bus stop stands on grid street tiles only: its frame reads a grid road axis, so a free-form curve takes no stop yet; reuse the lamp renderer's frame.
- A civic kit stands on a raised plinth, so its apron meets the crossing with a step; a tram depot declares no crossing and the college no drive.

## Why the rules are what they are

### A stop is furniture on the footway

A bus stop was a catalog building taking a tile of its own beside the road and standing like a kiosk. In a real town it is a sign on a pole or a shelter on a concrete pad on the footway. It takes no land.

The player places a stop on a street, on the side the pointer is on. A bus line's stops are these stops, and placing one is how a line gets one. A line's `stops: TilePoint[]` keeps its shape and names the street tile a stop stands on; the route computer's snapping already takes a point on a run.

Two kinds, by what they cost. A sign is a sign on a pole on the pad. A shelter is the pad, the sign, a shelter with a bench and a bin. The standards and prices are in [the sources](../sources/civic-access-and-bus-stops.md#sign-against-shelter).

A sign upgrades to a shelter by placing the shelter on it, for the price difference. `placeStop` refuses a tile and side that already holds a stop, except a shelter over a sign.

### The pad on the tile

On a street with a footway the whole stop stands at the outer edge of the footway, with the footway itself kept clear. The pad begins at the footway's outer edge (kerb face plus `sidewalkDepthMeters`) and runs 2.44 m beyond it, 3.66 m along, centred on the tile.

The pole stands at the pad's road-side edge at its leading end in the road's flow direction. The shelter stands along the back of the pad facing the road, and the bin at the pad's trailing end.

On a street with no footway a dirt or gravel road, a lane without kerbs, the same pad comes up to the road, its near edge at the kerb reserve's outer edge. The pole, shelter and bin stand on it the same way. A sign standing in grass is the one thing a transit agency will not build.

`busStopPlacement(stop, profile)` is the one function that lays this, in the tile's road frame: the road axis along, the side's normal out. The pools are the shelter's existing one and three new instanced pools (pad, pole, bin). The pads conform to the terrain like the lot pads.

A one-tile street holds a stop on each side. A tram stop is the tramway's own, a point on the track tile drawn from `src/render/busshelter.ts`, and is not changed.

### Where a stop may stand

The tool finds the nearest street tile within one tile of the pointer. The tile is not a junction by the road mask, not a motorway or ramp, not rail, not a tram reservation. The side comes from the sign of the pointer's offset from the road axis (`parkingLaneOffset`'s low and high convention).

A stop never stands on a junction tile because a 40 ft bus needs 90 or 100 ft of kerb clear of a crossing. The tile beside one is the far-side stop the manuals prefer. The game never spaces stops; the player does.

The ghost snaps to the tile and side, shows the pad, pole and shelter where they will stand, and turns red on any refusal. Bulldozing a stop issues `removeStop`, which takes it off every line that names its tile when no stop remains there. Both commands return their inverse.

### Riders and the ad panel

`estimateRidership` already sums `nearbyPopulationJobs(stop)` a stop. That summand, times the line's rate and its length bonus, is the stop's boardings a day for that line. The registry sums it over the lines calling at it, on the cadence the transit system ticks.

A shelter at or above 25 boardings a day is warranted. `economy.ts` charges every shelter its upkeep and pays ₵7 a month for each warranted one, as an income line "advertising". A shelter nobody uses costs its upkeep and earns nothing, which is the choice of putting a shelter where a sign would do.

The snapshot carries each stop's boardings and warrant. The inspector shows the boardings and names the shelter "warranted" or not.

### The save migration

Stops are additive data, serialised as a list beside `transitLines` in the save's meta (`payload.meta.busStops`). A save without it loads with none, and `SAVE_VERSION` does not move.

On load, every building with `catalogId === 'bus-stop'` leaves the registry and its tile is freed. A shelter stop is placed on the street tile it fronted, found by `findRoadFacingEdge` or else the nearest street tile within one tile, on the side facing the old tile. Lines naming the old tile are rewritten to the street tile.

A building with no street in reach is dropped, and the loader logs it. The migration runs once, before the transit restore, so lines are rewritten against stops that exist.

### A civic building has a way in

Every service, transport, utility and park building draws its own apron, yard, drive, canopy or forecourt inside its footprint (`src/render/utilitykits.ts` holds all 37 civic kits). None had the way from the footprint's front edge over the verge and footway to the carriageway, which every lot that grows already has.

So civic access is a crossing, the one thing the kits share, and each kit declares where along its front it wants one. `CIVIC_ACCESS_BY_ID` names every civic catalog id; a test mirrors `UTILITY_KIT_CATALOG_IDS` plus the airport so none is missed.

- A fire station's apron is the width of its bays, so an engine pulls straight out; its staff park at the side or rear.
- A works or depot's drive meets its gate; a plant's or depot's yard joins the road instead of floating behind it.
- A hospital's and a clinic's drive lies at the porte-cochère, with a walk at the door; a school's drive lies at its loop, with a walk at the entrance.
- A library's and a station's drive and walk; a park's walk at its entrance; a cemetery's drive at the gatehouse.
- A shore kit (water tower, turbine, pump, drain, sewage works) declares its spans on its land side.

Codes put a civic car park beside or behind the building, never across its front, with a visitor pad by the door where the kit has one.

### How the crossing is laid

The lot renderer lays each span from the footprint's front edge to the carriageway as the house drive's cut is laid: verge, then footway, then concrete. A drive is `CIVIC_DRIVE_WIDTH_M` (7.3 m), an apron the span's width, a walk 1.8 m. It lies on the frontage the building faces, square to the street, with the curb cut the commercial lot draws.

`curbCutTileFor` covers the civic cuts so lamps and kerb furniture keep off them. The civic drive keeps the 20 ft corner clearance a house's drive keeps. A kit whose apron stops short of its front edge is extended to it. The kit's own apron or yard is unchanged; the drive meets it.

An entry with no street along its front draws nothing, as nothing grows there. A deeper fire apron or a school bus loop inside a footprint that cannot hold one is a kit follow-up.

### What it interacts with

- The transit model: a line's stop is a point on the street tile, not the kerb tile beside it.
- [parking-to-code.md](parking-to-code.md): the civic crossing reuses the lot layout's drive and curb cut. The car park the kit draws is the kit's, and `lotParkingRequirement` is gated to commerce and industry.
- Transport depots: their yards get the drive to their gate.
- Budget: the shelter's advertising is an income line.

### What it is not

- Not stop spacing, a bus bay or a bulb-out: a stop is on the footway and the carriageway is unchanged.
- Not civic car-park sizing to code: the kit's car park stays what the kit draws; this adds the way in.
- Not a change to rail stations or tram stops.

## Decided

- Keep the stop a building and shrink it: rejected, since it would still take a tile and stand off the footway.
- Two stop entries at their real prices rather than one kind with an upkeep toggle: the sign's point is that it is cheap to put everywhere.
- The registry is the one owner of a stop. A line may only name a tile that holds a stop, checked on commit and on load.
- A civic kit with no sensible access point fails the test that lists every civic catalog id, not a silent gap.
- The sign's ₵2 is the real cost ratio against the shelter's ₵150; neither is re-tuned here.
