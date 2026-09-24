# ADR-0015: A crossing tile may carry a second road, passing over the first

- **Status:** Accepted
- **Date:** 2026-09-23
- **Deciders:** project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Every road tile holds one road: one tier, one profile, one flow, one deck
height. Bridges were built on top of that as an elevation layer, and the road
model deferred overpasses on purpose, because a road crossing over another
needs somewhere to store the second road and nothing had that.

The deferral is now the problem. A motorway is limited access: it meets
another motorway or a ramp and nothing else. So a street that needs to get
past one has to go round it, and two motorways that cross can only do it as a
flat crossroads. Real motorways almost never have one. The player asked for
road-over-road overpasses with real height rules, and chose a true second road
layer over faking one with a special tile.

Three facts shaped the answer. A bridge deck already climbs from the ground at
a set grade, so the ramps up to an overpass are ordinary elevated tiles; only
the tile where the two roads actually overlap needs anything new. Saves add
layers at the end and bump one version number ([ADR-0007](0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md)).
And world state is flat per-tile arrays ([ADR-0003](0003-world-state-is-layered-flat-typed-arrays.md)),
so a second road is a second set of arrays, not a new object model.

## Decision

**We store a second road on a tile only where one road passes over another.**
The ground road keeps the layers it has. A new set of trailing layers holds the
road passing over it: its tier, profile, flow and deck height. Those layers are
zero everywhere else. A tile holds at most two roads. The over road never joins
the road under it, and every system that counts roads by tile tells the two
apart: graph nodes, traffic volume, masks, furniture, picking. How an overpass
is built, how high it must be, and what it may cross are specified in
[overpasses.md](../../world-sim/overpasses.md).

## Consequences

- **Good:** grade separation exists. A street can cross a motorway, a road can
  cross rail, and two motorways can cross without a crossroads.
- **Good:** the approaches reuse the bridge solver, piers and deck rendering
  that already work. The new layers are only as big as the crossings.
- **Bad:** "one tile, one road" was an easy fact to rely on, and code relies on
  it. The graph uses the tile index as a node id, and traffic volume is keyed by
  tile. Each of those has to learn the layer, and anything that misses it will
  treat the two roads as one without failing loudly.
- **Bad:** a save version bump, and four stated truths to rewrite when this
  ships.
- **Neutral:** tunnels and a third level stay out. The cap is two roads per
  tile, the ground one and one over it.

## Alternatives considered

- **A special "overpass tile" type with a fixed look.** Rejected. It cannot
  carry the upper road's own profile, flow or traffic, so a motorway over a
  street would stop being that motorway for one tile.
- **A free second road level, any length, anywhere.** Rejected. It is stacked
  decks by another name: roads running on top of roads for whole blocks, with
  every rule about joining, frontage and furniture needing a version for each
  level. The layers cost the same memory either way; what differs is the rule.
  Holding a second road only on the tile where it crosses keeps every other
  tile exactly as it is today.
- **Keep refusing, and ship interchange stamps instead.** Rejected. Every
  interchange design has a road going over another somewhere, so the stamps
  need this first.
