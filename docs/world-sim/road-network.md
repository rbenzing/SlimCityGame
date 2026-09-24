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
  deck height above the ground, zero on the ground. A node exists wherever a
  segment ends: at a junction, at a dead end, and wherever a road changes
  tier, profile, flow, grade or curvature.
- A **segment** joins two nodes. Its centre line is either straight or a
  quadratic curve with one control point, the point both end tangents aim at.
  It carries the road's **tier**, its **profile**, its **flow** (the stored
  flow byte, as on a tile today), and its deck height at each end, zero on the
  ground. Between its ends the deck climbs at an even grade.
- **While a node sits on the grid, it also carries the road on its own tile:**
  tier, profile and flow. A grid junction's surface is one road, the one last
  drawn through it, and that is what the tile model stores. When junction
  shapes are built from their roads (stage 6), this goes.
- Nodes and segments are identified by slot. A slot is stable for the life of
  what fills it and is reused only once free, lowest first.

Positions are whole centimetres so that the save holds integers and every
derived figure is computed from the same numbers on every machine. A grid
tile's centre is at 20 × _x_ + 10 m. A curve is sampled at a fixed spacing
along its length, and every system that needs the centre line reads the same
samples.

**Everything else about a road is derived:** its class, its lanes and width,
its length, which tiles it covers, what it grants frontage to, and its
junctions' shapes.

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
  the path into axis-aligned segments.
- `buildSegment` lays one segment off the grid. It carries the tier, the
  profile, the two end points and, for a curve, the control point, all in
  world centimetres, and a flow: 0 for a road that runs both ways, 1 for a
  one-way road running from the first end to the second. Each end becomes an
  existing node standing exactly there, the node at a grid road tile's centre,
  or a new node of its own. An end partway along another free segment is
  refused: the road tool splits that segment first, with the command that
  comes with the tool. Its inverse is `removeSegment`.
- `removeSegment` takes away the segment between two end points with a given
  control point, and any node at either end that no road meets any more. Its
  inverse is the `buildSegment` that puts the same segment back.
- `bulldoze` removes segments, picked by tile or by segment. Its inverse puts
  back exactly what it removed, with the same slots.
- Junction commands name the node.

A node left with two roads in line after a bulldoze stays a node, drawn as
the road running through. Merging it away would make the inverse depend on
what else had happened since.

## Saves

The network is saved: the node table and the segment table, appended after
the grid's tiles. The road tile layers — tier, mask, profile, flow, deck
height — and the overpass layers are not saved, because they are derived.
Stage 1 bumps `SAVE_VERSION` by exactly one for this. The per-tile junction
layers stay saved until stage 6 moves junction settings to the node, which is
the second bump.

A save from before converts on load. Every run of road tiles between two
node tiles becomes one segment, where a node tile is a junction, a bend, a
dead end, or a tile where the tier, profile, flow or grade changes. An
overpass's crossing tile is part of its run, so each overpass is one segment
passing over the road beneath. The conversion must derive exactly the tile
layers the save held: a save that converts to anything different is a
conversion bug.

Where two roads share a tile, the one with the higher deck is the road passing
over it, on the overpass layers. Nothing else in the network says which layer
a road is on, because nothing else needs to.

## Stages

Each stage leaves the game playable, and until stage 3 no road can be built
that the grid could not already hold.

1. **The network is the store.** Nodes, segments and their slots, saved in
   place of the road tile layers; older saves convert. Only axis-aligned
   segments exist. The grid commands keep planning on tiles, because every
   rule they enforce is written against tiles. After each command the network
   takes up what the plan laid, keeping the slot of every node still in the
   same place and every segment still between the same nodes, and the tile
   layers are then derived from the network again. A derived tile that
   differs from the plan is reported as an error, never silently kept: it is
   a conversion bug. The check is also run by converting and re-deriving
   every road scenario the tests build.
2. **The graph and the spreads read the network.** The routing graph, the
   utility spread and the service spread walk the network's cells — one per
   road per tile, linked only where the network joins them — instead of the
   tile masks and tile adjacency. The graph comes out exactly as before; the
   spreads stop leaking to roads that merely lie alongside.
3. **Free geometry**, in three parts.
   - **3a, the world holds them.** Segments at any angle and curves, stored in
     the network and saved; the shared geometry (sampling, length, tangents,
     radius, footprint); `buildSegment` and `removeSegment` with every
     refusal in the geometry rules above; the derived footprint layer; grid
     drags kept off it; and the network keeping its free segments, and the
     grid nodes they meet, when it takes up a grid command.
   - **3b, the simulation reads them.** Free segments in the cells the graph
     and the spreads walk, a free run's length measured along its centre
     line, and facilities and trips finding a free road beside them.
   - **3c, the land reads them.** Zoning frontage measured from a free road's
     kerb, and buildings and zones kept off its footprint.
4. **Drawing free roads**, in three parts. Grid roads still draw through the
   tile renderer.
   - **4a, the render thread takes up the network.** The worker sends the
     whole network, encoded as the save holds it, whenever it changes; the
     render thread derives the footprint from it as the worker does, so its
     zoning grid visual reads free frontage exactly as `paintZone` does and
     nothing is plopped on a free road. The segment sweep, the junction mesh
     and the markings along each segment.
   - **4b, furniture along segments.** Lamps, signs and kerbside furniture
     stood along a free road at their offsets.
   - **4c, vehicles following segment centre lines.**
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
