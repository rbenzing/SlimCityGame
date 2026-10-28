# Truths — Saves and the data model

Back to [the index](../GROUND-TRUTHS.md).


- [R-saves-001] A save stores each building's footprint, and the renderer draws a building
  on its catalog footprint, so the two must agree. When a ploppable's catalog
  footprint shrinks, a save from before it loads that ploppable re-stamped to
  the new footprint inside its old one, on the corner that still fronts the
  road it was served from (its origin when no road touches it), the tiles it
  no longer covers freed. A re-stamp never cuts a building off its street. A
  zoned building keeps the footprint it was saved with. —
  `src/sim/buildings.ts`, `src/sim/worker.entry.ts`
- [R-saves-002] Enum-like value sets (`ZoneType`, `RoadTier`, `RoadFlow`, `FieldId`,
  `BuildingState`, `Problem`, `VehicleKind`, `CONTROL_BY_CODE`) are `as const`
  objects, never TypeScript enums. Members are explicitly numbered and never
  reordered or reused; a new member appends with the next free number. —
  [naming.md](../engineering/standards/naming.md),
  [data-model.md](../engineering/data-model/README.md); `src/shared/types.ts`
- [R-saves-003] A new per-tile layer is appended as the last thing `serializeGrid` writes,
  `SAVE_VERSION` rises by exactly one, `BYTES_PER_TILE_BY_VERSION` gains one
  entry, and older saves default the layer. An existing layer is never
  reordered, resized or given a new meaning. —
  [data-model.md](../engineering/data-model/README.md),
  [ADR-0007](../engineering/adr/0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md);
  `src/world/grid.ts`
- [R-saves-004] A new scalar field plane is serialized at the END of the tile record, after
  the last layer and before the road network, even though in memory it is a
  `FieldId` beside the others. The first nine field planes stay contiguous
  where they were, so an older save is a byte prefix of a newer one; the three
  education planes of v16 follow `waterPipe`, and an older save loads them
  all zero. — [data-model.md](../engineering/data-model/README.md);
  `writeTiles` in `src/world/grid.ts`
- [R-saves-005] `SAVE_VERSION` is taken as current + 1 at build time; no plan owns a number in
  advance. —
  [municipal-services.md](../engineering/features/municipal-services.md)
- [R-saves-006] Save changes are additive: a save written before a feature loads with the
  feature absent, never rejected and never rescaled into deficit on load. A
  missing field means the city never had it; a missing `catalogId` skips the
  building. —
  [municipal-services.md](../engineering/features/municipal-services.md),
  [power-generation.md](../engineering/features/power-generation.md)
- [R-saves-007] Loading refuses `version < 1` or `version > SAVE_VERSION`. There is no
  downgrade path. — [interfaces.md](../engineering/interfaces/README.md);
  `deserializeGrid` in `src/world/grid.ts`
- [R-saves-008] Resizing a shipped building's footprint is a save migration (re-stamp
  ploppables from the catalog on load), never a bare catalog edit. Height-only
  changes are exempt. —
  [municipal-services.md](../engineering/features/municipal-services.md)
- [R-saves-009] The `junctionControl` byte is read and written only through
  `codeForControl` and `controlFromCode`; the order of `CONTROL_BY_CODE` is
  save-format identity. — [interfaces.md](../engineering/interfaces/README.md)
- [R-saves-010] Preset road profile ids 1..12 equal their tier; custom profiles start at
  `FIRST_CUSTOM_PROFILE_ID` (13) and are renumbered on load by
  `adoptCustomProfiles`. — [data-model.md](../engineering/data-model/README.md);
  `src/shared/roadprofile.ts`
- [R-saves-011] `SaveHeader.savedAt` is stamped on the main thread; the worker writes 0. —
  [interfaces.md](../engineering/interfaces/README.md)
- [R-saves-012] The app has no backend. State lives in tab memory, IndexedDB (`slimcity` /
  `saves`, at most 10), `localStorage` and `sessionStorage`; nothing fetches an
  API. — [constraints.md](../engineering/constraints.md),
  [data-model.md](../engineering/data-model/README.md)

