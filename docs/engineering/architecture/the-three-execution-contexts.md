# The three execution contexts

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
timestep (`TICK_RATE` in [`src/shared/constants.ts`](../../../src/shared/constants.ts))
driven by `FixedTimestep` in [`src/core/loop.ts`](../../../src/core/loop.ts), using a
seeded RNG (`src/core/rng.ts`) so a seed plus a command log is reproducible —
see [ADR-0002](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).
It never touches the DOM or a `THREE.Scene`; it exposes state to the rest of
the app only by posting `WorkerToMain` messages.

**The render thread** (`src/main.ts` plus `src/render/*`) owns the
`WebGPURenderer` (falls back to WebGL2, see `createRenderer` in
[`src/render/scene.ts`](../../../src/render/scene.ts)), the `THREE.Scene`, every
mesh/instancer, the camera rig, and a read-only mirror of the world
(`ClientGridMirror` in [`src/app/clientgrid.ts`](../../../src/app/clientgrid.ts))
built entirely from snapshot deltas. It drives its own frame loop via
`renderer.setAnimationLoop`, independent of the sim's tick rate. It also owns
raw input on the `#viewport` canvas: pointer and keyboard events are wired
directly in `main.ts`, not through React.

**The React overlay** (`src/ui/*`) owns every DOM panel, bar, and popover
mounted into `#ui-root` (see `mountUi` in
[`src/ui/App.tsx`](../../../src/ui/App.tsx)). It holds no simulation or scene state
itself; it reads and writes a single Zustand store
(`useCityStore`, [`src/ui/store.ts`](../../../src/ui/store.ts)) that `main.ts`
populates from snapshots and subscribes to for tool/setting changes. Per
[ADR-0004](../adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md),
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

