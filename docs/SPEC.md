# SlimCity — Product Specification

What SlimCity does, in the present tense. This is the normative reference: a
statement here can be held against the running game, and if they disagree, one
of the two is a defect.

It carries no dates and no delivery status. What is built and what is next is
[ROADMAP.md](ROADMAP.md); why the product is shaped this way is
[adr/](adr/README.md); what is deliberately not being built is
[DESIGN.md](DESIGN.md). How the interface looks is [ui/](ui/README.md), how the
world looks is [art/](art/README.md), and how any of it is built is
[architecture.md](architecture.md). Start at the [documentation map](README.md)
if you are not sure which of those you want.

**Rule zero:** every control the game renders is wired to real behaviour.
Nothing ships as a dead button — see
[ADR-0011](adr/0011-rule-zero-every-control-is-wired-to-real-behaviour.md).

---

## Contents

1. [The world](#1-the-world)
2. [Zoning and growth](#2-zoning-and-growth)
3. [Roads](#3-roads)
4. [Traffic](#4-traffic)
5. [Transit](#5-transit)
6. [Utilities](#6-utilities)
7. [Services](#7-services)
8. [Economy and progression](#8-economy-and-progression)
9. [Audio](#9-audio)
10. [Saves](#10-saves)

---

## 1. The world

### The tile grid

A tile is 20 metres (`TILE_METERS`) on a side — wide enough that the widest
street the game builds pays for itself: four 3.75 m lanes, a 1.2 m refuge,
and a 1.875 m footway on each side, all inside 19.95 m. Lane and vehicle
sizes are real metres and do not scale with the tile; building footprints
are given in tiles and do, so a lot grows with the street it fronts rather
than being stranded on it.

The map is a 256×256 grid of tiles (`MAP_SIZE`) — roughly 5.1 km (5,120 m)
on a side — addressed by a single row-major index. World origin sits at the
map's corner tile (0, 0); a tile's centre in world metres is
`(tile + 0.5) × 20`.

Every tile carries a stack of parallel layers rather than one shared record:
terrain height, a derived water flag, tree density, zone type, road tier and
road occupancy, building occupancy, and whether power and piped water reach
the tile. Growth and demand additionally read a set of per-tile 0–255
fields — land value, pollution, crime, and education among them (see
[Demand: the RCI model](#demand-the-rci-model) below).

### Terrain and height

Height is stored as metres above sea level, negative below it. The rendered
terrain is a triangulated surface — each tile's quad is split along one
diagonal into two flat triangles — and the game's height query reproduces
that surface exactly: it interpolates within whichever triangle a point
falls in, rather than blending the quad's four corners as a flat plane.
Every consumer that samples the ground — roads, driveways, parking aprons,
ground props, vehicles, pedestrians, street lamps — reads this same
function, so nothing built on the terrain can disagree with what is drawn.

A building — together with its roof, its setback tiers, and any
roof-mounted parts — seats its base at the MAXIMUM terrain height found over
its footprint's `(w+1)×(d+1)` grid of tile corners, not the footprint's
centre. Because those corners land exactly on terrain vertices, that
maximum is exact rather than sampled: on a slope, a building can only float
above the ground by the corner-to-corner height difference, never sink into
it.

A tile is buildable — for a building, for zoning, or (under a looser gate)
for a road — only if it is not water and the height difference to every
existing orthogonal neighbour is within a slope ceiling:

- **`MAX_BUILD_SLOPE` = 4 m** per tile, for buildings and zoning.
- **`ROAD_MAX_SLOPE` = 10 m** per tile, for roads only. A road tolerates a
  steeper grade because placing it re-flattens and banks the footprint
  underneath anyway, so the terrain never actually stays this steep once
  the road is down.

### Terraforming

Four tools reshape the ground: **Raise**, **Lower**, **Level** (flattens to
the height sampled where the drag started), and **Smooth** (a box-blur
toward neighbouring heights). Each stroke takes a brush radius of 2–16
tiles and a strength of 1–5.

A terraform edit carries a mode, a centre, a radius, a strength, and (for
Level) a target height, and applies a smoothstep falloff kernel across the
brush. Tiles already carrying a road or a building are excluded from the
kernel — the game does not terraform under a structure. Editing costs ¢0.5
per metre of height change per tile (`TERRAFORM_COST_PER_METER_TILE`),
funds-gated like any other edit; undoing or redoing a stroke restores the
exact prior heights rather than re-running the tool.

Editing terrain re-derives, for the edited region: the water mask (any tile
whose height drops below sea level becomes water), tree clearing on newly
submerged tiles, and buildability. Digging below sea level therefore floods
the hole with no separate mechanism — lakes and canals are simply terrain
dug low enough for the derived water mask to claim.

### Water

Water is not an authored layer; it is derived — every tile whose height is
below **`SEA_LEVEL` = 0** metres is water. Terraforming raises or lowers
this ground like any other, so digging a hole below sea level creates
water and filling one drains it: the same model covers seas, natural lakes,
and dug canals, with no separate case for any of them. Dynamic water
flow — rivers or floods that actually move water between tiles — is not
part of this model: a heightfield flow simulation is a performance cost the
derived sea-level model avoids by not attempting it. See
[art/nature.md](art/nature.md) for how the surface, shoreline, and depth read
on screen.

### The map edge

The map's boundary is not a drop into nothing: a perimeter wall runs down
from the surface at every edge tile to a fixed base 18 m below sea level,
following terrain height and rebuilding when a terraform edit touches an
edge row. See [art/nature.md](art/nature.md) for its cross-section
treatment.

The camera does not fly to the edge when the pointer leaves the window.
Losing pointer-move delivery would otherwise leave the last cursor position
parked in the edge-scroll band and drive the camera there; instead, the
camera cancels all edge-scroll contribution the moment the pointer leaves
its element, the window loses focus, or the document registers the pointer
leaving entirely, and parks its tracked pointer at the viewport centre —
resuming edge-scroll only once a real pointer movement is seen inside the
viewport again. A fresh city boots with the camera 380 m out, close enough
that the opening view is filled with land rather than dominated by the
horizon.

### Game time

The simulation core ticks at a fixed `TICK_RATE` = 20 per real second at its
reference multiplier of 1.0; a calendar day is `TICKS_PER_DAY` = 200 ticks
and a calendar month is `DAYS_PER_MONTH` = 30 days. The player never runs
the sim at that reference rate directly: the 1×/2×/4× speed control instead
maps each button through `SPEED_MULTIPLIERS` to its own real-time
multiplier — roughly 1/3 at 1×, 4/3 at 2×, and 16/3 at 4×, each step exactly
four times the one before it — with pause mapping to zero. The tick logic
itself is identical at every speed; only how many ticks are fed per real
second changes, so determinism does not depend on the pacing chosen.

The visible time of day runs on its own, longer cycle, deliberately
decoupled from the calendar: one full day/night sweep is `VISUAL_DAY_TICKS`
= 2,400 ticks — about six real minutes at the 1× speed button — rather than
tracking the 200-tick calendar day, which would otherwise strobe day into
night every few real seconds. The status-strip clock displays this visual
time; the calendar date advances on calendar days regardless of what the
visual clock shows.

A fresh city boots reading 09:00, not midnight: both the lighting and the
status-strip clock add the same `CLOCK_START_OFFSET_TICKS` (900 ticks, 9/24
of the visual day) before mapping the tick onto the 24-hour visual day, so
the displayed clock and the lighting always agree. This is a pure display
offset — sim ticks, saves, and the calendar are untouched.

## 2. Zoning and growth

### Zone types

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

### Frontage and zonability

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

### Demand: the RCI model

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

### The spawner: how a lot is chosen

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

### Levels, construction, and abandonment

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

### Lots and archetypes

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
of parts drawn from one shared kit (see [art/buildings.md](art/buildings.md)
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
ground-surface builder described under
[Terrain and height](#terrain-and-height): it samples the real surface at
each corner and splits on the same diagonal the terrain mesh uses, so a
paved lot can never float above a dip or be clipped by a slope beneath it.

## 3. Roads

### A road is a class, a cross-section and a set of junctions

A road is not a tier picked from a drawer. Three objects carry everything a
player can choose, and nothing is decided by which catalog card they
clicked:

- The **class** says what the road is for — dirt, alley, rural, local street,
  urban street, collector, arterial, divided, one-way, highway, ramp — and
  fixes what a class really does fix: posted speed range, per-lane
  throughput, the lane-count range, which lane pieces it may hold, and
  whether it is zonable and utility-carrying.
- The **profile** is the cross-section: an ordered list of lane pieces from
  one kerb to the other — travel lanes with a direction, a centre turn lane,
  a median, a parking lane, a bike lane, a bus lane, a tram lane, a shoulder,
  a barrier, a sidewalk — each with a width. Every catalog road is a preset
  profile of some class.
- The **junction** is where two or more profiles meet: it owns the traffic
  control, the turn restrictions per approach, and the approach lanes — how
  the last stretch of each incoming profile splits into through/left/right
  lanes.

Markings, furniture and capacity are derived from those three; none is
authored separately. A dashed centre line means "two-way, passing allowed"
and nothing else; a turn arrow means an approach lane exists with that
movement; capacity is lanes times a per-class, per-lane figure. See
[adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md](adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md)
for why the game is built this way rather than as a fixed tier catalog.

### Classes and their ceilings

A class fixes a posted-speed range and default, a per-lane throughput input,
a lane-count range (both directions summed), which lane pieces it admits,
whether it zones, and whether it carries water and power along the road
graph:

| class     | lanes | posted km/h (default) → m/s | throughput input        | per-lane cap | admits                                                  | zonable | utilities   |
| --------- | ----- | --------------------------- | ----------------------- | ------------ | ------------------------------------------------------- | ------- | ----------- |
| dirt      | 1–2   | 20–40 (30) → 8              | 250 veh/h (free-flow)   | 100          | travel, verge                                           | yes     | water only  |
| alley     | 1–2   | 20–40 (35) → 10             | 400 veh/h (free-flow)   | 175          | travel, parking                                         | yes     | water+power |
| rural     | 2     | 50–90 (60) → 17             | g/C 0.50                | 400          | travel, shoulder, verge                                 | yes     | water+power |
| local     | 2–3   | 30–50 (50) → 14             | g/C 0.37                | 300          | travel, centre-turn, parking, bike, sidewalk, verge     | yes     | water+power |
| urban     | 2–4   | 40–60 (60) → 17             | g/C 0.37                | 300          | + bus, tram, median                                     | yes     | water+power |
| collector | 2–5   | 50–70 (60) → 17             | g/C 0.43                | 350          | + centre-turn                                           | yes     | water+power |
| arterial  | 4–6   | 60–80 (65) → 18             | g/C 0.49                | 400          | bike, bus, tram, median, sidewalk, verge (no parking)   | yes     | water+power |
| divided   | 4–8   | 70–90 (80) → 22             | g/C 0.55                | 450          | travel, bus, median, barrier, shoulder, sidewalk, verge | yes     | water+power |
| one-way   | 1–5   | 40–60 (58) → 16             | g/C 0.67                | 550          | travel (one dir), parking, bike, bus, sidewalk, verge   | yes     | water+power |
| highway   | 2–8   | 90–120 (100) → 28           | 2,350 veh/h (free-flow) | 1,000        | travel, shoulder, barrier, median                       | no      | power only  |
| ramp      | 1–2   | 50–80 (60) → 17             | 2,000 veh/h (free-flow) | 850          | travel (one dir), shoulder                              | no      | power only  |

Rail is a twelfth class (5.6 m gauge-and-ballast piece, its own network, no
lane range) — see [§5](#5-transit). Every figure in this table is derived
once from the formulas in
[Capacity, control delay and warrants — the formulas](#capacity-control-delay-and-warrants--the-formulas)
and rounded to the nearest 25, so it reads as a catalog number rather than a
decimal.

Nine of these twelve classes ship a preset the drawer offers today: dirt
(Gravel Road), alley (Alley), local (Two-Lane Road, Bike Lane), urban
(Four-Lane Road, Tram Track), arterial (Avenue, Bus Lane), one-way (One-Way
Road), highway (Highway), ramp (Ramp) and rail (Rail Track). Rural,
collector and divided are fully specified in the class table above — they
already drive the capacity, delay and warrant formulas below wherever a
composed profile names them — but neither the road drawer nor the profile
editor currently offers a way to compose one from scratch, so a player
cannot yet build a rural road, a collector or a divided road.

### Profiles: lane pieces and the width budget

A tile is 20 m. A profile is an ordered list of lane pieces, kerb to kerb,
each with a width in metres; what is left over is verge. The presets keep
the widths that reproduce their existing carriageways — 3.75 m lanes on
most, 3.3 m narrower where the avenue's median has to fit inside 15 m — so
their geometry is unchanged. A newly composed piece defaults to the real
widths urban design guidance uses:

| piece       | default width | real-world range                         |
| ----------- | ------------- | ---------------------------------------- |
| travel lane | 3.5 m         | 3.0–3.6 m                                |
| centre-turn | 3.6 m         | —                                        |
| parking     | 2.25 m        | 2.1–2.6 m                                |
| bike        | 1.6 m         | 1.5–1.8 m                                |
| bus / tram  | 3.5 m         | —                                        |
| median      | 1.8 m         | 1.2 m minimum, 4.9 m to hold a turn lane |
| barrier     | 0.6 m         | —                                        |
| shoulder    | 1.5 m         | —                                        |
| sidewalk    | 1.9 m         | 1.8–2.4 m                                |
| rail        | 5.6 m         | —                                        |

A travel lane is also built to the width its class uses, from the US
lane-width standards: 12 ft (3.6 m) on an arterial, a divided road, a
highway and its ramps; 11 ft (3.35 m) on a rural road, an urban street and a
collector; 10 ft (3.05 m) on a local street, a one-way and an alley; 9 ft
(2.75 m) on a dirt road. A class also fixes which total lane counts it is
built in — not dialled a lane at a time, since a four-lane arterial is a
kind of road, not a three-lane with one added: a motorway offers 2/4/6/8, an
urban street or a collector 2/4/6, an arterial or a divided road what its
own range holds inside those steps, a one-way 1/2/3, a rural or local street
2, a dirt or alley road 2 only.

A profile's width against the tile decides what it can be:

- **Fits one tile.** Two travel lanes plus two parking lanes plus two
  sidewalks is 15.3 m — a local street with parking both sides. Four travel
  lanes plus two sidewalks is 17.8 m, which does **not** fit, so a four-lane
  urban street gives up its footways for half-metre kerbs instead, exactly
  as the existing preset does. Three travel lanes plus a centre-turn lane
  plus two bike lanes plus kerbs is 15.7 m, which fits.
- **Fits a two-tile corridor.** Six and eight lanes never fit one tile and
  are not made to. A road that wide is laid as a **corridor**: two
  carriageways side by side, each a tile wide, each centred on its own tile
  and carrying half the cross-section — the piece straddling the middle
  (almost always the median) is split between them, so each half is
  finished on its inner edge by its own share of it. A class earns a
  corridor only by needing one — only a class whose own largest road does
  not fit one tile gets a second, so a local street with parking on both
  kerbs stays too wide rather than quietly becoming a corridor with acres of
  verge. The corridor half a tile carries, and the profile id that says the
  two halves are one road, live in the tile's stored flow byte (below); the
  road tool lays both runs from one drag, ghosted and refused together if
  either half cannot fit.
- **Does not fit at all.** A class that admits no corridor and cannot fit
  one tile, or a cross-section wider than two tiles even on a
  corridor-eligible class, is refused outright with a reason on the cursor
  chip ("too wide for the tile" / "too wide for a corridor").

### Stored direction and one-way roads

Every road tile carries a flow byte: three bits for the cardinal the drag
ran in (north/east/south/west, or "never recorded" for a tile drawn before
direction was stored), one bit marking a corridor half, and one bit for
which half. A one-way road's direction is no longer inferred from tile
geometry — it is exactly what was drawn, flippable by the replace tool.
This is also what makes an asymmetric profile meaningful: a three-lane
street as 2+1, a five-lane one-way corridor as 3+2 — "2+1" means nothing
until the tile knows which way is which.

The graph edge built from this carries lanes-per-direction rather than one
tier-wide number, and its capacity is split by direction share rather than
by half: a lane count of 2 one way and 1 the other gives the wider
direction 4/3 of an even split and the narrower 2/3, so the narrow side
congests first while the whole edge's nominal capacity is unchanged.

### Junctions: control, defaults and warrants

Every junction node carries a control: `none`, `yield` (minor approaches
give way), `stop` (minor approaches stop), `allWayStop`, `signal`, or
`roundabout`. The default is a **warrant**, not a constant, worked out from
the same two inputs an engineer would use — the class of each approach, and
how full its lanes have been running:

- Two approaches at rural or below (dirt, alley, rural) meet with no
  control.
- A road meeting a strictly higher class stops on the lower one.
- Two roads of the same class at collector or above signalise; anything
  touching an arterial, a divided road or above always signalises.
- Two roads of the same class, equal and at one-way or above, all stop —
  the four-way stop an American grid is full of.
- A highway or a ramp never takes a node control at all: nothing meets a
  highway at grade, and a ramp's motorway end is a merge or a diverge
  (below), never a controlled junction.

That classification default is then nudged up one rung when traffic
sustains it, mirroring the MUTCD's absolute thresholds (500 vph major plus
150 vph minor for a signal; 300 plus 200 for an all-way stop; roughly 2,000
vpd combined before two minor roads are signed at all) restated as a
fraction of what the approach lanes carry, so the warrant survives any
change to the sim's trip volume: two minors combined at v/c ≥ 0.15 earn a
yield; a minor against a major at v/c ≥ 0.3 earns a stop; a major at v/c ≥
0.4 with a minor at v/c ≥ 0.3 earns an all-way stop; a major at v/c ≥ 0.4
with two or more lanes per direction, against a minor at v/c ≥ 0.25, earns a
signal instead of a stop. A player's override is never stepped back down by
a warrant: once set, it is sticky, and the junction inspector always shows
the warrant's own recommendation alongside it.

Control has teeth: the delay formulas in
[Capacity, control delay and warrants — the formulas](#capacity-control-delay-and-warrants--the-formulas)
are added to the path cost of the approach, per movement, so a city of
all-way stops on its arterials is measurably slower and the traffic lens
shows it. A signal runs a two-phase, 60-second cycle (90 seconds once any
approach has a dedicated left, which is a third phase) — cosmetic vehicles
hold at the stop line and the signal head cycles red/amber/green on that
same clock, which is exactly the cycle the delay formula assumes. Every
signalised junction in the city runs the same clock, the way a coordinated
arterial does in life.

**Roundabout** is the one control that changes geometry rather than only
behaviour: choosing it on a node with 3–4 approaches turns the node's own
tile (20 m, a mini roundabout, real range 13–25 m, ≤ 15,000 vpd) or a 2×2
block (40 m, a compact single-lane roundabout, real range 27–45 m, ≤ 25,000
vpd) into a circulating carriageway with yield markings on every approach
and no signal. A two-lane roundabout for a two-tile corridor is not
buildable yet.

### Approach lanes, turn pockets and tapers

For each approach of a node, the last few tiles of the profile are its
**approach zone** — the AASHTO storage length: 1 tile on dirt or alley, 2 on
rural, local, one-way or a ramp, 3 on urban or collector, 4 on arterial, 5
on divided or a highway. Inside that zone every travel lane carries a
movement set — left, through, right, and U-turn (never offered by default) —
packed as a nibble per lane, up to four lanes of one arm. The default set
is derived from the lane count: one lane does everything; two share the
turns with through; three earn a dedicated left; four or more earn a
dedicated right as well, with everything between running through. A player
edits any lane's set from the junction inspector, which always shows the
derived default as the baseline a lane reads until it is touched. What is
stored narrows only what the arm's own restriction already allows — a lane
can narrow the arm, never override it, and a lane is never left with
nothing.

A **turn pocket** is what an approach gains for that zone when the
junction's control actually queues traffic (anything but `none` or
`roundabout`) and the arm both goes through and turns left: the pocket is
the lane beside the centreline, carved from whatever the width budget has
spare, in this order — the verge the profile has not spent, the kerbside
parking lane or the shared median, and only as a last resort the through
lanes themselves narrowed to as little as 10 ft (3.05 m, the US minimum for
a constrained retrofit). A pocket that cannot find at least that width is
not built. A road that already carries a two-way centre turn lane needs no
pocket — it already turns from a lane of its own everywhere. The pocket
does not snap in at full width: it opens over a taper the same length as an
ordinary lane-drop taper for the class, full width only against the
junction itself, so the width the road gives up (parking, verge) shrinks
gracefully rather than vanishing at a line.

Turn **restrictions** (no left, no right, no straight, no U) are the same
mechanism in the degenerate case: a movement removed from every lane of an
arm rather than left on some. Turn arrows are painted from the resolved
movement set and nothing else, so a lane with no arrow is not a legal path
to that leg — the router treats a movement no lane offers as a banned turn.

**Tapers** govern any lane drop, at a junction approach or mid-run, where a
wider profile meets a narrower one: the extra lanes close over a length set
by the class's own standard ratio, not by taste — 1:10 on dirt or alley,
1:12 on rural, 1:15 on every ordinary street class (local through
arterial), 1:30 on a divided road, 1:50 on a highway or a ramp. A 3.5 m lane
closing at 1:50 takes 175 m, about 10 tiles; at 1:10–1:15 it takes 35–50 m,
about 3 tiles. The outermost travel lane on each side closes first, taking
the wider side of an uneven road down to an even one; everything else the
road carries (footways, parking, a reserved transit lane) survives the drop
untouched. On a motorway or a divided road the lane closes by paint alone —
the tarmac runs on at full width and the edge line moves inward, hatched
into a gore, so a driver who misses the merge still has pavement to recover
on; on a street the pavement narrows with the paint.

### How roads meet: rank, replacement and transitions

Every paved road is the same asphalt: a road is told apart by its width and
its markings, not by a tint of its own, because a colour step at every
seam reads as whichever road won the tile. Only a genuinely different
surface differs — gravel is tan, ballast is grey stone. See
[art/streets.md](art/streets.md) for the palette itself.

Roads replace each other by **rank**, not by catalog order: dirt < alley <
rural < local < one-way < urban < collector < arterial < divided < ramp <
highway (rail sits outside the ranking and refuses nothing, since it is a
separate network that only crosses a street at grade). A road carrying a
reserved bus or tram lane outranks the same road without one, so a stray
drag cannot silently erase a transit line. A road may only be drawn through
one it outranks; drawing through a road it does not outrank is refused
whole, not laid as two stubs either side of a gap (an avenue's raised
median, for instance, leaves nowhere to cross). Replace mode overrides all
of this, because the player asked for it explicitly, and — if the new
profile is wider than the tile the old one occupied — the drag refuses
rather than half-demolishing the run.

Any two classes may otherwise join; the join itself is drawn, not stepped:
where a wider paved kerbed run meets a narrower one, the wider tile bends
its kerb in to the narrower road's edge so the two flow together, and a
tile narrowing at both ends splits between the two wedges. A gravel
neighbour keeps its existing paved-to-dirt band, and a junction keeps its
own throat rather than tapering, since a wide arm meeting narrow ones at a
node is a flare, not a transition. Two classes refuse to meet only where
the join would be physically absurd: a highway or a ramp running straight
onto a dirt road or an alley, which could carry neither its speed nor its
volume. The road tool enforces this (a refusal reads on the cursor chip),
which is also the only place it can be enforced with the reason visible.

### Ramps and interchanges

`ramp` is its own class: one or two lanes, one-way, unzonable, at the
highway's own speed range but posted lower, admitting only a travel lane and
a shoulder. A ramp touching a highway forms one of two junction kinds, both
uncontrolled two-approach nodes:

- A **merge**, where the ramp joins the flow. The highway grows one extra
  lane on that side — an **auxiliary lane** — that opens from nothing 8
  tiles out to full width against the junction, so a driver coming up the
  ramp has road to get up to speed on before the lane runs out again beyond
  the join.
- A **diverge**, where the ramp leaves. The same auxiliary lane appears
  upstream of the junction instead, for slowing down before the exit.

The auxiliary lane is added and painted automatically wherever the tool
detects a ramp meeting a highway — the player draws the ramp and the
highway grows the lane and paints the gore on its own, so the merge length
costs land and nothing else. A ramp's other end is a **terminal**: an
ordinary node on the surface network, taking an ordinary warranted control
and ordinary approach lanes like any other junction.

Nobody is stopped joining a highway and nothing holds them, but finding a
gap in fast traffic is not free: a merging driver loses `2 + 22·x³` seconds,
where `x` is the volume-to-capacity ratio of the highway lane they are
joining — small on an empty road, and the queue up the ramp every motorway
gets at rush hour once the road they are joining is close to saturated.
Only the traffic coming up the ramp pays this; a driver already on the
highway pays nothing, and leaving costs nothing here (whatever a diverge
costs is paid at the ramp's terminal further down).

Interchange **templates** — a diamond, a trumpet, a parclo, a roundabout
interchange, a cloverleaf — are not implemented as placeable stamps yet.
Everything they would be built from (the ramp class, merge/diverge
detection, the auxiliary lane, ordinary terminal junctions) already exists
and works when laid tile by tile; only the one-click, ghosted, rotatable
template is missing. See [DESIGN.md](DESIGN.md) for the backlog.

### Furniture and what gates it

Furniture reads mostly from the profile's own lane pieces rather than from
a fixed tier list: a sidewalk piece is what a footway is, a median piece is
what a raised or planted centre is, a bike/bus/tram piece is what that
reserved lane is, and every marking that depends on one of them (bike-lane
fill, bus-lane fill, dashed-versus-double centre, edge lines) reads the
piece directly, so a composed profile gets the correct furniture with no
per-class special case.

Two rules have not yet migrated off the road's tier and still read the
tile's tier directly rather than its profile: **lamps** are placed on every
tier except gravel and rail (not on a piece toggle), and **kerbside
parking** eligibility is a separate per-tier flag on the catalog entry
(set for the two-lane road, the gravel road, the alley and the one-way
road) rather than a read of the profile's own parking piece. Both give the
correct answer for all eleven catalog presets, since each preset's tier
and its profile agree by construction, but a composed profile that adds a
parking lane to a tier the flag does not cover will not yet get roadside
parking from it, and a composed profile with no parking piece on a tier the
flag does cover will still get one.

A junction places its own furniture by control rather than by tier: the
road ranked highest at a node runs through with no stop marking; every arm
below it gets a stop bar, and a ladder crosswalk wherever the road has a
footway (a road with no footway paints no crossing, since there is nobody
on foot to cross, and its kerb still sweeps round at the corner radius with
grass filling what would be the footway). Crosswalk presence at a junction
is derived this way from footway presence and rank; it is not (yet) an
independent per-approach toggle a player sets from the junction inspector.

A deck (an elevated or bridged road tile,
[Bridges and elevated roads](#bridges-and-elevated-roads)) inverts the
kerbside rules: no verge, so no parking meters, utility cabinets, manhole
covers, verge grass or street trees. What survives is what the road still
needs to be driven — lamps, and the boards or signal that govern right of
way where a junction lands on the deck, plus a motorway's exit boards and
gantries, whose signage is overhead because nobody is walking beside it.

See [art/streets.md](art/streets.md) for what every piece of furniture
actually looks like.

### Markings

Markings are read off the profile and the junction, never authored
per-tier:

- **Colour** follows one rule: yellow separates traffic going opposite
  ways (the dashed centre of a two-lane road, the double solid of an
  undivided multi-lane road, both edges of a two-way turn lane, which faces
  opposing traffic on each side); white does everything else — lane lines
  between same-direction lanes, and the edge line down each side of the
  carriageway marking where the running surface ends. Every paved road
  carries edge lines; an unpaved track, a service alley and a rail line
  carry no paint at all.
- **Centre line** is derived per class: dirt, alley, one-way, highway,
  ramp and rail paint no centre line at all (a one-way or a motorway has no
  opposing traffic to separate, and dirt/alley carry no paint of any kind).
  Rural, local, urban and collector paint a dashed centre when the road
  carries one lane each way and a double solid when it carries two or more
  each way — the standard no-passing rule for a wider undivided road.
  Arterial and divided roads always paint double solid (a divided road's
  median is the real separator; the double solid is what shows on the
  paved side of it).
- **Turn-lane paint.** A two-way left-turn lane carries a solid line toward
  the through lane and a broken line toward the turn lane on each side —
  legal to cross into to turn, illegal to travel along — with white turn
  arrows painted in it pointing each way.
  It counts toward the road's width and its class's lane range, and carries
  no through capacity, which is what a turn lane is for.
- **Turn arrows, merge arrows, gore chevrons** all come from the approach
  lane movement sets and the tapers, never authored: an arrow exists only
  where a lane's resolved movement set says the movement exists. A
  single-lane approach is left unmarked, since it does everything anyway —
  which is also what MUTCD 3D.06 ¶01 says of one at a circular
  intersection.
- **Gore hatching** is diagonal bars at 45°, sloping away from the traffic
  beside them in the direction that traffic goes (MUTCD 3B.24), so both
  halves of a two-way road lean the same way on a map and each leans
  correctly for its own direction. Each bar is clipped exactly at the tile
  edge and the next tile draws the rest of it, rather than being squashed
  into a smear along the boundary or stepped into a staircase.
- **A roundabout is painted as a roundabout.** The crossings and stop bars
  go. A yield line of solid white triangles pointing at the approaching
  driver goes across every entry (MUTCD 3B.19 ¶10), and a give-way board
  stands at each one — the single place a give-way may face every approach
  (MUTCD 2B.10 ¶06). No centre line runs through, because there is an
  island where it would go, and no road runs _through_ a roundabout. The
  white edge line round the outer circulatory roadway, which MUTCD 3D.03
  puts in the arcs between the arms and never across an exit, arrives with
  the two-lane roundabout; see [ROADMAP.md](ROADMAP.md).

### Capacity, control delay and warrants — the formulas

The sim already speaks real units, so its numbers are real ones. A tile is
20 m. Speed is metres per second — a road's `speed` field is its posted
km/h divided by 3.6 (a two-lane road at 50 km/h is 14; an avenue at 65 km/h
is 18; a highway at 100 km/h is 28). An edge's path cost is
`length / speed` — seconds — scaled by `1 + 2·(v/c)` for congestion, so a
junction delay expressed in seconds adds to the cost directly and a
capacity expressed in vehicles per hour converts by one constant:

- **k = 3/7 game-capacity units per veh/h.** Chosen so the existing
  two-lane preset keeps its capacity of 600 (2 lanes × 700 veh/h × 3/7).
- **Per-lane capacity** `cap = S · (g/C) · k`, with S = 1,900 veh/h/lane —
  the Highway Capacity Manual's base saturation flow for a signalised urban
  lane — and g/C the share of the signal cycle the lane actually moves for,
  which is what separates a signalised arterial from a free-flowing
  highway. A highway lane instead uses the HCM's basic-freeway figure of
  2,350 veh/h/lane (free-flow at 65 mph, the closest to 100 km/h); a ramp
  uses 2,000 veh/h/lane; dirt and alley use observed rural figures of 250
  and 400 veh/h/lane. Transit and bike pieces carry people, so their
  figure is a car-equivalent of passenger throughput at the sim's own
  granularity: a reserved bus lane is worth 700 game-capacity units, a
  reserved tram lane 650 per track, a bike lane 75. Every per-lane figure
  rounds to the nearest 25.
- **Control delay**, in seconds, from the HCM's forms reduced to the two
  numbers the sim has — volume-to-capacity `x` on the approach, and cycle
  length: `none` 0; `yield` `3 + 4x²`; `stop` (minor approaches only)
  `9 + 12x²`; `allWayStop` `10 + 15x²` on every approach; `signal`
  Webster's uniform delay `0.5·C·(1 − g/C)² / (1 − x·g/C)`, with C = 60 s
  for a two-phase junction and 90 s once any approach has a dedicated left
  (a third phase), g/C the approach's own; `roundabout` `4 + 10x³`, the
  entry-delay curve of a single-lane roundabout — quick until it suddenly
  is not. Delay is per movement, dividing by however many lanes serve that
  movement, and is added to the edge cost of the approach.
- **Warrants**, stated as v/c rather than vehicles per hour, because the
  MUTCD's absolute thresholds (500 vph major plus 150 vph minor for a
  signal; 300 plus 200 for an all-way stop; roughly 2,000 vpd combined for
  a yield or a stop between two minors) are each close to a fixed fraction
  of what the approach lanes carry, and a fraction survives a change to
  trip volume: two minors combined at v/c ≥ 0.15 earn a yield; a minor
  against a major at v/c ≥ 0.3 earns a stop; major ≥ 0.4 and minor ≥ 0.3
  earns an all-way stop; major ≥ 0.4 with ≥ 2 lanes per direction, against
  a minor ≥ 0.25, earns a signal. A player's override is never stepped.
- **Speed-change lane lengths**, from kinematics, `L = (v₁² − v₀²) / 2a`:
  an acceleration lane from a 60 km/h ramp (16.7 m/s) up to a 100 km/h
  highway (27.8 m/s) at a = 1.5 m/s² is 164 m, about 10 tiles, matching the
  AASHTO Green Book's 170 m; a deceleration lane at a = 2.0 m/s² is 123 m,
  about 8 tiles, matching AASHTO's 110–130 m.
- **Tapers**, from standard taper ratios: 1:50 on a highway or a ramp
  (a 3.5 m lane closes over 175 m, about 10 tiles), 1:30 on a divided road,
  1:10–1:15 on every other paved street class (35–50 m, about 3 tiles).
- **Turn-lane storage**, from AASHTO's 15 m minimum plus one queued vehicle
  per 20 s of red at 7.5 m each: a local approach stores 2 cars (≈ 30 m) —
  an approach zone of 2 tiles; a collector 4–5 cars (≈ 50 m) — 3 tiles; an
  arterial 7–9 cars (≈ 70 m) — 4–5 tiles.
- **Roundabout size**, from inscribed circle diameter: one tile (20 m) is a
  mini roundabout (real range 13–25 m, ≤ 15,000 vpd); a 2×2 block (40 m) is
  a compact single-lane roundabout (real range 27–45 m, ≤ 25,000 vpd), at a
  single lane's g/C of 0.85 per entry.
- **Merge delay**, the one formula above that is not adapted from a
  published curve: `2 + 22·x³` seconds, where `x` is the v/c of the
  highway lane a ramp is merging into — small on an empty road, and the
  slip-road queue every motorway gets at rush hour once it climbs.

### The road tool

The drawer's road category shows classes, not tiers; picking one lays its
default profile. The tool options panel grows a profile editor — lane
pieces as a strip across the tile's width budget, with per-side toggles for
parking, bike lanes, lamps and sidewalks and a median picker — and its
edits apply to the next drag. A replace mode drags a new profile over an
existing run in place, keeping alignment, buildings and elevation; if the
new profile does not fit the tile the old one occupied, the drag refuses
rather than demolishing anything. Clicking a junction node opens the
junction inspector: a control picker, a per-approach lane movement grid,
turn restrictions, and the delay the current control is costing. Clicking a
ramp node shows its merge or diverge length. Every edit is a command
through the same worker queue as any other build action, and every one is
undoable.

### Progression and unlocks

The catalog's actual milestone gates, as shipped: at the start (milestone
0), the two-lane road (local class) and the gravel road (dirt class). At
milestone 1: the alley, the one-way road, the four-lane road (urban class),
the bike lane (local class) and the avenue (arterial class). At milestone 2:
the bus lane (arterial class). At milestone 3: the highway, the tram track
(urban class) and the ramp. At milestone 4: the rail track.

### Bridges and elevated roads

Water is otherwise an absolute wall — a road tile may not sit on one — so a
bridge or an elevated stretch is the same mechanism: an ordinary road tile
that happens to sit higher than the terrain beneath it. `GridState` carries
one additive layer for it, the deck height in metres above the tile's own
terrain (0 = at grade), continuous rather than quantised to whole metres —
a level span crossing a dished riverbed has to cancel the ground's own
unevenness, or it bows by up to half a metre. Anything under a centimetre
of it reads as at grade. The road graph, the auto-tiling mask, road-carried
utilities and traffic all read the deck the same way they read any other
road tile, which is the entire point of modelling it this way rather than
as a second network.

An elevated tile skips the ground rules a normal road tile enforces — the
water rejection (that is the reason to elevate) and the slope ceiling (a
deck is level regardless of the ground under it) — while bounds and the
no-building-here check still apply, and the terrain underneath is never
flattened. Dragging a road across water elevates the crossing tiles
automatically, at the higher bank's height plus 5 m of clearance over the
water surface (`BRIDGE_CLEARANCE_M`); the approach on each bank ramps down
to grade at no more than 2 m of deck height per tile (`BRIDGE_MAX_GRADE`),
and a placement that cannot fit that ramp on the land available fails
outright rather than building half a span. A player raises or lowers a
span deliberately with the road tool's own height control (Page Up / Page
Down while a drag is in flight), in steps of 2 m
(`ROAD_ELEVATION_STEP_M`), up to a ceiling of 40 m (`BRIDGE_MAX_ELEVATION`);
elevation always resets to ground level when the road tool is put down, so a
height set for one viaduct never becomes a stray hump under the next
unrelated drag.

Every tier bridges under its own rules, in one of four structural families
by class — a plank deck on light posts for gravel, alley and bike-lane
roads; a concrete beam on round columns for every ordinary street; a deep
box girder on heavy squared piers for an avenue, a highway or a ramp (a
ramp flies over on the same structure the highway it serves does); a
steel through-truss, with no parapet, for a rail line. Piers drop to the
ground every 3 tiles (`PIER_SPACING_TILES`). The deck's height is sampled
along the direction the road runs and held constant across it, so a span
has no camber; girder and parapets are merged geometry sampled off the same
smooth height function the road surface uses, so two neighbouring tiles
agree at their shared edge and the whole span reads as one continuous road
rather than a row of slabs.

Elevation adds `BRIDGE_COST_PER_METER_TILE` (6) currency per metre of deck
height per tile, on top of the class's own per-tile cost, and the same
premium proportionally on upkeep. An elevated tile grants no zoning
frontage — nothing zones off a bridge — and the ground beneath a deck
remains exactly as occupied as it is under any road tile. Bulldozing a span
clears its elevation along with the road.

Deferred, deliberately: one tile still carries one road tier, so a road
crossing over another road (an overpass) is not representable and is not
attempted — that needs a second road layer, which this design exists to
avoid. Tunnels, styled piers, and suspension or arch spans are likewise out;
a bridge here is a slab on piers. See [DESIGN.md](DESIGN.md).

## 4. Traffic

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
(see [Capacity, control delay and warrants — the formulas](#capacity-control-delay-and-warrants--the-formulas)
and [Ramps and interchanges](#ramps-and-interchanges) for the merge-delay
term). A route that would cross a lane-drop taper is limited to the
narrower road's own capacity for that stretch, so a hard lane drop reads as
a real chokepoint rather than a free merge. Because a grid offers many
equal-cost routes between two points and a deterministic A* would otherwise
send every trip down the exact same one, each trip's edge costs carry a
small, per-trip jitter (± up to 35%) seeded from a deterministic hash of
its own origin and destination — stable for that one trip, different for
the next one, and consuming no draw from the sim's seeded RNG — so
parallel streets share load instead of one filling nose-to-tail while its
neighbour sits empty.

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

## 5. Transit

A transit **line** is an ordered list of stops and a mode — `bus`, `rail` or
`tram`, defaulting to bus — with everything else about a line (its id, its
colour, its stop list) shared across all three. A single, network-agnostic
module computes every line's route and ridership; the only thing that
changes per mode is which network the line routes over, which vehicle
represents it, and the rates its ridership estimate uses. There is one
route computer (a stop-to-stop A* concatenation, shared junction tiles
between consecutive legs de-duplicated) and one ridership estimator for all
three modes.

**Networks.** The road network, the rail network and the tram network are
the same graph-building code parameterised by a different tier predicate,
not three separate implementations. The rail network's tiles are disjoint
from the street network by construction — rail is not a street, and no
drivable vehicle, pathfinding query or utility conduction ever crosses onto
it. The tram network is different: tram track is also a street (cars drive
over it exactly as over any other road), so a tram tile sits in both graphs
at once, but a tram line itself only ever routes over the tram graph — a
tram that could route down any street would make the embedded track
decorative, which is the one thing this design exists to avoid.

**Ridership** is one statistical estimate for every mode: the population
and jobs within a search radius of every stop, summed across the line,
times a per-demand rate, times a length bonus capped at 3× the base
(`1 + min(2, 0.01 × route length in tiles)`). What differs by mode is the
radius and the rate, because people walk further to a fixed, visible route
than to a corner stop, and further still to a train: a bus stop draws on an
8-tile radius at 0.15 riders per demand unit; a tram stop on 10 tiles at
0.20; a rail station on 14 tiles at 0.28. No per-agent simulation backs any
of this.

**Congestion relief** feeds ridership back into the road network, but the
formula differs by how a mode actually removes cars from the street:

- A **bus** relieves the road edges its own route drives over — riders it
  carries would otherwise have driven those exact streets.
- A **tram** shares the street with cars, so its riders would have driven
  the very road it runs down — but its route comes off the tram graph,
  whose edge ids are a private numbering that does not correspond to the
  road graph's. Relieving by those ids would silently improve traffic
  somewhere else in the city, so a tram's relief route is recomputed
  against the road network instead, which can carry it because tram track
  is itself a street.
- A **train** drives over no road edge at all, so route relief would
  relieve nothing. Its riders' car trips would instead have started or
  ended at a station, so relief lands on the road edges nearest each
  station's own door (the edges of the road network's closest node to each
  stop), deduplicated across stops that share a doorstep street. A station
  with no street within reach relieves nothing, correctly — nobody could
  have driven there anyway.

In every case the relief taken off an edge is `ridership × 0.02`
(`CONGESTION_RELIEF_PER_RIDER`), clamped so an edge's volume never goes
negative.

**Stops differ by mode.** A bus stop is a small road-adjacent catalog
ploppable, unlocked at milestone 1. A rail station is a much larger
ploppable (a 2×3 footprint) gated on standing adjacent to rail track rather
than to a street — the first ploppable in the game whose placement rule is
not "next to a road" — unlocked at milestone 3. A tram stop is neither: it
is a shelter only, with no ploppable, no land taken and no milestone gate
beyond the track's own, which is the whole of a tram's economic argument
against a railway.

**Vehicles are cosmetic**, the same way traffic's cars are: a bus is a
single vehicle; a train is three cars and a tram two, one shared lead
distance per set with each following car holding a fixed distance behind
it, clamped rather than wrapped at the ends of an open route so a set
queues briefly at its terminus instead of tearing apart across it. How
many vehicles a line shows is deterministic and monotonic in its
ridership: one bus per 40 riders (up to 6 per line), one tram per 90 riders
(up to 4, with at least one running the moment ridership is positive at
all, so a line that carries anyone never reads as abandoned track), one
train per 220 riders (up to 3, same floor of one).

**A stop standing mid-run, not just at the ends of a line, still finds the
network**: a stop resolves to a graph node by proximity, and a long
junction-free corridor — exactly the shape of a dedicated transit route —
only has nodes at its two ends. Snapping falls back to the nearer end of
the specific run a point stands on, so a station or a tram stop placed
partway down a long line still routes correctly rather than carrying
nobody.

Lines are saved and restored with the world; a line created after loading
resumes id assignment past the highest id the save restored.

Deferred, deliberately: no timetables, no per-vehicle capacity or bunching,
no signal-block simulation, no freight, no level crossings that stop road
traffic, no overhead wires or catenary poles, no tram priority at
junctions, no depots, and no line that mixes tram and rail track. See
[DESIGN.md](DESIGN.md) for the backlog.

## 6. Utilities

### Production and demand

A utility building generates power (MW) or water (kL); its footprint is a
source the network reaches out from. The starting catalog holds a coal plant
(4×4, 60 MW, 140 pollution, ¢12,000 to build, ¢800/month upkeep), a wind
turbine (1×1, 6 MW, no pollution, ¢3,000, ¢100/month) and a water tower (2×2,
400 kL, ¢2,500, ¢120/month); all three are available from the first
milestone. Demand is the sum of every non-abandoned building's own catalog
`powerUse`/`waterUse`, recomputed every tick alongside supply.

### Coverage: a walk along the road network

Power and water do not radiate from a utility building as a plain-radius
circle. Coverage is computed identically for both: a breadth-first walk
starts from every tile of the network (road or power line, see
[Conducting roads and power lines](#conducting-roads-and-power-lines))
orthogonally adjacent to a generator's footprint, crosses every connected
tile that conducts, and then radiates one further orthogonal step onto
non-road tiles around each reached tile — which is how an off-road building
or zoned lot picks up supply from the street beside it. A building counts as
served if any one tile of its footprint is covered, not all of them.

### Conducting roads and power lines

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
road upkeep
([Tax income, upkeep, and the budget](#tax-income-upkeep-and-the-budget)). A
line will not stand on open water or on a building's own footprint, and
dragging back over an already-strung run charges nothing further.

A road tile with no power supply carries no street lamp: the lamp-placement
pass skips any tile the grid reports as unpowered, so the network's reach
reads directly off the street after dark. See [art/lighting.md](art/lighting.md)
for what a lit or dark pole looks like.

### Brownouts

When total demand exceeds total supply for either utility, consumers are cut
in ascending building-id order: each building's usage accumulates against the
available supply, and the moment the running total exceeds it, that building
— and every building after it in id order — loses coverage on its own
footprint tiles only. The rest of the network, and every consumer already
counted, keeps what it has.

A building that goes three consecutive growth passes without power, water,
or road access while Active abandons.

## 7. Services

### Coverage and funding

Police, fire, health, education and parks share one mechanism. Each Active
service building first finds the nearest road tile within 2 orthogonal steps
of its footprint, then walks outward from it by road-network hop count (not
straight-line distance), capped at a range scaled by that service's funding.
Every road tile reached, plus every tile within 2 further orthogonal steps of
one, receives coverage that fades linearly with hop distance:
`strength × (1 − hopDistance / range)`.

Coverage is blended into its field differently by kind: education and health
take the higher of the field's existing value and the new one (a ceiling,
not a stack); police and fire subtract half the coverage value from
Crime/FireRisk; a park adds a quarter of its coverage value to LandValue, on
top of a flat one-time `landValueBonus` applied to its own footprint tiles
(40 for a pocket park, 120 for an airport). Crime grows passively every tick
on any zoned tile whose land value is below 90, and fire risk grows on any
tile carrying a building, so a station's coverage offsets an ongoing rise
rather than fixing something once.

Each of the five service kinds carries its own funding level, 0 to 1.5
(150%), set independently and defaulting to 1 (100%). Funding scales both the
service's own range (floored) and the monthly upkeep every building of that
kind costs the city — underfunding shrinks reach and saves money in the same
stroke; overfunding costs more for a wider one. See [ui/layout.md](ui/layout.md)
for the funding sliders themselves.

### Garbage and waste management

Every active residential, commercial and industrial building generates trash
every 10 ticks: 2/4/8 units per pass by sector, multiplied by the building's
level (minimum 1×), spread evenly across its footprint tiles (rounded, at
least 1 unit/tile) and clamped at 255 per tile — the ceiling the trash lens
reads.

**Landfill** is a painted area, not a ploppable: a brush stamps the tile
layer, gated to the same road-frontage buildable grid the R/C/I zone brushes
use, with no cost gate beyond that. A connected area must reach 4 tiles to
operate — a paint stroke that would leave a smaller disconnected fragment is
rejected, though growing an existing area past the minimum is always
allowed. Painting costs ¢40/tile and ¢3/tile/month upkeep. Capacity is the
painted tile count × 600 units, rendered as a pile up to 6 m tall at a full
tile; once the whole area is full its service radius stops being collected
until more area is painted or an incinerator takes the load. A connected
area derives one office tile (its street-adjacent member nearest the start of
the search) and a dump path from the office to its farthest member; every
other tile in the area piles trash. See [art/buildings.md](art/buildings.md)
for the gatehouse and pile models.

The **incinerator** is a catalog ploppable (4×4, unlocks at milestone 3, ¢40,000
to build, ¢1,500/month) with its own 400,000-unit buffer. It collects within
a 40-tile road-BFS radius and burns 4,000 units per pass, permanent as long
as burn rate keeps pace with inflow; while active it emits 120 pollution
through the ordinary per-building emission pass, the trade-off for a fix
that never fills a field. A full buffer stops that facility's own collection
until it drains.

**Collection** reuses the same road-BFS mechanism a service building uses
([Coverage and funding](#coverage-and-funding)): a facility with remaining
capacity collects the trash of every building reachable within its radius,
in building-id order for determinism; a full facility collects nothing and
trash backs up on the source tiles. Buildings reached by no facility, or
only full ones, keep their trash and it shows on the `'trash'` lens — but as
currently implemented this uncollected trash does not itself feed LandValue
or Happiness; those fields are computed from education, health, land value,
pollution, crime and traffic only.

Cosmetic garbage trucks animate the collection: each qualifying landfill
area is its own depot, budgeted `clamp(1 + tiles/16, ≤ 4)` trucks and skipped
once its area is full; an incinerator uses its own catalog truck count (4 for
the base incinerator). Trucks route depot → serviced building → depot over
the road graph (a landfill truck also detours out to the dumping ground and
back); routing is cosmetic and does not affect collection. See
[art/props-and-vehicles.md](art/props-and-vehicles.md) for liveries.

The per-tile uncollected-trash layer is runtime state, not part of the grid
save, and rebuilds within a few ticks of a load — the same as traffic
volume. The landfill's total stored pile and each incinerator's buffer,
however, do round-trip through the save (in the save's meta block,
[Format](#format)); a save written before that existed loads with fill at 0.
The landfill's painted _extent_ is separately part of the grid itself
([The trailing additive layer pattern](#the-trailing-additive-layer-pattern))
and has been since the area was first paintable.

### Cosmetic service dispatch

Fire, police and ambulance vehicles drive from a covering station to an
incident and back. Incidents spawn deterministically from the existing
coverage-gap fields (Crime/FireRisk/Pollution feed the spawn rate); a vehicle
routes station → incident → station over the road network and the incident
resolves after a travel-plus-service time. The system only reads
Crime/FireRisk/Pollution and the building registry — it never writes back
into service coverage or the economy, so this is presentation on top of
[Coverage and funding](#coverage-and-funding)'s real numbers, not a second
copy of them. See [art/props-and-vehicles.md](art/props-and-vehicles.md) for
liveries and the incident marker.

## 8. Economy and progression

### Population, jobs, and the monthly cycle

Every tick, population and jobs are re-summed from Active buildings: a
residential building contributes its `residents` to population (and, for a
mixed-use entry, its ground-floor `jobs` to commercial jobs too); a
commercial or industrial building contributes its `jobs` to that sector.
Employed is `min(population × 0.55, jobs)`.

Income and expenses settle once every game month — every 6,000 ticks (200
ticks/day × 30 days) — against the funds balance; population, jobs and
milestones are otherwise live every tick, independent of that boundary.

### Tax income, upkeep, and the budget

Monthly income is
`(population × resRate + jobsCom × comRate + jobsInd × indRate) × 12 × landValueFactor`,
where `landValueFactor = 0.75 + (averageLandValue / 255) × 0.5` over every
occupied tile — so a city's income runs from 75% to 125% of the raw rate
depending on how desirable its occupied land is. The default tax rate is
0.09, capped at 0.3 per sector.

Monthly expenses sum: every Active building's catalog `upkeep` (a service
building's upkeep is further multiplied by that service's own funding level,
[Coverage and funding](#coverage-and-funding)); every road tier's
`upkeepPerTile` × its tile count; ¢3/tile/month for painted landfill and
¢0.5/tile/month for power line
([Conducting roads and power lines](#conducting-roads-and-power-lines)); and
1% of the outstanding loan balance. Funds below zero raise a critical
"budget critical" notification; funds below ¢2,000 raise a "budget low"
warning. Neither halts the game outright, but every priced command already
refuses to run once its cost exceeds current funds — so a city in the red
can still zone, bulldoze, or paint a district (all free) but cannot afford
anything priced until income recovers.

### Loans

A loan tops up funds against a ¢100,000 outstanding-balance ceiling; a
request larger than the remaining headroom is clamped to what's left.
Repayment is clamped to whichever is smallest of the amount requested, the
funds on hand, and the balance owed. Interest accrues at 1% of the balance
into every month's expenses whether or not the player borrows further that
month.

### Milestones

A milestone levels up mid-tick, independent of the monthly cycle, the
instant population crosses the next threshold, and pays a one-time reward on
top of whatever funds the city already has:

| Milestone     | Population |   Reward |
| ------------- | ---------: | -------: |
| Tiny Village  |          0 |       ¢0 |
| Small Town    |        400 |  ¢10,000 |
| Busy Township |      1,200 |  ¢15,000 |
| Big Town      |      3,500 |  ¢25,000 |
| Small City    |      8,000 |  ¢40,000 |
| Grand City    |     20,000 |  ¢75,000 |
| Metropolis    |     50,000 | ¢120,000 |

Every catalog entry, zone tier and tool carries its own `unlockMilestone`.
Representative examples: townhouses and the second industrial tier unlock at
Small Town; medium apartments at Busy Township; mixed-use, the third
industrial tier, the incinerator and the rail station at Big Town; high-rise
residential and commercial at Small City; the airport at Grand City.
Districts, power lines, terraforming and de-zoning are available from the
very first milestone. Nothing in the current catalog or road set is gated
specifically on Metropolis — it is the top of the population ladder rather
than an unlock tier of its own.

### Districts and policies

A district is a per-tile administrative id, 0 (unassigned) to 255, painted
onto any tile at all — water, road, building, zoned or not — since a
district is an administrative region rather than a construction rule and
carries no buildability or frontage gate. Painting one is free. The first
time an id is painted, a district definition is auto-created for it with a
default name (`District N`) and a colour drawn from a fixed palette by id.

Four policies toggle per district: `lowTax` (×0.7 on that district's tax
contribution), `highTax` (×1.3), `noHeavyTraffic` (×1.6 on the district's
road tiles as a pathfinding cost, routing through-traffic around it), and
`greenEnergy` (×0.5 on the pollution its buildings emit). Multiple policies
on one district compose — `lowTax` and `highTax` together multiply both.
A district with no policy enabled behaves exactly like an unassigned tile.
See [ui/layout.md](ui/layout.md#district-panel) for the paint tool and the
per-district policy panel.

### The Advisor: detecting and ranking problems

The Advisor turns the per-building problem flags and the city-wide stats
into a short, ranked list of what needs attention, worst first — an event
log reports failures as they happen; this reports the city's _current
state_. It recomputes roughly once a second (every 10th snapshot; snapshots
otherwise arrive ~10×/s), because a list re-ranking faster than a player can
read it is unreadable, not because the underlying numbers change that
slowly.

Two families of issue feed the ranking. Per-building problems are the six
flags a building can carry — `NoRoad`, `NoPower`, `NoWater` (critical),
`HighCrime`, `HighPollution` (warning), `LowDemand` (info) — each rolled up
into one issue per flag: a count of every affected building (buildings still
under construction are exempt; every Active or Abandoned building with the
flag counts) and a focus tile taken from the lowest-id affected building, so
the same city always points at the same place. City-wide checks read
`CityStats` directly: power or water demand outrunning supply (critical);
funds below zero (critical, "the city is in the red") or, short of that,
monthly expenses outrunning income (warning); and, once population is
above zero, no jobs at all (warning), unemployment above 25% of population
(warning), or every job filled with residual industrial demand — "employers
cannot find workers" (info).

Issues sort by severity first (critical, then warning, then info), then by
how many buildings are affected within a severity tier, with ties broken by
a fixed priority order so the list never reshuffles under a player's
cursor. An issue with a focus tile can move the camera to it. A healthy city
returns an empty list — the Advisor does not invent problems to look busy.
See [ui/layout.md](ui/layout.md#advisor-panel) for the panel itself.

## 9. Audio

Audio is an app-layer concern: it reads snapshots and settings, and nothing
under `src/sim` or `src/render` ever imports it, so it cannot touch
determinism.

### Engine and routing

One `AudioContext` feeds a master gain into three independent sub-gains —
ambient, UI, and music — so each layer mixes on top of one master level.
Nothing is created at import time: a context built outside a user gesture
starts suspended. The engine unlocks on the first `pointerdown` or `keydown`
and resumes the context; any play call before that is a silent no-op rather
than an error, so starting a game from the menu (itself a click) is enough
to guarantee sound by the time the city is on screen. Master gain is
`muted ? 0 : masterVolume`, applied live through the same settings-binding
path that already drives bloom and sandbox mode.

### Every built-in sound is synthesized

There is no audio asset pipeline and no shipped audio bytes: every built-in
sound is generated from WebAudio primitives — oscillators, envelopes, and
filtered noise — so the built-in sound layer costs zero bytes and zero load
time.

The ambient bed is remixed once per snapshot from the city's hour,
population and night factor: a lowpassed-noise traffic layer whose gain
scales with population and the day's commute curve (loud at rush hour,
near-silent at 3 a.m.), plus a constant quiet wind floor — both broadband
noise, the only kind of sound that survives being looped forever. Wildlife
is scheduled rather than looped: individual calls are committed a couple of
seconds ahead on the audio clock, at freshly drawn gaps, birdsong by day and
cricket ticks after dark, thinning as the city fills in. Four short
synthesized UI cues cover `click` (tool/dock selection), `build` (a
successful command), `denied` (a rejected command or a warning/error
notification), and `notify` (an info notification).

### Music: a `public/songs/` folder the player owns

The game ships no music. Dropping `.mp3`/`.wav` files into `public/songs/`
makes them the in-game playlist, discovered through a generated manifest — a
small Vite plugin scans the folder and serves it, regenerating on add/remove
in dev and once at build — plus an explicit Rescan. A track's identity is
its manifest path, or for a dropped file its name, size and last-modified
time, so rescanning, re-dropping the same file, or reinitializing the player
all converge on the same playlist with no duplicates; a rescan keeps the
current track playing if it still exists rather than restarting the queue.
Dragging files onto the window adds them to the session playlist alongside
the folder's own tracks.

Nothing about the music is persisted or copied: tracks stream from disk
through an `HTMLAudioElement` rather than being decoded into memory, dropped
files live only as object URLs that are revoked on replace or unload, and
the audio file formats are excluded from version control so no one's music
is ever committed. Only the listening preferences — volume, shuffle, repeat
— persist. Shuffle takes an injected random source (defaulting to
`Math.random`), which is fine here because this is app-layer code, outside
the simulation's own no-`Math.random` rule.

### Mixer and settings

Settings persisted to local storage carry `masterVolume` (0–1, default 0.7)
and `muted` for the ambient/UI mix, and independently `musicVolume` (0–1,
default 0.6), `musicShuffle` (default off) and `musicRepeat`
(`'off' | 'all' | 'one'`, default `'all'`) for the music player. See
[ui/layout.md](ui/layout.md#start-menu-and-game-lifecycle) for the Options
panel's Audio section and the compact now-playing transport.

## 10. Saves

### Format

A save is three length-prefixed segments concatenated in one buffer —
`[u32 headerLen][headerJSON][u32 gridLen][gridBytes][u32 metaLen][metaJSON]`
— so the JSON parts and the binary grid never need to agree on a shared
text encoding. The header carries the schema `version`, the world's
generation `seed`, the sim `tick`, the map name, a wall-clock `savedAt`, and
optional `population`/`funds` snapshots for the save-browser list.

The grid segment is the raw output of `serializeGrid`: an 8-byte
little-endian prefix (`version`, `size`) followed by every grid layer, in
fixed order. The current schema is **`SAVE_VERSION = 11`**, at **45 bytes
per tile**: a 4-byte float (height), seven 1-byte flat layers (water, trees,
zone, road tier, road mask, power, watered), a 4-byte building id, nine
1-byte scalar fields, then the trailing layers described in
[The trailing additive layer pattern](#the-trailing-additive-layer-pattern).
The meta segment is a JSON object: the building registry, `CityStats`, and
three additive optional blocks — `garbage` (landfill pile total + each
incinerator's buffer), `transitLines`, and `roadProfiles` (player-composed
road cross-sections referenced by id from the grid's `roadProfile` layer).

### The trailing additive layer pattern

Every layer added to the format since v1 is appended after the previous
layout rather than inserted into it, and the deserializer keys entirely off
the version number stored in the file:

| Version | Adds                                    | Bytes/tile |
| ------: | --------------------------------------- | ---------: |
|       1 | base layout                             |         24 |
|       2 | district                                |         25 |
|       3 | landfill                                |         26 |
|       4 | roadElevation (1 byte/tile)             |         27 |
|       5 | roadElevation widened to a 4-byte float |         30 |
|       6 | roadProfile                             |         32 |
|       7 | roadFlow                                |         33 |
|       8 | junctionControl                         |         34 |
|       9 | junctionTurns                           |         36 |
|      10 | powerLine                               |         37 |
|      11 | junctionLaneTurns                       |         45 |

Loading a save whose version predates a given layer defaults that layer
instead of failing or migrating destructively — an absent `district`
defaults to unassigned, an absent `roadFlow` defaults to "never recorded", an
absent `powerLine` layer defaults to no lines anywhere, and so on for each
layer above; each default is chosen so the loaded city behaves exactly as it
did before that layer existed. A version newer than the reader's own
`SAVE_VERSION` is refused outright rather than guessed at. The same pattern
holds on the JSON side of the payload: `garbage`, `transitLines` and
`roadProfiles` are all optional keys that a save written before they existed
simply omits, and the reader treats an absent key as "this save predates the
feature" rather than an error.

The road-composition epic is a worked example of the pattern end to end: the
grid's `roadTier` byte became a `roadProfile` index into a per-save profile
table (built-in presets pre-populate it, so an old save's roads still look
as they did), a `roadFlow` byte was added (a direction, plus a still-reserved
remainder), and junction control/turn records were added keyed by tile —
each one its own version bump, each one defaulted on an older save rather
than migrated.

### Storage, autosave, and what does not exist

Saves are stored in the browser's own IndexedDB (`slimcity` database,
`saves` object store, keyed by an auto-incrementing id and indexed by
`savedAt`); up to 10 are kept, oldest pruned first. A browser with no
`indexedDB` at all (a private window, blocked site data) degrades to an
empty save list rather than throwing, so the menu still opens with nothing
to load. Autosave fires once the observed snapshot tick has advanced 2 game
months (12,000 ticks) past the last save; the very first observed tick only
sets the baseline, so a freshly loaded or brand-new city is never
immediately re-saved.

There is no save file export or import: a save lives only in the browser
that made it, with no way to download it to disk or upload one from
elsewhere. There is no compression anywhere in the save pipeline — the
stored record is the header, grid and meta bytes exactly as produced,
concatenated. See [ui/layout.md](ui/layout.md#start-menu-and-game-lifecycle)
for the multi-slot load/delete list itself.
