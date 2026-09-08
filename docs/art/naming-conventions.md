# Naming conventions

Real, verified conventions from `src/render/`, `src/data/*.json`, and
`src/ui/` — checked across the whole tree, not inferred from one file.
Where a convention is inconsistent, that is stated rather than smoothed
over.

## Render module files: `src/render/*.ts`

Every file in `src/render/` is named in **all-lowercase, no separators** —
`archetypes.ts`, `buildingkit.ts`, `roadsmesh.ts`, `roadfurniture.ts`,
`servicevehicles.ts`, `utilitykits.ts`, `cameramath.ts`. This holds with
zero exceptions across the entire directory (verified: no filename in
`src/render/` contains an uppercase letter, a hyphen, or an underscore).
A module that composes two words does not separate them — `roadsmesh`,
not `roads-mesh` or `roadsMesh`.

Exported symbols inside those files follow ordinary TypeScript casing on
top of that flat filename convention: `PascalCase` for classes
(`BuildingInstancer`, `TerrainRenderer`, `InstancedSlotPool`, `IdPicker`)
and `camelCase` for functions and constants (`archetypeFor`, `materialHex`,
`computePartPlacements`, `isCleanIndustry`). The file name does not have to
match the primary export's name (`buildings.ts` exports
`BuildingInstancer`; `archetypes.ts` exports `archetypeFor` and several
sibling functions, no single dominant export).

## `src/ui/` files: component name dictates casing, differently

Inside `src/ui/`, the file-naming rule is the opposite of `render/`, and
it tracks what the file actually is:

- A file whose default job is exporting one named React component is
  **`PascalCase`**, matching that component's name exactly —
  `AdvisorPanel.tsx`, `AssetDrawer.tsx`, `JunctionPanel.tsx`,
  `MainDock.tsx`, `RoadToolOptions.tsx`, `SaveBrowser.tsx`.
- A file that is logic, data, or a shared non-component module is
  **lowercase** — `store.ts`, `format.ts`, `theme.ts`, `categories.ts`,
  `advisor.ts`, `statshistory.ts`. `icons.tsx` is the one file that looks
  like it should break this rule (it is `.tsx` and does export a
  component, `Icon`) but stays lowercase — it reads as a glyph library
  with one thin component wrapper around a big data table (`GLYPHS`),
  the same shape as the other lowercase logic modules, not as a panel.

## Catalog ids: `src/data/catalog.json`

Every building id is lowercase kebab-case, and almost every one follows
`<category>-<tier>-<level>` for a zoned, levelled building — `res-low-1`,
`res-low-2`, `res-low-3`; `res-medium-row-1`…`3`; `com-high-1`, `com-high-2`;
`ind-1`…`3`; `mixed-1`…`3`. Unique, non-levelled buildings (utilities,
services, parks, transit) drop the trailing tier/level number entirely and
use a short descriptive kebab-case name instead — `coal-plant`,
`wind-turbine`, `water-tower`, `incinerator`, `police-station`,
`fire-station`, `clinic`, `school`, `small-park`, `airport`, `bus-stop`,
`rail-station`. This is a real, consistent split rather than an
inconsistency: the numbered form exists exactly where a "tier ladder" of
the same building exists to number, and the bare form exists exactly
where it does not.

## Road class ids: `src/data/roads.json`

Road classes use a **different, narrower** id convention from buildings:
a single lowercase word with no hyphenation at all — `dirt`, `alley`,
`rural`, `local`. This is a genuinely separate convention from the
catalog's kebab-case ids, not a variant of it — the two files describe
different kinds of things (a road _class_, defined once per tier, versus
a building _type_, of which there can be many at each tier), and each has
settled on its own id shape.

## The deterministic hash helper: intentionally duplicated, not shared

A small local `hash1` avalanche-hash function is re-declared, byte-for-byte
identical, in eleven separate `src/render/*.ts` files (`buildings.ts`,
`facade.ts`, `houses.ts`, `landfill.ts`, `landmarks.ts`, `massing.ts`,
`pedestrians.ts`, `props.ts`, `roadfurniture.ts`, `transit.ts`,
`utilitykits.ts`) rather than imported once from a shared module —
`houses.ts`'s own comment names this explicitly: "Same avalanche hash
every `render/*.ts` keeps a local copy of." Treat this as a deliberate,
existing convention if you add a twelfth file that needs deterministic
per-instance variation — copy the function rather than introducing a new
shared-utility import, so the convention stays what it already is rather
than becoming half-and-half.

## Material names: `src/render/palette.ts`

Every calibrated material is named after the reference swatch it was
measured from, camelCase, descriptive-then-base-material order —
`stainedConcrete`, `cleanConcrete`, `whiteBrick`, `bluePlaster`,
`rustedMetal`, `darkBitumen`, `slateRoof`. `materialHex(name)` is the accessor render modules call to resolve a name
to a colour when a surface's material has a calibrated entry in this
table — building-kit parts, roof/garage/driveway colours, and industrial
wall/accent palettes all resolve this way rather than through a raw hex
literal.
