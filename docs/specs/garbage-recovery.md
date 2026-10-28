# Garbage recovery

- **Status:** Built

**Owns:** the waste chain's one unit and per-resident generation, the landfill's capacity, the incinerator's throughput, and the recovery ladder (kerbside depot, materials recovery facility, transfer station) with the forwarding rule. Capacity and load are [service-capacity.md](service-capacity.md); the programme frame is [municipal-services.md](municipal-services.md).

**Rules:**

- Count waste in one unit, 0.25 kg, end to end; emit whole units by a cumulative floor, exact over a day. `[R-services-026]`
- Generate per resident (1.32 kg) and per job (1.86 kg), never per building or level; derive a landfill tile's capacity from tile, pile and density. `[R-services-026]`
- Let a facility that is not a final disposal site forward what it cannot keep; only a landfill and an incinerator are final. `[R-services-028]` `[R-services-029]`
- Divert kerbside recycling at source from buildings of four homes or fewer, served once, never from jobs. `[R-services-027]`
- Sort recycling at an MRF: depots' carts first, then its round of blocks and jobs; 87% is recovered, 13% is residue. `[R-services-028]`
- Collect at a transfer station only after the incinerators and landfill; forward up to its throughput, at any distance. `[R-services-029]`
- Stop a facility whose store or floor is full; never skip the bottom rung. `[R-services-028]` `[R-services-029]`
- Share a building reached by several facilities equally; iterate in ascending id; send trucks from the street nearest any lot tile. `[R-services-025]` `[R-services-011]` `[R-services-030]`
- Derive every figure from a published source and the 20 m tile, stating any override. `[R-services-038]`

