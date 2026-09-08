# ADR-0003: World state is layered flat typed arrays (SoA), not an ECS or an object graph

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). The world is a
tile grid (256×256 by default) carrying many per-tile scalar fields —
height, zone, road and building occupancy, land value, pollution, noise,
traffic, crime, fire risk, education, health, happiness, power, water —
every one of which must be cheap to diffuse, decay, and read back as a
heatmap overlay on every tick. The project's own memory budget treats all
grid layers for a 256² map as "a few MB — trivial," a number that only
holds if each layer is a flat, densely packed array rather than a graph of
per-tile objects or an entity-component-system with its own bookkeeping
overhead.

## Decision

World/tile state is stored as one flat typed array per layer
(Structure-of-Arrays), sized to the map's tile count and indexed by
`z * size + x` — not as an ECS framework and not as a graph of per-tile
objects. A tile's full state is the union of its slot across every layer
array. Scalar-field layers run their emit/diffuse/decay loop as a direct
walk over these arrays each tick.

## Consequences

- **Good:** memory footprint stays tiny and predictable, which is what
  makes heatmap overlays effectively free (colour one layer) and keeps
  diffusion a simple, cache-friendly array walk; there is no per-tile
  object allocation or garbage-collector pressure; a layer serializes to a
  save as a straight copy, which is the foundation ADR-0007 builds on.
- **Bad:** tiles have no object identity or behaviour of their own —
  adding a new fact about a tile means adding a new flat array and wiring
  it into the tick pipeline explicitly, not adding a method; reading
  "everything about tile (x, z)" means touching as many arrays as there
  are layers, rather than one object; the model does not generalize to
  entities that are not tile-shaped (vehicles, buildings), which already
  need their own separate tables.
- **Neutral:** this forecloses adopting a general entity-component
  framework anywhere in the sim, even for non-tile entities that might
  otherwise have been modelled that way.

## Alternatives considered

- **Full ECS framework + DI containers:** rejected — "SoA typed-array
  layers already give the data-oriented wins without the ceremony"
  (DESIGN.md rejected list).

---
