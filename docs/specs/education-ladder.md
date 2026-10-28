# Education ladder

- **Status:** Built

**Owns:** the four schools and the library: the field each writes, the level-3 gates by zone, catchment and overload, the school-needed marker, and the sourced capacity, range, price, upkeep, floor and draw of each. Capacity pooling is in the service-capacity model.

**Rules:**

- Give every rung its own field and let a school write only that one, so no rung substitutes for another. `[R-services-016]`
- Write 150 at a school's door and gate at over 60, so a catchment is 0.6 of the range at every rung. `[R-services-016]`
- Never gate level 2 by schooling; level 3 asks by zone, and industry and farms ask nothing. `[R-services-017]`
- Set `Problem.NeedsSchool` on a lot that clears land value and fails only schooling, and never count it toward abandonment. `[R-services-017]`
- Let a library lift every school's range by up to a fifth, resolved before any school radiates; it writes no field. `[R-services-016]`
- Scale a facility's field by `min(1, supply)`, and pool capacity per tile, never by grouped coverage. `[R-services-012]` `[R-services-014]`
- Reach people along the road network from the nearest road tile, never by a radius. `[R-services-001]` `[R-services-005]`
- Derive every price, range, floor and draw from a published figure, and never lock a ploppable behind the rung below. `[R-services-038]` `[R-services-031]`

