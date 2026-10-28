# Geometry rules

- **Tightest curve.** A curve's radius, at its tightest point, must be at
  least its class's minimum. A curve tighter than that is refused with the
  radius it needs.

  | Class                 | Minimum radius |
  | --------------------- | -------------- |
  | dirt, alley           | 30 m           |
  | local, one-way        | 40 m           |
  | urban                 | 50 m           |
  | collector             | 60 m           |
  | rural, arterial, ramp | 80 m           |
  | divided               | 120 m          |
  | rail                  | 150 m          |
  | highway               | 200 m          |

  The radii are the game's own choice, sized so that a class's default posted
  speed is plausible on its tightest curve and so that a motorway still fits
  on a 256-tile map. They stand in for the AASHTO horizontal-curve tables,
  which are not held in [Road Guides](../../Road%20Guides/README.md), so they
  cannot be checked against the standard here.

- **Shortest segment.** A segment is at least half a tile, 10 m, long.
- **Narrowest angle.** Two roads meeting at a node are at least 30° apart,
  measured between their centre lines where they leave the node. A sharper
  angle is refused: the kerb between the two roads would have nowhere to go.
  A ramp joining or leaving a motorway is the exception, below.
- **At most six roads** meet at one node.
- **No overlap at one level.** Two segments that do not share a node may not
  overlap, kerb to kerb, at the same level; near a node they share, their
  kerbs meet, and that is the junction. A road drawn across another at the
  same level meets it: the road tool places a node where they cross,
  splitting both, and the crossing becomes a junction that obeys the class
  rules. The world refuses a crossing that is not at a node, whatever sent it.
- **A free road meets a grid road at a tile centre.** A segment that is not
  on the grid ends on a grid road only at the centre of one of its tiles,
  which becomes a node of both, and never crosses a grid road anywhere else.
  Its first stretch out of that tile may overlap the grid road's tiles
  beside it, since that is the junction.
- **On the ground, at a road's slope.** Until free roads can be raised
  (stage 7), a segment off the grid lies on the ground, and its centre line
  climbs no more than `ROAD_MAX_SLOPE` over any 20 m, the slope a grid road
  may climb between two tiles. Every tile under it must be dry and free of
  buildings.
- **Crossing over.** Two segments that cross at different heights do not
  meet. The upper one must clear the lower by the clearances in
  [overpasses.md](../overpasses.md), at any angle: a skew crossing is no longer
  refused, because the two roads no longer share a tile.

