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

The current test and test-file counts are kept in one place only, the Status
section of [ROADMAP.md](../../ROADMAP.md).

## Where a test lives

Two kinds of test, and the folder says which:

| Kind        | Where                                              | What it drives                                              |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Unit        | `<module>.test.ts(x)` beside the module in `src/`  | One module's exports, with plain data in and plain data out |
| Interaction | `tests/interaction/<what the player does>.test.ts` | The whole sim, through the commands a player sends it       |

A unit test is co-located — see [naming.md](naming.md) — because it
changes with its module and nothing else. An interaction test is not about
one module: it boots the worker sim with `createWorkerSim`, sends it
`commands` messages exactly as `main.ts` does (without a real `Worker`
thread; Vitest runs it in-process, in `node`), lets it tick, and reads back
what a player would see — acks, snapshots, a save. Placing a road there
exercises the road network, the utilities walk, zoning, growth and the save
format in one go, so it belongs to no single module and lives in `tests/`.

A test goes in `tests/interaction/` when it sends the sim a `commands`
message. A test of a pure function exported by `worker.entry.ts` stays in
`src/sim/worker.entry.test.ts`, because it is a unit test of that file.

`tests/interaction/` is split by what the player is doing, one file per
area:

| File                | What it covers                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `commands.test.ts`  | The command protocol: acks, costs, inverses, gating, speed, saves, building while paused |
| `selection.test.ts` | Selecting a building and what the panel is told                                          |
| `roads.test.ts`     | Laying roads: slopes, profiles, direction, which roads may touch, roads off the grid     |
| `crossings.test.ts` | Bridges over water and overpasses over roads                                             |
| `junctions.test.ts` | Junction control and turn restrictions                                                   |
| `terraform.test.ts` | Landscaping, and the flattening under a placed footprint                                 |
| `noise.test.ts`     | Noise from roads and landmarks                                                           |
| `utilities.test.ts` | A generator that cannot deliver, and a grid too small for its city                       |
| `growth.test.ts`    | What a small town grows, including a farming town                                        |
| `transit.test.ts`   | Transit lines as the player lays them, such as a tramway crossing another street         |
| `mirror.test.ts`    | The main thread's grid mirror kept in step by what the worker sends                      |
| `undo.test.ts`      | Undo and redo through the undo stack                                                     |
| `town.test.ts`      | A whole small town built and grown, as the regression for everything together            |

`tests/support/` holds what those files share and is imported by nothing in
`src/`: `sim.ts` (booting a sim, sending, ticking, reading acks, snapshots
and saves back), `town.ts` (the small town, below) and `guard.ts` (the
road-network check every file runs). The Vitest include,
the TypeScript project and the lint script all cover `tests/` as well as
`src/`, so an interaction test is typechecked and linted like any other code.

A test that grows a town for a thousand ticks or more takes ten to twenty
seconds on its own and longer beside the rest of the suite, so it carries
`GROWTH_TIMEOUT_MS` from `tests/support/sim.ts` as its own timeout. Without it
the 20-second default fails it on machine load rather than on anything it
checks. Shorter tests keep the default, so a genuinely stuck one still fails
fast.

Every interaction file calls `guardRoadNetwork()` from `tests/support/guard.ts`
at its top. After every test it fails if the worker reported a road-network
disagreement (a tile whose road layers, derived from the network again, came
out differently), so no command may leave the network and its layers out of
step, whatever the test is about.

## The small town

`tests/interaction/town.test.ts` is the regression for the game as a
whole. `tests/support/town.ts` builds one small town on a flat map with a
river, as a list of labelled steps, each one batch of commands a player
could have sent:

- every road type: a two-lane main street, an avenue, a four-lane road, a
  one-way street, an alley, a bus lane, a bike lane, a tramway, a dirt road,
  a motorway with an on-ramp, rail track, and a six-lane road laid as two
  carriageways with main street crossing it — with bridges where the avenue,
  the ramp road and the motorway cross the river;
