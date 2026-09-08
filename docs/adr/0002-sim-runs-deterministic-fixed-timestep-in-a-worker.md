# ADR-0002: The sim runs on a deterministic fixed timestep in a Web Worker; render never owns state

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). A city simulation
(growth, traffic, economy, scalar-field diffusion) is real, ongoing CPU
work; running it on the same thread as rendering would make simulation
speed hostage to frame time, and vice versa. The project also wants
determinism — a seed plus a command log always producing the same city —
because that is what makes saves small, makes replay/regression testing
possible, and makes bugs reproducible. Determinism and a smooth 60 fps
render both need the sim to live somewhere the render loop cannot stall or
be stalled by it, and the module boundary between the two needed to be
enforceable, not just a convention a future contributor could forget.

## Decision

The simulation runs on a fixed timestep (e.g. 20 ticks/sec) inside a
dedicated Web Worker, using a seeded RNG and integer math where practical
so that the same seed plus the same command log always reproduces the
same state, to be guarded by a determinism regression test from the first
milestone onward. The render thread never owns simulation state: it
receives compact snapshots and dirty-region diffs from the worker and
interpolates between ticks. Game-speed changes (pause/1×/2×/4×) are a
ticks-per-frame multiplier applied in the worker; render frame rate never
couples to simulation rate. As a hard rule, `sim/` never imports `render/`
or `ui/` — the UI talks to the sim only through a command queue, and the
sim publishes state via snapshots the UI reads.

## Consequences

- **Good:** a slow render frame can never skip or duplicate a sim tick, and
  a heavy sim tick can never stall the render loop; determinism enables
  small saves and reliable replay; the import firewall keeps sim logic
  unit-testable without a GPU or DOM and stops render code from silently
  depending on sim internals.
- **Bad:** the whole-world determinism regression test this decision calls
  for does not exist. What is in place is piecewise — `src/core/rng.test.ts`
  covers RNG replay, `src/sim/traffic.test.ts` covers one system, and the
  cosmetic placement tests cover their own scatter — so a determinism break
  in a system with no such test would not be caught mechanically.
- **Bad:** the import firewall is a convention, not a guarantee. There is no
  lint rule restricting imports, and a single `tsconfig.json` carries both
  `DOM` and `WebWorker` in one `lib`, so a `sim/` file importing `render/`
  or touching `document` still typechecks and lints clean. A reviewer is the
  only gate.
- **Bad:** every piece of state the UI needs must be explicitly serialized
  across the worker boundary — there is no ambient shared-object access,
  so adding a UI-visible field always means adding it to the snapshot
  protocol; `Math.random()` and `Date.now()` are unavailable anywhere in
  the sim or render paths, which costs the convenience of real-clock
  timestamps or ad hoc randomness that other architectures allow.
- **Neutral:** message passing and explicit snapshots become the standard
  shape for every subsystem that crosses the sim/render boundary, present
  and future.

## Alternatives considered

None recorded. The sources present the worker split and the `sim/`
firewall directly as the architecture, without naming a rejected
alternative (such as running the sim on the main thread) with a stated
reason.

---
