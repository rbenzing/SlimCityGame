# 1. Threads and direction

| Thread               | Owns                                                                                  | File                      |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------- |
| Sim worker           | `GridState`, every sim system, `CityStats`, the authoritative clock                   | `src/sim/worker.entry.ts` |
| Render/integration   | The three.js scene, `ToolManager`, `UndoStack`, `CommandQueue`, the worker connection | `src/main.ts`             |
| UI (React + Zustand) | DOM panels; reads/writes only through `useCityStore`                                  | `src/ui/store.ts`         |

The worker never imports render or UI code, and the UI store never imports the
worker; `src/main.ts` is the only module that talks to both. Every `Command`
originates in the render/tools layer (a tool commit, an undo/redo replay, or a
settings toggle) and is sent to the worker; the worker never originates a
`Command`. Every `SimSnapshot` originates in the worker; the render thread only
consumes it, folds it into its own read-only mirror (`clientGrid`, described in
`GridState`'s own doc comment as "the render thread keeps a read-only mirror
updated from snapshots/patches"), and pushes derived values into the Zustand
store via its setter actions.