**Numbers:** derivations, the range method and every source table are in [the sources](../sources/education-ladder.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| School strength (all four rungs) | 150 | field | dial; one value so every rung closes at the same load |
| `SCHOOLING_GATE` (was `RES_L3_EDUCATION`) | 60 | field, over | dial |
| Land-value gates, level 2 / level 3 | 140 / 190 | field | unchanged |
| Library uplift (catalog `strength`) | 20 | % of range | dial, unsourced |
| Catchment | 0.6 | × range | `1 − 60 ÷ 150` |
| Catchment at load L | `range × (1 − 0.4 L)`; closes at 250 | % load | derived |
| Residential share of covered ground | 35 | % | assumption, [ranges](../sources/education-ladder.md#ranges) |
| Residents per building tile | 8.106 | people | [ranges](../sources/education-ladder.md#ranges) |
| Residents per covered tile | 2.837 | people | same |
| Elementary capacity / range / catchment | 7,000 / 59 / 35.4 | people / tiles | [capacities](../sources/education-ladder.md#capacities) |
| Middle capacity / range / catchment | 17,700 / 93 / 55.8 | people / tiles | same |
| High capacity / range / catchment | 15,200 / 86 / 51.6 | people / tiles | same |
| College capacity / range / catchment | 50,000 / 156 / 93.6 | people / tiles | same |
| Library capacity / range | 20,500 / 60 | people / tiles | same |
| Elementary price / upkeep | 6,000 / 400 | ¢ / ¢ a month | anchor |
| Middle price / upkeep | 7,870 / 525 | ¢ / ¢ a month | [prices](../sources/education-ladder.md#prices) |
| High price / upkeep | 10,230 / 608 | ¢ / ¢ a month | same |
| College price / upkeep | 12,400 / 2,185 | ¢ / ¢ a month | same |
| Library price / upkeep | 785 / 54 | ¢ / ¢ a month | same |
| Unlock milestones | Small Town / Big Town (middle, high) / Grand City / Busy Township (library) | milestone | by name in `MILESTONES` |
| Footprint, elementary / middle / high / college / library | 3×3 / 4×4 / 5×4 / 6×5 / 3×2 | tiles | [sizes](../sources/education-ladder.md#sizes) |
| Height, elementary to library | 10 / 9.6 / 9.6 / 9.6 / 3.2 | m | same |
| Draw, elementary to library | 0.0601 / 0.1028 / 0.1376 / 0.1875 / 0.0170 | MW | [draw](../sources/education-ladder.md#draw) |
| Water, elementary to library | 6.3 / 10.8 / 14.4 / 19.6 / 1.8 | kL a day | same |
| Storey | 3.2 | m | massing rule |
| `FIELD_COUNT` / `SAVE_VERSION` | 12 / 16 | count | save format |

**Code:** `src/shared/types.ts` `FieldId`, `ServiceKind`, `FundingKey`, `Problem.NeedsSchool`, `SAVE_VERSION` — the ids and bytes.
`src/shared/schooling.ts` `level3Schooling`, `SCHOOLING_GATE` — the one place the rungs, the gate and each zone's needs live; sim, panels and Advisor read it.
`src/sim/growth.ts` `meetsLevelUpRequirement`, `processProblemsAndAbandonment` — the gate by zone; the marker sets and clears there.
`src/sim/services.ts` `ServiceSim.tick`, `radiateWeighted` — libraries run first; per-road-tile range uplift.
`src/sim/fields.ts` — the three new fields diffuse and decay as `Education` does.
`src/world/grid.ts` `BYTES_PER_TILE_BY_VERSION`, `deserializeGrid` — three planes at the record's end; older saves zero-fill them.
`src/data/catalog.json` — `school`, `middle-school`, `high-school`, `college`, `library`.
`src/sim/worker.entry.ts` — the inspector's missing-school list. `src/sim/economy.ts`, `src/sim/dispatch.ts` — speak `FundingKey` via `fundingKeyOf`.
`src/ui/` — rows per rung, three lenses, the marker, the Advisor's per-rung count.
`src/render/utilitykits.ts` `UTILITY_KIT_CATALOG_IDS` — five campus kits; `tools/education-shots.mjs` frames them.

**Tests:** `tests/interaction/firsttown.test.ts` — the first town needs no school. Grid loader tests pin a v15 save (zero planes, every building intact) and a v16 round trip.
Growth tests pin the gates: `ResHigh` at land value 200 with only middle coverage keeps level 2 and `NeedsSchool`; no count of elementary schools opens it.
Service tests pin the library (stretch, no school means no field, any registry order) and load closing a gate. The catalog contract test pins capacities, prices, upkeep, draws, milestones. `utilitykits.test.ts` pins layouts: deterministic, inside the lot at four rotations, floor within 1%.

**Open:** the college declares no drive: its kit has no car park. A civic kit's plinth leaves a step where its apron meets the road.

## Why the rules are what they are

### The ladder and its fields

Four schools, each opening a door the lower ones cannot. Houses level up behind an elementary school; blocks, towers, mixed use and local commercial behind a middle school and a high school; high-density commercial behind a college.

| Rung | Building | Unlocks at | Field | What it opens |
| ---- | -------- | ---------- | ----- | ------------- |
| 1 | Elementary School | Small Town | `Education` 6 | Detached and row houses reach level 3 |
| 2 | Middle School | Big Town | `MiddleEducation` 9 | With a high school: blocks, towers, mixed, local commercial |
| 3 | High School | Big Town | `HighEducation` 10 | With a middle school: the same |
| 4 | College | Grand City | `CollegeEducation` 11 | High-density commercial |
| — | Public Library | Busy Township | none | Extends every school's reach |

A rung writes its own field, so no quantity of one rung stands in for another. Four elementary schools leave the middle field at zero. A player can look at a stalled district and name the school it waits on.

The alternative was three thresholds on one field. It forced strength 255 on one rung and a 170% closing point, and made rungs substitutable at the margin.

`Education` keeps its number and its meaning, elementary, so no save moves a byte of it. The three new fields run on the `Education` slot (period 8, offset 3, decay 253/256), since the free period-8 offsets are used up. Their planes cost 196,608 bytes of memory.

### The gates

Every school writes 150 at its door, falling to nothing at the range edge, and every gate reads over 60. Land-value gates, 140 and 190, are unchanged; schooling is an extra gate on level 3, never a substitute for land value.

| Level 3 of | Needs, over 60 | Built by |
| ---------- | -------------- | -------- |
| `ResLow`, `ResMediumRow` | Elementary | Elementary School |
| `ResMedium`, `ResHigh`, `Mixed`, `ComLow` | Middle and high | Middle School and High School |
| `ComHigh` | College | College |
| `Industrial`, `IndHeavy`, `Agriculture` | Nothing | — |

Level 2 is never gated. A city must grow before it can afford a school, and a stop at level 1 until a ¢6,000 purchase is a toll, not a decision. Industry and farms are a young city's tax base, the sector least able to pay for the ladder, so their level 3 stays an order book.

`level3Schooling(zone)` is the one table, so the growth pass, the inspector and the Advisor ask one place which rungs a zone waits on. The gate is chosen by zone, not sector.

`Problem.NeedsSchool` is 1024, the next free bit. It sets on an Active building whose next level is 3, whose land value clears 190 and which fails only schooling. It clears when a school reaches it, and never feeds the abandonment streak.

No rung requires the rung below to have been built. A hard lock on a ploppable is a worse failure than a soft one, so the city is pushed up by needing the levels, not refused the button. Gating industry on education was rejected for the same reason.

### Catchments, not circles

A school reaches people down the road network, as every service does. Its catchment is shorter than its range because coverage falls with distance: the gate sits where the field still reads over 60, at `range × (1 − 60 ÷ 150)`.

Catchments are 708 m, 1,116 m, 1,032 m and 1,872 m, or 0.44, 0.69, 0.64 and 1.16 miles. The ladder is also a ladder of reach: a bigger school serves more people, so it reaches further. Every catchment is walkable or a short bus.

Ranges come from capacity at a town's density. Each is `R ÷ 0.6` with `R = √(capacity ÷ (2 × 2.837))`; the library's range is `R` itself, since it holds no gate. The elementary range moved from 56, untraceable, to 59.

### Funding is one key

`ServiceKind` is the facility kinds the services pass runs. `FundingKey` is the departments the player funds: police, fire, health, education, park. `fundingKeyOf(kind)` maps the four new kinds to `education`. One department pays for all of them, so one slider: `CityStats.serviceFunding` gains no key, `setServiceFunding` is unchanged, no default to load, no save to migrate.

Funding scales range and capacity together. Turning the slider up widens every catchment and serves more people at once: the fast, rented answer to a stalled district. The school is the slow, owned answer.

### The library

A library is a multiplier on reach, not a rung. Inside its range every school's range stretches by up to a fifth: the full fifth at the library's door, tapering to nothing at its edge. The fifth is the uplift at the library, not at the school's gate.

With a library at its door, an elementary school's catchment edge, 35 tiles out, sits where uplift has fallen to about 8%, so the catchment goes to about 38 tiles. It helps most the blocks nearest it, which makes it a siting decision.

It is worth more than a sixth school for three reasons.

- It opens no gate alone, so a library with no school in reach does nothing: the honest model of a branch.
- It is most valuable at a catchment's edge, where a school is weakest.
- It costs ¢38 per thousand served against ¢857, so patching the edge is a real alternative to another school.

The fifth is an unsourced dial: nothing quantifies a library's effect on attainment. It is set to move a catchment edge visibly and no further.

Mechanism: `ServiceSim.tick` runs the library kind first, whatever the registry order. Each library walks once from its nearest road tile and radiates `strength × (1 − d/R)`; that map is the uplift in percent, 20 at the door, 0 at the edge, the strongest winning where two overlap.

Each school then walks to `ceil(range × (1 + maxUplift ÷ 100))`. It uses the local range in the falloff, `strength × (1 − d / (range × (1 + uplift[roadTile] ÷ 100)))`; non-positive values drop. With no library the cap is `range` and every figure is unchanged. With one the walk reaches up to 44% more road tiles (`range × 1.20`), still one traversal a school, and a missed ordering is silent.

The multiplier is on range, never strength. A library cannot raise a school's peak, so it cannot carry a tile across a gate that school could not reach alone. A floor on the education field was rejected: coverage blends by maximum, so a floor under the gate is inert and one above it is a cheaper school.

The library follows the supply-share model: its uplift scales by `min(1, capacity × funding ÷ people in reach)`, so twice its capacity gives half its uplift. Its load shows in the Services panel. Radiation two tiles around each road tile applies to it as to every service.

### When a school is overloaded

A facility serving more people than it has places writes a weaker field. For a school the catchment shrinks toward its door and the edge blocks stop levelling first. The model is unchanged: capacity times funding is divided among the people in reach, every value is scaled by `min(1, supply)`, and supplies add where facilities overlap. There is no `effectiveStrength`.

For one school at load L the value at distance d is `150 × (1 − d/range) ÷ L`, so the gate holds out to `range × (1 − 0.4 L)`: 0.6 of range at 100%, 0.4 at 150%, 0.2 at 200%, nothing at 250%. Every rung closes at the same 250%, having the same strength and gate.

Two schools covering one district pool their places, so a second is a real answer to an overloaded first. Coverage takes the strongest source, not the sum, so two side by side buy capacity, not reach; reach is the library's job.

Risk to watch: load counts the whole reach, not the catchment, as coverage always counted people. A lone school in a fully built district reads about 280%, since its reach holds about 2.8 times the people its catchment does. Schools spaced at catchment distance settle near 100%, so a built-out district needs one school per capacity's worth of people. Changing what load counts is a change to the supply-share model, not to this feature.

### Being told about it

An under-built ladder quietly caps the city, and a cap with no explanation is the worst thing a builder does to a player. So it is told four ways.

- On the lot: **Needs School**, the same kind of marker as no power; the inspector names the missing schools.
- In the Services panel: one Education row a rung and one for the library, each with its load. `Elementary 45% · Middle 310%` is a diagnosis.
- In the lenses: each rung has its own coverage lens.
- From the Advisor: it counts buildings held at level 2 by schooling and names each rung.

### What it does to an existing city

Detached and row housing are as before. Dense housing and mixed use used to open on the elementary school; they now need a middle and a high school from Big Town. Local commercial, never gated, needs the same two. High-density commercial needs a college from Grand City.

Nothing loses a level, since growth gates level-up and never level-down. A building waiting on a school the town cannot yet build is held at level 2, every building's floor in a town that small. This is the one place a service gates growth by a rung the player has not reached, and it is level 3, never the opening. The first-town test is unchanged, and the marker and Advisor land with the gate. [R-world-028]

### Save format

The three planes are appended to the tile record after `waterPipe` and before the road network, never inserted among the nine existing planes, although in memory they are `FieldId` 9–11. A new layer goes last, so an older tile record is a byte-for-byte prefix of the new one.

`SAVE_VERSION` goes 15 to 16; `BYTES_PER_TILE_BY_VERSION` gains v16 at three bytes more; `deserializeGrid` zero-fills the planes for v15 and earlier. An old city loads with no middle, high or college coverage and every building intact. The risk is an older buffer read at new offsets giving a plausible corrupt city; the length check catches it.

The worker protocol gains no message: the field channel carries a `FieldId`, `serviceLoad` gains four keys, `Problem` rides `BuildingDelta`, and `SelectionInfo` gains an optional missing-school list.

### Prices, sizes and draw

Prices are real cost ratios off the elementary school's ¢6,000 and ¢400 a month. Build cost per pupil is from one construction report; upkeep follows staff at 7.3 pupils a member. The college and library have no like-for-like source, and the college price is low: the next source should move it up.

Sizes follow the massing rule: gross floor `w × d × 185 × height ÷ 3.2` m², against a floor per pupil of 140, 160 and 185 sf. The existing school stays 3×3 at 10 m. The grid wins over real school sites, so the shortfall is recorded, not fixed.

Draw follows the civic method: floor times the type's kWh and water intensity. Each rung unlocks at a milestone whose reward covers it outright, so the programme's affordability override never bites. All derivations are in [the sources](../sources/education-ladder.md).

### The kits

The five buildings are drawn as campuses in `src/render/utilitykits.ts`: classroom wings at their stated floor, gyms, grounds and the school bus, claimed in `UTILITY_KIT_CATALOG_IDS`, so the building instancer draws their plinth. Windows use the stations' night material. The art is in [the schools, the college and the library](../art/civic-massing/reading-a-civic-building-at-a-glance/the-schools-the-college-and-the-library.md).

Each part stays inside its lot at all four rotations, and no two masses overlap. Looked at in a browser: the elementary school beside a 4.0 m car and a 1.75 m person; the middle and high schools as long low campuses; the college inside a built-up grid; the library as a library, not a shed; then all five at night. A pedestrian dev hook for the scale shots was declined: parked cars, the bus and the kerb car carry the scale.

## Decided

- One field per rung, over ordered thresholds on one field: no substitution by construction, and every school writes 150.
- One Education slider for all rungs and the library, over a key per rung: one department, no migration.
- A library as a range multiplier, over a field floor: a floor is inert or a cheap school.
- Soft ladder, over requiring the rung below built: a hard lock teaches less.
- Industry and farms ungated, over gating by education: the young city's tax base cannot pay for it.
- Library uplift stays a dial: no source quantifies it.
- Not a sixth school, not per-pupil simulation, not a coverage rework, not new zone levels, not an economic input, not buses or term time.
