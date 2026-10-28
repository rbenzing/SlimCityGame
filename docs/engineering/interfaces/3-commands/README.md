# 3. Commands

`Command` (`src/shared/types.ts:327-435`) is the _only_ way the world mutates;
every tool, panel action, and undo/redo replay is one or more `Command`
values sent inside a single `commands` message. There are **23 variants**.

Commands are queued client-side by `CommandQueue` (`src/core/commands.ts`),
which assigns a monotonically increasing `seq` starting at 1 and returns
whatever was pushed since the last drain, in push order. The worker's own
`pendingBatches` queue (`src/sim/worker.entry.ts:404`) preserves that order
and drains it once per tick (`drainCommands`, called first thing in `tick()`,
before any sim system runs) or immediately while the game is paused
(`pumpPaused`, `src/sim/worker.entry.ts:510`).

## Sections

| Section | Size |
| --- | --- |
| [Command index](command-index.md) | 13,572 B |
| [`CommandAck`](commandack.md) | 2,018 B |
| [Commands with real invariants](commands-with-real-invariants.md) | 5,668 B |
