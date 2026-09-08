# Naming

Derived from the tree, not asserted — every claim below was checked against
`src/`.

## Files

**Lowercase, no separator, one word or a run-together compound**: `roadprofile.ts`,
`clientgrid.ts`, `roadsmesh.ts`, `garbagetrucks.ts`, `zonegrid.ts`. This holds
across `shared/`, `core/`, `world/`, `sim/`, `render/`, `tools/`, and the
non-component files in `app/` and `ui/`. There is no kebab-case and no
snake_case file in `src/` except one: `src/ui/test-helpers.ts`, the single
hyphenated filename in the entire source tree.

**One deliberate dot-suffix**: `src/sim/worker.entry.ts` — the dot marks it
as the worker's entry point (the file `new Worker(...)` in `main.ts` points
at), distinct from every other file in `sim/` which holds one system's
logic. No other file uses a dot suffix outside `.test.ts`/`.test.tsx`.

**React components are `PascalCase.tsx`**, one component (plus its
supporting hooks/helpers) per file: `AdvisorPanel.tsx`, `RoadToolOptions.tsx`,
`MenuScreen.tsx`. Non-component modules under `src/ui/` stay lowercase like
everywhere else: `store.ts`, `advisor.ts`, `categories.ts`, `format.ts`,
`theme.ts`, `statshistory.ts`.

**Tests are co-located**, `<module>.test.ts` / `<module>.test.tsx` next to
the file they cover — never a separate `__tests__/` or `test/` directory.
117 test files exist this way; `vite.config.ts`'s
`test.include: ['src/**/*.test.{ts,tsx}']` is the only thing that has to
agree with this, and it does.

## Exported symbols

- **Types and interfaces: `PascalCase`** — `Command`, `SimSnapshot`,
  `RoadProfile`, `CityStats`, `SaveMeta`.
- **Classes: `PascalCase`**, usually noun phrases naming what they own —
  `BuildingInstancer`, `RoadMeshRenderer`, `FixedTimestep`, `CommandQueue`,
  `UndoStack`, `ClientGridMirror`.
- **Functions: `camelCase`**, usually verb phrases — `applyCommand`,
  `tripsForTick`, `carriagewayWidth`, `generateProceduralMap`.
- **Constants: `UPPER_SNAKE_CASE`** — `TICK_RATE`, `MAP_SIZE`, `SNAPSHOT_HZ`,
  `MAX_VEHICLES`, `CHUNK_TILES`. Verified: every `export const` in
  `src/shared/constants.ts` whose value is a literal (not a function or
  object-of-values) follows this.
- **Enum-like value sets: `PascalCase` name, `as const` object, not a TypeScript
  `enum`.** `ZoneType`, `RoadTier`, `RoadFlow`, `FieldId`, `BuildingState`,
  `Problem`, `VehicleKind` are all declared as:
  ```ts
  export const RoadTier = { None: 0, TwoLane: 1 /* ... */ } as const;
  export type RoadTier = (typeof RoadTier)[keyof typeof RoadTier];
  ```
  Grepping `src/` for `^export enum` returns nothing — this codebase never
  uses TypeScript's native `enum`. The header comment on `types.ts` explains
  why the values themselves are load-bearing: they're stored in typed-array
  save layers, so members are numbered explicitly and members are "MUST NOT
  be reordered" — new members always append with the next free number
  (see the `ZoneType` block's own comment for a worked example).

## Test naming

`describe`/`it` blocks read as plain-English behavior descriptions
(`describe('createRng', ...)`, `it('applies height patches into the height
mirror', ...)`). A number of older test names carry a stale `(UI-SPEC §6.5)`
or `(SPEC §21)` suffix pointing at a document section from before the
documentation split — these are legacy labels, not a convention to
continue; write new test names as plain descriptions of the behavior,
without a section-number citation (see
[coding.md](coding.md#comments)).

## Constants that encode a rule, not just a value

Several constants carry their derivation in the name itself rather than a
separate lookup — `TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH`,
`CHUNKS_PER_SIDE = MAP_SIZE / CHUNK_TILES`, `TICK_MS = 1000 / TICK_RATE`.
Follow this when adding a derived constant: compute it from the constant it
depends on, in the same file, rather than hard-coding the product/quotient
a second time — this is the same "one fact, one place" instinct
[CONTRIBUTING.md](../../../CONTRIBUTING.md) states for documentation, applied
to code.
