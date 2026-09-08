# ADR-0008: Every tool commit is a reversible command; undo/redo is the command log

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). Genre-standard
play expects Ctrl+Z/Ctrl+Y on build, bulldoze, and zone actions, with a
refund on undo. At the same time, the sim grows buildings on its own
(the spawner); those organic changes must never be something the player
can undo, both because it would be nonsensical ("undo the city growing a
building") and because it could desync the demand/growth model from
whatever the undo stack thinks happened.

## Decision

Every player tool commit — build, bulldoze, zone, de-zone — produces a
`ReversibleEdit`: a label, its forward commands, its inverse commands, and
its cost, pushed onto a bounded undo stack (64 deep). `undo()` pops the
most recent edit, returns its inverse commands for dispatch (which
refunds the cost), and pushes the edit onto a redo stack; `redo()`
reverses that. Only player edits enter this stack. Sim-grown changes —
spawns, level changes, abandonment — never do, because they are never
given an inverse.

## Consequences

- **Good:** undo/redo needs no separate world-snapshot diffing — it
  replays the same well-defined command protocol backwards, reusing the
  command queue and worker plumbing ordinary play already uses; refunds
  fall out for free because the inverse command is exactly the commands
  that give the cost back.
- **Bad:** history is bounded at 64 edits — a long build session can
  silently drop its oldest undo entries with no way to see or extend that
  depth from the UI; every new tool must hand-author its own accurate
  forward/inverse command pair, which is an ongoing tax on adding tools,
  and a tool whose inverse is wrong or incomplete corrupts undo silently
  rather than failing loudly.
- **Neutral:** it fixes structurally, not just by convention, that sim
  growth can never be undone — a sim-grown change simply never enters the
  stack, rather than being excluded by a runtime check.

## Alternatives considered

None recorded. The sources describe the reversible-command stack directly
as the mechanism, without naming a rejected alternative (such as
snapshot-based undo) with a stated reason.

---
