# ADR-0016: Roads are a network of nodes and segments

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** project owner
- **Supersedes:** [ADR-0005](0005-roads-are-grid-aligned-no-freeform-curves.md)
- **Superseded by:** none

## Context

Every road is stored on the tile grid, one road per tile (two where one passes
over another), and a turn is a grid corner: the carriageway sweeps round a
quarter circle inside one 20 m tile. That is tight enough for a street and
wrong for anything faster. A motorway changes direction in one tile at
100 km/h, a road cannot follow a coast or a contour, and two roads can only
meet at right angles. The player asked for a curve tool — three clicks, a ghost
showing the bend before it is placed, used by motorways instead of the grid
drag — and, offered a curve limited to right-angle bends between grid ends,
chose fully free-form roads that meet at any angle.

ADR-0005 kept this out because free-form geometry makes junction meshing an
open problem: two roads meeting at an arbitrary angle need a junction shape
built for that angle, and everything that reads a junction (control, approach
lanes, turn pockets, markings, furniture) needs to work from that shape. That
cost is real and this decision accepts it.

What shaped the answer is where road facts live today. About fifteen thousand
lines of road code read the tile grid: the mesh, the furniture, the approach
walk, the graph, the bridge solver, junction control stored per tile. A road
at an arbitrary angle has no honest representation in per-tile layers. It
crosses tiles partway, two roads can pass through one tile, and a junction's
arms are not four compass directions. Holding free-form roads in a second
store beside the grid would give every road fact two homes for as long as
both exist, and every system would need to ask both.

## Decision

**The road network is a set of nodes and segments, and it is the only place a
road is stored.** A node is a point in world space. A segment joins two nodes
along a straight line or a curve, and carries the road's profile, flow and
heights. A junction is a node where roads meet, at any angle, and its shape is
built from the segments that meet there. Tile layers that describe roads —
tier, profile, flow, deck height, masks — are derived from the network, never
written directly, and exist for the systems that work on tiles: zoning,
occupancy, terrain. A road on the grid is a network road whose segments happen
to be axis-aligned. What the network holds, the rules on geometry and
junctions, and how each system reads it are specified in
[road-network.md](../../world-sim/road-network.md), including the order in
which the existing systems move onto it.

## Consequences

- **Good:** roads curve and meet at any angle; motorways, ramps and rail turn
  at radii that match their speed; overpasses may cross at any angle because a
  crossing is two segments at different heights, not two roads in one tile.
- **Good:** one home for every road fact. Junction control belongs to a node,
  lengths are real distances, and the second road layer from ADR-0015 becomes
  an ordinary property of the network rather than a special case of a tile.
- **Bad:** the largest change the game has made. The mesh, the furniture, the
  approach walk, the graph, the bridge solver and junction storage all move to
  the network, which is weeks of staged work, and until the last stage the
  renderer carries both the tile path and the network path.
- **Bad:** junctions become geometry to compute rather than a small set of
  pieces, and that geometry needs limits (a minimum angle between roads, a
  minimum radius) to stay drawable.
- **Neutral:** zoning, buildings and terrain stay on the grid. A road at an
  angle fronts grid lots, which is less tidy than lots aligned to the road;
  aligned lots are a later choice, not part of this one.
- **Neutral:** saves change shape. The network is saved and the road tile
  layers are not; older saves convert on load.

## Alternatives considered

- **Right-angle curves between grid ends.** Proposed first and declined by the
  project owner. It keeps every junction on the grid, but no road may head off
  at an angle and no two roads may meet at one.
- **A second, free-form road store beside the grid.** Rejected. Every road
  fact would have two homes, a free road meeting a grid road would need a
  junction that belongs to both, and the store would have to be merged later
  anyway.
- **Free-form ends that cannot join anything.** Rejected by the project owner:
  angled junctions are the point.
- **A staircase of grid corners laid along a smooth path.** Rejected by the
  project owner. A gentle curve draws as a zigzag and a motorway pair cannot
  follow it.
