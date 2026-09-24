# ADR-0016: A road may curve between two grid ends

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** project owner
- **Supersedes:** [ADR-0005](0005-roads-are-grid-aligned-no-freeform-curves.md)
- **Superseded by:** none

## Context

Every road is laid on the tile grid, and a turn is a grid corner: the
carriageway sweeps round a quarter circle inside one tile. That is tight
enough for a street and wrong for everything faster. A motorway that changes
direction does it in a single 20 m tile at 100 km/h, and a road that should
bend gently through a hillside or along a coast can only do it as a staircase
of corners. The player asked for a curve tool: three clicks, a ghost showing
the bend before it is placed, used by motorways instead of the grid drag and
offered to every other road.

ADR-0005 kept curves out because free-form geometry turns junction meshing
into an open problem. Two roads meeting at an arbitrary angle need a junction
shape built for that angle, and every system that reads a junction (control,
approach lanes, turn pockets, markings, furniture) would need a version of
itself for it. That is still true, and it is still the expensive part. What
does not need to be expensive is the road _between_ junctions. A road that
runs from one grid tile to another does not meet anything along the way, so
its path can be any shape without asking any junction to change.

Three facts shaped the answer. The graph already treats the tiles between two
junctions as one run with a length, so a run can follow a curve as long as its
tiles still step from neighbour to neighbour. The grid corner is already drawn
as a true circular arc, so a curve is the same geometry at a larger radius.
And saves take trailing additions and one version bump
([ADR-0007](0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md)).

## Decision

**We let a road curve between two ends that are on the grid.** A curve is a
quarter-circle arc joined to its two ends by straight lengths. Its ends leave
their tiles along the grid axes, one along each, so everything a curve meets
it meets on the grid, and every junction stays an ordinary grid junction. The
tiles the curve passes through remain road tiles on the grid, stepping from
neighbour to neighbour, and nothing joins a curve partway along it. The
curve's geometry is stored as the three tiles that define it, and everything
else about it is derived. How a curve is drawn, how tight it may be, and how
each system reads it are specified in
[curved-roads.md](../../world-sim/curved-roads.md).

## Consequences

- **Good:** motorways, ramps and rail can turn at radii that match their
  speed, and any road can bend smoothly instead of stepping.
- **Good:** the simulation barely notices. Utilities, services, traffic
  assignment and zoning keep working on grid tiles; they only learn that a
  curve's run is shorter than its tile count and that a curve's tiles join
  only each other.
- **Bad:** a road is no longer only a tile. The renderer, the vehicles and the
  furniture must follow the curve's geometry rather than the tile's, and a
  curve's paved width reaches into tiles its centre line never enters, which
  must be held clear without being roads.
- **Bad:** a save version bump, and the stated rule that roads are
  grid-aligned is rewritten.
- **Neutral:** a curve always turns through a right angle. A road heading off
  at an arbitrary angle, junctions on a curve, and curves in the air (bridges,
  overpasses, elevated ramps) stay out. Each would need the junction or deck
  machinery to learn angles, which is the problem ADR-0005 named.

## Alternatives considered

- **Lay a smooth path onto the grid as a staircase of corners.** Rejected by
  the project owner. It keeps ADR-0005 whole but draws a gentle curve as a
  zigzag, and a motorway pair cannot follow it at all.
- **Free-form segments at any angle, junctions anywhere.** Rejected. It is the
  open junction-meshing problem ADR-0005 described, and it would put a
  second, angle-aware version of every junction rule beside the grid one.
- **Allow 45° diagonals as a third direction.** Rejected. Diagonals meeting
  grid roads still need angled junctions, and a bend would still be a corner,
  just a shallower one.
- **A Bézier curve through the three clicks.** Rejected in favour of a
  circular arc. A Bézier's radius changes along it, so the tightest point is
  somewhere in the middle, and the offset of a Bézier is not a Bézier, which
  makes lane lines and a motorway's second carriageway approximations. An
  arc's offset is an arc, and its radius is one number to check against the
  class.
