# 10. Data files as interfaces

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
