# Utilities model

Power, water and sewage production, road-borne coverage, power lines, pipes
and conducting roads, and brownouts.

## Production and demand

A utility building generates power (MW) or water (kL a day), or takes sewage
(kL a day); its footprint is a source the network reaches out from. A
generator's `powerMW` is its nameplate and its `capacityFactor` the published
share of the year a plant of its kind runs at rating; the grid counts the
product (`averageOutputMW`), and the inspector shows both. The catalog holds a
coal plant (4×4, 60 MW nameplate at 42.6%, so 25.6 MW delivered, 140
pollution, ¢12,000 to build, ¢800/month upkeep), a wind turbine (1×1, the
average new onshore machine: 3.4 MW at 33.5%, so 1.14 MW, drawn at its 103 m
hub and 134 m rotor, no pollution, ¢320, ¢9/month — every figure derived in
[../game-design/features/power-generation.md](../game-design/features/power-generation.md#the-generators-re-derived)),
a water tower (2×2, 378.5 kL — a 100,000-gallon tank on its
borehole, turned over once a day — ¢2,500, ¢120/month), a water pumping
station (2×2, 3,785 kL, the smallest one-million-gallon-a-day surface intake,
on a shore, from Small Town, ¢3,600, ¢180/month), a water drain pipe
(1×1, taking 3,785 kL of sewage a day, on a shore, raw into the water,
¢1,800, ¢90/month) and a sewage treatment works (2×2, taking the same
3,785 kL a day on a shore and discharging 15% of its load, 93 kW, 26
pollution, from Busy Township, ¢9,000, ¢520/month); where each figure comes
from is in
[../game-design/features/water-and-sewage.md](../game-design/features/water-and-sewage.md).
Demand is the sum of the catalog `powerUse`/`waterUse` of every building the
network reaches — abandoned ones included, since they keep their place in
line (see [Brownouts](#brownouts)) — and of nothing it does not reach, which
draws nothing. Sewage demand is the return-to-sewer share of each reached
building's city water (see [Sewage](#sewage)). All of it is recomputed with
supply on every utility pass. A building whose catalog entry draws no water
— a farm, which pumps its own well — needs none: it is never held back or
flagged `NoWater` for the want of a pipe, and makes no sewage.

Supply is a single city-wide total and **every generator counts towards it,
connected or not**. That is deliberate — it keeps supply a property of what
the city has built rather than of the order things were built in — but on its
own it is a trap: a water tower set one tile clear of the road reports its
full 378.5 kL while not one tile is watered, so the figures read healthy, the
city quietly refuses to grow, and nothing on screen contradicts the player.

So a generator that cannot deliver has to say so. A utility whose footprint
touches no tile that conducts **what it produces** carries `Problem.NoRoad`
like any other cut-off building, which puts it in the advisor's existing "cut
off from the road network" count and on its own info panel. The supply total
is unchanged; what changes is that the mistake is visible.

Touching a road is not the test, because not every road carries everything: a
motorway and a ramp carry no water, an unsealed lane conducts no power, and a
power line carries electricity and nothing else. A water tower beside a
motorway is as stranded as one in a field, and so is a drain. So the check
asks the same predicates the coverage walk above seeds its search from,
rather than a second idea of "connected" that could drift away from the first
— a generator making both power and water needs a conductor for each. A
generator reached only by a power line strung across the valley is connected
for electricity and flags nothing; a tower or a drain reached only by a pipe
is connected for water and flags nothing.

## Coverage: a walk along the road network

Power, water and sewage do not radiate from a utility building as a
plain-radius circle. Coverage is computed identically for all three: a
breadth-first walk starts from every tile of the network (road, power line or
pipe, see [Conducting roads, power lines and pipes](#conducting-roads-power-lines-and-pipes))
orthogonally adjacent to a generator's footprint, crosses every connected
tile that conducts — along a road, only where the road network joins one
road to the next ([road-network.md](road-network.md)), so never across to a
road that merely lies alongside or sits at another level; a line or a pipe
hands supply to whatever stands beside it — and then radiates one further
orthogonal step onto non-road tiles around each reached tile — which is how
an off-road building or zoned lot picks up supply from the street beside it.
A building counts as served if any one tile of its footprint is covered, not
all of them.

## Conducting roads, power lines and pipes

Water conducts along every street-tier road tile whose spec does not set
`carriesWater: false`, and along every water pipe tile. In the current road
set the dirt road, the highway and the ramp are excluded, so a paved street
of any tier carries water and a dirt track or a motorway does not. A dirt
road has no main under it, just as it has no cable, and the houses along one
pump their own wells (see
[a house on a well](../game-design/simulation-rules.md#a-house-on-a-well)).
A street's main is also its sewer — the manhole covers say so — so the sewage
walk below runs over exactly the tiles the water walk does. A tile that fails
to conduct is not merely unsupplied — it is not a bridge either, so the
network cannot pass through it to reach a tile beyond.

A **water pipe** is a network of its own, laid as the power line is strung:
not a road, carrying no traffic and no tier, conducting water and sewage
between its own tiles and into any road or building footprint it touches, and
nothing else. It is how an intake on a shore or an outfall at the water's
edge joins the mains, how water crosses a motorway or a railway that carries
none, and how a lot down a lane no main runs along is served. A pipe beside
a lot is a main, so a house there is on the mains and the sewer, not on a
well. Laying it costs ¢12 a tile and ¢0.5 a tile a month, the power line's
figures for the power line's reason; it will not cross open water or stand on
a building's footprint, and dragging back over a laid run charges nothing.
It is buried: the ground shows it, as a blue run beside a brown one, only
while a water tool is in hand or the Water or Sewer lens is on.

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

## Sewage

Sewage is the third utility, and it runs the other way. Every building that
draws city water makes sewage — `SEWAGE_RETURN_FRACTION`, 0.88, of its
`cityWaterUse`, the share public supply does not consume — so a house on a
well, which draws none, makes none for the town (it is on a septic tank), and
a farm makes none. Nothing is stored: a building's sewage is derived from the
one water figure the catalog carries.

A drain's `sewerKL` is the sewage it takes a day, summed over every Active or
Constructing drain into a city-wide total as water is. A drain reaches along
the same roads that carry water and the same pipes, by the same walk, and the
buildings it reaches line up by steps from the nearest drain; when they make
more than the drains take, the far end of the line loses its sewer on its
footprint tiles only, exactly as the water cut below. The drained coverage is
`g.sewered`, derived on every utility pass and never saved.

A building a drain does not reach, or the drains ran out before, carries
`NoSewer` (and `SewerShortage` beside it where the network reaches it but
the capacity did not). Neither abandons it. What they do: a lot grows, and a
building levels up, only where a drain reaches it with room for its sewage,
so the town stops growing where it has no sewer; and a standing building
nothing drains fouls the ground around it in proportion to its sewage
(`SEWAGE_POLLUTION_PER_KL` per kL a day, never less than one unit a pass),
through the ordinary emission pass in
[environmental-simulation.md](environmental-simulation.md#pollution-fieldidpollution--1).
A city saved before there were drains therefore loads standing, every home
flagged and a little dirtier, and the Advisor says to build a drain.

A **sewage treatment works** is a drain with `utility.effluent`: the share
of its sewage's load that reaches the water, 0.15 for secondary treatment
against the raw outfall's implicit 1. It takes the same 3,785 kL a day the
drain does, reaches and is cut the same way, and differs only in what it
costs and what comes out, below.

## The fouled water

What the drains empty comes back on the water. On every utility pass, after
the sewer cut and before the water pass, `recomputeUtilities` works out how
much sewage the drains actually took — `min(sewerDemand, sewerSupply)` — and
gives each drain or works its share by rated capacity, times its effluent.
That discharge, at `WATER_FOUL_PER_KL` per kL a day and saturating at 255,
is emitted at every water tile orthogonally beside the building's footprint,
and `spreadFouling` carries it across connected water: one multi-source walk
over `g.water`, four-connected, seeded from every discharge at once, each
tile taking `max(held, emit × (1 − hops / WATER_FOUL_REACH_TILES))` and the
walk stopping at the reach, 25 tiles. It never crosses land, two stains that
meet take the worse, and a drain that takes nothing emits nothing. The
result is `g.waterFoul`, 0..255 on water and 0 on land, zeroed and rebuilt
each pass and never saved; it travels to the render thread as a full-map
patch when it changes, and the water surface tints toward brown with it.

A **pumping station** draws from the water beside it, so its yield is
`waterKL × (1 − foul / 255)` for the worst fouling on the water tiles beside
its footprint, and the yield, not the rating, is what `waterSupply` sums;
the difference sums into `waterFouled`, and each intake's fraction is kept
for the inspector. The water tower, on its borehole, has no water beside it
and is never scaled. The sewer pass therefore runs before the water pass:
the discharge needs the sewer cut, the yield needs the discharge, and the
water cut needs the yield. There is no cycle, because a building's sewage is
a share of the water its catalog entry draws, not of the water delivered.

There is no current and no downstream — real flow is a heightfield
simulation the world model rejects on cost — so the fouling spreads the same
way in every direction, and a player's remedy for an intake drinking fouled
water is distance, or treating the sewage before it goes back.

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
or road access while Active abandons; one without a sewer never does. Growth
does not build into a shortage: a lot develops, and a building levels up,
only when the grid has the spare supply — power, water and drain — for it
(see [the spawner](../game-design/simulation-rules.md#the-spawner-how-a-lot-is-chosen)).
