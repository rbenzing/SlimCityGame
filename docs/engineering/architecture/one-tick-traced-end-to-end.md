# One tick, traced end to end

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
   [ADR-0008](../adr/0008-every-tool-commit-is-a-reversible-command.md) — clears
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

