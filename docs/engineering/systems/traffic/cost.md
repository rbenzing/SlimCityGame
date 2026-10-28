# Cost

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
road cell once per rebuild (link counting, node/edge detection, then
`markLaneDrops` over every node), and it is triggered lazily by the next
query after _any_ road edit anywhere on the map — `invalidateRegion`'s bounds
are accepted but not used to scope the rebuild. A single-tile edit costs
exactly as much, at the next query, as a citywide road overhaul.

No dedicated performance test or benchmark exists for either the assignment
loop or the graph rebuild (`traffic.test.ts`, `pathfind.test.ts`, and
the interaction tests under `tests/interaction/` carry no
`performance.now`/benchmark assertions). The
only sized budget in the codebase is architectural, not traffic-specific:
[ADR-0010](../../adr/0010-map-size-is-capped.md)'s 60 fps target at 256×256
tiles, 10k buildings, and roughly 300 draw calls — traffic's per-tick cost is
what that budget has to fit inside, not a figure measured on its own.

