# Asphalt and paint

- **Asphalt**: light grey per the [buildings/README.md](../buildings/README.md) palette
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
  bike lane lies between two white lines — the solid bike-lane line on the
  traffic side and, on the other, the parking lane line where parking lies
  beyond, the edge line where the road has no kerb, or the kerb itself — and
  its green fills only the space between the lines' inner faces, hugging the
  outer side where the lane is wider than the 1.6 m of paint, and carries a
  periodic white bicycle pictogram (two wheel rings, a frame, handlebar and
  seat bars, drawn top-down). The green never lies under a line, past one or
  off the pavement. Both bands paint on straight runs only and break at turns,
  the same as the avenue median below; at a junction a bike lane, its green
  and its lines carry on into the junction's arm up to the crossing, the stop
  line across its lanes, or where the kerb starts to turn. The coloured band
  sits just above the asphalt and below the white paint so markings and
  glyphs read on top of it.
- **Parking lanes**: a solid white parking lane line on the traffic side, and
  no edge line inside the lane. White stall ticks run from that line toward
  the kerb and stop at least 0.3 m short of the edge of the pavement. Stalls
  are 6.7 m (22 ft) long, pitched from world metre 0 so they run on across
  every seam; the stall nearest a junction is 6.1 m (20 ft), measured from
  the edge of the junction's no-parking zone. No stall is shorter than 6.1 m
  or longer than 7.9 m (26 ft): the end stall takes up an odd length to
  7.9 m, and beyond that the zone grows rather than a stall. No tick is painted within
  9.1 m before a stop line, within 6.1 m of a crosswalk, or within 6.1 m of
  the junction's mouth where its arm has no crosswalk, on both sides of the
  junction; the parking lane line runs on through that zone to the mouth.
- **Angled and head-in parking**: the same white parking lane line on the
  traffic side, and white stall lines (~0.15 m) from it toward the kerb at
  the stall's angle, stopping at least 0.3 m short of the lane's outer edge:
  60° to the kerb every 3.0 m on an angled lane, its kerb end upstream of its
  travel end for the traffic beside it, and 90° every 2.6 m on a head-in
  lane. Lines are pitched from world metre 0 and follow the ground in short
  segments. A stall whose footprint would reach into a no-parking zone is
  not marked.
- **Accessible stalls**: each block face's accessible stalls carry the
  International Symbol of Accessibility — a white wheelchair figure (head,
  seat and back, legs and a wheel ring) on a blue square about 1.5 m on a
  side (smaller where a parallel lane is narrower than the square and its
  margins), centred in the stall and drawn to be read from the travel lane.
  The blue is the paint palette's accessibility blue, the one non-white,
  non-yellow, non-lane-tint paint. An angled or head-in accessible stall has
  its access aisle beside it on the passenger side, bounded by stall lines
  and hatched with white diagonal lines at 45° to the kerb about every
  0.6 m. A parallel accessible stall is the 7.3 m end stall, with no aisle.
- **Tapers bend, they never step**: across a tile where a road is changing
  width the asphalt edge bends from one width to the next, and every line and
  every coloured band on it bends with it, so nothing steps at a seam. A road
  never narrows toward a junction it meets; it keeps its full width to the
  junction's mouth, and the junction is drawn at each arm's own width.
- **Rails**: a street's track is a modern streetcar's. Every road whose
  profile carries a tram lane — the Tramway preset, or a tram lane composed
  onto any road — lays, per tram lane, a concrete track slab 2.7 m wide
  centred on the lane, a shade lighter than the asphalt (the outer rails plus
  0.56 m each side), and in it two grooved girder rails flush with the
  surface: heads 0.056 m wide (59R2) at ±0.7175 m, half the 1,435 mm standard
  gauge, 0.004 m proud of the slab in dark steel, each with its 0.042 m
  groove drawn as a darker strip on the gauge side. No sleepers show:
  sleepers across paving read as a railway. A track belongs to the LANE that
  carries it, not to the road: mixed running lays one down each running lane
  it shares with the traffic. A reservation lays no track at grade; it goes up
  onto the guideway below. A dedicated Rail Track is not a street at all — a dark
  ballast bed with no kerbs, markings or crosswalks, carrying two bright steel
  rails at a 1.5 m gauge on periodic cross-tie sleepers, sleeper phase
  anchored at global world-metre zero so ties line up across every seam, on a
  narrower, gravel-class corridor; it has no lane pieces to read, so its
  single track runs down the middle. It never crosses a street at grade: laid
  through one in replace mode it runs straight through and the street ends
  either side of it. There are no level crossings yet. A tramway is
  different: where it crosses another street, its slab and rails run straight
  on across the junction box between the two tram arms, at the offsets the
  arm's own tram lanes give them, so the track reads as unbroken over the
  crossing street's paving. A guideway's crossing lays nothing at grade.
