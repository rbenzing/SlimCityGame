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
is the specs' job. Start at the [documentation map](../README.md).

A second surface is documented here for the same reason: `window.__slimcity`,
the dev-only read-back API `src/main.ts` exposes so browser-driven visual
checks can inspect the running game without reimplementing its internals.

## Contents

- [1. Threads and direction](#1-threads-and-direction)
- [2. The worker envelope: `MainToWorker` / `WorkerToMain`](#2-the-worker-envelope-maintoworker--workertomain)
- [3. Commands](#3-commands)
- [4. Turn and junction encoding](#4-turn-and-junction-encoding)
- [5. Road composition](#5-road-composition)
- [6. The world grid and persistence](#6-the-world-grid-and-persistence)
- [7. The simulation snapshot](#7-the-simulation-snapshot)
- [8. Invariants](#8-invariants)
- [9. The dev read-back surface: `window.__slimcity`](#9-the-dev-read-back-surface-windowslimcity)
- [10. Data files as interfaces](#10-data-files-as-interfaces)

## 1. Threads and direction

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

## 2. The worker envelope: `MainToWorker` / `WorkerToMain`

Both unions live in `src/shared/types.ts`. `MainToWorker` is render -> worker
only; `WorkerToMain` is worker -> render only. Neither is ever sent the other
direction.

### `MainToWorker` (8 variants)

| Type           | Fields                                 | Worker behavior                                                                                                                                                                         |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`         | `seed: number`, `map: MapData`         | Must be the first message. Throws if `map.size !== MAP_SIZE`. Ends by posting `ready` then an initial `snapshot`.                                                                       |
| `commands`     | `seq: number`, `commands: Command[]`   | Queued (`pendingBatches`); drained once per tick, or immediately while paused (see [§8](#8-invariants)).                                                                                |
| `setSpeed`     | `speed: SimSpeed` (`0 \| 1 \| 2 \| 4`) | Sets the pacing multiplier the next `pump()` uses (`src/shared/constants.ts` `SPEED_MULTIPLIERS`).                                                                                      |
| `requestField` | `field: FieldId`                       | Answered once with a `field` message copying that scalar layer.                                                                                                                         |
| `requestSave`  | —                                      | Answered once with a `save` message carrying the encoded save `ArrayBuffer`.                                                                                                            |
| `loadSave`     | `data: ArrayBuffer`                    | Throws if `payload.header.version` is `< 1` or greater than this build's `SAVE_VERSION`; otherwise migrates and replaces the whole world (see [§6](#6-the-world-grid-and-persistence)). |
| `select`       | `buildingId: number`                   | Starts a `selection` stream for that building (re-pushed on every later snapshot while held).                                                                                           |
| `clearSelect`  | —                                      | Ends the `selection` stream.                                                                                                                                                            |

Messages other than `init` are ignored until the worker has initialized
(`if (!this.initialized) return;`, `src/sim/worker.entry.ts:460`).

### `WorkerToMain` (7 variants)

| Type        | Fields                               | Cardinality                                                                                                                                                  |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ready`     | —                                    | Exactly once, at the end of `init`.                                                                                                                          |
| `ack`       | `ack: CommandAck`                    | Once per `commands` batch received, in the order the batches were drained.                                                                                   |
| `snapshot`  | `snap: SimSnapshot`                  | Every `SNAPSHOT_TICKS` ticks (`TICK_RATE / SNAPSHOT_HZ` = 2), plus once after `init`/`loadSave`, plus once whenever a command is applied while paused.       |
| `field`     | `field: FieldId`, `data: Uint8Array` | Once per `requestField`.                                                                                                                                     |
| `save`      | `data: ArrayBuffer`                  | Once per `requestSave`.                                                                                                                                      |
| `notify`    | `note: CityNotification`             | Whenever the economy system raises one (unbounded; the UI store caps its own history at 50).                                                                 |
| `selection` | `info: SelectionInfo \| null`        | Once per `select`, then re-sent on every later snapshot while a selection is held; `null` ends the stream (demolition, or an id the registry no longer has). |

## 3. Commands

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

| Kind                   | Key fields                                                                     | Cost                                                    | Inverse                                                                               |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `buildRoad`            | `tier`, `tiles`, `elevation?`, `elevations?`, `profile?`, `replace?`, `flows?` | tier `costPerTile` × changed tiles, plus bridge cost    | `bulldoze` and/or `buildRoad` of what was there, plus any auto-flatten `terraformSet` |
| `defineRoadProfile`    | `id`, `profile`                                                                | 0                                                       | `[]` (not undoable; idempotent instead — see [§5](#5-road-composition))               |
| `setJunctionControl`   | `x`, `z`, `control: JunctionControl \| null`                                   | 0                                                       | same command with the prior control                                                   |
| `setJunctionTurns`     | `x`, `z`, `arm: RoadFlow`, `allowed: number \| null`                           | 0                                                       | same command with the prior `allowed`                                                 |
| `setJunctionLaneTurns` | `x`, `z`, `arm`, `lane`, `allowed: number \| null`                             | 0                                                       | same command with the prior `allowed`                                                 |
| `bulldoze`             | `tiles`                                                                        | negative (50% refund of what stood there)               | rebuilds roads/zones/buildings/junction overrides/power line                          |
| `paintZone`            | `zone`, `tiles`                                                                | 0                                                       | `paintZone` per prior zone group                                                      |
| `placeBuilding`        | `catalogId`, `x`, `z`, `rotation`                                              | catalog `cost`                                          | `bulldoze` of the footprint, plus any auto-flatten                                    |
| `setTaxRate`           | `sector`, `rate` (clamped `0..MAX_TAX_RATE`)                                   | 0                                                       | `[]` (not undoable)                                                                   |
| `setServiceFunding`    | `service`, `funding` (clamped `0..1.5`)                                        | 0                                                       | `[]`                                                                                  |
| `takeLoan`             | `amount`                                                                       | 0 (funds rise; loan is capped, see [§8](#8-invariants)) | `[]`                                                                                  |
| `repayLoan`            | `amount`                                                                       | 0                                                       | `[]`                                                                                  |
| `terraform`            | `mode`, `center`, `radius`, `strength`, `targetHeight?`                        | brush kernel cost                                       | `terraformSet` of the exact pre-edit heights                                          |
| `terraformSet`         | `x`, `z`, `w`, `h`, `heights: Float32Array`                                    | 0 (undo/redo primitive, never funds-gated)              | `terraformSet` of the heights it just overwrote                                       |
| `createTransitLine`    | `line: TransitLine`                                                            | 0                                                       | `deleteTransitLine` with the id the worker assigned                                   |
| `updateTransitLine`    | `line: TransitLine` (matched by `line.id`)                                     | 0                                                       | `updateTransitLine` of the line as it was, or `[]` if the id is unknown (`ok: false`) |
| `deleteTransitLine`    | `id`                                                                           | 0                                                       | `createTransitLine` of the deleted line, or `[]` if the id is unknown (`ok: false`)   |
| `paintDistrict`        | `districtId`, `tiles`                                                          | 0                                                       | `paintDistrict` per prior district-id group                                           |
| `setDistrictPolicy`    | `districtId`, `policy`, `on`                                                   | 0                                                       | same command with `on` negated                                                        |
| `paintLandfill`        | `tiles`, `on`                                                                  | `on` ? new tiles × `LANDFILL_PAINT_COST_PER_TILE` : 0   | `paintLandfill` per turned-on/turned-off group, `on` flipped                          |
| `stringPowerLine`      | `tiles`, `on`                                                                  | `on` ? changed tiles × `POWER_LINE_COST_PER_TILE` : 0   | `stringPowerLine` of the changed tiles, `on` flipped                                  |
| `setSandbox`           | `on`                                                                           | 0                                                       | `[]` (a persistent mode flag, not an undoable edit)                                   |
| `setUnlimitedMoney`    | `on`                                                                           | 0                                                       | `[]`                                                                                  |

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
**not atomic**: `drainCommands` (`src/sim/worker.entry.ts:1450`) applies every
command in the batch regardless of whether an earlier one in the same batch
failed. `ok` is `false` if _any_ command in the batch failed, and `reason`
carries the _first_ failure's reason — but `cost` and `inverse` still
accumulate the effects of every command that individually succeeded. A
three-command batch where the second command is rejected commits the first
and third and reports `ok: false`. Undo/redo, and the road-corridor tool (which
sends a `defineRoadProfile` plus two `buildRoad` commands in one batch), both
rely on this: a partially-successful batch still needs an inverse for the part
that landed.

Undo replays a batch's inverses in the reverse order of the originals: each
command's `result.inverse` is `unshift`ed onto the accumulator
(`src/sim/worker.entry.ts:1466`), so command _N_'s inverse ends up ahead of
command _1_'s. `src/tools/undo.ts`'s `UndoStack` stores the resulting
`ReversibleEdit { label, forward, inverse, cost }` records client-side, capped
at 64 entries; `undo()`/`redo()` hand back `inverse`/`forward` for the caller
to resend as an ordinary (silent) `commands` batch.

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
See [§4](#4-turn-and-junction-encoding) for what the packed values mean.

**`bulldoze`** never funds-gates — it only rejects when every tile is
out-of-bounds. It refunds 50% of whatever stood there (roads, buildings, power
line), captures a player's junction-control override before clearing the road
under it so undo restores both the road and the override together, and always
tries to pull down any power line over the cleared tiles last.

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

## 4. Turn and junction encoding

Right-of-way (`JunctionControl`, `src/shared/types.ts`) is a six-member ladder:
`'none' | 'yield' | 'stop' | 'allWayStop' | 'signal' | 'roundabout'`. The first
five are a strict ladder (`WARRANT_LADDER`, `src/shared/junction.ts:22`), least
restrictive first; `roundabout` sits beside `stop` in restrictiveness because
it is a change of geometry, not a rung on the same ladder.

`GridState.junctionControl` stores a player's override as one byte per tile:
`0` means no override (the warrant decides), and `1..6` index
`CONTROL_BY_CODE` in `src/shared/junction.ts:332` — `codeForControl`/
`controlFromCode` are the only correct way to read or write that byte, since
the array order is fixed by the save format and must never be reordered.

Movements (`Movement`, `src/shared/approach.ts:19`) are a 4-bit set: `Left =
1`, `Through = 2`, `Right = 4`, `UTurn = 8`. Two byte layers pack these bits:

- `GridState.junctionTurns` (`Uint16Array`, one entry per **tile**): four
  nibbles, one per arm, in cardinal-climbing order N=0, E=1, S=2, W=3
  (`armSlot`/`headingIndex`). A `0` nibble means that arm is unrestricted —
  it reads as `DEFAULT_ALLOWED` (`Left | Through | Right`, never `UTurn`) — not
  "no movements": banning every movement isn't something a restriction can
  mean, so `0` is free to mean "as it comes."
- `GridState.junctionLaneTurns` (`Uint16Array`, **`ARMS_PER_TILE` (4) entries
  per tile**, indexed `tileIndex * ARMS_PER_TILE + armSlot`): four nibbles
  _within one arm's entry_, one per lane, lane 0 being the driver's leftmost
  (`MAX_EDITABLE_LANES = 4`). A `0` nibble means that lane takes the set
  `defaultLaneMovements` derives for its position, narrowed by whatever the
  arm itself allows — a lane can only narrow what its arm permits, never grant
  back a movement the arm has banned.

A junction's snapshot entry (`SimSnapshot.junctions[i]`) mirrors both layers
directly: `.turns` is one packed number covering all four arms, and
`.laneTurns`, when present, is an array of the tile's four `ARMS_PER_TILE`
entries. See [§7](#7-the-simulation-snapshot) for when `.laneTurns` is present
at all.

`src/shared/approach.test.ts:196` and `:323` pin the nibble packing;
`src/sim/worker.entry.test.ts:2050` and `:2116` pin the command/undo pairing
for arm and lane restrictions respectively.

## 5. Road composition

A road is a **class** (`RoadClassId`, functional hierarchy), a **profile**
(`RoadProfile`, an ordered cross-section of `LanePiece`s), and — for the 12
built-in tiers — a **preset** (`RoadSpec`, `src/data/roads.json`). `RoadTier`
runs `None = 0` through `Ramp = 12`; a preset's profile id always equals its
tier. Player-composed profiles are numbered from `FIRST_CUSTOM_PROFILE_ID =
13` up (`src/shared/roadprofile.ts:62`), in the save's own table
(`customRoadProfiles`, echoed in full as `SimSnapshot.roadProfiles` whenever
it changes).

```ts
export interface LanePiece {
  kind: LanePieceKind; // 'travel' | 'centreTurn' | 'parking' | 'bike' | ...
  width: number; // metres across the tile
  flow?: LaneFlow; // 'fwd' | 'back' | 'both'; omitted = 'both'
  tram?: boolean; // a travel lane with rails embedded in it
}

export interface RoadProfile {
  class: RoadClassId;
  postedKmh?: number; // omitted = the class default
  pieces: LanePiece[]; // kerb to kerb, in order
  kerbs?: boolean; // omitted = true when the profile has a sidewalk piece
}
```

A profile is validated by `layRefusal` (`src/shared/roadprofile.ts:993`),
which returns `null` when the profile may be laid or a player-facing string
when it may not: every piece kind must be one its class `admits`, the
travel-lane count must sit in the class's `lanes` range, and the profile's
total width must fit one tile (`fitsTile`) or, for the classes wide enough to
need one (`classAdmitsCorridor`), two tiles as a **corridor** (`fitsCorridor`,
`CORRIDOR_METERS = 2 * TILE_METERS`). Two tests in the `roadprofile.test.ts`
suite (lines 836 and 1222) pin the distinct refusal messages this produces:
"too wide" vs. "too many lanes" vs. "too wide for even a corridor".

A corridor is two ordinary `buildRoad` commands, not a new `Command` kind: the
tool splits a drag into a **near** run (the drag itself, carrying the LEFT
half of the cross-section) and a **far** run one tile across
(`corridorRunsFor`, `src/shared/corridor.ts:40`), each stamped with a stored
flow byte that also records which half it is (`CORRIDOR_BIT`,
`CORRIDOR_RIGHT_BIT`, `storedFlow`, `src/shared/types.ts:84-114`). Only a
straight drag gets one — the two halves have to lie beside each other across
the direction of travel for the render/network/approach code to read them as
one road (`corridorPartners`, `src/shared/corridor.ts:90`), and a bend is
refused rather than laid as a row of phantom crossroads.

On load, `adoptCustomProfiles` (`src/shared/roadprofile.ts:81`) renumbers any
custom profile whose id has since been claimed by a new preset tier (the
custom-id floor moves up every time the catalogue gains a tier) and rewrites
the affected tiles in place — idempotent for a table already clear of preset
ids.

## 6. The world grid and persistence

`GridState` (`src/shared/types.ts:197-304`) is the complete mutable world,
owned by the worker; the render thread keeps a read-only mirror rebuilt from
snapshot deltas. Every layer beyond the original set is documented in its own
field comment as **ADDITIVE**: introduced at a specific `SAVE_VERSION`,
serialized _last_, and defaulted to all-zero (or, for `roadElevation`, all-flat)
on an older save. The layers themselves — their types, the version each
arrived at, and what an older save defaults them to — are tabulated in
[data-model.md](data-model.md), which owns the grid schema; that table moves
whenever a layer is added, so it is stated in one place only.

What matters at this boundary is the loading contract.
`deserializeGrid` (`src/world/grid.ts`) accepts any
buffer from version 1 up; `loadSave` throws only for a version _greater_ than
the running build's `SAVE_VERSION` or less than 1 (a save from a newer build
may carry a layer this one cannot read). `serializeGrid` always writes the
current version.

A save file (`SavePayload`, `src/app/persist.ts:49`) is
`[u32 headerLen][headerJSON][u32 gridLen][gridBytes][u32 metaLen][metaJSON]`,
little-endian. `SaveMeta` carries everything besides the raw grid layers:

```ts
export interface SaveMeta {
  registry: SerializedBuildingRegistry;
  stats: CityStats;
  garbage?: GarbageSaveState; // absent in pre-Stage-A saves
  transitLines?: TransitLine[]; // absent before lines persisted: loads with none
  roadProfiles?: { id: number; profile: RoadProfile }[]; // absent before profiles existed: every road is a preset
}
```

`SaveHeader.population`/`.funds` are likewise optional — absent on a save
written before those fields existed, for the load-browser's row summary only;
their absence has no effect on loading the world itself. `header.savedAt` is
always `0` when the worker assembles a save (`encodeSave` never calls
`Date.now`, per the determinism rule); the main thread stamps the real
wall-clock value afterward via `stampSavedAt`, outside the worker's
determinism boundary.

## 7. The simulation snapshot

`SimSnapshot` (`src/shared/types.ts:564-661`) has **15 top-level fields**: one
required (`stats`) and 14 optional channels. Two of the fourteen —
`vehicles` and `transit` — are typed optional but the worker sets them on
_every_ snapshot regardless; the rest are genuinely conditional. `SimSnapshot`
carries deltas only; the full state of everything arrives once, as one giant
patch/delta of each kind, immediately after `init` or `loadSave`.

| Channel         | Present when…                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stats`         | always (required)                                                                                                                                                                                                                               |
| `vehicles`      | always (typed optional, always set — the cosmetic vehicle buffer)                                                                                                                                                                               |
| `transit`       | always (typed optional, always set — line list + ridership)                                                                                                                                                                                     |
| `roads`         | `pendingRoadDeltas` is non-empty: any tile's tier/mask/elevation/profile/flow changed since the last snapshot, or a full resync after `init`/`loadSave`                                                                                         |
| `roadProfiles`  | the custom-profile table changed (`defineRoadProfile`, or a load) — always the _whole_ table, and always sent before `roads` so a delta's `profile` id already resolves                                                                         |
| `buildings`     | any building was added, updated, or removed since the last snapshot                                                                                                                                                                             |
| `zones`         | any tile's zone changed (`paintZone`, or de-zoning by `buildRoad`/`placeBuilding`/`bulldoze`)                                                                                                                                                   |
| `power`         | `grid.power` bytes differ from the previous recompute (full-map patch)                                                                                                                                                                          |
| `watered`       | `grid.watered` bytes differ from the previous recompute (full-map patch)                                                                                                                                                                        |
| `heightPatches` | any terrain heights changed: a `terraform` stroke, a `terraformSet` restore, a building auto-flatten, or a full resync after `loadSave`                                                                                                         |
| `incidents`     | at least one dispatch incident is currently active; when none are, the field is omitted rather than sent as `[]` (the render side defaults it back to `[]` itself on every snapshot, so the distinction carries no behavior on that side today) |
| `districts`     | the district tile layer changed, the district-def list changed, or both — `patches`/`defs` may independently be `[]` when only the other half moved                                                                                             |
| `garbage`       | the landfill membership layer changed (`.landfill`) and/or the garbage tick ran this cadence (`.trash`, `.landfillFill`, `.incinerators` travel together)                                                                                       |
| `powerLines`    | the power-line membership layer changed since the last snapshot                                                                                                                                                                                 |
| `junctions`     | the computed junction list differs from what was last sent — control, warrant, turns, lane turns, or `auto` changed anywhere, or a junction appeared/disappeared; an unchanged city sends this field on _no_ snapshot at all                    |

`junctions[i].laneTurns` is itself conditional a second time: it is present
only when at least one of that junction's four arms has a non-zero packed
lane value — "nearly every junction in the city," per the worker's own
comment, since editing a single lane is rare. `garbage.landfill` and the
`garbage.trash`/`landfillFill`/`incinerators` trio are independent inside the
`garbage` object: a landfill paint stroke alone sends `{ landfill }` with no
trash data, and a garbage tick alone sends the trash trio with no `landfill`
patch.

**Ordering**: the `roadProfiles` -> `roads` order is a stated guarantee (the
type's own doc comment: "the profile table travels with, and is applied
before, the road deltas that refer into it"). The render side's consumption
order for `junctions` before `roads` (`src/main.ts:1074-1076`, "so that when a
drag changes both, the signs are rebuilt once against the new answer") is a
convention of that one consumer, not a guarantee the wire format itself
enforces — nothing stops a different consumer from reading the fields in
either order, since both simply arrive as properties on the same object.

`GraphNode`/`GraphEdge`/`RoadNetworkApi` (`src/shared/types.ts:884-997`) are
part of the same contract layer but are **not** wire types: they are the
internal shape `src/world/roads.ts`'s `RoadNetwork` exposes to other worker
systems (traffic, transit, dispatch, the junction warrant). Their own optional
fields (`GraphNode.control`/`.warranted`/`.turns`/`.laneTurns`;
`GraphEdge.forwardAtoB`/`.lanesAtoB`/`.lanesBtoA`/`.classId`/`.pocketAtoB`/
`.pocketBtoA`/`.narrowsAtA`/`.narrowsAtB`) are each absent exactly on a graph
built before the feature they describe existed, and never cross the
worker/render boundary directly — `SimSnapshot.junctions` is the projection of
`GraphNode` that does.

## 8. Invariants

**Determinism.** Neither `Math.random` nor `Date.now` appears anywhere in
`src/sim/worker.entry.ts` (verified by search, not merely by convention); the
sim's only randomness source is a seeded RNG forked per system
(`src/core/rng.ts`, `createRng(seed).fork(n)`), and its only clock is the
fixed-timestep tick counter. `src/sim/worker.entry.test.ts:1627` and `:1646`
pin this directly: two independently-initialized sims fed the identical
command at the identical tick produce bit-identical terrain heights. The one
wall-clock value in the whole protocol, `SaveHeader.savedAt`, is deliberately
stamped outside the worker (`src/app/persist.ts`'s `stampSavedAt`, called from
the main thread) rather than inside it.

**Command application is tick-independent.** `drainCommands` touches no RNG,
growth, fields, economy, or traffic — which is what makes it safe to run
immediately while the game is paused (speed `0`) rather than waiting for a
`tick()` that will never come (`pumpPaused`, `src/sim/worker.entry.ts:510`).

**Undo/redo is exact, not re-derived.** Every command that mutates continuous
state (terrain height, in particular) returns the _literal_ prior values as
its inverse rather than a command that would plausibly reconstruct them —
`terraformSet`'s inverse is the exact `Float32Array` it is about to overwrite,
not another `terraform` stroke. `src/sim/worker.entry.test.ts:1553`, `:1592`,
and `:1184` pin exact-height undo for a road build, a building footprint
flatten, and a terraform stroke respectively.

**Batch application is not atomic.** See [§3](#3-commands): a rejected command
does not roll back the commands before or after it in the same batch. This is
by design (a corridor's `defineRoadProfile` + two `buildRoad` commands ride in
one batch) and is enforced by no test beyond the ordinary command-handler
tests — it falls out of `drainCommands`'s loop having no early exit, which is
a convention rather than an explicitly pinned contract.

**Idempotency** is explicit and local to each command, not a blanket rule:
`defineRoadProfile` acks success with no state change for an identical
redefinition; `paintLandfill`/`stringPowerLine` charge nothing for tiles that
already have the requested membership; `setJunctionControl`/`setJunctionTurns`/
`setJunctionLaneTurns` are no-ops when the new value equals the stored one.
Commands with no such rule (`buildRoad` re-laying the same tier over itself
without a profile/flow change, for instance) are ordinary no-ops by virtue of
`changedCount === 0`, not a documented idempotency guarantee.

**Type-level contracts** (the selection protocol, `ToolFlags`, `CursorChip`,
`LensId`) are pinned by `npx tsc --noEmit` over `src/shared/contracts.test.ts`
itself, per that file's own header comment — vitest transpiles the file
without type-checking it, so the `@ts-expect-error` assertions inside it are
only meaningful under a separate type-check pass.

## 9. The dev read-back surface: `window.__slimcity`

`src/main.ts` attaches a plain object to `window.__slimcity` behind an
`import.meta.env.DEV` guard (two separate blocks: `src/main.ts:308-664`
declares most of it; `src/main.ts:818-826` adds `screenToTile` and `audio`
once they exist). **This is a test surface, not a product feature** — it is
stripped from production builds by the `DEV` guard, and every browser-driven
visual check (`tools/*-shots.mjs`) drives the game through it instead of
simulating real input.

| Member                | Signature                                            | What it returns                                                                                                                                                   |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map`                 | —                                                    | the loaded `MapData`                                                                                                                                              |
| `setDayT`             | `(t: number \| null) => void`                        | pins the day/night phase 0..1 for a screenshot; `null` returns to clock-driven                                                                                    |
| `setCamera`           | `(targetX, targetZ, distance, yaw?, pitch?) => void` | frames the camera deterministically; omitted `yaw`/`pitch` keep the current angle                                                                                 |
| `setTool`             | `(tool: ToolId) => void`                             | selects a tool via the store                                                                                                                                      |
| `setSpeed`            | `(speed: 0\|1\|2\|4) => void`                        | sets sim speed via the store                                                                                                                                      |
| `getStats`            | `() => CityStats`                                    | the store's live stats                                                                                                                                            |
| `setOverlay`          | `(overlay: LensId \| null) => void`                  | sets the infoview lens via the store                                                                                                                              |
| `cmd`                 | `(label: string, commands: Command[]) => void`       | sends commands through the same path a tool commit uses (funds/milestone/placement all enforced)                                                                  |
| `tileMeters`          | `() => number`                                       | `TILE_METERS`, so a harness never hardcodes the tile size                                                                                                         |
| `readGrid`            | `() => {...}`                                        | flattened arrays of the client grid mirror: `roadTier`, `roadProfile`, `roadFlow`, `roadElevation`, `buildingId`, `zone`, `water`, `height`, `power`, `powerLine` |
| `readTransit`         | `() => { lines, ridership }`                         | the store's live transit line list + ridership                                                                                                                    |
| `readEmptyDraws`      | `() => { name, vertices, instances }[]`              | every currently-visible mesh that would submit an empty draw call                                                                                                 |
| `readKit`             | `() => Record<string, number>`                       | instance counts per industrial-building kit part                                                                                                                  |
| `readKitIds`          | `() => number[]`                                     | building ids the kit currently tracks parts for                                                                                                                   |
| `readParking`         | `(buildingId) => {...} \| null`                      | stall count, category, and the tier of the tile north of the building's origin                                                                                    |
| `readKerbAudit`       | `() => {...}`                                        | cross-checks parked cars/lamps/pedestrian paths against the live grid, independent of the placement code that positioned them                                     |
| `readLampPoles`       | `() => { x, z }[]`                                   | every lamp pole's world position                                                                                                                                  |
| `readPowerPoles`      | `() => { x, z }[]`                                   | every power-line pole's world position                                                                                                                            |
| `readJunctions`       | `() => { x, z, control, turns }[]`                   | junctions the render side currently knows about                                                                                                                   |
| `readApproach`        | `(x, z) => {...} \| null`                            | the junction a tile approaches and its cross-section there (lanes, width, pocket, taper, auxiliary lane)                                                          |
| `readDrawn`           | `(x, z) => {...} \| null`                            | the same question put to the **mesh** instead of the grid — the two can disagree                                                                                  |
| `readSigns`           | `() => { x, z, type }[]`                             | placed traffic signs                                                                                                                                              |
| `readSignalAspects`   | `() => string[]`                                     | what each signal head is currently showing                                                                                                                        |
| `readCabinets`        | `() => { x, z, kind }[]`                             | kerbside utility cabinet placements                                                                                                                               |
| `readFurnitureCounts` | `() => Record<string, number>`                       | counts per kerb-furniture kind                                                                                                                                    |
| `readTransitRender`   | `() => { lines, stops, vehicles }`                   | what the transit renderer actually built                                                                                                                          |
| `readBuildings`       | `() => {...}[]`                                      | every known building instance: id, catalogId, position, state, problem bits                                                                                       |
| `screenToTile`        | `(sx, sy) => TilePoint \| null`                      | pixel-to-tile picking, for aiming a tool without dead-reckoning the camera projection                                                                             |
| `audio`               | `{ engine, music }`                                  | the live audio engine/music-player instances, for a real-browser check (jsdom has no WebAudio)                                                                    |

## 10. Data files as interfaces

Both catalogue files are static JSON, imported directly by whichever module
needs them (`import catalogData from '../data/catalog.json'`) rather than sent
over any message channel. The worker and the render/UI code each hold their
own copy of the same bundled module; nothing at runtime verifies the two
copies match beyond both having been built from the same source file.

**`src/data/catalog.json`** is `{ buildings: BuildingCatalogEntry[] }`
(`src/shared/types.ts:728-759`). Read directly by `src/sim/worker.entry.ts`
(as `CATALOG`, the authoritative building data — cost, footprint, occupancy,
service/utility/garbage specs, `unlockMilestone`) and by
`src/ui/categories.ts`/`src/ui/InfoPanel.tsx` (for the build-menu categories
and info-panel display) and several render modules' tests. `zone`/`level` are
present only on zone-grown entries; `service`/`utility`/`garbage` are present
only on the ploppables that carry that role; `requiresAdjacent` is present
only on `rail-station` (the one entry gated by track adjacency rather than
plain buildability).

**`src/data/roads.json`** is `{ classes: RoadClassSpec[], specs: RoadSpec[] }`
(`src/shared/types.ts:821-868`). `classes` holds the 12 `RoadClassId` entries
(`dirt` through `rail`); `specs` holds the 12 built-in tiers (`RoadTier` 1
through 12), each an `RoadSpec` whose `profile` field is the `RoadProfile` the
tier is shorthand for — `tierForProfile`/`presetProfileForTier`
(`src/shared/roadprofile.ts`) are the two directions of that mapping. The
worker reads it directly as `ROAD_SPECS`; `roadprofile.ts` reads it directly
too, as `ROAD_CLASSES`/`ROAD_PRESETS` — the derivations every other module
consumes instead of the raw JSON, including `src/sim/network.ts`,
`src/render/parked.ts`, and `src/ui/categories.ts`. `RoadSpec`'s additive
fields
(`noiseMult`, `oneWay`, `carriesWater`, `surface`, `roadsideParking`) are each
documented inline with their own default, applied by whichever module reads a
`RoadSpec` without that field present — never re-defaulted a second time
elsewhere.
