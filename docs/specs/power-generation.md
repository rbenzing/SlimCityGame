# Power generation

- **Status:** Built

**Owns:** what the grid counts a generator for, the six generators (wind, solar, gas, coal, combined cycle, nuclear), the shoreline gate and spacing, and the sourced rating, factor, size, price, upkeep, smoke and water of each. The brownout cut rule is in the utilities model.

**Rules:**

- Count a generator for its nameplate times capacity factor, a published share of the year; the inspector shows both. `[R-services-003]`
- Count solar and wind for their year's average, never by the hour; smoke follows energy delivered. `[R-services-004]`
- Sum supply as one city-wide total; an unconnected generator still counts. `[R-services-007]`
- Cut a shortage from the grid's far end as a hard cut on footprint tiles; never dim. `[R-services-007]` `[R-services-008]`
- Flag a generator whose footprint touches nothing that conducts power `NoRoad`, so supply never reads healthy while nothing is served. `[R-services-009]`
- Reach buildings along sealed roads and power lines by BFS, never a radius. `[R-services-001]` `[R-services-006]`
- Place a nuclear station only with a footprint tile touching water; keep `spacing` clear tiles between turbines. `[R-services-003]`
- Derive every rating, factor, cost and upkeep from a published figure; add no prerequisite to the first town. `[R-services-038]` `[R-world-028]`

