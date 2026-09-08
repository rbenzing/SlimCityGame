# ADR-0009: Utilities propagate along roads rather than as separately-drawn networks

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). A classic
city-builder utility system asks the player to draw pipes and wires as
their own network, separate from roads. The sources note that modern
entries in the genre already fold that into the road network instead, and
treat this as more than a shortcut: "roads carry power + water... so the
simplification IS the authentic mechanic."

## Decision

Power and water coverage are not modelled as a separately drawn network
by default. Distribution propagates from plants and towers through
road-adjacent tiles — power lines exist only to bridge spans the road
network does not reach. Services (police, fire, health, education, parks)
use the same substrate: coverage is a breadth-first search by road
distance from the building, not a physically modelled dispatch or
response system. A tile is powered, watered, or served by being
road-connected to a source, not by having a pipe, wire, or route
physically drawn to it.

## Consequences

- **Good:** one substrate — the road graph — answers "can this tile get
  power, water, and service coverage," so there is one propagation
  algorithm to build, test, and optimize instead of several parallel
  network models; players never draw a second network layer on top of
  roads they have already placed, which keeps the build loop simple and
  matches genre expectations.
- **Bad:** a tile off the road network cannot receive power or water
  without the standalone-line escape hatch — the model cannot represent
  utility delivery that is deliberately decoupled from roads (a remote
  installation with no road at all needs the bridging mechanism, not the
  default path); the same is true for service coverage, which cannot
  reach a building the road graph does not connect to.
- **Neutral:** every future utility or service system inherits "is it
  road-connected" as the one substrate to reason about, for better and
  worse.

## Alternatives considered

- **Standalone pipes/wires drawn as their own network** (the traditional
  utility-sim approach): not adopted for power and water — "roads carry
  power + water... so the simplification is the authentic mechanic"
  (ROADMAP §3.7) — and kept only as a bridging tool for gaps the road
  network cannot reach.

---
