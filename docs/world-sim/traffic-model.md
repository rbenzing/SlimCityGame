# Traffic model

Statistical assignment, path cost, congestion feedback, and cosmetic
vehicles.

Traffic is a **statistical assignment**, not a per-agent simulation. Each
tick, a handful of origin/destination pairs are sampled and routed once
over the road network; a successful route adds volume to its edges (which
feeds congestion and land value elsewhere), and — purely for visual
flavour — claims a slot in a fixed cosmetic-vehicle pool that animates
along that same route until it arrives. No trip exists without a home and
a workplace behind it: the worker builds its origin list from active
residential buildings and its destination list from active
commercial/industrial buildings, and sampling no-ops when either list is
empty.

**Trip volume ties to people and to the time of day.** The trips attempted
each tick are
`round( rushHourActivity(hour) × (5 + 5 · min(1, population / 2000)) )` —
a baseline of 5 trips/tick that a lone active neighbourhood still
generates, rising to 10 as the city's population approaches 2,000 and
beyond (population only adds on top of the baseline, so a small but active
town still shows daytime traffic while a metropolis at rush hour spawns
markedly more). `rushHourActivity(hour)` is a pure function of the visual
clock's hour: two commute peaks (a Gaussian centred on 8:00 with σ = 1.5,
and one centred on 17:30 with σ = 2) riding a 0.4 daytime plateau between
7:00 and 20:00, dropping to a 0.04 overnight floor so a city is never
completely dead. Concurrent cosmetic vehicles are separately capped at
`round(0.35 × live road tile count)`, clamped between 24 and the fixed
vehicle pool size, so a tiny town's handful of roads can never fill the
whole pool into a visual gridlock, and a bigger road network carries more
cars at the same rush-hour intensity. Assigned volume itself decays by half
once per game day, so an edge's congestion reading tracks recent traffic
rather than an ever-accumulating total.

**Path cost is congestion-aware.** An edge's cost is
`(length / speed) × (1 + 2 · (volume / capacity))`, capped at v/c = 1 for
the multiplier, plus whatever junction delay the driver pays entering it
(see
[road-model.md#capacity-control-delay-and-warrants--the-formulas](road-model.md#capacity-control-delay-and-warrants--the-formulas)
and [road-model.md#ramps-and-interchanges](road-model.md#ramps-and-interchanges)
for the merge-delay term). A route that would cross a lane-drop taper is
limited to the narrower road's own capacity for that stretch, so a hard
lane drop reads as a real chokepoint rather than a free merge. Because a
grid offers many equal-cost routes between two points and a deterministic
A\* would otherwise send every trip down the exact same one, each trip's
edge costs carry a small, per-trip jitter (± up to 35%) seeded from a
deterministic hash of its own origin and destination — stable for that one
trip, different for the next one, and consuming no draw from the sim's
seeded RNG — so parallel streets share load instead of one filling
nose-to-tail while its neighbour sits empty.

**Cosmetic vehicles ride real routes, not the centreline.** A vehicle's
world-space path follows its assigned route exactly, offset to its
right-hand lane rather than straddling the tile centre, and every corner is
rounded into a short arc (radius 6 m) so it steers around a curved turn
tile instead of cutting the chord across the inside verge. Cruise speed is
`(3 + 1.5 × average edge tier) tiles/second`, jittered per vehicle between
85% and 115% of that so vehicles do not ride in exact lockstep, with a
minimum 6 m headway behind whatever is ahead on the same road segment, a
staggered start (up to 8 m into the first segment) so simultaneous spawns
never appear stacked, and at most one spawn per origin tile per tick. The
mix is 80% car, 15% truck, 5% bus. A vehicle's animated path is defensively
truncated to its longest run of cardinally-adjacent tiles, so a route that
somehow produced a diagonal seam gets its cosmetic animation dropped there
rather than visibly cutting across grass or water.

The cosmetic pool is a fixed set of slots reused as vehicles arrive and
new ones spawn; because a slot can be freed and reallocated to a brand-new
route in the same tick, and snapshots post only every few ticks, the
renderer treats any position jump greater than 2 tiles between two
snapshots of the same slot as a pool handoff rather than motion, and snaps
to the new position instead of interpolating a vehicle sliding across the
terrain between an old route's end and a new one's start.
