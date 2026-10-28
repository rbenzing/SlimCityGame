# How it runs

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
[../../world-sim/tick.md](../../../world-sim/tick.md) for the full order and every
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
  `NIGHT_ACTIVITY_FLOOR` overnight (see [traffic-model.md](../../../world-sim/traffic-model.md) for the
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
free pool slot allow it: `spawnVehicle` drives the path's `route` — the line
the graph built from its roads' own shapes, each grid tile's centre and a
road off the grid's centre line about every 5 m (`cellRoute` in
`src/world/roadnet.ts`, joined per edge in `buildGraph` and per path in
`findPath`) — rounds every turn into a short arc (`smoothCorners`), picks a
per-vehicle speed and kind, and claims
a slot in the fixed `MAX_VEHICLES` = 1024 pool. `advanceVehicles` then walks
every occupied slot each tick until it reaches the end of its captured route
and frees the slot. Vehicle count on an edge is proportional to, not equal
to, that edge's `volume` — it is additionally capped by the density cap and
by how many of the fixed pool's slots are free, including slots other
cosmetic systems (garbage trucks) share the same pool's tail with.