- **The guideway**: a road that gives its trams a reservation carries it on
  an elevated straddle-beam guideway, the Walt Disney World monorail's form.
  Two concrete beams 0.66 m wide and 1.22 m deep at ±1.83 m from the median's
  centre (3.66 m centres) sit on crossheads 1.0 m deep whose undersides clear
  the road surface by 5 m, so the beam tops are 7.22 m up. Each crosshead
  reaches 0.2 m past the beams' outer faces and is 1.2 m along the road, on a
  stem 0.9 m square standing in the median. A column stands every 30 m of
  road, phased from world-metre zero, on straight tiles only: none in a
  junction box, on a turn, or on the street tiles the guideway spans where it
  crosses another street. The beams run unbroken along the road's median
  through junctions and turns, and at a crossing span the cross street at
  their own height. A guideway on a bridge or an overpass stands its columns
  on the deck. Over the five tiles next to a street tramway the beams descend
  linearly to the road (7.22 m in 100 m) and meet the street's slab; a column
  whose crosshead would stand less than 0.5 m clear is not drawn. Below, the
  road draws the reservation's 2.4 m as a raised median, kerbed in concrete
  and grassed as every median is, with a median's yellow edge lines either
  side, and keeps its lanes, footways and lamps. Beams, stems and
  crossheads are each one instanced pool of boxes. A tram on the guideway
  rides the beam on its own side of travel, its floor 0.45 m above the beam
  top and its body straddling the beam.
- **The raised station**: a tram stop on a guideway tile at full height is
  a pair of side platforms, the Las Vegas and Honolulu form. Each platform
  is 3 m wide, 0.25 m thick and 26 m long, centred on the stop tile along
  the run and shortened to the straight run through the neighbouring tiles,
  never shorter than the tile; its inner edge stands 3.2 m from the guideway
  centre, clear of a car straddling its beam, and its top is at the beam top
  plus 0.45 m, the car's floor. A canopy 0.15 m thick covers each platform
  2.7 m above it with a 0.3 m overhang, on posts 0.15 m square at the outer
  edge every 6.5 m, in the shelter's roof grey; the platforms and towers are
  the guideway's concrete. At one end of the platform on each side a stair
  1.5 m wide runs down along the road at 32° to the footway below, one
  sloped box with a closed stringer, and beside it a lift tower 2.4 m square
  rises from the footway to the canopy with a glazed pane on its road face
  in the shelter's glass. Both land on the tile past the platform end, at
  the kerb line where the road has no footway: the low-coordinate end, unless
  the tile past it is a crossing street or a junction box, when they swap to
  the other end so nobody steps off a stair into a junction; where both ends
  meet a crossing they stay at the low end. A few idlers stand on each
  platform, not at the kerb, since no shelter stands there. The line's sign board
  hangs from the canopy edge at the platform's centre in the line's colour.
  No shelter stands at the kerb under a station, and no lamp or pole stands
  on the stop tile or the landing tile. A stop on a ramp tile, a junction
  box or a turn draws no station and no shelter. Platforms, canopies, posts,
  stairs, towers and panes are each one instanced pool of boxes.
- **Contact poles**: a street whose trams share its lanes is hung from
  overhead contact poles at the kerb face — 10.7 m tall, 0.25 m across, with a
  bracket arm reaching 1.9 m over the carriageway at 6.0 m — one every 22 m of
  road, phase anchored at world-metre zero so the spacing holds across tiles.
  A two-way street takes them on alternate kerbs; a one-way street on its
  drivers' right. None stands in a junction box, on a turn, in a driveway's
  mouth or on a kerb another road lies against, and the wire is not drawn. A
  street lamp that would stand within 2 m of a pole is not drawn — the pole
  stands in its place — and every other lamp stands as the lamp rule puts
  it. The poles carry no light and do not wait for power. A reservation is
  not hung from the street's kerbs.
- **Intersections**: marking strips stop at any tile whose connections number
  three or more, so the junction box itself stays clean asphalt and reads as
  a real crossing — all but its edge lines. The edge line breaks only across
  the mouth of a road that joins: every side of the junction tile with no arm
  keeps its edge line for the tile's full length, so the far side of a T is
  unbroken, and between two arms it follows the kerb return, bending from one
  arm's inset to the other's where they differ. The one exception is a motorway tile a ramp meets — a merge
  or a diverge — which is not an intersection: its lines run through, it has
  no box and no rounded corners, and its edge line only opens across the
  ramp's mouth (see [road-model.md](../../world-sim/road-model/README.md), Ramps and
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
  [road-model.md](../../world-sim/road-model/markings.md) for every arrow's
  size). While a one-way road or a highway is being
  dragged into place, translucent arrows along the ghost path also show the
  direction traffic will run, following the drag path around a corner; they
  belong to the placement preview and disappear with the rest of the ghost
  once placement ends.

