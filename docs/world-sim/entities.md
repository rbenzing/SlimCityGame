# Entities

Everything the world holds as a thing, independent of how it looks or how it
moves: how it gets an identity, which object owns it at runtime, whether it
survives a save, and how it relates to the tile grid. For the byte-for-byte
schema and save-version history, see
[../engineering/data-model.md](../engineering/data-model.md) — this document
does not repeat that table, only says what each entity IS and how it behaves
as a thing in the world.

## Buildings

A `BuildingInstance` (`id`, `catalogId`, `x`/`z` origin tile, `rotation`,
`level`, `state`, `problems`) is owned by `BuildingRegistry`
(`src/sim/buildings.ts`). Its id is an auto-incrementing counter starting at
1, never reused within a session; `place()` stamps its rotated footprint into
`GridState.buildingId` and `remove()` clears exactly those tiles again. A
building's relationship to the grid is entirely this stamp — there is no
separate spatial index, and every system that needs "what occupies this
footprint" (utilities, services, garbage, growth's problem checks) rebuilds a
tile-index map from `buildingId` on demand
(`footprintsByBuildingId` in `src/sim/services.ts`, reused by `garbage.ts`).

A building's `state` — `Constructing` (0), `Active` (1), `Abandoned` (2) — is
binary in its effect: population, jobs, tax, utility demand and service
upkeep all count an Active building in full and a Constructing or Abandoned
one not at all. See [population-model.md](population-model.md) for what that
means for the population number, and
[../game-design/simulation-rules.md](../game-design/simulation-rules.md) for
how a building spawns, levels up and abandons.

Persisted in `SaveMeta.registry` (`BuildingRegistry.serialize()`), including
`nextId` so ids stay unique across a reload. Growth's per-building
construction countdown is runtime-only and not serialized — a save always
promotes an in-progress `Constructing` building straight to `Active` on load.

## Roads, rail and tram networks

A road is not stored as an object at all. `GridState.roadTier` /
`roadProfile` / `roadFlow` / `roadElevation` are per-tile grid layers (see
[../engineering/data-model.md](../engineering/data-model.md)); the routable
graph — `GraphNode`/`GraphEdge` — is derived from those layers by
`RoadNetwork.rebuild`/`ensureFresh` (`src/world/roads.ts`) and rebuilt
wholesale after any edit anywhere on the map. Node and edge ids are assigned
fresh on every rebuild and carry no identity across one — only the grid
tiles a node or edge sits on do. Three independent `RoadNetwork` instances
exist side by side, each built from a disjoint or overlapping tile predicate:
the street network (`isStreetTier`), the rail network (`isRailTier`,
disjoint from the street tiles), and the tram network (`isTramTier`, a
subset of the street tiles — a tram tile belongs to both graphs at once).
See [road-model.md](road-model.md) for what a road IS (class, profile,
junction) and [pathfinding.md](pathfinding.md) for what the graph looks like
to a search.

A junction is not a separate stored entity either: it is a `GraphNode` with
three or more edges, whose `control`/`warranted`/`turns`/`laneTurns` fields
are recomputed by `RoadNetwork.refreshControls()` on every rebuild from two
grid layers the player actually edits (`junctionControl`, `junctionTurns`,
`junctionLaneTurns`) plus the warrant's own read of the meeting roads. Only
the player's override and turn restrictions persist; the resolved control
and the warrant's verdict are always re-derived, never stored.

## Vehicles

Every vehicle on screen is cosmetic and lives in a fixed-size
`Float32Array` slot pool, `[x, z, headingRad, speed, kind]` per slot
(`VEHICLE_STRIDE = 5`), written directly by whichever system owns that pool.
None of the three pools below is persisted — all rebuild from scratch within
a tick or two of a load, exactly like traffic volume. See
[agent-behavior.md](agent-behavior.md) for what decides a vehicle's route and
why none of this is a simulated agent.