- power (a coal plant and a wind turbine) and water towers, with a water
  pumping station on the river bank, a water pipe carrying the river's water
  to the avenue, a water drain pipe sending the town's sewage back, and a
  sewage treatment works on the quay beside it;
- every zone: low- and high-density homes and shops, row housing, apartments,
  mixed housing, light and heavy industry, and farmland;
- farms off a dirt road that no road joins to the town, so no water main
  reaches it, powered by a line strung from the avenue's end along the road;
- every building a player places: police, fire, a clinic, a school, parks,
  an airfield, bus stops and rail stations;
- garbage: a landfill painted between the railway and the station road, and
  an incinerator among the industry;
- transit: a bus line between two bus stops, a rail line between two
  stations, and a tram line along a tramway that crosses the avenue;
- the city's other levers: signals at a junction, a district with a policy,
  taxes, service funding, a loan, and a hill raised steep enough to spoil
  its soil.

It is built while paused, so the steps alone decide the result, then grown
for `GROW_TICKS`, long enough for every sector to have buildings open. The
test asserts what a player would check:

- every step was accepted;
- every road type and every zone is on the map, and every placeable building
  in the catalog is standing — so a new tier, zone or building fails the test
  until the town builds it;
- the rivers are bridged, deck over water;
- homes, shops, industry and farms all stand Active, and people have jobs;
- nothing the player placed is cut off from the road, power or water;
- the farms grow on power alone, with no water main reaching them;
- garbage is collected where the landfill or the incinerator reaches, and
  piles up where neither does;
- the bus, the train and the tram all carry riders;
- the mirror the main thread keeps agrees with the worker's grid, soil
  included, after the hill regraded it;
- a save of the grown town loads back as the same city (a building under
  construction comes back finished, since countdowns are not saved), and
  reloading that save changes nothing further, byte for byte;
- a second town built from the same steps on the same seed saves identically,
  byte for byte;
- undoing every step, last first, gives back the untouched map, layer for
  layer.

The town is built once per file and shared by its tests, because growing it
is the expensive part. A new feature that a player can build adds a step to
`tests/support/town.ts` and an assertion to `town.test.ts`.

`tools/town-shots.mjs` photographs the same town in a real browser. The page
imports `tests/support/town.ts` through the dev server, grows the town with
the same steps and seed, stores it as a saved game and loads it the way the
Load Game menu does, so the pictures are of exactly the city the test
checked. That is why nothing in `tests/support/` except `guard.ts` imports
Vitest. The browser draws its own map's trees, which a save does not carry,
so a few stand where the town's river runs.

`tools/playthrough-shots.mjs` plays a new game through the interface itself,
the way a player does. It clicks dock categories and drawer cards, drags roads
and zones with the pointer, and places buildings with a click, never through
the command hook. It photographs every step and reads the grid and stats back
after each one, so a check fails when the world did not change the way the
click promised. It runs from a starter town to services, transit, bulldoze
with undo and redo, the terrain brushes, every lens, the corner panels, the
speed controls and a save loaded back, and exits non-zero on any failed
check or page error. A tool a player can reach adds a step to it.

## Determinism tests that exist

- `src/core/rng.test.ts` — proves the seeded RNG (`createRng`) replays
  identically from the same seed.
- Per-system tests with a same-seed/same-input check:
  `src/sim/traffic.test.ts`, `src/render/trees.test.ts`,
  `src/render/transit.test.ts`, and the various deterministic-hash
  functions across `src/render/*.ts` (each has its own small "same input →
  same output" assertions rather than a shared determinism-test utility).
- End to end: `tests/interaction/town.test.ts` builds the small town twice,
  in two `WorkerSim` instances from the same seed and the same steps, grows
  both for the same number of ticks, and requires their saves to be
  identical byte for byte. This is the regression test
  [ADR-0002](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
  calls for. A save holds the grid and the persisted sim state, not the
  runtime state rebuilt after a load (traffic volumes, trash), so a
  determinism break that only ever touches runtime state and never reaches
  the grid still slips past it.

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
