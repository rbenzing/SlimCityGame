# Education ladder — technical design

- **Status:** Built — the ladder in the sim: four schools, the library, the gates; the school buildings drawn as campuses (2026-10-14)
- **Date:** 2026-10-14
- **Author:** Claude Opus 5

Epic 3 of [municipal-services.md](municipal-services.md), built on epic 0,
[service-capacity.md](service-capacity.md). The design it implements, with every
source and every derivation, is
[../../game-design/features/education-ladder.md](../../game-design/features/education-ladder.md).
This document is the plan for the code, and it replaces the 2026-09-18 draft,
whose English figures and two-field scheme are withdrawn.

## What we are building, and why now

Four schools where there is one, and a library that extends their reach. Each
rung gates a higher tier of zone growth, so a player can look at a stalled block
and name the building that would unstall it. Now, because education is the only
service that already gates growth — every other epic adds a mechanism; this one
extends one that has shipped.

**Slice 1, built:** the sim, catalog, save, panels and Advisor. **Slice 2,
built:** the five kits, and the screenshots that judge them
(`tools/education-shots.mjs`).

## What it touches

| Module                      | Change                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`       | `FieldId` gains `MiddleEducation` 9, `HighEducation` 10, `CollegeEducation` 11; `FIELD_COUNT` 9 → 12; `ServiceKind` gains `middle-education`, `high-education`, `college-education`, `library`; `FundingKey`; `Problem.NeedsSchool` 1024; `SAVE_VERSION` 15 → 16 |
| `src/shared/schooling.ts`   | New: the rungs, the gate, and which rungs a zone needs for level 3. One source for the sim, the panels and the Advisor                                                                                                       |
| `src/sim/growth.ts`         | `meetsLevelUpRequirement` takes the zone and asks `schooling`; `NeedsSchool` is set and cleared with the other problems                                                                                                      |
| `src/sim/services.ts`       | Four school kinds write their own field; the library pass runs before the schools; per-road-tile range uplift in `radiateWeighted`                                                                                           |
| `src/sim/fields.ts`         | The three new fields diffuse and decay as `Education` does                                                                                                                                                                   |
| `src/world/grid.ts`         | The three planes are serialized at the end of the tile record; `BYTES_PER_TILE_BY_VERSION` gains v16                                                                                                                         |
| `src/data/catalog.json`     | `school` re-ranged; `middle-school`, `high-school`, `college`, `library` added                                                                                                                                               |
| `src/sim/worker.entry.ts`   | The inspector's list of missing schools                                                                                                                                                                                      |
| `src/ui/`                   | The Education row splits into rows per rung and the library; three lenses; the `Needs School` marker; the Advisor's per-rung count                                                                                           |
| `src/render/utilitykits.ts` | Slice 2: five pure layouts and kits — wings, gyms, grounds, the school bus — claimed in `UTILITY_KIT_CATALOG_IDS`, so the building instancer draws their plinth; windows on the stations' night material. The art is [../../art/civic-massing.md](../../art/civic-massing.md#the-schools-the-college-and-the-library) |

**Save format: yes, additively, at the end.** The three new field planes are
**appended to the tile record, after `waterPipe` and before the road network**, and
never inserted between the nine existing field planes, although in memory they
are `FieldId` 9–11 beside them. A new grid layer goes last
([../data-model.md](../data-model.md#save-version-and-per-tile-width)): an older
save's tile record is then a byte-for-byte prefix of the new one, and no byte
that was in an old save moves. `SAVE_VERSION` goes 15 → 16 by exactly one,
`BYTES_PER_TILE_BY_VERSION` gains v16 at three bytes more, and
`deserializeGrid` zero-fills the planes for any save at v15 or earlier.
**A save written before this epic loads after it with no middle, high or college
coverage** — the city never had a middle school, and a zero plane says exactly
that — and every building intact.

`CityStats.serviceFunding` gains **no key**: every school and the library share
the Education slider. One department pays for them, so there is no new default to
load and no old save to migrate.

**Worker protocol: yes, additively.** No new message: the field channel carries a
`FieldId` already, `serviceLoad` is keyed by `ServiceKind` and so gains four keys,
`Problem` rides `BuildingDelta`, and `SelectionInfo` gains an optional list of the
schools a held building is missing. See [../interfaces.md](../interfaces.md).

## The design

### One field per rung

A rung must never clear the rung above it at any distance. The draft got that by
ordering gates on one field and a second field for the third rung, which put a
secondary school's strength at 255 and closed its gate at 170% load. It is
withdrawn for the simpler rule: **a field per rung**, so no rung can substitute for
another by construction, and every school can write the same 150.

| Rung       | Kind                | Field              | Strength | Gate | Range | Catchment (0.6 × range) |
| ---------- | ------------------- | ------------------ | -------- | ---- | ----- | ----------------------- |
| Elementary | `education`         | `Education` 6      | 150      | > 60 | 59    | 35.4                    |
| Middle     | `middle-education`  | `MiddleEducation` 9 | 150     | > 60 | 93    | 55.8                    |
| High       | `high-education`    | `HighEducation` 10 | 150      | > 60 | 86    | 51.6                    |
| College    | `college-education` | `CollegeEducation` 11 | 150   | > 60 | 156   | 93.6                    |

`Education` keeps its number and its meaning, elementary, so no save moves a byte
of it. `FIELD_COUNT` is 12. The three planes cost 196,608 bytes of memory and three
bytes a tile of save. The new fields run on the `Education` slot (period 8, offset
3, decay 253/256) rather than each taking a slot: the free period-8 offsets are
used up, and the four diffuse together as the one kind of coverage they are.

### Funding is one key

`ServiceKind` is the set of facility kinds the services pass runs, nine of them.
`FundingKey` is the set of departments the player funds: police, fire, health,
education and park. `fundingKeyOf(kind)` maps the four new kinds to `education`,
and `economy.ts`, `dispatch.ts`, the `setServiceFunding` command and the store all
speak `FundingKey`. A school's range and capacity scale with the Education slider
whichever rung it is, and its upkeep follows.

### Growth

`growth.ts` has one education constant, `RES_L3_EDUCATION = 60`, read in
`meetsLevelUpRequirement` for every residential zone at level 3. It becomes the
shared `SCHOOLING_GATE`, and the gate is chosen by **zone** rather than sector:

| Zone                                      | Level 3 also needs                         |
| ----------------------------------------- | ------------------------------------------ |
| `ResLow`, `ResMediumRow`                  | `Education > 60`                           |
| `ResMedium`, `ResHigh`, `Mixed`, `ComLow` | `MiddleEducation > 60` and `HighEducation > 60` |
| `ComHigh`                                 | `CollegeEducation > 60`                    |
| `Industrial`, `IndHeavy`, `Agriculture`   | nothing                                    |

Level 2 is ungated at every density; the land-value gates, 140 and 190, are
untouched. `src/shared/schooling.ts` holds the table (`level3Schooling(zone)`), so
the growth pass, the inspector and the Advisor all ask one place which rungs a
zone waits on.

`Problem.NeedsSchool` is `1024`, the next free bit. `processProblemsAndAbandonment`
sets it on an Active building whose next level would be 3, whose land value clears
190, and which fails only its schooling; it clears when a school reaches it. It is
never a blocker: it does not feed the abandonment streak.

**What changes on an existing city.** Before, every residential zone needed
`Education > 60` at level 3 and commercial needed land value alone. Now the
dense residential zones need the middle and the high school instead of the
elementary school, local commercial needs the same two, and high-density
commercial needs the college. Nothing loses a level. A town below Big Town cannot
build a middle or a high school, so a dense or commercial building waiting on one
stays at level 2, and the marker says why. That is the one place the epic gates
growth by a building the player cannot yet buy, and it is level 3, never the
opening.

### The library

A library writes no field. Before any school radiates, `ServiceSim.tick` runs the
library kind first, whatever the order of the registry: each library walks once
from its nearest road tile and radiates `strength × (1 − d/R)` as every service
does, and that map is the **uplift** in percent, 20 at its door and 0 at its range
edge, the strongest winning where two overlap. The library's `strength` in the
catalog, 20, **is** the uplift dial, and it is **unsourced**: nothing quantifies a
library's effect on attainment.

The library follows the existing **supply-share model** rather than a model of its
own. Its map is scaled by `min(1, capacity × funding ÷ people in reach)` like any
facility's, so a library at 200% load gives half its uplift, and its load shows in
the Services panel with the rest. Radiation to two tiles around each road tile
applies to it as it does to every service.

Each school then walks to `ceil(range × (1 + maxUplift ÷ 100))`, the widest
reach any library's strength allows, and uses the local range in the falloff:
`strength × (1 − d / (range × (1 + uplift[roadTile] ÷ 100)))`. Non-positive values
drop as today. With no library in the city the cap is `range` and every figure is
what it was. The multiplier is on **range**, never strength, which is what makes it
safe: a library cannot raise a school's peak value, so it cannot carry a tile across
a gate that school could not reach alone.

### Capacity and overload

The existing supply-share model is unchanged: a facility's capacity, scaled by
funding, is divided among the people in its reach, every value it writes is scaled
by `min(1, supply)`, and supplies add where facilities overlap. There is no
`effectiveStrength`. For one school at load `L` the value at distance `d` is
`150 × (1 − d/range) ÷ L`, the gate `> 60` holds out to `range × (1 − 0.4 L)`, and
it closes at **250%** for every rung, since every rung has the same strength and the
same gate.

### Catalog

| id              | footprint | height | kind                | strength | range | capacity | cost    | upkeep | milestone     |
| --------------- | --------- | ------ | ------------------- | -------- | ----- | -------- | ------- | ------ | ------------- |
| `school`        | 3×3       | 10     | `education`         | 150      | 59    | 7,000    | 6,000   | 400    | Small Town    |
| `middle-school` | 4×4       | 9.6    | `middle-education`  | 150      | 93    | 17,700   | 7,870   | 525    | Big Town      |
| `high-school`   | 5×4       | 9.6    | `high-education`    | 150      | 86    | 15,200   | 10,230  | 608    | Big Town      |
| `college`       | 6×5       | 9.6    | `college-education` | 150      | 156   | 50,000   | 12,400  | 2,185  | Grand City    |
| `library`       | 3×2       | 3.2    | `library`           | 20       | 60    | 20,500   | 785     | 54     | Busy Township |

`school` keeps its id and its name, Elementary School, so no save migrates a
building id; its range goes 56 → 59. The milestone column is looked up by name in
`MILESTONES`, never written as a number in a test. Every derivation is in the design
document; settled figures go to
[../../game-design/balancing.md](../../game-design/balancing.md).

## What could go wrong

**The load counts the whole reach.** Capacity is divided among the people on every
tile a school's coverage reaches, which is the full range, while the gate and the
catchment are 0.6 of it. A school ranged at its catchment's 100% therefore reads
about 280% over a fully built district, and one over 250% closes its own gate. The
ranges are derived at a 35% residential share of the covered ground, a stated
assumption, and a road network is not a diamond, so a real district reads less; but
the first school to sit in a dense grid is the case to watch. Changing what load
counts is a change to the supply-share model, not to this epic.

A lone school in a fully built district therefore reads about 280%, because its
reach covers about 2.8 times the people its catchment holds. Schools spaced at
catchment distance pool their places over the ground they share, and a district
served that way settles at about 100%, so a built-out district needs one school
per capacity's worth of people. That is the capacity model working as designed,
not a defect: the load figure is asking the player for the second school.

**Two tightenings land on every existing city.** The elementary range goes from 56
to 59, a small widening; and the dense and commercial zones change which rung they
wait on. Nothing loses a level, but growth stops where it was fine, so the marker
and the Advisor land in the same change as the gate.

**A plane at the end of the record.** The risk is an older buffer read at the new
offsets producing a plausible corrupt city rather than an error. The length check
catches it, and `BYTES_PER_TILE_BY_VERSION` gains its entry in the same commit.
Writing the planes last is what keeps every earlier version a prefix.

**The library pass, both ways.** Uplift must be known before any school radiates,
so `ServiceSim.tick` gains an ordering dependency, and getting it wrong is silent.
Walking to `range × 1.20` also reaches up to 44% more road tiles per school, but only
while a library exists, and the traversal is still one per school.

**A school nobody can build.** A town below Big Town holds dense and commercial
buildings at level 2 for want of a middle and a high school. That is the design, and
it is the first place a service gates growth by a rung the player has not yet reached,
so the Advisor names it. The opening of the game, level 2 and the first town,
is untouched: `tests/interaction/firsttown.test.ts` is unchanged.

## Alternatives

**Three thresholds on the existing field, then a second field.** Rejected: ordering
gates on one 0–255 field forced a strength of 255 on one rung and a 170% closing
point, and made the rungs substitutable at the margin. A field per rung has neither problem.

**Funding a key per rung.** Rejected: one department, one slider. It would also have
added keys to `serviceFunding` and a default to load.

**The library as a floor on the education field.** Rejected: coverage blends by
maximum, so a floor below the bottom gate is inert and a floor above it is a
cheaper school. Hence a multiplier on range.

**Requiring the rung below to be built, and gating industry on education.** Both
rejected: the first needs a new catalog field and a refusal mode, and a hard lock
teaches less than a soft one; the second chokes the sector a young city can least
afford to unblock.

## How we will know it works

- A v15 save loads with zero middle, high and college planes and every building
  intact. Written first, since it protects every existing city.
- A v16 save round-trips the three planes.
- A `ResHigh` lot at land value 200 with only middle coverage stays at level 2 with
  `NeedsSchool`; with middle and high it reaches level 3; and no number of
  elementary schools opens it.
- `ComHigh` needs the college; industry and level 2 are never gated.
- A library at a school's door stretches the gate catchment — by a fifth of range at
  the library and less with every tile from it, so about 7% at a 35-tile edge; a
  library no school's road reaches changes nothing, and one with no school at all
  writes no field, in any registry order.
- A school's load closes its gate as the supply-share model says.
- The catalog holds the capacities, prices, upkeep, draws and milestones above.
- The Services panel shows a row per rung and the library.

**Slice 2's tests:** each layout is deterministic and every part stays inside its
lot at all four rotations; no two building masses overlap; the floor as drawn
(wings × 3, gyms × 2, the library × 1) is within 1% of the stated floor; the
stalls and the bus pull-in clear every building; the five ids are kit-owned.

**What has to be looked at in a browser in slice 2**, every mesh being new: the
elementary school at 3×3 and 10 m beside a 4.0 m car and a 1.75 m person; the middle
and high schools as campuses, a long low block and not one mass filling the lot; the
college sited inside a built-up grid, the largest civic mass in the game; the library
at 3×2 and 3.2 m as a library and not a shed; then all five at night.

## Out of scope

- New zone levels; the ladder gates the three that exist.
- Education as an economic input — productivity, wages, crime.
- School buses, catchment drawing, term time, admissions, per-pupil simulation.
- Reworking coverage: road-network walking is unchanged, only range is uplifted.
- A pedestrian dev hook for the scale shots: the parked cars, the school bus and
  the kerb car carry the scale.
