# Median, dividers and kerbs

- **Avenue median**: a straight avenue run carries a raised ~1.8 m centre
  median — a concrete-tinted edge with a grass-green top — planted with a
  simple deterministic tree (trunk plus canopy) roughly every second tile.
  The median and its trees break at intersections and corners so turn paths
  stay clear, giving the tree-lined-boulevard read. A tree is planted only
  where the section has a median to plant it in: an avenue-sized road built
  without one plants none, rather than one in a running lane. A road laid as two
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
  edge that borders a non-road tile, vertex-coloured near-white. Half of a
  corridor nothing divides draws none along the edge it shares with its
  other half, which is the middle of the road. Whatever stands at its outer
  kerb — a cabinet, the strip of verge a lot fronts — stands where that kerb
  is, which is off the tile's centre.
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

