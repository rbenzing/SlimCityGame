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
| highway   | 2–8   | 90–120 (100) → 28           | 2,350 veh/h (free-flow) | 1,000        | travel, shoulder, barrier, median                       | no      | power only  |
| ramp      | 1–2   | 50–80 (60) → 17             | 2,000 veh/h (free-flow) | 850          | travel (one dir), shoulder                              | no      | power only  |

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

## Stored direction and one-way roads

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

## How roads meet: rank, replacement and transitions

Every paved road is the same asphalt: a road is told apart by its width and
its markings, not by a tint of its own, because a colour step at every
seam reads as whichever road won the tile. Only a genuinely different
surface differs — gravel is tan, ballast is grey stone. See
[../art/README.md](../art/README.md) for the palette itself.

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

The tile caps it. A return needs its full radius clear of the carriageway on
both roads, and a 20 m tile only leaves `10 − carriageway/2` — 6.25 m beside
a two-lane street but 1.90 m beside an avenue. Where the class asks for more
than that, the arc is drawn at the cap and stays tangent; a wider one would
have to be drawn onto the approach tiles as well, which the one-tile-owns-
its-own-geometry model does not do. So the widest roads still meet at
corners tighter than their class would choose, and an avenue's junction box
is very nearly square.

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

## Ramps and interchanges

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
template is missing. See [../DESIGN.md](../DESIGN.md) for the backlog.

## Furniture and what gates it

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

See [../art/README.md](../art/README.md) for what every piece of furniture
actually looks like.

## Markings

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
- **Where the edge line goes** is the inside edge of any reserved lane
  running along the kerb — a shoulder, a bike lane, a bus lane — because
  that is where general traffic actually ends. On a road with a shoulder it
  is the line that tells a driver where it is safe to pull over; on one with
  a bike or bus lane it is the line they are not to cross, and the reserved
  lane's coloured fill lies outside it, unbroken. Only where the outermost
  lane is an ordinary travel lane does the line fall back to a fixed inset
  from the kerb. A parking lane is not treated this way: it already draws a
  solid line along its own inner edge with the bays it ticks off, so an edge
  line there would only lay a second line over the first. A kerbside bus
  lane's inner edge is therefore marked once, solid, rather than dashed as a
  boundary between two ordinary same-way lanes would be.
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
  the two-lane roundabout; see [../ROADMAP.md](../ROADMAP.md).

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

## The road tool

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

Deferred, deliberately: one tile still carries one road tier, so a road
crossing over another road (an overpass) is not representable and is not
attempted — that needs a second road layer, which this design exists to
avoid. Tunnels, styled piers, and suspension or arch spans are likewise out;
a bridge here is a slab on piers. See [../DESIGN.md](../DESIGN.md).
