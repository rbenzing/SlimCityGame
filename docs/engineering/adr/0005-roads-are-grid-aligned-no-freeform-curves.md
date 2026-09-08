# ADR-0005: Roads are grid-aligned; free-form curves are out

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). Free-form road
geometry off the tile grid means arbitrary-angle intersection meshing — a
combinatorial geometry problem the sources call "a geometry tar pit."
Grid-aligned roads, by contrast, reduce every intersection to a small,
enumerable set of pieces (straight, corner, T, cross, end-cap) selected by
a neighbour bitmask, and match the classic city-builder feel the project
is explicitly grounded in. The scope guard in the roadmap states the
trade-off in cost terms directly: grid roads deliver the genre feel "at
10% of the geometry cost" of curves.

## Decision

Roads are drawn and stored aligned to the tile grid: drag-to-draw with a
live preview and cost, auto-tiled meshes chosen by a neighbour bitmask,
sharing the same grid as zoning and terrain. Free-form or curved road
geometry off the tile grid is out of scope under this model; it is
deferred, not planned as a near-term extension of the current road system.

## Consequences

- **Good:** intersection meshing stays a small, enumerable bitmask-driven
  set of pieces instead of an open-ended curve-intersection problem; the
  road graph (nodes at intersections, edges with length/speed/capacity)
  builds incrementally on every edit without special-casing geometry;
  roads, zoning, and terrain share one coordinate system, which is what
  later lets lane pieces, junction control, and ramps (SPEC §29) hang
  directly off grid tiles rather than needing their own spatial model.
- **Bad:** the game cannot offer diagonal or organically curved streets,
  a look some players expect from the genre and one the genre itself
  supports; retrofitting curves later would mean rebuilding the
  auto-tiling and junction-meshing pipeline rather than extending it,
  since that pipeline is built around a fixed neighbour bitmask.
- **Neutral:** road width is bounded to whole-tile multiples — a two-tile
  corridor is as wide as it goes — which becomes a hard ceiling every
  later road feature designs within.

## Alternatives considered

- **Curved/free-form roads off the tile grid:** deferred to v2+, not
  taken now — "a geometry tar pit (intersection meshing)"; grid roads
  deliver the classic city-builder feel "at 10% of the geometry cost."

---
