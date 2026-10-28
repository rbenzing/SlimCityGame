# Healthcare and death care — technical design

- **Status:** Built 2026-10-14 — the clinic and hospital ladder; deaths and occupancy; bodies, the regional service and the cemetery; the hearse; the crematorium and the exhumation charge
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 2 of [municipal-services.md](municipal-services.md), written against
[../../game-design/features/healthcare-and-death-care.md](../../game-design/features/healthcare-and-death-care.md),
which holds every capacity, rate and price and the derivation of each. This one
holds the shapes, the arithmetic behind the sizes, and the risk.

## What we are building, and why now

A hospital above the existing clinic, a cemetery and a crematorium below both,
and the first thing in this simulation that can reduce population. Now, because
it consumes [service-capacity.md](service-capacity.md) hardest — a hospital and
a clinic write the same `health` field — and because the population sink is the
change most likely to be got wrong on paper.

## What it touches

| Module                          | Change                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/types.ts`           | `DeathCareSpec`; `BuildingInstance.vacancies`; `VehicleKind.Hearse`; `SimSnapshot.deathCare`                                                                                                                                         |
| `src/shared/occupancy.ts`       | `occupiedResidents`: the one helper that says how many people live in a building                                                                                                                                                     |
| `src/data/catalog.json`         | `hospital`, `cemetery`, `crematorium` added; `clinic` resized                                                                                                                                                                        |
| `src/render/utilitykits.ts`     | The hospital's kit: the block, its canopies, the parking deck and the accessible spaces; the cemetery's kit: lawn, drive, gatehouse, fence, trees and the headstones, whose count `setInterments` takes from `SimSnapshot.deathCare` |
| `src/render/servicevehicles.ts` | The hearse mesh, the sixth service-vehicle kind                                                                                                                                                                                      |
| `src/sim/deathcare.ts`          | New: death accrual and the re-let of vacancies; the bodies, the road-BFS collection into cemeteries, the regional service (built); the cremation throughput credit (built)                                                           |
| `src/sim/services.ts`           | Capacity pooling reads `occupiedResidents`; coverage unchanged; the backlog penalty applies after it, in the same pass (built)                                                                                                       |
| `src/sim/economy.ts`            | Population, rent and the tax correction read `occupiedResidents`; the month's regional funeral fees are an expense                                                                                                                   |
| `src/sim/garbagetrucks.ts`      | `GarbageTruckSystem` takes its pool size, so a second instance drives the hearses                                                                                                                                                    |
| `src/sim/worker.entry.ts`       | Slots the deaths, collection and re-let pass after the economy; the inspector, ridership and garbage inputs read `occupiedResidents`; the hearse fleet and the snapshot block                                                        |
| `src/app/persist.ts`            | `SaveMeta.deathCare`; `vacancies` on serialized instances                                                                                                                                                                            |
| `src/ui/`                       | Plots used of total in the inspector; the advisor's four death-care issues (the gauge in the service panel is not built)                                                                                                             |

**Save format: yes, additively, and the grid is untouched.** No tile layer is
added, so `SAVE_VERSION` and `BYTES_PER_TILE` stay where they are
([../data-model/README.md](../data-model/README.md)). Two optional additions, defaulted the
way the `garbage` block was.

- **`SaveMeta.deathCare`** holds the city counters of the deaths-and-re-let
  pass: the death remainder, the running death count, the re-let remainder and
  the running re-let count. Absent, all four are zero. Slice 2 extends the same
  block with `interments` (`{ id, count }` per facility), the `backlog` as a
  sparse list of `{ tile, count, sinceTick }` (`tile` a grid index), and
  `regionalThisMonth`, the bodies the regional service has collected since the
  last settlement. The backlog cannot be runtime state the way trash is, since
  trash regenerates on load and a body is a historical fact. All three are
  optional: a slice-1 save, or one with no `deathCare` at all, loads with no
  interments, nothing uncollected and no regional count; a malformed value
  loads as zero, and a backlog entry with a bad tile, count or tick is dropped.
  Slice 3 adds `cremation` (`{ id, credit, cremated }` per crematorium): its
  banked throughput, a fraction capped at one working day's 8, and the
  cremations it has done. Absent, a save loads with no crematorium state; a
  malformed entry is dropped or loads as zero, and a credit above the cap loads
  at the cap.
- **`vacancies`** on each serialized building instance: the residents the
  building has lost, an integer from 0 to the catalog's `residents`. It is
  written only when above 0, and absent means 0, so **an old save loads with
  every building full**. A value above the catalog's current `residents` is
  clamped down on load.

**A save written before this epic loads after it with the new service absent
rather than the save rejected**: the programme rule, and the first test written.

**Worker protocol: yes, additively.** `SimSnapshot` gains an optional
`deathCare` block (per-facility used/total plus the uncollected count, and the
crematoria) so the panel reads a gauge without a round trip. **No new
`Command`**, since `placeBuilding` and `bulldoze` exist
([../interfaces/README.md](../interfaces/README.md)); `placeBuilding` gains an optional
`interments`, sent only by the undo of demolishing a cemetery that held some, and
**no new `ServiceKind`**, since death care writes no coverage field and rides
the `health` funding.

## The design

### Data

`DeathCareSpec` mirrors `GarbageSpec` — a road-BFS radius plus a buffer:

```ts
export interface DeathCareSpec {
  mode: 'burial' | 'cremation';
  collectionRange: number; // road-network BFS distance in tiles
  plots?: number; // burial: interments before full
  rate?: number; // cremation: interments per tick
  hearses: number; // cosmetic, like GarbageSpec.trucks
}
```

`BuildingCatalogEntry` gains `deathCare?: DeathCareSpec`; `BuildingInstance`
gains the optional `vacancies?: number`, an integer from 0 to the catalog's
`residents` where absent means 0 (full); `VehicleKind` gains **`Hearse = 8`**, the
next free value after `Recycling = 7`, appended because values are stable
and never reordered. The kind is not persisted, so it
costs nothing in the save — it costs **one more InstancedMesh, permanently**,
since the vehicle kit is one mesh per kind
([../../art/props-and-vehicles.md](../../art/props-and-vehicles.md)), charged
against [../performance-budget.md](../performance-budget.md). Real metres, which
do not scale with the tile: an **ambulance is 6.9 × 2.5 × 2.7 m**, a US Type
III on a Ford E-450 with a 170-inch module, the commonest US box ambulance —
builders land within a few inches of each other: an
[AEV at 269 × 97 × 107.5 in](https://www.shopgarage.com/listing/2026-AEV-Ford-Type-III-1c9eec37-5413-4926-a252-c480804653f4),
a
[Braun Chief XL bid at 272.75 × 98 × 106.5 in](https://docs.southbendin.gov/WebLink/0/doc/106217/Page26.aspx)
and a [PL Custom Medallion at 275 × 99 × 107 in](https://signal-12.com/wiki/13-EM_%282013%29);
a **hearse is 6.2 × 1.9 × 1.9 m** (Coleman Milne Mercedes 214; a Cadillac XT5
coach is 6.32 m). The ambulance is 0.7 m longer and 0.8 m taller, so **the
silhouette read comes from height and livery** as much as length.

### Deriving every footprint and height

Formula from [../../art/civic-massing/README.md](../../art/civic-massing/README.md): gross
floor area = `w × d × 185 × (height ÷ 3.2)`, so tiles = gross ÷ 185 ÷ storeys,
rounded up to a whole rectangle. Open ground inside a footprint is 215 m² per
tile (400 − 185); a 90° stall all-in is 24.7 m².

| Building    | Occupant load    | Gross needed | Storeys → tiles | Result     | Floor     | Site vs ground |
| ----------- | ---------------- | ------------ | --------------- | ---------- | --------- | -------------- |
| Clinic      | 4 providers      | 372–557 m²   | 2 → 1.01–1.51   | 1×2, 6.4 m | 740 m²    | 148 ≤ 430 m²   |
| Hospital    | 72 beds          | 16,700 m²    | 6, stated floor | 3×5, 27 m  | 16,700 m² | deck, 144      |
| Crematorium | parts, see below | 626 m²       | 1 → 3.38        | 2×2, 6.4 m | 1,480 m²  | 693 ≤ 860 m²   |
| Cemetery    | gatehouse only   | 128 m²       | 1 → 0.69        | 3×3, 3.2 m | ground    | 780 plots      |

**The clinic** is four providers at MGMA's 1,000–1,500 sf each, 372–557 m² net,
which two storeys on a 1×2 lot hold with room for circulation: 2 × 185 × 2 =
740 m² (7,965 sf).

**The hospital breaks the formula on purpose.** Its floor is stated, not read
off the footprint: 72 beds × 2,500 sf = 180,000 sf, **16,700 m²**, drawn as a
58 × 48 m plate (2,784 m²) over six storeys at 4.5 m (inpatient floors run
14 ft 8 in–16 ft in [one city's project record](https://www.naplesgov.com/media/98066)),
27 m. The massing rule would read its 3×5 × 27 m as 23,400 m², so the floor the
catalog contract test re-derives the hospital's draw from is the stated one,
not `w × d × 185 × storeys`. Six of its fifteen tiles are the parking deck,
3.35 m floor to floor, ground and roof, laid in the 60 ft module of 90°
parking: four rows of 9 × 18 ft stalls (2.74 × 5.49 m) on two 24 ft (7.32 m)
two-way aisles running to the street, then a 12 ft (3.66 m) ramp lane and its
0.25 m parapet along the far side. That is 40.48 m across, so the deck reaches
half a metre past its two tiles toward the block: 2,429 m² a level. Along the
street each row holds 19 stalls, leaving a 7.58 m cross-aisle at the back; two
stair-and-lift cores at the street corners take two stalls each, so **72 a
level and 144 in the deck**, 2 a bed, at 33.7 m² (363 sf) a space all-in. The 5 accessible spaces
(ADA §208.2 for 101–150 spaces provided, 1 van in 6) stand on the surface
between the main entrance and the deck. Every count is derived in
`src/render/utilitykits.ts` from those dimensions and checked by its tests.

**The crematorium:** a 215 m² chapel (100 × 1.4 m² net ÷ 0.65), a 111 m²
office, a 60 m² foyer, and **240 m² of cremator hall, plant and body store — the one number in
this epic with no published source**, assumed at 6 × 10 m per unit plus 120 m²
of plant; the 626 m² total sits inside the observed 500–800 m² band (Chingford,
568 m² GIA). Two then break the formula deliberately: the **cemetery is sized by
ground alone** — about 1,000 single graves an acre is 4.05 m² of land per grave,
98 per 400 m² tile, so eight burial tiles plus a gatehouse tile is 780 plots
(the derivation and its sources are in the design document) — and
the **crematorium's 6.4 m is one tall storey** counted as two floors, since
chapel and cremator hall do not stack.

**The cemetery's draw** is its gatehouse alone, the one 128 m² of floor: 128 ×
10.7639 = 1,378 sf at the office intensity the zoned catalog already uses,
13.6 kWh/sf a year (CBECS 2018, table C14), is 18,738 kWh over 8,760 hours,
2.14 kW, **0.0021 MW**; at the office water benchmark, 14.48 gal/sf a year
(EPA WaterSense at Work), 19,950 gal over 365 days is 54.7 gallons a day,
**0.2 kL**. The grounds draw nothing: no irrigation figure is modelled for any
open ground. Its price, **¢3,500 and ¢140 a month**, is on the civic ladder
beside the recycling depot (¢3,200), the clinic (¢5,000) and the transfer
station (¢7,500), not the generators' dollar scale.

**The clinic was resized, not added.** It shipped at 2×2 × 14 m, **3,237 m²**,
four to nine times what a four-provider practice uses, so it could never have
been oversubscribed at any city size this game reaches. It is now **1×2,
6.4 m**, and its draw is re-derived from the smaller floor at the same
intensities. A save from before the resize stores the clinic's 2×2 stamp; the
loader's existing `restampShrunkPloppables` (`src/sim/buildings.ts`) re-stamps
any ploppable whose catalog footprint shrank onto the 1×2 inside its old
footprint that still fronts its street, at every rotation, and frees the other
two tiles. Nothing new was needed for it.

### Behaviour

**One helper decides who lives in a building.** `occupiedResidents(spec, inst)`
(`src/shared/occupancy.ts`) is 0 unless the building is Active, else
`max(0, spec.residents − vacancies)`, a vacancy being one resident the building
has lost. Nothing else reads `spec.residents` to count people: population,
rent, the tax correction, the capacity pooling, the inspector, transit
ridership, garbage generation and the registry totals all ask it. Gates that
used to differ between those readers (some tested Active, some did not) are now
the helper's one gate. A farm is counted like any home, since its family lives
on it.

**Deaths accrue, they are not rolled.** A fractional city counter advances each
tick by `population × DEATH_RATE_PER_RESIDENT_PER_TICK` (9 per 1,000 a year over
`TICKS_PER_YEAR`, 1.25e-7, derived from the calendar constants and not
written as a literal). When it passes 1, 1 is subtracted and one death is
emitted, and a persisted running count _n_ advances. The _n_-th death goes to the
occupied resident at position `(n × 7919) mod population`, found by walking the
Active buildings in id order and summing `occupiedResidents`; that building's
`vacancies` rises by 1. There is no RNG, so the run is identical across a save
and reload, and the walk is proportional to residents: a 300-resident tower
takes a hundred deaths to a three-resident house's one. A building with no
occupied residents takes none. Deaths this tick and in total are exposed so
slice 2 can hang bodies on them.

**In-migration re-lets vacancies at a sourced rate.** While `demand.res > 0`,
each vacancy is let again in **41 game days** on average: RentCafe's 2025
figure, a 41-day national average to rent a vacant apartment across 137
markets
([Multifamily Executive](https://www.multifamilyexecutive.com/apartment-trends/rentcafe-miami-hottest-rental-market-2025)),
cross-checked by NAR's 2025 Profile of Home Buyers and Sellers, a median of four
weeks on the market. A city re-let counter advances each tick by
`totalVacancies ÷ (41 × TICKS_PER_DAY)` and not at all while `demand.res ≤ 0`;
when it passes 1, 1 is subtracted and one vacancy is filled, chosen by the same
stride walk over the vacancies in id order with its own persisted count. **The
magnitude of demand does not scale the rate**; that would be an unsourced dial,
so any positive demand re-lets at the market's pace and none does not. The
pass lives in `deathcare.ts` beside the deaths, not in growth's problems pass:
growth runs every tenth tick and does not see demand and population fall in the
same call, and the two counters share one walk, so one module owns both halves
of the loop.

**Where it runs.** After the economy and before the snapshot, so it reads the
population and the demand of the same tick and nothing downstream sees a
half-updated city. A building completing construction moves in full, and a
level-up or a rebuilt building is a new instance, so it too starts with none;
loading clamps a stored value to the catalog's `residents`.

**Bodies.** Each death `DeathCareSystem.tick` makes also leaves one body at the
building where it fell: that building's anchor tile (`inst.x`, `inst.z`) and the
tick it fell. The backlog is a list of `{ tile, count, sinceTick }`, bodies that
fell on one tile in one tick merged into one entry, and it persists in the save.
A body is never removed except by being collected.

**Collection reuses garbage's mechanism, not the dispatcher's.** `collect`
runs after the deaths in the same tick. A cemetery with room reaches the road
tiles its street connects to within `collectionRange` by `roadBfsDistances`,
radiated two tiles by `radiateWeighted` — the very coverage a garbage facility
collects by, so a building is reached when any tile of its footprint is, and a
building inside the range in a straight line but cut off by road is not. The
bodies go in building-id order (then tile, then the tick they fell); each one
is interred in the reaching facility with room that stands nearest, the one with
the highest coverage over the building's footprint, ties by facility id; one
body is one interment, and a full cemetery (`interments ≥ plots`) is skipped.
The search runs the tick a body falls, and then every `DEATH_CARE_PERIOD` (10)
ticks for what is still waiting, so a town with nothing to collect, or nobody
to take it, pays for nothing per tick.

**The regional funeral service until Big Town.** While
`milestoneLevel < DEATH_CARE_MILESTONE` (the Big Town index, the same
`BIG_TOWN_MILESTONE` that sets `SEWER_MILESTONE`), whatever no local facility
collected that tick is collected off the map the tick it falls: nothing is left
and no penalty ever accrues. The month's count (`regionalThisMonth`) is billed
by the monthly settlement at `REGIONAL_FUNERAL_FEE` (¢3.6) a body as an expense,
and cleared there. It has no vehicles. From Big Town it stops: a body no local
facility collects stays where it fell. A cemetery placed earlier (it unlocks at
milestone 0) collects first, so a town can switch before it has to, and the
bodies it takes are not billed.

**Hearses are cosmetic and ride a second `GarbageTruckSystem`.** Each local
collection queues one visit, the building's tile, and the cemeteries are the
depots, `hearses` a budget each, in `VehicleKind.Hearse` livery: depot →
building → depot over the road graph, exactly as garbage trucks. The visits
are runtime state (a load drops them), and the regional service sends none.
Hearses deliberately do **not** ride `DispatchSystem`: a funeral is not an
incident, `Incident['kind']` should not gain a member for one, and the 32-slot
pool should not have ambulances competing with hearses.

**The penalty applies after coverage, in the same pass.** `ServiceSim.tick`
takes the backlog and the tick number. After every kind's coverage has been
written, for each tile holding uncollected bodies it subtracts
`min(255, count × 32 × (ticksUncollected ÷ 6000))` from `FieldId.Health` there
and on every tile within two orthogonal steps, the diamond `radiateWeighted`
spreads coverage over. `count` is summed over the entries on the tile, each
aged by its own `sinceTick`. **Order is a rule, not an accident:** coverage
first, penalty second, or building id order decides the outcome; and since
coverage is a max-blend of the field and the penalty a subtraction, a clinic
placed on a penalised tile raises the tile to its strength on the next pass and
the penalty comes off that, in any placement order. The 32 is a **dial**, with
no published figure behind it, and it is never fed back into the death rate.

**Visibility.** `SelectionInfo.deathCare` is `{ used, total }` for a selected
cemetery (interments over `plots`) and `{ cremated }` for a crematorium.
`SimSnapshot.deathCare` is sent on every snapshot: `facilities`
(`{ id, used, total }` per cemetery), `crematoria` (`{ id, cremated, room }` per
crematorium, `room` the bodies it could take now), `uncollected` (the
bodies in the backlog), `regionalThisMonth`, and `uncollectedAt`, the tile of
the oldest. The advisor reads it with the stats, as pure functions: the first
uncollected body raises a warning at once, a full cemetery with bodies
uncollected raises another, and one rung before Big Town with no cemetery placed
an info issue says the regional funeral service ends at Big Town, the way
`septic-outgrown` does for the drains.

**Cremation is a throughput credit, not a capacity.** A crematorium's `rate`
is `CREMATIONS_PER_YEAR ÷ TICKS_PER_YEAR` (2 retorts × 4 a day × 260 working
days = 2,080 over 72,000 ticks), written in the catalog and checked against the
constants by a contract test. Each tick `collect` adds `rate` to every
crematorium's credit, capped at `CREMATION_CREDIT_CAP` (one working day, 8), so
an idle one banks nothing past a day. A crematorium "has room" for `floor(credit)`
bodies; the collection pass offers each body to the reaching facilities with
room in the one order cemeteries use, the highest road reach first, ties by
facility id, cemeteries and crematoria in the one list. A cremation spends one
credit and adds one to the crematorium's count, which the inspector and the
snapshot's `crematoria` report; there is no interment count and it never fills.
No random draw is involved, so a run is identical across a save and reload.
Hearses depot at a crematorium exactly as at a cemetery.

**Demolishing a cemetery charges the exhumation.** `cmdBulldoze` sums the graves
of every cemetery standing on the tiles it clears and charges
`EXHUMATION_FEE_PER_INTERMENT` (¢14) each, in hand before anything is taken
down: with funds short of the charge the whole bulldoze is refused for funds
and nothing changes. The 50% refund of build price stands, and the charge is
subtracted from it, so the ack's cost is the net. The inverse is a
`placeBuilding` carrying `interments`, which stands the cemetery back with
them (`DeathCareSystem.setInterments`) and prices the placement at the build
cost less the charge, handing the charge back exactly. The bulldoze tool asks the
env for `gravesUnder(tiles)` and quotes the charge, with the number of graves,
in the cursor chip before it is paid.

**Population becomes the sum of occupied residents.** `EconomySystem.tick`
sums `occupiedResidents`; a death adds a vacancy to its building and a re-let
removes one. In-migration re-lets homes before new ones are built — right
municipally, and the smallest blast radius.

**The rules the implementation must satisfy**, which become the tests below and
the spec entry reached from the [documentation map](../../README.md): an old
save loads unchanged; deaths accrue deterministically across a save boundary; a
full cemetery collects nothing; coverage precedes the penalty; and population is
the sum of occupied residents.

**Decisions taken when slice 1 was built.**

- The milestone level stays a ratchet and never falls. `computeMilestoneProgress`
  keeps measuring from the current milestone's threshold toward the next, so a
  city that has shrunk below its threshold reports 0, which is the truth: none
  of the way to the next. The earlier plan for progress to "report more than a
  flat zero" is dropped; it would have been a second, invented measure.
- `Problem.LowDemand` stays display-only. A shrinking city abandons nothing for
  it, and a test holds that.
- Vacancies are whole residents, not a fractional occupancy, so the sum stays an
  integer and the save carries an integer.

**Decisions taken when slice 2 was built.**

- Before Big Town a cemetery, if one is placed, collects first and the regional
  service takes the rest, so the fee is only ever paid on bodies the town did not
  bury itself. A cemetery's hearses run before Big Town as after it: they are the
  cemetery's, not the regional service's.
- The cemetery's category is `service`, with no `service` spec: it writes no
  coverage field and rides the health funding, and the dock lists it under Health
  beside the clinic.
- The collection cadence is the tick a body falls, then every 10 ticks (half a
  game hour) for what is left: deterministic, and not a per-tick road search.
- `collectionRange` is 40 tiles, the health ladder's clinic band. No published
  standard gives a cemetery's reach; this is the game's band, chosen because
  death care rides the health department.
- Interments are saved per facility id and dropped when that building is gone.

**Decisions taken when slice 3 was built.**

- The crematorium's price, ¢3,800, and the exhumation fee, ¢14, are on the
  death-care capital scale of $200 to the ¢ that the cemetery's own price sets;
  both are derived in the design document. A crematorium costs about one
  cemetery to build, and the trade is land and running cost.
- Its draw is the 1,480 m² at CBECS service intensity and the office water
  benchmark, 0.0131 MW and 2.4 kL; the retorts' natural gas is not modelled.
- Its pollution is 1, the field's smallest nonzero value, rounded up from 0.07
  on the coal plant's scale because a real emission should register.
- The funds check for a demolition is against the charge alone, before the
  refund, so the preview and the world agree.
- The kit is three InstancedMeshes: lawn plate with forecourt, the merged
  building (chapel, cremator hall with its duct, foyer, office) and the flue.
  The cremator hall's 240 m² has no published source. Its flat roof is 4.5 m
  (15 ft), the game's own height and unsourced, enough to clear a retort and
  its breeching duct; the gabled chapel keeps the 6.4 m ridge, the catalog
  height. The one flue is 7.6 m, 3.1 m clear of the hall roof deck, an 8-sided
  steel stack about 0.9 m across (the game's own diameter) on the hall's
  street-side roof edge, so it shows from the default pitch.

## What could go wrong

**Population has never gone down, and this is where the bugs are.** Each is a
real place, not a hypothetical:

- **`economy.ts`, the milestone ratchet** only ever climbs, so a shrinking city
  keeps the unlocks of the milestone it has left. Decided: the level never
  falls. **`computeMilestoneProgress`** clamps to 0, so a city below its own
  threshold shows a flat zero, which is the truth, none of the way to the next
  milestone; it is kept, and a test holds it.
- **`demand.ts`, every denominator.** The `max(200, …)`, `max(400, …)` and
  `max(600, …)` floors guard divide-by-zero for a city starting at zero, not one
  shrinking toward it: as population falls, `employed` falls and the denominator
  with it, so residential demand _rises_. Intended, and it is the labour-market
  pull that re-lets homes: fewer workers for the same jobs is the empty-jobs
  signal the residential term already reads, and the re-let rule asks only
  whether demand is positive. It is also what keeps a slow leak from becoming a
  collapse.
- **`demand.ts`, the commercial term.** Population falling against constant jobs
  drives com demand sharply negative, lighting `LowDemand` on commercial
  buildings, which (if armed) removes jobs, which raises res demand — an
  oscillation nothing has exercised.
- **`growth.ts`, `Problem.LowDemand`** is display-only today, since abandonment
  triggers on NoPower/NoWater/NoRoad alone. This epic lights it on many
  buildings at once for the first time; it must stay toothless.
- **`economy.ts` monthly tax, `worker.entry.ts` `selectionOccupancy` and
  `traffic.ts` `tripsForTick`** read population or occupancy directly: tax must
  use `occupiedResidents` or the city collects rent on empty flats, the
  inspector must read the instance, and thinning traffic is expected. All now do.
- **[../../world-sim/population-model.md](../../world-sim/population-model.md)**
  states as fact that there is "no partial occupancy … no vacancy rate within a
  single building", and that population "only ever changes through the state
  transitions above". Both became false with slice 1, and the document now
  describes vacancies, deaths and the re-let; a stale doc is the same class of
  defect as stale code.

**Resizing `clinic` would orphan grid stamps** if nothing re-stamped them: the
2×2 stamp lives in the saved `buildingId` layer while the renderer draws the
catalog's 1×2. The loader's re-stamp already handles it, and the clinic has its
own test at every rotation with a street on each side. **The backlog penalty
could outrun its warning** — 32 points a month is tuned so the gauge and notification
land before the field moves, and raising the death rate later inverts that.

## Alternatives

**A `deathcare` `ServiceKind` with its own funding slider.** Rejected: it writes
no coverage field, so it would be a member of an enum that exists to select one,
and would change `CityStats`, the HUD and the save for no decision.

**Hearses on `DispatchSystem`.** Rejected: it adds a member to
`Incident['kind']`, puts funerals in the incident marker list, and makes hearses
compete with ambulances for 32 slots; garbage collection is the same job with
the right shape. **Reusing `VehicleKind.Car`** would run magenta hearses, since
civilian vehicles pick a random colour, and `Ambulance` puts a cross on a
funeral.

**A city-level population deficit instead of per-building occupancy.** Rejected:
a second authoritative number drifts out of sync with the building set, exactly
what
[../../world-sim/population-model.md](../../world-sim/population-model.md) calls
the current model's strength.

## How we will know it works

Behaviour, in the order the risk sits:

- A save written before this epic, with no `vacancies` and no `deathCare`,
  loads with every building full and every counter at zero; no facility holds
  interments and nothing is uncollected. Written first.
- A city of 10,000 run for one game year (72,000 ticks) produces 90 deaths, ±1
  for the fractional remainder, and the same run split by a serialize and
  restore of the registry and the `deathCare` block produces the same count
  and the same vacancies in every building. (Slice 1.) A cemetery of 780 plots
  stops collecting on the 781st body; a crematorium run for ten game years has
  collected every body. (Slice 2.)
- Deaths land in proportion to residents (a 300-resident tower against
  3-resident houses); vacancies never exceed residents nor fall below 0; a fully
  vacant building takes no death. (Slice 1.)
- With `demand.res > 0` one vacancy is re-let in about 41 game days, the count
  over a long run within ±1 of the expectation; with `demand.res ≤ 0` nothing is.
  (Slice 1.)
- A building with vacancies pays rent on its occupied residents only, and the
  capacity pooling, the inspector, ridership and garbage read the same figure.
  (Slice 1.)
- One uncollected body four game months old subtracts 128 from `Health` at its
  tile; the same body collected a tick earlier subtracts nothing. A clinic
  placed on a penalised tile does not erase it, in any placement order.
- A hospital covering 60,000 people halves its effective strength, and the same
  hospital plus a second covering the same tiles does not — the contract from
  [service-capacity.md](service-capacity.md), exercised by its first consumer.
- Population falls when residential demand is at or below zero and deaths
  continue, and recovers when demand turns positive; the milestone level does
  not fall with it, and milestone _progress_ is 0 below the threshold. A
  shrinking city abandons nothing for `LowDemand`. (Slice 1.)
- Demolishing a cemetery holding 780 interments charges ¢10,920, ¢9,170 net of
  the refund, and an empty one does not; the undo stands it back with 780
  interments and hands the charge back; a refused demolition changes nothing
  (slice 3). A resized `clinic` loaded from a save leaves no orphan tile stamp.
- A crematorium over ten game years of deaths below its throughput cremates
  every body its roads reach; a backlog of 300 drains at the rate, in about
  10,400 ticks; an idle one banks no more than 8; a save from before it loads
  with no crematorium state (slice 3).
- Below Big Town every body is collected regionally the tick it falls and billed
  ¢3.6 in the month's expenses, with no penalty; from Big Town with no cemetery
  the bodies stay. A building inside 40 straight-line tiles of a cemetery but cut
  off from it by road is not collected. Deaths and the backlog survive a save
  round trip identically, and an older save loads with nothing uncollected.
  (Slice 2, each held by a test.)

**This epic renders, so these have to be looked at in a browser, not read back:**

- **The ladder, in one frame.** A house, a 1×2 × 6.4 m clinic and the 3×5
  hospital, its 27 m block beside its parking deck, on one street at the
  default pitch. If clinic and hospital are not
  obviously different buildings without labels, the ladder has failed.
- **The cemetery as grounds.** 3×3 at 3.2 m from the default pitch, and again
  zoomed to the 1.75 m pedestrian, to confirm plot rows and a gatehouse rather
  than a grey slab — with **the crematorium's flue** in both, since a process
  utility is recognised by its plant.
- **Hearse, ambulance and car stopped on one street** — 6.2 m, 6.9 m and 4.0 m.
  The shot checks that height and livery separate the service vehicles, whose
  lengths are close.
- **The health lens over a district with a backlog.** The grey must be a hole
  where the bodies are, not a city-wide smear.

## Out of scope

- Disease, epidemics and health events; ages, cohorts and cause of death. Deaths
  are a rate, and nothing here creates a demographic model.
- Eldercare as a building, and grave reuse beyond the demolition charge, both
  for the reasons the design document gives.
- Not built: the fill gauge in the services panel. The cemetery's and the
  crematorium's kits, the headstones and the hearse mesh are drawn: see
  [../../art/civic-massing/README.md](../../art/civic-massing/README.md) and
  [../../art/props-and-vehicles.md](../../art/props-and-vehicles.md).
- Giving `Problem.LowDemand` teeth, named above precisely because this epic must
  not be what arms it; and reworking coverage or the road-network BFS.
