# Data model and schema

SlimCity's world is a flat grid of typed arrays — one array per layer,
`MAP_SIZE * MAP_SIZE` entries each, no per-tile objects. A save is those
arrays serialized behind a version number, plus a small JSON envelope for
everything that isn't a grid layer. This document is the shape of that data:
every layer's type, meaning and default, the save format's byte layout and
version history, the tables that live alongside the grid, and the JSON data
files that seed the catalogue. For what the simulation _does_ with any of
this, see the specs (start at the [documentation map](../README.md)); this document only says what the data IS.

## The tile grid

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

| Layer               | Type                                                            | Meaning                                                                                                                              | Persisted                                                             | Default                                   |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------- |
| `height`            | `Float32Array`                                                  | Metres above sea level; negative is below sea level.                                                                                 | v1                                                                    | `0`                                       |
| `water`             | `Uint8Array`                                                    | `1` = water tile (unbuildable).                                                                                                      | v1                                                                    | `0`                                       |
| `trees`             | `Uint8Array`                                                    | `0..255` tree density; cosmetic, clearable.                                                                                          | v1                                                                    | `0`                                       |
| `zone`              | `Uint8Array`                                                    | `ZoneType` (below).                                                                                                                  | v1                                                                    | `0` (`None`)                              |
| `roadTier`          | `Uint8Array`                                                    | `RoadTier` (below), the nearest preset to the tile's `roadProfile`.                                                                  | v1                                                                    | `0` (`None`)                              |
| `roadMask`          | `Uint8Array`                                                    | 4-bit neighbor bitmask: `+N=1 +E=2 +S=4 +W=8`.                                                                                       | v1                                                                    | `0`                                       |
| `buildingId`        | `Uint32Array`                                                   | `0` = none, else the `BuildingInstance.id` occupying the tile.                                                                       | v1                                                                    | `0`                                       |
| `power` *           | `Uint8Array`                                                    | `1` = powered.                                                                                                                       | v1                                                                    | `0`                                       |
| `watered` *         | `Uint8Array`                                                    | `1` = water service reaches the tile.                                                                                                | v1                                                                    | `0`                                       |
| `fields[0..8]`      | `Uint8Array` x9                                                 | The 9 scalar fields, `FieldId` order — see [Scalar fields](#the-scalar-fields).                                                      | v1                                                                    | `0`                                       |
| `district`          | `Uint8Array`                                                    | District id, `0` (unassigned) or `1..255` — see [Districts](#districts--policies).                                                   | v2                                                                    | `0`                                       |
| `landfill`          | `Uint8Array`                                                    | `1` = landfill area tile that collected trash piles up on.                                                                           | v3                                                                    | `0`                                       |
| `roadElevation`     | `Float32Array`                                                  | Deck height in metres above this tile's terrain; `0` = at grade.                                                                     | v4 (v4 stored it as one byte, whole metres; widened to a float in v5) | `0`                                       |
| `roadProfile`       | `Uint16Array`                                                   | Road composition id: `0` = no road, `1..12` a preset (equals its tier), `13+` player-composed — see [Road profiles](#road-profiles). | v6                                                                    | derived from `roadTier`                   |
| `roadFlow`          | `Uint8Array`                                                    | Low 3 bits: `RoadFlow` (below). Bit 3: corridor-half flag. Bit 4: which half.                                                        | v7                                                                    | `0` (`None`)                              |
| `junctionControl`   | `Uint8Array`                                                    | Player's control override: `0` = none (the warrant decides), `1..6` a code — see [Junctions](#junctions).                            | v8                                                                    | `0`                                       |
| `junctionTurns`     | `Uint16Array`                                                   | Turn restrictions, one nibble per arm (N/E/S/W), a `MovementSet` bitmask each.                                                       | v9                                                                    | `0` (unrestricted)                        |
| `powerLine`         | `Uint8Array`                                                    | `1` = a power line stands on this tile.                                                                                              | v10                                                                   | `0`                                       |
| `junctionLaneTurns` | `Uint16Array`, length `n * ARMS_PER_TILE` (`ARMS_PER_TILE = 4`) | Per-lane turn restrictions: one packed entry per arm, four lanes at a nibble apiece.                                                 | v11                                                                   | `0` (each lane takes its derived default) |

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
|                |       | `BikeLane`  | 9     |            |       |
|                |       | `Tram`      | 10    |            |       |
|                |       | `RailTrack` | 11    |            |       |
|                |       | `Ramp`      | 12    |            |       |

`junctionControl` codes (`CONTROL_BY_CODE` in `src/shared/junction.ts`): `0`
no override, `1` none (forced uncontrolled), `2` yield, `3` stop, `4`
all-way stop, `5` signal, `6` roundabout.

### What survives a save, and what doesn't

Every `GridState` layer above round-trips through `serializeGrid` — there is
no runtime-only layer inside the grid itself. But two of those layers, plus
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
[Entities beyond the grid](#entities-beyond-the-grid).

## The save format

A save is a `SavePayload` (`src/app/persist.ts`): a JSON header, the grid
buffer, and a JSON metadata blob, concatenated with little-endian `u32`
length prefixes:

```
[u32 headerLen][headerJson][u32 gridLen][gridBytes][u32 metaLen][metaJson]
```

`encodeSave`/`decodeSave` are the pure codec; nothing about them is
browser-specific, so they're unit-testable without IndexedDB.

**Header** (`SaveHeader`): `version`, `seed`, `tick`, `mapName`, `savedAt`
(epoch ms, stamped by the main thread — the worker never calls `Date.now`,
to keep the sim deterministic), plus optional `population`/`funds` for the
load-browser's list rows (absent on saves written before that existed).

**Grid** (`gridBytes`): the `serializeGrid` output — an 8-byte header
(`u32` version, `u32` size) followed by every layer in the table above, in
that order, each tile taking a fixed number of bytes for that version.

**Meta** (`SaveMeta`): everything else that isn't a grid layer —
`registry` (the building table), `stats` (`CityStats`), and three optional
blocks defaulted on saves written before they existed: `garbage`
(landfill + incinerator fill), `transitLines` (player-built lines), and
`roadProfiles` (player-composed road cross-sections). Each is covered in
[Entities beyond the grid](#entities-beyond-the-grid).

### Save version and per-tile width

The current `SAVE_VERSION` is **11** (`src/shared/types.ts`), and the
current per-tile width is **45 bytes** (`BYTES_PER_TILE` in
`src/world/grid.ts`). The width for every version is exported as
`BYTES_PER_TILE_BY_VERSION` (`src/world/grid.ts`) — a single array, indexed
by version number, that both `deserializeGrid` and the grid migration tests
read rather than each keeping its own count. Reproduced exactly:

| `SAVE_VERSION` | Bytes/tile | Adds                                                                                                              |
| -------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| 1              | 24         | The base layers: height, water, trees, zone, roadTier, roadMask, buildingId, power, watered, the 9 scalar fields. |
| 2              | 25         | `district` (+1 byte).                                                                                             |
| 3              | 26         | `landfill` (+1 byte).                                                                                             |
| 4              | 27         | `roadElevation`, stored as one unsigned byte — whole metres only (+1 byte).                                       |
| 5              | 30         | `roadElevation` widened to a `Float32` (+3 bytes over v4).                                                        |
| 6              | 32         | `roadProfile`, a `Uint16` (+2 bytes).                                                                             |
| 7              | 33         | `roadFlow` (+1 byte).                                                                                             |
| 8              | 34         | `junctionControl` (+1 byte).                                                                                      |
| 9              | 36         | `junctionTurns`, a `Uint16` (+2 bytes).                                                                           |
| 10             | 37         | `powerLine` (+1 byte).                                                                                            |
| 11 (current)   | 45         | `junctionLaneTurns`, 4 arms x `Uint16` (+8 bytes).                                                                |

Every new layer is appended as the last thing `serializeGrid` writes, in
version order. That's the load-bearing pattern the whole format leans on: an
older save's tile record is exactly a byte-for-byte prefix of what the
current format writes, just missing the layers added after it was saved.
`deserializeGrid` reads the version out of the header, looks up its width in
`BYTES_PER_TILE_BY_VERSION`, and for each layer added after that version
substitutes the default from the table above instead of reading bytes that
were never there. Nothing about an old layer's position or width ever
changes once a newer layer is appended after it, so a v1 save's `height`
bytes sit at the same offset whether it's read back by the code that wrote
it or by the current build. A save from a **newer** build than the running
one is refused outright (`version > SAVE_VERSION`); only "older" is ever
migrated. `deserializeGrid` also refuses a buffer whose total length doesn't
match `size` and the version's own bytes/tile, which catches truncation
before it's misread as valid data.

### Road profile ids and the moving preset boundary

`roadProfile` values `1..12` are presets — one per `RoadTier` other than
`None` — and always equal that tier's number; the boundary,
`FIRST_CUSTOM_PROFILE_ID` (`src/shared/roadprofile.ts`), is **13**. That
boundary is not fixed: it sits one past however many tiers the catalogue
currently defines, so it has moved up every time a tier was added (it will
move again if one more is). A save written before a tier existed may
already have handed a player-composed profile the id that tier claims today.
`adoptCustomProfiles`, run on load, renumbers any such profile out of the
way and rewrites the grid tiles that referred to it — the one non-append-only
migration step in the format, because it's a value remap rather than a
trailing default.

### Compression, storage, autosave

There is no compression anywhere in the save path — `SavePayload` is
concatenated raw bytes, and the grid buffer inside it is uncompressed typed
arrays. Storage is IndexedDB (`src/app/persist.ts`): database `'slimcity'`,
object store `'saves'` (auto-incrementing `id`, indexed on `savedAt`). Up to
`MAX_STORED_SAVES = 10` slots are kept; `storeSave` prunes the oldest beyond
that on every save. `listSaves`/`getSaveById`/`deleteSave` back a save-slot
picker; `storageAvailable()` reports `false` (rather than throwing) where
`indexedDB` doesn't exist — a private window or a blocked site-data setting —
so the game still runs, it just can't remember.

`AutoSaver` (`src/app/persist.ts`) fires every
`AUTOSAVE_INTERVAL_TICKS = 2 * TICKS_PER_MONTH` of observed snapshot-tick
advance — `TICKS_PER_MONTH` is `TICKS_PER_DAY (200) * DAYS_PER_MONTH (30)`,
so 12,000 ticks, two in-sim months at the sim's fixed 20 ticks/second. The
first tick it observes only sets a baseline; it never saves a brand-new or
just-loaded city on that first observation.

There is no export or import path in the codebase — no file download, no
file picker, no serialization format other than the IndexedDB record above.
A save exists only inside the browser profile that made it. Session intent
("go straight to gameplay on the next load") lives separately in
`sessionStorage` (`slimcity.session`), and user settings (audio, bloom,
sandbox toggles) in `localStorage` (`slimcity.settings`) — neither is part
of a save record, and neither is versioned or migrated the way saves are.

## Entities beyond the grid

### Buildings

`BuildingInstance` (`src/shared/types.ts`), owned by `BuildingRegistry`
(`src/sim/buildings.ts`): `id`, `catalogId`, `x`/`z` (origin tile),
`rotation`, `level`, `state` (`Constructing` / `Active` / `Abandoned`), and
`problems` (a `Problem` bit-flag mask). An id is assigned by an
auto-incrementing `nextId` starting at 1 and is never reused within a
session; `nextId` itself is part of `SerializedBuildingRegistry`, so ids stay
unique across a save/load too. `BuildingRegistry.place` stamps the building's
rotated footprint into `GridState.buildingId`; `SerializedBuildingInstance`
additionally carries the stamped footprint's `w`/`d` so `remove` can clear
exactly those tiles on a reload without re-deriving rotation from the
catalog.

Growth's per-building construction countdown is **not** part of
`BuildingInstance` and is **not** serialized. On load, every building still
`Constructing` is force-promoted to `Active` so nothing is left permanently
mid-construction.

### Road, rail and tram networks

`GraphNode`/`GraphEdge` (`src/shared/types.ts`), built by `RoadNetwork`
(`src/world/roads.ts`). These are **not** persisted directly — `rebuild(grid)`
derives the whole graph from the grid's `roadTier`/`roadProfile`/`roadFlow`
layers (plus `junctionControl`/`junctionTurns` for each node's control and
turn state) every time the grid changes, including once after every load.
Node and edge ids are assigned fresh on each rebuild, so they carry no
identity across rebuilds — only the grid tiles they're derived from do. A
separate `RoadNetwork` instance (with its own node/edge id space) exists for
the street graph, the rail graph, and the tram graph.

### Junctions

A junction's stored state is only the player's override
(`GridState.junctionControl`) and any turn restrictions
(`GridState.junctionTurns`, `GridState.junctionLaneTurns`) — all three are
grid layers, covered in [The tile grid](#the-tile-grid). The warrant's own
verdict for a junction, and the resolved per-node `control`/`turns` mirrors
on `GraphNode`, are recomputed by `RoadNetwork.refreshControls()` on every
rebuild; they are derived from the grid bytes, not stored independently of
them.

### Districts & policies

`District` (`id` 1..255, `name`, `color`) and `Policy`
(`'lowTax' | 'highTax' | 'noHeavyTraffic' | 'greenEnergy'`), both in
`src/shared/types.ts`. Only the per-tile membership (`GridState.district`)
persists. The district **definitions** (name, color) and every enabled
policy are session-only: `PolicyStore` and the district-def registry are
rebuilt empty on load, and `ensureDistrictDef` (`src/sim/worker.entry.ts`)
auto-creates a default-named, palette-colored def the moment a persisted
district id is first seen walking the loaded tile layer. A save/load
round-trip always loses a player's custom district names and colors, and
every policy toggle they had enabled.

### Transit lines

`TransitLine` (`id`, `stops: TilePoint[]`, `color`, optional `mode`, all in
`src/shared/types.ts`) — **does** persist, in `SaveMeta.transitLines`,
restored by `TransitSystem.restore()`. An id is assigned by an
auto-incrementing counter starting at 1; on `restore`, the counter resumes
past the highest id in the restored lines rather than being itself
serialized, so a line created after loading can never collide with one that
came out of the save. Per-line ridership statistics do **not** persist —
they reset to empty and are recomputed by the transit tick.

### Road profiles

`RoadProfile` (`class`, `pieces: LanePiece[]`, optional `postedKmh`/`kerbs`,
`src/shared/types.ts`). Preset profiles (ids `1..12`) are catalogue data
from `roads.json`'s `specs[].profile` and are never serialized. Only
player-composed profiles (ids `13+`) are serialized, in
`SaveMeta.roadProfiles` as `{ id, profile }` pairs, and re-adopted into a
fresh `Map` on load via `adoptCustomProfiles` (see
[Road profile ids and the moving preset boundary](#road-profile-ids-and-the-moving-preset-boundary)).

### Garbage

`GarbageSaveState` (`landfillStored: number`, `incinerators: { id, units }[]`,
`src/sim/garbage.ts`) persists in `SaveMeta.garbage`. The per-tile
uncollected-trash layer (`GarbageSystem.trash`) and the cosmetic garbage
trucks are **not** persisted; both rebuild within a few ticks of a load.

### Vehicles and incidents

The cosmetic vehicle buffer (`SimSnapshot.vehicles`, a fixed
`Float32Array` of `MAX_VEHICLES (1024) * VEHICLE_STRIDE (5)` slots — `[x, z,
headingRad, speed, kind]` per slot) and service-dispatch `Incident`s are
transient render/gameplay dressing. Neither is part of `GridState` or
`SaveMeta`; both are rebuilt or simply absent after a load, and
`DispatchSystem` itself is recreated fresh.

### City stats

`CityStats` (funds, population, jobs, demand, tax rates, service funding,
etc., `src/shared/types.ts`) persists wholesale in `SaveMeta.stats`.

## The data files

### `src/data/catalog.json`

Shape: `{ buildings: BuildingCatalogEntry[] }` (34 entries). Read directly
by `src/main.ts`, `src/sim/worker.entry.ts`, and `src/ui/categories.ts`. The
schema is `BuildingCatalogEntry` in `src/shared/types.ts`:

| Field              | Required | Meaning                                                                           |
| ------------------ | -------- | --------------------------------------------------------------------------------- |
| `id`               | yes      | Catalogue key.                                                                    |
| `name`             | yes      | Display name.                                                                     |
| `category`         | yes      | `'res' \| 'com' \| 'ind' \| 'service' \| 'utility' \| 'park' \| 'transit'`.       |
| `zone`             | no       | `ZoneType`; set for zone-grown buildings, absent for ploppables.                  |
| `level`            | no       | `1..3` for grown buildings.                                                       |
| `footprint`        | yes      | `{ w, d }` in tiles.                                                              |
| `height`           | yes      | Metres, for the box mesh.                                                         |
| `color`            | yes      | Packed hex RGB.                                                                   |
| `residents`        | no       | Population added when active.                                                     |
| `jobs`             | no       | Jobs added when active.                                                           |
| `powerUse`         | yes      | MW.                                                                               |
| `waterUse`         | yes      | kL.                                                                               |
| `pollution`        | no       | `0..255` emitted at source into the Pollution field.                              |
| `noise`            | no       | `0..255` emitted at source into the Noise field.                                  |
| `landValueBonus`   | no       | `0..255` emitted into the LandValue field.                                        |
| `service`          | no       | `{ kind, strength: 0..255, range }` — a service building's spec.                  |
| `utility`          | no       | `{ powerMW?, waterKL? }` produced.                                                |
| `garbage`          | no       | `{ collectionRange, bufferCapacity, burnRate, trucks }` — the incinerator's spec. |
| `cost`             | yes      | `0` for grown buildings, plopping cost otherwise.                                 |
| `upkeep`           | yes      | Per month.                                                                        |
| `unlockMilestone`  | yes      | Index into `MILESTONES` (`src/shared/constants.ts`) required to build.            |
| `requiresAdjacent` | no       | Currently only `'rail'` — the footprint must touch that transport tier.           |

### `src/data/roads.json`

Shape: `{ classes: RoadClassSpec[], specs: RoadSpec[] }` (12 of each). Read
directly by `src/main.ts`, `src/render/parked.ts`,
`src/shared/roadprofile.ts`, `src/sim/network.ts`,
`src/sim/worker.entry.ts`, and `src/ui/categories.ts`.

`classes` is the functional road hierarchy (`RoadClassSpec` in
`src/shared/types.ts`) — every field is required:

| Field          | Meaning                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | `RoadClassId` — `'dirt' \| 'alley' \| 'rural' \| 'local' \| 'urban' \| 'collector' \| 'arterial' \| 'divided' \| 'oneWay' \| 'highway' \| 'ramp' \| 'rail'`. |
| `name`         | Display name.                                                                                                                                                |
| `postedKmh`    | `{ min, max, default }`.                                                                                                                                     |
| `laneFlow`     | `{ greenRatio }` (signalised flow) or `{ vehPerHour }` (free flow).                                                                                          |
| `zonable`      | Whether a zone can front this class.                                                                                                                         |
| `carriesWater` | Whether the class carries water/sewage along the road graph.                                                                                                 |
| `surface`      | `'paved' \| 'gravel' \| 'ballast'`.                                                                                                                          |
| `admits`       | `LanePieceKind[]` — which lane pieces the class permits.                                                                                                     |
| `lanes`        | `{ min, max }` travel lanes, both directions summed.                                                                                                         |

`specs` is one entry per `RoadTier` (`tier` 1..12, `RoadSpec` in
`src/shared/types.ts`) — the scalar contract each tier's `profile` must
reproduce:

| Field             | Required | Meaning                                                             |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `tier`            | yes      | `RoadTier` value.                                                   |
| `name`            | yes      | Display name.                                                       |
| `costPerTile`     | yes      |                                                                     |
| `upkeepPerTile`   | yes      |                                                                     |
| `speed`           | yes      | m/s along edges.                                                    |
| `capacity`        | yes      | Vehicles/day before congestion.                                     |
| `unlockMilestone` | yes      | Index into `MILESTONES`.                                            |
| `profile`         | no       | The `RoadProfile` cross-section — present for all 12 current specs. |
| `noiseMult`       | no       | Noise-field emission multiplier; default `1`.                       |
| `oneWay`          | no       | Directed edge; default `false`.                                     |
| `carriesWater`    | no       | Default `true`; highway/ramp set `false`.                           |
| `surface`         | no       | `'paved' \| 'gravel'`; default `'paved'`.                           |
| `roadsideParking` | no       | Default `false` — earned explicitly, not by omission.               |

A `RoadProfile` (`{ class, pieces: LanePiece[], postedKmh?, kerbs? }`) is an
ordered kerb-to-kerb list of `LanePiece`s (`{ kind, width, flow?, tram? }`);
`kind` is one of `'travel' | 'centreTurn' | 'parking' | 'bike' | 'bus' |
'tram' | 'rail' | 'median' | 'barrier' | 'shoulder' | 'sidewalk' | 'verge'`.

## The scalar fields

Nine `Uint8Array` layers, `0..255`, indexed by `FieldId`
(`src/shared/types.ts`) into `GridState.fields`; all nine are the persisted
`fields[0..8]` grid layer (see [The tile grid](#the-tile-grid), and the
Traffic-field caveat in
[What survives a save, and what doesn't](#what-survives-a-save-and-what-doesnt)).
`FieldSim` (`src/sim/fields.ts`) runs the simulation; the emission,
diffusion and decay formulas themselves are simulation behavior — see
the specs — but the shape below is part of the data model:

| Field       | `FieldId` | Emitted by                                                                                             | Decays       |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| `LandValue` | 0         | Its own proximity formula (pollution/water/trees), plus park coverage.                                 | 0.995/tick   |
| `Pollution` | 1         | Buildings' `pollution` stat, and incinerators' burn rate.                                              | 0.97/tick    |
| `Noise`     | 2         | Buildings' `noise` stat, and road traffic volume x tier `noiseMult`.                                   | 0.90/tick    |
| `Traffic`   | 3         | Rebuilt wholesale each pass from road-network edge volumes (not additive emission).                    | 0.92/tick    |
| `Crime`     | 4         | Ambient growth on zoned tiles below a land-value ceiling; reduced by police coverage.                  | 0.985/tick   |
| `FireRisk`  | 5         | Ambient growth on any occupied tile; reduced by fire-station coverage.                                 | 0.99/tick    |
| `Education` | 6         | School building coverage only.                                                                         | 0.99/tick    |
| `Health`    | 7         | Hospital building coverage only.                                                                       | 0.99/tick    |
| `Happiness` | 8         | Not emitted into — a pure per-tile recompute from the other 8 fields each time its schedule slot runs. | not diffused |

Every field but `Happiness` diffuses on its own staggered schedule via the
same 4-neighbor (von Neumann) blend — 0.6 self weight, 0.4 neighbor average —
before its own decay multiplier is applied; `Happiness` never diffuses, it
is only ever recomputed in place.
