# 4. Turn and junction encoding

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
entries. See [§7](7-the-simulation-snapshot.md) for when `.laneTurns` is present
at all.

`src/shared/approach.test.ts:196` and `:323` pin the nibble packing;
`tests/interaction/junctions.test.ts` pins the command/undo pairing for arm
and lane restrictions ("takes a turn away from one arm and gives it back on
undo", "sets one lane of one arm, and gives it back on undo").
