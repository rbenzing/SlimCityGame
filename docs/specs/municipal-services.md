# Municipal services

- **Status:** Built

**Owns:** the frame every service epic shares: ladders, travel-based reach, people-based capacity, the save and migration rules, the build order and what the programme refuses. Each epic owns its own numbers.

**Rules:**

- Give every service a ladder: a cheap small facility for a neighbourhood, a large one for a district. `[R-services-038]`
- Reach services along the road network by BFS from the nearest road tile, never by radius. `[R-services-001]`
- Measure capacity in people, not area; over capacity a service degrades smoothly. `[R-services-012]`
- Derive every figure from a published standard and the 20 m tile; a small facility must be affordable on unlock. `[R-services-038]`
- Derive a civic building's draw from its floor at its activity's surveyed intensity. `[R-services-031]`
- Load a save from before an epic with the new service absent, never rejected; no capacity figure means uncapped. `[R-services-012]`
- Re-stamp ploppables from the catalog on load when an epic resizes a shipped footprint.
- Cut funding without expecting load to rise: the budget shows as the size of the area served.

**Numbers:** every draw below is re-derived by the catalog contract test; floors, intensities and sources are in [the sources](../sources/municipal-services.md#what-the-facilities-draw).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Tile | 20 | m | dial `[R-world-001]` |
| Massing floor | 185 m² a tile, 3.2 m a storey | m² | [civic massing](../art/civic-massing/README.md) |
| Police station / district power, water | 24 kW, 2.3 kL / 60 kW, 5.7 kL | kW | [draw](../sources/municipal-services.md#what-the-facilities-draw) |
| Fire station / district power, water | 8.5 kW, 1.6 kL / 25 kW, 4.7 kL | kW | same |
| Clinic power, water | 16 kW, 1.9 kL | kW | same |
| Hospital power, water | 592 kW, 104 kL (382 gal a bed a day, 2,500 sf a bed, 72 beds) | kW | same |
| School power, water | 60 kW, 6.3 kL | kW | same |
| Rail station power, water | 32 kW, 5 kL | kW | same |
| Airport power, water | 400 kW, 175 kL (4 million passengers, 4.2 gal each) | kW | same |
| Incinerator first-draw power, water | 660 kW (63 kWh a ton, 250 tons a day, 17% of 370 kWh), 2 kL | kW | dial for water |
| Coal plant water | 2.5 kL (fifty staff, 13 gal a day) | kL | same |
| Intensities | 13.9 / 17.4 / 28.8 / 9.4 / 8.4 kWh/sf (safety, outpatient, inpatient, education, terminal) | kWh/sf | [CBECS](https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c14.pdf) |
| Funding dial | 0 to 1.5 | × | [service-capacity.md](service-capacity.md) |
| Funding, measured health load | 3% at ×0.10, 8% at ×1.00, 5% at ×1.50 | % | [measured](../sources/municipal-services.md#funding-and-load-measured) |

**Code:**

- `src/shared/types.ts` `ServiceKind`, `ServiceSpec` (capacity added by [service-capacity.md](service-capacity.md)).
- `src/sim/services.ts`: coverage unchanged; load resolved beside it.
- `src/sim/economy.ts`: upkeep per building, scaled by funding.
- `src/sim/buildings.ts`: stamps a footprint into the saved `buildingId` layer, clears a runtime map rebuilt from the catalog.
- `src/data/catalog.json`: entries per epic; draws re-derived by the contract test.
- `src/ui/`: the service panel reports load, not just coverage.
- `src/app/persist.ts`: per-epic state, additive.

**Tests:** the catalog contract test (draws re-derived from floors); the foundation's: capacity 1,000 over 2,000 people halves strength, two facilities sum before the division, a building with no figure is uncapped (written first, so a pre-capacity save plays as before), the load pass adds no second traversal; per-epic tests are in [service-capacity.md](service-capacity.md) and [garbage-recovery.md](garbage-recovery.md).

**Open:** none; the programme is complete.

## Why the rules are what they are

### Three rules, so learning one teaches the rest

A service that is one building with one radius is satisfied once, so the decision of how much to buy and where never arrives. A player with four buildings has finished the service game before the city is a town.

- **A ladder, not a switch.** The small facility is cheap and fits a young city. The large costs more per tile and far less per person, and only pays back with enough people. Too big too early is a mistake the budget punishes; so is forty clinics.
- **Coverage is travel, not distance.** A cul-de-sac serves less than a through road, so building the road is sometimes the answer.
- **Capacity is people.** An overloaded school still teaches, worse, and the panel shows it before the field turns red.

### The loops it closes

Three loops were open, and an open loop cannot be reasoned about:

- Water in, nothing out: no sewage, so a pumping station had no consequence downstream.
- Birth without death: nobody died, so no death care and no ageing pressure on healthcare.
- Collection without processing: rubbish was only buried or burned, so garbage was one dial.

Education already gates what a zone can grow into; the ladder extends that gate. Death care is the first downward pressure on population, which will find assumptions in demand and economy nobody has questioned.

Every dispatching service adds traffic: ambulances, fire engines, garbage trucks, hearses. That congestion lands in the districts that need the service most, and is not smoothed away.

### Funding and capacity

Funding scales range and throughput by one dial, which gives the slider a legible second meaning. The consequence is the opposite of what it sounds like.

- A narrower catchment holds fewer people, and below the point where a facility already reaches the whole city that shrinks demand faster than capacity.
- So the gauge answers "is this facility stretched over the people it reaches", not "have I underfunded this".

The foundation's rule is `effectiveStrength = strength × min(1, 1 / load)`, with `strength` 0..255 written into the field at the source. Two half-loaded clinics and one fully loaded clinic covering the same people give the same result, which makes "build another one" a real answer. A capacity-1,000 facility covering 2,000 people halves its strength, and covering 500 does not double it.

Two risks shaped the build. Capacity makes an old city worse unless an entry with no figure is uncapped. And summing population in reach doubles the traversal unless it rides the coverage BFS, gated by the [performance budget](../engineering/performance-budget.md).

### Saves and migration

Every epic adds state, and the road model's rule holds: a missing field means the city never had this.

- **Resizing a shipped building is a save migration.** `src/sim/buildings.ts` stamps the footprint into the saved layer on placement and clears from a runtime map rebuilt from the catalog. Shrinking the clinic would leave two of four stamped tiles unbuildable forever when an old save demolishes one. Any epic that resizes an entry re-stamps ploppables on load and says so. A height-only change is unaffected.
- **Versions are allocated in build order and no epic owns a number.** Three of the nine append a grid layer; each takes `SAVE_VERSION + 1` when it lands, so two never collide. The other six move nothing.
- **Worker protocol.** New commands per epic, a snapshot carrying per-service load; both additive. See [interfaces](../engineering/interfaces/README.md).
- A facility with no capacity figure, every building in an old save, is uncapped rather than zero. That is the loader's default, not a special case bolted on after.

### Derived draws

A building's floor is its footprint times 185 m² times storeys at 3.2 m; that floor draws the surveyed electricity and water of its activity, averaged over the year. Before this a police station drew the power of 430 houses.

- Floors are stated where the lot is set by bays, apron or car park rather than the floor: stations, the hospital (six of fifteen tiles are a parking deck), the airport terminal.
- The airport's passengers come from its terminal: 125,000 sf serves 600,000 enplanements (Minot, FAA), so a 418,000 sf terminal boards two million and sees four million.
- Water for the incinerator, the pocket park (0.2 kL) and the bus stop stays a dial or nothing: no figure was found.
- The decision each epic's buildings create must be stated; a list of facilities with numbers has designed nothing.

### Sequence

Build order is by how much each epic closes a loop, not by size: 0 service capacity, 1 water and sewage, 2 healthcare and death care, 3 education, 4 emergency, 5 garbage recovery, 6 power, 7 transport depots, 8 parks. The table and the reason for each position are in [the sources](../sources/municipal-services.md#the-epic-order).

- Epic 0 was built for epics 1 and 2 only and allowed to change when emergency arrived with the dispatcher's needs.
- Pairs live in their own specs: [service-capacity.md](service-capacity.md), [garbage-recovery.md](garbage-recovery.md), [education-ladder.md](education-ladder.md), [transport-depots.md](transport-depots.md).

## Decided

- Capacity as an optional field on `ServiceSpec`, not a new grid field per service: a field is a grid-sized allocation and load is per facility.
- A smooth multiplier, not a hard cap: full service at 1.0 load and none at 1.01 is a cliff that makes the panel a pass/fail light.
- A programme of epics, not one big services change: nothing that size is reviewable.
- Own taxonomy and published figures, not another product's catalogue: its numbers are balanced for a different tile and simulation.
- Out: disaster services and road maintenance (no events to answer them), per-citizen simulation, reworking coverage, a general service-vehicle system (each epic uses the existing dispatcher), a plain building catalogue.
