# Transport depots

- **Status:** Built

**Owns:** where a transit line's vehicles come from: the four depots, the fleet pool and its allocation, cycle time and headway, the dead runs, the running charge and the depot kits. Ridership is [transit-model.md](../world-sim/transit-model.md); the load vocabulary is [service-capacity.md](service-capacity.md); the programme is [municipal-services.md](municipal-services.md).

**Rules:**

- Field a line's vehicles from a depot of its mode over the mode's own network, never from nowhere; a mode with no depot runs nothing. `[R-roads-038]`
- Gate a tram depot on `isTramTile`, the tram graph's own test, never on a tram lane piece; a rail yard touches the railway, a bus depot a street. `[R-roads-038]` `[R-roads-007]`
- A depot fields all but a spare fifth of what it holds, and only when built, powered and on its network. `[R-roads-038]`
- Draw the sim's served count at the commercial speed; the renderer never owns a count. `[R-roads-038]`
- Take a line's vehicles from the nearest depot of its mode by path cost, spilling to the next; "in service" is what left it. `[R-roads-039]`
- Load the road graph twice a clock day with a bus line's dead run (05:00, 23:00); the buses are sim-animated, tram and rail load nothing. `[R-roads-039]`
- Charge every vehicle in service its running cost beside the depot's upkeep, never capacity. `[R-roads-038]`
- Never delete, re-route or strip a line because of a depot: it runs fewer vehicles or none, and says so.

