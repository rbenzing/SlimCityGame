# Architecture overview

SlimCity runs as three cooperating execution contexts inside one browser tab:
a deterministic simulation in a Web Worker, an imperative three.js render
thread on the main thread, and a React DOM overlay on that same main thread.
This document is the map of how those three are put together — what each
owns, what crosses between them, and where the seams are. For _why_ a given
split was chosen, follow the ADR links rather than re-deriving the argument
here; for the exact shape of a message or a save file, see
[interfaces.md](interfaces.md) and [data-model.md](data-model.md).

## The three execution contexts

```
┌─────────────────┐
│   sim worker    │  src/sim/worker.entry.ts
└─────────────────┘  fixed 20 ticks/sec, seeded RNG
        │  MainToWorker (commands, setSpeed, requestField, ...)
        │  WorkerToMain (snapshot, ack, field, save, ...)
        ▼
┌─────────────────┐
│  render thread  │  src/main.ts, src/render/*
└─────────────────┘  three.js scene, rAF loop, raw input
        │  zustand store — src/ui/store.ts
        │  render writes it from snapshots; React
        │  reads it and calls the bound actions
        ▼
┌─────────────────┐
│  React overlay  │  src/ui/*
└─────────────────┘  #ui-root DOM panels
```

**The sim worker** (`src/sim/worker.entry.ts`) owns the only authoritative
copy of the world: the `GridState` typed arrays, the `BuildingRegistry`, the
road/rail/tram graphs, and every stateful system (growth, traffic, economy,
transit, dispatch, garbage, policy). It runs on a fixed 20-ticks/second
timestep (`TICK_RATE` in [`src/shared/constants.ts`](../src/shared/constants.ts))
driven by `FixedTimestep` in [`src/core/loop.ts`](../src/core/loop.ts), using a
seeded RNG (`src/core/rng.ts`) so a seed plus a command log is reproducible —
see [ADR-0002](adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).
It never touches the DOM or a `THREE.Scene`; it exposes state to the rest of
the app only by posting `WorkerToMain` messages.

**The render thread** (`src/main.ts` plus `src/render/*`) owns the
`WebGPURenderer` (falls back to WebGL2, see `createRenderer` in
[`src/render/scene.ts`](../src/render/scene.ts)), the `THREE.Scene`, every
mesh/instancer, the camera rig, and a read-only mirror of the world
(`ClientGridMirror` in [`src/app/clientgrid.ts`](../src/app/clientgrid.ts))
built entirely from snapshot deltas. It drives its own frame loop via
`renderer.setAnimationLoop`, independent of the sim's tick rate. It also owns
raw input on the `#viewport` canvas: pointer and keyboard events are wired
directly in `main.ts`, not through React.

**The React overlay** (`src/ui/*`) owns every DOM panel, bar, and popover
mounted into `#ui-root` (see `mountUi` in
[`src/ui/App.tsx`](../src/ui/App.tsx)). It holds no simulation or scene state
itself; it reads and writes a single Zustand store
(`useCityStore`, [`src/ui/store.ts`](../src/ui/store.ts)) that `main.ts`
populates from snapshots and subscribes to for tool/setting changes. Per
[ADR-0004](adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md),
the 3D world is deliberately _not_ React — it stays imperative three.js code
driven straight by `main.ts`.

`index.html` reflects this split literally: `<div id="viewport">` is the
three.js canvas' host, `<div id="ui-root">` is React's, and `src/main.ts` is
the only script tag — it boots all three contexts.

### What state lives where

| State                                     | Owner                                                           | How others see it                                             |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `GridState` (tiles, roads, zones, fields) | sim worker                                                      | `SimSnapshot` deltas → `ClientGridMirror`                     |
| `BuildingRegistry` (building instances)   | sim worker                                                      | `snapshot.buildings` add/update/remove deltas                 |
| Road/rail/tram graphs                     | sim worker (`RoadNetwork`)                                      | never sent whole; junctions/edges surface via snapshot fields |
| `THREE.Scene`, meshes, camera             | render thread                                                   | not visible outside `src/render`/`main.ts`                    |
| Tool/drag state (`ToolManager`)           | render thread (`src/tools/tools.ts`, instantiated in `main.ts`) | UI reads only the derived preview/cursor-chip via the store   |
| Undo/redo history                         | render thread (`UndoStack`, `src/tools/undo.ts`)                | not exposed; UI sees only `canUndo`/`canRedo` booleans        |
| Stats, notifications, selection, settings | Zustand store (`src/ui/store.ts`)                               | written by `main.ts` from snapshots/acks; read by React       |

