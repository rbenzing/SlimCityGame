# ADR-0010: Map size is capped at 256² tiles, 512² at most later

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). Scalar-field
diffusion runs over every tile every tick, and instance counts grow with
tile count; both scale quadratically with map side length. The
performance budget targets 60 fps at 256×256 tiles with 10k buildings and
roughly 300 draw calls, and treats the resulting per-tile memory (a few
MB for all grid layers at 256²) as trivial only because the map stays at
that size.

## Decision

The default, and near-term-only, map size is 256×256 tiles (20 m/tile,
roughly a 5×5 km city). A larger cap of 512×512 is allowed only as a
later stretch goal, never larger. City-region-scale or open-world map
sizes are out of scope outright, not merely deferred.

## Consequences

- **Good:** per-tick field diffusion and per-tile memory stay small and
  predictable, which is what makes the 60 fps browser-tab budget
  achievable at all; the whole performance budget in ROADMAP §8 is sized
  to numbers that were actually tested rather than extrapolated.
- **Bad:** the game cannot offer a city-region or multi-city/regional-play
  experience — anything assuming a whole metro area, or very long-distance
  transit, is off the table under this cap; 512² itself is only a maybe,
  not a commitment, so even the doubled size is not guaranteed to ship.
- **Neutral:** every subsystem whose cost scales with tile count (fields,
  instancing, the road graph) inherits this ceiling as its de facto upper
  bound for tuning and testing.

## Alternatives considered

- **500 km² / infinite maps:** rejected — "field diffusion and instance
  counts scale quadratically" (DESIGN.md rejected list); replaced by the
  browser-honest 256² (512² at most later) cap.

---
