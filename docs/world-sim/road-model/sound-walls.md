# Sound walls

A motorway or a ramp may carry a noise wall at the outer edge of either side:
a `soundWall` piece, outermost on its side, 0.6 m wide for the concrete
safety barrier it stands on, with a height of 3, 4.5 or 6 m. It is an edge
piece, outside the carriageway, so it moves no lane, marking or kerb, but it
counts against the width budget. The road tool offers it as a side choice
and a height ([sound-barriers.md](../../specs/sound-barriers.md)).

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
  [environmental-simulation.md](../environmental-simulation.md#noise-fieldidnoise--2).
- **Price.** ¢5.4 per metre of height, per side, per tile (¢16, ¢24, ¢32),
  from $525/m² of wall (FHWA inventory, 2020–22) against $3.551M a
  lane-mile of rural freeway (FHWA C&P Exhibit A-1, 2014) at the three-lane
  motorway's ¢68 a tile. Upkeep is the motorway's ratio of upkeep to price.
  On a corridor each wall is charged once, across the two runs.