**Numbers:** every derivation and source table is in [the sources](../sources/power-generation.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Per-capita demand | 1.37 | kW a person | [12,000 kWh a year](../sources/power-generation.md#per-capita-demand) |
| Wind `powerMW` / `capacityFactor` / delivers | 1 / 0.20 / 0.2 | MW | [DW61](../sources/power-generation.md#the-wind-turbine) |
| Wind footprint / height / `spacing` | 1×1 / 69 / 3 | tiles / m / tiles | same |
| Wind cost / upkeep | 190 / 3 | ¢ / ¢ a month | PNNL $4,310/kW, same |
| Solar `powerMW` / `capacityFactor` / delivers | 1 / 0.232 / 0.23 | MW | [EIA 4.08.B](../sources/power-generation.md#capacity-factors) |
| Solar footprint / height | 6×6 / 2.9 | tiles / m | [solar farm](../sources/power-generation.md#the-solar-farm) |
| Solar cost / upkeep / water | 97 / 2 / 0 | ¢ / ¢ a month / kL | same |
| Gas `powerMW` / `capacityFactor` / delivers | 50 / 0.139 / 6.95 | MW | [units](../sources/power-generation.md#the-units) |
| Gas footprint / height / stack | 2×2 / 14 / 30.5 | tiles / m / m | [footprints](../sources/power-generation.md#footprints) |
| Gas cost / upkeep / pollution / water | 3,170 / 256 / 5 / 0 | ¢ / ¢ a month / field / kL | [costs](../sources/power-generation.md#costs) |
| Coal `powerMW` / `capacityFactor` / delivers | 60 / 0.426 / 25.6 | MW | [coal](../sources/power-generation.md#the-coal-plant) |
| Coal footprint / height / pollution | 4×4 / 22 / 140 | tiles / m / field | anchor |
| Coal cost / upkeep / water | 12,000 / 800 / 2.5 | ¢ / ¢ a month / kL | anchor |
| Combined cycle `powerMW` / `capacityFactor` / delivers | 89 / 0.605 / 53.8 | MW | units |
| Combined cycle footprint / height / stack | 4×3 / 24 / 40 | tiles / m / m | footprints |
| Combined cycle cost / upkeep / pollution / water | 5,260 / 1,030 / 26 / 1.2 | ¢ / ¢ a month / field / kL | costs |
| Nuclear `powerMW` / `capacityFactor` / delivers | 77 / 0.908 / 69.9 | MW | units |
| Nuclear footprint / height | 6×5 / 24 | tiles / m | footprints |
| Nuclear cost / upkeep / water | 68,800 / 1,314 / 4.9 | ¢ / ¢ a month / kL | $20,100/kW, costs |
| Unlocks | Tiny Village (wind, solar, coal) / Small Town / Small City / Grand City | milestone | by name in `MILESTONES` |
| Pollution anchor, residential condemn | 140, 170 | field | coal TRI anchor |
| `VISUAL_DAY_TICKS` | 2,400 | ticks | code |

**Code:** `src/data/catalog.json` — the six generator entries and their `capacityFactor`, `spacing`, `requiresAdjacent`.
`src/shared/power.ts` `averageOutputMW` — nameplate times factor.
`src/sim/network.ts` `recomputeUtilities`, `utilityCanDeliver` — supply sum, shortage cut, delivery check. `src/sim/growth.ts` `flagUnservedUtilities` — the `NoRoad` flag.
`src/sim/worker.entry.ts` `crowdsItsKind`, placement gate — spacing and the `requiresAdjacent: 'water'` branch; `cmdPlaceBuilding` refuses.
`src/shared/types.ts` — `UtilitySpec.capacityFactor`, `requiresAdjacent`, `SimSnapshot.powerSupply`, `powerDemand`.
`src/render/utilitykits.ts` `UTILITY_KIT_CATALOG_IDS` — the plant kits; `src/app/persist.ts` — untouched, the save names `catalogId`.

**Tests:** `tests/interaction/firsttown.test.ts` — the opening is untouched. The catalog contract test pins every figure above. `network.test.ts` pins supply rising by exactly `powerMW × capacityFactor` and the far-end cut.
Placement tests pin the water gate (refused with no adjacent water, accepted one tile nearer, footprint still not on water; rail, pump, drain and works keep theirs). Loader tests pin an older save intact and an unknown `catalogId` skipped. `utilitykits.test.ts` pins layouts at four rotations and solar rows facing one way.

**Open:** none

## Why the rules are what they are

### What the grid counts

The city had a turbine delivering 0.2 MW on average and a coal plant delivering 25.6, both placeable for ever. Growth was answered by repetition. With every zoned `powerUse` a surveyed average, a developed economy draws about 1.37 kW a person, so a Metropolis of 50,000 draws 70 MW: three coal plants.

Three plants is not a chore, so the ladder's case is choice. Three coal plants lay 420 pollution over three neighbourhoods and cost ¢2,400 a month. On turbines it is 350 machines on 350 tiles. The ladder sits between: a small clean step, a station carrying a city on a fifth of coal's smoke, and a project carrying a Metropolis with none.

A generator is worth `powerMW × capacityFactor`, the share of the year a plant of its kind runs at rating. `UtilitySpec.capacityFactor` holds it; the grid sums it and the inspector shows both. Supply is an average, so a plant here serves the people its real counterpart does.

The player chose real machines that fit over utility-scale ones. A 250 MW block would carry 110,000 people and a 1,100 MW reactor 730,000, more than any city can grow. Each rung below carries about the next milestone.

### Supply is one total, and the cut is a hard one

`recomputeUtilities` sums each Active or Constructing generator's `averageOutputMW` into one city-wide `powerSupply`. A generator on an island with no road or line still counts. It sums `powerUse` over every non-Abandoned building into `powerDemand`.

Coverage is a walk from the road or power-line tiles beside a generator's footprint, across sealed streets and lines, then one step onto non-road tiles. When demand exceeds supply the cut runs from the far end.

- It is a hard cut: no partial supply, no reduced effect.
- It is furthest-first. Buildings line up by network steps from the nearest generator, so the edge goes dark and stays dark; an abandoned building keeps its place in line.
- The streets stay lit. Only footprint tiles clear, so the lamp pass, reading the road tile's power bit, carries on.
- Growth waits. Nothing spawns or levels up into a shortage `[R-world-047]`, and the Advisor names the shortage while it holds anything back.
- A building three growth passes without power abandons.

The shortage flag only says why: `PowerShortage` sits beside `NoPower` and never abandons alone. This feature does not change the rule; it gives the player somewhere to go before it fires. The ceiling stays a cliff: a city one MW short abandons its far end while the lamps outside burn. The ladder makes the cliff avoidable.

A generator that cannot deliver must say so, because supply counts it anyway. `utilityCanDeliver` is the same predicate the coverage walk seeds from; touching a road is not enough, since an unsealed lane conducts no power.

Supply is city-wide, so any generator feeds any consumer the sealed roads or a strung line reach. The reactor's shoreline siting makes the line load-bearing. Power is a utility, not a service field, so it consumes nothing the service-capacity model builds.

### Supply never varies with the hour

Solar and wind count for their year's average, night and calm inside the capacity factor. The cut rule abandons districts rather than dimming them, and `VISUAL_DAY_TICKS` is 2,400 ticks, about six real minutes at 1×. A day-linked output would swing supply every few minutes and roll abandonment across the edge on that cycle.

Taking intermittency later needs, in order: a supply reserve the player can see, a storage building that turns surplus into headroom, and a cut rule that sheds by priority rather than by id. A peaker likewise counts for its year, since the game has no load curve; what it buys is a small, cheap, clean step.

### The ladder

| Plant | Unit | Delivers | Footprint | Pollution | Cost | Unlocks at |
| ----- | ---- | -------- | --------- | --------- | ---- | ---------- |
| Wind Turbine | EWT DW61, 1 MW | 0.2 MW | 1×1 | — | ¢190 | Tiny Village |
| Solar Farm | 1 MWac array | 0.23 MW | 6×6 | — | ¢97 | Tiny Village |
| Gas Turbine | GE LM6000 | 6.95 MW | 2×2 | 5 | ¢3,170 | Small Town |
| Coal Power Plant | 60 MW unit | 25.6 MW | 4×4 | 140 | ¢12,000 | Tiny Village |
| Combined-Cycle | Siemens SCC-800 | 53.8 MW | 4×3 | 26 | ¢5,260 | Small City |
| Nuclear Station | NuScale US460 | 69.9 MW | 6×5 | — | ¢68,800 | Grand City |

Each choice is a trade, per megawatt delivered (the full table is in [the sources](../sources/power-generation.md#the-ladder)).

- **Solar trades land for money.** Cheapest to build and run, no smoke, but 6.4 kW a tile: a 6×6 lot gives less than one turbine. A Metropolis on solar alone wants 300 farms, about a sixth of the map. A village can live on one.
- **Gas is the small clean step.** A peaker runs 13.9% of the year, so 50 MW delivers 7, about 5,000 people. A quarter of a coal plant's price, a thirtieth of its smoke.
- **Combined cycle supersedes coal.** Gas exhaust burned again through steam: two-thirds of the fuel per MWh, three-fifths of the year. Per MW delivered, a fifth of coal's build, three-fifths of its upkeep, a tenth of its smoke. The question from Small City is when to stop burning coal.
- **Nuclear is the ceiling and a project.** One module carries a Metropolis with no smoke, but ¢68,800 is about two months of a Grand City's gross tax, for no more power than a combined-cycle station and a gas turbine give at a seventh of the price.

The solar farm is optional at the first milestone, joining wind and coal as a Tiny Village generator, so the opening is untouched and the first-town test does not change. Solar was once ruled out on land area; at real density the little it delivers is honest, and the land is its price.

### Siting

The reactor is the first generator that cannot go just anywhere: its footprint must touch water. A reactor rejects about twice its electrical output as heat, and US stations take that from a river, a lake or the sea. In the game that is the shoreline, also the best land, so the reactor costs ground as well as treasury and the power line carries its output inland.

`requiresAdjacent` takes `'rail' | 'water'`; the water member arrived with the pumping station. The worker refuses a build whose footprint has no orthogonally adjacent water tile, against `GridState.water`. The footprint stands on land and merely touches water, so the reactor adds no gate code.

A clearance ring around the reactor was rejected: a placement gate cannot stop a zone growing a house inside the ring afterwards. `requiresAdjacent` is read in one place, so it must not become a general placement-predicate system. Risk: 6×5 contiguous buildable tiles on a shore is a real demand on generated terrain; the tests measure it, because a gate nobody can meet is a wall.

The wind turbine is the one entry with `spacing: 3`: three clear tiles between it and another turbine in any direction, so centres stand 80 m apart against a 61 m rotor and no blade sweeps another's. Three rotor diameters is nine tiles, too far for a game whose power lines join the row. The wake loss is not modelled. A turbine carries no `noise`, below the field's floor.

### Sizes, smoke and price

A 1×1 turbine is right: its spread footing is one tile. It is drawn at the size of its machine, a distributed-wind class the map can hold, after a 103 m hub and 134 m rotor proved too large: a city block under one rotor. It still stands over the town twice.

Footprints come from the nearest evidence each has, since a boiler hall is one volume with nobody in it. Real sites are larger and the grid wins, as for schools. The reactor's 6×5 keeps inside the six-tile rule. Heights are the tallest enclosed volume, stacks left to the kit: 14 m, 24 m, 24 m. A NuScale module sits in a pool below grade in a flat-roofed building: there is no dome.

Smoke follows energy delivered: NOx + SO₂ + PM per MWh at today's limits, times megawatts delivered, on the coal plant's anchor of 140. Gas lands at 5, combined cycle at 26, solar and nuclear at nothing. The pollution field condemns housing above 170: one coal plant sits just under it and two overlapping pass it, while housing grows beside a gas turbine or combined-cycle station.

Coal keeps its anchors: ¢12,000, ¢800 and pollution 140 predate the rest and everything else is scaled to them. Raising it to a real 600 MW unit was rejected: it collapses the bottom of the ladder, the half a new player meets. Per-network supply islands were rejected as their own change to what supply means.

Costs are capital per kilowatt on coal's scale (¢1 for $22,500). Upkeep is fixed and variable O&M plus fuel at the output delivered (¢1 a month for $10,814 a year). The reactor is priced at the real project's $20,100/kW, not EIA's table $8,349/kW, whose ¢28,570 the player rejected. Water is staff water at 13 gallons a head; cooling water is raw, never the city's.

### The kits

Four kits join `UTILITY_KIT_CATALOG_IDS`, each a pure layout from the catalog footprint with merged low-poly geometry, instanced, no `Math.random` and no `Date.now`. Each is read by its plant: filter house and stack, heat-recovery boiler and taller stack, reactor building and switchyard. The art is in [the generators](../art/civic-massing/reading-a-civic-building-at-a-glance/the-generators-solar-gas-combined-cycle-and-the-reactor.md).

Solar rows face the sun's noon side whatever the lot's rotation. The reactor's intake stands on the edge touching water, found as the sewage works finds its outfall. A kit's stacks may stand above its catalog height, so nothing in picking, outline or bulldoze may assume kit geometry stays inside the catalog box.

Risk: a Metropolis on solar is 300 farms, so the frame time with a field of farms is measured against the performance budget. Browser checks: a gas turbine beside a police station (both 2×2, so the stack must work), a combined-cycle station on an avenue with a 4.0 m car, a reactor on a shoreline beside the Podium Tower `res-tower-1` at 38.4 m, solar farms turned, the ghost over dry land refused, and night, where only the turbine's nacelle beacon reacts.

### Save format and protocol

No save change: a save stores buildings by `catalogId` string and the catalog is code data. An older save loads with every building and figure unchanged. A save naming a `catalogId` the catalog lacks loads with that plant absent: `recomputeUtilities` skips a miss, because a missing id means the city never had it, never reject the file. No command and no snapshot field is new.

### The re-derived baseline

The coal plant's `waterUse` is its staff's 2.5 kL; the incinerator's 120 and 2 kL stay dials, since municipal waste-to-energy plants report no like-for-like figure. The coal plant's 22 m is short and its kit's stacks reach 26 m above it. The wind turbine's cost uses distributed-wind figures; the sources hold each.

## Decided

- Real small units, over utility-scale ones: the big block carries more people than any city grows.
- Reactor at the real project's $20,100/kW, over EIA's table row: real projects cost two to three times the table.
- Solar included, over ruled out on land: counted honestly, its land is its price.
- Year-average supply, over intermittency: the cut rule abandons rather than dims.
- Water-touch gate, over a clearance ring: a ring needs a second rule in the growth pass.
- Turbine spacing is the physical minimum of three tiles, over nine: power lines join the row.
- No hydro: the water mask has no flow or head. Not a demand rebalance, not a new utility network, not a coal rework.
