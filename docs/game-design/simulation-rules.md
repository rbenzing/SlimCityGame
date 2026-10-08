# Simulation rules

What decides whether a tile can be zoned, how demand pulls buildings out of
the ground, and how those buildings construct, level up, and abandon. This is
the ruleset behind [gameplay-loop.md](gameplay-loop.md)'s minute-to-minute
loop; the tuning constants it names are gathered in
[balancing.md](balancing.md).

## Zone types

Ten zone types exist, grouped into three demand sectors — residential,
commercial, and industrial — each gated behind a milestone (a city-size
tier reached by population; milestone 0 is reached at 0 population,
milestone 1 at 400, milestone 2 at 1,200, milestone 3 at 3,500, and
milestone 4 at 8,000):

- **Low Density Housing** (`ResLow`) — single and semi-detached houses.
  Milestone 0.
- **Medium Density Row Housing** (`ResMediumRow`) — narrow attached row
  houses, three homes on one normal 1×2 lot at every level. Milestone 1.
- **Medium Density Housing** (`ResMedium`) — small apartment blocks.
  Milestone 2.
- **Mixed Housing** (`Mixed`) — commercial ground floor with apartments
  above; a single building carries both residents and jobs, pulling on
  residential demand while its jobs count toward commercial demand like any
  other job. Milestone 3.
- **High Density Housing** (`ResHigh`) — large apartment towers.
  Milestone 4.
- **Low Density Business** (`ComLow`) — stores and shops. Milestone 0.
- **High Density Business** (`ComHigh`) — malls, offices, and hotels.
  Milestone 4.
- **Industrial** (`Industrial`) — light industry: workshops and warehouses
  from milestone 0, factories from Small Town (milestone 1), flex and R&D
  buildings from Big Town (milestone 3). Its jobs are the basic jobs a town
  lives by.
- **Heavy Industrial** (`IndHeavy`) — the plants that pollute and make
  noise, kept off the housing by the player's own hand: food plants, chemical
  plants, steelworks and paper mills. It pulls on industrial demand like the
  Industrial zone, its jobs are basic jobs, and it is zoned and served the
  same way. Milestone 2, Busy Township, when a town's workforce can staff a
  plant.
- **Agriculture** (`Agriculture`) — farmland off a dirt road, on soil that
  can be farmed. It pulls on industrial demand, and its farms' jobs are
  industrial jobs: a farm is the basic industry of a small town, as a mill
  is. The soil under a lot decides whether it grows row crops, an orchard or
  pasture. Milestone 0.

`ZoneType` numbers 1–5 (the original five zones), 6–8 (the next three), 9
(Agriculture) and 10 (Heavy Industrial) are stored in the tile grid, in
saves, and in zone-paint patches, so they are never renumbered or reused.

## Frontage and zonability

One predicate decides whether a tile can be zoned at all, and both the
visual zoning grid and the zone-paint command defer to it — they can never
disagree about what is zonable.

A road tile's frontage is the sides a lot could front onto, derived from
its own orthogonal road neighbours:

- A straight run, a turn, or a junction fronts every side that is not
  itself connected to another road tile (a straight run fronts its two
  parallel sides; a turn or a T fronts each of its open sides; a four-way
  junction fronts none).
- A dangling end — exactly one road neighbour — fronts only the two sides
  perpendicular to that neighbour, never the open end, so nothing zones
  on, or straight across, the end of a road.
- An isolated road tile with no road neighbour has no run and so no
  frontage.
- Only a drivable street tier provides frontage; rail does not. A bridge
  deck provides none either — there is no way onto a lot from a road
  passing overhead.

From every frontage side, the zonable area marches straight outward, up to
`ZONE_DEPTH` = 3 tiles deep, and stops at the first blocking tile — water,
another road, a building, out of bounds, or a slope past
`MAX_BUILD_SLOPE`. Tiles beyond a block have no direct access from that
frontage and are not zonable, even if they sit within the 3-tile depth. The
zonable set is the union of every road tile's frontage marches.

The depth is the same number as `ROAD_CHECK_RADIUS`, the distance a lot may
stand from its street, and it is three because that is the deepest lot the
catalogue holds: a lot grows only when the utilities reach a tile of it, and
they reach one tile off the road, so every lot's first row touches the row
beside the street and a 3×3 house or a 2×3 estate reaches exactly to the
depth. A fourth row was land the brush painted and nothing could ever grow
on — in one grown town, a third of everything zoned — and the second tier of
lots behind the first belongs to the street behind the block, as it does in
a real subdivision, never to a deeper march from the same street.

