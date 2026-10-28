# Healthcare and death care

- **Status:** Built

**Owns:** the clinic and hospital ladder; deaths and the occupancy that follows them; bodies, their collection into cemeteries and crematoria, the regional funeral service until Big Town, the uncollected-body penalty, the hearse, and the exhumation charge. Coverage and capacity pooling are services; the sums behind each figure are [the sources](../sources/healthcare-and-death-care.md).

**Rules:**

- Accrue deaths from population times a fixed rate and never roll them; the stride choice of resident draws no RNG. `[R-world-010]`
- Population is the sum of occupied residents; the milestone level never falls and a shrinking city abandons nothing. `[R-world-009]`
- Collect bodies along the road network by BFS, never by a straight-line radius; a full cemetery collects nothing. `[R-world-011]`
- Below Big Town the regional service takes every uncollected body the tick it falls, billed per body; from Big Town it ends. `[R-world-014]`
- Apply coverage first and the uncollected-body penalty second, in the same pass. `[R-world-015]`
- Never feed the penalty, a backlog or a health reading back into the death rate. `[R-world-016]`
- Charge the exhumation in hand before a cemetery with interments comes down; undo returns it exactly. `[R-world-012]`
- Price death-care capital on one scale, about $200 to the ¢, set by the cemetery. `[R-world-013]`
- Derive a civic building's draw from its floor, and park a hospital to code: 2 spaces a bed. `[R-services-031]` `[R-services-032]`

