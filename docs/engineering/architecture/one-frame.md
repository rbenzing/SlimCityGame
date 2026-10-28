# One frame

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
   asks the worker for a fresh scalar-field snapshot. The lens is one quad
   over the map whose texture holds a texel per tile, column x and row z,
   so tile (x, z)'s value lies over tile (x, z).
7. The frame renders: through the bloom pipeline
   (`src/render/bloom.ts`) if enabled, otherwise a plain
   `handle.renderer.render(world.scene, camera)`.

Render frame rate never influences simulation rate in either direction — that
decoupling is the whole point of
[ADR-0002](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).

