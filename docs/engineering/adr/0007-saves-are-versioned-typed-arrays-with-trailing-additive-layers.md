# ADR-0007: Saves are versioned typed arrays with per-version migrations and trailing additive layers

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The general shape — a schema version field from day one, plus
per-version migration functions — was decided at project inception (repo
created 2026-07-28); the roadmap states the cost of skipping it plainly:
"cheap now, impossible to retrofit." Since then the format has grown
repeatedly as new per-tile state landed — districts, landfill, road
elevation, road profile, road flow, junction control, junction turns,
power lines, junction lane turns — each one adding a version and each one
needing every older save to keep loading.

## Decision

A save serializes the grid's flat typed arrays behind a small header
carrying an integer version and the map size, followed by every layer in
a fixed, declared order. A feature that needs new per-tile state adds its
layer as the LAST thing serialized and bumps the version by one. The
loader accepts every version from 1 up to the current one; for a save
older than a given layer's introduction, that layer is defaulted to a
documented value (typically all-zero, or derived from an older layer that
still exists) rather than the load being refused. Migration is therefore
never a rewrite of old data — it is "read what is there, default what is
missing" — and a layer, once added, is never reordered or removed, only
ever followed by newer ones.

## Consequences

- **Good:** the format grows indefinitely without breaking any city saved
  under an older version — a save from months ago still loads, gets every
  newer layer defaulted, and keeps playing; adding a new feature's save
  support costs one more branch in the loader, not a rewrite of it.
- **Bad:** layer order is now permanent history — a layer can never move
  earlier in the byte layout without breaking every save that predates
  it, so the file format's shape is exactly the append-only shape of the
  history that produced it. A feature that needs to change what an
  EXISTING layer means, rather than add a new one, has no built-in escape
  hatch here. The loader's per-version branching only ever grows, never
  shrinks.
- **Neutral:** the version integer alone determines the exact byte layout
  for that version, so there is no separate schema document to keep in
  sync — only the migration code path itself, in `src/world/grid.ts`.

## Alternatives considered

None recorded. The sources present per-version migration with trailing
additive layers as the approach from the outset, stating what skipping it
would have cost rather than naming a rejected alternative that was
actually tried.

---