**Numbers:** derivations and links are in [the sources](../sources/healthcare-and-death-care.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `DEATH_RATE_PER_RESIDENT_PER_TICK` | 9 per 1,000 a year; 1.25e-7 (CDC 9.03 in 2024) | per resident per tick | [death rate](../sources/healthcare-and-death-care.md#the-death-rate-and-what-a-tick-is) |
| Game month; year | 6,000 (200 × 30); 72,000 | ticks | same |
| Death stride | `(n × 7919) mod population` | resident index | dial |
| Re-let of a vacancy | 41 (NAR 4 weeks) | game days | [re-let](../sources/healthcare-and-death-care.md#re-let-of-vacancies) |
| Regional funeral fee `REGIONAL_FUNERAL_FEE` | ¢3.6 ($3,272; $2,900 cremation, $3,900 burial) | ¢ a body | [fee](../sources/healthcare-and-death-care.md#the-regional-funeral-fee) |
| Cremation share of US dispositions | 62.8 (0.628 / 0.372) | % | same |
| `DEATH_CARE_MILESTONE` | Big Town, 3,500 | people | dial, `BIG_TOWN_MILESTONE` |
| Clinic | 8,000 people, range 40 tiles (800 m, 82 s), 4 doctors, 1×2, 6.4 m, 740 m², ¢5,000, ¢380, milestone 1 | mixed | [capacities](../sources/healthcare-and-death-care.md#capacities) |
| Clinic panel | 2,000 each (1,947 workable, 2,300 observed) | people | same |
| Clinic area a provider | 1,000–1,500 | sf | [the clinic](../sources/healthcare-and-death-care.md#the-clinic) |
| Hospital | 30,000 people, 72 beds, range 72 tiles (1,440 m), 3×5, 27 m, 16,700 m², ¢18,000, ¢1,300, milestone 3 | mixed | [hospital](../sources/healthcare-and-death-care.md#hospital-30000-people) |
| Hospital storeys; floor to floor | 6; 4.5 | m | [sizes](../sources/healthcare-and-death-care.md#the-hospital) |
| Hospital floor a bed | 2,500 | sf | same |
| Hospital parking | 144 spaces, 72 a level, 2 a bed, deck 3.35 m, 2 levels | spaces | [parking](../sources/healthcare-and-death-care.md#hospital-parking-to-code) |
| Accessible spaces | 5, 1 van (149 spaces, ADA §208.2) | spaces | same |
| Cemetery | 3×3, 3.2 m, 780 plots, ¢3,500, ¢140, milestone 0, range 40 tiles, 2 hearses | mixed | [plots](../sources/healthcare-and-death-care.md#cemetery-780-plots) |
| Cemetery ground | 1,000 graves an acre, 4.05 m² a grave, 98 a tile | graves | same |
| Cemetery draw | 0.0021 MW, 0.2 kL (128 m² gatehouse) | MW, kL | [draw](../sources/healthcare-and-death-care.md#the-cemeterys-draw) |
| Crematorium | 2×2, 6.4 m, 1,480 m², 2,080 a year, ¢3,800, ¢600 (dial), milestone 3 | mixed | [crematorium](../sources/healthcare-and-death-care.md#crematorium-2080-cremations-a-year) |
| Crematorium rate; credit cap | `CREMATIONS_PER_YEAR` ÷ 72,000 = 0.0289 a tick; `CREMATION_CREDIT_CAP` 8 | cremations | same |
| Crematorium draw; pollution; flue | 0.0131 MW, 2.4 kL; 1 (0.07 raw); 7.6 m (25 ft) | MW, kL, m | [crematorium](../sources/healthcare-and-death-care.md#the-crematorium) |
| `EXHUMATION_FEE_PER_INTERMENT` | ¢14 ($2,850); ¢10,920 for 780; ¢9,170 net | ¢ a grave | [exhumation](../sources/healthcare-and-death-care.md#exhumation-14-a-grave) |
| Body penalty | 32 per body per game month, of 255; one clinic writes 140 | field points | dial |
| Penalty radius | 2 tiles orthogonal (diamond) | tiles | `radiateWeighted` |
| `DEATH_CARE_PERIOD` | 10 | ticks | dial |
| Price scale | $200 to the ¢; $898 a plot (Homer AK) | $ | [prices](../sources/healthcare-and-death-care.md#the-price-ladder-in-dollars) |
| Vehicles | ambulance 6.9 × 2.5 × 2.7; hearse 6.2 × 1.9 × 1.9; car 4.0 | m | [vehicles](../sources/healthcare-and-death-care.md#vehicles) |

**Code:**

- `src/shared/types.ts` `DeathCareSpec`, `BuildingInstance.vacancies`, `VehicleKind.Hearse` (= 8), `SimSnapshot.deathCare`, `SelectionInfo.deathCare`: the contract.
- `src/shared/occupancy.ts` `occupiedResidents`: the one helper that says how many people live in a building.
- `src/shared/constants.ts`: the death-care constants named above.
- `src/data/catalog.json`: `hospital`, `cemetery`, `crematorium` added; `clinic` resized.
- `src/sim/deathcare.ts` `DeathCareSystem` (`tick`, `collect`, `setInterments`): deaths, re-let, backlog, road-BFS collection, regional service, cremation credit.
- `src/sim/services.ts` `ServiceSim.tick`: capacity pooling reads `occupiedResidents`; the backlog penalty after coverage.
- `src/sim/economy.ts` `EconomySystem.tick`: population, rent and tax from `occupiedResidents`; regional fees as an expense.
- `src/sim/garbagetrucks.ts` `GarbageTruckSystem`: takes its pool size, so a second instance drives the hearses.
- `src/sim/worker.entry.ts` `cmdBulldoze`, `selectionOccupancy`: the pass slot, the hearse fleet, the snapshot block, the exhumation charge.
- `src/sim/buildings.ts` `restampShrunkPloppables`: re-stamps the resized clinic on load.
- `src/app/persist.ts` `SaveMeta.deathCare`, `vacancies`: the saved counters.
- `src/render/utilitykits.ts`: hospital block, canopies, parking deck and accessible spaces; cemetery kit and `setInterments` headstones; crematorium kit.
- `src/render/servicevehicles.ts`: the hearse mesh, the sixth service-vehicle kind.
- `src/tools/tools.ts` `gravesUnder(tiles)`: the bulldoze cursor quotes the charge.
- `src/ui/advisor.ts`, the inspector in `src/ui/`: plots used of total, `{ cremated }`, the four death-care advisor issues.

**Tests:**

- `src/sim/deathcare.test.ts`, `deathcare.collection.test.ts` — accrual, stride, re-let, collection order, full cemetery, regional fee, cremation credit and cap.
- `tests/interaction/deathcare.test.ts` — the loop end to end, exhumation and its undo.
- `src/shared/occupancy.test.ts`, `src/sim/economy.test.ts`, `src/sim/buildings.test.ts` — occupied residents, rent on the occupied, clinic re-stamp at every rotation.
- `src/sim/services.test.ts` — coverage before penalty, a clinic on a penalised tile, hospital capacity halving.
- `src/shared/contracts.test.ts`, `src/app/persist.test.ts` — catalog derivations, an old save loading full.
- `src/render/servicevehicles.test.ts`, `vehicles.test.ts`, `geometrybudget.test.ts`, `src/sim/garbagetrucks.test.ts`, `src/ui/InfoPanel.test.tsx` — hearse, mesh budget, inspector.

**Open:**

- The crematorium's ¢600 upkeep is a dial: no US crematory operating cost was found (gas is 12.5–28.5 therms a cremation by one maker's metering; staff unpublished).
- The fill gauge in the services panel is not built; the inspector and the advisor carry it.

## Why the rules are what they are

### Why two rungs and a death side

One clinic satisfied the whole city: health is a single field and one building filled it, with no size or siting decision. A hospital serving a district and a clinic serving a street write the same `health` field, so this needs capacity pooling more than any other service.

Population had only ever gone up, so the city had no death side and no death care. Burial is the one municipal service whose resource is land you never get back. A district that stops collecting its dead goes grey on a lens the player already reads.

There is no third rung. Eldercare would need an age structure the city does not have, so a care home would be a clinic with a different roof. A middle rung sits in a band where the answer is already "build a second clinic".

A clinic runs out of reach before capacity: 40 tiles is 800 m, and a suburb inside that is nowhere near 8,000 people. A hospital runs out of capacity before reach: a dense district holds more than 30,000. So a stretched clinic wants another clinic elsewhere, and a stretched hospital another hospital anywhere.

### Deaths, vacancies and who lives where

A fractional city counter advances each tick by `population × DEATH_RATE_PER_RESIDENT_PER_TICK`, derived from the calendar constants and not written as a literal. When it passes 1 the counter drops by 1 and one death falls.

The _n_-th death goes to the occupied resident at `(n × 7919) mod population`. The walk is over Active buildings in id order, summing `occupiedResidents`, and that building's `vacancies` rises by 1. A 300-resident tower takes a hundred deaths to a three-resident house's one. A fully vacant building takes none.

There is no RNG, so a run is identical across a save and reload. Deaths this tick and in total are exposed so bodies can hang on them.

`occupiedResidents(spec, inst)` is 0 unless the building is Active, else `max(0, spec.residents − vacancies)`. Nothing else reads `spec.residents` to count people: population, rent, the tax correction, capacity pooling, the inspector, ridership, garbage and the registry totals all ask it. Gates that once differed between those readers are the helper's one gate. A farm counts like any home.

Vacancies are whole residents so the sum stays an integer and the save carries an integer. A building completing construction moves in full; a level-up or rebuilt building is a new instance and starts with none.

While `demand.res > 0` each vacancy is re-let in 41 game days on average. A re-let counter advances by `totalVacancies ÷ (41 × TICKS_PER_DAY)` and not at all while demand is at or below zero. When it passes 1, one vacancy is filled by the same stride walk, with its own persisted count.

Demand's magnitude does not scale the rate, since that would be an unsourced dial. The pass lives in `deathcare.ts` beside the deaths, not in growth's pass: growth runs every tenth tick and does not see demand and population fall in one call, and one module should own both halves of the loop.

The pass runs after the economy and before the snapshot, so it reads the population and demand of the same tick. Loading clamps a stored `vacancies` to the catalog's `residents`.

### A shrinking city

At 9 deaths per 1,000 a year against positive demand the sink is a slow leak: in-migration refills homes faster than deaths empty them. A city that has stopped attracting residents shrinks instead of standing still.

- **The milestone ratchet.** The level stays a ratchet and never falls. `computeMilestoneProgress` clamps to 0 below the threshold, which is the truth: none of the way to the next. A second invented measure was dropped.
- **Demand's denominators.** The `max(200, …)`, `max(400, …)` and `max(600, …)` floors guard divide-by-zero, not shrinkage. As population falls, `employed` and the denominator fall with it, so residential demand rises. That is the labour-market pull that re-lets homes and keeps a leak from becoming a collapse.
- **The commercial term.** Population falling against constant jobs drives commercial demand sharply negative and lights `Problem.LowDemand`. It stays display-only: abandonment triggers on NoPower, NoWater and NoRoad alone, and a test holds that.
- **Direct readers.** Monthly tax, `selectionOccupancy` and `tripsForTick` read occupancy, not population; thinning traffic is expected.

### Bodies and their collection

Each death also leaves one body at the building where it fell: that building's anchor tile and the tick it fell. The backlog is a list of `{ tile, count, sinceTick }`, bodies on one tile in one tick merged, and it persists. A body leaves only by being collected.

Collection reuses garbage's mechanism, not the dispatcher's. A cemetery with room reaches the road tiles its street connects to within `collectionRange` by `roadBfsDistances`, radiated two tiles by `radiateWeighted`. A building is reached when any tile of its footprint is, so a building cut off by road is not collected however near it stands.

Bodies go in building-id order, then tile, then the tick they fell. Each is interred in the reaching facility with room that stands nearest, the highest coverage over the footprint, ties by facility id. One body is one interment; a full cemetery (`interments ≥ plots`) is skipped.

The search runs the tick a body falls and then every `DEATH_CARE_PERIOD` (10 ticks, half a game hour) for what still waits, so a town with nothing to collect pays for nothing per tick.

A cemetery reaches 40 tiles, the health ladder's clinic band, since death care rides the health department and no standard gives a reach. It writes no coverage field and the dock lists it under Health. Its category is `service` with no `service` spec.

### The regional service until Big Town

A village does not run a funeral service. While `milestoneLevel < DEATH_CARE_MILESTONE` every body no local facility collected that tick is taken off the map the tick it falls. Nothing lies uncollected and no penalty accrues.

The month's count, `regionalThisMonth`, is billed by the settlement at `REGIONAL_FUNERAL_FEE` as an expense and cleared there. It has no vehicles.

From Big Town it stops, and a body no cemetery collects stays where it fell. A cemetery placed earlier collects first, so the fee is only paid on bodies the town did not bury itself; it unlocks at milestone 0 so a town can switch early. Its hearses run before Big Town as after.

This is the rung the drains have, for the same reason: a town of a few thousand buys the service in, and one past that line runs it. The advisor warns one rung before Big Town if no cemetery stands, as `septic-outgrown` does.

The fee is cheap on purpose: a regional service is the cheap way to be a village, and the cemetery is what a town builds because it must.

### Cemetery, crematorium, and what a full cemetery costs

A cemetery fills: a city of 20,000 fills one in four game years. A crematorium has no capacity, only a throughput credit; it never fills, costs about one cemetery, emits a little, and is the only permanent answer. A full cemetery has three answers.

- **Build another cemetery.** ¢3,500 and nine more tiles, permanently; those tiles never come back.
- **Build a crematorium.** About the price of one cemetery; the trade is land and running cost. At ¢600 a month against ¢140, a city that keeps burying overtakes it around its fifth cemetery, having committed 45 tiles (1.8 hectares) it can never rezone.
- **Do nothing,** and find out what that costs.

Cremation is a credit. Each tick `collect` adds the crematorium's `rate` to its credit, capped at `CREMATION_CREDIT_CAP` (one working day, 8), so an idle one banks nothing past a day. It has room for `floor(credit)` bodies, and each cremation spends one credit and adds one to its count. It competes with cemeteries in the one order: highest road reach first, ties by facility id, both kinds in one list. A crematorium with its credit spent takes no more that tick; the rest go to the next facility or wait. No random draw is made.

Hearses depot at a crematorium exactly as at a cemetery.

### Demolishing a cemetery

`cmdBulldoze` sums the graves of every cemetery on the cleared tiles and charges `EXHUMATION_FEE_PER_INTERMENT` each, in hand before anything is taken down. With funds short of the charge alone, before the refund, the whole bulldoze is refused for funds and nothing changes, so the preview and the world agree.

The usual 50% refund of build price stands and the charge is subtracted from it; the ack's cost is the net. Clearing a full cemetery costs about three times what it cost to build. An empty one demolishes normally.

The inverse is a `placeBuilding` carrying `interments`, sent only by this undo. It stands the cemetery back through `DeathCareSystem.setInterments`, prices the placement at build cost less the charge, and hands the charge back exactly. The bulldoze cursor quotes the charge and the grave count first.

### The uncollected-body penalty

A body nobody comes for stays at its building and subtracts from the health field there and on every tile within two orthogonal steps, the shape a clinic's coverage radiates in with the sign reversed. The penalty grows with neglect, not city size.

`ServiceSim.tick` takes the backlog and the tick number. After every kind's coverage is written, for each tile holding bodies it subtracts `min(255, count × 32 × (ticksUncollected ÷ 6000))` from `FieldId.Health`. `count` is summed over the tile's entries, each aged by its own `sinceTick`.

One body left four months all but cancels a clinic's 140; eight takes the tile to zero. Health feeds happiness and happiness feeds residential demand, so a district that stops burying stops attracting residents.

Order is a rule: coverage first, penalty second, or building id order decides the outcome. Coverage is a max-blend of the field and the penalty a subtraction, so a clinic placed on a penalised tile raises it to its strength on the next pass and the penalty comes off that, in any placement order.

The 32 is a dial with no published figure behind it. It is tuned so the warning lands before the field moves, and raising the death rate later would invert that. The penalty never feeds the death rate: a death spiral is a trap, not a lesson.

The player sees it in four stages: a gauge game-years ahead (plots used of total, as a landfill reports fill), an advisor notification at once, the health lens a month later, and happiness and demand later still.

### Visibility

`SelectionInfo.deathCare` is `{ used, total }` for a cemetery and `{ cremated }` for a crematorium. `SimSnapshot.deathCare` is sent every snapshot: `facilities` (`{ id, used, total }`), `crematoria` (`{ id, cremated, room }`), `uncollected`, `regionalThisMonth`, `uncollectedAt` (the tile of the oldest).

The advisor reads it as pure functions: the first uncollected body warns at once; a full cemetery with bodies uncollected warns again; one rung before Big Town with no cemetery, an info issue says the regional service ends there.

### Hearses

Hearses are cosmetic and ride a second `GarbageTruckSystem`. Each local collection queues one visit, the building's tile, and the cemeteries are the depots with `hearses` a budget each, in `VehicleKind.Hearse` livery: depot, building, depot over the road graph. Visits are runtime state, and the regional service sends none.

`Hearse = 8` is appended after `Recycling = 7`; the kind is not persisted, but it costs one more `InstancedMesh` permanently, charged against the performance budget. The ambulance is 0.7 m longer and 0.8 m taller than the hearse, so the silhouette read comes from height and livery as much as length. Hearses are the densest where deaths are, which is the interesting traffic problem and is not smoothed away.

### Sizes and the one stated floor

Footprints follow the massing formula, gross = `w × d × 185 × (height ÷ 3.2)`, with three deliberate breaks. The cemetery is sized by ground alone. The crematorium's 6.4 m is one tall storey counted as two floors. The hospital's 16,700 m² is stated, not read off its 3×5 × 27 m, which the formula would read as 23,400 m². The contract test re-derives its draw from the stated floor.

Six of the hospital's fifteen tiles are the parking deck, which is why per tile it is less than half the clinic's price while still cheaper per person. The deck is ground, not floor, and every count in it is derived in `src/render/utilitykits.ts` and checked by its tests.

The clinic was resized from 2×2 × 14 m (3,237 m²) to 1×2 × 6.4 m, with its draw re-derived at the same intensities. A save from before stores the 2×2 stamp, and the loader's `restampShrunkPloppables` re-stamps it onto the 1×2 inside its old footprint that still fronts its street, at every rotation. Nothing new was needed.

The kits: the cemetery is lawn, drive, gatehouse, fence, trees and headstones. The crematorium is three `InstancedMesh` (lawn plate with forecourt, the merged building, the flue). The hospital carries an ambulance canopy by the main entrance.

### Saves and the protocol

No tile layer is added, so `SAVE_VERSION` and `BYTES_PER_TILE` stay. A save written before loads with the service absent, never rejected.

- **`SaveMeta.deathCare`**: the death remainder, running death count, re-let remainder and running re-let count; `interments` (`{ id, count }` per facility, dropped when the building is gone); `backlog` as `{ tile, count, sinceTick }` with `tile` a grid index; `regionalThisMonth`; and `cremation` (`{ id, credit, cremated }`), the credit capped at 8 on load. The backlog is a historical fact, unlike trash, which regenerates on load.
- **`vacancies`** on a building instance: an integer from 0 to the catalog's `residents`, written only above 0, absent meaning 0, so an old save loads with every building full.
- Malformed values load as zero and a bad backlog entry is dropped.
- **Worker protocol**: `SimSnapshot` gains an optional `deathCare` block. No new `Command` (`placeBuilding` and `bulldoze` exist) and no new `ServiceKind`, since death care writes no coverage field and rides the `health` funding.

## Decided

- No `deathcare` `ServiceKind` with its own funding slider: it writes no coverage field and would change `CityStats`, the HUD and the save for no decision.
- Hearses do not ride `DispatchSystem`: a funeral is not an incident, `Incident['kind']` should not gain a member, and ambulances should not compete with hearses for 32 slots. `VehicleKind.Car` would run magenta hearses, and `Ambulance` puts a cross on a funeral.
- A per-building occupancy, not a city-level population deficit: a second authoritative number drifts from the building set.
- The cemetery is smaller than the planning standard (one acre per 1,000 population lasts 111 game years): it must fill inside a session.
- Not disease, epidemics or health events; not ages, cohorts or cause of death; not grave reuse, which real jurisdictions do after 20 to 75 years and no session would see.
- Not a death spiral: uncollected bodies hit one field and stop. Not a rework of coverage or the road BFS: the penalty rides the pass that exists.
- The first-plan crematorium price (seven cemeteries) was replaced by the sourced ¢3,800: the trade is land and running cost, not the build price.
- The per-tile price clause of the ladder gives way to the deck: parking to code is worth more than a contrived price ratio.
- The crematorium's ¢600 upkeep and the cremator hall's 240 m² have no published source and stay dials.