**Numbers:** derivations and sources are in [the sources](../sources/garbage-recovery.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `TRASH_UNITS_PER_TONNE` | 4,000 (0.25 kg a unit) | units | [unit](../sources/garbage-recovery.md#what-a-trash-unit-is) |
| `TRASH_KG_PER_RESIDENT_DAY` | 1.32 (60% of 2.2) | kg | same |
| `TRASH_KG_PER_JOB_DAY` | 1.86 | kg | same |
| `GARBAGE_PASSES_PER_DAY` | 20 | passes | dial |
| `LANDFILL_CAPACITY_PER_TILE` | 6,835,200 (was 600) | units | [landfill](../sources/garbage-recovery.md#the-landfill) |
| `LANDFILL_DENSITY_T_PER_M3` | 0.712 (1,200 lb a yd³) | t/m³ | same |
| Landfill pile / tile | 6 m over 20 × 20 m, 2,400 m³ | m | same |
| Incinerator `burnRate` / `bufferCapacity` / `powerUse` | 90,000 a pass (450 t a day) / 9,000,000 (five days) / 1.18 MW | units | [incinerator](../sources/garbage-recovery.md#the-incinerator-re-derived) |
| `MAX_GARBAGE_TRUCKS` | 16 citywide; 4 a facility | trucks | [truck check](../sources/garbage-recovery.md#the-truck-check) |
| `RECYCLING_KG_PER_RESIDENT_DAY` | 0.131 | kg | [depot](../sources/garbage-recovery.md#the-kerbside-recycling-depot) |
| `KERBSIDE_MAX_HOMES` | 4 | homes | same |
| `RECYCLING_HOMES_PER_TRUCK` | 9,500 (depot: 4 trucks, 38,000 homes) | homes | same |
| `RECYCLING_CREDIT_PER_UNIT` | ¢0.00016 (¢0.66 a tonne) | ¢ | [worth](../sources/garbage-recovery.md#what-a-recovered-unit-is-worth) |
| `MRF_SHORT_TONS_PER_DAY` | 50 (45.36 t; `MRF_SORT_UNITS_PER_PASS` 9,072) | tons | [MRF](../sources/garbage-recovery.md#the-materials-recovery-facility) |
| `MRF_YIELD_PERCENT` | 87 | % | same |
| `MRF_RESIDUE_STORE_UNITS` | 165,110 (one week) | units | same |
| MRF round | 0.30 a home, 0.30 commerce job, 0.25 industry job (`MRF_KG_PER_HOME_DAY`, `MRF_KG_PER_COMMERCIAL_JOB_DAY`, `MRF_KG_PER_INDUSTRIAL_JOB_DAY`) | kg a day | same |
| `TRANSFER_SHORT_TONS_PER_DAY` | 50 (`TRANSFER_UNITS_PER_PASS` 9,072) | tons | [transfer](../sources/garbage-recovery.md#the-transfer-station) |
| `TRANSFER_FLOOR_DAYS` | 2 (`TRANSFER_FLOOR_UNITS` 362,880) | days | same |
| Depot / station / MRF reach | 32 / 40 / 48 | tiles | dial [catchments](../sources/garbage-recovery.md#catchments) |
| Depot / station / MRF footprint, height | 2×3, 8 m / 4×5, 11 m / 5×6, 11 m | tiles | [sizes](../sources/garbage-recovery.md#building-sizes) |
| Depot / station / MRF cost, upkeep | ¢3,200, ¢260 / ¢7,500, ¢540 / ¢24,000, ¢1,750 | ¢ | dial |
| Unlocks | Busy Township / Small City (milestone 4) / Grand City (milestone 5) | milestone | dial |
| Power: depot / station / MRF | 4 kW / 0.00945 MW / 0.0378 MW | | [power](../sources/garbage-recovery.md#the-materials-recovery-facility) |
| Pollution: depot / MRF / station | 10 / 20 / 25 | units | dial [pollution](../sources/garbage-recovery.md#pollution) |
| Staff: depot / station / MRF | 5 / 4 / 17 | people | [sizes](../sources/garbage-recovery.md#building-sizes) |
| `SAVE_VERSION` | 15 (only the landfill rescale) | version | dial |

**Code:**

- `src/shared/constants.ts`: the constants above, `LANDFILL_CAPACITY_PER_TILE` derived from `TILE_METERS`, `LANDFILL_MAX_PILE_METERS`, `LANDFILL_DENSITY_T_PER_M3`.
- `src/shared/types.ts` `GarbageSpec` (`diversion`, `servesPeople`, `final`, `servesHomes`, `sortRate`, `transferRate`), `VehicleKind.Recycling`, `SimSnapshot.garbage`.
- `src/sim/garbage.ts` `GarbageSystem.tick`: kerbside, MRF step, generation, collection, transfer step; `servedUnitsOnPass`, `reachOf`, `shareOut`, `forwardToFinal`, `collectInto`, `incineratorEmission`.
- `src/sim/garbage.ts` `GarbageBuilding.category` (`res`, `com`, `ind`): picks the job's recycling rate; `collectionRange` is the reach, `waterUse` the staff's water.
- `src/sim/garbagetrucks.ts`: recovery facilities are `TruckDepot`s with no `dumpPath` (only a landfill drives off the road); refuse and recycling liveries.
- `src/sim/economy.ts`: the monthly recovery credit at the month boundary; `GarbageSaveState.recoveredThisMonth`.
- `src/data/catalog.json`: `recycling-depot`, `materials-recovery-facility`, `transfer-station`, `incinerator.burnRate`.
- `src/world/grid.ts`: `SAVE_VERSION` and the landfill rescale on load.
- `src/render/utilitykits.ts` `pavesLot`: the depot, MRF and station kits.
- `src/sim/worker.entry.ts`: truck origin from the street nearest any lot tile.
- `src/ui/`: the facility panel reports diverted, forwarded, stored and "no disposal in reach".

**Tests:** `src/sim/garbage.test.ts`, `src/sim/garbage.load.test.ts` (load, rescale), `src/sim/garbagetrucks.test.ts`, `tests/interaction/depottrucks.test.ts`.

**Open:** a civic kit stands on a raised plinth, so its apron meets the road crossing with a step at the footprint's edge (roadmap).

## Why the rules are what they are

### One real unit

A diversion percentage is meaningless against a wrong base rate. The old chain was wrong twice, so it was fixed before any building.

- Generation was per building and level, a 12.5× spread between a householder and a flat-dweller. Published figures give 2.2 kg a person a day, split 60/40 homes to jobs so shops are not counted twice.
- A landfill tile held 150 kg, so the smallest legal landfill filled in about six real seconds. Compacted fill is 0.712 t/m³, so a tile holds about 1,700 t and burying is cheap, finite and visible.
- The incinerator's building was right and its throughput 15–30× too small, so `burnRate` follows the building.
- A pass emits `floor(r × (n + 1)) − floor(r × n)` for garbage pass `n`: exact over a day, deterministic, no stored remainder. Units spread over the footprint with the remainder on the first tiles.
- Old saves keep their landfill fill fraction: `landfillStored` is multiplied by the new capacity over 600.
- Checks: a 150-resident tower generates 37.5× a 4-resident house, not 3×; a month with 1,000,000 units recovered books ¢160 once. Capacity stays beside `ServiceSpec.capacity`, never merged into it.

### Forwarding and the ladder

Every facility that is not a hole in the ground forwards what it cannot keep. A landfill and an incinerator forward nothing, which is what makes them final.

- A recovery facility with nothing behind it fills and stops. That is the incinerator's full-buffer rule, shared, so the ladder cannot be climbed by skipping its bottom rung. The panel says so, because it reads as a bug otherwise.
- Recovery is a second round with its own livery, not a split-body truck: a recycling round carries a fifth of a refuse round's weight, and the fleet carries nothing, so a split payload would invent a capacity model for a cosmetic system.
- Overlapping depot catchments do not stack, since paper cannot be recycled twice.
- Forwarding facilities run ahead of the disposal passes, because nothing can be recovered once buried. Residue goes to the nearest final facility reachable over the road network; none reachable, or all full, and it stays put.
- Reach is calibrated against the landfill's 28 and the incinerator's 40 tiles, because the published haul says every facility reaches the whole map: a game constraint, stated, not a physical one.
- The incinerator's pit is a stock; service capacity is a population. They stay separate and both derive from the facility's throughput. Waste gets no `ServiceKind` and no coverage field.

### The kerbside depot

A drop-off yard captures about a sixth of kerbside, so it would divert about 2%. The first rung is a depot whose trucks empty household carts.

- It serves buildings of four homes or fewer in its road reach, in building id order, each once, until its homes are spent; no state, recomputed every pass. Apartment blocks and businesses hire private haulers.
- A served building emits refuse and recycling each by the same cumulative floor; the recycling goes to the depot's tally, never the trash tiles.
- The credit is the avoided disposal, not the commodity cheque: value and cost cross inside their own volatility. A tile's whole life cost is ¢40 + 360 × ¢3 = ¢1,120. The monthly tally is cleared once at the month boundary and saved, or it double-counts across the two cadences.
- A city's kerbside costs about $45 a household a year, so the programme is a cost paid to bury less. The player sees a fleet yard, a second livery, a pile growing a tenth slower and a monthly credit.
- A depot's carts go to an MRF on its road network at any distance, else to the regional plant, which buries its residue out of town.

### The materials recovery facility

It sorts recycling; it never takes rubbish, because a plant earning the nation's 21% dry rate on top of the depots would count the houses twice.

- Each pass, in id order, it takes up to `sortRate` less any overfill of its store: first the carts of depots on its road network (unbounded walk, depot by depot in id order), then its round's eligible buildings in reach, each served once across all plants.
- The round serves apartment blocks of more than four homes and every job; a block with shops below is served for both. A house, duplex, fourplex or farm is the depot's.
- Sorted units split 87/13 on the day's running total, so a day's recovered is exactly the floor of 87% of the day's. The totals restart each game day and are not saved; a mid-day load may move one unit between the shares.
- Residue forwards to the nearest landfill or incinerator by road distance from its street, a landfill before an incinerator at a tie, the next nearest when one is full, each up to its room. The units count into the pile or pit before either collects.
- No final facility with room: the store fills, the plant stops, its round serves no one and the depots go regional. Bulldozing it drops its store.
- One road walk serves depots and forwarding, at most once a pass, only when carts or residue exist.
- Snapshot `mrfs` carries `id`, `sorted`, `servedBuildings`, `residue`, `stopped`; the save keeps `mrfs` with `id` and `residue` for plants holding residue.

### The transfer station

It sells reach. It diverts nothing and is never final.

- It runs last, after the incinerators and the landfill, so it takes only what no disposal site reaches. Each pass it can take the lesser of `transferRate` and its floor's room; a full floor stops it.
- A building reached by several stations shares a unit at a time round them (`shareOut`), as with incinerators.
- It forwards up to `transferRate` of its floor through `forwardToFinal`, nearest first, ties to the landfill then by incinerator id. Trailer economics never bind at map scale, so distance never reduces what arrives. What reaches an incinerator burns on its next pass.
- The floor holds two days, the common 48-hour state limit; bulldozing drops it. The save keeps `transfers` with `id` and `stored`.
- Snapshot `transfers` carries `id`, `collected`, `forwarded`, `stored`, `stopped`.

### Save and protocol

- No new grid layer: the facilities are catalog ploppables. A save written before recovery loads with the facilities absent, never rejected.
- `SimSnapshot.garbage` gains optional `recovery`, `recoveredTotal`, `depots` (`id`, `servedHomes`, `capacityHomes`), `mrfs` and `transfers`. A mirror that does not know `Recycling` draws the refuse livery. No new Command. See [interfaces](../engineering/interfaces/README.md) and [data model](../engineering/data-model/README.md).
- `TRASH_TILE_MAX` is 255 and is the lens byte; a per-capita rate would saturate it, so the store of record is per building and the per-tile layer a projection of it into 0..255.
- Forwarding resolves from the `reached` set a facility already built, never a second BFS (`[R-services-010]`; [performance budget](../engineering/performance-budget.md)).
- Small diversions round to zero, so remainders carry per facility in integers.

### Kit shape

The three buildings are single clear-span halls with civic-massing footprints from [civic massing](../art/civic-massing/README.md); the geometry is in [the sources](../sources/garbage-recovery.md#the-kit-geometry). A kit paves its lot (`pavesLot`) so a slope shows a graded pad, not a gap.

## Decided

- Kerbside depot over a drop-off yard: drop-off diverts about 2%, not the drafted 7%.
- MRF sorts depots' carts and its own round, not everything in reach: the 21% is a national figure across every programme.
- Credit is the avoided tipping fee, not the commodity price: the margin swings across zero.
- One stream, one rate: eight materials through three facilities is eight times the state for one percentage.
- Diversion at collection with residue, not at source for a yard: at source lets a plant work with nothing behind it.
- Capacity (`servesPeople`) derives from throughput beside the buffer, not merged with it: a stock is not a population.
- Landfill capacity rescaled and generation kept published, not generation scaled down to a 600-unit tile.
- Out of scope: composting (the 8.5 pp in food and yard is the next epic's), per-material tracking, a payload model for trucks, reworking collection, waste export (there is no outside world, see [design](../DESIGN.md)).
