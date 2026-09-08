# ADR-0012: A road is a class, a cross-section, and a set of junctions — not a tier

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided 2026-09-05 (SPEC §29, "user request"). Before this decision a road
was one of eleven named tiers picked from a drawer, each bundling its lane
count, markings, lamps, and kerb rules together; capacity was a per-tier
scalar; junctions had no real control (a signal head was only a prop); a
one-way's direction was inferred from its geometry rather than stored; a
"ramp" was whatever two-lane tile happened to sit beside a highway. A tier
collapses several independent axes — lane arrangement, turn lanes, kerb
parking, junction control — into one pick, so a player wanting a turn lane
at one junction and no kerb parking had no way to ask for that
combination. Even the reference city simulator, with roughly forty road
assets spanning the same axes, never let players choose a turn lane or
place a yield sign — those stayed automatic for years, and the
community's most-installed mods are the ones that add them.

## Decision

A road is composed from three separate objects, and everything a player
can choose lives on exactly one of them. The CLASS (dirt, rural, local
street, urban street, collector, arterial, one-way, divided, highway,
ramp, alley) fixes what the road is for: speed, zonability, whether it
carries utilities, which lane pieces it may hold, its default markings and
control, and what it unlocks at. The PROFILE is the cross-section — an
ordered list of lane pieces from kerb to kerb (travel lanes with a
direction, a centre turn lane, a median, a parking lane, a bike lane, a bus
lane, a tram lane, a shoulder, a sidewalk, a verge), each with a width;
every tier that existed before this decision becomes one preset profile.
The JUNCTION is where two or more profiles meet, and owns the traffic
control, the turn restrictions per approach, the crosswalks per approach,
and the approach lanes each incoming profile splits into. Markings,
furniture, and simulated capacity are all DERIVED from these three
objects; none of them is authored or stored separately (see `../SPEC.md`
§29 for the derivation rules and the exact class/profile/junction tables).

## Consequences

- **Good:** every axis a player might want to control becomes
  independently choosable instead of being bundled into a fixed tier
  pick — exactly the gap the reference genre never closed; deriving
  markings, furniture, and capacity from class, profile, and junction
  means each of those facts is authored in exactly one place and cannot
  drift out of sync with what the road actually is.
- **Bad:** this is a strictly bigger data model than picking one of eleven
  tiers — every consumer of road data (rendering, pathfinding, capacity,
  the save format) now reads three linked objects instead of one enum,
  which is ongoing complexity a tier-only model never carried; the
  existing eleven tiers had to be re-expressed as preset profiles rather
  than simply kept as-is, a migration cost paid once and then carried
  forever in the save format (ADR-0007).
- **Neutral:** this does not change the tile-grid road model (ADR-0005) —
  profiles, junctions, lanes, and ramps all still live on the existing
  1-tile road model and grid; it is additive, not a refactor.

## Alternatives considered

- **Keep roads as a fixed tier enum and add lane/junction controls as
  tier variants:** not viable — a tier collapses independent axes into
  one pick, and the reference genre's roughly forty tier-like assets
  across those same axes still never gave players a turn lane or a yield
  sign; the gap is structural to the tier model, not solvable by adding
  more tiers.

---