**Farmland** is the same march with two differences, and the same one
predicate (`zonableMaskFor`) decides it for the grid and for painting:

- Only a **dirt road** fronts it. A farm's gate opens onto a dirt road and
  nothing else, so no paved street, lane or motorway fronts farmland — though
  a field may run right up to one, since a road is where the march stops.
- It runs `FARM_DEPTH` = 8 tiles deep, since fields lie further back from
  their road than a house lot does, and it marks only tiles whose
  [soil](../world-sim/world-model.md#soil) can be farmed. Unfit ground is left
  unzoned but does not stop the march: a field runs on past a stony corner,
  and only what blocks any lot stops it.

Painting a zone onto a tile additionally requires the tile to be buildable
and carry no road; painting anything other than a de-zone additionally
requires the tile to be free of a building and inside the
frontage-reachable set above. Clearing a zone is exempt from the frontage
check, so a zone can always be removed, even from a tile a road no longer
reaches. A zone therefore changes only empty land: a building keeps the
zone it grew on for life, and a denser zone painted over a built-up block
takes only the gaps, while the houses stand and level up as the kind they
are. A stroke that falls wholly on buildings changes nothing and is refused
with a reason that says so; the way to densify a built block is the
bulldozer, as it is in a real town. The zoning grid itself is drawn only while a zoning tool is the
active tool.

## Demand: the RCI model

The city's economy runs the way a real town's does, by economic base theory.
Its **industry** is the basic sector — the farms, mills and factories that
sell beyond the town and are the reason it exists — and its **commerce** is
the local sector, the shops and services its own people keep in business.
Basic jobs bring workers, workers bring households, and what they earn keeps
the local jobs going. Measured across nearly 200 small US communities, total
employment runs **1.81** times basic employment (Mulligan, _Regional Science
Policy & Practice_ 1(1), 2008; Bartik & Sotherland, Upjohn Institute 2019,
put local multipliers "closer to 1.5 than to 2.0" and find them no larger in
larger places), so each industrial job supports 0.81 commercial ones
(`BASE_MULTIPLIER`). The workforce is half the population: the US labour
force is 50.0% of residents (BLS Current Population Survey, 2025 annual
average; `EMPLOYMENT_RATE`).

Three coupled demand values — residential, commercial, industrial — sit in
-1..1: positive means the city wants more of that zone, negative means it is
oversupplied. Each is a pure function of population, jobs by sector, each
sector's tax rate, and city-wide happiness, with no randomness:

- **Industrial** = (workforce ÷ 1.81 − industrial jobs, open or going up) ÷
  max(16, workforce ÷ 1.81) − (indTax − 9%) × 4. The basic jobs a workforce calls for are the ones
  that, with the local jobs they support, would employ all of it. A town
  short of them wants industry; one with more than its people can fill does
  not. The 16 is one small factory's jobs (`ind-1`), so a town a whole
  factory short reads full demand.
- **Commercial** = (0.81 × open industrial jobs − commercial jobs, open or
  going up) ÷ max(8, 0.81 × open industrial jobs) − (comTax − 9%) × 4. Shops follow the basic economy: a town
  with no industry supports no shops however many people live in it, and
  shops beyond what its industry supports stand empty. The 8 is one corner
  shop's jobs (`com-low-1`, the first low-commercial entry in the catalog).
- **Residential** = 0.3 + (jobs − workforce) ÷ max(200, population × 0.5) +
  (happiness − 50) ÷ 150 − (resTax − 9%) × 4. People follow work: empty jobs
  pull residents in, and a workforce with no work for it turns them away. The
  0.3 lets a town's first households — its founders — arrive before there is
  any work at all. A happier city draws people; a residential tax above the
  9% default repels them.

Jobs in buildings still under construction count as supply on both sides —
industrial ones against the basic jobs wanted, commercial ones against the
local jobs supported — because a developer sees the building going up next
door. Only open industry supports shops: its wages start when it opens. The
two gaps — the local jobs supported less those open or going up, and the
basic jobs wanted less those open or going up — are the **room** the economy
has for each sector's jobs, and the spawner reads them: a business opens
only where its jobs fit the room, so a sector may overshoot what it supports
by at most the smallest building that fits a lot, the one that fills its
last gap.

Every result is clamped to -1..1. So a new town grows the way a farming or
mill town does: its first households arrive, the industry they need follows,
and the shops come once there are wages to spend in them. A town of 84 with
46 shop jobs and no industry, say, has a workforce of 42 that calls for 23
basic jobs: industrial demand is full, commercial demand is at its floor
because nothing supports those shops, and it grows industry, not more shops.
A town with people and no industry stops growing until it gets some.

## The spawner: how a lot is chosen

Growth runs a pass every `GROWTH_INTERVAL` = 10 ticks. Rather than rescan
the whole map on every pass, each pass sweeps one rotating 1-in-32 stride of
the map's tiles, so the full map is covered once every 32 passes.

A candidate tile must be zoned to a sector, carry no building yet, and sit
within Manhattan distance 3 of a street tile. The zone's level-1 catalog
entries unlocked at or below the current milestone are its **kinds** — a
detached house, a duplex and a fourplex on low-density land, say — and the
ones whose footprint fits unobstructed at the tile, every tile of it zoned
the same, are the lot's candidates. A building never spills onto ground
beside its zone, so a strip zoned one tile wide grows only what is one tile
wide. A commercial or industrial candidate must also fit the economy: its
jobs must be within the sector's room (see
[Demand](#demand-the-rci-model)), except the smallest kind that fits the
lot, which is always a candidate so that growth never stalls at a gap smaller
than any building. The room counts down as the pass builds, like spare
supply, so two lots on one pass cannot both fill it.
A detached house stands on a parcel of the plat cut from its street: each run
of tiles along a street is cut a frontage at a time into the largest lot the
land value there warrants that fits (under 64 a half lot, 1×1; 64 to 159 a
normal lot, 1×2; 160 to 223 a double lot, 2×2; 224 and over an acre lot,
3×3, or an estate lot, 2×3, where only two tiles of frontage are free), turned
to run along its street, stepping over what already stands, and
only the tile a parcel starts on grows that lot. A tile no street's plat
reaches takes the lot its land warrants wherever it fits
([lots-and-land.md](features/lots-and-land.md)).
One is drawn by its `share`, the kind's weight in the real stock, with one
roll of the growth rng against the candidates' cumulative weights in catalog
order; a kind alone among the candidates needs no roll. At least one tile of
the chosen footprint must already be reached by power, by piped water and,
once the city is a Big Town, by a drain — water and drain only where the
building draws city water, which a [house on a well](#a-house-on-a-well)
does not, and a drain never before Big Town, when the whole town is on
septic tanks — checking the whole
footprint rather than just its origin corner, so a lot's service does not
depend on which side of it the street happens to sit. A lot that fails the
checks after the draw is simply tried again on the next sweep, with a fresh
draw. The kinds, their weights and where they come from are in
[features/building-types.md](features/building-types.md).

Nobody moves into a home the grid cannot light or water. The grid must also
have spare supply for the entry's `powerUse` and `waterUse`: supply less
everything already in the utility line (see
[Brownouts](../world-sim/utilities-model.md#brownouts)), less what this pass
has already built. A candidate that clears everything but that is **waiting
for supply**: no random draw is spent on it, and growth remembers it for one
full sweep of the map so the Advisor can count what is still waiting against
what the grid has spare now. Candidate lots overlap — a 2×2 home could start
on any of four tiles — so the count claims ground in tile order and a lot
counts only where no earlier one has claimed it: the count is the homes that
would fit, not the tiles that could start one. Zoning more land beside a full grid therefore
adds nothing; the player's own tools are never refused for a shortage.

If a candidate clears all of that, it spawns with probability equal to the
sector's demand multiplied by the tile's desirability: desirability is land
value (helping) net of pollution (hurting residential lots most, at weight
0.5; commercial some, at 0.2; industrial not at all), clamped to 0..1. A
single random draw against that probability decides the pass; a spawned
building enters the Constructing state.

A **farm** is chosen differently, from its land rather than its tile:

- **The lot.** It is the level-1 farm lot (4×5 tiles), and every tile of it
  must be zoned Agriculture on farmable soil.
- **Access.** A dirt road must lie within Manhattan distance 3 of the lot:
  of any tile of it, since a farm's gate can be anywhere along its edge.
- **Power.** The lot must be powered. A dirt road carries no power, so a
  farm on dirt roads needs a power line run out to it, or a paved street
  beside its land.
- **No water.** It needs no water at all: a building whose entry draws none
  is never refused for want of it, and a farm pumps its own well.
- **The kind.** The grade at least half the lot's tiles reach picks the farm:
  very fertile grows row crops, fertile an orchard, somewhat fertile pasture.
- **The draw.** The probability is industrial demand times the lot's soil
  desirability — 1.0, 0.8 or 0.6 by grade — in place of land value.

### A house on a well

A dirt road carries no water main, just as it carries no cable. The homes
along one are where the mains stop. More than 43 million people, about 15
percent of the US population, drink from a private domestic well
([USGS](https://www.usgs.gov/mission-areas/water-resources/science/domestic-private-supply-wells)).
So a low-density house draws no city water when both of these hold:

- **A dirt road serves it.** One lies within Manhattan distance 3 of any
  tile of its lot, the same reach a farm has to its road.
- **No main runs beside it.** No road that carries water lies orthogonally
  beside any tile of its lot. That is exactly where the network hands water
  to a lot, so a house that a main could reach is never on a well.

A house on a well is on a septic tank too, and needs only its road and
power. Nothing refuses it, holds it back or flags it for want of water or a
drain. So is every building in a town below Big Town (`SEWER_MILESTONE`,
3,500 people), whatever road it stands on: a small town makes no sewage for
the city, and sees no sewer until it has outgrown its tanks
([progression.md](progression.md#milestones)). A house on a well takes no
place in the water line or the sewer line and adds
nothing to either demand. Only the roads and pipes decide, never the supply,
and they are read afresh every time. A house whose main is bulldozed goes
onto a well, and a house that levels up onto a lot a main runs beside goes
onto the mains. A shortage never puts a house on a well: a house the mains
serve stays in the water line and loses its water like any other.

A house with a main beside its lot — a road that carries water, or a water
pipe — is on the mains like any other, even where a dirt road also serves
it, and waits for water while that main is dry. Only the detached houses of
the low-density zone go on a well. Terraces, flats, mixed blocks, shops and
industry need the mains wherever they stand.

## Levels, construction, and abandonment

A newly spawned or newly leveled-up building spends `CONSTRUCTION_TICKS` =
100 ticks Constructing before it becomes Active.

Every growth pass, an Active building below level 3 is checked for a
level-up. A home or a shop needs the land value over its tile to exceed 140
(to reach level 2) or 190 (to reach level 3); residential buildings reaching
level 3 additionally need the tile's education field over 60. Land value is
earned, not waited for: bare clean ground settles at 119, under the first
line, a river bank at 181, over it, and only a park, trees or the shore
together with a quiet clean street carry a tile past the second
([../world-sim/environmental-simulation.md](../world-sim/environmental-simulation.md#landvalue-fieldidlandvalue--0)). **Industry
grows on its order book, not its neighbourhood:** a works levels up while
industrial demand is above zero, and land value, which pushes real industry
out of town, plays no part, for a plant as for a farm. A catalog entry of the
same kind at the next level must also exist and be unlocked at or below the
current milestone: a level-up keeps the building's kind, so a duplex levels
up into a better duplex and never into a house or a block. A commercial or
industrial building also needs the town to have room for the jobs the bigger
building adds. The building's old footprint is cleared to test the new,
possibly larger one in its place, every tile of it zoned the same; if the
new footprint does not fit, the
level-up is abandoned and the old building is restored exactly as it
stood. A level-up must also find spare supply for what the bigger building
draws beyond the smaller one; one that cannot is restored the same way and
waits for supply like a lot does. A successful level-up replaces the
building in place and re-enters Constructing.

A house on prime land is torn down for a plex. Every growth pass, an Active
detached house on a half or a normal lot whose tile's land value is at the
estate band (224 or over), and which did not level up that pass, converts
with a chance that makes 2% a year (a year is 72,000 ticks, so 7,200
passes): it is replaced, on the same footprint, by a level-1 duplex or
fourplex of its zone and lot, drawn by share, unlocked at the current
milestone, given spare supply for what it adds, and it enters Constructing.
Any level converts; the lot never changes
([features/lots-and-land.md](features/lots-and-land.md#a-small-house-on-prime-land-becomes-a-plex-built-2026-10-08)).

A farm levels up by taking more land:

- The next level is the same kind of farm on a larger lot at the same corner
  (5×6, then 6×7).
- Every tile of the larger lot must be Agriculture on farmable soil, and the
  lot's grade must be at least what its kind needs. A crop farm grows only
  onto very fertile land, an orchard onto fertile land or better, and pasture
  onto anything farmable.
- Industrial demand must be above zero, and a random draw against it decides
  the pass, since a bigger farm is the town adding basic jobs.

Every pass also recomputes each Active or Abandoned building's problems: no
power, no piped water or no drain reaching its footprint (water and drain
only for a building that draws city water, and a drain only from Big Town),
no street within Manhattan
distance 3 (for a farm, no dirt road within 3 of its lot), crime over 170,
pollution over 170 (residential lots only), and sector demand under -0.5. An
Active building carrying a power, water, or road blocker for 3 consecutive
passes becomes Abandoned; a missing drain is never a blocker, since the
consequence of no sewer is no growth and a fouled ground, not a dead
building. An Abandoned
building returns to Active as soon as its blocker is gone; otherwise, after
10 consecutive still-blocked passes, it is removed and its footprint freed.
Abandoning never removes a shortage: an abandoned building keeps its place
in the utility line, so a home past the end of the supply stays dark until
the grid grows or the home is removed.

## Lots and archetypes

A zoned building's mass does not fill its footprint tile: the body is a
size in metres set by its kind — 4.75 m per lot tile for a detached house,
13.6 m per tile for a block, and a fixed share of the lot capped in metres
for a duplex, a fourplex or a multiplex, never more than 85% of the tile on
either axis (see [../art/buildings.md](../art/buildings.md#residential-kinds)) —
so that neighbouring buildings never share a wall. The lot, not the building, claims the rest of
the tile: a lot pad reserves the building's whole footprint, sitting under
the body and surfacing whatever remainder the building implies — paved yard,
parking, or planting. Adjacent lots' pads meet edge to edge with no gap
between them, stopping short of the road at the verge the parking apron
already respects; a home's lawn instead runs across the verge to the
sidewalk, and the house stands at the front of its lot with its drive and
yard laid out from the street (see
[buildings.md](../art/buildings.md#residential-lots)).

Whether a lot's kerb may be used for parking is decided by two independent
rules that compose. The road decides whether and when its kerb is parkable: a
kerb on the side where the street paints a parking lane takes cars at any
hour; a street whose tier declares kerbside parking in its data but paints
no lane — today the two-lane, gravel, alley and one-way presets — takes only
short daytime stays, never overnight; every other road takes none, since a
through-route, a reserved bus or bike lane, tram rails, or a railway all have
a better use for their edge. The building decides whether it needs the kerb
at all: one with its own bay row, or a home with a drive, does not use it;
apartments do. Utilities, parks, and civic buildings never park at the kerb,
having nobody to park. A kerbside car sits parallel, in the middle of the
parking lane where there is one and otherwise half a car into the
carriageway, with no apron or painted bay of its own, since the road surface
is already there.

Every object that would stand at the kerb — a parked car, a lamp, a sign —
is checked against the tile it would actually occupy, not the building or
road that placed it: is a road there, does that tier allow kerb parking,
and is the tile a junction (excluded, since two crossing carriageways have
no kerb — the offset that clears one lane lands inside the other). Checking
per tile rather than per row means a frontage that runs onto a bend or a
corner still parks the part of itself that is clear.

A driveway tile is excluded from street-lamp placement, even though lamps
are otherwise placed purely from the road side — a lamp placed in a curb
cut would stand where cars drive through it. Driveways belong to buildings,
so the lamp line is rebuilt whenever the building set changes, not only the
road set.

A cosmetic pedestrian anchored on a building's frontage sidewalk walks a
loop stretched along the street and narrow across it, rather than orbiting
its anchor point; which way is "along the street" is read from the road
tile's own neighbours, not the building's facing, so a corner lot still
walks the street it actually fronts.

A catalog entry's category, kind and level select an archetype: a named
assembly of parts drawn from one shared kit (see [../art/README.md](../art/README.md)
for what those parts are and look like). Two buildings of the same zone at
different levels, or of different archetypes entirely, can therefore look
distinct without any divergent game logic. Parts that hang on a building's
road-facing wall are included only when the building actually fronts a
street; parts that sit on the roof carry no such requirement.

Industrial buildings carry a pollution figure independent of their level or
name, and whether an industrial building's silhouette carries a smokestack
is driven by that same figure, so the skyline and the simulation can never
disagree. The top industrial level, whose pollution figure is zero, has
more jobs than the level below it — a genuine upgrade rather than a reskin.

Every ground surface belonging to a lot — its pad, its parking apron, its
driveway, its painted bays — is built by the same terrain-conforming
ground-surface builder: it samples the real surface at each corner and
splits on the same diagonal the terrain mesh uses, so a paved lot can never
float above a dip or be clipped by a slope beneath it. See
[../world-sim/README.md](../world-sim/README.md) for how that terrain
surface and its height query are built.
