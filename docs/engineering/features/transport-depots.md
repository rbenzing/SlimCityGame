# Transport depots — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 7 of [municipal-services.md](municipal-services.md), after
[service-capacity.md](service-capacity.md), written against
[../../game-design/features/transport-depots.md](../../game-design/features/transport-depots.md),
which carries the derivations.

## What we are building, and why now

A transit line's vehicles come from nowhere. `src/sim/transit.ts` models no
vehicle at all — a line is stops, a route and a statistical ridership number —
and the buses on screen are `ridershipToBusCount` in `src/render/transit.ts`,
`round(ridership / 40)` clamped to six. This epic gives the fleet an origin: a
depot whose capacity is the ceiling on vehicles in service, and a derived
headway connecting that building to something the player watches happen. Now,
because it interacts with traffic more than anything else in the programme, so
it wants the programme's other service vehicles already on the network.

## What it touches

| Module                    | Change                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| `src/shared/types.ts`     | `TransitLine.vehicles?`; `requiresAdjacent` widens; `SimSnapshot.transit` grows |
| `src/data/catalog.json`   | Three entries: `bus-depot`, `bus-garage`, `tram-depot`                          |
| `src/sim/transit.ts`      | Fleet pool, allocation, cycle time, headway, dead-run paths                     |
| `src/sim/traffic.ts`      | Dead-run volume on the road graph                                               |
| `src/sim/worker.entry.ts` | Depot registry scan; the tram predicate for the placement gate                  |
| `src/sim/economy.ts`      | Per-vehicle-in-service charge alongside per-building upkeep                     |
| `src/render/transit.ts`   | Vehicle count from the snapshot, not from ridership; commercial speed           |
| `src/ui/`                 | Headway and fleet in the line panel; capacity in the depot panel                |

**Save format: yes, additively, and minimally.** No new `SaveMeta` block — depot
capacity is derived every tick from the building registry, which already
persists, so the pool is not state. The one persisted addition is
`TransitLine.vehicles?: number`, the player's requested fleet, inside the
existing `SaveMeta.transitLines` array in [../data-model.md](../data-model.md).
**A save written before this epic loads after it**: its lines carry no
`vehicles` field, which means "as many as the pool allows" — what those lines
already did. No save is rejected for a missing field, and **existing transit
lines keep running** by the rule below.

**Worker protocol: yes, additively, with no new command.**
`SimSnapshot.transit` grows from `{ lines, ridership }` to
`{ lines, ridership, fleet, headway, pools }`, the new members optional so an
older mirror ignores them. Depots use the existing ploppable path, and a line's
requested fleet rides on `updateTransitLine`, which already carries a whole
line. See [../interfaces.md](../interfaces.md).

## The design

### The pool, and what it gates

Stored: `TransitLine.vehicles?: number`, and the depots as ordinary registry
instances. Everything else is derived each tick. `BuildingCatalogEntry` gains
one optional `depot: { mode: TransitMode; fleet: number }`, and
`requiresAdjacent` widens from `'rail'` to `'rail' | 'road' | 'tram'`.

A depot with `requiresAdjacent: 'tram'` must test the **same predicate the tram
graph is built from** — `isTramTier`, tier 10 — not "the profile carries a tram
lane piece". Those differ today: `tierForProfile` maps a composed profile back
to its class's tier, so a player-composed tram reservation on an arterial is not
tier 10 and not in `tramNetwork`. Gating on the lane piece would let the player
build a depot no tram can reach.

Each tick, per `TransitMode`, sum `depot.fleet` over every depot that is built,
powered, and whose footprint touches the network its mode runs on.

```
requested_i = line i's TransitLine.vehicles, or the derived default below
pool        = Σ fleet over connected depots of that mode
served_i    = requested_i                               if Σ requested ≤ pool
            = floor(pool × requested_i / Σ requested)   otherwise
```

Remainders go one at a time in ascending line id, so allocation is
deterministic, and proportional cut-back degrades a network evenly.

**A mode with no depot at all is uncapped**, and `served_i` is the pre-depot
`ridershipTo*Count` value. This is the rule epic 0 sets for a facility with no
capacity figure, and it is what makes an old save behave identically. The
demolition exploit it opens — knock the garage down, keep the buses — is closed
in the economy rather than with a persisted flag. Demolishing a depot while
others remain shrinks the pool and re-runs the allocation. **A line is never
deleted, re-routed or stripped of stops** because of a depot; it runs fewer
vehicles, or none, and says so.

