# Testing

## Vitest, node environment

`npm test` runs `vitest run`. `vite.config.ts`'s `test` block: `environment:
'node'` (not jsdom by default — UI component tests opt into jsdom
themselves via Testing Library's setup, since `@testing-library/react` and
`jest-dom` are dependencies), `include: ['src/**/*.test.{ts,tsx}']`,
`testTimeout: 20_000` (raised from Vitest's 5 s default — several tests
diffuse or hash full 256² grids and can brush past 5 s under parallel
load), `pool: 'vmThreads'` (the default `threads`/`forks` pools crash at
collection time on this Vitest 4.1.10 + Vite 8.1.5 combination), and
`server.deps.inline: ['@testing-library/jest-dom']` (so `expect.extend`
lands on the same `expect` the test file uses under `vmThreads`'s
per-dependency module isolation). These are recorded in
`vite.config.ts`'s own comments and are worth reading before touching the
test config — each one fixes a specific, previously-hit failure.

117 test files, 3,279 tests, as of this writing.

## Test-file convention

Co-located `<module>.test.ts` / `<module>.test.tsx` next to the module it
covers — see [naming.md](naming.md). There is no separate `unit/`,
`integration/`, or `e2e/` directory; the include glob does not distinguish
by location, only by the `.test.` suffix.

## Unit vs. integration, in practice

Most test files are unit tests against one module's exported functions —
pure-logic files (`src/shared/*.ts`, `src/world/*.ts`) are especially easy
to test this way since they take plain data in and return plain data out.

The closest thing to an integration test is `src/sim/worker.entry.test.ts`
(2,193 lines) — it imports `createWorkerSim` from `worker.entry.ts` itself
and drives it through the real command path (`applyCommand`, terraform,
road placement, bridges, junction control, save round-trips via
`encodeSave`/`decodeSave`) exactly as `main.ts` would, just without an
actual `Worker` thread (Vitest runs it in-process, in `node`). This is
real cross-system exercise — a single test can place a road, terraform
under it, and check the resulting `GridState` and snapshot together — but
it is still one process, one `WorkerSim` instance, not two independent
runs being diffed.

## Determinism tests that exist

- `src/core/rng.test.ts` — proves the seeded RNG (`createRng`) replays
  identically from the same seed.
- Per-system tests with a same-seed/same-input check:
  `src/sim/traffic.test.ts`, `src/render/trees.test.ts`,
  `src/render/transit.test.ts`, and the various deterministic-hash
  functions across `src/render/*.ts` (each has its own small "same input →
  same output" assertions rather than a shared determinism-test utility).

## The determinism test that does NOT exist

There is no test that constructs two full `SimWorld`/`WorkerSim` instances
from the same seed and command log and diffs the resulting grid end to
end. [ADR-0002](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
calls for exactly this kind of regression test and says plainly that what
exists instead is piecewise coverage — true today. A determinism break in
a system with no dedicated same-seed test (most systems don't have one)
would not be caught mechanically by anything in this suite.

## Contracts tests: `tsc`, not Vitest, checks the types

`src/shared/contracts*.test.ts` (`contracts.test.ts`,
`contracts.landmark.test.ts`, `contracts.roadsv3.test.ts`,
`contracts.terraform.test.ts`, `contracts.zoning.test.ts`) pin protocol
shapes and constant values. Their own header comment says why they need
both `npm test` and `npm run typecheck`: "Type-level guarantees are
enforced by `npx tsc --noEmit` over this file (vitest transpiles without
type-checking); runtime asserts pin the prescribed constant values." Vitest
runs on Vite's esbuild transform, which strips types without checking
them — so a `contracts.test.ts` file that only exercises a type at the
type level (no runtime assertion) would pass `npm test` even if the type
were wrong, and only `npm run typecheck` would catch it. This is why
[CONTRIBUTING.md](../../../CONTRIBUTING.md) and `ci.yml` run both steps, not
just one.

## Screenshots, not read-backs

This is a real, load-bearing project rule, not a suggestion: **render work
is verified by looking at a screenshot in a real browser, not by a
read-back assertion passing.** `window.__slimcity` (wired in `main.ts`,
dev-only, stripped from production builds) exposes `readGrid()`,
`readTransit()`, `readEmptyDraws()`, and similar structural read-backs
precisely so a `tools/*-shots.mjs` harness can confirm the _data_ is
correct — but a read-back passing only proves the numbers are right, not
that anything looks right. `src/render/landfill.ts:200`'s test comment
puts the gap plainly: "An empty layer is still submitted as a draw call
with a vertex count of [zero]" — a structural check can be green while the
screen shows nothing, or the wrong thing.

The actual verification step for any render-affecting change is: run the
relevant `tools/*-shots.mjs` harness (or `npm run dev` and look by hand),
and look at the resulting image. See [debugging.md](debugging.md) for how
the harnesses are organized. Treat a PR touching `src/render/` as
unverified until a screenshot has actually been looked at — passing
Vitest tests for that change are necessary, not sufficient.

## What CI actually runs

`.github/workflows/ci.yml`: `npm run typecheck`, `npm run lint`,
`npm run lint:docs`, `npm run test`, `npm run build`, in that order, on every
push/PR to `main`. No visual or screenshot check runs in CI; the
`tools/*-shots.mjs` harnesses are a manual, human-verified step, not an
automated gate — which is why the rule about looking at render work matters as
much as it does.
