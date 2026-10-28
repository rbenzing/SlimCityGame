# The data files

### `src/data/catalog.json`

Shape: `{ buildings: BuildingCatalogEntry[] }` (155 entries). Read directly
by `src/main.ts`, `src/sim/worker.entry.ts`, and `src/ui/categories.ts`. The
schema is `BuildingCatalogEntry` in `src/shared/types.ts`:

| Field              | Required | Meaning                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | yes      | Catalogue key.                                                                                                                                                                                                                                                                                                                                                                          |
| `name`             | yes      | Display name.                                                                                                                                                                                                                                                                                                                                                                           |
| `category`         | yes      | `'res' \| 'com' \| 'ind' \| 'service' \| 'utility' \| 'park' \| 'transit'`.                                                                                                                                                                                                                                                                                                             |
| `zone`             | no       | `ZoneType`; set for zone-grown buildings, absent for ploppables.                                                                                                                                                                                                                                                                                                                        |
| `level`            | no       | `1..3` for grown buildings.                                                                                                                                                                                                                                                                                                                                                             |
| `kind`             | no       | `BuildingKind`; set for every zone-grown building: what it is (a duplex, a tower, a crop farm). Three levels per kind.                                                                                                                                                                                                                                                                  |
| `units`            | no       | Homes in the building; residential and mixed entries, and `1` on a farm.                                                                                                                                                                                                                                                                                                                |
| `share`            | no       | The kind's draw weight among the kinds that fit a lot; on its level-1 entry.                                                                                                                                                                                                                                                                                                            |
| `footprint`        | yes      | `{ w, d }` in tiles.                                                                                                                                                                                                                                                                                                                                                                    |
| `bodyFootprint`    | no       | `{ w, d }` the body and its floor are sized on, for a larger lot of a kind's building at a level: never drawn as a kind, chosen by growth when the kind's own lot cannot meet its parking code.                                                                                                                                                                                         |
| `height`           | yes      | Metres, for the box mesh.                                                                                                                                                                                                                                                                                                                                                               |
| `color`            | yes      | Packed hex RGB.                                                                                                                                                                                                                                                                                                                                                                         |
| `residents`        | no       | Population added when active.                                                                                                                                                                                                                                                                                                                                                           |
| `jobs`             | no       | Jobs added when active.                                                                                                                                                                                                                                                                                                                                                                 |
| `powerUse`         | yes      | Average draw, MW.                                                                                                                                                                                                                                                                                                                                                                       |
| `waterUse`         | yes      | Average draw, kL a day.                                                                                                                                                                                                                                                                                                                                                                 |
| `pollution`        | no       | `0..255` emitted at source into the Pollution field.                                                                                                                                                                                                                                                                                                                                    |
| `noise`            | no       | `0..255` emitted at source into the Noise field.                                                                                                                                                                                                                                                                                                                                        |
| `landValueBonus`   | no       | `0..255` emitted into the LandValue field.                                                                                                                                                                                                                                                                                                                                              |
| `service`          | no       | `{ kind, strength: 0..255, range }` — a service building's spec.                                                                                                                                                                                                                                                                                                                        |
| `utility`          | no       | `{ powerMW?, capacityFactor?, waterKL?, sewerKL?, effluent? }` — nameplate power, water produced and sewage taken, a day; `capacityFactor` the share of the year a plant runs at rating (`1` when absent), the grid counting `powerMW × capacityFactor`; `effluent` the share of a drain's load that reaches the water, `1` when absent (a raw outfall), `0.15` on the treatment works. |
| `garbage`          | no       | `{ collectionRange, bufferCapacity, burnRate, trucks }` — the incinerator's spec.                                                                                                                                                                                                                                                                                                       |
| `cost`             | yes      | `0` for grown buildings, plopping cost otherwise.                                                                                                                                                                                                                                                                                                                                       |
| `upkeep`           | yes      | Per month.                                                                                                                                                                                                                                                                                                                                                                              |
| `unlockMilestone`  | yes      | Index into `MILESTONES` (`src/shared/constants.ts`) required to build.                                                                                                                                                                                                                                                                                                                  |
| `requiresAdjacent` | no       | `'rail'` — the footprint must touch that transport tier; `'water'` — it must touch a water tile (an intake, an outfall).                                                                                                                                                                                                                                                                |

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
| `carriesWater`    | no       | Default `true`; gravel road, highway and ramp set `false`.          |
| `surface`         | no       | `'paved' \| 'gravel'`; default `'paved'`.                           |
| `roadsideParking` | no       | Default `false` — earned explicitly, not by omission.               |

A `RoadProfile` (`{ class, pieces: LanePiece[], postedKmh?, kerbs? }`) is an
ordered kerb-to-kerb list of `LanePiece`s (`{ kind, width, flow?, tram? }`);
`kind` is one of `'travel' | 'centreTurn' | 'parking' | 'bike' | 'bus' |
'tram' | 'rail' | 'median' | 'barrier' | 'shoulder' | 'sidewalk' | 'verge'`.
