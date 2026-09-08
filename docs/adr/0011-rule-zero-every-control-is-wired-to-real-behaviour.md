# ADR-0011: Rule zero — every rendered control is wired to real behaviour

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Set alongside the original UI visual-parity spec work (reference
screenshots supplied 2026-07-21), as SPEC.md's foundational rule. A common
failure mode in UI-heavy prototypes is that visual polish gets ahead of
working systems, leaving buttons and panels that look real but do
nothing — which erodes trust in the whole shell and hides what is actually
implemented behind what merely looks implemented.

## Decision

Every control rendered in the UI must be wired to a real, working system
behind it. A feature not yet backed by working behaviour is not shown as
a control at all — it is listed under SPEC.md's Deferred section instead,
and does not render until the behaviour it needs exists.

## Consequences

- **Good:** the UI can always be trusted as a map of what actually
  works — nobody has to wonder whether a visible button is real; SPEC's
  Deferred section becomes the one authoritative place to check whether a
  feature is built, rather than that information being implicit in which
  buttons happen to no-op.
- **Bad:** a control cannot ship ahead of its backing system to gather
  early feedback on a planned interaction, a technique that is otherwise
  useful — visual and UX work on a panel has to wait for, or land in
  lockstep with, the system it fronts.
- **Neutral:** SPEC's Deferred list becomes load-bearing documentation
  rather than a wishlist — every entry there is doing the job of
  explaining why a control does not exist yet.

## Alternatives considered

None recorded. SPEC states this as a standing rule rather than a choice
among named alternatives.

---
