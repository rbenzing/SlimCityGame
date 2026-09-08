# Dependency map

Which module may import which, with the evidence for each claim.
[architecture.md](architecture.md) states the rule in one paragraph; this
document is the full picture — every directory, what it actually imports
today (grepped, not asserted), and which rules are enforced by tooling
versus upheld only by review.

## How this was produced

For each top-level directory under `src/`, every `.ts`/`.tsx` file that is
not a `.test.ts(x)` file was grepped for relative imports that cross into
another top-level directory. Type-only imports (`import type`) are called
out separately from runtime imports, because a type-only edge is erased at
build time and creates no runtime coupling. The counts below are import
_statements_, not files — one file can import the same target directory
several times.

## Layer diagram

```
                              main.ts
                (imports from every directory below,
                 plus `new Worker(sim/worker.entry.ts)`)
        ┌───────────┬────────────┬─────────────┐
        │           │            │             │
      ui/        render/       tools/         sim/
   (React +     (three.js,    (drag/hover   (worker: growth,
    Zustand)     no state)     state         traffic, economy,
        │           │          machine)      services, ...)
        │           │            │             │
        ├─────┬─────┘            │             │
        │     │                  │             │
      app/  data/ ◄───────────────────────────  │  (json only, no code)
        │                        │             │
        │                        │        app/persist.ts
        │                        │      (pure codec; the ONE
        │                        │       thing sim/ imports
        │                        │       outside shared/world/
        │                        │       core/data)
        │                        │             │
        └──────────┬─────────────┴─────────────┘
                    │
        ┌───────────┼────────────┐
        │           │            │
      world/       core/     (tools/, ui/, render/ also
   (grid, roads,  (loop,      reach shared/ directly —
    pathfinding)   rng,       arrows omitted above for
                   commands)  space; see the table below)
        │           │
        └─────┬──────┘
              │
           shared/
        (types.ts, constants.ts,
         pure geometry — the
         contract layer)
              │
            data/
     (catalog.json, roads.json —
      no code, nothing imports FROM it)
```

