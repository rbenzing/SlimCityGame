# The model

The road graph is not one node per tile. `buildGraph` in `roadgraph.ts` walks
the road network's cells (`roadCellsOf` in `roadnet.ts`: one cell per road per
tile, linked only where the network joins them) and places a node only where
a road is an intersection, a dead end, an isolated road (it has other than
exactly two links), or —
even with exactly two neighbors — where its tier is strictly higher than a
neighbor's (`isNodeTile`). That last rule plants exactly one node at each
straight-through tier boundary, so a whole avenue is a single edge no matter
how many tiles long, and a tier change is where a wide run learns what it
narrows into. An edge is the maximal straight run of tiles between two nodes;
it carries the tile list (`GraphEdge.tiles`, ordered a→b), the line a vehicle
drives along it (`GraphEdge.route`, world metres a→b), its tier, its length in
tiles, its own `classId`/`lanes` read off the run's resolved
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
game-units constant — see [road-model.md](../../../world-sim/road-model/README.md) for the per-class numbers.
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
`shared/junction.ts`; see [road-model.md](../../../world-sim/road-model/README.md) for their shape). That base
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

