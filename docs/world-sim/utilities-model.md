# Utilities model

Power and water production, road-borne coverage, power lines and conducting
roads, and brownouts.

## Production and demand

A utility building generates power (MW) or water (kL); its footprint is a
source the network reaches out from. The starting catalog holds a coal plant
(4×4, 60 MW, 140 pollution, ¢12,000 to build, ¢800/month upkeep), a wind
turbine (1×1, 6 MW, no pollution, ¢3,000, ¢100/month) and a water tower (2×2,
400 kL, ¢2,500, ¢120/month); all three are available from the first
milestone. Demand is the sum of the catalog `powerUse`/`waterUse` of every
building the network reaches — abandoned ones included, since they keep their
place in line (see [Brownouts](#brownouts)) — and of nothing it does not
reach, which draws nothing. It is recomputed with supply on every utility
pass. A building whose catalog entry draws no water — a farm, which pumps its
own well — needs none: it is never held back or flagged `NoWater` for the
want of a pipe.

Supply is a single city-wide total and **every generator counts towards it,
connected or not**. That is deliberate — it keeps supply a property of what
the city has built rather than of the order things were built in — but on its
own it is a trap: a water tower set one tile clear of the road reports its
full 400 kL while not one tile is watered, so the figures read healthy, the
city quietly refuses to grow, and nothing on screen contradicts the player.

So a generator that cannot deliver has to say so. A utility whose footprint
touches no tile that conducts **what it produces** carries `Problem.NoRoad`
like any other cut-off building, which puts it in the advisor's existing "cut
off from the road network" count and on its own info panel. The supply total
is unchanged; what changes is that the mistake is visible.

Touching a road is not the test, because not every road carries everything: a
motorway and a ramp carry no water, an unsealed lane conducts no power, and a
power line carries electricity and nothing else. A water tower beside a
motorway is as stranded as one in a field. So the check asks the same
predicates the coverage walk above seeds its search from, rather than a second
idea of "connected" that could drift away from the first — a generator making
both power and water needs a conductor for each. A generator reached only by a
power line strung across the valley is connected for electricity and flags
nothing.

## Coverage: a walk along the road network

Power and water do not radiate from a utility building as a plain-radius
circle. Coverage is computed identically for both: a breadth-first walk
starts from every tile of the network (road or power line, see
[Conducting roads and power lines](#conducting-roads-and-power-lines))
orthogonally adjacent to a generator's footprint, crosses every connected
tile that conducts — along a road, only where the road network joins one
road to the next ([road-network.md](road-network.md)), so never across to a
road that merely lies alongside or sits at another level; a power line hands
supply to whatever stands beside it — and then radiates one further orthogonal step onto
non-road tiles around each reached tile — which is how an off-road building
or zoned lot picks up supply from the street beside it. A building counts as
served if any one tile of its footprint is covered, not all of them.

## Conducting roads and power lines

Water conducts along every street-tier road tile whose spec does not set
`carriesWater: false`. In the current road set the dirt road, the highway and
the ramp are excluded, so a paved street of any tier carries water and a
dirt track or a motorway does not. A dirt road has no main under it, just as
it has no cable, and the houses along one pump their own wells (see
[a house on a well](../game-design/simulation-rules.md#a-house-on-a-well)).
A tile that fails to conduct is not merely unsupplied — it is not a
bridge either, so the network cannot pass through it to reach a tile beyond.

Power is stricter: a road conducts it only if the road is **sealed**, read
directly from the road class's own `surface` field (`paved` conducts,
`gravel` does not) rather than a separate flag, so the road data and the
conduction rule can never disagree. Of the current road classes only the
dirt track is unsealed; every paved class conducts, the alley and the
highway included — a motorway lights its own lamps. Rail is not a street and
conducts neither utility.

A power line is a network of its own: not a road, carrying no traffic and no
tier, conducting between its own tiles and into any road or building
footprint it touches. It is how supply reaches a lot on an unsealed lane, a
pumping station across a gap in the road grid, or a district a highway cuts
off. Stringing it costs ¢12/tile, cheaper than the cheapest road tile so a
line is always the answer for reaching further rather than a decoration;
upkeep is ¢0.5/tile/month, booked through the same monthly expense pass as
road upkeep (see the tax income, upkeep, and budget section of the economy
documentation). A line will not stand on open water or on a building's own
footprint, and dragging back over an already-strung run charges nothing
further.

A road tile with no power supply carries no street lamp: the lamp-placement
pass skips any tile the grid reports as unpowered, so the network's reach
reads directly off the street after dark. See [../art/README.md](../art/README.md)
for what a lit or dark pole looks like.

## Brownouts

When the buildings the network reaches ask for more than the city supplies,
the grid gives out from its far end. Every building the network reaches
stands in one line, nearest first: by the number of network steps between its
footprint and the nearest generator (the generator's own footprint is step 0,
the network beside it step 1, and a lot beside a reached road one step
further), then by ascending building id. Each building's use accumulates
against the supply, and the moment the running total exceeds it, that
building — and every building after it — loses coverage on its own footprint
tiles only. The streets, and every building nearer the source, keep what they
have. A building the network does not reach is not in the line: it has no
supply to lose and takes none from anyone else. Nor is a house on a private
well in the water line, even where the network reaches its lot: it draws
nothing from the mains.

A building keeps its place in the line whatever its state. One under
construction is about to draw its share, and an abandoned one would draw it
again the moment it came back, so abandoning never hands a building its own
supply back. A home past the end of the supply stays dark, abandons after
three growth passes and is removed ten passes after that; nothing nearer the
source is touched, and nothing flips back and forth. More supply relights the
line from the source outward.

Supply and use are counted in whole millionths — watts and millilitres — so
a grid that exactly meets its load is never cut by a rounding error, and a
house's 1.4 kW counts as 1,400 W rather than rounding to 1 kW. A building's
`powerUse` is its average draw in MW and its `waterUse` its average draw in
kL a day; where those figures come from is in
[../game-design/features/building-types.md](../game-design/features/building-types.md).

A building the cut leaves dark carries `PowerShortage` (or `WaterShortage`)
beside `NoPower` (or `NoWater`), so the advisor can tell a grid that is too
small from a network with a gap in it. The shortage flag only says why; the
`NoPower` or `NoWater` beside it is what counts towards abandonment.

A building that goes three consecutive growth passes without power, water,
or road access while Active abandons. Growth does not build into a shortage:
a lot develops, and a building levels up, only when the grid has the spare
supply for it (see
[the spawner](../game-design/simulation-rules.md#the-spawner-how-a-lot-is-chosen)).
