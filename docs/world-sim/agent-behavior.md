# Agent behavior

**There are no citizen agents in this simulation.** Nothing in `src/sim/`
represents a person: no home, no job, no schedule, no path through a day. A
resident is a number added to `CityStats.population` while their building's
`state` is `Active`, and nothing else about them exists. See
[population-model.md](population-model.md) for how that number moves, and
[ADR-0001](../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
for why the game is built this way.

This document is about what DOES move, and the honest split behind every one
of them: a small set of things are genuinely computed by the simulation (a
trip's existence, a route's cost, a ridership estimate, an incident's
severity); everything visible on screen is drawn on top of that computed
result, and several of the things drawn are looser approximations of it than
they look.

## The shared pattern: a route walked, not a person driving it

Three systems — civilian traffic (`src/sim/traffic.ts`), service dispatch
(`src/sim/dispatch.ts`), and cosmetic garbage trucks
(`src/sim/garbagetrucks.ts`) — share one mechanical shape for "a vehicle
following a route," down to near-identical code:

- A route is computed **once**, via `RoadNetworkApi.findPath` (see
  [pathfinding.md](pathfinding.md)), and converted to a polyline of
  world-space points with precomputed segment lengths.
- A vehicle object holds that polyline, a `segIndex` into it, and
  `distanceIntoSegment` — nothing else. It has no destination logic beyond
  "keep consuming segments"; when `segIndex` reaches the end, it is done.
- Every tick, `speedMps × TICK_SECONDS` (`TICK_SECONDS = 1 / TICK_RATE`) of
  distance is consumed against the current segment, spilling into the next
  segment (and the one after, in a bounded loop) as needed.
- The route itself is **never re-solved or revalidated**. If the road under
  it is bulldozed mid-trip, the vehicle keeps walking the polyline it
  captured at spawn — nothing reroutes, removes, or teleports it (see
  [../engineering/systems/traffic.md](../engineering/systems/traffic.md)'s
  "Where it breaks" for the traffic case; dispatch and garbage trucks share
  the same exposure).

What differs between the three is what happens around that shared walker:

- **Traffic** (civilian cars/trucks/buses) is the one with realism dressing:
  per-vehicle speed jitter, a minimum headway against whatever is ahead on
  the same segment, a staggered spawn offset, and turns rounded into short
  arcs — all so vehicles don't ride in visible lockstep. See
  [traffic-model.md](traffic-model.md) for the exact numbers; none of it
  changes whether a trip happened, only how its cosmetic vehicle looks.
  A trip's cosmetic vehicle is not guaranteed even when the trip itself
  succeeds: `network.addVolume` always runs, but the vehicle spawn is
  separately gated by a live density cap and the shared pool having a free
  slot — a road's assigned volume can already be saturated while it looks
  quiet on screen.
- **Service dispatch** is the closest thing to a persistent event object:
  an `ActiveIncident` is keyed to a target building id and carries a
  `phase` (`toIncident` → `servicing` → `toStation`) and a service-time
  countdown, so it persists across many ticks with real state. It is still
  an event bound to a building, not a person — nothing about the responding
  vehicle or the incident has any existence before the incident spawns or
  after it resolves.
- **Garbage trucks** are the simplest: one-tile-per-tick movers
  (`SERVICE_VEHICLE_SPEED_MPS`-equivalent, `TILE_METERS × TICK_RATE`) with no
  headway or jitter logic at all, cycling depot → building → depot (a
  landfill truck detours through an in-area dump route first). See
  [services-model.md](services-model.md).

## What decides a trip exists at all

A civilian trip is not decided by anyone wanting to go anywhere — it is a
population-scaled, rush-hour-shaped **sampling rate**
(`tripsForTick`, [traffic-model.md](traffic-model.md)) applied to two flat
lists the worker rebuilds from scratch every tick: every active
residential building's tile (an origin) and every active commercial/
industrial tile (a destination). `sampleTrips` draws that many
(origin, destination) pairs uniformly at random from those lists and routes
each one once. There is no notion of a particular resident going to a
particular job — the same origin tile can be sampled any number of times in
one tick, or none.

An incident is decided the same statistical way, from a different signal:
each tick, every Active non-service building is checked once per incident
kind (fire/crime/medical) against a spawn chance proportional to the
relevant scalar field's value at that tile
(`SPAWN_BASE_CHANCE × fieldValue / 255`) — FireRisk for fire, Crime for
crime, and Pollution as the stand-in for a medical-emergency rate (no
dedicated "health risk" field exists). A building already the target of an
unresolved incident is skipped. At most one incident spawns per building per
tick, and dispatch never fires without an available responding
building of the matching service kind.

A garbage truck's target is not statistical at all: `pickTarget` walks the
untargeted building list nearest-first by Manhattan distance (id-tiebroken)
and probes up to `MAX_TARGET_PROBES = 12` of them with `findPath` until one
is actually reachable.

## Transit: the cosmetic vehicle is not the simulated route

The sim computes a real route for every transit line — a stop-to-stop A*
concatenation over the mode's own network (street/rail/tram) — but that
route exists **only** to drive the ridership estimate and the congestion
relief it feeds back into the road graph
(see [transit-model.md](transit-model.md)). `SimSnapshot.transit` never
carries it: only each line's ordered stop list and its ridership number
cross to the render thread.

The buses, trams and trains actually on screen are built entirely on the
**render** side (`src/render/transit.ts`), from that stop list and
ridership number alone, and they are a second, looser approximation on top
of the first: the render module draws the straight polyline **through the
stops in order**, not the road-hugging path the sim computed — its own
doc comment calls this "the best available approximation of the line's road
path" given the current wire contract. How many vehicle instances animate
along that polyline is a deterministic function of ridership alone
(`ridershipToBusCount`/`ridershipToTrainCount`/`ridershipToTramCount` — one
per 40/220/90 riders respectively, floored at one for rail/tram the moment
ridership is positive, capped per line), advanced by the render thread's own
`deltaSeconds` clock — not by a sim tick, and not through the shared
`SimSnapshot.vehicles` pool traffic/dispatch/garbage trucks use at all. A
transit vehicle is, in the most literal sense available in this codebase,
drawn rather than simulated: the only simulated quantity behind it is the
ridership number, and even the path it walks is not the one the simulation
actually computed.

## Summary

| System           | What is simulated                      | What is drawn                                                       | Vehicle identity                                                                |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Civilian traffic | Trip sampling, routing, edge volume    | A cosmetic car/truck/bus animated along the real route              | Shared pool slot, `TrafficSystem`                                               |
| Service dispatch | Incident spawn, routing, on-scene time | A cosmetic fire/police/ambulance vehicle along the real route       | Shared pool slot, `DispatchSystem`; incident itself keyed by target building id |
| Garbage trucks   | Depot budget, nearest-target routing   | A cosmetic truck along the real route                               | Shared pool slot, `GarbageTruckSystem`                                          |
| Transit          | Route (for relief only) and ridership  | Bus/tram/train count and a straight-line approximation of the route | Render-thread only; no sim-side vehicle object at all                           |

No system in this list, nor anywhere else in `src/sim/`, models an
individual person's day, commute, workplace, or preference. Population,
ridership, and trip volume are the only "people" this simulation ever
represents, and all three are plain numbers.
