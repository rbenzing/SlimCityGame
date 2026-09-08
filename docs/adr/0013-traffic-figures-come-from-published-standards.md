# ADR-0013: Traffic engineering figures come from published standards, tied to game units by one constant

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided 2026-09-05, alongside ADR-0012 (SPEC §29). Once a road's capacity
and a junction's delay are derived rather than a per-tier scalar, those
derivations need a real basis — otherwise every new class, profile, or
junction-control combination would need its own hand-picked number with
nothing to check it against. The sim already expresses its world in real
units: a tile is 20 m, a road's speed is metres per second (the existing
tier speeds are literally posted km/h divided by 3.6), and an edge's path
cost is length/speed, i.e. seconds. Real traffic-engineering figures can
therefore be plugged in directly instead of invented.

## Decision

Every capacity and delay figure introduced for road composition is
derived from published traffic-engineering references — the Highway
Capacity Manual for per-lane saturation flow and simplified signal/stop/
yield/roundabout delay curves, AASHTO's Green Book for speed-change-lane
and turn-lane-storage geometry, and the MUTCD for signal and stop-sign
warrant thresholds — rather than hand-tuned per-tier numbers. Because the
sim's units are already real, only one calibration constant is needed to
convert a real vehicles-per-hour figure into the sim's existing
game-capacity units: **k = 3/7 game-capacity units per veh/h**, chosen so
the two-lane preset's existing capacity of 600 is reproduced exactly
(2 lanes × 700 veh/h × 3/7). The formulas, tables, and per-class figures
themselves live in `../SPEC.md` §29, not here.

## Consequences

- **Good:** every new class, profile, or junction-control option gets a
  defensible, checkable capacity or delay number derived from the same
  formula rather than guessed per case; the single calibration constant
  means the entire existing capacity table can be verified to reproduce
  its already-tuned numbers exactly, instead of requiring every preset to
  be re-tuned by hand.
- **Bad:** the sim's traffic numbers are now coupled to real-world
  formulas that were never validated against this game's feel by
  playtesting alone — a future balance change that wants to deviate from
  the HCM/AASHTO/MUTCD-derived figures for gameplay reasons must either
  accept a formula-versus-feel mismatch or introduce a second, competing
  source of truth for the same numbers; the formulas are invisible to a
  player experimenting with lane counts or junction control, who cannot
  intuit the resulting capacity or delay without the spec table or trial
  and error.
- **Neutral:** the exact formulas and derivations stay in `../SPEC.md`
  §29; this record only fixes that the figures come from published
  standards and names the one constant tying them to game units.

## Alternatives considered

- **Hand-tuned per-tier/per-class capacity and delay numbers** (the
  pre-existing model): not carried forward for the new derived figures —
  a fixed per-tier scalar cannot answer what adding a turn lane, or
  changing junction control, does to capacity or delay, which is exactly
  the question the class/profile/junction model needs answered for any
  combination, not just the eleven presets that existed before it.

---