### Cycle time and headway

```
COMMERCIAL_SPEED_MPS = 5.56  // 20 km/h — published urban bus average
LAYOVER_FRACTION     = 0.15  // terminal recovery, mid of the published 10–20%
PEAK_HOUR_SHARE      = 0.10  // peak-hour share of daily boardings
TARGET_HEADWAY_MIN   = 10    // the turn-up-and-go threshold
RIDERS_PER_VEHICLE   = { bus: 48, tram: 150 }  // as TRANSIT_PIECE_CAPACITY derives them

cycleSeconds = 2 × route.lengthTiles × TILE_METERS / COMMERCIAL_SPEED_MPS
             × (1 + LAYOVER_FRACTION)
headwayMin   = cycleSeconds / 60 / served
defaultFleet = max( ceil(cycleMin / TARGET_HEADWAY_MIN),
                    ceil(ridership × PEAK_HOUR_SHARE × cycleHours / RIDERS_PER_VEHICLE) )
```

`route.lengthTiles` is already computed by `routeLine` every tick, so cycle time
costs a multiply, and `RIDERS_PER_VEHICLE` is not new — it is the 48 and 150
`TRANSIT_PIECE_CAPACITY` in `src/shared/roadprofile.ts` already derives its
bus-lane and tram-track throughputs from. One declaration this epic has to make,
because nothing does today: `estimateRidership` returns a figure with no unit.
We declare it **daily boardings**, the reading under which the existing
constants are coherent and under no other. `defaultFleet` is recomputed only
outside a hysteresis band — ridership moves continuously, and re-deriving every
tick makes the readout jitter.

### Dead runs: simulated

A depot vehicle drives to its line's first stop and back. **We simulate it.**
The path is one `network.findPath(depot, line.stops[0])` per line, cached and
invalidated on the same signal as the line's route; a line draws from the
nearest depot with spare capacity, so the pair count is lines, not lines ×
depots. Its edges take volume in `src/sim/traffic.ts` at pull-out and pull-in
and the vehicles are drawn making the trip, which is what makes siting matter
and what the player sees. Against the fleet, a dead run of `d` minutes each way
over an 18-hour service span costs `2d / (60 × 18)` of a vehicle's availability;
across our 5.12 km map at 20 km/h the worst case is 15 minutes each way, or
**2.8% of a fleet — one vehicle in thirty-six.** That figure is the honest part:
we say up front that the _fleet_ effect at this map size is small, so nobody is
surprised that moving a depot two tiles closer bought nothing. If it wants more
weight the lever is the service span, not a fudge on the availability term.

### Economy and render

Two charges, deliberately separated: the depot building's `upkeep`, held at the
catalog's established 6–8% of build cost; and a **per-vehicle-in-service**
charge — 65 per bus, 130 per tram set, per month — applied to `served_i` summed
across lines, never to pool capacity. A vehicle in service with **no depot** in
its pool is charged 93: the in-service rate plus 28, the small depot's own
upkeep per bay. That 28 is the demolition exploit's own arithmetic written down,
and it makes escaping the cap break even at best. Capacity costs the building
line, service the fleet line, and a half-empty depot shows as a large one
against a small one.

On the render side, `MODE_VEHICLE.countFor` is replaced by the snapshot's
`fleet[i]`, and vehicles are spaced around the route polyline at `1 / served` of
its length rather than bunched by a density knob — which is what makes the
headway on screen agree with the panel. `MAX_BUSES_PER_LINE = 6` and the
192-slot pool become functions of the largest pool the catalog permits, and
`BUS_SPEED_MPS` comes down to the commercial speed. Geometry follows the
vehicle-services rule in
[../../art/civic-massing.md](../../art/civic-massing.md): bay doors are the
silhouette, the apron carries the garaged fleet, and the body must **not** fill
the lot — two thirds of a depot is open ground.

## What could go wrong

- **The uncapped rule is the whole save story, and easy to get backwards.** If a
  pool of zero ever means zero vehicles rather than "no depot, no ceiling",
  every existing city's transit stops on upgrade. It has to be the default
  inside the allocation function, not a branch wrapped around it.
