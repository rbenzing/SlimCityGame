# Streets and ground detail

What a road looks like, not how it behaves. Roads graduate from tinted quads
to readable streets entirely through vertex-colour and geometry work on the
existing per-chunk road mesh — no textures. Lane composition, junction
control logic and capacity numbers are simulation facts and stay in
[road-model.md](../world-sim/road-model.md); the road cross-section table lives in the
[scale bible](README.md). This file is what a modeller or shader author needs
for the surface, the paint, the furniture and the zoning overlay.

## Asphalt and paint

- **Asphalt**: light grey per the [buildings.md](buildings.md) palette
  (darker than the sidewalk, lighter than a near-black), with a slight tier
  darkening — highway darkest. Gravel Road instead renders a dusty tan
  unpaved look with no paint and no kerbs.
- **Paint is true-world scale**, not tile-scaled: line width is ~0.15 m; a
  broken line, lane line and centre line alike, is 3.05 m of paint and a
  9.15 m gap (a 12.2 m period). Dash phase derives from GLOBAL world
  coordinates (not the tile or chunk), so the pattern stays continuous across
  every seam.
- **Markings by class**, read from the cross-section: yellow separates
  opposing traffic and every other line is white. A two-way road with one
  lane each way carries a broken yellow centreline; one with two or more
  lanes a side, and every arterial, a double solid yellow; lanes running the
  same way are split by broken white lane lines, and a two-way road's edge
  lines are solid white. A one-way street, a motorway and a ramp carry no
  centre at all and instead edge their one carriageway in solid line, inside
  any shoulder — yellow on the driver's left, white on the right; a tram
  track has NO painted centreline at all — its rails are the centre. Alley
  and gravel carry no paint.
- **Colour-banded transit lanes**: a bus lane's outer, kerbside lane on each
  side paints terracotta (the universal transit-lane tint) with a periodic
  white transit-diamond glyph centred in it, and the dashed lane divider
  falls exactly at the band's inner edge, reading as the lane separator. A
  bike lane's green edge strip on each side carries a periodic white bicycle
  pictogram (two wheel rings, a frame, handlebar and seat bars, drawn
  top-down). Both bands paint on straight runs only and break at junctions
  and turns, the same as the avenue median below; the coloured band sits just
  above the asphalt and below the white paint so markings and glyphs read on
  top of it.
- **Rails**: a tramway embeds two steel rails at a 1.5 m gauge plus periodic
  cross-tie sleepers, sleeper phase anchored at global world-metre zero so
  ties line up across every seam. A track belongs to the LANE that carries it,
  not to the road: mixed running lays one down each running lane it shares
  with the traffic, and a reservation lays one down each of its two tram
  lanes, so a twin-track reservation reads as two tracks rather than one wide
  one. A dedicated Rail Track is not a street at all — a dark ballast bed with
  no kerbs, markings or crosswalks, carrying the same rail-and-sleeper
  geometry on a narrower, gravel-class corridor, and it has no lane pieces to
  read, so its single track runs down the middle. It never crosses a street at
  grade: laid through one in replace mode it runs straight through and the
  street ends either side of it. There are no level crossings yet. A
  tramway is different: where it crosses another street, the rails run
  straight on across the junction box between the two tram arms, at the
  offsets the tramway's own preset lanes give them, so the track reads as
  unbroken over the crossing street's paving.
- **Intersections**: marking strips stop at any tile whose connections number
  three or more, so the junction box itself stays clean asphalt and reads as
  a real crossing. The one exception is a motorway tile a ramp meets — a merge
  or a diverge — which is not an intersection: its lines run through, it has
  no box and no rounded corners, and its edge line only opens across the
  ramp's mouth (see [road-model.md](../world-sim/road-model.md), Ramps and
  interchanges). What an approach into a proper intersection is painted
  follows the junction's control. An approach that gives way under a stop or
  a give-way, and every approach under an all-way stop or a signal, gets a
  zebra crosswalk where there is a footway to carry across: bars ~0.45 m wide
  at ~0.6 m spacing, as deep as that footway but never under 1.8 m, lying
  against the kerb line, and never over an alley mouth. An approach that has
  to stop also gets a stop line: a 0.4 m bar across its arriving lanes, 1.2 m
  in advance of the crosswalk. The road running through a give-way or a
  minor-road stop is not painted, an uncontrolled junction carries neither,
  and a roundabout carries a yield line across every entry instead.
