# Interface Contract

SlimCity runs as three cooperating parts: a deterministic simulation in a Web
Worker, an imperative three.js render thread, and a React + Zustand DOM
overlay. They never share memory or call each other's functions directly —
every exchange crosses one of two boundaries, and both boundaries are typed
contracts:

- **worker <-> render thread**, over `postMessage`, typed as `MainToWorker` /
  `WorkerToMain` (`src/shared/types.ts`).
- **render thread -> UI**, as direct Zustand store calls (`src/ui/store.ts`);
  there is no message envelope on this side, just plain function calls.

`src/shared/` is the contract layer every module codes against. Its own file
header states the rule: "module agents code against these types and must not
edit this file." This document describes the shapes and guarantees that layer
defines. It does not restate what the simulation _does_ with a command — that
is the specs' job. Start at the [documentation map](../../README.md).

A second surface is documented here for the same reason: `window.__slimcity`,
the dev-only read-back API `src/main.ts` exposes so browser-driven visual
checks can inspect the running game without reimplementing its internals.

## The sections

| Section | Bytes |
| ------- | ----: |
| [Contents](contents.md) | 709 |
| [1. Threads and direction](1-threads-and-direction.md) | 1387 |
| [2. The worker envelope: `MainToWorker` / `WorkerToMain`](2-the-worker-envelope-maintoworker--workertomain.md) | 6857 |
| [3. Commands](3-commands.md) | 21987 |
| [4. Turn and junction encoding](4-turn-and-junction-encoding.md) | 2448 |
| [5. Road composition](5-road-composition.md) | 2787 |
| [6. The world grid and persistence](6-the-world-grid-and-persistence.md) | 2102 |
| [7. The simulation snapshot](7-the-simulation-snapshot.md) | 16993 |
| [8. Invariants](8-invariants.md) | 2957 |
| [9. The dev read-back surface: `window.__slimcity`](9-the-dev-read-back-surface-window__slimcity.md) | 18106 |
| [10. Data files as interfaces](10-data-files-as-interfaces.md) | 2090 |