## `src/main.ts`: the spine

`src/main.ts` is the only module that imports from every other top-level
directory. `startGame()` runs once per session and, in order:

1. Builds the procedural map (`generateProceduralMap`, `src/world/maps.ts`).
2. Creates the renderer and scene (`src/render/scene.ts`) and every renderer
   object (`BuildingInstancer`, `RoadMeshRenderer`, `VehicleRenderer`, …).
3. Spawns `new Worker(...)` over `src/sim/worker.entry.ts`, then posts an
   `init` message carrying the seed and map.
4. Builds a `ToolManager` (`src/tools/tools.ts`) with a `ToolEnv` that closes
   over screen-to-tile picking, the command channel, and read access to the
   client-side grid mirror and store.
5. Wires `worker.onmessage` to dispatch on `WorkerToMain.type`
   (`ready` / `ack` / `snapshot` / `field` / `save` / `notify` / `selection`).
6. Subscribes to the Zustand store (`store.subscribe`) so a UI-driven change
   (selected tool, brush settings, active overlay lens) reaches the
   `ToolManager` and the renderers without React ever touching them.
7. Mounts React (`mountUi(uiRoot)`) and starts the frame loop
   (`handle.start((dtMs) => { … })`).

Everything that crosses a thread or framework boundary passes through one of
these wiring points; there is no second path.