`data/` and `shared/` sit at the bottom because nothing above imports
downward past them and they import nothing themselves except `data/` from
`shared/`. `app/` is drawn twice in spirit: most of it sits with the
`ui/render` consumers, but `app/persist.ts` alone reaches down into `sim/`
— see [The `app/` exception](#the-app-exception-persistts) below.

## Per-directory rule, with evidence

| Directory    | Imports (runtime)                                                                                                            | Imported by                                                                                              | Rule                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data`   | nothing (JSON only, no code)                                                                                                 | `shared/roadprofile.ts`, `sim/network.ts`, `sim/worker.entry.ts`, `render/*`, `ui/*`                     | Leaf. Never imports anything; may be imported by anyone.                                                                                                                                |
| `src/shared` | `data/roads.json` (1 import, `roadprofile.ts`)                                                                               | everyone except `data/`                                                                                  | The contract layer — see [architecture-rules.md](standards/architecture-rules.md). No three.js, no DOM.                                                                                 |
| `src/core`   | `shared/` (1 import)                                                                                                         | `sim/worker.entry.ts` only                                                                               | Generic engine primitives (`FixedTimestep`, `CommandQueue`, seeded RNG, event bus) with zero city-domain knowledge. Nothing outside `sim/` currently uses it.                           |
| `src/world`  | `shared/` (26 imports)                                                                                                       | `sim/` (8 imports: `garbage.ts`, `worker.entry.ts`), `render/` (2 imports: `landfill.ts`, `zonegrid.ts`) | The tile-grid data model. Used by both the authoritative worker and the render thread's client mirror, because both need the same buildability/geometry math to produce valid previews. |
| `src/sim`    | `shared/` (39), `world/` (8), `data/` (3), `core/` (3), `app/persist` (1, type-erased both ways at the boundary — see below) | `app/persist.ts` (type-only, for `SerializedBuildingRegistry`/`GarbageSaveState`)                        | **Never `render/`, never `ui/`.** Verified by grepping every non-test `.ts` file in `src/sim`; the only cross-directory targets are the five above.                                     |
| `src/render` | `shared/` (90), `data/` (1), `world/` (2: `landfill.ts`, `zonegrid.ts`)                                                      | `main.ts`, `app/clientgrid.ts` (1 import: `bridges.ts`)                                                  | **Never `sim/`.** The reverse of the sim rule holds too — grepped the same way, no exceptions found.                                                                                    |
| `src/tools`  | `shared/` (8, all in `tools.ts`/`undo.ts`)                                                                                   | `main.ts`, `ui/` (3 imports: `RoadToolOptions.tsx`, `store.ts`, `test-helpers.ts`)                       | The tool state machine and undo stack. Pure logic — no DOM, no three.js — `ToolEnv` is the injected seam `main.ts` fills with real screen-picking and a real command channel.           |
| `src/ui`     | `shared/` (32), `app/` (8), `data/` (3), `tools/` (3)                                                                        | `main.ts` only                                                                                           | The React tree and the Zustand store. No three.js, no direct worker access — `store.ts`'s `BoundActions` is the only way a panel reaches the render thread.                             |
| `src/app`    | `shared/` (10), `sim/` (2, both in `persist.ts`, type-only), `render/` (1, `clientgrid.ts` → `render/bridges.ts`)            | `main.ts`, `ui/`, `sim/worker.entry.ts` (via `persist.ts` only)                                          | **Mixed-purpose — see below.**                                                                                                                                                          |
| `main.ts`    | every directory above, plus `new Worker(new URL('./sim/worker.entry.ts', ...))`                                              | nothing (entry point)                                                                                    | The one module allowed to import everything; every cross-boundary wiring point in the app funnels through it.                                                                           |

## The `app/` exception: `persist.ts`

`src/app/` is documented in `architecture.md` as "main-thread/session glue
that doesn't belong to render or ui specifically," and the import graph
shows exactly why that description is a hedge, not a clean rule:

- `persist.ts` is imported by **the sim worker** (`worker.entry.ts` imports
  `encodeSave`/`decodeSave` from it at runtime) — so at least one `app/`
  file has to be safe to run inside the worker: no DOM, no three.js.
- Its siblings — `clientgrid.ts`, `cursorchip.ts`, `audio.ts`, `music.ts`,
  `session.ts`, `audioruntime.ts` — are main-thread-only and some of them
  (`clientgrid.ts`) import straight from `render/` (`render/bridges.ts`, for
  the client-side mirror's bridge-height math).

So `src/app` is not one coherent layer with one dependency rule; it is two
files' worth of worker-safe codec sharing a folder with several files'
worth of main-thread session/audio/mirror glue that reaches into `render/`.
A newcomer cannot tell which is which from the directory name alone — only
from reading each file's own imports.

The `sim → persist.ts → sim/buildings, sim/garbage` edge looks like a cycle
at first read. It is not one at runtime: `persist.ts`'s imports from
`sim/buildings` and `sim/garbage` are both `import type` — `SerializedBuildingRegistry`
and `GarbageSaveState` — erased by `tsc` at build time, so there is no
runtime call from `app/persist.ts` back into `sim/`. The only runtime edge
is `worker.entry.ts` calling `encodeSave`/`decodeSave`.

## What is tooling-enforced, and what is not

**Nothing here is enforced by a lint rule.** `eslint.config.js` has no
`eslint-plugin-boundaries`, no `no-restricted-imports` scoping, nothing that
would flag a `sim/` file importing `render/`. `tsconfig.json` is a single
project with one `lib` array — `["ES2022", "DOM", "DOM.Iterable", "WebWorker"]`
— covering every file under `src/`, worker code included. A `sim/*.ts` file
that imported `render/scene.ts` or called `document.querySelector` would
still typecheck and lint clean; it would only fail at runtime, and only if
that code path actually executed inside the worker (which has no
`document`).

What **is** mechanically checked:

- `npm run build` fails if a module genuinely cannot resolve (a typo'd
  import path, a missing export) — but this catches broken imports, not
  imports that cross a boundary the team didn't want crossed.
- `src/shared/contracts*.test.ts` pin the shape of `Command`, `SimSnapshot`,
  and related protocol types with type-level assertions plus runtime
  asserts, so a change to a shared contract that breaks an assumption
  elsewhere fails `npm test` — this guards the _shape_ of the boundary, not
  which modules may cross it.

So every row in the table above is **convention, verified today by grep,
not guaranteed tomorrow by any tool.** The only gate against a new violation
is a reviewer reading the diff.

## See also

- [architecture.md](architecture.md) — the three execution contexts and one
  tick traced end to end.
- [standards/architecture-rules.md](standards/architecture-rules.md) — the
  firewall, the contract layer, and the one legitimate `Math.random`
  exception (`src/app/music.ts`).
- [adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md](adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
  — why the firewall exists and what it costs to keep it convention-only.