**Numbers:** derivations and sources are in [the sources](../sources/transport-depots.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `SPARE_RATIO` | 0.2 | share | [FTA Circular 5010](https://apta.com/wp-content/uploads/APTA-Impacts-of-Spare-Ratio-Full-Report-03-2025.pdf) |
| `COMMERCIAL_SPEED_MPS` bus / tram / rail | 5.56 / 5.56 / 13.3 (20 / 20 / 48 km/h) | m/s | [derivation](../sources/transport-depots.md#round-trip-time-and-the-headway-it-buys) |
| `LAYOVER_FRACTION` | 0.15 (10–20% published) | share | same |
| `PEAK_HOUR_SHARE` | 0.10 | of daily | same |
| `TARGET_HEADWAY_MIN` | 10 | min | [turn-up-and-go](../sources/transport-depots.md#what-a-line-asks-for) |
| `RIDERS_PER_VEHICLE` bus / tram / rail | 48 / 150 / 450 | riders | same; `TRANSIT_PIECE_CAPACITY` |
| `RUNNING_COST_CENTS` bus / tram / rail | 40 / 70 / 142 | ¢ a vehicle a month | [NTD](../sources/transport-depots.md#running-cost-per-vehicle-in-service) |
| Operating cost a revenue hour bus / tram / train | $200 / $350 / $702 | $ | same |
| Revenue hours a day | 12 | h | same |
| Service span | 05:00 to 23:00 (18) | h | dial |
| Bus Depot | 2×2, 5.5 m, holds 10 fields 8, ¢3,000, upkeep ¢200, 4.1 kW, 0.6 kL, milestone 1 | | [sizes](../sources/transport-depots.md#depot-sizes-from-the-vehicles-inside-them) |
| Central Bus Garage | 3×4, 6.4 m, holds 36 fields 28, ¢10,700, upkeep ¢700, 8.8 kW, 1.4 kL, milestone 4 | | same |
| Tram Depot | 2×3, 6.0 m, holds 8 fields 6, ¢4,050, upkeep ¢280, 3.9 kW, 0.6 kL, milestone 3 | | same |
| Rail Yard | 3×4, 6.0 m, holds 5 fields 4, ¢11,800, upkeep ¢800, 7.6 kW, 1.2 kL, milestone 3 | | same |
| Cost per vehicle of capacity bus / tram / train | $0.53M / $0.9M / $1.4M | $ | [money](../sources/transport-depots.md#money) |
| Upkeep of the building | 6–8 of build cost | % a month | catalog |
| Dead-run worst case | 15 each way, 2.8% of a fleet | min | [arithmetic](../sources/transport-depots.md#dead-run-arithmetic) |
| Hysteresis on `defaultFleet` | 1 | vehicle | dial |
| Bus stall / aisle | 11.5 × 3.6 / 12.2 | m | [sizes](../sources/transport-depots.md#depot-sizes-from-the-vehicles-inside-them) |
| Tram set / train set length | 22.4 / 45.6 | m | same |
| Old cosmetic bus speed | `TILE_METERS * 2` = 40 m/s, 144 km/h | m/s | removed |
| `MAX_BUSES_PER_LINE` (old) | 6; 192 render slots | buses | removed |
| Utility kit catalog ids | 34 | ids | `UTILITY_KIT_CATALOG_IDS` |

**Code:**

- `src/shared/types.ts` `BuildingCatalogEntry.depot`, `requiresAdjacent` (`'rail' | 'water' | 'tram'`), `TransitLine.vehicles`, `SimSnapshot.transit` — the data shapes.
- `src/data/catalog.json` — the four `transit` entries `bus-depot`, `bus-garage`, `tram-depot`, `rail-yard`.
- `src/shared/transitfleet.ts` `cycleSeconds`, `defaultFleet`, `allocate`, `runningCost`, `inServiceSpan` — the constants, one source for sim and renderer.
- `src/sim/depots.ts` `connectedDepots` — the pool of built, powered, network-touching depots.
- `src/sim/transit.ts` `assign`, `crossings`, `routeLine` — pool, allocation, headway, ridership scaling, depot assignment, cached dead-run paths, volume on the road graph (`network.addVolume`).
- `src/sim/deadruns.ts` — dead-running buses, sim-animated in their own slice of the vehicle buffer (`VehicleKind.Bus`).
- `src/sim/worker.entry.ts` — depot registry scan each tick, the `'tram'` placement gate on `isTramTier`, the snapshot fields.
- `src/sim/economy.ts` — the `transitRunning` monthly expense beside building upkeep.
- `src/sim/traffic.ts` — edges take volume at pull-out and pull-in.
- `src/shared/roadprofile.ts` `TRANSIT_PIECE_CAPACITY` — the 48 and 150 the capacity figures reuse.
- `src/render/transit.ts` — vehicle count from `served`, spacing `1 / served`, commercial speed, tram-car and train-car builders; `ridershipToBusCount` and `MODE_VEHICLE.countFor` retired.
- `src/render/utilitykits.ts` `UtilityKitRenderer.setDepotFleets`, `UTILITY_KIT_CATALOG_IDS` — the three depot kits (`busBase*`, `tramDepot*`, `railYard*`).
- `src/render/vehicles.ts` `buildVehicleGeometry(VehicleKind.Bus)` — the bus the stalls park.
- `src/ui/` — headway, served over requested, depot and running cost in the line panel; "no depot" at served 0; four cards in the Transit category.
- `tools/depot-shots.mjs` — the screenshots that judge the kits.

**Tests:**

- `src/shared/transitfleet.test.ts` — cycle, default fleet, allocation sums to the pool, remainders by ascending id.
- `src/sim/depots.test.ts`, `src/sim/transit.test.ts` — pool, gates, served, running cost, assignment and spill by cost.
- `src/sim/deadruns.test.ts` — volume on exactly the path's edges at the two crossings, once each; tram and rail add none; determinism.
- `src/render/transit.test.ts`, `src/render/depotkits.test.ts` — count equals `served`; kit ids, stalls, bays, parked fleet equals holds minus in service, lead at four rotations, every part inside the lot.
- `tests/interaction/transit.test.ts`, `tests/interaction/depottrucks.test.ts` — a pre-depot save loads idle and says "no depot"; a bus depot is placeable at milestone 1; fixtures carry a depot. `tests/interaction/firsttown.test.ts` is untouched.

**Open:**

- A civic kit's apron meets the road crossing with a step at the plinth edge; a tram depot declares no crossing, its gate faces the track.
- The dead runs read the visual clock for 05:00 and 23:00 while `[R-world-006]` says it never drives a sim rule; the truth gains the exception or both systems move to the calendar day.

## Why the rules are what they are

### A fleet from a building

A line used to be stops, a route and a ridership number, and the buses on screen a count clamped at six. Every line worked as well as the first, so the transit decision was "where", once, never "how much". A line now draws from a pool a depot holds, every vehicle costs what a real one costs, and headway falls out of how many vehicles the depot released. A wait at a stop traces back to a fleet, the fleet to a depot, the depot to land the player chose.

It also removes a small lie: vehicles spaced by a density knob, travelling at 144 km/h, seven and a fifth times a real bus's 5.56 m/s. The vehicle on screen is now the vehicle in the arithmetic, and the change is visible the first time the player looks at a street. It is the change most likely to be reported as a bug, and still correct.

### The pool and the gate

Each depot states a capacity and keeps a fifth as spares, as the FTA holds an agency to, so a ten-bus depot fields eight. The pools never mix across modes. Each tick, per `TransitMode`, sum `floor(fleet × (1 − SPARE_RATIO))` over depots that are built, powered and touching the mode's network. Two depots of a mode sum into one pool; a depot of another mode adds nothing.

A depot must stand on the network it serves, as the rail station's track-adjacency rule argues: a tram depot off the tramway is a shed. The tram gate tests `isTramTier` (tier 10), the predicate the tram graph is built from. A player-composed tram reservation on an arterial maps back through `tierForProfile` to its class tier, not tier 10, and is not in `tramNetwork`. Gating on the lane piece would let the player build a depot no tram can reach: it builds fine and supplies nothing, which is hard to read off the panel.

### Allocation, and a mode with no depot

Each line asks for a number of vehicles. If the pool covers every request, everyone gets theirs; otherwise every line is cut in proportion, so an under-supplied network degrades evenly rather than starving the last line drawn:

```
requested_i = TransitLine.vehicles, or the derived default
pool        = Σ fields(depot) over connected depots of that mode
served_i    = requested_i                          if Σ requested ≤ pool
            = floor(pool × requested_i / Σ requested)   otherwise
```

Remainders go one at a time in ascending line id, so allocation is deterministic and no vehicle is lost or invented to rounding. A line served short carries ridership in proportion: `ridership'_i = ridership_i × served_i / requested_i`, applied before relief. A line with none carries nobody and relieves nothing.

A mode with no depot has a pool of zero and every line of it serves zero: the plain case of the allocation function, not a branch round it. The player chose this strict reading over a contracted single vehicle for a line without a base, and over leaving a depotless mode uncapped. It closes the demolition exploit (knock the garage down, keep the buses) by itself. Demolishing every depot of a mode idles its lines; demolishing one while others remain shrinks the pool and re-runs allocation.

### Existing cities

A city that has never built a bus depot runs no bus the moment depots land; a save written before them loads with every line idle, because a line carries no `vehicles` field, meaning "the derived default". The line panel and the budget panel both say "no depot", or the player sees a dead transit map with no reason. The bus depot unlocks at milestone 1 with the bus stop, so the remedy is one building a town can afford. No first-town step depends on a depot, and no save is rejected for a missing field.

### Cycle time and headway

```
cycleSeconds = 2 × route.lengthTiles × TILE_METERS / COMMERCIAL_SPEED_MPS[mode] × (1 + LAYOVER_FRACTION)
headwayMin   = cycleSeconds / 60 / served
defaultFleet = max( ceil(cycleMin / TARGET_HEADWAY_MIN),
                    ceil(ridership × PEAK_HOUR_SHARE × cycleHours / RIDERS_PER_VEHICLE[mode]) )
```

A long line eats more vehicles to hold the same wait: the decision the feature exists to create. `route.lengthTiles` is already computed by `routeLine` every tick, so cycle time costs a multiply. The 48 and 150 are the `TRANSIT_PIECE_CAPACITY` the road model derives its bus-lane and tram-track throughputs from. `estimateRidership` returns a figure with no unit, so ridership is declared daily boardings, the one reading under which the existing constants are coherent. Round-trip derivation, the 10-minute threshold and a worked line are in [the sources](../sources/transport-depots.md#what-a-line-asks-for).

`defaultFleet` is recomputed only outside a hysteresis band of one vehicle; ridership moves continuously and re-deriving every tick makes the readout jitter and the render add and remove a vehicle every few frames. A train is a set; the rail yard's fleet is in sets, five, fielding four.

At this map's scale a line is short, so a small allocation buys a frequency extravagant in a real city: a ten-bus depot runs one long line beautifully or five short ones adequately. If the depot never bites in playtesting, the levers are line lengths and depot capacities. Never slow the commercial speed until it feels right; the programme forbids picking a number for feel. A dedicated bus or tram lane shortens the derived round trip, so those lanes buy a number rather than a stripe. Today's tram track is a street with rails in its running lanes, so a tram sits in the traffic a bus does and its speed is a bus's.

### Dead runs

A depot vehicle drives to its line's first stop and back, simulated, so a depot across the city sends its fleet across it twice a day and the streets between show it. This is what makes siting matter; a flat availability percentage was rejected as cheaper and indistinguishable in fleet effect, but it loses the vehicles on the street. The fleet effect at this map size is small (2.8%, one vehicle in thirty-six); if it wants weight the lever is the service span.

- **Assignment.** The pool stays one number and the proportional cut stands. Lines in id order take their served vehicles from the nearest connected depot with vehicles left, by `findPath` cost over the mode's graph from the depot's gate tile (the footprint tile nearest the network) to the line's first stop, and spill to the next nearest when it runs dry. The snapshot carries an optional `depotId` per line.
- **The path** is one `findPath(gate, line.stops[0])` per line for the depot that fields most of it, cached and recomputed only when the line's edge list or its depot changes. The graph is rebuilt on every edit, so a path with stale edge ids is recomputed next tick. Pairs counted are lines, not lines × depots.
- **The service span** is 05:00 to 23:00 of the sim day, read from `dayHourFromTick`. At the tick the day crosses 05:00 each bus line's path takes `served` vehicles of volume on each edge through `network.addVolume`; at 23:00 the same again. Volume is trips and decays with the day as every trip does. Tram and rail paths take no volume: their graphs carry no traffic.
- **The vehicles** are in the sim's vehicle buffer as `VehicleKind.Bus`: at pull-out the served buses leave the gate along the path, one per headway, and are dropped at the first stop; at pull-in the same number drive back. The transit renderer hides a line's looping vehicles outside the span, so the street shows buses pulling out at dawn and going home at night. Tram and train dead runs are not animated; the buffer has no kind for them.

The visual clock drives the crossings because the renderer's hiding of the loop must match the sim to the hour; the traffic system's rush hour reads the same clock, so the dead runs follow that precedent and flag the disagreement (see Open). A visual hour is a hundred ticks, five seconds at normal speed, while a bus drives at real 5.56 m/s, so a pull-out may still be driving an hour later. A bus is never faster than a bus; the clock is what races. The dead run is one extra A\* per line per invalidation, the same order as the per-tick `routeLine` but new work, so it is held against [the performance budget](../engineering/performance-budget.md).

### The four buildings

Four depots, deliberately, not one combined building. A bus swings out of its stall through a 12.2 m aisle; a tram set is 22.4 m on rails that cannot cross another stabling road without a turnout; a train set is 45.6 m. A combined depot would carry every adjacency gate, so it could stand only where a street, tram track and a railway all run: the scarcest siting constraint applied to the largest building. A player who wants them beside each other can site them so. A fleet slider with no building was rejected too: it has no site, no dead run and no traffic.

Sizes derive from the vehicles inside: the garage's 70.4 m of double row sets its 3×4; the tram set that cannot turn gives a 2×3, the rail station's footprint for the rail station's reason; the rail yard's 65.6 m depth needs 80 m, a 3×4 with its long side on the railway. Heights come from clearance, not floor area: a 1.7 m floor-arithmetic bus depot is shorter than its bus. Tram sets take current from the wire so a tram depot has no fuelling position, the clearest difference between the yards. Derivations and built examples are in [the sources](../sources/transport-depots.md#depot-sizes-from-the-vehicles-inside-them).

### Money

Two charges, deliberately separated. The depot's `upkeep` is the catalog's 6–8% of build cost, premises only. The running cost is per vehicle in service (¢40 a bus, ¢70 a tram set, ¢142 a train set a month) applied to `served` summed across lines, never to pool capacity. `economy.ts` sums it into `transitRunning` on the month boundary, beside building upkeep, and the budget panel shows the line. Capacity costs the building line, service the fleet line, so a half-empty depot pays its whole building bill for half a service. The NTD figure is the whole of operations, maintenance included, so a fitter is never counted twice. Prices follow the civic rule: the real cost against the fire station's $8M at ¢4,500; see [money](../sources/transport-depots.md#money). The ladder lives in the per-vehicle figure, ¢20 a bus of capacity at the depot and ¢19 at the garage, which is the reason to build the garage. The charge surprises a city with lines from the month a depot fields them; the budget line and the per-line figure explain it. Fares are not collected, so transit's return is the streets it clears and the land a station lifts.

### Render and the kits

Vehicles are spaced around the route polyline at `1 / served` of its length, which makes the headway on screen agree with the panel; the vehicle pool scales to the largest pool the catalog permits. Roads and ridership interact only through relief: the estimate in [transit-model.md](../world-sim/transit-model.md) still decides how many people ride, this feature how many vehicles carry them. A vehicle on the road is traffic: a large garage in a quiet suburb running a line across town builds the congestion.

The kits follow the vehicle-services rule in [civic massing](../art/civic-massing/README.md), per [the depots](../art/civic-massing/reading-a-civic-building-at-a-glance/the-depots.md): bay doors are the silhouette, the apron carries the garaged fleet (capacity minus vehicles in service, countable) and the body does not fill the lot; two thirds of a depot is open ground. The two bus sizes share one `busBase` recipe keyed off the footprint, because the rail station's kit already owns the part names `depotBuilding` and `depotCar`. The snapshot carries, additively, `transit.depots?: { id; holds; inService }[]`; `main.ts` passes it to `setDepotFleets` each snapshot, which, as `setInterments` does for the cemetery, skips unchanged ids and refits the parked pool; a depot absent from the list parks its whole catalog fleet. Stabled sets are the same cars the lines run (two 11 m cars a tram set, three 14 m cars a train set). `main.ts` passes a `tramAt` beside `railAt` on `isTramTier`; the lead goes to the edge `railSideOf`'s counterpart picks, and with no track beside it takes the back of the lot. Tracks and poles are one merged geometry per yard.

### Persistence and protocol

The pool is derived every tick from the building registry, which already persists; persisting it was rejected as a second source of truth that could disagree after a demolition. The one persisted addition is `TransitLine.vehicles?: number` inside `SaveMeta.transitLines` ([data model](../engineering/data-model/README.md)). `SimSnapshot.transit` grows from `{ lines, ridership }` to `{ lines, ridership, served, requested, headwayMin, runningCost, pools }`, optional so an older mirror ignores it. No new command: depots use the ploppable path and the requested fleet rides on `updateTransitLine` ([interfaces](../engineering/interfaces/README.md)).

## Decided

- A mode with no depot runs nothing, over a contracted single vehicle or an uncapped mode; the player chose the strict rule.
- Every vehicle in service is charged, over a depot-only bill.
- Four depots over one combined building: incompatible geometry and a stack of adjacency gates.
- Dead runs simulated over a flat availability percentage: siting only matters if vehicles cross the street.
- Pool derived each tick over persisted, to keep the registry the only source.
- Not built: timetables and bunching; fares (farebox recovery is a fifth to a third of operating cost, a later dial); per-vehicle rider capacity, driver or shift simulation; changes to ridership or routing; a road-maintenance depot, because roads do not decay.
