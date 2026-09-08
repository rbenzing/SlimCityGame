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
- **Paint is true-world scale**, not tile-scaled: line width is ~0.15 m;
  centreline dashes are ~3 m painted with a ~4.5 m gap. Dash phase derives
  from GLOBAL world coordinates (not the tile or chunk), so the pattern stays
  continuous across every seam.
- **Per-tier markings**: two-lane and one-way carry a single dashed white
  centreline; avenue and four-lane carry a double-solid centre plus dashed
  lane lines; highway carries solid edge lines just inside the pavement edge;
  a tram track has NO painted centreline at all — its rails are the centre.
  Alley and gravel carry no lane paint.
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
- **Rails**: a tram track embeds two steel rails at a 1.5 m gauge plus
  periodic cross-tie sleepers down the centre, sleeper phase anchored at
  global world-metre zero so ties line up across every seam. A dedicated Rail
  Track is not a street at all — a dark ballast bed with no kerbs, markings
  or crosswalks, carrying the same rail-and-sleeper geometry on a narrower,
  gravel-class corridor — and renders as a level crossing wherever it meets a
  road.
- **Intersections**: marking strips stop at any tile whose connections number
  three or more, so the junction box itself stays clean asphalt and reads as
  a real crossing. Each approach into a proper intersection gets a stop line
  (a ~0.4 m bar, ~1 m before the junction box) and a zebra crosswalk (bars
  ~0.45 m wide × 2.4 m long at ~0.6 m spacing) between the stop line and the
  box.
- **Corner rounding**: a turn tile — exactly two adjacent connections —
  renders as a true quarter-annulus curved road: a constant-width carriageway
  swept 90° around the tile corner the two connected sides share, meeting
  each straight neighbour seamlessly. Curved sidewalks fill the rest of the
  tile (an inner fan sector plus an outer band). A plain-centreline turn tile
  carries matching curved lane markings — the same per-tier paint rules as a
  straight run, swept as arcs at the carriageway's own radius, dash phase
  anchored at the arc start. This is cosmetic only: the underlying road graph
  stays grid-aligned.
- **Road-end caps**: a dangling road end rounds off, and the kerb/sidewalk
  arcs around the cap at the cap's own radius rather than staying square.
- **Direction arrows**: a placed one-way road shows pavement direction arrows
  roughly every third tile. While a one-way road or a highway is being
  dragged into place, translucent arrows along the ghost path also show the
  direction traffic will run, following the drag path around a corner; they
  belong to the placement preview and disappear with the rest of the ghost
  once placement ends.

## Median, dividers and kerbs

- **Avenue median**: a straight avenue run carries a raised ~1.8 m centre
  median — a concrete-tinted edge with a grass-green top — planted with a
  simple deterministic tree (trunk plus canopy) roughly every second tile.
  The median and its trees break at intersections and corners so turn paths
  stay clear, giving the tree-lined-boulevard read.
- **Highway divider**: a straight highway run instead gets a low ~0.6 m
  concrete barrier band in place of a painted median.
- **Sidewalks**: a lighter, raised kerb strip (0.08 m) runs along every road
  edge that borders a non-road tile, vertex-coloured near-white.
- **Kerb width is what the tile has room for, not an assumed footway.** A
  two-lane road leaves plenty of tile beyond its carriageway and draws a full
  footway; an avenue or a motorway is up to 16.2 m of road in a 20 m tile and
  draws only a narrow kerb, because its shoulders are already inside the
  paved width. `curbWidthMeters` is the one number everything standing beside
  a road measures from — lamps, signage, and a bridge deck alike.
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
  which also keeps them clear of a lamp.

## Junction and motorway signage

Junction control follows the tier. A junction approach on a multi-lane street
(avenue, four-lane, bus lane) earns a **traffic signal** — a mast with a
short arm reaching over the carriageway and a three-lens head hung off it.
Smaller tiers keep boards instead: **stop** at a crossroads, **give way** at
a T. All of it is cosmetic — the simulation models no signal phase, so a
signal head shows its three lenses and never cycles.

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

Both are authored reaching along +X and yawed by a shared `signalYaw`, which
every cantilevered sign type uses: a flat board reads from either side, but
an arm pointed the wrong way hangs over the grass instead of the road.

## Ground-cover transitions

A dead-end road's rounded cap (above) carries its ground transition with it:
the kerb/sidewalk arc wraps the cap, and a sidewalk-to-dirt-to-grass
transition ring conforms to that same rounded perimeter rather than stopping
in a square. See [nature.md](../visual-render/vegetation.md) for the general road-adjacent
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

Free-form road geometry — curves off the tile grid — stays deferred; the
road graph itself stays grid-aligned even where the paint above draws a
curve. Also deferred: parking-lane roads, quays, asymmetric lane counts,
pedestrian streets, and decorative sidewalk-tree upgrades beyond the avenue
median above. [DESIGN.md](../DESIGN.md) owns this backlog and its reasoning.
