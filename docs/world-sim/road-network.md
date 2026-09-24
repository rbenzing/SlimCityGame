# Road network

Roads as a network of nodes and segments: free-form, curved, meeting at any
angle. The decision is
[ADR-0016](../engineering/adr/0016-roads-are-a-network-of-nodes-and-segments.md).
This document is the target the road system is moving to, and the order it
moves in. Until a stage below has shipped, the tile-based model in
[road-model.md](road-model.md) and [overpasses.md](overpasses.md) is what the
game does.

## What the network holds

- A **node** is a point in world space: an x and z in whole centimetres, and a
  height. A node exists wherever a segment ends: at a junction, at a dead end,
  and wherever a road changes profile, height or curvature.
- A **segment** joins two nodes. Its centre line is either straight or a
  quadratic curve with one control point, the point both end tangents aim at.
  It carries the road's **profile**, its **flow** (two-way, or one-way in
  either direction along the segment), and a deck height at each end, zero on
  the ground.
- Nodes and segments are identified by slot. A slot is stable for the life of
  what fills it and is reused only once free.

Positions are whole centimetres so that the save holds integers and every
derived figure is computed from the same numbers on every machine. A curve is
sampled at a fixed spacing along its length, and every system that needs the
centre line reads the same samples.

**Everything else about a road is derived:** its tier (the nearest preset to
its profile, as today), its class, its lanes and width, its length, which tiles
it covers, what it grants frontage to, and its junctions' shapes.

## Geometry rules

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
  which are not held in [Road Guides](../Road%20Guides/README.md), so they
  cannot be checked against the standard here.

- **Shortest segment.** A segment is at least half a tile, 10 m, long.
- **Narrowest angle.** Two roads meeting at a node are at least 30° apart,
  measured between their centre lines where they leave the node. A sharper
  angle is refused: the kerb between the two roads would have nowhere to go.
  A ramp joining or leaving a motorway is the exception, below.
- **At most six roads** meet at one node.
- **No overlap at one level.** Two segments that do not share a node may not
  overlap, kerb to kerb, at the same level. A road drawn across another at
  the same level meets it: a node is placed where they cross, splitting both
  segments, and the crossing becomes a junction that obeys the class rules.
  Where the classes may not meet, the crossing is refused, or passes over.
- **Crossing over.** Two segments that cross at different heights do not
  meet. The upper one must clear the lower by the clearances in
  [overpasses.md](overpasses.md), at any angle: a skew crossing is no longer
  refused, because the two roads no longer share a tile.

## Junctions

A **junction** is a node where three or more roads meet, or two roads meet at
an angle or with different profiles. A node where two roads continue in line
with the same profile is not a junction; the road runs straight through it.

- **Its shape is built from its roads.** Each road is set back from the node
  until its kerbs clear the kerbs of the roads either side of it, with the
  kerb returning between them at the road's kerb-return radius
  (`kerbReturnRadiusOf`). The junction area is what lies between the
  set-back road ends and the kerb returns. A grid crossroads built this way is
  the crossroads the game draws today.
- **Control belongs to the node.** Control, turn restrictions and lane turns
  are stored per node and per road meeting it, with the roads numbered
  clockwise from north. Warrants, defaults and the delay formulas in
  [road-model.md](road-model.md) are unchanged; they read a road's approach
  from its segment instead of from a compass direction.
- **The class rules are unchanged.** Rank, replacement, which classes may
  meet, and that a highway meets only a highway or a ramp, all hold as in
  [road-model.md](road-model.md).
- **A ramp meets a motorway alongside it.** Where a ramp joins or leaves a
  motorway, it does so at no more than 20° to the motorway, in the motorway's
  direction of travel. The narrowest-angle rule does not apply there, because
  a merge and a diverge are shallow by nature. A ramp meeting a motorway at a
  wider angle is refused; that is the head-on meeting the road model already
  refuses.

## Tiles

Zoning, buildings, occupancy and terrain stay on the grid. They read these,
derived from the network:

- **Footprint.** Every tile a segment's full cross-section overlaps is
  occupied by that road. Nothing else may be built there.
- **Road tile layers.** For a segment that runs along a grid axis through tile
  centres, the tile layers (tier, profile, flow, deck height, mask) are exactly
  what the tile model stores today, byte for byte. For any other segment, the
  tiles its centre line passes through carry its tier, profile and flow for
  the systems that ask what road is on a tile; they carry no mask, and nothing
  routes by them.

## How each system reads the network

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
  square to it. Each junction is meshed from its shape. Markings, kerbs,
  footways and furniture follow the segment at their offsets.
- **Picking.** The road under the cursor is the nearest segment within its
  own half-width.

## Commands

- `buildRoad` keeps its tile-path form for the grid modes; the worker turns
  the path into axis-aligned segments. A segment form carries the start and
  end points, the control point for a curve, the profile and the flow, for the
  curve and free modes. Either form returns an exact inverse: it removes the
  segments and nodes it created and rejoins any segment it split.
- `bulldoze` removes segments, picked by tile or by segment. Its inverse puts
  back exactly what it removed, with the same slots.
- Junction commands name the node.

A node left with two roads in line after a bulldoze stays a node, drawn as
the road running through. Merging it away would make the inverse depend on
what else had happened since.

## Saves

The network is saved: the node table, the segment table and each node's
junction settings, appended after the grid. The road tile layers, the
overpass layers and the per-tile junction layers are no longer saved, because
they are derived or have moved to the node. `SAVE_VERSION` goes up by exactly
one from whatever it is when this ships.

A save from before converts on load. Every run of road tiles between two
junction, corner or end tiles becomes one segment. Each per-tile junction
setting moves to the node on that tile. Each overpass becomes a segment at its
deck heights. The conversion must derive exactly the tile layers the save
held: a save that converts to anything different is a conversion bug.

## Stages

Each stage leaves the game playable, and until stage 3 no road can be built
that the grid could not already hold.

1. **The network is the store.** Nodes, segments and their slots; the worker's
   road commands edit the network; the tile layers are derived from it;
   older saves convert. Only axis-aligned segments exist, and every derived
   tile layer matches what the tile model produced, checked by converting and
   re-deriving every scenario the road harnesses build.
2. **The graph and routing read the network.** Graph edges come from
   segments with real lengths; utilities, services and coverage spread along
   the network; vehicles follow segment centre lines.
3. **Free geometry.** Segments at any angle and curves, the geometry rules,
   crossings that split into junctions, the tile footprint and zoning from
   segment edges.
4. **Drawing free roads.** The segment sweep, the junction mesh, markings and
   furniture along segments. Grid roads still draw through the tile renderer.
5. **The tool.** The curve and free modes, their ghost, chip and refusals,
   and motorways without `Grid`, checked in the browser.
6. **Angled junction behaviour.** Control, stop lines, crossings, approach
   lanes and turn pockets at junctions that are not on the grid.
7. **Free roads in the air.** Bridges, overpasses at any angle and climbing
   ramps on free segments.
8. **One renderer.** Grid roads draw through the network path, and the tile
   renderer's road meshing is removed.

## The road tool

The curve and free modes are described in
[interaction.md](../ux/interaction.md#curve-and-free-road-modes).

## What does not change

- Road classes, profiles, rank, replacement, marking colours and the capacity
  and delay formulas.
- The grid for zoning, buildings and terrain, and the 20 m tile.
- Commands are the only way the world changes, and each returns its exact
  inverse.
