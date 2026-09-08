# ADR-0004: The DOM overlay is React; the 3D world stays imperative three.js

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). The project is
explicitly an engine showcase as well as a game: every system doubles as a
Three.js demo, and the target is 10k+ instanced buildings and animated
fleets at 60 fps in a browser tab. At the same time, the 2D UI shell
(toolbar, panels, HUD, notifications) benefits from a componentized,
state-driven framework. Those two goals pull in different directions if
the same framework is asked to own both: a per-frame reconciliation pass
over the 3D scene graph would tax exactly the frame budget the showcase
exists to prove out.

## Decision

The DOM overlay — top bar, toolbar, flyouts, info panels, notifications,
map select, budget window — is built with React, Zustand for state, and
Tailwind for styling; it reads simulation state through a Zustand store
fed by worker snapshots. The 3D world is authored and mutated with
imperative three.js calls directly. No React Three Fiber, and no React
reconciliation of any kind, appears anywhere in the render path.

## Consequences

- **Good:** React's component and state model applies where it is cheap
  and valuable — the 2D UI — while the 3D world keeps direct imperative
  control over every draw call and instance-buffer update, which is what
  lets it hold to a no-per-frame-allocation, dirty-flag-only discipline.
- **Bad:** two different programming models coexist in one codebase
  (declarative React, imperative three.js) with a hand-wired seam between
  them — the Zustand store fed by worker snapshots — that every
  UI-reflects-world-state feature has to cross manually rather than
  getting for free from a single framework; a contributor's React Three
  Fiber instincts do not transfer to this render path and must be
  unlearned.
- **Neutral:** the `ui/` vs. `render/` module boundary is also a
  technology boundary, not merely a folder convention — a feature that
  wants to move logic across it is also choosing between two rendering
  paradigms.

## Alternatives considered

- **React Three Fiber for the world:** rejected — "per-frame reconciliation
  contradicts the engine-showcase goal" (DESIGN.md rejected list).

---
