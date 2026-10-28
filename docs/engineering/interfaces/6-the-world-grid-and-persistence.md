# 6. The world grid and persistence

`GridState` (`src/shared/types.ts:197-304`) is the complete mutable world,
owned by the worker; the render thread keeps a read-only mirror rebuilt from
snapshot deltas. Every layer beyond the original set is documented in its own
field comment as **ADDITIVE**: introduced at a specific `SAVE_VERSION`,
serialized _last_, and defaulted to all-zero (or, for `roadElevation`, all-flat)
on an older save. The layers themselves — their types, the version each
arrived at, and what an older save defaults them to — are tabulated in
[data-model.md](../data-model/README.md), which owns the grid schema; that table moves
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
