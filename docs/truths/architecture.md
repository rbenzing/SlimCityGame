# Truths — Architecture and the thread boundary

Back to [the index](../GROUND-TRUTHS.md).


- [R-architecture-001] `src/sim` never imports `src/render` or `src/ui`; `src/render` never imports
  `src/sim`; `src/ui` never imports `src/sim`, `src/render` or three.js;
  `src/sim` and `src/render` never import React. No lint rule enforces this,
  only review, so check the diff. —
  [architecture-rules.md](../engineering/standards/architecture-rules.md),
  [dependency-map.md](../engineering/dependency-map.md),
  [ui-architecture.md](../ux/ui-architecture.md)
- [R-architecture-002] `src/shared` is the contract layer every module codes against: types,
  constants and pure helpers with no three.js and no DOM. Edit it deliberately,
  as a contract change, never as a convenience. —
  [architecture-rules.md](../engineering/standards/architecture-rules.md),
  [interfaces.md](../engineering/interfaces.md)
- [R-architecture-003] The worker is authoritative and never touches the DOM or a `THREE.Scene`. It
  never originates a `Command`; every `Command` starts on the main thread (tool
  commit, undo/redo, settings). — [architecture.md](../engineering/architecture.md),
  [interfaces.md](../engineering/interfaces.md)
- [R-architecture-004] Player `Command`s are the only way the world mutates. The render thread and
  React never write grid or building state; they read `SimSnapshot` deltas into
  `ClientGridMirror` and the store. All cross-thread exchange is a
  `MainToWorker` / `WorkerToMain` message, never a shared object. —
  [ADR-0002](../engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md),
  [ui-architecture.md](../ux/ui-architecture.md)
- [R-architecture-005] Anything the UI needs from the sim is added to `SimSnapshot` or a
  `WorkerToMain` variant; there is no ambient shared access. `SimSnapshot`
  carries deltas: a channel is present only when it changed (`stats`, `vehicles`
  and `transit` excepted), and `roadProfiles` is always sent before `roads`. —
  [ADR-0002](../engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md),
  [interfaces.md](../engineering/interfaces.md)
- [R-architecture-006] A snapshot's `buildings` delta names each id in exactly one of `added`,
  `updated` and `removed`, carrying the building as it stands now, so no
  renderer depends on the order it applies them in. Sent as logged, a home
  updated and then levelled up in one window arrived both updated and removed,
  and every renderer that applied removals first put the old home's roof back
  beside the new house. — [interfaces.md](../engineering/interfaces.md);
  `settleBuildingDelta` in `src/sim/buildings.ts`
- [R-architecture-007] Only `src/main.ts` imports from every directory and spawns the worker. A UI
  panel reaches the render thread only through a method on `BoundActions` in
  `src/ui/store.ts`, bound in `main.ts`. —
  [architecture.md](../engineering/architecture.md),
  [dependency-map.md](../engineering/dependency-map.md)
- [R-architecture-008] Every `Command` kind has an `applyCommand` case that returns its literal, exact
  inverse (the prior values, not a re-derived approximation); undo replays that
  inverse, refund included. A road it puts back carries the stored flow and
  deck height each tile had (`flows`, `elevations`), never a direction read
  off the order its tiles were listed in: a bulldoze lists a rectangle, and
  its undo once laid one-way roads and corridor halves back running the wrong
  way, unpaired. An inverse is never refused by a rule a player's own command
  would face: zones go back with `restore`, since a zone can outlive the road
  that allowed it. Settings commands return an empty inverse and are
  simply not undoable. Sim-grown changes (spawn, level-up, abandonment) never
  enter the undo stack. —
  [ADR-0008](../engineering/adr/0008-every-tool-commit-is-a-reversible-command.md),
  [interfaces.md](../engineering/interfaces.md); `applyCommand` in
  `src/sim/worker.entry.ts`, `src/tools/undo.ts`
- [R-architecture-009] A command batch lands whole or not at all. At the first command the world
  refuses, `drainCommands` stops, takes back every command of the batch that
  landed by replaying their exact inverses newest first, and puts the funds
  back as they stood before the batch. The ack is `ok: false` with that
  command's reason, no cost and no inverse. A batch that lands acks the summed
  cost and the inverses unshifted, so undo replays in reverse. An undo or redo
  is a batch like any other: one the world refuses changes nothing, and the
  client puts the edit back where it was in the history. A batch once kept
  what landed before a refusal, with no undo for it. — `drainCommands` in
  `src/sim/worker.entry.ts`, `refused` in `src/tools/undo.ts`
- [R-architecture-010] `drainCommands`
  touches no RNG, growth, fields, economy or traffic, so commands apply while
  paused; a new handler stays tick-independent. What a command builds reaches
  the next snapshot as it stands, paused or not, and only what the sim works
  out (ridership, say) waits for a tick: a transit line drawn while paused once
  stayed off the screen until play resumed, because its snapshot read the last
  tick's lines. — [interfaces.md](../engineering/interfaces.md)
- [R-architecture-011] Every priced command refuses with `reason: 'funds'` when cost exceeds funds
  (unless unlimited money is on). Zoning, de-zoning, bulldoze and district paint
  are always free. Every catalog entry, zone tier and tool carries an
  `unlockMilestone` and the worker refuses `'locked'`; Sandbox and Unlimited
  money bypass a real gate, never replace it with a weaker one. —
  [economy.md](../game-design/economy.md),
  [progression.md](../game-design/progression.md)
- [R-architecture-012] A command failure returns a specific `CommandAck.reason` and the toast copy in
  `main.ts`'s `onAck` names it; never a generic failure. —
  [error-handling.md](../engineering/standards/error-handling.md)
- [R-architecture-013] No React and no React Three Fiber in the render path; the 3D world is
  imperative three.js driven from `main.ts`. Viewport pointer and keyboard input
  and the cursor chip live in `main.ts` / `src/app` with `addEventListener`,
  never React handlers. —
  [ADR-0004](../engineering/adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md),
  [ui-architecture.md](../ux/ui-architecture.md)
- [R-architecture-014] Only state the render thread or worker must read (tool, overlay, photo mode,
  screen, settings) goes in the store; transient navigation state is `useState`
  in `App.tsx`. — [ui-architecture.md](../ux/ui-architecture.md)
- [R-architecture-015] Dev-only read-backs hang off `window.__slimcity` behind
  `import.meta.env.DEV`. Add a read method there rather than inferring from
  pixels, and never edit `src/` while a screenshot harness is running. —
  [interfaces.md](../engineering/interfaces.md),
  [debugging.md](../engineering/standards/debugging.md)
- [R-architecture-016] Expected, recoverable failures (storage, optional GPU features) are handled
  locally with a fallback and a comment naming the expected failure; they never
  crash boot or the frame loop, and there are no retries. Only `console.warn`
  and `console.error` are used; there is no logger. —
  [error-handling.md](../engineering/standards/error-handling.md),
  [logging.md](../engineering/standards/logging.md)

