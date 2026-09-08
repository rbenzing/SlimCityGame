# ADR-0001: Traffic is statistical assignment with cosmetic agents, not per-agent simulation

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28), as the scope
decision the roadmap calls the critical one for the whole project. A city
builder can compute traffic two ways: give every citizen and vehicle a
scheduled life and a physically simulated body (collision avoidance,
parking, fuel), or treat trips as statistics and only decorate the result.
The first is what the sources call "the browser-killing tar pit" — 100k
scheduled citizens and 50k physically-simulated vehicles do not fit a
browser CPU/memory budget, and the project's own performance budget targets
60 fps with 10k+ buildings in a single tab. The sources are blunt about the
stakes: full agent simulation is "the #1 way this project dies." Even the
city-builder genre this project draws its grammar from fakes traffic once
it goes beyond a modest agent cap, so there was no working precedent to
imitate at the scale a real city needs.

## Decision

We do not simulate individual citizens or vehicles physically. Population,
jobs, and demand are aggregate scalar values, not discrete simulated
agents. Each commuter or freight trip is computed as an A* path over the
road graph with congestion-aware edge costs; the sim accumulates trip
volume per edge (statistical assignment), and that volume feeds back into
both pathfinding cost and the land-value/pollution scalar fields. Vehicles
visible in the world are cosmetic: instanced meshes animated along the
real computed routes, with the count on any edge proportional to that
edge's volume, so the city looks like it is carrying traffic that the sim
actually computed rather than an unrelated ambient effect. A later
refinement (SPEC §20) ties every generated trip to an actual resident
building and an actual job building and gives trip volume a rush-hour
rhythm, without introducing any per-agent state — reinforcing this
decision rather than replacing it.

## Consequences

- **Good:** sim cost scales with the number of road edges, not the number
  of citizens or vehicles, so a large, dense city stays inside the browser
  budget; congestion is real information that feeds land value, pollution,
  and pathfinding, so the statistics are not decorative; cosmetic vehicles
  following real routes look convincing without paying for physical
  simulation.
- **Bad:** there is no per-vehicle behavior — no discrete parking, no
  collision avoidance, no individual fuel or breakdown state — and none of
  that can be added later without a different model underneath the
  cosmetic layer; "population" is a number the game can grow and shrink,
  not a set of persons a player can single out and follow through their
  own day.
- **Neutral:** every future traffic- or citizen-facing feature must derive
  its behavior statistically or proportionally from aggregate state; it
  cannot store or read per-citizen state, because none exists.

## Alternatives considered

- **100k scheduled citizens / 50k physically-simulated vehicles** (with
  collision avoidance, parking, fuel): rejected as the browser-killing tar
  pit — replaced by statistical assignment plus cosmetic agents. Even the
  reference genre "fakes beyond its agent cap," so there was no viable
  precedent for simulating at that scale in a browser tab.

---
