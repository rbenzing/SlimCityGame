# Simulation rules

What decides whether a tile can be zoned, how demand pulls buildings out of
the ground, and how those buildings construct, level up, and abandon. This is
the ruleset behind [gameplay-loop.md](gameplay-loop.md)'s minute-to-minute
loop; the tuning constants it names are gathered in
[balancing.md](balancing.md).

## Zone types

Eight zone types exist, grouped into three demand sectors — residential,
commercial, and industrial — each gated behind a milestone (a city-size
tier reached by population; milestone 0 is reached at 0 population,
milestone 1 at 400, milestone 2 at 1,200, milestone 3 at 3,500, and
milestone 4 at 8,000):

- **Low Density Housing** (`ResLow`) — single and semi-detached houses.
  Milestone 0.
- **Medium Density Row Housing** (`ResMediumRow`) — narrow attached row
  houses, 1×2 to 1×6 tiles. Milestone 1.
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
- **Industrial** (`Industrial`) — one zone whose three levels unlock across
  milestones 0, 1, and 3 rather than as a single block.

`ZoneType` numbers 1–5 (the original five zones) and 6–8 (the later three)
are stored in the tile grid, in saves, and in zone-paint patches, so they
are never renumbered or reused.

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
`ZONE_DEPTH` = 4 tiles deep, and stops at the first blocking tile — water,
another road, a building, out of bounds, or a slope past
`MAX_BUILD_SLOPE`. Tiles beyond a block have no direct access from that
frontage and are not zonable, even if they sit within the 4-tile depth. The
zonable set is the union of every road tile's frontage marches.

Painting a zone onto a tile additionally requires the tile to be buildable
and carry no road; painting anything other than a de-zone additionally
requires the tile to be free of a building and inside the
frontage-reachable set above. Clearing a zone is exempt from the frontage
check, so a zone can always be removed, even from a tile a road no longer
reaches. The zoning grid itself is drawn only while a zoning tool is the
active tool.

## Demand: the RCI model

Three coupled demand values — residential, commercial, industrial — sit in
-1..1: positive means the city wants more of that zone, negative means it
is oversupplied. Each is a pure function of population, total jobs,
employed population, each sector's tax rate, and city-wide happiness, with
no randomness:

- **Residential** = 0.3 + (jobs − employed) / max(200, population × 0.5) +
  (happiness − 50) / 150 − (resTax − 9%) × 4. Unfilled jobs and a happier
  city both pull residents in; a residential tax above the 9% default
  repels them.
- **Commercial** = (population − jobs × 1.6) / max(400, population) +
  0.15 − (comTax − 9%) × 4. More shoppers than shops pulls commercial
  demand up.
- **Industrial** = 0.4 − employed / max(1, population × 0.55) +
  (population − jobs) / max(600, population) − (indTax − 9%) × 4. A
  workforce already absorbed pulls this down; a population outgrowing total
  jobs pulls it back up.

Every result is clamped to -1..1. The constant terms (0.3, 0.15, 0.4) keep
each sector's demand positive for a brand-new city that has no population,
jobs, or tax pressure yet.

## The spawner: how a lot is chosen

Growth runs a pass every `GROWTH_INTERVAL` = 10 ticks. Rather than rescan
the whole map on every pass, each pass sweeps one rotating 1-in-32 stride of
the map's tiles, so the full map is covered once every 32 passes.

A candidate tile must be zoned to a sector, carry no building yet, and sit
within Manhattan distance 3 of a street tile. The sector's level-1 catalog
entry unlocked at or below the current milestone supplies a footprint; that
footprint must fit unobstructed at the tile, and at least one of its tiles
must already be reached by both power and piped water — checking the whole
footprint rather than just its origin corner, so a lot's service does not
depend on which side of it the street happens to sit.

If a candidate clears all of that, it spawns with probability equal to the
sector's demand multiplied by the tile's desirability: desirability is land
value (helping) net of pollution (hurting residential lots most, at weight
0.5; commercial some, at 0.2; industrial not at all), clamped to 0..1. A
single random draw against that probability decides the pass; a spawned
building enters the Constructing state.

## Levels, construction, and abandonment

A newly spawned or newly leveled-up building spends `CONSTRUCTION_TICKS` =
100 ticks Constructing before it becomes Active.

Every growth pass, an Active building below level 3 is checked for a
level-up: the land value over its tile must exceed 140 (to reach level 2)
or 190 (to reach level 3); residential buildings reaching level 3
additionally need the tile's education field over 60. A catalog entry for
the next level must also exist and be unlocked at or below the current
milestone. The building's old footprint is cleared to test the new,
possibly larger one in its place; if the new footprint does not fit, the
level-up is abandoned and the old building is restored exactly as it
stood. A successful level-up replaces the building in place and re-enters
Constructing.

Every pass also recomputes each Active or Abandoned building's problems: no
power or no piped water reaching its footprint, no street within Manhattan
distance 3, crime over 170, pollution over 170 (residential lots only), and
sector demand under -0.5. An Active building carrying a power, water, or
road blocker for 3 consecutive passes becomes Abandoned. An Abandoned
building returns to Active as soon as its blocker is gone; otherwise, after
10 consecutive still-blocked passes, it is removed and its footprint freed.

## Lots and archetypes

A zoned building's mass does not fill its footprint tile: the body is
inset from the footprint's edge so that neighbouring buildings never share
a wall — by 15% of the edge for most buildings, and 55% for a detached
house. The lot, not the building, claims the rest of the tile: a lot pad
reserves the building's whole footprint, sitting under the inset body and
surfacing whatever remainder the building implies — paved yard, parking, or
planting. Adjacent lots' pads meet edge to edge with no gap between them,
stopping short of the road at the verge the parking apron already respects.

Whether a lot's kerb may be used for parking is decided by two independent
rules that compose. The road decides whether its kerb is parkable at all: a
tier declares this itself in its data — today the two-lane, gravel, alley,
and one-way tiers do, and no others, since a through-route, a reserved bus
or bike lane, tram rails, or a railway all have a better use for their edge.
The building decides whether it needs the kerb at all: one with its own bay
row, or a house with a garage and a drive, does not use it; a small home or
a row house too tight for bays does. Utilities, parks, and civic buildings
never park at the kerb, having nobody to park. A kerbside car sits parallel,
past the verge and sidewalk and half a car into the carriageway, with no
apron or painted bay of its own, since the road surface is already there.

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

A catalog entry's category and level select an archetype: a named assembly
of parts drawn from one shared kit (see [../art/README.md](../art/README.md)
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
