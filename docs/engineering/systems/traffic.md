# Traffic — system design

Traffic assigns and animates trips over the road network: it decides which
edges a trip's demand loads, and it decorates that assignment with cosmetic
vehicles. It is explicitly not a per-agent simulation — no citizen or vehicle
has a schedule, a body, or a life of its own; see
[ADR-0001](../adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
for why.

**Lives in:** `src/sim/traffic.ts` (assignment loop, cosmetic vehicle pool),
`src/world/pathfind.ts` (A\*, edge cost, junction delay), `src/world/roads.ts`
(the road graph itself: build, rebuild, volume storage), `src/shared/
roadprofile.ts` (speed and capacity per cross-section), `src/shared/
approach.ts` and `src/shared/approachzone.ts` (per-lane, per-movement delay
division), `src/shared/junction.ts` (control-delay formulas and the warrant
that picks a junction's control).

## The model

The road graph is not one node per tile. `buildGraph` in `roads.ts` walks the
grid and places a node only where a tile is an intersection, a dead end, an
isolated tile (its neighbor mask has other than exactly two bits set), or —
even with exactly two neighbors — where its tier is strictly higher than a
neighbor's (`isNodeTile`). That last rule plants exactly one node at each
straight-through tier boundary, so a whole avenue is a single edge no matter
how many tiles long, and a tier change is where a wide run learns what it
narrows into. An edge is the maximal straight run of tiles between two nodes;
it carries the tile list (`GraphEdge.tiles`, ordered a→b), its tier, its
length in tiles, its own `classId`/`lanes` read off the run's resolved
cross-section, and a mutable `volume` that the traffic system writes and
decays. A run whose lanes split unevenly between directions (a profile with
different forward/back lane counts) records `lanesAtoB`/`lanesBtoA`; a run
that recorded no direction at all falls back to reading its flow from
geometry (`oneWayForwardIsAtoB`). `markLaneDrops` runs once after every build
and tags each two-edge node with the narrower capacity it drops into
(`narrowsAtA`/`narrowsAtB`), so a wide road queues for what it is about to
become rather than what it currently is.

Capacity comes from the cross-section, not the tier number alone.
`roadprofile.ts`'s `profileCapacity` sums each lane piece's own capacity
(`pieceCapacity`), derived from an HCM saturation flow calibrated to a fixed
game-units constant — see [road-model.md](../../world-sim/road-model.md) for the per-class numbers.
`pathfind.ts` precomputes `{ speed, capacity }` once per tier into
`RATES_BY_TIER` at module load, so a per-edge cost lookup is a `Map` read, not
a catalogue scan. `directionShare` scales that whole-road capacity down to
the share serving one direction when an edge's lanes split unevenly;
`approachSaturation` divides volume by the smaller of that direction's own
capacity and whatever narrower road it drops into ahead, capped at 1.
`edgeCost` is `length / speed` scaled up to 3× as saturation approaches 1 —
congestion is a cost multiplier on free-flow time, not a separate queue
model.

The distinctive piece is how a junction enters that cost. `findPath`'s A\*
state is not a bare node id: it is a node **and the edge that arrived at it**,
packed as `edge.id * 2 + (which end)`, with a sentinel `START` state for a
trip that has not moved yet. The reason is that both `turnAllowed` and
`junctionDelay` need to know which arm a driver came in on before they can
say which _movement_ a candidate next edge represents
(`movementBetween(headingInto(arriving), headingOutOf(leaving))`) — the same
node reached from the north costs a left turn to go west and a right turn to
go east, and those are not the same delay. `junctionDelay` first checks
whether the movement is actually a motorway merge rather than a junction
(`mergeDelay`, priced off how full the motorway is, not off any control); then
reads the arm's approach — its class, incoming lanes, and saturation
(`armsAt`) — and prices the base wait with `controlDelaySeconds` (the
yield/stop/all-way-stop/roundabout/signal formulas live in
`shared/junction.ts`; see [road-model.md](../../world-sim/road-model.md) for their shape). That base
delay is per **arm**, not per movement, so the last step divides it by
`movementDelayShare`, which reads the arm's actual per-lane movement sets
(`resolveLaneMovements`, folding in a turn pocket via `pocketLaneMovements`
when one is warranted and any player lane restrictions from
`node.laneTurns`). A movement served by a lane of its own gets a full share of
relief; one sharing a lane with another movement gets a share proportional to
how crowded that lane is. This is what lets a dedicated left-turn pocket make
a left cheaper than the right sharing the kerbside lane at the identical
junction — pinned by `src/world/junctioncontrol.test.ts`'s "serves the left
turn better than the right, which stays on the kerbside lane" (asserts
`left < right` from the same arriving edge at the same node) and "shortens the
left turn it was built for" alongside it. `turnAllowed` reads the same
arriving-edge state to prune a banned movement out of the search entirely — a
banned turn is not a longer path, it is no path.

The A\* heuristic is manhattan distance to the destination node over the
fastest tier's speed (`MAX_ROAD_SPEED`), which never overestimates because an
edge's tile length is always at least the manhattan distance between its
endpoints and junction delays are never negative — so ignoring them in the
heuristic keeps it admissible. Endpoints snap to the nearest node within 8
tiles manhattan (`nearestNode`); `RoadNetwork` overrides that with a
mid-run fallback (`edgeCovering`, backed by a lazily built tile→edge index) so
a point standing mid-corridor on a long, junction-free run still finds the
nearer end rather than resolving to nothing.

## How it runs

`WorkerSim.tick` (`src/sim/worker.entry.ts`) rebuilds `origins` and
`destinations` from scratch every sim tick by scanning every active building:
every active `res` building's tile is an origin, every active `com`/`ind`
tile a destination. It then calls `this.traffic.tick({ origins, destinations,
tickNo, population: this.stats.population })` unconditionally, every tick —
traffic has no cadence divisor. It is not alone in that: transit, service
dispatch and the garbage trucks are all called unconditionally alongside it.
What _is_ gated is service **coverage** (`ServiceSim`, period 8) and trash
**generation and collection** (`GarbageSystem`, period 10) — the systems that
write into fields rather than the ones that animate. See
[../../world-sim/tick.md](../../world-sim/tick.md) for the full order and every
cadence.

Inside `TrafficSystem.tick`:

- Once a sim day (`tickNo % TICKS_PER_DAY === 0`, `TICKS_PER_DAY` = 200 ticks
  = 10 real seconds at 1×), it calls `network.decayVolumes(DAILY_DECAY_FACTOR)`
  — a flat half-life on every edge's accumulated volume. `decayVolumes` also
  re-runs `refreshControls()` inside `RoadNetwork`, so a junction's warranted
  stop/yield/signal control is only ever re-evaluated at this same daily
  cadence (or on a graph rebuild) — never continuously as volume climbs
  through the day.
- `advanceVehicles()` moves every occupied cosmetic-vehicle slot forward by
  `speedMps * TICK_SECONDS`, clamped by a headway check against whatever else
  shares its segment.
- `tripsForTick(population, tickNo)` sets the trip budget for this tick: a
  population-scaled ceiling (`BASE_TRIPS_PER_TICK` plus up to
  `POP_TRIPS_SPAN` more as population approaches `POP_FULL_TRAFFIC`)
  multiplied by a rush-hour activity curve that floors at
  `NIGHT_ACTIVITY_FLOOR` overnight (see [traffic-model.md](../../world-sim/traffic-model.md) for the
  curve's shape) — at most 10 trips a tick even for a full city at rush hour.
- `sampleTrips` then draws that many (origin, destination) pairs with the
  injected seeded `Rng`, alternating direction every other trip so a road
  carries both the commute out and the commute back, and calls
  `network.findPath(from, to, jitter)` once per trip — one A\* search each,
  no re-solving of the batch to a fixed point. The `jitter` is a per-trip cost
  multiplier seeded by a pure hash of the trip's own origin/destination tiles
  (`tripSeed` → `hash2Unit`), not drawn from the `Rng` stream, so it spreads
  different trips across a grid's equal-cost parallel streets without
  consuming a random draw the determinism check would have to account for.

Every successful path immediately calls `network.addVolume(path.edges, 1)`,
which mutates each edge's `volume` in place before the loop moves to the next
trip — so a trip sampled later in the _same_ tick already routes against the
congestion the earlier trips in that tick just added. Across ticks, volume
simply accumulates until the next daily decay; there is no separate
convergence pass. This single sequential loop, run once per tick over a small
batch, is the entire assignment: statistical, rolling, never solved to
equilibrium.

The same loop drives the cosmetic layer. A path that added volume also gets a
cosmetic vehicle, if the network's live-tile-scaled `vehicleDensityCap` and a
free pool slot allow it: `spawnVehicle` truncates the path to its longest
cardinally-adjacent prefix (`truncateToAdjacentChain`), rounds every turn into
a short arc (`smoothCorners`), picks a per-vehicle speed and kind, and claims
a slot in the fixed `MAX_VEHICLES` = 1024 pool. `advanceVehicles` then walks
every occupied slot each tick until it reaches the end of its captured route
and frees the slot. Vehicle count on an edge is proportional to, not equal
to, that edge's `volume` — it is additionally capped by the density cap and
by how many of the fixed pool's slots are free, including slots other
cosmetic systems (garbage trucks) share the same pool's tail with.

## Invariants

- **Determinism.** Neither `traffic.ts` nor `pathfind.ts` calls
  `Math.random` or `Date.now`; `TrafficSystem` takes an injected seeded `Rng`
  and the route-jitter is a pure hash rather than an `Rng` draw specifically
  so it can never perturb the RNG sequence the rest of the sim depends on.
  `describe('TrafficSystem determinism', …)` in `src/sim/traffic.test.ts`
  pins it directly: "produces identical vehicle buffers and network calls for
  two runs sharing a seed" runs two independently constructed systems off the
  same seed for `TICKS_PER_DAY + 10` ticks and asserts the vehicle buffers and
  the recorded sequences of `addVolume`/`decayVolumes` calls are exactly
  equal; a companion test asserts two different seeds diverge. This is the
  traffic-specific instance of the project-wide guarantee in
  [ADR-0002](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
  that a seed plus a command log always reproduces the same state.
- **Graph changes under in-flight routes.** `RoadNetwork.invalidateRegion`
  only sets a dirty flag; despite taking region bounds, the next query
  (`findPath`/`getEdges`/`getNodes`/`addVolume`) rebuilds the **entire** graph
  from the grid (`ensureFresh` → `buildGraph`), reassigning every node and
  edge id. A cosmetic vehicle already animating holds its own captured
  `points`/`segmentLengths` from the tick it spawned and has no reference
  back to the network — it keeps driving its captured line to the end even
  if the road under it is bulldozed mid-route; nothing reroutes, removes, or
  teleports it. Only trips sampled _after_ the edit see the rebuilt graph.
- **On-road guarantee for animation.** `truncateToAdjacentChain` drops a
  spawned path at its first non-cardinally-adjacent seam, so even a
  misbehaving injected `RoadNetworkApi` can never animate a vehicle in a
  straight line across non-road terrain; the real `RoadNetwork` never
  produces such a seam by construction, so this is defensive rather than load
  bearing in practice.

## Interactions

Traffic depends on `RoadNetworkApi` (`findPath`, `addVolume`, `getEdges`,
`decayVolumes`) as an injected interface, never importing `roads.ts`
directly — see [interfaces.md](../interfaces.md) for the shape. A district's
`noHeavyTraffic` policy reaches routing through `RoadNetwork.setEdgeCostHook`,
composed with each trip's own jitter multiplier, so through-traffic can be
made to prefer routing around a district without changing the base cost
model.

`GraphEdge.volume`, once written, is read by three independent consumers with
three independent notions of "how full": `pathfind.ts`'s own
`approachSaturation` (profile-derived capacity, drives cost and delay),
`RoadNetwork.refreshControls`'s warrant (same capacity, decides whether a
junction gets a control at all), and `src/sim/fields.ts`'s `applyTraffic`,
which paints the `Traffic` scalar field that feeds land value and pollution —
see [traffic-model.md](../../world-sim/traffic-model.md) for those effects. The vehicle buffer
(`TrafficSystem.vehicleBuffer`, a `Float32Array`) is the only thing sent
toward render; it is consumed as an instanced-mesh source, not read back into
the sim.

## Cost

The A\* search space scales with road **topology** — the number of
junctions, dead ends, and tier boundaries — not with map area, because nodes
only exist at those points; a long uninterrupted avenue is one edge
regardless of its tile length. Per trip, the search is one binary-heap A\*
whose state space is at most twice the edge count (node **and** arriving
edge). Per tick, at most `tripsForTick` searches run — bounded at 10 by
`BASE_TRIPS_PER_TICK` + `POP_TRIPS_SPAN` regardless of population — so at
`TICK_RATE` = 20 ticks/second the assignment loop never issues more than
roughly 200 path searches a second, independent of city size.

The expensive edge is a graph rebuild, not a search: `buildGraph` walks every
road tile once per rebuild (mask computation, node/edge detection, then
`markLaneDrops` over every node), and it is triggered lazily by the next
query after _any_ road edit anywhere on the map — `invalidateRegion`'s bounds
are accepted but not used to scope the rebuild. A single-tile edit costs
exactly as much, at the next query, as a citywide road overhaul.

No dedicated performance test or benchmark exists for either the assignment
loop or the graph rebuild (`traffic.test.ts`, `pathfind.test.ts`, and
`worker.entry.test.ts` carry no `performance.now`/benchmark assertions). The
only sized budget in the codebase is architectural, not traffic-specific:
[ADR-0010](../adr/0010-map-size-is-capped.md)'s 60 fps target at 256×256
tiles, 10k buildings, and roughly 300 draw calls — traffic's per-tick cost is
what that budget has to fit inside, not a figure measured on its own.

## Where it breaks

- **Two capacity models for one number.** Routing, congestion cost, and
  junction warrants all read `profileCapacity` (HCM-derived, per lane piece,
  from `roadprofile.ts`). The `Traffic` scalar field that drives land value
  and pollution (`fields.ts`'s `applyTraffic`) instead computes capacity as
  `edge.tier * TRAFFIC_CAPACITY_PER_TIER`, a flat per-tier constant that knows
  nothing about a profile's actual lane count or transit pieces. Editing a
  road's cross-section changes routing and junction delay immediately without
  changing how full that road paints in the pollution/land-value fields — the
  two "percent full" readings are not on the same scale, and nothing keeps
  them in sync.
- **Two day lengths.** Volume decay and junction-control re-warranting fire
  on `TICKS_PER_DAY` (200 ticks), while the rush-hour trip curve rides
  `VISUAL_DAY_TICKS` (2400 ticks) — twelve times longer. Volume decays twelve
  times over one full rush-hour cycle, and a junction's control can appear or
  disappear mid-visual-day with no corresponding change in the curve that is
  driving trip counts. Tuning one cadence does not move the other.
- **A road edit is always a full rebuild.** Every node and edge id is
  reassigned on the next query after any edit, anywhere on the map, despite
  `invalidateRegion` accepting bounds that suggest otherwise. Anything that
  held an edge or node id across the edit is holding a stale reference; the
  traffic system itself never checks for this because it never keeps one
  across a tick boundary, but a future consumer that does would break
  silently.
- **In-flight vehicles do not react to edits.** An `ActiveVehicle`'s route is
  captured once at spawn and never revalidated; bulldozing the road under a
  vehicle already animating does not reroute, despawn, or even flag it — it
  finishes driving a line that may no longer exist as a road. This is a
  purely visual bug with no test coverage, because nothing about it touches
  volume or determinism.
- **Cosmetic density is not what it looks like.** Spawning is gated by a
  citywide `vehicleDensityCap` and a fixed 1024-slot pool shared with other
  cosmetic systems (garbage trucks take the pool's tail); under load a spawn
  is silently skipped once either limit is hit, while the `volume` it would
  have represented is still added. A quiet-looking road can already be
  saturated in the numbers that drive delay, land value, and pollution — a
  screenshot is not evidence of what the assignment believes.
- **The route jitter is fixed per origin-destination pair.** `tripSeed`
  hashes only the endpoints, so every trip between the same two tiles prefers
  the same detour forever. It breaks up the single-tick "snake," but it never
  rebalances load between two parallel streets serving the same pair; only
  different endpoints shift which one is favored.
- **The `population`-less fallback is a different model, not a degraded one.**
  Any caller that omits `population` — every test double that does not wire
  it through — falls back to a flat `TRIPS_PER_TICK` = 4 with no rush-hour
  shape. Reading such a test in isolation from `worker.entry.ts`'s real wiring
  gives a false impression of how trip volume actually behaves live.
