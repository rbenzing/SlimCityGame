# Commands

- `buildRoad` keeps its tile-path form for the grid modes; the worker turns
  the path into axis-aligned segments.
- `buildSegment` lays one segment off the grid. It carries the tier, the
  profile, the two end points and, for a curve, the control point, all in
  world centimetres, and a flow: 0 for a road that runs both ways, 1 for a
  one-way road running from the first end to the second. Each end becomes an
  existing node standing exactly there, the node at a grid road tile's centre,
  or a new node of its own. An end partway along another free segment is
  refused: the road tool splits that segment first, with `splitSegment`, in
  the same batch. Its inverse is `removeSegment`.
- `splitSegment` cuts the free segment passing through a point on its centre
  line in two, with a node there that both pieces meet at. Each piece keeps
  the road's tier, profile and flow, and a curve is cut where it lies (each
  piece's control point is found by de Casteljau's construction), so the road
  does not move. A piece shorter than the shortest segment is refused. It
  costs nothing, and its inverse is `joinSegments`.
- `joinSegments` joins the two free segments meeting at a node back into one
  with a given control point, taking the node away, where exactly two of the
  same kind meet there and run on through it. It costs nothing, and its
  inverse is `splitSegment` at the same point.
- `removeSegment` takes away the segment between two end points with a given
  control point, and any node at either end that no road meets any more. Its
  inverse is the `buildSegment` that puts the same segment back.
- `moveSegmentEnd` moves the end of the one free segment ending at a point —
  a node no other road meets and no grid road stands on — to a point at most
  half a tile away on each axis, laying that segment again with the end moved
  and the same tier, profile, flow and control. It is planned exactly as a
  `buildSegment` would be with the segment's old self taken away, and refused
  with that plan's reason. It costs nothing, and its inverse moves the end
  back. The road tool sends it ahead of a grid drag started or ended on a
  curve's end, to bring that end onto the tile centre the drag meets it at.
- `bulldoze` removes segments, picked by tile or by segment. Its inverse puts
  back exactly what it removed, with the same slots.
- Junction commands name the node.

A node left with two roads in line after a bulldoze stays a node, drawn as
the road running through. Merging it away would make the inverse depend on
what else had happened since.

