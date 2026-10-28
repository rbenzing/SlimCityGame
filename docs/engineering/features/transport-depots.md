# Transport depots — technical design

- **Status:** Specified 2026-10-16 (draft of 2026-09-18 revised on the player's choices); slice 1, the sim, built 2026-10-16; slice 2, dead runs, built 2026-10-16; slice 3, the kits, built 2026-10-16; epic complete
- **Date:** 2026-09-18, revised 2026-10-16
- **Author:** Claude Opus 5, revised by Claude Fable 5.1

Epic 7 of [municipal-services.md](municipal-services.md), after
[service-capacity.md](service-capacity.md), written against
[../../game-design/features/transport-depots.md](../../game-design/features/transport-depots.md),
which carries the derivations and every source.

## What we are building, and why now

A transit line's vehicles come from nowhere. `src/sim/transit.ts` models no
vehicle at all — a line is stops, a route and a statistical ridership number —
and the buses on screen are `ridershipToBusCount` in `src/render/transit.ts`,
`round(ridership / 40)` clamped to six. This epic gives the fleet an origin: a
depot whose capacity is the ceiling on vehicles in service, a derived headway
connecting that building to something the player watches happen, and a monthly
charge for every vehicle that runs. Now, because it is the last service in the
programme with no building and no bill, and the service vehicles it shares the
road with are all on the network.

**Three slices.**

1. **The sim.** The four catalog entries, the pool and the allocation, cycle
   time and headway, the running charge, the snapshot, the panel, and the
   renderer drawing the sim's count at the commercial speed. Depots draw as
   the catalog box at their true size.
2. **Dead runs.** The pull-out and pull-in paths on the traffic graph and the
   vehicles drawn making the trip.
3. **The kits.** Three on the civic pattern (the two bus depots share one), to
   the building-detail standard, with the screenshots that judge them.

## What it touches

| Module                              | Change                                                                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`               | `BuildingCatalogEntry.depot?: { mode; fleet }`; `requiresAdjacent` widens to `'rail' \| 'water' \| 'tram'`; `TransitLine.vehicles?`; `SimSnapshot.transit` grows                                                                                                 |
| `src/data/catalog.json`             | Four `transit` entries: `bus-depot`, `bus-garage`, `tram-depot`, `rail-yard`. No existing entry changes                                                                                                                                                          |
| `src/shared/transitfleet.ts`        | New, pure: the constants, `cycleSeconds`, `defaultFleet`, `allocate` (the proportional cut-back), `runningCost`; one source for sim and renderer                                                                                                                 |
| `src/sim/transit.ts`                | Fleet pool per mode, allocation, cycle time, headway, ridership scaled by served over requested before relief; slice 2: the depot assignment, the cached dead-run paths, the two crossings' volume on the road graph (`network.addVolume`) and the runs to start |
| `src/sim/deadruns.ts`               | Slice 2: the dead-running buses, sim-animated in their own slice of the vehicle buffer                                                                                                                                                                           |
| `src/sim/worker.entry.ts`           | Depot registry scan each tick; the `'tram'` placement gate on `isTramTier`; the snapshot fields                                                                                                                                                                  |
| `src/sim/economy.ts`                | A `transitRunning` monthly expense: `served` summed over lines × the mode's charge, beside building upkeep                                                                                                                                                       |
| `src/render/transit.ts`             | Vehicle count from the snapshot, spaced at `1 / served` of the route; commercial speed; the three count functions go                                                                                                                                             |
| `src/ui/`                           | Headway, served over requested, depot and running cost in the line panel; "no depot" when served is 0; capacity in the depot panel; the four cards in the Transit category                                                                                       |
| `tests/interaction/transit.test.ts` | The fixtures gain a depot, because a line without one now carries nobody; a new test holds that. `firsttown.test.ts` is not touched                                                                                                                              |
| `docs/world-sim/transit-model.md`   | "no depots" leaves the deferred list; a Depots paragraph; ridership declared daily boardings                                                                                                                                                                     |
| `docs/GROUND-TRUTHS.md`             | One bullet: a line's vehicles are fielded by a depot of its mode, never from nowhere; a mode with no depot runs nothing; the renderer draws the sim's count                                                                                                      |

**Save format: yes, additively, and minimally.** No new `SaveMeta` block — the
pool is derived every tick from the building registry, which already persists.
The one persisted addition is `TransitLine.vehicles?: number`, the player's
requested fleet, inside the existing `SaveMeta.transitLines` array in
[../data-model/README.md](../data-model/README.md). A save written before this epic loads
after it: its lines carry no `vehicles` field, which means "the derived
default", and **its lines stand idle until a depot is built**, which is the
rule the player chose. No save is rejected for a missing field.

**Worker protocol: yes, additively, with no new command.**
`SimSnapshot.transit` grows from `{ lines, ridership }` to
`{ lines, ridership, served, requested, headwayMin, runningCost, pools }`, the
new members optional so an older mirror ignores them. Depots use the existing
ploppable path, and a line's requested fleet rides on `updateTransitLine`,
which already carries a whole line. See [../interfaces/README.md](../interfaces/README.md).

## The design

### The pool, and what it gates

Stored: `TransitLine.vehicles?: number`, and the depots as ordinary registry
instances. Everything else is derived each tick. `BuildingCatalogEntry` gains
one optional `depot: { mode: TransitMode; fleet: number }`, and
`requiresAdjacent` widens from `'rail' | 'water'` to include `'tram'`.

A depot with `requiresAdjacent: 'tram'` must test the **same predicate the tram
graph is built from** — `isTramTier`, tier 10 — not "the profile carries a tram
lane piece". Those differ today: `tierForProfile` maps a composed profile back
to its class's tier, so a player-composed tram reservation on an arterial is not
tier 10 and not in `tramNetwork`. Gating on the lane piece would let the player
build a depot no tram can reach. The rail yard uses the station's `'rail'` gate
as it stands.

Each tick, per `TransitMode`, sum `floor(depot.fleet × (1 − SPARE_RATIO))` over
every depot that is built, powered, and whose footprint touches the network its
mode runs on; `SPARE_RATIO = 0.2`.

```
requested_i = line i's TransitLine.vehicles, or the derived default below
pool        = Σ fields(depot) over connected depots of that mode
served_i    = requested_i                               if Σ requested ≤ pool
            = floor(pool × requested_i / Σ requested)   otherwise
```

Remainders go one at a time in ascending line id, so allocation is
deterministic, and proportional cut-back degrades a network evenly.

**A mode with no depot has a pool of zero and every line of it serves zero.**
This is the player's rule, and it is the plain case of the allocation function,
not a branch round it. A line with `served = 0` carries nobody:
`ridership'_i = ridership_i × served_i / requested_i` is applied before relief,
so an unserved line relieves nothing. Demolishing a depot while others remain
shrinks the pool and re-runs the allocation. **A line is never deleted,
re-routed or stripped of stops** because of a depot; it runs fewer vehicles, or
none, and says so.

### Cycle time and headway

```
COMMERCIAL_SPEED_MPS = { bus: 5.56, tram: 5.56, rail: 13.3 }  // 20 km/h; 48 km/h
LAYOVER_FRACTION     = 0.15   // terminal recovery, mid of the published 10–20%
PEAK_HOUR_SHARE      = 0.10   // peak-hour share of daily boardings
TARGET_HEADWAY_MIN   = 10     // the turn-up-and-go threshold
RIDERS_PER_VEHICLE   = { bus: 48, tram: 150, rail: 450 }
SPARE_RATIO          = 0.2
RUNNING_COST_CENTS   = { bus: 40, tram: 70, rail: 142 }  // per vehicle (set) per month

cycleSeconds = 2 × route.lengthTiles × TILE_METERS / COMMERCIAL_SPEED_MPS[mode]
             × (1 + LAYOVER_FRACTION)
headwayMin   = cycleSeconds / 60 / served
defaultFleet = max( ceil(cycleMin / TARGET_HEADWAY_MIN),
                    ceil(ridership × PEAK_HOUR_SHARE × cycleHours / RIDERS_PER_VEHICLE[mode]) )
```

`route.lengthTiles` is already computed by `routeLine` every tick, so cycle time
costs a multiply, and the bus and tram capacities are not new — they are the 48
and 150 `TRANSIT_PIECE_CAPACITY` in `src/shared/roadprofile.ts` already derives
its bus-lane and tram-track throughputs from. One declaration this epic has to
make, because nothing does today: `estimateRidership` returns a figure with no
unit. We declare it **daily boardings**, the reading under which the existing
constants are coherent and under no other. `defaultFleet` is recomputed only
outside a hysteresis band of one vehicle — ridership moves continuously, and
re-deriving every tick makes the readout jitter. The train is a set; the rail
yard's `fleet` is in sets, five, fielding four.

### Dead runs: simulated (slice 2)

A depot vehicle drives to its line's first stop and back. **We simulate it.**
The path is one `network.findPath(depot, line.stops[0])` per line, cached and
invalidated on the same signal as the line's route; a line draws from the
nearest depot with spare capacity, so the pair count is lines, not lines ×
depots. Its edges take volume in `src/sim/traffic.ts` at pull-out and pull-in
and the vehicles are drawn making the trip, which is what makes siting matter
and what the player sees. Against the fleet, a dead run of `d` minutes each way
over an 18-hour service span costs `2d / (60 × 18)` of a vehicle's availability;
across our 5.12 km map at 20 km/h the worst case is 15 minutes each way, or
**2.8% of a fleet — one vehicle in thirty-six.** We say up front that the
_fleet_ effect at this map size is small, so nobody is surprised that moving a
depot two tiles closer bought nothing. If it wants more weight the lever is the
service span, not a fudge on the availability term. A tram dead-runs over the
tram graph and a train over the railway; neither loads the road graph.

**How it is built**, on the pattern the garbage trucks and the dispatch
vehicles already use:

- **Assignment.** The mode's pool stays one number and the proportional cut
  stands; what slice 2 adds is which depot each line's vehicles come from.
  Lines in id order take their served vehicles from the nearest connected
  depot of the mode with vehicles left — nearest by `findPath` cost over the
  mode's graph from the depot's gate tile (its footprint's tile nearest the
  network) to the line's first stop — and spill to the next nearest when it
  runs dry. A depot's "in service" is then what left it, replacing the
  ascending-id fill, and the snapshot carries a `depotId` per line, optional
  and additive, for the panel.
- **The path** is `findPath(gate, line.stops[0])` on the mode's graph for the
  depot that fields most of the line, cached per line and recomputed only
  when the line's route changed (its edge list differs from the last tick's)
  or its depot did; the graph is rebuilt on every edit, and a path whose
  edge ids are stale is recomputed the next tick.
