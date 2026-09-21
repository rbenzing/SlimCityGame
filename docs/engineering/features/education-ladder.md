# Education ladder — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 3 of [municipal-services.md](municipal-services.md), built on epic 0,
[service-capacity.md](service-capacity.md). The design it implements is
[../../game-design/features/education-ladder.md](../../game-design/features/education-ladder.md).

## What we are building, and why now

Three education buildings where there is one, and a library that extends their
reach. Each rung gates a higher tier of zone growth, so a player can look at a
stalled block and name the building that would unstall it. Now, because
education is the only service that already gates growth — every other epic adds
a mechanism; this one extends one that has shipped.

## What it touches

| Module                   | Change                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`    | `ServiceKind` gains `'higher-education'`; `FieldId` gains `HigherEducation = 9`, `FIELD_COUNT` 9 → 10; `Problem` gains `NeedsSchool = 64`; `SAVE_VERSION` bumps |
| `src/sim/growth.ts`      | Two thresholds beside `RES_L3_EDUCATION`; `meetsLevelUpRequirement` picks the gate by zone; the new problem bit is set                                          |
| `src/sim/services.ts`    | Library pass before the coverage loop; per-road-tile range uplift in `radiateWeighted`; `higher-education` case in `applyCoverage`                              |
| `src/world/grid.ts`      | Tenth field plane in `serializeGrid`/`deserializeGrid`; `BYTES_PER_TILE_BY_VERSION` gains an entry                                                              |
| `src/data/catalog.json`  | `school` corrected; `secondary-school`, `university`, `library` added                                                                                           |
| `src/ui/`, `src/render/` | The Education row splits into three; the overlay draws gate contours; campus and public-counter meshes for the four buildings                                   |

**Save format: yes, additively.** Field planes are contiguous, so a tenth
lengthens the buffer by one byte per tile: `SAVE_VERSION` bumps to 12 and
`BYTES_PER_TILE_BY_VERSION` gains an entry, as every layer since v2 has.
`deserializeGrid` reads nine planes at version ≤ 11, leaves the tenth
zero-filled, and continues into the trailing layers at the old offset. **A save
written before this epic loads after it, with higher education absent rather
than the save rejected** — the city never had a university, and a zero plane is
that statement. `CityStats.serviceFunding` gains a key, defaulting to 1, never 0. See [../data-model.md](../data-model.md).

**Worker protocol: yes, additively.** No new message: the field channel carries
a `FieldId` already, load figures are epic 0's keyed here by catalog id, and
`Problem` rides `BuildingDelta`. See [../interfaces.md](../interfaces.md).

## The design

### Why higher education is a second field

Three ordered gates do not fit on one 0–255 field. A rung must never clear the
rung above it at any distance, so `S₁ ≤ T₂ ≤ S₂ ≤ T₃ ≤ S₃ ≤ 255`; a rung's
catchment radius is `range × (1 − T/S)`, so squeezing the third against the
ceiling collapses it to a handful of tiles. Two planes dissolve that —
`Education` carries two rungs, `HigherEducation` one, alone:

| Rung       | Field           | Strength | Threshold | Range | Catchment                          |
| ---------- | --------------- | -------- | --------- | ----- | ---------------------------------- |
| Primary    | Education       | 150      | 60        | 50    | 50 × (1 − 60/150) = **30 tiles**   |
| Secondary  | Education       | 255      | 150       | 100   | 100 × (1 − 150/255) = **41 tiles** |
| University | HigherEducation | 150      | 60        | 100   | 100 × (1 − 60/150) = **60 tiles**  |

A tenth plane costs 65,536 bytes of memory and one byte per tile of save. **The
strict comparison is load-bearing**: a primary writes exactly 150 at its door
and the secondary gate is `> 150`; if that `>` becomes `>=` the ladder collapses.

### Growth

`growth.ts` has one education constant, `RES_L3_EDUCATION = 60`, read in
`meetsLevelUpRequirement` as `fieldAt(g, FieldId.Education, idx) >
RES_L3_EDUCATION` and applied only when `sector === 'res' && targetLevel >= 3`;
land value gates are untouched at 140 and 190. It becomes three constants chosen
by zone rather than sector, because the ladder distinguishes densities:

| Zone                                      | Level 3 also needs                               |
| ----------------------------------------- | ------------------------------------------------ |
| `ResLow`, `ResMediumRow`                  | `Education > 60` — `RES_L3_EDUCATION`, unchanged |
| `ResMedium`, `ResHigh`, `Mixed`, `ComLow` | `Education > 150` — `DENSE_L3_EDUCATION`         |
| `ComHigh`                                 | `HigherEducation > 60` — `HIGHER_L3_EDUCATION`   |
| `Industrial`                              | nothing — land value only, deliberately          |

Level 2 stays ungated at every density. `meetsLevelUpRequirement` already runs
each pass for every building below level 3, so when land value clears and only
education fails the caller sets `Problem.NeedsSchool`, at no extra cost.

### The library

A library writes no field. Before the coverage loop, `ServiceSim.tick` walks
each library once into a per-road-tile uplift map, `1 + 0.20 × (1 − d/R)` — 1.20
at its door, 1.00 at its range edge, the strongest winning where two overlap.
Each education building then BFS-walks to `ceil(range × 1.20)` and uses the
local uplifted range in the existing falloff,
`strength × (1 − d / (range × uplift[roadTile]))`; non-positive values drop as
today, so the wider cap costs nothing where no library reaches.

The multiplier is on **range**, never strength, and that is what makes it safe:
a library cannot raise a building's peak value, so it cannot carry a tile across
a gate that building could not reach alone. The 0.20 has no published basis —
nothing quantifies a library's effect on attainment — so it is an assumption,
set to move a catchment edge visibly (a primary's goes 30 → 36 tiles) and no
further.

### Capacity and overload

Epic 0's rule applies unchanged: `effectiveStrength = strength × min(1, 1/load)`,
capacities pooling across facilities reaching the same ground. Weakening strength
shrinks the catchment, and it reaches zero at `strength ÷ threshold`:

| Rung       | Capacity | Catchment at 150%     | Gate closes at           |
| ---------- | -------- | --------------------- | ------------------------ |
| Primary    | 5,000    | 20 tiles (400 m)      | 250%                     |
| Secondary  | 15,000   | 11 tiles (240 m)      | 170%                     |
| University | 50,000   | 40 tiles (800 m)      | 250%                     |
| Library    | 15,000   | uplift halves at 200% | never — it holds no gate |

The secondary school's 170% is the balance risk worth naming: its threshold is
59% of its strength where the others' are 40%. At the other end the tertiary
gauge barely moves — one campus serves the whole top milestone.

### Sizes

Sizes are `w × d × 185 × (height ÷ 3.2)` from
[../../art/civic-massing.md](../../art/civic-massing.md) against the anchors in
[../../art/README.md](../../art/README.md), campus ground counted as footprint.
Occupancy factors are that document's — classroom 1.9 m² net, laboratory 4.6,
assembly 1.4, business 13.9 gross, civic net-to-gross 65%, a 90° stall with a
shared aisle 24.75 m² — and head counts are roll plus staff, at the primary's
all-staff ratio of one to fourteen pupils and the university's of one to seven.

| Building                 | Floor, derived                                                                                                | Gross         | Storeys | Block                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------- | ------- | ----------------------------- |
| Primary, 420 places      | 420 × 1.9 ÷ 0.65 = 1,228; hall 210 × 1.4 ÷ 0.65 = 452; 30 staff × 13.9 = 417                                  | **2,100 m²**  | 2       | ÷185 ÷2 = 5.7 → **6 tiles**   |
| Secondary, 900 places    | (900 × 0.8 × 1.9 + 900 × 0.2 × 4.6) ÷ 0.65 = 3,378; hall 450 × 1.4 ÷ 0.65 = 969; 64 staff × 13.9 = 890        | **5,237 m²**  | 3       | ÷185 ÷3 = 9.4 → **10 tiles**  |
| University, 2,100 places | (2,100 × 0.5 × 4.6 + 2,100 × 0.5 × 1.9) ÷ 0.65 = 10,500; study 1,932 ÷ 0.65 = 2,972; 300 staff × 13.9 = 4,170 | **17,642 m²** | 5       | ÷185 ÷5 = 19.1 → **20 tiles** |
| Library                  | 15,000 people × 30 m² per 1,000                                                                               | **450 m²**    | 1       | ÷185 = 2.4 → **3 tiles**      |

A school is a campus, so its site is the block plus its ground:

| Building   | Block | Playing field                           | Parking                            | Site   | Lot given |
| ---------- | ----- | --------------------------------------- | ---------------------------------- | ------ | --------- |
| Primary    | 6     | 4,200 m² play at 10 m²/pupil = 11       | 15 spaces = 371 m² = 1             | **18** | 3×3 = 9   |
| Secondary  | 10    | 90 × 45 m pitch = 4,050 m² = 5 × 3 = 15 | 32 spaces + coach bay = 834 m² = 3 | **28** | 6×5 = 30  |
| University | 20    | one pitch = 15                          | 600 spaces = 14,850 m² = 37        | **72** | 6×6 = 36  |
| Library    | 3     | —                                       | 16 spaces = 396 m² = 1             | **4**  | 2×2 = 4   |

The formula over-reads every campus, because it assumes a body filling 13.6 m of
every tile, and **two results are overrides stated rather than rounded away**.
The existing school's 3×3 lot survives and its 10 m height does not — 3.125
storeys where a primary school is two, so 6.4 m — and the lot keeps its play
area half provided, because 18 tiles is 100 m of frontage a growing city cannot
site. The university needs 72 tiles and the frontage ceiling gives 36, so its
parking is cut to 16 tiles (240 spaces, 40%) and its pitch dropped, assuming
students arrive on the transit the city builds; five storeys is the other half.

### Catalog

| id                 | footprint | height | kind             | strength | range | capacity | cost   | upkeep | milestone |
| ------------------ | --------- | ------ | ---------------- | -------- | ----- | -------- | ------ | ------ | --------- |
| `school`           | 3×3       | 6.4    | education        | 150      | 50    | 5,000    | 6,000  | 400    | 1         |
| `library`          | 2×2       | 4.5    | education        | —        | 80    | 15,000   | 1,300  | 80     | 2         |
| `secondary-school` | 6×5       | 9.6    | education        | 255      | 100   | 15,000   | 15,000 | 850    | 3         |
| `university`       | 6×6       | 16     | higher-education | 150      | 100   | 50,000   | 50,000 | 4,000  | 5         |

`school` is renamed Primary School and keeps its id, so no save migrates a
building id. Costs scale from the entry the game is already balanced around:
¢2.86 per m² of floor and ¢13.30 per staff member per month. Settled figures go
to [../../game-design/balancing.md](../../game-design/balancing.md); the rules
above are the spec entry, from the [documentation map](../../README.md).

## What could go wrong

**Two tightenings land on every existing city.** The primary school's range
drops from 56 to 50, so its catchment goes 33 tiles to 30 and blocks 30–33 out
stop clearing the gate; and dense zones are education-gated for the first time,
so a city with `ResHigh` or `ComHigh` at level 2 and land value over 190 needs a
secondary school it never needed. Nothing loses a level — growth gates level-up,
not level-down — but growth stops where it was fine, so the marker and the
notification land in the same change as the gate.

**A tenth plane in the middle of the save layout.** Field planes precede the
trailing layers, so a tenth shifts every byte after it, and the risk is a v11
buffer read at v12 offsets producing a plausible corrupt city rather than an
error. The length check catches it, so `BYTES_PER_TILE_BY_VERSION` must gain its
entry in the same commit.

**The library pass, both ways.** Uplift must be known before any school
radiates, so `ServiceSim.tick` gains an ordering dependency, and getting it
wrong is silent. Walking to `range × 1.20` also reaches up to 44% more road
tiles per education building — one traversal, not two, but it lands on the
per-tick cost the programme flagged as tight, gated by
[../performance-budget.md](../performance-budget.md).

## Alternatives

**Three thresholds on the existing field.** Rejected on the arithmetic above:
the ordering constraint against a 255 ceiling leaves the third rung a catchment
of a few tiles. Revisit only if a field widens beyond a byte.

**The library as a floor on the education field.** Rejected, and it was the
first idea. Coverage blends by maximum, so a floor below the bottom gate is
inert and a floor above it is a cheaper school — no floor value is both useful
and not a substitute, hence a multiplier on range.

**Requiring the rung below to be built before the next unlocks, and gating
industry on education.** Both rejected: the first needs a new catalog field and
refusal mode, and a hard lock teaches less than a soft one; the second chokes
the sector a young city can least afford to unblock.

## How we will know it works

- A save written before this epic loads and plays identically bar the two
  documented tightenings. Written first — it protects every existing city.
- A `ResHigh` lot at land value 200 and education 150 does not reach level 3 and
  at 151 it does; and no quantity of primary schools opens one, because four
  overlapping leave the field at 150, not 600.
- A primary school on a straight road gates level 3 out to 30 road tiles and not
  31; a library at its door makes it 36, and a library with no school in reach
  changes no field and no lot.
- A primary school covering 12,500 people gates nothing anywhere — 250% load,
  effective strength 60, gate `> 60`. At 10,000 it gates out to 10 tiles, and
  two schools at 100% each produce the same field as one at 200%.
- A building clearing land value for level 3 and failing only the education gate
  carries `Problem.NeedsSchool`, and loses it when a school reaches it.
- Libraries resolve before any education building radiates whatever order the
  registry returns, and a profile at the performance-budget city size stays
  within budget with the wider BFS cap and the tenth plane.

**What has to be looked at in a browser**, every mesh here being new:

- The primary school at 3×3 and 6.4 m from the default camera pitch, beside a
  4.0 m car and a 1.75 m person: two storeys, not three, and a school rather than
  an office. The library at 2×2 and 4.5 m in the same shot: entrance, steps and
  mast, and not a shed.
- The secondary school at 6×5 and 9.6 m: the campus read — a long low block with
  the pitch and apron beside it, **not one mass filling the lot**. If the body
  fills all 30 tiles the mesh is wrong however right the numbers are.
- The university at 6×6 and 16 m sited inside a built-up grid, not on open
  ground: the largest civic mass in the game against 120 m of frontage, and
  whether a player can place it in a city that exists. Then all four at night.
- The education overlay over a city with both schools: three gate contours with
  visible edges, and the primary contour retreating toward its school when that
  school is pushed past 150% load.

## Out of scope

- New zone levels; the ladder gates the three that exist. Resizing the other
  three service buildings, which belong to their own epics.
- Education as an economic input — productivity, wages, crime. Those are demand
  and economy questions; anything that should never be built belongs in
  [../../DESIGN.md](../../DESIGN.md).
- School buses, catchment drawing, term time, admissions, per-pupil simulation.
  Load is people in reach against places provided.
- Reworking coverage: road-network walking is unchanged, only range is uplifted.