Three independent systems own three separate pools, all overlaid onto one
shared `SimSnapshot.vehicles` buffer of `MAX_VEHICLES = 1024` slots by fixed
slot-range convention (`src/sim/worker.entry.ts`'s `postSnapshot`):

- `TrafficSystem.vehicleBuffer` (`src/sim/traffic.ts`) is copied in first, as
  the base 1024-slot array. Its own `freeSlots` stack spans every index
  0–1023 and is allocated ascending (slot 0 first), so in practice it fills
  the low end of the range and only reaches into the tail below under a very
  large, dense city.
- `GarbageTruckSystem.vehicleBuffer` (`MAX_GARBAGE_TRUCKS = 16`,
  `src/sim/garbagetrucks.ts`) is copied into slots
  `[1024 − 32 − 16, 1024 − 32)` = `[976, 992)`.
- `DispatchSystem.vehicleBuffer` (`MAX_SERVICE_VEHICLES = 32`,
  `src/sim/dispatch.ts`) is copied into the final tail, slots `[992, 1024)`.

A vehicle's identity is its slot index, stable only while the slot is
occupied and only within one session — freed the instant its animation ends
(traffic/dispatch) or its round trip completes (garbage trucks), and
immediately reusable by an unrelated route.

## Incidents

An `Incident` (`kind`, `x`, `z`, `severity`) is even less identified than a
vehicle: the type carries no id at all. Internally `DispatchSystem` tracks
each one as an `ActiveIncident` keyed by the target building's id
(`activeTargets`, gating re-spawning at the same building while it is still
being handled), but that key never reaches `SimSnapshot.incidents` — a
snapshot's incident list is a fresh array every time, with nothing to
correlate one snapshot's incident against the next beyond matching kind and
position by eye. Incidents are never persisted; a save always loads with no
active incident.

## Transit lines

A `TransitLine` (`id`, `stops: TilePoint[]`, `color`, optional `mode`) is
owned by `TransitSystem`'s in-memory line map (`src/sim/transit.ts`). Its id
comes from a monotonic counter starting at 1; `restore()` resumes the
counter past the highest id in a loaded save rather than serializing the
counter itself, so a line created after loading can never collide with one
that came out of the save. A line's route (the concatenated stop-to-stop
path over whichever network its mode names) and its ridership are never
stored — both are recomputed from the stop list every tick. Persisted in
`SaveMeta.transitLines`. See [transit-model.md](transit-model.md).

## Districts

A `District` (`id` 1–255, `name`, `color`) is a definition kept in the
worker's own `districtDefById` map; per-tile membership is
`GridState.district`, a persisted grid layer. Only the tile membership
survives a save — the definition registry (names, colors) is session-only
and rebuilt empty on load, with `ensureDistrictDef` auto-creating a
default-named, palette-colored def the instant a persisted district id is
first seen while walking the loaded tile layer. A district carries no
buildability or frontage gate — any tile at all, water and roads included,
can belong to one, since it is an administrative region rather than a
construction rule (`src/world/districts.ts`). Policies (`Policy`:
`lowTax`/`highTax`/`noHeavyTraffic`/`greenEnergy`) are enabled per
district id in `PolicyStore`, which is entirely session-only and never
persisted at all. See [../game-design/progression.md](../game-design/progression.md).

## Trees

`GridState.trees` is a `Uint8Array` of `0..255` density values — the only
entity in this document with no owning class, no registry, and no
behavior of its own. Nothing in `src/sim/` grows, spreads, or reads tree
density for any simulated effect except `fields.ts`'s LandValue formula
(`trees[i] >> 4`, a small proximity bonus). The only two things that change
it are `world/grid.ts`'s `clearTiles` (bulldozing zeroes trees on the
cleared tiles) and map generation setting the initial density. It persists
as an ordinary grid layer and has no relationship to buildings, zones, or
roads beyond occupying the same tile space.

## Landfill

A landfill is a painted membership layer (`GridState.landfill`, persisted),
not a ploppable — `paintLandfill`/`landfillTiles` in `src/world/landfill.ts`.
Its runtime shape — the split into 4-connected areas, each with a derived
office tile and a dump-route path (`LandfillArea`) — is never stored; it is
recomputed from the membership layer plus the current street layout every
time the sim's `landfillAreasCache` is invalidated by a landfill paint or
road edit (`src/sim/worker.entry.ts`'s `landfillAreasFor`). The pile total
and each incinerator's buffer persist in `SaveMeta.garbage`
(`GarbageSystem.serializeState`); the per-tile uncollected-trash layer
(`GarbageSystem.trash`) is runtime-only and rebuilds within a few ticks of a
load, exactly like traffic volume. See
[services-model.md](services-model.md) for the collection mechanism.

## Power lines

`GridState.powerLine` is a persisted `Uint8Array` membership layer
(`src/world/powerline.ts`) — a network of its own, not a road: no tier, no
cross-section, carries no traffic. It conducts electricity between its own
tiles and into any road or building footprint it touches; whether a given
tile conducts is read fresh every utility recompute
(`src/sim/network.ts`'s `conductsPower`), never cached as part of the line
entity itself. See [utilities-model.md](utilities-model.md).

## City stats

`CityStats` (funds, population, jobs, demand, tax rates, service funding,
milestone level, and the rest) is the one entity that is a single value, not
a collection — one struct per session, owned by the worker and persisted
wholesale in `SaveMeta.stats`. Population and jobs inside it are themselves
derived every tick from Active buildings, never authoritative in their own
right; see [population-model.md](population-model.md).
