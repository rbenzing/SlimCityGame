# `src/main.ts`: the spine

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

