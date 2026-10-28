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

### Command index

| Kind                   | Key fields                                                                                                                                            | Cost                                                                                                                                  | Inverse                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `buildRoad`            | `tier`, `tiles`, `elevation?`, `elevations?`, `profile?`, `replace?`, `flows?`, `join?`, `apart?`                                                     | tier `costPerTile` × changed tiles, plus bridge cost                                                                                  | `bulldoze` and/or `buildRoad` of what was there, plus any auto-flatten `terraformSet`        |
| `defineRoadProfile`    | `id`, `profile`                                                                                                                                       | 0                                                                                                                                     | `[]` (not undoable; idempotent instead — see [§5](5-road-composition.md))                      |
| `setJunctionControl`   | `x`, `z`, `control: JunctionControl \| null`                                                                                                          | 0                                                                                                                                     | same command with the prior control                                                          |
| `setJunctionTurns`     | `x`, `z`, `arm: RoadFlow`, `allowed: number \| null`                                                                                                  | 0                                                                                                                                     | same command with the prior `allowed`                                                        |
| `setJunctionLaneTurns` | `x`, `z`, `arm`, `lane`, `allowed: number \| null`                                                                                                    | 0                                                                                                                                     | same command with the prior `allowed`                                                        |
| `buildRoundabout`      | `x`, `z` (the block's north-west tile)                                                                                                                | 0                                                                                                                                     | `removeRoundabout` carrying the four tiles' prior junction state                             |
| `removeRoundabout`     | `x`, `z`, `junctions?: RoundaboutJunction[]` (four, north-west, north-east, south-west, south-east)                                                   | 0                                                                                                                                     | `buildRoundabout` at the same block                                                          |
| `bulldoze`             | `tiles`                                                                                                                                               | negative (50% refund of what stood there), less ¢14 an interment of any cemetery cleared, refused for funds when short of that charge | rebuilds roads/zones/buildings/junction overrides/power line, a cemetery with its interments |
| `buildSegment`         | `tier`, `profile?`, `a`, `b`, `control?`, `flow?` (points in world cm)                                                                                | `costPerTile` × length ÷ 20 m                                                                                                         | `removeSegment` of the same ends and control                                                 |
| `removeSegment`        | `a`, `b`, `control?`                                                                                                                                  | negative (50% of `costPerTile` × length ÷ 20 m)                                                                                       | `buildSegment` of what was removed                                                           |
| `splitSegment`         | `at` (a point on a free road's centre line, world cm)                                                                                                 | 0                                                                                                                                     | `joinSegments` at the same point with the road's control                                     |
| `joinSegments`         | `at`, `control?`                                                                                                                                      | 0                                                                                                                                     | `splitSegment` at the same point                                                             |
| `moveSegmentEnd`       | `from`, `to` (world cm, at most half a tile apart on each axis)                                                                                       | 0                                                                                                                                     | `moveSegmentEnd` from `to` back to `from`                                                    |
| `paintZone`            | `zone`, `tiles`, `restore?`                                                                                                                           | 0                                                                                                                                     | `paintZone` per prior zone group, with `restore`                                             |
| `placeBuilding`        | `catalogId`, `x`, `z`, `rotation`, `interments?` (an undo's cemetery put back with its burials)                                                       | catalog `cost`, less ¢14 an interment restored                                                                                        | `bulldoze` of the footprint, plus any auto-flatten                                           |
| `setTaxRate`           | `sector`, `rate` (clamped `0..MAX_TAX_RATE`)                                                                                                          | 0                                                                                                                                     | `[]` (not undoable)                                                                          |
| `setServiceFunding`    | `service` (a `FundingKey`: police, fire, health, education or park; the four schools and the library share `education`), `funding` (clamped `0..1.5`) | 0                                                                                                                                     | `[]`                                                                                         |
| `takeLoan`             | `amount`                                                                                                                                              | 0 (funds rise; loan is capped, see [§8](8-invariants.md))                                                                               | `[]`                                                                                         |
| `repayLoan`            | `amount`                                                                                                                                              | 0                                                                                                                                     | `[]`                                                                                         |
| `terraform`            | `mode`, `center`, `radius`, `strength`, `targetHeight?`                                                                                               | brush kernel cost                                                                                                                     | `terraformSet` of the exact pre-edit heights                                                 |
| `terraformSet`         | `x`, `z`, `w`, `h`, `heights: Float32Array`                                                                                                           | 0 (undo/redo primitive, never funds-gated)                                                                                            | `terraformSet` of the heights it just overwrote                                              |
| `createTransitLine`    | `line: TransitLine`                                                                                                                                   | 0                                                                                                                                     | `deleteTransitLine` with the id the worker assigned                                          |
| `updateTransitLine`    | `line: TransitLine` (matched by `line.id`)                                                                                                            | 0                                                                                                                                     | `updateTransitLine` of the line as it was, or `[]` if the id is unknown (`ok: false`)        |
| `deleteTransitLine`    | `id`                                                                                                                                                  | 0                                                                                                                                     | `createTransitLine` of the deleted line, or `[]` if the id is unknown (`ok: false`)          |
| `paintDistrict`        | `districtId`, `tiles`                                                                                                                                 | 0                                                                                                                                     | `paintDistrict` per prior district-id group                                                  |
| `setDistrictPolicy`    | `districtId`, `policy`, `on`                                                                                                                          | 0                                                                                                                                     | same command with `on` negated                                                               |
| `paintLandfill`        | `tiles`, `on`                                                                                                                                         | `on` ? new tiles × `LANDFILL_PAINT_COST_PER_TILE` : 0                                                                                 | `paintLandfill` per turned-on/turned-off group, `on` flipped                                 |
| `stringPowerLine`      | `tiles`, `on`                                                                                                                                         | `on` ? changed tiles × `POWER_LINE_COST_PER_TILE` : 0                                                                                 | `stringPowerLine` of the changed tiles, `on` flipped                                         |
| `layWaterPipe`         | `tiles`, `on`                                                                                                                                         | `on` ? changed tiles × `WATER_PIPE_COST_PER_TILE` : 0                                                                                 | `layWaterPipe` of the changed tiles, `on` flipped                                            |
| `setSandbox`           | `on`                                                                                                                                                  | 0                                                                                                                                     | `[]` (a persistent mode flag, not an undoable edit)                                          |
| `setUnlimitedMoney`    | `on`                                                                                                                                                  | 0                                                                                                                                     | `[]`                                                                                         |

### `CommandAck`

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

### Commands with real invariants

**`buildRoad`** resolves `profile ?? tier` to a tier via
`tierForProfileId` (a preset's id is its own tier; a custom id resolves through
the save's profile table), rejects if that tier has no `RoadSpec` or is
locked behind an unmet milestone (unless sandbox), then solves the whole
drag's deck-height profile in one pass (`solveElevationProfile`) before
touching any tile — a tile's buildability depends on its _neighbors'_
resolved height, not the ground alone. Per tile it is one of: newly built,
_replaced_ (a different tier or composition wins over what was there),
_reprofiled_ (the tile keeps its road but changes deck height or direction),
or untouched. `changedCount === 0` (every tile untouched) acks `ok: true, cost:
0` if any tile was valid at all, else `ok: false, reason: 'invalid'`. The
inverse is assembled per prior-profile group so undo puts back the exact road
that was there (composition and id, not merely "a road of the same tier"),
plus a `terraformSet` restoring the deck heights an auto-flatten pass changed.

**`defineRoadProfile`** is checked against `layRefusal` (does the profile fit
its class's piece/lane rules and its tile or corridor width) and is
**idempotent for an identical redefinition** under an id that already holds
one: re-sending the exact same profile under the same id acks `ok: true, cost:
0, inverse: []`; sending a _different_ profile under an id that already holds
one is rejected (`reason: 'invalid'`) rather than silently reshaping every
road already laid with that id. It is not itself undoable — the profile stays
defined even if the `buildRoad` that used it is later undone, since another
tile drawn from the same custom-profile slot may still need it.

**`setJunctionControl` / `setJunctionTurns` / `setJunctionLaneTurns`** all
share the same gate: the tile must be a real junction of the street network
(`node.edges.length >= 3` — a dead end, mid-run tile, or bend has nobody to
give way to), and for the turn commands the named `arm` must point at an
in-bounds tile carrying a street tier. `setJunctionTurns`/`setJunctionLaneTurns`
additionally reject an `allowed` value that would leave the arm/lane nothing to
do (`allowed !== null && (allowed & 0xf) === 0`). All three are no-ops (`ok:
true, cost: 0, inverse: []`) when the new value equals what is already stored.
See [§4](4-turn-and-junction-encoding.md) for what the packed values mean. All
three refuse a corner of a compact roundabout, which is one junction on four
tiles.

**`buildRoundabout` / `removeRoundabout`** make and take out a compact
roundabout on the 2×2 block whose north-west tile is `(x, z)`.
`buildRoundabout` is refused, with the site's own reason, unless
`roundaboutPlan` (`src/shared/roundabout.ts`) finds every tile laid and the
block a roundabout's site; it writes the roundabout control to the four tiles
and clears their turn and lane restrictions. `removeRoundabout` is refused
unless a compact roundabout stands there, and writes `junctions` back, or
clears the four tiles when it is absent. Bulldozing any corner takes the whole
roundabout out first, and its inverse sends `buildRoundabout` after the road is
laid back. See the [spec](../../specs/roundabouts.md).

**`paintZone`** paints only where a player may: a buildable, road-free tile
with road frontage (a de-zone needs no frontage). A zone can outlive the road
that allowed it, so an inverse that puts zones back sends `restore`, which
skips the frontage test. Without it, undoing the de-zoning of such a tile was
refused and the zone was lost. Only an undo sends it, from `paintZone`'s own
inverse and from `bulldoze`'s.

**`bulldoze`** never funds-gates — it only rejects when every tile is
out-of-bounds. It refunds 50% of whatever stood there (roads, buildings, power
line), captures a player's junction-control override before clearing the road
under it so undo restores both the road and the override together, and always
tries to pull down any power line over the cleared tiles last. On each tile it
takes the road on top. A corridor half it takes brings its partner with it, on
the same layer, and a half at grade whose partner has a road passing over it is
refused (`bulldozeReach` in `src/shared/corridor.ts`, which the bulldoze
preview asks too). Every road its inverse lays back carries each tile's own
`flows` and `elevations`.

**`terraform`** is a brush stroke (`raise`/`lower`/`level`/`smooth`) funds-gated
by its computed kernel cost; its inverse is a `terraformSet` carrying the exact
pre-stroke heights as a `Float32Array`, not a re-solved brush, so undo is
bit-exact. **`terraformSet`** is that same primitive used directly: it applies
given heights with no cost and no kernel, and its own inverse is the heights
it is about to overwrite — which is what lets redo (a `terraformSet` undoing a
`terraformSet`) stay exact indefinitely.

**`createTransitLine`**: the `id` field on the incoming `TransitLine` is
**ignored** — the worker always assigns a fresh one when it creates the line.
The caller learns the real id from the ack's `inverse`
(`[{ kind: 'deleteTransitLine', id: <assigned> }]`), and from the line list in
every later `snapshot.transit`.

**`paintLandfill`** charges only for tiles that are actually new landfill
membership (dragging back over already-painted tiles is free) and additionally
refuses a paint batch that would leave a new, disconnected area smaller than
`LANDFILL_MIN_AREA_TILES` — not too small to _expand_ an existing area, only
too small to _create_ one. **`stringPowerLine`** charges only tiles that would
actually change, the same "redundant drag is free" rule.
