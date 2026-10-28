# Entities beyond the grid

### Buildings

`BuildingInstance` (`src/shared/types.ts`), owned by `BuildingRegistry`
(`src/sim/buildings.ts`): `id`, `catalogId`, `x`/`z` (origin tile),
`rotation`, `level`, `state` (`Constructing` / `Active` / `Abandoned`),
`problems` (a `Problem` bit-flag mask) and the optional `vacancies`: the
residents the building has lost to death and not had replaced, an integer from
0 to the catalog's `residents`, absent meaning 0 (full). It is serialized only
when above 0, so a save without it loads every building full, and a stored
value above the catalog's current `residents` is clamped down on load. An id is assigned by an
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

### The road network

The one place a road is stored: node and segment slot tables, structure of
arrays, in `src/world/roadnet.ts`, held by the worker and saved after the
grid's tiles. What it holds and why is
[road-network.md](../../world-sim/road-network.md). Every road layer of the grid
(†) is derived from it by `deriveRoadLayers`. The grid commands still plan on
tiles; after each command the worker calls `reconcileRoads`, which takes up
what the plan laid while keeping the slot of every node still at the same
place and deck and every segment still between the same two nodes, then
`syncRoadLayers`, which derives the layers again and reports, with
`console.error`, any tile that came out different. A report is a conversion
bug. On a full 256² map of streets the two take about 20 ms, once per road
command.

Roads off the grid (`buildSegment`, `src/world/freeroads.ts`) live only in the
network: `reconcileRoads` keeps every free segment and the nodes it ends on,
keeps a grid tile a free road meets as a node, and turns such a node into a
free one (tier 0) if its grid road is bulldozed. A free node carries no road of
its own tile; a free segment's flow byte is 0 for both ways or 1 for one-way
from its first node to its second, not a compass direction.

Encoded (`encodeRoadNetwork`), little-endian: `u32` node slots, `u32` segment
slots, then every slot, free ones included, so slots survive a save. A node is
17 bytes — live `u8`, x and z `i32` centimetres, deck height `f32`, tier `u8`,
profile `u16`, flow `u8`. A segment is 30 bytes — live `u8`, node slots a and b
`i32`, tier `u8`, profile `u16`, flow `u8`, deck heights at its first and last
tile `f32` × 2, and a curve flag `u8` with its control point `i32` × 2 in
centimetres.

### Road, rail and tram networks

`GraphNode`/`GraphEdge` (`src/shared/types.ts`), built by `RoadNetwork`
(`src/world/roadgraph.ts`). These are **not** persisted directly —
`rebuild(grid)` derives the whole graph from the grid's road network, walked as
cells (`roadCellsOf` in `src/world/roadnet.ts`, cached per network version),
plus `junctionControl`/`junctionTurns` for each node's control and turn state,
every time the network changes, including once after every load. A grid with
no network of its own — a test that lays roads on the tiles — is read through
the network its tiles describe. The cells are the 2 × size² RoadKeys, linked
N/E/S/W, followed by the cells of the roads off the grid: one per tile a free
centre line crosses, with its length in tiles (`freeWeight`), its segment and
the neighbour toward that segment's second node, and one per free node; their
links, and a grid tile's links to them, are in `more`. A grid cell weighs one
tile, so a graph edge's `length` is in tiles either way.
Node and edge ids are assigned fresh on each rebuild, so they carry no
identity across rebuilds — only the grid tiles they're derived from do. A
separate `RoadNetwork` instance (with its own node/edge id space) exists for
the street graph, the rail graph, and the tram graph.

### Junctions

A junction's stored state is only the player's override
(`GridState.junctionControl`) and any turn restrictions
(`GridState.junctionTurns`, `GridState.junctionLaneTurns`) — all three are
grid layers, covered in [The tile grid](the-tile-grid.md). The warrant's own
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

`TransitLine` (`id`, `stops: TilePoint[]`, `color`, optional `mode`, optional
`vehicles`, all in `src/shared/types.ts`) — **does** persist, in
`SaveMeta.transitLines`, restored by `TransitSystem.restore()`. An id is
assigned by an auto-incrementing counter starting at 1; on `restore`, the
counter resumes past the highest id in the restored lines rather than being
itself serialized, so a line created after loading can never collide with one
that came out of the save. `vehicles` is the fleet the player asked the line
to run; absent, the line asks for its derived default, which is how every
line saved before depots existed reads. Per-line ridership statistics, the
vehicles a line is served and the depot pools do **not** persist — the pools
are re-read from the standing depots and the rest recomputed by the transit
tick.

### Road profiles

`RoadProfile` (`class`, `pieces: LanePiece[]`, optional `postedKmh`/`kerbs`,
`src/shared/types.ts`). Preset profiles (ids `1..12`) are catalogue data
from `roads.json`'s `specs[].profile` and are never serialized. Only
player-composed profiles (ids `13+`) are serialized, in
`SaveMeta.roadProfiles` as `{ id, profile }` pairs, and re-adopted into a
fresh `Map` on load via `adoptCustomProfiles` (see
[Road profile ids and the moving preset boundary](the-save-format.md#road-profile-ids-and-the-moving-preset-boundary)).

### Garbage

`GarbageSaveState` (`landfillStored: number`, `incinerators: { id, units }[]`,
`src/sim/garbage.ts`) persists in `SaveMeta.garbage`. The per-tile
uncollected-trash layer (`GarbageSystem.trash`) and the cosmetic garbage
trucks are **not** persisted; both rebuild within a few ticks of a load.

### Death care

`DeathCareSaveState` (`src/sim/deathcare.ts`) persists in `SaveMeta.deathCare`:
`deathRemainder` and `reletRemainder` (the fractional counters, each below 1),
and `deaths` and `relets` (the running counts that position the stride walk).
Absent, all four are zero. The per-building vacancies are in the registry, not
here. Three optional fields follow, each absent in an older save and loaded as
empty: `interments` (`{ id, count }[]`, the burials each cemetery holds, by
building id), `backlog` (`{ tile, count, sinceTick }[]`, the bodies not yet
collected, `tile` a grid index and `sinceTick` the tick they fell, so a body's
age survives a load) and `regionalThisMonth` (the bodies the regional funeral
service has taken since the last monthly settlement). A malformed value loads as
zero, and a backlog entry with a tile off the map or a count or tick that is not
a whole number is dropped. A cemetery's interments are dropped with the
building. A fourth optional field, `cremation` (`{ id, credit, cremated }[]`),
holds each crematorium's banked throughput (a fraction, capped at 8 on load) and
the cremations it has done; absent it loads empty, a bad id is dropped and a bad
number loads as zero, and it is dropped with the building like the interments.
No grid layer is added, so `SAVE_VERSION` stays 15.

`VehicleKind` (`src/shared/types.ts`) gained `Hearse = 8`, appended after
`Recycling = 7`. It is not persisted.

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
