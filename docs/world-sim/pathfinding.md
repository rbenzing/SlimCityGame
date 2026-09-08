# Pathfinding

The routing algorithm every consumer shares — civilian traffic, transit
lines, service dispatch, and cosmetic garbage trucks all call the same
`findPath` (`src/world/pathfind.ts`, wrapped by `RoadNetwork.findPath` in
`src/world/roads.ts`) through the injected `RoadNetworkApi`. This document is
the algorithm itself: the graph it searches, the A* mechanics, and the one
unusual design decision — search state keyed on **(node, arriving edge)**
rather than bare node — that everything else here exists to explain. It
complements, and does not restate, two documents that already cover
adjacent ground in full: [road-model.md](road-model.md) has the capacity,
control-delay and warrant formulas this algorithm evaluates, and
[../engineering/systems/traffic.md](../engineering/systems/traffic.md)
describes how the traffic system that is `findPath`'s heaviest caller is
built.

## The graph

A `RoadNetwork` does not put one node per tile. `buildGraph` walks the grid
and places a node only at a tile that is an intersection, a dead end, an
isolated tile, or — even with exactly two road neighbors — a tile whose own
tier is strictly higher than at least one neighbor's, which plants exactly
one node at each straight-through tier boundary. An edge is the maximal run
of tiles between two nodes, carrying that run's tile list, tier,
tile-length, and a mutable `volume` that traffic writes and decays. Three
independent graphs exist over disjoint-or-overlapping tile predicates — the
street network, the rail network, and the tram network (a subset of the
street tiles) — see [entities.md](entities.md) and
[transit-model.md](transit-model.md).

The graph is cheap to search and expensive to rebuild: search state scales
with **topology** (junctions, dead ends, tier boundaries), not with map
area, since nodes exist only at those points and a long uninterrupted
avenue is one edge regardless of its tile length. But any edit anywhere on
the map invalidates the _entire_ cached graph, and the next query
(`findPath`/`getEdges`/`getNodes`/`addVolume`) rebuilds it wholesale,
reassigning every node and edge id in the process — `invalidateRegion`
accepts region bounds but never uses them to scope the rebuild.

## Endpoint resolution

`findPath` takes tile coordinates, not node ids. Each endpoint snaps to the
nearest graph node within 8 tiles Manhattan distance (`nearestNode`); if
none qualifies, the search fails outright. `RoadNetwork` overrides this with
a mid-run fallback (`edgeCovering`, backed by a lazily built tile→edge
index): a point standing mid-corridor on a long, junction-free run — exactly
the shape of a dedicated transit route — snaps to the nearer END of the
specific run it stands on, rather than resolving to nothing because the
nearest node happens to be 20 tiles away at either end of the corridor.

## The search: A* keyed on (node, arriving edge)

`findPath` is a standard binary-heap A*, admissible by construction: the
heuristic is Manhattan distance to the destination node divided by the
fastest tier's speed (`MAX_ROAD_SPEED`), which never overestimates the true
remaining cost because an edge's tile length is always at least the
Manhattan distance between its endpoints and every junction delay is
non-negative — so ignoring delays in the heuristic keeps it consistent.

The one departure from a textbook A* is what counts as a "node" in the
search. The open/closed sets are not keyed on a graph node id — they are
keyed on a node **and the edge that arrived there**, packed as
`edge.id * 2 + (which end)`, with a sentinel `START` state for a trip that
has not moved yet (`keyOf`/`edgeOfState`/`nodeOfState` in `pathfind.ts`).
Two paths that reach the same physical junction from different arms are
therefore two different search states, expanded and relaxed independently,
even though they will offer exactly the same set of onward edges.

This exists because **a turn's legality and its cost both depend on which
arm you arrived on, not just which junction you're at**:

- `turnAllowed` reads the arriving edge to work out the movement being made
  (`movementBetween(headingInto(arriving), headingOutOf(leaving))`) and
  checks it against that arm's turn restrictions
  (`GraphNode.turns`/`laneTurns`). The same junction, reached from the
  north, costs a left turn to go west and a right turn to go east — not the
  same restriction, and not the same delay.
- `junctionDelay` needs the same information to divide the junction's base
  delay by however many lanes actually serve that specific movement
  (`movementDelayShare`) — a movement with a dedicated turn pocket is
  cheaper than one sharing a lane with another movement at the identical
  junction, and that is only knowable once the arriving arm is known.

A driver "setting off" from a junction (the `START` state, or any state
whose `arriving` edge is null) pays no turn check and no junction delay —
there is nothing to have turned away from yet.

**A banned turn is not a longer path, it is no path at all.** `turnAllowed`
is checked before an edge is even relaxed; a movement no lane offers, or one
the player has explicitly restricted, is pruned out of the search entirely
rather than priced as an expensive detour. This is why the router will
never produce a U-turn at an ordinary junction (never offered by default)
without ever having to reason about it as "too costly" — it simply is not a
neighbor in the search graph from that arriving edge.

## The cost function

Per edge, the cost A* relaxes is `edgeCost(edge, fromNodeId) + junctionDelay`
— the congestion-scaled travel time plus whatever it costs to enter the
junction on the far end, evaluated the instant that edge is considered as a
candidate next step. The travel-time term and its congestion scaling are
already covered in full, with every number, in
[traffic-model.md](traffic-model.md#path-cost-is-congestion-aware); the
control-delay and warrant formulas `junctionDelay` calls into are in
[road-model.md](road-model.md#capacity-control-delay-and-warrants--the-formulas).
What is specific to the search itself: `directionShare` and
`narrowsAtA`/`narrowsAtB` make the congestion term direction-sensitive (an
edge with an uneven lane split, or one that tapers into a narrower road
ahead, costs a different amount depending on which node you are leaving
from), so the same edge can legitimately appear in the open set twice, at
different costs, via two different arriving states — another consequence
of keying state on the arriving edge rather than the bare node.

A motorway merge is priced the same way but is not a junction delay at all:
`mergeDelay` intercepts the one movement where the arriving edge is a ramp
and the leaving edge is a highway, and prices it off how full the highway
is in the direction being joined — nobody stops the driver and no control is
warranted, but finding a gap in fast traffic is never free. A driver already
on the highway, or one diverging off it, pays nothing here.

## Reconstruction

Once the destination node is settled (A* pops it off the heap — a
consistent heuristic guarantees the first pop is optimal), the path is
walked back through `cameFrom` to the `START` sentinel, giving a node
sequence and an edge sequence. `points` concatenates each traversed edge's
own tile list, reversed when the edge is walked b→a, deduplicating the tile
shared between consecutive edges at each seam — the polyline every
consumer (civilian traffic, transit, dispatch, garbage trucks) then walks
or renders is exactly this, with no further smoothing done here (cosmetic
corner-rounding is a render/animation concern — see
[agent-behavior.md](agent-behavior.md)).

## What every caller shares, and what it costs

Per trip, one A* search's state space is at most twice the edge count (node
**and** arriving edge). Per tick, the number of searches issued is bounded
by whatever calls `findPath` — for civilian traffic that is at most 10
(`BASE_TRIPS_PER_TICK + POP_TRIPS_SPAN`, see
[traffic-model.md](traffic-model.md)) regardless of city size; transit
recomputes one route per line every tick; dispatch and garbage trucks each
issue a bounded number of probe searches while placing a new vehicle. None
of these callers ever solves a batch of trips to a joint fixed point — each
`findPath` call is independent, sees whatever volume earlier calls in the
same tick already wrote via `addVolume`, and is never revisited once
returned.
