# The save format

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
(`u32` version, `u32` size) followed by every layer in the table above except
the road layers (†), in that order, each tile taking a fixed number of bytes
for that version; then a `u32` length and the encoded road network. The worker
writes and reads it through `saveGrid` and `loadGrid` in
`src/world/roadnet.ts`, which derive the road layers from the network on load.

**Meta** (`SaveMeta`): everything else that isn't a grid layer —
`registry` (the building table), `stats` (`CityStats`), and three optional
blocks defaulted on saves written before they existed: `garbage`
(landfill + incinerator fill), `transitLines` (player-built lines),
`roadProfiles` (player-composed road cross-sections) and `deathCare` (the
death and re-let counters, the interments, the backlog of bodies and the
month's regional count). Each is covered in
[Entities beyond the grid](entities-beyond-the-grid.md).

### Save version and per-tile width

The current `SAVE_VERSION` is **16** (`src/shared/types.ts`), and the
current per-tile width is **40 bytes** (`BYTES_PER_TILE_V16` in
`src/world/grid.ts`), followed by the road network. The width for every version is exported as
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
| 11             | 45         | `junctionLaneTurns`, 4 arms x `Uint16` (+8 bytes).                                                                |
| 12             | 53         | The over-road layers: `overTier`, `overProfile` (`Uint16`), `overFlow`, `overElevation` (`Float32`) (+8 bytes).   |
| 13             | 36         | Drops every road layer (−17 bytes); the road network follows the tiles.                                           |
| 14             | 37         | `waterPipe` (+1 byte), appended to the tile record ahead of the network.                                          |
| 15             | 37         | No layer: the v14 layout. Marks landfill fill counted in 0.25 kg trash units, rescaled on load from older saves.  |
| 16 (current)   | 40         | `fields[9..11]`, the middle, high and college education planes (+3 bytes), appended after `waterPipe`.            |

Up to v12, every new layer was appended as the last thing the serializer
wrote, in version order: an older save's tile record is exactly a
byte-for-byte prefix of the v12 record, just missing the layers added after it
was saved. `serializeGridV12` still writes that layout, and the migration tests
trim it. v13 is the one break in the pattern: it takes the road layers out of
the tile record, because they are derived from the road network now, and an
older save's roads convert to a network on load. From v14 the pattern
resumes: a new layer is appended to the tile record, and the network after
it moves along by the same bytes — which is why `savedRoadNetwork` measures
the tile record at the save's own version width, never today's.
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