## The module map

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
[ADR-0002](adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
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

## One frame

The render thread's frame loop runs every `requestAnimationFrame`-driven
callback from `renderer.setAnimationLoop`, in `handle.start((dtMs) => {...})`
near the end of `startGame()` in `main.ts`. Every frame, regardless of
whether a sim tick landed:

1. `rig.update(dtMs)` moves the camera; `world.setShadowFocus(...)` recenters
   the shadow frustum.
2. `terrain.update()`, `water.update(dtMs, nightFactor)`,
   `clouds.update(dtMs, tick, dayT)` animate ambient systems.
3. `vehicles.update(vehicleAlpha)` and `serviceVehicles.update(vehicleAlpha)`
   interpolate positions between the last two snapshots, where
   `vehicleAlpha = min(1, snapshotAgeMs / SNAPSHOT_INTERVAL_MS)` — cars glide
   between the sim's 10 Hz snapshots instead of teleporting.
4. `transitRenderer.update(dtMs / 1000)` runs buses on real elapsed seconds,
   independent of sim speed.
5. Signal phase (`roadFurniture.setSignalPhase`) advances on _scaled_ sim
   time (`SPEED_MULTIPLIERS[speed]`), so a paused city holds its lights and a
   4× city cycles them 4× as fast.
6. Every ~500 ms, if an infoview lens is active, `requestField(overlay)`
   asks the worker for a fresh scalar-field snapshot.
7. The frame renders: through the bloom pipeline
   (`src/render/bloom.ts`) if enabled, otherwise a plain
   `handle.renderer.render(world.scene, camera)`.

Render frame rate never influences simulation rate in either direction — that
decoupling is the whole point of
[ADR-0002](adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).

## One tick, traced end to end

This is the loop that matters most: a player action becomes a permanent,
undoable change to the city, and the screen catches up.

1. **Click.** A `pointerdown`/`pointermove`/`pointerup` on `#viewport` calls
   `toolManager.pointerDown/Move/Up` (`src/tools/tools.ts`). The tool state
   machine validates the drag against `ToolEnv` (funds, milestone, geometric
   overlap) and, on a valid commit, calls `env.send(label, commands)`.
2. **Queue.** `main.ts`'s `env.send` implementation calls `postCommands`,
   which does `queue.push(commands)` (`CommandQueue`,
   `src/core/commands.ts`) purely to mint a sequence number, records
   `pendingEdits.set(seq, { label, forward: commands })` for the undo stack,
   and posts `{ type: 'commands', seq, commands }` to the worker.
3. **Apply.** `SimWorld.handleMessage` (`src/sim/worker.entry.ts`) pushes the
   batch onto `pendingBatches`. It is _not_ applied immediately — it waits
   for the next call to `tick()`, which `drainCommands()` runs first thing.
   `drainCommands` calls `applyCommand(command)` for each command in the
   batch (a big switch over `Command.kind` — `buildRoad`, `bulldoze`,
   `placeBuilding`, `setJunctionControl`, …), accumulates `cost` and an
   `inverse: Command[]`, and posts one `CommandAck` per batch:
   `{ seq, ok, cost, inverse, reason? }`.
   - Exception: at sim speed 0 (paused), `pump()` routes to `pumpPaused()`,
     which calls `drainCommands()` directly without waiting for a tick —
     building is possible while paused because command application is
     itself tick-independent and deterministic (no RNG, no growth/traffic).
4. **Acknowledge.** `main.ts`'s `onAck(ack)` looks up `pendingEdits.get(seq)`.
   On success it pushes the label, the forward commands, `ack.inverse`, and
   `ack.cost` onto the `UndoStack` (`src/tools/undo.ts`) — this is what makes
   every commit reversible, per
   [ADR-0008](adr/0008-every-tool-commit-is-a-reversible-command.md) — clears
   any trees under the new footprint, and plays a sound. On failure it shows
   a toast naming the reason (`funds` / `locked` / other).
5. **Snapshot.** Independent of acks, `tick()` calls `postSnapshot()` every
   `SNAPSHOT_TICKS` ticks (`TICK_RATE / SNAPSHOT_HZ` = 2, i.e. every other
   tick, so 10 Hz at 1× speed). The snapshot carries only what changed since
   the last one: `snap.roads`, `snap.buildings.{added,updated,removed}`,
   `snap.zones`, `snap.power`/`watered`, `snap.districts`, `snap.garbage`,
   `snap.junctions`, plus the always-present `stats` and `vehicles` buffer.
6. **Diff into the render thread.** `main.ts`'s `onSnapshot(snap)` applies
   each present field, in dependency order (profiles before road deltas,
   road deltas before mesh rebuilds), into: (a) the Zustand store —
   `state.applySnapshotStats(snap.stats)`, `state.setStatsSamples(...)` —
   which React re-renders from; and (b) a long list of imperative renderers
   that each diff against their own retained state and rebuild only the
   affected region — `roadsMesh.apply(snap.roads)`,
   `instancer.apply(snap.buildings)`, `zoneGrid.applyZonePatches(snap.zones)`,
   `lamps.rebuild(roadTiles, drivewayTiles)`, and a dozen more. `ClientGridMirror`
   (`src/app/clientgrid.ts`) is updated in the same pass so later tool
   previews see the new state.

No step in this chain touches React directly except through the store, and
no step touches the sim worker's `GridState` directly except through
messages — every cross-boundary write is a serialized message or a store
mutation, never a shared object.

## Extension points

| Adding a…                         | Touch                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Building type                     | `src/data/catalog.json` (new `BuildingCatalogEntry`); `src/render/archetypes.ts` if its silhouette needs a new recipe; nothing in `sim/` unless it has bespoke behavior (garbage facility, service coverage) — most fields (`residents`, `jobs`, `pollution`, `upkeep`, …) are already read generically by `sim/growth.ts`, `sim/economy.ts`, `sim/services.ts`. |
| Road piece / cross-section option | `src/data/roads.json` (new `RoadSpec` or tier) and `src/shared/roadprofile.ts` (composition/lay rules); render side in `src/render/roadsmesh.ts`, `roadmarkings.ts`, or `roadfurniture.ts` depending on what it draws.                                                                                                                                           |
| Scalar field                      | `FieldId` in `src/shared/types.ts`, `FIELD_COUNT`; emission/diffusion in `src/sim/fields.ts`; a coverage lens in `src/render/overlays.ts` and the `LensId` union if the player can select it.                                                                                                                                                                    |
| Command                           | The `Command` union in `src/shared/types.ts`; a case in `applyCommand` (`src/sim/worker.entry.ts`); a call site in `src/tools/tools.ts` if it is player-triggered from a drag/click, or a direct `postCommands` call from `main.ts`/a store action for a settings-style command (see `setSandbox`, `setUnlimitedMoney`).                                         |
| UI panel                          | A component under `src/ui/`, reading/writing `useCityStore`; if it needs render-thread behavior (e.g. focusing the camera), add a method to `BoundActions` (`store.ts`) and implement it in the `bindActions` call in `main.ts`.                                                                                                                                 |

## Where to look next

- [interfaces.md](interfaces.md) — the exact shape of `Command`,
  `SimSnapshot`, `MainToWorker`/`WorkerToMain`, and the save payload.
- [data-model.md](data-model.md) — what a save file contains and how it
  migrates across versions.
- [systems/](systems/README.md) — how one simulation system (traffic,
  growth, garbage, …) works internally.
- [adr/](adr/README.md) — why each load-bearing choice above was made, and
  what it cost.
