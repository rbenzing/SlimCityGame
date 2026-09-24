# Utilities model

Power and water production, road-borne coverage, power lines and conducting
roads, and brownouts.

## Production and demand

A utility building generates power (MW) or water (kL); its footprint is a
source the network reaches out from. The starting catalog holds a coal plant
(4×4, 60 MW, 140 pollution, ¢12,000 to build, ¢800/month upkeep), a wind
turbine (1×1, 6 MW, no pollution, ¢3,000, ¢100/month) and a water tower (2×2,
400 kL, ¢2,500, ¢120/month); all three are available from the first
milestone. Demand is the sum of every non-abandoned building's own catalog
`powerUse`/`waterUse`, recomputed every tick alongside supply.

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
`carriesWater: false`; in the current road set only the highway and the ramp
are excluded, so a suburban street of any tier carries water and a highway
does not. A tile that fails to conduct is not merely unsupplied — it is not a
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

When total demand exceeds total supply for either utility, consumers are cut
in ascending building-id order: each building's usage accumulates against the
available supply, and the moment the running total exceeds it, that building
— and every building after it in id order — loses coverage on its own
footprint tiles only. The rest of the network, and every consumer already
counted, keeps what it has.

A building that goes three consecutive growth passes without power, water,
or road access while Active abandons.