- **The service span** is 05:00 to 23:00 of the sim's day — eighteen hours,
  the span the availability arithmetic above uses — read from
  `dayHourFromTick`. At the tick the day crosses 05:00 every bus line's
  path takes `served` vehicles of volume on each edge through
  `network.addVolume`, the pull-out; at 23:00 the same again, the pull-in.
  Volume is trips, as the traffic system counts them, and decays with the
  day as every trip does. Tram and rail paths take no volume: their graphs
  carry no traffic.
- **The vehicles** are simulated, not drawn by the renderer: at pull-out the
  line's served buses leave the gate along the path, one per headway, in
  the sim's vehicle buffer as `VehicleKind.Bus`, and are dropped when they
  reach the first stop; at pull-in the same number drive the path back from
  the first stop to the gate. The transit renderer hides a line's looping
  vehicles outside the service span, so the street shows buses pulling out
  at dawn, running the line by day and going home at night, and never a bus
  at three in the morning. Tram and train dead runs are not animated in this
  slice; they move on their own graphs and the vehicle buffer has no kind
  for them.
- **Tests:** nearest-depot assignment and spill, by cost not distance; the
  path per line and its cache; volume on exactly the path's edges at the two
  crossings and nowhere else, once each per day; tram and rail paths add no
  volume; the pull-out vehicles' count, spacing and kind; the renderer's
  loop hidden outside the span; determinism.

