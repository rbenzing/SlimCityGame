# Road model

The whole road model: classes, profiles and the width budget, stored
direction, junctions and control, approach lanes and pockets, ramps,
furniture gating, markings, the formulas, the road tool, progression, and
bridges.

## A road is a class, a cross-section and a set of junctions

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
[../engineering/adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md](../engineering/adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md)
for why the game is built this way rather than as a fixed tier catalog.

## Classes and their ceilings

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
| highway   | 3–6   | 90–120 (100) → 28           | 2,350 veh/h (free-flow) | 1,000        | travel (one dir), bus, shoulder, barrier, sound wall    | no      | power only  |
| ramp      | 1–2   | 50–80 (60) → 17             | 2,000 veh/h (free-flow) | 850          | travel (one dir), shoulder, sound wall                  | no      | power only  |

**A motorway is one carriageway, not a road with two halves.** Every other
class in the table counts both directions together; highway and ramp count
one, and they are the only classes that do. A dual carriageway is two
highway runs laid beside each other, each drawn in its own direction with
the direction arrows, the same way a real one is built and the same way it
is widened — a third lane is added to the side that needs it, not to both at
once. That is why the class admits no median piece: the median is the ground
between two carriageways, not a stripe inside one, and a highway that could
hold a median inside a single tile would be a road pretending to be two.

