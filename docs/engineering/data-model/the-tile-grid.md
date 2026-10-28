# The tile grid

The map is `MAP_SIZE = 256` tiles per side (65,536 tiles), each
`TILE_METERS = 20` metres square — a 5.12 km by 5.12 km city. Both constants
live in `src/shared/constants.ts`. `src/world/grid.ts` defines `GridState`
(re-exported from `src/shared/types.ts`) and is the only place that allocates
it (`createGrid`), serializes it (`serializeGrid`), and reads it back
(`deserializeGrid`).

Every layer below is a `MAP_SIZE * MAP_SIZE`-length typed array (or, for
`junctionLaneTurns`, four such lengths — see its row). "Persisted" means the
byte-for-byte array survives `serializeGrid`/`deserializeGrid`; a version
number in that column is the `SAVE_VERSION` the layer first appears in — an
older save loads it at its default. A `*` marks a layer whose bytes are
written and read back like any other, but are then immediately overwritten by
the simulation before they're ever consulted — see
[What survives a save, and what doesn't](#what-survives-a-save-and-what-doesnt).
A **†** marks a road layer: saved on the tiles up to v12, and from v13 derived
from the road network saved after the tiles — see
[The road network](entities-beyond-the-grid.md#the-road-network).

| Layer               | Type                                                            | Meaning                                                                                                                                  | Persisted                                                             | Default                                   |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `height`            | `Float32Array`                                                  | Metres above sea level; negative is below sea level.                                                                                     | v1                                                                    | `0`                                       |
| `water`             | `Uint8Array`                                                    | `1` = water tile (unbuildable).                                                                                                          | v1                                                                    | `0`                                       |
| `trees`             | `Uint8Array`                                                    | `0..255` tree density; cosmetic, clearable.                                                                                              | v1                                                                    | `0`                                       |
| `zone`              | `Uint8Array`                                                    | `ZoneType` (below).                                                                                                                      | v1                                                                    | `0` (`None`)                              |
| `roadTier` †        | `Uint8Array`                                                    | `RoadTier` (below), the nearest preset to the tile's `roadProfile`.                                                                      | v1                                                                    | `0` (`None`)                              |
| `roadMask` †        | `Uint8Array`                                                    | 4-bit neighbor bitmask: `+N=1 +E=2 +S=4 +W=8`. Derived: loading recomputes it from the tiles around it.                                  | v1                                                                    | `0`                                       |
| `buildingId`        | `Uint32Array`                                                   | `0` = none, else the `BuildingInstance.id` occupying the tile.                                                                           | v1                                                                    | `0`                                       |
| `power` *           | `Uint8Array`                                                    | `1` = powered.                                                                                                                           | v1                                                                    | `0`                                       |
| `watered` *         | `Uint8Array`                                                    | `1` = water service reaches the tile.                                                                                                    | v1                                                                    | `0`                                       |
| `fields[0..8]`      | `Uint8Array` x9                                                 | The first 9 scalar fields, `FieldId` order — see [Scalar fields](the-scalar-fields.md).                                                    | v1                                                                    | `0`                                       |
| `fields[9..11]`     | `Uint8Array` x3                                                 | Middle, high and college education coverage. In memory beside the others; saved **last**, after `waterPipe` — see the v16 row below.    | v16                                                                   | `0` (no coverage)                         |
| `district`          | `Uint8Array`                                                    | District id, `0` (unassigned) or `1..255` — see [Districts](entities-beyond-the-grid.md#districts--policies).                                                       | v2                                                                    | `0`                                       |
| `landfill`          | `Uint8Array`                                                    | `1` = landfill area tile that collected trash piles up on.                                                                               | v3                                                                    | `0`                                       |
| `roadElevation` †   | `Float32Array`                                                  | Deck height in metres above this tile's terrain; `0` = at grade.                                                                         | v4 (v4 stored it as one byte, whole metres; widened to a float in v5) | `0`                                       |
| `roadProfile` †     | `Uint16Array`                                                   | Road composition id: `0` = no road, `1..12` a preset (equals its tier), `13+` player-composed — see [Road profiles](entities-beyond-the-grid.md#road-profiles).     | v6                                                                    | derived from `roadTier`                   |
| `roadFlow` †        | `Uint8Array`                                                    | Low 3 bits: `RoadFlow` (below). Bit 3: corridor-half flag. Bit 4: which half.                                                            | v7                                                                    | `0` (`None`)                              |
| `junctionControl`   | `Uint8Array`                                                    | Player's control override: `0` = none (the warrant decides), `1..6` a code — see [Junctions](entities-beyond-the-grid.md#junctions).                                | v8                                                                    | `0`                                       |
| `junctionTurns`     | `Uint16Array`                                                   | Turn restrictions, one nibble per arm (N/E/S/W), a `MovementSet` bitmask each.                                                           | v9                                                                    | `0` (unrestricted)                        |
| `powerLine`         | `Uint8Array`                                                    | `1` = a power line stands on this tile.                                                                                                  | v10                                                                   | `0`                                       |
| `waterPipe`         | `Uint8Array`                                                    | `1` = a water pipe is laid under this tile; it carries water and sewage.                                                                 | v14                                                                   | `0`                                       |
| `sewered` *         | `Uint8Array`                                                    | `1` = a drain's reach covers the tile. Derived on every utility pass.                                                                    | never — recomputed every utility pass                                 | `0`                                       |
| `waterFoul` *       | `Uint8Array`                                                    | `0..255` on a water tile: how fouled the water is, from the drains' and works' discharge spread along connected water. `0` on land.      | never — recomputed every utility pass                                 | `0`                                       |
| `junctionLaneTurns` | `Uint16Array`, length `n * ARMS_PER_TILE` (`ARMS_PER_TILE = 4`) | Per-lane turn restrictions: one packed entry per arm, four lanes at a nibble apiece.                                                     | v11                                                                   | `0` (each lane takes its derived default) |
| `overTier` †        | `Uint8Array`                                                    | The tier of the road passing over this tile's road; `0` everywhere but a crossing tile. See [overpasses.md](../../world-sim/overpasses.md). | v12                                                                   | `0` (no overpass)                         |
| `overProfile` †     | `Uint16Array`                                                   | That road's profile id.                                                                                                                  | v12                                                                   | `0`                                       |
| `overFlow` †        | `Uint8Array`                                                    | That road's stored flow byte.                                                                                                            | v12                                                                   | `0`                                       |
| `overElevation` †   | `Float32Array`                                                  | That road's deck height, metres above terrain.                                                                                           | v12                                                                   | `0`                                       |
| `roadFootprint`     | `Uint8Array`                                                    | `1` where a road off the grid covers the tile, footways included. Derived from the road network (`deriveRoadFootprint`).                 | never — recomputed after every load and road command                  | `0`                                       |
| `roadSeparate`      | `Uint8Array`                                                    | Arms of this tile's road held apart from the road beside it, as mask bits. Derived from the network (`deriveRoadLayers`).                | never — recomputed after every load and road command                  | `0`                                       |

`ZoneType`, `RoadTier` and `RoadFlow` are plain numeric enums in
`src/shared/types.ts`. Values are never reordered or reused once shipped —
they're the byte identity a save reads back:

| `ZoneType`     | Value | `RoadTier`  | Value | `RoadFlow` | Value |
| -------------- | ----- | ----------- | ----- | ---------- | ----- |
| `None`         | 0     | `None`      | 0     | `None`     | 0     |
| `ResLow`       | 1     | `TwoLane`   | 1     | `North`    | 1     |
| `ResHigh`      | 2     | `Avenue`    | 2     | `East`     | 2     |
| `ComLow`       | 3     | `Highway`   | 3     | `South`    | 3     |
| `ComHigh`      | 4     | `Gravel`    | 4     | `West`     | 4     |
| `Industrial`   | 5     | `Alley`     | 5     |            |       |
| `ResMediumRow` | 6     | `OneWay`    | 6     |            |       |
| `ResMedium`    | 7     | `FourLane`  | 7     |            |       |
| `Mixed`        | 8     | `BusLane`   | 8     |            |       |
| `Agriculture`  | 9     | `BikeLane`  | 9     |            |       |
| `IndHeavy`     | 10    | `Tram`      | 10    |            |       |
|                |       | `RailTrack` | 11    |            |       |
|                |       | `Ramp`      | 12    |            |       |

`junctionControl` codes (`CONTROL_BY_CODE` in `src/shared/junction.ts`): `0`
no override, `1` none (forced uncontrolled), `2` yield, `3` stop, `4`
all-way stop, `5` signal, `6` roundabout.

### What survives a save, and what doesn't

Every `GridState` layer above round-trips through a save — the road layers (†)
by way of the road network they are derived from — and there is no
runtime-only layer inside the grid itself. But two of those layers, plus
one of the nine scalar fields, are written and read back only to be discarded
within a tick or two of loading, because they're pure derived caches rather
than sources of truth:

- `power` and `watered` are recomputed from scratch by
  `recomputeUtilities` (`src/sim/network.ts`), a pure function of the grid
  and the building registry. It runs after every load and on essentially
  every tick, so whatever a save happened to hold is overwritten before
  anything reads it.
- The `Traffic` scalar field (`fields[3]`) is zeroed and rebuilt wholesale by
  `FieldSim.applyTraffic` (`src/sim/fields.ts`) from the road network's
  current edge volumes, on the same cadence as its own diffusion slot (every
  4 ticks). A reloaded city's traffic reads whatever the first assignment
  cycle computes, never what was saved.

Runtime state that isn't part of `GridState` at all, and so never reaches a
save buffer, is covered layer by layer in
[Entities beyond the grid](entities-beyond-the-grid.md).