- **Corner rounding**: a turn tile — exactly two adjacent connections —
  renders as a true quarter-annulus curved road: a constant-width carriageway
  swept 90° around the tile corner the two connected sides share, meeting
  each straight neighbour seamlessly. Curved sidewalks fill the rest of the
  tile (an inner fan sector plus an outer band). A plain-centreline turn tile
  carries matching curved lane markings — the same per-class paint rules as a
  straight run, swept as arcs at the carriageway's own radius, dash phase
  anchored at the arc start. Every line keeps the side of the road it holds on
  the straight arms either side, so a one-way street's yellow left edge runs
  round the inside of a left-hand bend and the outside of a right-hand one.
  This is cosmetic only: the underlying road graph
  stays grid-aligned.
- **Road-end caps**: a dangling road end rounds off, and the kerb/sidewalk
  arcs around the cap at the cap's own radius rather than staying square.
  A road off the grid rounds its dead end the same way — a half-disc as wide
  as its carriageway, the footway wrapped round it, each line wrapped at its
  own radius in its own side's colour — but inside its own length, so the
  footway's tip is the point the road was drawn to, and a road too short for
  a true half-circle at each end flattens its caps along itself.
- **Direction arrows**: a placed one-way road shows pavement direction arrows
  roughly every third tile, each the standard 2.90 m through arrow (see
  [road-model.md](../world-sim/road-model.md#markings) for every arrow's
  size). While a one-way road or a highway is being
  dragged into place, translucent arrows along the ghost path also show the
  direction traffic will run, following the drag path around a corner; they
  belong to the placement preview and disappear with the rest of the ghost
  once placement ends.

## Median, dividers and kerbs

- **Avenue median**: a straight avenue run carries a raised ~1.8 m centre
  median — a concrete-tinted edge with a grass-green top — planted with a
  simple deterministic tree (trunk plus canopy) roughly every second tile.
  The median and its trees break at intersections and corners so turn paths
  stay clear, giving the tree-lined-boulevard read. A road laid as two
  carriageways keeps its median shut except where a street crosses it: there
  both halves are junctions, joined across the median, and the median breaks
  for the width of the crossing, so the opening reads as a gap cars drive
  through rather than a kerb they drive over.
- **Concrete divider**: a straight run whose cross-section carries a
  `barrier` piece gets a low ~0.6 m concrete band in place of a painted
  median. It is read off the section, never assumed of a class: a barrier
  separates two carriageways, and a motorway is ONE, so a class-keyed divider
  would wall off its own centre lane.
- **Sidewalks**: a lighter, raised kerb strip (0.08 m) runs along every road
  edge that borders a non-road tile, vertex-coloured near-white.
- **Kerb width is what the section declares, clamped to what the tile has
  left — not an assumed footway.** A two-lane road leaves plenty of tile
  beyond its carriageway and draws a full footway; a section that declares a
  kerb and no footway draws only that narrow kerb; a motorway or a ramp
  declares neither, because its shoulders are already inside the paved width
  and nobody walks beside one. `curbWidthMeters` is the one number everything
  standing beside a road measures from — lamps, signage, and a bridge deck
  alike, which is why a motorway's column stands where its hard shoulder
  ends.
- **Nothing curbside seats on a tile with road on both axes** — a turn, a T,
  or a crossroads. Such a tile has no kerb: the lateral offset that clears
  one carriageway lands inside the other. Lamps and parking meters skip those
  tiles, and the junction is lit and served from its approaches instead.
  Manholes are the deliberate exception — they belong in the carriageway, so
  a junction is a fine place for one.
- **One prop per kerbside slot.** A sign and a utility cabinet both stand at
  the tile centre, on one side of the road, the same distance out from the
  carriageway — the same piece of ground. A tile that earns a board therefore
  seats no cabinet: the board is what the road needs to be driven, the
  cabinet is scenery and there is always another tile for it. Parking meters
  escape the clash by sitting ±3 m along the run rather than at the centre,
  which also keeps them clear of a lamp. A meter stands at the kerb of the
  side that has the parking lane; only a street parked on both sides picks
  either.

## Junction and motorway signage

A junction is signed by its own control, which the simulation's warrant
decides from the classes that meet and what they carry
([road-model.md](../world-sim/road-model.md)), never by the approaching
road's tier. A signalised junction puts a **traffic signal** on every
approach — a mast with a short arm reaching over the carriageway and a
three-lens head hung off it.
The mast stands at the KERB FACE, not at the back of the footway where a flat
board goes: the arm is short, and one that has to cross the paving first
arrives at the kerb line with nothing left and hangs its head over the kerb
rather than over the lanes it holds.
An all-way stop puts a **stop** board on every approach; a minor-road stop or
a **give way** boards only the approaches that give way, and the road running
through carries none; a roundabout gives way at every entry; an uncontrolled
junction is not signed at all. A signal head shows three dark lenses with
exactly one lit over them, and the lit one cycles on the same city-wide
signal clock the simulation uses, so what a head shows is the phase the
junction is actually in.

A motorway is signed like a motorway, not like a street: it takes none of the
street furniture above — no kerb, so no utility boxes, no parking meters, no
stop/give-way boards, and never a signal, because you do not halt traffic on
a motorway, you give it an exit. It gets two sign types of its own:

- An **exit** cantilever where something leaves the motorway: one post at the
  shoulder, a lattice-truss arm reaching over the carriageway, and a green
  panel hung off it carrying an exit-number tab above its top edge, a
  diagonal exit arrow, and a yellow advisory-speed plaque beneath.
- A **gantry** periodically along a straight run: legs outside both
  shoulders, a truss carrying right across, and two panels beneath it with
  lane-assignment down-arrows. This is the one sign type that straddles the
  centreline instead of standing at a kerb, so it takes no lateral offset.

Every sign faces the traffic it serves, and its facing comes from the
direction that traffic approaches from, not from the roadway edge the sign
happens to stand on (MUTCD §2A.17 ¶01–02). On a two-way road the two agree,
because each kerb has its own stream. On a one-way carriageway — a motorway, a
ramp, a one-way street — they do not: both kerbs carry the same stream, so
only the tile's stored flow says which way it runs, and the sign reads that.

- A **flat board** turns freely, so it faces back against the flow from
  whichever kerb it is on, and on a two-way road back along its own kerb's
  stream.
- A **cantilever** — the traffic signal and the exit board — cannot turn
  freely. It is authored reaching along +X and yawed by the shared
  `signalYaw`, which swings the arm in over the road from its kerb; the face
  is fixed to the arm, on local −Z, so that one turn decides both. From the
  approaching driver's right, −Z looks back down the lanes at them. So a
  cantilever stands only on the right of the traffic it serves: a signal at
  the stop line on the driver's right, and a one-way carriageway's exit board
  on the kerb to the right of the flow or not at all, since a board showing
  drivers its back is worse than none. An arm pointed the wrong way hangs
  over the grass; a face pointed the wrong way shows a lit head to the
  drivers across the junction instead of the ones waiting under it.
- A **gantry** straddles the carriageway on legs outside both shoulders, so
  it has no kerb and no arm to turn. Its face is on local +Z and it turns to
  face back against the stored flow.

The placement decides the facing and the renderer applies it; it never
works one out for itself.

## Ground-cover transitions

A dead-end road's rounded cap (above) carries its ground transition with it:
the kerb/sidewalk arc wraps the cap, and a sidewalk-to-dirt-to-grass
transition ring conforms to that same rounded perimeter rather than stopping
in a square. See [vegetation.md](../visual-render/vegetation.md) for the general road-adjacent
ground-cover rules (the "mown lawn" read near roads and parks, and the dry
patch/canopy-shadow variation everywhere else).

## Zoning-grid visualisation

One shared predicate decides both what the visible grid highlights and what
the zone-paint tool accepts, so the grid never shows a shape the tool would
reject. A cell is zonable only within a fixed depth of 4 cells measured
perpendicular to a road's travel axis, off the road's SIDE frontage — never
the old uniform box around a road. The march steps outward from each
frontage cell and stops at the first blocking cell (water, another road, a
building, or a slope past budget), so cells sitting behind an obstacle are
never zonable. A dangling road end's frontage is only its two parallel
sides, never the open end, so nothing is zonable on or across a dead end —
the read is that a building always needs a real, direct approach from the
street, not just proximity to one.

The grid (all its layers) is visible only while a zone tool — or the
landfill brush, which paints into the same available-land mask — is in
hand; every other tool hides it. Every grid and tint vertex sits a small,
fixed positive band above the terrain height at its own position, with each
tile subdivided into 4 cells so the fill does not poke through sloped ground
near a road. New residential zone tints run in greens; Mixed tints a
distinct teal sitting between the residential green and the commercial blue
— see [buildings.md](buildings.md) for what each zone actually builds.

## Deferred

A grid corner's arc is paint and kerb only, and the graph never steps
diagonally. Free-form roads — curves and roads at any angle — are being built
as a network of nodes and segments, and until they land nothing here draws
one ([road-network.md](../world-sim/road-network.md)). Deferred: quays, pedestrian streets, and decorative sidewalk-tree upgrades beyond the avenue
median above. [DESIGN.md](../DESIGN.md) owns this backlog and its reasoning.
