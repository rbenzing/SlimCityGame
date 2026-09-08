# Architecture rules

The rules that hold the three-execution-context split
([architecture.md](../architecture.md)) together in practice, and what
actually enforces each one. Full import evidence lives in
[dependency-map.md](../dependency-map.md); this document is the "what to
follow when writing code," not the audit.

## The firewall: `sim/` never imports `render/` or `ui/`

Verified today by grepping every non-test file in `src/sim`: the only
cross-directory imports are `core/`, `data/`, `shared/`, `world/`, and
(type-only) `app/persist.ts`. The reverse holds too — `render/` imports
only `data/`, `shared/`, `world/`, never `sim/`.

**Not enforced by tooling.** `eslint.config.js` has no import-boundary
rule; `tsconfig.json` is one project with `DOM` and `WebWorker` both in its
`lib`, so a `sim/` file that imported `render/` or called `document.*`
would typecheck and lint clean. It would only surface as a runtime crash,
and only on a code path that actually executes inside the worker (which
has no `document`, no `THREE.Scene`). The only real gate today is a
reviewer reading the diff. See
[ADR-0002](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
for why the split exists and what it costs to keep convention-only.

**Follow it by:** talking to the sim only through `MainToWorker` commands
and reading it only through `WorkerToMain` snapshots/acks
(`src/shared/types.ts`). Never reach for a sim-side type expecting to call
a sim-side function from render or UI code — if you find yourself writing
`import { X } from '../sim/...'` in `src/render/` or `src/ui/`, stop; the
data you need should already be on a snapshot, or needs adding to one.

## The contract layer: `src/shared/`

`src/shared/types.ts` and `src/shared/constants.ts` both open with the same
warning, verbatim:

> Module agents code AGAINST these types and must not edit this file.

This is the API boundary every other directory reads from — types
(`Command`, `SimSnapshot`, `MainToWorker`/`WorkerToMain`, `RoadTier`,
`ZoneType`, …), constants (`TICK_RATE`, `MAP_SIZE`, …), and pure
geometry/data helpers (`roadprofile.ts`, `corridor.ts`, `junction.ts`,
`taper.ts`, `approach.ts`, `approachzone.ts`) with no three.js and no DOM
dependency, so both the worker and the render thread can share them
verbatim. `src/shared/types.ts` additionally warns that enum-like values
(`ZoneType`, `RoadTier`, …) are "stored in typed-array layers — values are
stable, never reorder them" — because a save file's bytes are those literal
numbers (see [ADR-0007](../adr/0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md)).

**Not enforced by tooling.** Nothing stops a file edit to `src/shared/`
beyond the comment itself and code review; there is no file-lock, no
CODEOWNERS-based restriction visible in this repository.

## Determinism: no `Math.random`/`Date.now` in sim or render

See [constraints.md](../constraints.md#determinism-no-mathrandomdatenow-in-sim-or-render)
for the verification and what breaks. The load-bearing rule for writing
new code: if a value needs to look random or needs "now," get it from a
seeded source (`createRng` in `src/core/rng.ts`, or a local deterministic
hash function like the `mulberry32`/`triple32` copies used across
`src/render/*.ts`) or from the sim's own tick/elapsed-time value, never
from the wall clock or `Math.random()`.

### The one legitimate exception: `src/app/music.ts`

`src/app/music.ts:174` does `this.rng = options.rng ?? Math.random` to
shuffle the playlist. This is correct, not an oversight: `src/app/` is
app/session-layer glue, outside both the worker's tick loop and the
render thread's frame loop
([dependency-map.md](../dependency-map.md#the-app-exception-persistts)
covers where `app/` sits). A shuffled playlist order has no effect on sim
state, on anything serialized into a save, or on a rendered frame — it is
exactly the kind of incidental randomness the determinism rule was never
meant to reach. Do not use this as precedent for adding `Math.random` to
`src/sim/` or `src/render/`; the boundary that makes it safe here
(app-layer, outside the tick/frame loops) is the reason it's fine, not the
mere fact that some file somewhere uses it.

## Command/inverse pairing

Every tool commit becomes a `Command` (the `Command` union in
`src/shared/types.ts`); `applyCommand` in `src/sim/worker.entry.ts`
accumulates an `inverse: Command[]` alongside the cost as it applies each
one, and posts both back in the `CommandAck`. `main.ts` pushes the label,
forward commands, inverse, and cost onto `UndoStack` (`src/tools/undo.ts`)
on success — this is what makes every commit reversible. See
[ADR-0008](../adr/0008-every-tool-commit-is-a-reversible-command.md).

**Follow it by:** if you add a new `Command` kind, its `applyCommand` case
must compute and return a real inverse — a command (or set of commands)
that, applied after the forward command, restores the prior state exactly.
There is no test that fails generically for a missing or wrong inverse;
each system's own tests (e.g. `src/sim/worker.entry.test.ts`) are what
would catch it, if they cover the new case.

## See also

- [architecture.md](../architecture.md) — the three execution contexts and
  one tick traced end to end.
- [dependency-map.md](../dependency-map.md) — the full import graph and
  evidence.
- [constraints.md](../constraints.md) — determinism and the other hard
  limits.
