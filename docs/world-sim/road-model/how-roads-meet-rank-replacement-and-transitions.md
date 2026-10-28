# How roads meet: rank, replacement and transitions

Every paved road is the same asphalt: a road is told apart by its width and
its markings, not by a tint of its own, because a colour step at every
seam reads as whichever road won the tile. Only a genuinely different
surface differs — gravel is tan, ballast is grey stone. See
[../art/README.md](../../art/README.md) for the palette itself.

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
road tool's snapping to roads off ([interaction.md](../../ux/interaction.md#snapping-to-roads)),
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

**Status: built:** `buildRoad` takes `join` and `apart`, saves
keep what is held apart, and the road tool's `Roads` snap toggle sends
`join: false` when it is off.