### Economy and render

Two charges, deliberately separated: the depot building's `upkeep`, the
catalog's established 6–8% of build cost, premises only; and the
**per-vehicle-in-service** charge from the NTD figures — ¢40 a bus, ¢70 a tram
set, ¢142 a train set, a month — applied to `served_i` summed across lines,
never to pool capacity. `economy.ts` sums it into a `transitRunning` expense on
the month boundary, the way building upkeep is summed, and the budget panel
shows the line. Capacity costs the building line, service the fleet line, and a
half-empty depot shows as a large one against a small one.

On the render side, `MODE_VEHICLE.countFor` is replaced by the snapshot's
`served[i]`, and vehicles are spaced around the route polyline at `1 / served`
of its length rather than bunched by a density knob — which is what makes the
headway on screen agree with the panel. `MAX_BUSES_PER_LINE = 6` and the
192-slot pool become functions of the largest pool the catalog permits, and the
vehicle speeds come down to the commercial speeds. The kits (slice 3) follow
the vehicle-services rule in
[../../art/civic-massing.md](../../art/civic-massing.md): bay doors are the
silhouette, the apron carries the garaged fleet — capacity minus vehicles in
service, countable — and the body must **not** fill the lot; two thirds of a
depot is open ground. The rail yard's and tram depot's stabled sets are the
kit's own parked vehicles, on the vehicle kit's geometry.

### The kits (slice 3)