**Two carriageways may lie on adjacent tiles, and they do not connect.** A
highway beside a highway is two roads, not one wide one, so neither counts
the other as an arm: there is no mask bit between them, no graph edge, and no
junction. Counted as neighbours they would read as a junction their whole
length — drawn as one unpainted slab with no lane or edge lines, and joined by
a graph edge that let traffic drift sideways out of one carriageway into the
oncoming one. The only way onto or off a motorway is a ramp, so a ramp lying
alongside IS an arm, and that is how an interchange is built. See
[How roads meet: rank, replacement and transitions](#how-roads-meet-rank-replacement-and-transitions).

Three lanes is the floor because a motorway with two is an expressway. Six is
the ceiling because of the width budget: three lanes and their shoulders come
to 15.45 m and four to 19.2 m, both inside the 20 m tile, while five reach
22.95 m and six 26.7 m — so a five- or six-lane carriageway is a two-tile
corridor, which is exactly the case the corridor rule already admits, and a
seventh lane is past anything this grid can draw honestly.

A motorway also has no sewer beneath it. It drains off the shoulder to the
verge rather than to a buried line under the running surface, which is why
the class carries no water, and why no manhole cover belongs on it — see
[Furniture and what gates it](#furniture-and-what-gates-it).

Rail is a twelfth class (5.6 m gauge-and-ballast piece, its own network, no
lane range) — see [transit-model.md](transit-model.md). Every figure in this
table is derived once from the formulas in
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

## Profiles: lane pieces and the width budget

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
| sound wall  | 0.6 m         | the safety barrier it stands on          |
| shoulder    | 1.5 m         | —                                        |
| sidewalk    | 1.9 m         | 1.8–2.4 m                                |
| rail        | 5.6 m         | —                                        |

A travel lane is also built to the width its class uses, from the US
lane-width standards: 12 ft (3.6 m) on an arterial, a divided road, a
highway and its ramps; 11 ft (3.35 m) on a rural road, an urban street and a
collector; 10 ft (3.05 m) on a local street, a one-way and an alley; 9 ft
(2.75 m) on a dirt road. A class also fixes which total lane counts it is
built in — not dialled a lane at a time, since a four-lane arterial is a
kind of road, not a three-lane with one added: an urban street or a collector
offers 2/4/6, an arterial or a divided road what its own range holds inside
those steps, a one-way 1/2/3, a rural or local street 2, a dirt or alley road
2 only. A motorway offers 3/4/5/6 — every step of its range, because those
are ONE carriageway's lanes and each is a road somebody builds.

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

  The two halves are one road, and a drag never takes one away from the
  other. A road laid over a corridor half, whether it replaces it or re-lays
  it with another direction or another pairing, has to take that half's
  partner with it, as its partner. Otherwise it is refused ("That would split
  a corridor"). A corridor dragged one row off the one already there would
  pair the row they share with a new row and leave the other old row as half
  a road with nothing beside it. Re-laying the same corridor, turning it
  round, or crossing both its halves is fine.

  A bulldoze never takes one away from the other either. A bulldoze over
  one row of a corridor takes the other row with it, on the layer it takes
  the first from: on each tile a bulldoze takes the road on top, so a
  corridor bridging another road goes with its bridged partner, and one at
  grade with its partner at grade. The preview outlines both rows, and the
  refund covers both. The one bulldoze refused is a row at grade whose
  partner has a road passing over it ("That would split a corridor"). The
  bulldoze would take that road and leave the half beneath, so the player
  takes the bridge down first. Its undo lays the corridor back as it stood,
  each tile with its own stored flow and deck height, both halves paired
  again.

  **A motorway laid across two tiles is still one carriageway.** A five- or
  six-lane motorway does not fit a tile either, but nothing divides it: it is
  one road running one way, and a second motorway laid beside it is what
  carries the other direction. So its halves are not two carriageways centred
  on their tiles with grass between. Each half is pushed against the tile edge
  the two share, so the asphalt runs unbroken across it: one set of shoulders
  at the outer edges, the yellow edge line on the driver's left and the white
  on the right, and lane lines between every pair of lanes, whichever tile
  they fall on. The shared edge is not an edge: no edge line, no kerb and no
  roadside furniture stand on it. Drawn centred, a six-lane motorway read as
  two three-lane carriageways side by side, both running the same way.

  The same is true of any corridor that nothing divides: an undivided
  six-lane arterial, or a divided road built without its median. A corridor
  is divided only where a median or a barrier lies at its middle; otherwise
  its halves are pushed against the edge they share, the same way. The line
  on that edge is the one the whole road paints there: the centre line where
  the lanes either side run opposite ways (the double solid yellow of an
  undivided multi-lane road), a broken lane line where they run the same way,
  and nothing where the middle falls inside a lane. The low half paints it
  for both.

  Such a road meets streets at junctions. A street joining one half from
  outside makes a T with that half, and the other half runs straight past. A
  street crossing it passes through both halves, which are then two junction
  tiles side by side, drawn as one junction:
  - Kerb returns only at the road's outer edges, and none at the shared edge.
  - The crossing street centred on its own line.
  - Crossings on the outer arms only.
  - A stop line across the lanes that arrive, and no crossing, stop line or
    kerb on the shared edge.
    A road this wide ends square, kerbed across the whole of it, rather than
    in a turning head on each half.

  Each half carries one direction. Half of a two-way corridor may carry the
  lanes running against the way the road was drawn (`runsAgainstDrawing`),
  and those arrive at a junction from the other end. Its arrows, its stop
  line and its turn bay are at that end, not at the end the drawing faces.

- **Does not fit at all.** A class that admits no corridor and cannot fit
  one tile, or a cross-section wider than two tiles even on a
  corridor-eligible class, is refused outright with a reason on the cursor
  chip ("too wide for the tile" / "too wide for a corridor").

## Transit lanes are a variant of a size, not a road type

A bus lane, a bike lane and a tramway are not separate kinds of road. They are
things a road of a given size can be given, and the profile composition
(`ProfileEdits`) is where they live — `bike` and `parking` at the kerb, `bus`
as a running lane, and `tram` as either mixed running or a reservation. The
presets that used to stand alone read back as exactly that: the bike road is a
small street with a bike lane each side, the tram road is a small street with
its rails in the traffic lanes, and the bus road is a four-lane street with its
outer two lanes reserved.

**Where a reserved lane goes depends on what the road is for.** A street's bus
lane is kerbside, because that is where the stops are and where a bus pulls in.
A motorway has no stops to pull in at, and a kerbside reservation there would
cut across every slip road — so a motorway's reserved lane is the INNER one,
which is where every HOV and express lane runs. A tramway is the same question
answered by width: a narrow street runs the rails in the running lane and the
trams share it with the traffic, and a wider one gives them a reservation of
two tracks down the middle.

**A reserved lane always costs a general lane**, because the tile says so. Six
running lanes and two footways do not fit 20 m, and neither do four lanes and a
twin-track reservation. So the width budget above is what decides every
combination, and the trade is the player's to make by choosing the lane count —
lanes are never dropped silently to make something fit. The measured
consequence is that the interesting variation is smaller than it looks: a bus
lane produces one cross-section on a street whatever size it started from,
since the bus lanes plus the general lanes it leaves is four running lanes
either way, and a tram reservation likewise leaves one general lane each way.
Only the bike lane genuinely varies with size, since it is an edge strip rather
than a running lane.

Mixed running is a flag on the lanes the road already has, so it changes no
widths; every other variant rearranges the core, and rearranging re-sizes the
lanes to the class default, which is how a median or a reservation finds the
room it needs.

**A reserved lane counts against the class's lane range**, which is the second
gate and the one that decides what a SMALL street may carry. A local street is
built for two or three lanes, so it takes a bus lane on one side and is refused
two — two reserved plus two general is a four-lane road, which is a different
class of street, and the refusal says so rather than laying it anyway. The same
rule is what makes a narrow street run its tram in the lane: a twin-track
reservation is two more lanes, so the reservation is offered from the town
street up while the small street gets mixed running. Neither rule is asserted
anywhere; both fall out of the lane range the class is built to.

**A road's tier is its SIZE, and the reserved lane is priced on top.** Giving a
street a bus lane does not turn it into some other road that also has one: a
four-lane street with a bus lane and a two-lane street with a bus lane are still
a four-lane street and a two-lane street, and each is named, priced and ranked
as what it is. What the lane adds is a price per tile, an upkeep per tile, and
its own unlock milestone — a city cannot lay tram track before it could have
laid a tramway.

Those figures are DERIVED rather than chosen. Each is the difference between
the road that used to stand alone and the ordinary road of its own class,
divided by the reserved lanes it carried: the bike road was a local street with
a bike lane each side, the bus road an arterial with a bus lane each side, the
tram road an urban street running rails in both its lanes. So composing what
one of those roads was costs exactly what that road cost, which is checked
against all three. A preset is still priced as itself, so a city built before
is worth what it was.

Speed and capacity never came from the tier — they are read from the
cross-section — so a reserved lane has always carried its own traffic figures.
Rank is likewise the class plus whether a reserved lane is present, which is
why a transit street still outranks the plain street it is a variant of.

**The composer holds to the same table the tool reads.** A class admits a list
of lane pieces, and a piece outside that list is clamped away when the profile
is composed rather than built and then refused — otherwise the Profile row
offers a road the game will not lay, and no amount of dialling gets the player
out of it. So the variants a size is offered are exactly the variants it can
be laid as, and the only refusals left are the two a player can act on: too
wide for the tile, or more lanes than the class runs. The Profile row asks
`layRefusal` of every choice before it is picked, and a choice that would be
refused is disabled with that reason, so no sequence of clicks composes a
road the tool will not lay.

## Stored direction and one-way roads

Every road tile carries a flow byte: three bits for the cardinal the drag
ran in (north/east/south/west, or "never recorded" for a tile drawn before
direction was stored), one bit marking a corridor half, and one bit for
which half. A one-way road's direction is no longer inferred from tile
geometry — it is exactly what was drawn, flippable by the replace tool.
This is also what makes an asymmetric profile meaningful: a three-lane
street as 2+1, a five-lane one-way corridor as 3+2 — "2+1" means nothing
until the tile knows which way is which.

A tile holds one flow, so where two one-way streets cross, the crossing tile
keeps the flow of whichever was drawn through it last. The graph therefore
reads a run's direction from the run's own tiles and falls back to its end
nodes only when it has none, ignoring a flow that runs across the run.

**A section is authored in the direction of travel and laid in world order.**
Its pieces are listed left to right as its driver sees them. Offsets across a
road grow east and south, so heading north or east the driver's left is the
low offset and the list is already in world order; heading south or west
their left is the high offset, and the section is turned round before it is
drawn (`worldOrderedProfile` in `src/shared/roadprofile.ts`). It is turned
round BEFORE a corridor is halved, because a corridor's halves are stored by
the side of the road they stand on — the low tile and the high tile — so it is
the world-ordered road that is cut in two, and a corridor's median stays
between its tiles whichever way it was drawn. Every piece keeps its own flow,
so `fwd` still means the way the road was drawn, wherever it now lies.

Everything that draws a road reads the section low-to-high, so it inherits
the right layout from that one turn. The two editors that work by the
driver's own left or right ask which way round the section is instead: a
one-way road's turn bay goes outside its left-hand lane, and a lane drop
closes the right-hand lane first (`reversedInWorld`). Without the turn, a
southbound motorway kept its yellow edge on the left but put its wide
shoulder against the median, and a two-way street drawn south put its
southbound lanes on the driver's left.

The graph edge built from this carries lanes-per-direction rather than one
tier-wide number, and its capacity is split by direction share rather than
by half: a lane count of 2 one way and 1 the other gives the wider
direction 4/3 of an even split and the narrower 2/3, so the narrow side
congests first while the whole edge's nominal capacity is unchanged.

**A direction with no lane is not a road.** The router drives a run only in a
direction its cross-section has a travel lane for. A one-way street, a
motorway carriageway and a ramp are all driven one way, as is either half of
a corridor and any composed profile whose travel lanes all run the same way.
A run whose tiles never recorded a flow cannot say which way that is, so it
is gated by its road type instead: a type `roads.json` marks `oneWay` is
driven the way the geometric fallback reads, and every other type both ways.
So a single motorway line carries traffic one way only, as a real carriageway
does, and the other direction takes whatever roads it can until the second
carriageway is drawn beside it.

## Junctions: control, defaults and warrants

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
- A junction a highway or rail touches never takes a node control at all:
  nothing meets either at grade, so a ramp's motorway end is a merge or a
  diverge (below), never a controlled junction. A ramp's other end is a
  terminal on the surface network and takes an ordinary warranted control.

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
tile (20 m, a mini roundabout, real range 13–25 m, ≤ 15,000 vpd) into a
circulating carriageway with yield markings on every approach and no
signal.

A **compact roundabout** takes a 2×2 block: a single-lane ring 36 m across,
centred on the corner the block's four tiles share. It is the roundabout
control stored on all four tiles, and is laid by the Roundabout tool on a
street junction, never picked in the inspector. Its ring runs anticlockwise
round a planted island and truck apron; every road into it gives way at the
ring's edge, behind a splitter island. Each of its three or four legs, one to
a side, is a street of one lane each way, and arrives half a tile off the
ring's centre. The router drives the ring the one way it goes, on the circle,
and charges the roundabout's delay only on entry. The design and its sources
are in [the roundabout design](../game-design/features/roundabouts.md). A
two-lane roundabout for a two-tile corridor is not buildable yet.

**A roundabout entry carries what the ring in front of it leaves room for.**
An entering driver gives way to the traffic already circulating, so the
busier the ring is in front of the entry, the less it can take. A single-lane
entry onto a single-lane ring has the Highway Capacity Manual's capacity
(HCM 7th edition, Eq. 22-1; the same constants as the 6th):

    c = 1,380 · e^(−0.00102 · v_c)    veh/h

where `v_c` is the conflicting flow, the circulating traffic passing in front
of the entry, in veh/h. The sim has no heavy vehicles, so a vehicle is a
passenger car. With nothing circulating an entry takes 1,380 veh/h; at 1,000
circulating it takes about 500, at 1,800 about 220. The entry's v/c, which
the roundabout's delay curve reads, is the traffic arriving on that arm over
this capacity, not over what the arm's own road carries.

What counts as conflicting is what the manual counts (HCM 7th edition,
Eq. 22-11). For an entry, that is every car from another leg that passes in
front of it before it leaves the ring. That means the through traffic and
the lefts from the leg upstream, and the lefts from the leg opposite. It
never includes a car turning right off the ring before the entry. The sim
reads it from what it has:

- **A compact roundabout** has a ring of its own, so the conflicting flow is
  the ring traffic carrying on past the entry's corner. The sim does not know
  where each car on the ring leaves, so it takes the smaller of the ring
  traffic arriving at the corner and leaving it. That is the most that can
  be carrying on past.
- **A mini roundabout** is one tile, with no ring traffic to read. The
  conflicting flow is worked out from the traffic arriving on the other
  legs, on the assumption that each car is bound for each other leg alike.
  A car from the leg one place upstream passes the entry unless it turns
  right, so two thirds of that leg's traffic conflicts at a four-leg
  roundabout. The leg opposite contributes a third. The leg downstream
  contributes none, since every car from it has left before reaching the
  entry. A three-leg roundabout takes half of the leg upstream and none of
  the other.

Volumes are read in veh/h through the same constant that turns a road's
veh/h into its game capacity (k, below), so a ring at a given v/c conflicts
as the veh/h that v/c stands for.

## Approach lanes, turn pockets and tapers

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

Before any of that, the arm's set is narrowed by **the legs the junction
actually has**. A turn is a movement onto another road, so where there is no
road there is no turn: the arm of a tee has open ground on one side of it and
offers no turn that way however little anybody has restricted it, and the stem
of one cannot go through at all. A one-way leg running AT the junction is the
same case — a road there, but not one a driver may take. This is geometry
rather than restriction: nothing is stored, `armIsRestricted` still reads
false, and the arm goes back to offering the turn the moment a leg is laid.
Both the arrows and the pocket warrant read the narrowed set, and so does the
router's delay model, so the queue it prices and the lanes the road lays are
the same lanes.

A **turn pocket** is what an approach gains for that zone when the
junction's control actually holds THAT ARM and the arm both goes through and
turns left. Holding the arm is the condition the control alone cannot express:
a signal and an all-way stop hold everybody, but a minor-road stop or a
give-way holds only the arms below the top rank, and the road running through
is not stopped by it. A street with an alley stopping at it therefore gains
nothing — it has no queue to take a turning driver out of, and a storage bay
for a turn nobody waits to make is just a wider road. Neither does the ALLEY,
on its own side: a service access stores nothing, and a bay would double the
width of a single lane for a queue one van long. (The class is what rules that
out. The legs rule above already takes the pocket off any arm of a tee, since
one that cannot go through has no through traffic to take a turn out of — but
an alley crossing a street has all four legs and still stores nothing.) The
pocket is
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

**A short block takes a shared turn lane instead of two bays.** A pocket
belongs to ONE HALF of the road — it is the lane beside the centreline on the
approaching side — so a stretch with a junction at each end would carry one
bay on one side and the other bay on the other, tapering down and back up in
between: a road that widens, narrows, and widens again on the opposite side
over a couple of hundred metres. Where the two junctions are within
`SHARED_TURN_LANE_MAX_TILES` (8 tiles, 160 m) of each other, and BOTH of them
would give the road a bay, the whole block carries a **two-way left-turn
lane** instead — one lane at the centreline that
traffic turns from in either direction. It serves both junctions, is the same
width the whole way, and is symmetrical, so nothing swaps sides and there is
no taper at either end. It is the same lane a player can put down the middle
of a road from the profile editor, and it carries no through capacity, so the
road's capacity is unchanged.

The lane stands in for two bays, so it is laid only where both would really be
built: each junction's control has to hold this road, and the road has to be
able to go through and turn left there. A two-lane street running through
junctions its side streets give way at — or that nothing controls — earns no
bay at either end and carries no centre lane; the same street stopping for
bigger roads at both ends does.

Whether a tile is in such a block is a question about the RUN rather than
about an approach, and is asked separately: the tile halfway along belongs to
neither junction more than the other, and the approach walk rightly declines
to say which one it approaches — but it still has to be the same road as its
neighbours.

The width comes from the verge the profile has not spent, and then, as a last
resort, from the through lanes themselves — every one of them, each giving up
the same share of what it has to spare, down to the same 10 ft floor a bay
uses. That is the difference that matters: a BAY can only ask the half of the
road it belongs to, so a four-lane street has no room for one; a lane shared
both ways asks all four, and there is room. A four-lane street between two
close junctions therefore carries a turn lane where it could carry no bay at
all. Reserved lanes are never asked — a bus lane narrowed is a bus lane that
no longer fits a bus — so a road whose spare width is all in its bus lanes
gets nothing rather than a lane too narrow to wait in.

A road that cannot take the lane keeps whatever it had: a one-way has no
opposing traffic to share it with, a road with a median or a turn lane already
has its middle spoken for, and the lane is for streets that meet at grade —
never a motorway or its slip roads, which have no at-grade turn to store, and
never an unpaved track or a service alley, which carry no paint at all.

Turn **restrictions** (no left, no right, no straight, no U) are the same
mechanism in the degenerate case: a movement removed from every lane of an
arm rather than left on some. Turn arrows are painted from the resolved
movement set and nothing else, so a lane with no arrow is not a legal path
to that leg — the router treats a movement no lane offers as a banned turn.

**Tapers** govern a lane drop along one road, where a wider stretch of it runs
on as a narrower one: the extra width closes over a length set by the class's
own standard ratio, not by taste — 1:10 on dirt or alley, 1:12 on rural, 1:15
on every ordinary street class (local through arterial), 1:30 on a divided
road, 1:50 on a highway or a ramp. A 3.5 m lane closing at 1:50 takes 175 m,
about 10 tiles; at 1:10–1:15 it takes 35–50 m, about 3 tiles.

**A road tapers only into more of itself.** A lane reduction is made away
from an intersection (MUTCD 2023 §3B.12 ¶01), so a road keeps its full width
up to the mouth of any junction it meets, however much narrower the road it
crosses is: the walk that finds a taper stops at a junction tile, or at a
road held apart, and never takes the crossing road's width for its own. A
merge or a diverge is not a junction (below), so a motorway still tapers
through one exactly as before.

**The pieces that end close, and the pieces that carry on keep their
width.** A parking lane or a bike lane the narrower road does not carry
closes itself over the taper, on its own side, and the travel lanes beside
it are not touched; a parking lane ending needs no lane-reduction taper of
its own (§3B.12 ¶06), so it simply narrows away with the kerb. What is left
of the width difference is travel lanes: the outermost travel lane on each
side closes first, taking the wider side of an uneven road down to an even
one, and then the two directions close together, so the centre line runs
straight down the taper. A road whose lanes all run one way closes the
driver's right-hand lane first. A lane drop never squeezes the lanes that
remain, and footways and reserved transit lanes survive it untouched.

**The paint follows the pavement.** Each tile of a taper bends its edge from
its own width to the next tile's over its length, and every line and every
coloured lane on it bends the same way — the edge line, the lane lines, the
bike lane's green, a bus lane's terracotta and a parking lane's line and stall
marks — so nothing steps at a seam and nothing lies off the pavement.

A taper begins at full width, never part-closed: where the wide
road is shorter than its own taper, as a four-lane stub of three tiles between
a junction and a two-lane street is, the lanes close over the length the stub
has, steeper than the ratio. Started part-closed, the stub leaves the junction
already narrower than the junction box, and its kerb steps there. The lane
that closes carries its merge arrow at the head of the taper, placed in the
lane as wide as it is at that point. Placed further along, the taper has
narrowed the lane to less than the arrow. On a
motorway or a divided road the lane closes by paint alone — the tarmac runs
on at full width and the edge line moves inward, hatched into a gore, so a
driver who misses the merge still has pavement to recover on; on a street the
pavement narrows with the paint.

## How roads meet: rank, replacement and transitions

Every paved road is the same asphalt: a road is told apart by its width and
its markings, not by a tint of its own, because a colour step at every
seam reads as whichever road won the tile. Only a genuinely different
surface differs — gravel is tan, ballast is grey stone. See
[../art/README.md](../art/README.md) for the palette itself.

Roads replace each other by **rank**, not by catalog order: dirt < alley <
rural < local < one-way < urban < collector < arterial < divided < ramp <
highway. Rail sits outside the ranking, since it is a separate network: it
refuses no join, and neither takes a tile from the other, so rail drawn across
a street is refused like any road that does not outrank what it crosses, and
so is a street drawn across rail. Replace mode lays rail through a street,
which cuts it: the track is drawn running straight through and the street
stops either side. A road carrying a
reserved bus or tram lane outranks the same road without one, so a stray
drag cannot silently erase a transit line. A road may only be drawn through
one it outranks; drawing through a road it does not outrank is refused
whole, not laid as two stubs either side of a gap (an avenue's raised
median, for instance, leaves nowhere to cross). Replace mode overrides all
of this, because the player asked for it explicitly, and — if the new
profile is wider than the tile the old one occupied — the drag refuses
rather than half-demolishing the run.

**The kerb return.** Where two roads meet, the kerb does not turn a square
corner: it runs straight, turns through an arc tangent to both kerb lines,
and runs straight again, with the footway following it round at its own
width and the verge filling the square corner outside. The radius is a
per-class figure (`kerbReturnM` in `roads.json`), because what it decides is
how sharply a driver has to turn and how far somebody on foot has to walk
round — properties of the road, not of the drawing.

The figures follow the design vehicle each class serves. AASHTO's minimum
90° edge-of-pavement radii are 7.3 m for a passenger car, 12.2 m for a
single-unit truck and 12.8 m for a 40 ft bus; urban practice deliberately
goes tighter at minor junctions and accepts that a turning vehicle
encroaches on the opposing lane, because a tight corner is what keeps the
turn slow where people are crossing. So: an alley turns through 3.0 m, a
local or one-way street or a rural lane 4.5 m, an urban street 6.0 m, a
collector 7.5 m (a bus gets round without leaving its lane), an arterial or
divided road 9.0 m, and a highway or ramp 12.0 m. Ballast has no kerb to
return and takes zero.

**A service road is an access, not a leg.** An alley exists to reach the back
of a building — bins, deliveries, a fire appliance — and carries no through
traffic anybody routes around. A street it meets does not treat it as a leg of
the junction: it takes no turn bay for it, does not sweep its footway round
into it, and does not bend itself to become it. The footway runs straight past
the mouth and the alley climbs over it, which is what a dropped kerb is; and a
road whose only other arm is an alley has ENDED, so it runs straight to its own
turning head with the alley as a leg off the side. A farm track is not one of
these: it is a poor road, but it is a road, so a lane really does bend into a
track and the pavement really does end there.

**Which corner is turned.** The corner is the one the two ARMS make, and an
arm is exactly as wide as its own road: where a two-lane street meets an
avenue, the kerb it is tangent to stands 3.4 m inside the avenue's throat. So
the two lines a return joins are the arm's kerb on one axis and the
junction's on the other, and a junction with arms of different widths has
four corners of different depths. Every paved arm reports its own width,
footways or not: a street built without footways still has an edge for the
return to be tangent to, and drawn at the junction's width instead it stepped
2.4 m out of the street at the mouth. An arm WIDER than the junction's own
road widens the junction's mouth to it, so a wide street meeting a narrow one
arrives at its full width and rounds its corners from there. Only an unpaved
gravel track has no edge to be tangent to, and the junction's kerb runs past
it the way it runs past a driveway.

The tile caps it. A return needs its full radius clear of the carriageway on
both roads, and a 20 m tile only leaves `10 − carriageway/2` on each — 6.25 m
beside a two-lane street but 1.90 m beside an avenue, and the corner takes the
smaller of the two. Where the class asks for more than that, the arc is drawn
at the cap and stays tangent; a wider one would have to be drawn onto the
approach tiles as well, which the one-tile-owns-its-own-geometry model does
not do. So the widest roads still meet at corners tighter than their class
would choose, and an avenue's junction box is very nearly square.

Any two classes may otherwise join; the join itself is drawn, not stepped:
where a wider run meets a narrower one, the wider tile bends its edge in to
the narrower road's so the two flow together, and a tile narrowing at both
ends splits between the two wedges. This holds whatever the road is made
of — a gravel track and an alley ease into a width change exactly as a
kerbed street does, since width is width. What is excluded is a change of
SURFACE: a paved road meeting a gravel one keeps its paved-to-dirt band,
which is that join's own treatment, and bending as well would draw the same
change twice. Neither side of a junction bends toward the other: the
junction keeps its own throat, and the road arriving keeps its own width to
the junction's edge, where the junction takes each arm up at that width (see
the taper rule above).

Two joins are refused. A ramp will not run straight onto a dirt road or an
alley, which could carry neither its speed nor its volume. And a **motorway
is limited access**: it meets another motorway, or a ramp, and nothing else.
That is most of what makes it a motorway rather than a very wide street — a
crossroads on one puts a standing queue across four lanes of traffic at
speed — and it is why the ramp exists. The rule is stated as what the
motorway accepts rather than what it refuses, so a class added later stays
off it until somebody decides to let it on. Both unlock at the same
milestone, so the rule can never leave a player holding a motorway with no
way to reach it, and the refusal names the ramp rather than only saying no.

The road tool refuses both before the drag is sent, with the reason on the
cursor chip. The world refuses them again when the command arrives, whole and
with the same sentence, so no command from any source — an undo, a replayed
batch, a script — lays a street against a motorway.

**A road never goes through a building, and never quietly round one.** A
drag whose path crosses a standing building is refused whole — the cursor
chip reads "Overlapping items" before the click, and the world's reason
names the building and the bulldozer — rather than laid with the
building's tiles left out. A road laid around a building that way stands as
two pieces that join nothing and carry nothing, while reading on the map as
one road; a town once grew for thirty thousand ticks with a cross street in
three such pieces and the Advisor counting the zoned tiles beside them as
unpowered. Water and other roads are not in the way: a road bridges the one
and joins or replaces the other.

The case a motorway meeting a motorway leaves open is not a refusal at all:
**a highway lying ACROSS the way another highway runs, rather than in line
with it, is a separate carriageway and does not connect to it.** It is decided
in the grid, not by the road tool, because it is a fact about the two roads
and not about the drag that laid them — so it holds however the roads were
drawn, a tile at a time or all at once, and on a saved map loaded back in.

Which way a highway runs is its stored flow, never its shape. Two highway
tiles are separate carriageways when EACH lies across the other's flow: a
carriageway beside another points past it, while one arriving at right angles
points AT the tile it meets. So a motorway continuing a motorway end on joins
it, a motorway arriving square-on forms a junction, and two running alongside
stay apart. The rule asks only about highway tiles; a ramp alongside a motorway
joins it by its own rule (see Ramps and interchanges), and every other class
meets its neighbours exactly as it did. A corridor's own other half is a
separate matter, decided by `isCorridorPartner`; `isSeparateRoad` in
`src/world/roads.ts` asks all three questions, and the auto-tiling mask and the
network graph both read it, so what is drawn and what is driven cannot
disagree.

**The median opens where a street crosses a corridor.** The two halves of a
corridor never join each other along the road — that is what keeps a six-lane
road from reading as a junction its whole length — so a street meeting it
would otherwise end in a T against each half, facing the median, and nothing
could cross a divided road without an overpass. On a row where a road that is
not itself a corridor half joins each half from outside — one arriving at the
near half, one at the far half, the two in line across the corridor — the
median is open: the two halves join across that row, and the crossing is a
pair of junctions side by side, one on each carriageway. A car crossing goes
straight over both; one turning turns onto the carriageway running its way,
crossing the first to reach the second where it must, since each half is
driven only the way it flows. A street meeting only one half is still a T, and
the median stays shut there: a right turn in and out, the way a median
without a break works.

**A T onto a corridor nothing divides is a full junction.** Where no median
or barrier lies at a corridor's middle, nothing stops a car crossing it, so
one street meeting either half from outside is enough: the two halves join
across that row, and the T is two junction tiles side by side, one on each
half. A car leaving the side street turns right onto the near half, or left
across it onto the far half. A car on the far half turns left across the near
half into the street. The far half is a junction, so whatever control the
junction carries holds its traffic too. A divided corridor keeps the
right-in, right-out T above. Whether a corridor is divided is read off its
whole cross-section (`isDividedCorridor` in `src/shared/roadprofile.ts`),
the same test that decides whether its halves are drawn as one carriageway.
The world holds no profiles in the grid, so the worker hands it the ids of
the profiles nothing divides (`GridState.oneCarriageway`, derived from the
profile table, never saved), and a save's own table is read before its
masks are worked out.

The opening is read off the tiles each time the masks
are worked out, never stored, so it opens when the second street arrives and
shuts when either goes. A save keeps what its network linked, so a crossing a
save already holds stays shut until the street is laid again.
(`medianOpens` in `src/shared/corridor.ts`, asked by the mask and by the
approach walk alike.)

**A road laid as its own road does not join the roads beside it.** With the
road tool's snapping to roads off ([interaction.md](../ux/interaction.md#snapping-to-roads)),
`buildRoad` is sent with `join: false`. What it decides is the arms of the
tiles the command lays or lays again — the arms between one of those tiles and
a road tile outside the drag. An arm that was joined before the command joins
as before — the road it crosses, the road whose tile it overlaps — so a
crossing is still a junction; one that was not stays unjoined. Joining along
the drag itself is never affected. Sent with `join` left out, the same arms
all join, as a road's always have, one held apart before included: laying a
road again with snapping on is how a road laid apart is joined up. The arms of
a tile the command leaves as it was are not touched.

The fact is stored where roads are stored, in the network, as the absence of a
link: two neighbouring grid road tiles are joined exactly when the network
links them. The per-tile arms that are held apart are a derived layer
(`roadSeparate`, recomputed from the network on load and after every command,
never saved), and `isSeparateRoad` reads it alongside its other rules, so the
mask, the graph, the utility and service spreads, the approach walk and the
road furniture keep the two apart as they do two carriageways. It holds only
arms the rules would otherwise join; where a rule already keeps two roads
apart, the rule is the reason. A save from before carries a link wherever its
tiles joined, so nothing it holds comes apart.

An undo puts back exactly the arms that were held apart. A command that lays a
road over one, or takes one away, hands back with the road the arms of its
tiles that were held apart (`apart`, which only an undo sends); given them,
`buildRoad` holds exactly those apart and joins the rest.

The refusals are unchanged. A road laid apart is refused beside a road its
class may never meet — a street beside a motorway — as it would be when
joined.

**Status: built** (2026-09-28): `buildRoad` takes `join` and `apart`, saves
keep what is held apart, and the road tool's `Roads` snap toggle sends
`join: false` when it is off.

## Ramps and interchanges

`ramp` is its own class: one or two lanes, one-way, unzonable, at the
highway's own speed range but posted lower, admitting only a travel lane and
a shoulder. It is the ONLY way onto a motorway, which refuses every other
class outright. A ramp touching a highway forms one of two junction kinds,
both uncontrolled two-approach nodes:

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
costs land and nothing else. The lane's width comes from the verge the tile
has not spent, and then from the hard shoulder on that side, which narrows
to no less than 1.2 m (the motorway's own median-side shoulder, and the 4 ft
a constrained section may narrow an outside shoulder to beside such a lane),
so a walled motorway grows the lane inside its wall; a side whose shoulder
is already at that floor, with no verge to spare, grows none. A ramp's other end is a **terminal**: an
ordinary node on the surface network, taking an ordinary warranted control
and ordinary approach lanes like any other junction.

### How a ramp meets a motorway: alongside, never head-on

A ramp does not T into a motorway. Nobody joins traffic at motorway speed by
turning ninety degrees into it, and nobody leaves it that way either. A real
slip road comes off the surface road, bends round — the **elbow** — and runs
beside the motorway in the same direction before it merges, and an exit peels
off the same way in reverse. On this grid that is:

- **The ramp joins alongside.** The ramp's tile beside the motorway runs the
  same way as the motorway tile it joins. Which way each runs is its stored
  flow, never its shape.
- **It joins at one tile only.** An on-ramp joins at its END — the ramp tile
  with a ramp arriving into it and none ahead of it along its flow. An
  off-ramp joins at its START — the ramp tile with a ramp ahead and none
  arriving into it. What arrives into a tile is a ramp neighbour whose own
  flow points at it, which is how an elbow tile beside the motorway, flowing
  away from it with a ramp on both sides, is told from a start: it joins
  nothing.
- **Everywhere else beside the motorway it is its own road.** Along the
  parallel stretch a ramp tile and the motorway tile next to it are separate
  roads, exactly as two carriageways side by side are: no mask bit, no graph
  edge, no junction. Traffic changes road only at the join.
- **A head-on ramp is refused, and so is one against the traffic.** A ramp
  tile that would join a motorway while flowing across it (a T) or against it
  (a wrong-way merge) is refused with the reason, by the road tool and again
  by the world when the command arrives, and the reason says what to do: bend
  the ramp to run beside the motorway, the way it is going, before it meets
  it. A save that already holds a head-on ramp keeps it and draws it as it
  always did.
- **The join tile is a taper, not a corner.** On the ramp side the join tile
  carries the ramp's carriageway straight along its flow and fans its asphalt
  across the verge into the motorway's auxiliary lane on the half of the tile
  nearest the motorway's traffic — downstream at a merge, upstream at a
  diverge — so the ramp slants into the lane rather than turning into it. On
  the motorway side the tile is a ramp node, below, with its edge line open
  across the taper's mouth.
- **Merge or diverge comes from the join.** A join at a ramp's end is a
  merge and its auxiliary lane runs on downstream; a join at its start is a
  diverge and its auxiliary lane runs up to it. The exit board stands on the
  motorway tile before a diverge.

`rampJoin` in `src/shared/corridor.ts` decides how a ramp tile meets the
motorway beside it, and `rampJoinAround` reads it off any map; the grid mask
and graph, the approach walk, the furniture and the road tool's refusal all
ask it. `rampMouthAt` tells the motorway tile which half to open, and
`emitRampTaper` in `src/render/roadsmesh.ts` draws the ramp's side.

A whole interchange can be laid at once: a diamond, a partial cloverleaf or a
full cloverleaf, stamped onto a motorway already there
([interchanges](../game-design/features/interchanges.md)). It lays nothing
these rules would not: ordinary ramps that obey them, and a street carried
over the motorway as any overpass is.

**A merge or a diverge is not an intersection**, whatever its arm count, and
highways rarely have intersections at all. Nobody stops at one, nobody gives
way, and nobody picks a lane at it: a driver leaving is already in the
auxiliary lane before it, and a driver joining gets up to speed in the one
after it. So the motorway tile a ramp meets — a **ramp node**: its own
carriageway running straight through, and nothing beside it but ramps — is
drawn as the straight carriageway it is. Its lane lines and its left edge
line run through unbroken; it grows no junction box and no rounded corners;
its ramp-side edge line opens across the ramp's mouth and nowhere else; the
ramp's asphalt is as wide as the ramp; and the auxiliary lane is at full
width over the half of the tile the ramp joins over, instead of stopping short
of it. Over the other half, the tile bends to meet the plain motorway the way
a straight run meets a narrower one. That is past the ramp at a diverge,
where the lane has been left, and before it at a merge, where the lane has
not yet begun. Drawn at full width across the whole tile, as a square box,
the node stepped out at both ends, on the far side too. Nothing approaching
it is a junction approach, so nothing is arrowed on the way in — not the
motorway, and not the ramp's own last tile. A motorway meeting a motorway,
or one that turns or ends where a ramp meets it, is not a ramp node.

It takes no control, as nothing touching a motorway does, and a player's
override cannot put one there: setting a signal, stop or give-way on a
junction a motorway touches is refused, the same rule the warrant applies.
Its exit board stands once, on the motorway tile before a ramp that leaves —
a ramp alongside that diverges there, or a head-on ramp a save holds that
points away — and never after it or where a ramp joins. `isRampNode` in `src/shared/junction.ts` decides it,
and the render, the approach walk and the furniture all ask it.

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
template is missing. See [../DESIGN.md](../DESIGN.md) for the backlog.

## Furniture and what gates it

Furniture reads mostly from the profile's own lane pieces rather than from
a fixed tier list: a sidewalk piece is what a footway is, a median piece is
what a raised or planted centre is, a bike/bus/tram piece is what that
reserved lane is, and every marking that depends on one of them (bike-lane
fill, bus-lane fill, dashed-versus-double centre, edge lines) reads the
piece directly, so a composed profile gets the correct furniture with no
per-class special case.

**Lamps** have not yet migrated off the road's tier: they are placed on
every tier except gravel and rail, not on a piece toggle. **Kerbside
parking** reads both. A kerb beside the profile's own parking piece takes
cars at any hour, overnight included, whatever the tier; a kerb with no
parking piece beside it takes only short daytime stays, and only on a tier
whose catalog entry sets the per-tier flag (the two-lane road, the gravel
road, the alley and the one-way road); everything else takes none. No
preset paints a parking lane, so on the presets the flag alone decides, and
only by day. Wherever a kerb takes cars, none stands inside a junction's
no-parking zone (see [Markings](#markings)): the same measurement keeps the
stall marks and the cars out of it.

A junction places its own furniture by control rather than by tier: the
road ranked highest at a node runs through with no stop marking; every arm
below it gets a stop bar, and a ladder crosswalk wherever the road has a
footway (a road with no footway paints no crossing, since there is nobody
on foot to cross, and its kerb still sweeps round at the corner radius with
grass filling what would be the footway). Crosswalk presence at a junction
is derived this way from footway presence and rank; it is not (yet) an
independent per-approach toggle a player sets from the junction inspector.

A crossing is as DEEP as the footway it carries across the road, never less
than the 1.8 m a marked crossing may be (MUTCD 3C.03 ¶05), and it lies AGAINST THE
KERB LINE, which is where that footway runs. It is not as deep as the strip of
tile the footway sits in: the strip is the room available and runs opposite to
the road, leaving 6.25 m beside a two-lane street and 1.90 m beside an avenue —
so reading the room as the figure gave the quiet street a crossing 20 ft deep
and the busy one a normal 6 ft. Nor is it anchored at the tile edge, the outer
end of that strip, which leaves it floating with 4.4 m of road between it and
the kerb it is supposed to meet. Its bars are 0.45 m wide at 0.6 m spacing,
inside the 12–24 in bar and 12–60 in gap the standard allows.

No crossing is painted over a **service access**. The footway runs straight
across an alley's mouth rather than breaking for it, so the pavement IS the way
across; bars laid in that strip sit underneath it where nobody can see them.

**A manhole cover is the top of a sewer, so it exists only where a sewer
does.** A cover is drawn on the running surface of a road whose class carries
water, and on no other. A motorway and a ramp carry none — they drain off the
shoulder to the verge rather than to a buried line under the carriageway — so
a cover on one is a hole in a road with nothing beneath it, which is both
wrong and, at motorway speed, conspicuous. The test is the class's own water
flag rather than a list of tiers, so a class that stops carrying water stops
growing covers in the same change.

**A corridor is furnished as the road it is.** Its other half lies beside each
half along the whole run but is not an arm of it, so the furniture asks the
same question the mask and the approach walk ask (`isSeparateRoad` in
`src/shared/approachzone.ts`). Counted as an arm, it made every tile of the
road a crossing, and no corridor carried a lamp, a board or a signal head.

- **The shared edge stays bare.** Nothing kerbside stands on the edge the two
  halves share: lamps, boards, cabinets and meters take the outer kerb,
  measured from where the carriageway is. On a corridor nothing divides, that
  is pushed against the shared edge.
- **Lamps** stand only on a kerb with no road beside it. A lamp tile is
  chosen by its x + z, so the two halves are lit one tile apart, each from its
  own outer kerb.
- **Manhole covers.** A sewer runs under the middle of the street it serves.
  On a corridor nothing divides, the middle is the shared edge, so the covers
  lie there, laid by the half at the lower coordinate so the road carries one
  line of them. A divided corridor has a median there and carries none, like
  any road with a median.
- **Control boards.** A stop or give-way board and a signal head stand on an
  approach only where traffic arrives at the junction, the lanes a stop line
  is painted across. On a corridor that is the half whose lanes run toward
  the junction, and the board is on its driver's right, which is the outer
  kerb. The half running away from the junction carries none, and nor does a
  one-way street leaving one. The junction an approach tile serves, and who
  gives way there, are read from the roads that join it, never from a
  corridor half beside it.

A deck (an elevated or bridged road tile,
[Bridges and elevated roads](#bridges-and-elevated-roads)) inverts the
kerbside rules: no verge, so no parking meters, utility cabinets, manhole
covers, verge grass or street trees. What survives is what the road still
needs to be driven — lamps, and the boards or signal that govern right of
way where a junction lands on the deck, plus a motorway's exit boards and
gantries, whose signage is overhead because nobody is walking beside it.

See [../art/README.md](../art/README.md) for what every piece of furniture
actually looks like.

## Markings

Markings are read off the profile and the junction, never authored
per-tier:

- **Colour** follows one rule, and it is not the obvious one: yellow marks
  the side of the line that oncoming traffic is on, whether or not that
  traffic is adjacent. On an undivided road that is the centre — the dashed
  centre of a two-lane road, the double solid of an undivided multi-lane
  road, both edges of a two-way turn lane, which faces opposing traffic on
  each side. On a **one-way carriageway it is the left edge line**, because
  the far side of that line is where the opposing carriageway is: MUTCD
  §3B.09 ¶03 requires a solid yellow left edge line on the roadways of
  divided highways, on one-way streets, and on any ramp in the direction of
  travel. The right edge line is a solid white line (§3B.09 ¶02), and lane
  lines between same-direction lanes are broken white (§3B.06 ¶05). Every
  paved road carries edge lines; an unpaved track, a service alley and a rail
  line carry no paint at all.

  The shorter rule "yellow separates opposing directions, everything else is
  white" is what this model used to say, and it is wrong for exactly the
  roads where it matters most: a motorway carriageway painted white on both
  sides gives a driver no way to tell the median side from the shoulder side
  at speed, which is the whole reason the standard makes the distinction.

- **Where the edge line goes** is the inside edge of any reserved lane
  running along the kerb — a shoulder, a bike lane, a bus lane — because
  that is where general traffic actually ends. On a road with a shoulder it
  is the line that tells a driver where it is safe to pull over; on one with
  a bus lane it is the line they are not to cross, and the lane's coloured
  fill lies outside it, unbroken. Where the outermost lane is an ordinary
  travel lane the line falls back to a fixed inset from the edge of the
  pavement. That inset is held all the way down a road that is CHANGING
  width, which is a thing the paint and the kerb have to be told the same way:
  the carriageway settles a width difference by bending the wider tile all the
  way in to its narrower neighbour, so a line meeting its opposite number half
  way across the boundary — which is right between two roads of the same width
  — would sit half a step inside a kerb that has already moved, and the gap
  would open and close down every taper. So where one side is narrower, the
  narrower side's offsets are what both tiles paint to.
- **A bike lane lies between two white lines** (MUTCD 2023 §9E.01, §9E.02).
  On the travel side is the solid bike-lane line, at the lane's inside edge.
  On the other side is whatever bounds the lane there: the parking lane line
  where parking lies beyond it, the edge line — at its usual inset from the
  edge of the pavement — where the road has no kerb, and nothing where a kerb
  bounds it. The green is only a supplement to those lines (§3H.06): it fills
  the lane between the lines' inner faces, hugging the outer side where the
  lane is wider than the paint, and never lies under a line, past one, or off
  the pavement. A bike lane on the left of a one-way carriageway keeps its
  white bike-lane line, and the yellow is the left edge line beyond it. The
  same holds on every profile with a kerbside or parking-side bike lane, the
  Bike Lane preset and a composed one alike. The lane, its green and its
  lines run on into the junction up to where the intersection begins for it
  (§9E.02): the crossing over its arm, the stop line across its own lanes, or
  else the point where its kerb starts to turn the corner; its outermost line
  goes on round the corner with the kerb return.
- **A parking lane's travel side is its solid white parking lane line**, and
  no edge line runs inside the lane, where it would lay a second line through
  the cars. Its stall marks are white (§3B.27): ticks from the parking lane
  line toward the kerb, ending inside the lane at least 0.3 m short of the
  edge of the pavement. The stalls follow the 2009 MUTCD's parallel-parking
  layout (Figure 3B-21): an interior stall is 22 ft (6.7 m) long, inside the
  figure's 22–26 ft, and the stall nearest a junction 20 ft (6.1 m). The
  interior stalls are pitched from world metre 0, so they run on unbroken
  across every seam; the end stall is measured from the edge of the
  junction's no-parking zone (from the edge of the junction's tile where the
  zone ends inside it). No marked stall is shorter than 6.1 m or longer than
  7.9 m (26 ft). Where the pitch leaves an odd length beside the end stall,
  the end stall takes it up as far as 7.9 m; beyond that the no-parking zone
  grows instead, so the 6.1 m end stall ends on a pitch tick and the strip
  between it and the zone stays unmarked and empty. Where two zones leave too
  little room for an end stall each, as many legal stalls as fit are marked
  from one zone's edge, and none where not even one fits. The lane's 2.25 m sits inside
  the figure's 8 ft (2.4 m) stall width.
- **No parking at a junction.** The Uniform Vehicle Code (§11-1003) forbids
  standing within 20 ft (6.1 m) of a crosswalk at an intersection, and within
  30 ft (9.1 m) on the approach to a stop sign or a traffic signal; the 2009
  MUTCD's Figure 3B-21 draws the same two no-parking zones. So no stall is
  marked, and no car stands, within 9.1 m before a stop line on an approach
  a stop or a signal holds; within 6.1 m of a crosswalk; or, where an arm has
  no crosswalk, within 6.1 m of the junction's mouth — on the approach side
  and the departure side alike. The parking lane line itself runs on to the
  mouth as the lane's travel edge. One function measures the zone, and the
  paint and the parked cars both read it. A car parks one to a marked stall,
  centred in it, the stalls read off the same layout the ticks are painted
  from; a kerb whose street allows parking but paints no lane has no stalls,
  and its cars keep their plain row.
- **An edge line is broken only across the mouth of a road that joins**
  (§3B.09 ¶07, §3B.11 ¶07–08). On a junction tile every side with no arm
  keeps its edge line for the tile's full length, so the far side of a T is
  unbroken: the road it runs along runs on past the junction there. It runs
  at the edge line's own inset from the junction's kerb on that side,
  bending from one arm's inset to the other's where the two differ.
- **Round a junction's corners** the edge line follows the kerb return. It
  marks where the running surface ends, and at a corner the running surface
  ends along that arc, so it is the same line the arms carry rather than a
  decoration on top of it — and it is drawn as the return's own arc at a
  larger radius, which is what makes it concentric with the kerb rather than
  merely near it. It is not a control marking: an uncontrolled junction paints
  no stop line and no crossing, and still carries this. Where the two arms
  put their outermost line different distances inside the kerb — a parking
  lane line on one, an edge line on the other — the arc's inset bends from
  one to the other round the sweep, so it leaves each arm exactly where that
  arm's own line runs. A kerbside bus lane's inner edge is marked once,
  solid, rather than dashed as a boundary between two ordinary same-way lanes
  would be.
- **Centre line** is derived per class: dirt, alley, one-way, highway,
  ramp and rail paint no centre line at all (a one-way or a motorway has no
  opposing traffic to separate, and dirt/alley carry no paint of any kind).
  Rural, local, urban and collector paint a dashed centre when the road
  carries one lane each way and a double solid when it carries two or more
  each way — the standard no-passing rule for a wider undivided road.
  Arterial and divided roads always paint double solid (a divided road's
  median is the real separator; the double solid is what shows on the
  paved side of it).
- **A broken line is painted at the size one is painted**: a 10 ft segment
  with a 30 ft gap — 3.05 m of paint every 12.2 m — and a line 6 in (0.15 m)
  wide. One part paint to three parts gap is the whole of what a driver reads
  a broken line by, and it is the same figure for a lane line as for a centre
  line, so both come from the one metric. The phase is anchored at global
  world-metre 0 rather than per tile, so the pattern runs unbroken across
  every tile and chunk seam.
- **A turn bay is fenced by a solid line.** The line between a turn bay and
  the through lane beside it is solid white, the normal 6 in width: MUTCD
  §3B.06 ¶07 wants a solid line between a through lane and a mandatory turn
  lane, because a through driver is not to drift into the queue. It runs the
  whole of the bay, taper included, and where the bay has closed it ends on
  the centre line the bay opened from, not on the kerb — the bay closes
  toward the middle of the road, so that is where its line goes. The dotted
  extension through the taper that §3B.23 ¶03 allows is not painted.
- **A line never crosses another on its way across a seam.** The lines on each
  side of a seam are paired in the order they lie across the road, colour by
  colour, and the pairing that moves them least is the one drawn. So the two
  lines of a double centre that a bay pushes sideways stay side by side: paired
  by nearness alone, a shift wider than the gap between them paired each line
  with the other's partner, and the two crossed.
- **Turn-lane paint.** A two-way left-turn lane carries a solid line toward
  the through lane and a broken line toward the turn lane on each side —
  legal to cross into to turn, illegal to travel along — with white turn
  arrows painted in it pointing each way, each hooking toward the left of the
  driver it faces, across the oncoming traffic they turn through.
  It counts toward the road's width and its class's lane range, and carries
  no through capacity, which is what a turn lane is for.
- **Turn arrows, merge arrows, gore chevrons** all come from the approach
  lane movement sets and the tapers, never authored: an arrow exists only
  where a lane's resolved movement set says the movement exists. A
  single-lane approach is left unmarked, since it does everything anyway —
  which is also what MUTCD 3D.06 ¶01 says of one at a circular
  intersection.
- **An arrow is painted at the size one is painted.** The MUTCD leaves the
  sizes to the Pavement Markings chapter of FHWA's _Standard Highway Signs_
  (§3B.20 ¶05), which draws a through arrow 9.5 ft long (2.90 m) with a
  5 ft (1.52 m) head, a turn arrow 8 ft (2.44 m), and a combined turn and
  through arrow 12.75 ft (3.89 m), the turn's head leaving the stem 7.5 ft
  (2.29 m) behind the through head's tip; every stem is 12 in (0.30 m) wide.
  The head of a through arrow is not dimensioned there, so it takes Georgia
  DOT's standard detail T-12B, 3 ft 8 in (1.12 m) across. A lane-use arrow,
  a two-way turn lane's arrows and a one-way street's direction arrows are
  all these sizes; no road in the game is slow enough for the 25% reduction
  §3B.20 ¶11 allows below 25 mph, and the long freeway arrow is never
  painted, because nothing arrows a motorway. An arrow stays inside its own
  lane (§3B.20 ¶08). Drawn at twice this, an approach's arrows ran the length
  of a car and a half and read as lane lines.
- **Gore hatching** is diagonal bars at 45°, sloping away from the traffic
  beside them in the direction that traffic goes (MUTCD 3B.25 ¶08–09), so both
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
  the two-lane roundabout; see [../ROADMAP.md](../ROADMAP.md). A compact
  roundabout's yield line follows the edge of its ring across each entry
  (MUTCD 3D.04), each entry has a raised splitter island between it and the
  exit beside it, and its single-lane ring carries no lines at all.

## Capacity, control delay and warrants — the formulas

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
  is not — with `x` the entry's v/c against its HCM entry capacity, not
  against its own road. Delay is per movement, dividing by however many lanes serve that
  movement, and is added to the edge cost of the approach.
  Every curve here is the sim's own reduced form of the manual's, not the
  manual's, and the roundabout's stays that way on purpose (decided
  2026-10-05): the HCM's single-lane entry delay (7th edition, Eq. 22-17)
  costs three to six times as much at moderate to high v/c, about 63 s
  against 14 s at capacity, and adopting it alone would make a roundabout
  far slower than a signal or a stop at load, which the reduced curves for
  those controls would then misstate. The controls are compared against each
  other, so they keep one kind of curve; adopting the manual's forms is a
  change to all of them together or none.
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
  The reduction itself is made away from an intersection (MUTCD 2023
  §3B.12 ¶01), and a parking lane that ends needs no taper of its own
  (§3B.12 ¶06).
- **Kerbside parking stalls**, from the 2009 MUTCD's parallel-parking layout
  (Figure 3B-21, carried by the 2023 edition's §3B.27 on parking space
  markings): stalls 8 ft (2.4 m) wide, an interior stall 22–26 ft and the
  game's 22 ft (6.7 m), the end stall 20 ft (6.1 m). The no-parking zones
  are the Uniform Vehicle Code's §11-1003, which most states adopt word for
  word (for instance Oklahoma, 47 O.S. §11-1003): 20 ft (6.1 m) from a
  crosswalk at an intersection, and 30 ft (9.1 m) on the approach to a stop
  sign or a traffic signal.
- **Turn-lane storage**, from AASHTO's 15 m minimum plus one queued vehicle
  per 20 s of red at 7.5 m each: a local approach stores 2 cars (≈ 30 m) —
  an approach zone of 2 tiles; a collector 4–5 cars (≈ 50 m) — 3 tiles; an
  arterial 7–9 cars (≈ 70 m) — 4–5 tiles.
- **Roundabout size**, from inscribed circle diameter: one tile (20 m) is a
  mini roundabout (real range 13–25 m, ≤ 15,000 vpd); a 2×2 block (40 m)
  holds a compact roundabout of 36 m (NCHRP 1043's compact range 24–37 m,
  ≤ 15,000 vpd; FHWA's first guide calls 30–40 m an urban single-lane
  roundabout). Either one's entry carries the HCM's single-lane entry
  capacity against the traffic circulating in front of it (above).
- **Merge delay**, the one formula above that is not adapted from a
  published curve: `2 + 22·x³` seconds, where `x` is the v/c of the
  highway lane a ramp is merging into — small on an empty road, and the
  slip-road queue every motorway gets at rush hour once it climbs.

## Sound walls

A motorway or a ramp may carry a noise wall at the outer edge of either side:
a `soundWall` piece, outermost on its side, 0.6 m wide for the concrete
safety barrier it stands on, with a height of 3, 4.5 or 6 m. It is an edge
piece, outside the carriageway, so it moves no lane, marking or kerb, but it
counts against the width budget. The road tool offers it as a side choice
and a height ([sound-barriers.md](../game-design/features/sound-barriers.md)).

- **Where it stands.** On each tile, a wall at the low end of the section, in
  world order and halved for a corridor, is on the tile's north edge if the
  road runs east–west and its west edge if it runs north–south; the high end is
  the south or east edge. A wall stands only on an edge no arm leaves by, so it
  opens across a slip road's mouth and round the inside of a corner. Across
  the tile, its base runs 0.6 m out from the carriageway's edge, plus the
  corridor shift. Which edge is read off the road's own section, so the worker
  and the renderer ask the same thing (`soundWallsAt` in
  `src/shared/soundwallsites.ts`); how far across follows the drawn section,
  so where the motorway grows an auxiliary lane beside a slip road the lane
  runs inside the wall and the wall's base steps out with it, the hard
  shoulder narrowing to make the room.
- **Room.** On every walled side the carriageway's half-width plus 0.6 m must
  fit inside half a tile. Three or four lanes at the motorway's 3.6 m have
  room both sides, and so do the outer halves of a five- or six-lane
  corridor; a section already reaching the tile's edge has none. A road off
  the grid is refused with a wall.
  Only the ground layer carries one; over an overpass tile it stops.
- **What it does.** Noise crossing the edge is cut by the wall's insertion
  loss, 5 dB plus 1.5 dB per metre above 3 m: 5, 7.25 and 9.5 dB (FHWA Noise
  Barrier Design Handbook §3.5.1; 23 CFR 772.13(d) makes 5 dB feasible and
  7–10 dB the design goal). See
  [environmental-simulation.md](environmental-simulation.md#noise-fieldidnoise--2).
- **Price.** ¢5.4 per metre of height, per side, per tile (¢16, ¢24, ¢32),
  from $525/m² of wall (FHWA inventory, 2020–22) against $3.551M a
  lane-mile of rural freeway (FHWA C&P Exhibit A-1, 2014) at the three-lane
  motorway's ¢68 a tile. Upkeep is the motorway's ratio of upkeep to price.
  On a corridor each wall is charged once, across the two runs.

## The road tool

The drawer's road category shows classes, not tiers; picking one lays its
default profile. The tool options panel grows a profile editor — lane
pieces as a strip across the tile's width budget, with per-side toggles for
parking, bike lanes, lamps and sidewalks and a median picker — and its
edits apply to the next drag. The path modes are `Straight`, `L-path`, `Grid`
(not for a motorway) and `Curve`, which lays a road off the grid
([road-network.md](road-network.md),
[interaction.md](../ux/interaction.md#curve-and-free-road-modes)). A replace
mode drags a new profile over an
existing run in place, keeping alignment, buildings and elevation; if the
new profile does not fit the tile the old one occupied, the drag refuses
rather than demolishing anything. Clicking a junction node opens the
junction inspector: a control picker, a per-approach lane movement grid,
turn restrictions, and the delay the current control is costing. Clicking a
ramp node shows its merge or diverge length. Every edit is a command
through the same worker queue as any other build action, and every one is
undoable.

## Progression and unlocks

The catalog's actual milestone gates, as shipped: at the start (milestone
0), the two-lane road (local class) and the gravel road (dirt class). At
milestone 1: the alley, the one-way road, the four-lane road (urban class),
the bike lane (local class) and the avenue (arterial class). At milestone 2:
the bus lane (arterial class). At milestone 3: the highway, the tram track
(urban class) and the ramp. At milestone 4: the rail track.

## Bridges and elevated roads

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

A road crossing over another road or a railway is an overpass: an elevated
road like any other, holding a second road on the one tile where the two
overlap. See [overpasses.md](overpasses.md).

Two road tiles join only at one level: both on the ground, or with decks
within one grade step of each other. A deck up in the air passes beside a road
on the ground without meeting it — which is also what keeps an overpass's
approach, left standing when its crossing is bulldozed, from joining the road
it used to cross.

Deferred, deliberately: tunnels, a third deck level, styled piers, and
suspension or arch spans; a bridge here is a slab on piers. See
[../DESIGN.md](../DESIGN.md).
