# How each system reads the network

This is where each system ends up. The stages below say when.

- **The graph and routing.** Graph nodes are the network's junctions and dead
  ends; a graph edge is the chain of segments between two of them, with its
  real length. The search is unchanged. A route is a sequence of segments.
- **Vehicles** follow the centre line of each segment on their route, offset
  into their lane square to it, and turn through a junction along a path
  built from the junction's shape.
- **Utilities and services** spread along the network by breadth-first
  search from the roads a facility fronts, and reach the tiles that front the
  roads they reach.
- **Zoning and frontage.** A grid cell is zonable when it lies within the
  zoning depth of a zonable road, measured square to the road from its kerb,
  and is free. Buildings stay grid-aligned and face the side nearest their
  road.
- **Transit.** A stop is a point on a segment. A stop saved on a tile moves to
  the nearest point on the road through that tile.
- **Overpasses and bridges.** A segment's deck heights are solved along it at
  `BRIDGE_MAX_GRADE`, as the bridge solver does along a drag today. The second
  road layer on a crossing tile becomes a derived view of two segments at
  different heights.
- **Rendering.** Each segment's cross-section is swept along its centre line,
  square to it. Each junction is meshed from its shape, meeting each road where
  its centre line actually is at the set-back, which on a curve has already
  turned from its heading at the node, and each road's edge lines turn round
  the kerb returns. A dead end rounds off inside the road's own length, as
  [streets.md](../../art/streets/README.md) describes. Markings, kerbs, footways and
  furniture follow the segment at their offsets.
- **Where a free road meets the grid,** the grid tile the two share is drawn
  once, whole, by the free-road junction: every grid road meeting it is
  carried from the junction to the tile's edge in its own cross-section and
  paint, its dashes kept in the tiles' world phase, and the tile renderer
  draws nothing of that tile's road. Nothing the tile's own role earned — a
  corner's sign, a straight's kerbside props, its lamp — stands on it, since
  that role no longer says where its kerbs are; signs at such a junction come
  with stage 6.
- **Picking.** The road under the cursor is the nearest segment within its
  own half-width.

