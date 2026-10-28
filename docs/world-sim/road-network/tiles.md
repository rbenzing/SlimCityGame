# Tiles

Zoning, buildings, occupancy and terrain stay on the grid. They read these,
derived from the network:

- **Road tile layers** hold the roads on the grid, and only them. For a
  segment that runs along a grid axis through tile centres, the tile layers
  (tier, profile, flow, deck height, mask) are exactly what the tile model
  stores today, byte for byte. A segment off the grid writes none of them:
  two free roads meeting at an angle both pass through the tiles around their
  junction, which one road per tile cannot hold, and a grid road beside a free
  one would read it as a neighbour to join.
- **Footprint.** Every tile a free segment's full cross-section overlaps,
  footways included, is marked in a derived footprint layer (`roadFootprint`,
  recomputed from the network and never saved). Nothing else may be built
  there, and a grid drag may not enter one except to meet the free road at a
  node.
- A free node carries no road of its own tile: only a node at a grid tile
  centre does, and only when a grid road is on that tile.
- **Arms held apart.** Two neighbouring grid road tiles that the joining rules
  would join but the network does not link — a road laid with snapping off
  beside another — are held apart in a derived layer (`roadSeparate`,
  recomputed from the network and never saved), which the masks and every
  reader of joins respect. See
  [road-model.md](../road-model/how-roads-meet-rank-replacement-and-transitions.md).