Three recipes in `src/render/utilitykits.ts` on the civic pattern, from
[../../art/civic-massing.md](../../art/civic-massing.md#the-depots):

- **Registry and names.** `bus-depot`, `bus-garage`, `tram-depot` and
  `rail-yard` join `UTILITY_KIT_CATALOG_IDS` (34 ids). The rail station's
  kit already owns the part names `depotBuilding`, `depotCar` and so on —
  its combination depot — so the new parts are `busBase*`, `tramDepot*`
  and `railYard*`, and the two bus sizes share the `busBase` recipe with
  the stall rows, bays, fuelling islands and office keyed off the
  footprint.
- **The fleet at home.** The snapshot gains, additively,
  `transit.depots?: { id; holds; inService }[]` for every connected depot,
  built in `worker.entry.ts` beside `depotId` from the tick's in-service
  map; `main.ts` passes it to `UtilityKitRenderer.setDepotFleets` every
  snapshot, which — as `setInterments` does for the cemetery — skips
  unchanged ids and refits the parked pool to `holds − inService`. A depot
  absent from the list (unconnected, or an older worker) parks its whole
  catalog fleet.
- **Vehicle geometry.** The bus is `buildVehicleGeometry(VehicleKind.Bus)`
  from `vehicles.ts`; `transit.ts` exports its tram-car and train-car
  builders and sizes so the stabled sets are the same cars the lines run,
  two 11 m cars a tram set and three 14 m cars a train set, at the pitch the
  renderer spaces them.
- **Track edge.** `main.ts` passes a `tramAt` beside `railAt`, on
  `isTramTier`; the tram depot's and rail yard's lead goes to the edge
  `railSideOf`'s counterpart picks, and with no track beside it the lead
  takes the back of the lot as placed.
- **Tracks and poles** are one merged geometry per yard (rails on sleepers
  or ballast, the catenary poles' posts and crossarms); the stall paint is
  the car parks' paint.
- **Tests:** the three ids in the registry and the renderer; stalls, aisle
  and bay counts by footprint; the bus fleet parked equals holds − in
  service and refits when the snapshot changes; stabling road count and
  pitch, sets parked; the lead on the track edge at all four rotations and
  the fallback; lit panes on the lit material only; every part inside the
  lot; determinism; the kit tier with the figures reported.
- **Shots**, `tools/depot-shots.mjs`: the depot and the garage side by side
  from the street with a line running so the apron shows holds less in
  service; the tram depot on tram track; the rail yard along the railway;
  each at the default pitch beside the 4 m car; at night.

## What could go wrong

- **The clock runs faster than the street.** A visual hour is a hundred
  ticks, five seconds at normal speed, and a bus drives at its commercial
  5.56 m/s in real seconds, so a 15-tile pull-out that leaves the gate at
  05:00 is still on the road at 06:00 and a 23:00 pull-in can still be
  driving at 03:00. That is the cosmetic cars' existing relation to the
  clock, and the alternative — a bus that covers the run inside one visual
  hour — is the 144 km/h bus this epic removed. A bus is never faster than a
  bus; the clock is what races. The night shot therefore shows the loop
  hidden, not necessarily an empty street.
- **The visual clock drives the crossings.** The service span is read from
  `dayHourFromTick`, the visual clock, because the renderer's hiding of the
  loop must match the sim's pull-out to the hour. A ground truth says the
  visual day never drives a sim rule; the traffic system's rush hour already
  reads the same clock, so the dead runs follow that precedent rather than
  the truth, and the disagreement is flagged in the ROADMAP's open items
  for the player to settle.
- **Every existing city's transit stops on upgrade.** That is the chosen rule,
  not an accident, and the panel has to say "no depot" the moment the save
  opens or the player sees a dead transit map with no reason. The test holds
  the message and that the bus depot is buildable at the first milestone.
- **The tram placement gate.** Gating on a tram lane piece rather than on
  `isTramTier` allows a depot on a road the tram graph lacks, and the symptom —
  builds fine, supplies nothing — is hard to read off the panel.
- **The bus speed is a visual regression risk, not a functional one.** It is
  `TILE_METERS * 2` — 40 m/s, 144 km/h, seven and a fifth times the 5.56 m/s
  the arithmetic uses. Bringing it down is correct, and still the change most
  likely to be reported as a bug.
- **Allocation churn, and dead-run pathing cost.** Without the hysteresis band
  `defaultFleet` flickers between two integers and the render adds and removes a
  vehicle every few frames; and the dead run is one extra A\* per line per
  invalidation. Same order as the per-tick `routeLine`, but new work in the
  tick, so it goes against [../performance-budget.md](../performance-budget.md).
- **The scale honesty problem.** A 60-tile line has an 8.3-minute cycle, so two
  buses buy a 4-minute headway. If the depot never bites in playtesting, the
  temptation will be to slow the commercial speed until it does — picking a
  number to feel right, which the programme forbids. The levers are line lengths
  and depot capacities.
- **The charge surprises.** A city with lines pays ¢40 a bus from the month a
  depot fields them; the budget panel's new line and the per-line figure are
  the explanation.

## Alternatives

- **A contracted single vehicle for a line without a depot**, and **a mode
  with no depot uncapped** (the draft's rule, which kept old saves running):
  both offered; the player chose the strict rule on 2026-10-16.
- **A fleet slider with no building.** Rejected: the current design with a price
  attached, and a slider has no site, no dead run and no traffic.
- **One combined depot serving every mode.** Rejected on geometry and placement:
  a bus stall needs a 12.2 m swing aisle; a tram set is 22.4 m and a train set
  45.6 m on rails that cannot be crossed without a turnout — one gate over
  three incompatible yards, carrying every adjacency gate at once.
- **Persisting the pool.** Rejected: the pool sums buildings that already
  persist, so storing it creates a second source of truth that can disagree
  with the registry after a demolition.
- **Dead runs hand-waved as a flat availability percentage.** Rejected after
  serious consideration — cheaper, and its fleet effect indistinguishable. It
  loses the only thing that makes _where_ a depot goes matter: the vehicles on
  the street between the depot and the line.

## How we will know it works

- A save written before this epic loads with every line idle, the panel saying
  "no depot", and a bus depot placeable at once; placing it fields the lines.
  **This test is written first.** `firsttown.test.ts` is unchanged.
- A city with no bus depot serves zero on every bus line; one bus depot fields
  eight (ten less the spare fifth); demolishing it returns the lines to zero.
  Two depots of the same mode sum into one pool; a depot of another mode adds
  nothing to it.
- When requests exceed the pool, lines are cut in proportion and the served
  counts sum to exactly the pool — no vehicle lost or invented to rounding — and
  allocation is deterministic across runs, remainders by ascending id. A line
  served short carries ridership in proportion, and relieves in proportion.
- A 60-tile bus line reports an 8.3-minute cycle; with two vehicles it reports a
  4.1-minute headway; doubling the route length doubles both. A line's default
  fleet is the larger of its frequency and capacity figures.
- A tram depot can be placed on a tram-tier tile and nowhere else — including a
  composed tile, if and only if that tile is in the tram graph; a rail yard
  beside the railway only.
- The month's running cost is ¢40 × buses served + ¢70 × tram sets + ¢142 ×
  train sets, and the depot's own upkeep does not move with it.
- Render: vehicle count equals the snapshot's `served` for every line, and a
  bus moves at 5.56 m/s.

**Looked at in a browser**, because this epic renders (slices 2 and 3):

1. A 2×2 bus depot from the street at the default pitch: the bay doors must
   identify it, and a bus at a door be visibly shorter than the door.
2. The same depot part-allocated — the buses on the apron must equal capacity
   minus vehicles in service, countable on screen — and the 3×4 garage beside
   it, so the ladder reads as two buildings rather than one scaled twice.
3. A tram depot on tram track, sets stabled on parallel roads, one pulling out;
   a rail yard along the railway with its sets on the ladder.
4. Dead-running buses between a depot and a line's first stop: they must drive
   there, not appear at it.
5. **A before/after pair of the same line at the same camera**, old cosmetic
   speed against the commercial speed, beside ordinary traffic. A bus that
   outruns the cars around it is the bug this shot exists to catch.
6. Two consecutive buses on one line, timed against the stated headway.

## Out of scope

- **Timetables, departures and bunching.** Headway is derived and reported; no
  vehicle has a schedule.
- **Fares, per-vehicle rider capacity, and driver or shift simulation.** A full
  bus does not leave anyone behind, and staffing appears once as floor-area
  input.
- **Changes to ridership or routing**, beyond declaring `estimateRidership`'s
  unit; and **road maintenance depots**, because roads do not decay — see
  [municipal-services.md](municipal-services.md) and [../../DESIGN.md](../../DESIGN.md).

When slice 1 ships,
[../../world-sim/transit-model.md](../../world-sim/transit-model.md) (which
lists depots as deferred) and [../data-model/README.md](../data-model/README.md) (which
describes `TransitLine`) are updated in the same change; the map is
[../../README.md](../../README.md).
