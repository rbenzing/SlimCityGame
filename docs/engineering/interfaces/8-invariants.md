# 8. Invariants

**Determinism.** Neither `Math.random` nor `Date.now` appears anywhere in
`src/sim/worker.entry.ts` (verified by search, not merely by convention); the
sim's only randomness source is a seeded RNG forked per system
(`src/core/rng.ts`, `createRng(seed).fork(n)`), and its only clock is the
fixed-timestep tick counter. `tests/interaction/terraform.test.ts` pins this
directly: two independently-initialized sims fed the identical command at the
identical tick produce bit-identical terrain heights. End to end,
`tests/interaction/town.test.ts` builds and grows the small town twice and
requires the two saves to match byte for byte. The one
wall-clock value in the whole protocol, `SaveHeader.savedAt`, is deliberately
stamped outside the worker (`src/app/persist.ts`'s `stampSavedAt`, called from
the main thread) rather than inside it.

**Command application is tick-independent.** `drainCommands` touches no RNG,
growth, fields, economy, or traffic — which is what makes it safe to run
immediately while the game is paused (speed `0`) rather than waiting for a
`tick()` that will never come (`pumpPaused`, `src/sim/worker.entry.ts:510`).

**Undo/redo is exact, not re-derived.** Every command that mutates continuous
state (terrain height, in particular) returns the _literal_ prior values as
its inverse rather than a command that would plausibly reconstruct them —
`terraformSet`'s inverse is the exact `Float32Array` it is about to overwrite,
not another `terraform` stroke. `tests/interaction/terraform.test.ts` pins
exact-height undo for a road build, a building footprint flatten, and a
terraform stroke, and `tests/interaction/town.test.ts` undoes every step of
building the small town and requires the untouched map back, layer for layer.

**Batch application is atomic.** See [§3](3-commands/README.md): a refused command
takes back the commands before it in the same batch, and the ones after it
never run. `tests/interaction/commands.test.ts` pins it, funds and tiles both.

**Idempotency** is explicit and local to each command, not a blanket rule:
`defineRoadProfile` acks success with no state change for an identical
redefinition; `paintLandfill`/`stringPowerLine` charge nothing for tiles that
already have the requested membership; `setJunctionControl`/`setJunctionTurns`/
`setJunctionLaneTurns` are no-ops when the new value equals the stored one.
Commands with no such rule (`buildRoad` re-laying the same tier over itself
without a profile/flow change, for instance) are ordinary no-ops by virtue of
`changedCount === 0`, not a documented idempotency guarantee.

**Type-level contracts** (the selection protocol, `ToolFlags`, `CursorChip`,
`LensId`) are pinned by `npx tsc --noEmit` over `src/shared/contracts.test.ts`
itself, per that file's own header comment — vitest transpiles the file
without type-checking it, so the `@ts-expect-error` assertions inside it are
only meaningful under a separate type-check pass.