- **The tram placement gate.** Gating on a tram lane piece rather than on
  `isTramTier` allows a depot on a road the tram graph lacks, and the symptom —
  builds fine, supplies nothing — is hard to read off the panel.
- **The bus speed is a visual regression risk, not a functional one.** It is
  `TILE_METERS * 2` — 32 m/s, about 115 km/h, five and three quarter times the
  5.56 m/s the arithmetic uses. Bringing it down is correct, and still the
  change most likely to be reported as a bug.
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

## Alternatives

- **A fleet slider with no building.** Rejected: the current design with a price
  attached, and a slider has no site, no dead run and no traffic.
- **One combined depot serving both modes.** Rejected on geometry and placement.
  A bus stall needs a 12.2 m swing aisle; a tram set is 22.4 m on rails that
  cannot be crossed without a turnout — one gate over two incompatible yards. It
  would also carry both adjacency gates, so it could stand only where a street
  and tram track both run.
- **Persisting the pool, or a "has had a depot" flag.** Rejected: the pool sums
  buildings that already persist, so storing it creates a second source of truth
  that can disagree with the registry after a demolition, and the flag is
  answered by the economy. A hard cap with no uncapped case falls on the ground
  epic 0 rejected capacity-zero defaults: it breaks every existing save.
- **Dead runs hand-waved as a flat availability percentage.** Rejected after
  serious consideration — cheaper, and its fleet effect indistinguishable. It
  loses the only thing that makes _where_ a depot goes matter: the vehicles on
  the street between the depot and the line.

## How we will know it works

- A save written before this epic loads, and every line in it runs the same
  number of vehicles it ran before. **This test is written first.**
- A city with no bus depot runs its bus lines uncapped; one bus depot caps them
  at that depot's fleet; demolishing it returns them to uncapped. Two depots of
  the same mode sum into one pool; a depot of the other mode adds nothing to it.
- When requests exceed the pool, lines are cut in proportion and the served
  counts sum to exactly the pool — no vehicle lost or invented to rounding — and
  allocation is deterministic across runs, remainders by ascending id.
- A 60-tile bus line reports an 8.3-minute cycle; with two vehicles it reports a
  4.2-minute headway; doubling the route length doubles both. A line's default
  fleet is the larger of its frequency and capacity figures.
- A tram depot can be placed on a tram-tier tile and nowhere else — including a
  composed tile, if and only if that tile is in the tram graph — and its
  dead-run path adds volume only to the edges between it and its first stop.
- Halving a line's allocation halves its fleet charge while the depot's own
  upkeep does not move; and running vehicles with no depot costs more per
  vehicle than the smallest depot that would have held them, so demolishing to
  escape the cap never saves money.

**Looked at in a browser**, because this epic renders:

1. A 2×2 bus depot from the street at the default pitch: the bay doors must
   identify it, and a bus at a door be visibly shorter than the door.
2. The same depot part-allocated — the buses on the apron must equal capacity
   minus vehicles in service, countable on screen — and the 3×4 garage beside
   it, so the ladder reads as two buildings rather than one scaled twice.
3. A tram depot on tram track, sets stabled on parallel roads, one pulling out.
4. Dead-running buses between a depot and a line's first stop: they must drive
   there, not appear at it.
5. **A before/after pair of the same line at the same camera**, old cosmetic
   speed against the commercial speed, beside ordinary traffic. A bus that
   outruns the cars around it is the bug this shot exists to catch.
6. Two consecutive buses on one line, timed against the stated headway.

## Out of scope

- **Timetables, departures and bunching.** Headway is derived and reported; no
  vehicle has a schedule. **Rail depots** are out too: trains keep coming from
  nowhere, and the pool is keyed by `TransitMode`, so adding one later is a
  catalog entry and a table row.
- **Per-vehicle rider capacity, and driver or shift simulation.** A full bus
  does not leave anyone behind, and staffing appears once as floor-area input.
- **Changes to ridership or routing**, beyond declaring `estimateRidership`'s
  unit; and **road maintenance depots**, because roads do not decay — see
  [municipal-services.md](municipal-services.md) and [../../DESIGN.md](../../DESIGN.md).

When this ships,
[../../world-sim/transit-model.md](../../world-sim/transit-model.md) (which
lists depots as deferred) and [../data-model.md](../data-model.md) (which
describes `TransitLine`) need updating; the map is [../../README.md](../../README.md).
