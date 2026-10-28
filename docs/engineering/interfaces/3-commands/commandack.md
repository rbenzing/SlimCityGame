# `CommandAck`

```ts
export interface CommandAck {
  seq: number;
  ok: boolean;
  cost: number; // negative = refund
  inverse: Command[];
  reason?: string; // when ok === false: 'funds' | 'invalid' | 'locked' | ...
}
```

One `ack` answers one whole `commands` batch, not one command. A batch is
**atomic**: it lands whole or not at all.

- **On a refusal**, `drainCommands` (`src/sim/worker.entry.ts`) applies the
  commands in order and stops at the first one the world refuses. It then
  takes back every command of the batch that had landed, by replaying their
  inverses newest first. It also puts `funds` back as they stood before the
  batch, since an inverse is not priced like its original: a road's is a
  bulldoze, which refunds half. The ack is `ok: false`, with the refused
  command's `reason`, `cost: 0` and an empty `inverse`, and the world is as it
  was.
- **Why atomic:** a three-command batch whose second command is refused leaves
  nothing behind. That matters for a corridor's `defineRoadProfile` plus two
  `buildRoad` runs, an interchange stamp's ramps, a grid drag's streets and an
  undo's inverses. Each is one edit to the player.
- **If a rollback fails:** an inverse is exact, so one refused while it is
  taken back is a broken invariant. It is reported with `console.error` and
  not hidden.

A batch that lands acks `ok: true`, the summed `cost` and its inverses in the
reverse order of the originals. Each command's `result.inverse` is
`unshift`ed onto the accumulator, so command _N_'s inverse ends up ahead of
command _1_'s. `src/tools/undo.ts`'s `UndoStack` stores the resulting
`ReversibleEdit { label, forward, inverse, cost }` records client-side, capped
at 64 entries; `undo()`/`redo()` hand back `inverse`/`forward` for the caller
to resend as an ordinary (silent) `commands` batch. That batch is atomic too.
If the world refuses it, `refused(commands)` moves the edit those commands
belong to back where it was before the undo or redo, and the player is told
it failed.

