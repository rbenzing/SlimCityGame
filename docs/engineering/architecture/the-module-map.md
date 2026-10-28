# The module map

```
shared/  ← data/            (roadprofile.ts reads roads.json/catalog.json)
core/    ← shared/
world/   ← shared/
tools/   ← shared/
render/  ← shared/, data/, world/
app/     ← shared/, sim/, render/     (mixed: see below)
ui/      ← shared/, data/, tools/, app/
sim/     ← shared/, data/, core/, world/, app/persist   (never render/, never ui/)
main.ts  ← everything above, plus new Worker(sim/worker.entry.ts)
```

| Directory    | What it is for                                                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared` | Types (`types.ts`), constants (`constants.ts`), and pure geometry/data helpers (road profiles, junctions, corridors, tapers, approach-lane rules) shared by both the worker and the render thread. No three.js, no DOM.                                                     |
| `src/core`   | Generic engine primitives with no city-domain knowledge: `FixedTimestep` (loop.ts), `CommandQueue` (commands.ts), event helpers, the seeded RNG.                                                                                                                            |
| `src/world`  | The tile-grid data model and its pure logic: `GridState` operations, road/bridge/terraform/powerline/landfill/district math, pathfinding. Used by both `sim/` (authoritative) and `render/` (the client mirror needs the same buildability logic to render valid previews). |
| `src/sim`    | Every stateful simulation system (growth, traffic, transit, economy, services, dispatch, garbage, policy, fields) plus `worker.entry.ts`, the worker's message loop and tick pipeline.                                                                                      |
| `src/render` | Every three.js renderer/mesh builder: buildings, roads, vehicles, terrain, sky, props, UI-adjacent overlays (ghost previews, selection outline), picking. Pure geometry math is typically split into a `.ts` module with a matching `.test.ts` that runs headless.          |
| `src/tools`  | The tool state machine (`ToolManager` in tools.ts: hover → drag → commit/cancel) and the undo/redo stack (undo.ts). Pure logic, no DOM/three.js — `ToolEnv` is the injected boundary main.ts fills with real screen-picking and a real command channel.                     |
| `src/ui`     | The React component tree and the Zustand store. No three.js, no direct worker access — `store.ts`'s `BoundActions` interface is the only way a panel reaches into the render thread, and `main.ts` supplies the real implementation via `bindActions`.                      |
| `src/data`   | Static JSON: `catalog.json` (building definitions) and `roads.json` (road specs by tier). No code, no imports.                                                                                                                                                              |
| `src/app`    | Main-thread/session glue that doesn't belong to render or ui specifically: persistence codec + IndexedDB (`persist.ts`, imported by _both_ the worker and the main thread), audio, the client grid mirror (`clientgrid.ts`), session/settings storage, the cursor-chip HUD. |

### Verified dependency rule: `sim/` never imports `render/` or `ui/`

I grepped every import in `src/sim/*.ts` (excluding tests): the only
cross-directory targets are `core/`, `data/`, `shared/`, `world/`, and
`app/persist` (a pure save-codec module with its own imports limited to
`shared/` and `sim/`). **The rule holds today.** The reverse also holds:
`render/` imports only `data/`, `shared/`, `world/` — never `sim/`. So the
firewall is bidirectional in practice, even though
[ADR-0002](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
states it in one direction.

This is **not enforced by tooling**. `eslint.config.js` has no import-boundary
rule (no `eslint-plugin-boundaries`, no `no-restricted-imports` scoping), and
`tsconfig.json` is a single project with one `lib` list (`DOM` and
`WebWorker` together), so a `sim/` file that imported `render/` or referenced
`document` would still type-check and lint clean — it would only fail at
runtime, and only if that code path actually executed inside the worker.
`CONTRIBUTING.md` states the rule as a quality gate, but the only gate that
would currently catch a violation is a reviewer reading the diff, or the app
crashing the first time the worker hits the offending line. The "no
`Math.random`/`Date.now` in sim or render" rule is in the same position: real
today, checked by nobody but a reviewer.

What _is_ mechanically checked: `src/shared/contracts*.test.ts` pin specific
constants and message-shape invariants with type-level assertions plus
runtime asserts, so a change to a protocol constant that breaks an assumption
elsewhere fails `npm test`. Determinism itself is checked piecewise, not
end-to-end: `src/core/rng.test.ts` proves the seeded RNG replays identically,
and individual systems (`src/sim/traffic.test.ts`, `src/render/trees.test.ts`,
`src/render/transit.test.ts`) each have a same-seed/same-input test. There is
no single test that runs two full `SimWorld` instances from the same seed and
command log and diffs the resulting grid.

