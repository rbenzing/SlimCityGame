# Garbage recovery — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 5 of the programme in [municipal-services.md](municipal-services.md),
written against
[../../game-design/features/garbage-recovery.md](../../game-design/features/garbage-recovery.md).

## What we are building, and why now

Three waste ploppables that sit in front of disposal rather than replacing it,
and one new rule — a facility that is not a final disposal site forwards what it
cannot keep. Recovery diverts a published fraction of the stream; a transfer
station diverts nothing and exists to extend reach.

Now, because waste is the one service already built: collection, accumulation,
catchments, buffers, burn and a cosmetic fleet all live in `src/sim/garbage.ts`
and `src/sim/garbagetrucks.ts`, so this adds a step to a working pipeline rather
than building one. It is also the subsystem with the most wrong figures in it,
which is the other reason to do it on paper first.

## What it touches

| Module                     | Change                                                                            |
| -------------------------- | --------------------------------------------------------------------------------- |
| `src/shared/constants.ts`  | Generation moves per capita; `LANDFILL_CAPACITY_PER_TILE` rescaled                |
| `src/shared/types.ts`      | `GarbageSpec` gains `diversion`, `servesPeople`, `final`; `VehicleKind.Recycling` |
| `src/sim/garbage.ts`       | Per-resident generation; a forwarding step before disposal                        |
| `src/sim/garbagetrucks.ts` | Recovery facilities are depots; second livery                                     |
| `src/sim/economy.ts`       | The monthly recovery credit, through the existing income pass                     |
| `src/data/catalog.json`    | Three entries; `incinerator.burnRate` re-derived                                  |
| `src/world/grid.ts`        | `SAVE_VERSION` bump, to rescale an old landfill pile                              |
| `src/ui/`                  | Panel reports diverted, forwarded, buffered, and _no disposal in reach_           |

**Save format: yes, additively, with one versioned rescale.** The facilities are
ordinary catalog ploppables, so placement already round-trips through the
building registry — no new grid layer. `GarbageSaveState` gains an optional
`recovery: { id, units }[]` and an optional `recoveredTotal`. The rule is
unchanged: **a save written
before this epic loads after it, with the new facilities absent rather than the
save rejected.** Only `LANDFILL_CAPACITY_PER_TILE` is not purely additive: an
old save's `landfillStored` counts old units and would read as an empty
landfill, so, as the grid already does for layer additions, **bump
`SAVE_VERSION` and multiply `landfillStored` by the capacity ratio below it** —
the fill fraction seen before the upgrade is the one seen after. See
[../data-model.md](../data-model.md).

**Worker protocol: yes, additively.** `SimSnapshot.garbage` gains an optional
`recovery: { id, fill, capacity, divertedLastPass }[]` and an optional
`recoveredTotal`. `VehicleKind` gains `Recycling`, at the next free
`VehicleKind` value when it is built (append-only), and a mirror that does not
know the value falls back to the `Garbage` livery rather than dropping the
vehicle. No new `Command`. See [../interfaces.md](../interfaces.md).

## The design

### Data

`GarbageSpec` gains three optional fields, so every existing entry keeps its
meaning unedited: `diversion` (0..1 of the collected stream recovered, default
0), `servesPeople` (capacity in people), and `final` (true = disposal, forwards
nothing). `final` defaults to **true**, so the incinerator means tomorrow what
it means now; forwarding facilities set it false.

`servesPeople` is the concession to [epic 0](service-capacity.md), and it is
**not** `bufferCapacity` renamed: a buffer is a stock, its `ServiceSpec.capacity`
is a population, and treating a stock as a rate is a modelling error. What
unifies them is their _source_ — both fall out of the facility's daily
throughput: `servesPeople` is that throughput in kg ÷ 2.2 kg a person a day, and
`bufferCapacity` is days of storage × throughput ÷ 0.25 kg a unit. One dial, two
readings. Waste gets **no** `ServiceKind` member and no coverage field: the
umbrella already rejected a field per service on memory grounds, and
`collectionRange` is the reach model waste has always had.

### The unit correction, first (built 2026-10-08)

Diversion is a percentage of a base rate, so the base rate has to mean something
before anything else lands. Both are balance, derived in the design document,
living in `src/shared/constants.ts`:

- **Generation is per capita**: `TRASH_KG_PER_RESIDENT_DAY` 1.32 and
  `TRASH_KG_PER_JOB_DAY` 1.86, the 60/40 residential and commercial split of
  the published 2.2 kg a person a day, at `TRASH_UNITS_PER_TONNE` 4,000 (0.25 kg
  a unit) and `GARBAGE_PASSES_PER_DAY` 20. A building's rate per pass is
  fractional, so a pass emits `floor(r × (n + 1)) − floor(r × n)` for garbage
  pass `n`: exact over a day, deterministic, and no new state. The units are
  spread over the footprint with the remainder on the first tiles. The sector
  constants and the level multiplier are gone.
- **`LANDFILL_CAPACITY_PER_TILE: 600 → 6,835,200`**, derived in code from
  `TILE_METERS`, `LANDFILL_MAX_PILE_METERS` and `LANDFILL_DENSITY_T_PER_M3`
  (0.712, the 1,200 lb a cubic yard of compacted fill). The 0.31 t/m³ first
  proposed here was waste as hauled.
- **The incinerator**: `burnRate` 90,000 a pass (450 t a day),
  `bufferCapacity` 9,000,000 (five days), `powerUse` 1.18 MW.
- **Saves**: `SAVE_VERSION` 15, with no new layer; a save below it loads its
  `landfillStored` multiplied by the new capacity over 600, so the fill
  fraction is unchanged.

### The kerbside recycling depot (built 2026-10-08)

The first rung, replacing the draft's drop-off recycling centre (see the
design document for why). It diverts at source and forwards nothing, so it
needs none of the forwarding step below.

- **Data.** `GarbageSpec` gains an optional `servesHomes`: an entry with it is
  a kerbside depot, never a disposal facility, so the worker routes it apart
  from the incinerators. Its catalog entry, `recycling-depot`, is 2×3 and 8 m,
  `collectionRange` 32, `trucks` 4, `servesHomes` 38,000 (4 ×
  `RECYCLING_HOMES_PER_TRUCK` 9,500), ¢3,200 to build, ¢260 a month, unlocked at
  Busy Township, pollution 10, and draws about 4 kW and 0.2 kL (a 600 m² shed
  at the warehouse class's 5.5 kWh a square foot a year, derived from the
  national building survey's own totals, and an office's water for its staff).
- **Who is served.** Each pass, depots in building-id order take, along their
  road-BFS reach, the buildings in id order with residents and no more than
  `KERBSIDE_MAX_HOMES` (4) homes, until their `servesHomes` is spent; a
  building already taken by an earlier depot is skipped. No state: it is
  recomputed every pass.
- **Generation.** A served building's residents set out
  `RECYCLING_KG_PER_RESIDENT_DAY` (0.131) of their 1.32 kg in the cart: its
  pass emits the refuse rate and the recycling rate each by the same
  cumulative floor as all generation, so a day sums exactly; the refuse goes
  on the trash tiles, the recycling to the depot's tally. Jobs are never
  served.
- **The credit.** `RECYCLING_CREDIT_PER_UNIT` is derived in code from the
  landfill's own figures — a tile's paint cost plus 30 years of upkeep over its
  capacity, ¢0.00016 — and the economy books the month's recovered units times
  it as income at the month boundary, then clears the tally; the tally is
  saved (`GarbageSaveState.recoveredThisMonth`, optional) so a mid-month save
  loses nothing. A depot's carts are only tallied once sorted: by a Materials
  Recovery Facility in town, or else regionally, and either way 87% of them
  (below).
- **Trucks.** The depot is a `TruckDepot` like any other; its trucks take a
  second livery, `VehicleKind.Recycling`, appended at the next free value, and
  a mirror that does not know it draws the refuse livery.
- **Snapshot.** `SimSnapshot.garbage` gains an optional
  `depots: { id, servedHomes, capacityHomes }[]`.
- **Saves.** Additive: no `SAVE_VERSION` bump; an old save has no depots and no
  tally.

### The Materials Recovery Facility (built 2026-10-08)

The third rung, built as a sorter of recycling rather than the draft's
collector of everything (see the design document for why). It forwards its
residue, so it is the first facility on the forwarding rule below, applied to
a store of residue rather than to collected trash.

- **Data.** `GarbageSpec` gains an optional `sortRate`, the units it sorts a
  garbage pass: an entry with it is an MRF, never a disposal facility, and its
  `bufferCapacity` is its residue store. The catalog entry,
  `materials-recovery-facility`, is 5×6 and 11 m, `collectionRange` 48,
  `trucks` 4, `sortRate` 9,072 (`MRF_SORT_UNITS_PER_PASS`, derived from
  `MRF_SHORT_TONS_PER_DAY` 50, `TONNES_PER_SHORT_TON`, `TRASH_UNITS_PER_TONNE`
  and `GARBAGE_PASSES_PER_DAY`), `bufferCapacity` 165,110
  (`MRF_RESIDUE_STORE_UNITS`, a week of residue at that rate), `powerUse`
  0.0378 MW (20 kWh a tonne, the day's use over 24 hours), `waterUse` 0.8 kL
  (17 staff), pollution 20, ¢24,000, ¢1,750 a month, unlocked at Grand City
  (milestone 5).
- **`GarbageBuilding`** gains `category` (`res`, `com` or `ind`), the catalog
  entry's: a job in `ind` (light and heavy industry, farms) recycles
  `MRF_KG_PER_INDUSTRIAL_JOB_DAY` 0.25, any other job — a shop, an office, or
  the shops of a mixed-use block, whose catalog category is `res` —
  `MRF_KG_PER_COMMERCIAL_JOB_DAY` 0.30. A home in a building of more than
  `KERBSIDE_MAX_HOMES` homes with residents recycles `MRF_KG_PER_HOME_DAY`
  0.30. A building of one to four homes is never on the round.
- **The step**, in `GarbageSystem.tick` after the kerbside depots and before
  generation. MRFs go in id order. Each one's take this pass is `sortRate`,
  less whatever would overfill its residue store, and nothing at all when the
  store is full (the plant is **stopped**). It claims first the recycling this
  pass of the depots on its road network — the depot's street reached by an
  unbounded road walk from its own, at any distance — depot by depot in id
  order, up to that take; then its round
  admits the eligible buildings in its road reach (`reachOf`), in id order,
  each once across all plants, while that building's recycling this pass fits
  what is left. A depot's recycling no plant claims goes **regional**.
- **Generation.** A building served by a depot or a round emits its recycling
  and refuse each by the same cumulative floor, through one
  `servedUnitsOnPass(building, pass, recyclingKgPerDay)`; the refuse goes on
  the trash tiles, the recycling to whoever sorts it.
- **Sorting.** What a plant sorts, and the regional units, split 87/13
  (`MRF_YIELD_PERCENT` 87) on the day's running total: the recovered share of
  a pass is `floor(87 × (before + s) / 100) − floor(87 × before / 100)` and
  the residue is the rest, so a pass's two shares sum to what it sorted and a
  day's recovered is exactly the floor of 87% of the day's. The running totals
  restart each game day and are not saved; a load mid-day may move one unit
  of that day between the two shares. The recovered share joins the month's
  tally; the regional residue is buried out of town; a plant's residue goes to
  its store.
- **Forwarding.** After sorting, a plant's store forwards what it holds to the
  final facilities on the same road network, nearest
  first by road distance from its street to the landfill area's street or the
  incinerator's, ties to the landfill, then by incinerator id, each taking up
  to its room: the landfill's capacity less its pile, an incinerator's
  `bufferCapacity` less its pit. The units count into the pile or the pit
  before either collects that pass. One walk serves both the depots and the
  forwarding: it runs at most once a pass for each plant, and only when a
  depot has carts to claim or the store holds something.
- **Snapshot.** `SimSnapshot.garbage` gains an optional
  `mrfs: { id, sorted, servedBuildings, residue, stopped }[]`: what each plant
  sorted on the last pass, the buildings its round served, its stored residue
  and whether a full store stopped it. MRFs are not in the incinerator list.
- **Trucks.** An MRF is a `TruckDepot` in the recycling livery.
- **Saves.** `GarbageSaveState` gains an optional `mrfs: { id, residue }[]`,
  only plants holding residue. Additive, no `SAVE_VERSION` bump; an old save
  has none. A plant no longer placed drops its store, like an incinerator's
  pit.
- **Render.** A kit in `utilitykits.ts`: a yard slab over the lot, the hall
  (54 × 46.5 m, 11 m) with three tipping-floor bay doors on the street side, a
  bale yard of stacked 1.1 × 0.75 × 1.5 m bales, an office and four parked
  recycling trucks, all inside the 100 × 120 m lot. Like the depot's, the kit
  paves its lot (`pavesLot`): it stands on the highest ground under the lot
  and its yard carries an 8 m footing, so on a slope the instancer's plinth
  stays under the yard and the low side shows a graded pad, not a gap.

### The transfer station (built 2026-10-08)

The second rung, and the forwarding rule applied to collected rubbish. It
diverts nothing.

- **Data.** `GarbageSpec` gains an optional `transferRate`, the units it moves
  a garbage pass: an entry with it is a transfer station, never a disposal
  facility, and its `bufferCapacity` is its tipping floor. The catalog entry,
  `transfer-station`, is 4×5 and 11 m, `collectionRange` 40, `trucks` 4,
  `transferRate` 9,072 (`TRANSFER_UNITS_PER_PASS`, from
  `TRANSFER_SHORT_TONS_PER_DAY` 50 by the same helper that derives
  `MRF_SORT_UNITS_PER_PASS`), `bufferCapacity` 362,880
  (`TRANSFER_FLOOR_UNITS`, `TRANSFER_FLOOR_DAYS` 2 of that), `powerUse`
  0.00945 MW (5 kWh a tonne, the day's use over 24 hours), `waterUse` 0.2 kL
  (4 staff), pollution 25, ¢7,500, ¢540 a month, unlocked at Small City
  (milestone 4).
- **The step**, in `GarbageSystem.tick` last, after the incinerators and then
  the landfill have collected. Stations go in id order; each can take this
  pass the lesser of `transferRate` and its floor's room, and nothing when the
  floor is full (it is **stopped**). Buildings in its road reach (`reachOf`),
  in id order, give up their tile trash the way they do to incinerators: one
  reached by several stations shares out a unit at a time round them
  (`shareOut`). Then each station, in id order, forwards up to `transferRate`
  of its floor through the MRF's forwarding (`forwardToFinal`): the final
  facilities on its street's road network, nearest first, ties to the
  landfill, then by incinerator id, each up to its room. Its road network is
  walked at most once a pass, and only when the floor holds something. What
  reaches an incinerator's pit is burned on its next pass.
- **Snapshot.** `SimSnapshot.garbage` gains an optional
  `transfers: { id, collected, forwarded, stored, stopped }[]`: what each
  station collected and forwarded on the last pass, what its floor holds, and
  whether a full floor stopped it. Stations are not in the incinerator list.
- **Trucks.** A station is a `TruckDepot` in the refuse livery.
- **Saves.** `GarbageSaveState` gains an optional `transfers: { id, stored }[]`,
  only stations holding something. Additive, no `SAVE_VERSION` bump; an old
  save has none. A station no longer placed drops its floor.
- **Render.** A kit in `utilitykits.ts` that paves its lot: a yard slab over
  the 80 × 100 m lot, a 30 × 50 m tipping hall 10 m to the eaves under a
  low-pitched roof whose ridge is the catalog's 11 m, three roll-up doors
  7.5 m tall on the street side, a sunken load-out bay along the hall's side
  with one tractor and 16 m open-top trailer in it and one waiting in the
  yard, two parked refuse packers on the apron, and a scale house beside a
  21.3 × 3.4 m weighbridge at the entry, all inside the lot.

### The forwarding step

One rule, in `GarbageSystem.tick` ahead of the existing disposal passes, because
nothing can be recovered once it is buried:

1. **Forwarding facilities collect first**, in building-id order, along the same
   road-BFS catchment `collectInto` already builds.
2. Each keeps `floor(collected × diversion)` as **recovered**, carrying the
   remainder per facility rather than per building.
3. The residue goes to the buffer and is **forwarded** to the nearest final
   facility reachable over the road network, resolved from the traversal already
   run. If none is reachable, or all are full, the residue stays put.
4. A facility whose buffer is full collects nothing and trash backs up — the
   incinerator's existing rule, now shared. **Then** the landfill and the
   incinerators collect what is left, as today.

Overlapping catchments do not stack: a building reached by more than one
forwarding facility is claimed once, by the highest `diversion`, ties broken by
building id — the stable tiebreak keeps the tick deterministic.

### Trucks

`garbagetrucks.ts` needs no new machinery: a recovery facility is a `TruckDepot`
like any other, budgeted by its catalog `trucks`, with no `dumpPath` — only a
landfill drives its trucks off the road. The second stream is a **second
round**, not a split-body vehicle: recyclables are 21% of the weight and about
40% of the volume of a refuse set-out, so a 50/50 body wastes capacity on one
side and fills early on the other, and decisively, the fleet carries nothing, so
a split payload would mean inventing a capacity model for a cosmetic system.

The arithmetic, as the check on `trucks: 4`: a residential truck makes about
**2,000 stops a five-day week**, some 400 a day
([Waste Today](https://www.wastetodaymagazine.com/article/smooth-rides)); a
household of 2.5 people at 1.32 kg a resident a day sets out 23 kg a week, so
400 stops is about 9 t, one or two loads of a 20–32 cubic yard body. One truck
on a weekly cycle serves 2,000 households — **5,000 residents**. So four trucks
draw a fleet for 20,000 while `burnRate` serves about 200,000. The
fleet stays at 4: a render budget, not a capacity, with `MAX_GARBAGE_TRUCKS` 16
citywide.

### Building sizes

The formula in [../../art/civic-massing.md](../../art/civic-massing.md) reads
`height ÷ 3.2` as storeys, and a recovery building is one clear-span hall, so
gross floor area is a **volume proxy** here and the sizing runs the other way:
derive single-level plan area from throughput and vehicle movement, ÷ 185 m² a
tile, round up to a rectangle, take height from the process's clear height.

| Plan area (m²)     | Recycling Centre | Transfer Station        |
| ------------------ | ---------------- | ----------------------- |
| Tipping / drop-off | 269              | 557                     |
| Process            | 168              | —                       |
| Aisle, load-out    | 105              | 943                     |
| Weighbridge, queue | 70               | 100                     |
| Site circulation   | 280              | 6,400                   |
| Office, welfare    | —                | in the scale house      |
| **Total ÷ 185**    | **892** → 4.8    | **8,000**, a real site  |
| Footprint, height  | **2×3**, **8 m** | **4×5**, **11 m**       |
| Formula GFA        | 6×185×2.5=2,775  | 20×185×3.44=12,719      |
| Occupant check     | 3 × 9.3 = 28     | 4 × 9.3 = 37            |

The drivers. **Recycling centre:** six 30 yd³ roll-offs at 2.4 m wide, each
needing 6.7 m of container and 12 m of hook-lift pull clearance, a 7.3 m aisle
and eight 2.7 × 5.5 m stalls; 2×3 rather than 5 tiles, because a 1×5 strip
cannot hold a 26 m service depth, and 8 m is hook-lift tipping height plus door
clearance. **Transfer station**, sized like the recovery facility from built
sites rather than the sum: at 50 short tons a day, EPA's 4,000 sq ft plus
20 sq ft a ton a day for each day held gives a two-day floor of 6,000 sq ft,
557 m²; the rest of a 1,500 m² hall (Becker County's 16,000 sq ft at 55–60 t a
day) is push wall, loader aisle and one sunken load-out bay for a 53 ft
(16 m) open-top trailer behind its tractor, about 22 × 4.9 m. A 21 m
weighbridge and a scale house take about 100 m², and the rest of the site is
queue, trailer parking and turning. Real stations of this size stand on 2–2.4
acres (Isle of Wight's 150 t a day on 2, Mammoth Lakes on 2.42), so 4×5 tiles,
8,000 m²; the draft's 3×4 was smaller than any. 10 m eaves and an 11 m ridge
clear the 25–30 ft (7.6–9.1 m) a tipping packer needs. In both the occupant
check is a sliver of the plan area, under 4% — the evidence that throughput,
not head count, drives the size. **The Materials
Recovery Facility** is sized from a built plant of its throughput instead
(above): Kauai's 3-acre, 27,000 sq ft plan for 55 t a day, so 5×6 tiles and a
2,510 m² hall, 11 m for 8 m clear over the tipping floor and a baler bay.

**The existing incinerator checks out on size and fails on throughput.** 4×4 at
20 m is 18,500 m², a 300–600 t/day mass-burn plant, while `burnRate: 4000` a
pass was 80,000 units a day — **20 t/day**, 15 to 30 times too little, and
`bufferCapacity: 400000` was 100 t, five days of that burn. The building is
authoritative; `burnRate` is re-derived from it at 450 t a day (90,000 a pass)
and the buffer kept at five days of the new burn (9,000,000), a dial since no
published pit figure was found.

## What could go wrong

**The per-tile trash layer cannot hold a per-capita rate.** `TRASH_TILE_MAX` is
255 and it is both the sim's store and the lens byte. A 150-resident tower at 9
units a resident-day puts 150 units a tile a day and saturates the clamp within
two days if collection lapses, silently losing what the sim needs. So the store
of record becomes a per-building figure and the per-tile layer a **projection**
of it into 0..255 — the largest piece of work here, and the least visible.

**Forwarding could become a second BFS per facility per pass.** "The nearest
final facility" must resolve from the `reached` set the facility already built,
not a fresh traversal; the gate is
[../performance-budget.md](../performance-budget.md).

**Rounding eats small diversions, and the credit crosses two cadences.** 7% of a
2-unit building is zero, so remainders carry per facility in integers; and
recovery accumulates every 10 ticks while income settles every 6,000, so the
accumulator is cleared once at the month boundary or it double-counts. And a
recovery facility with no disposal behind it fills and stops — intended, but it
reads as a bug, which is why the panel must say so.

## Alternatives

**A recycling percentage slider**, and **diversion at source** rather than
collection and residue. Both rejected: one dial replacing another is what this
epic exists not to do, and diverting at source lets a facility work with nothing
behind it, removing the ladder's bottom rung. The split body is rejected above.

**Merging `bufferCapacity` into epic 0's `ServiceSpec.capacity`.** Rejected as a
merge, adopted as a shared derivation: a stock in units and a population are
different quantities, and deriving both from one throughput figure gives one
source of truth without pretending they are the same number. **Leaving
`LANDFILL_CAPACITY_PER_TILE` at 600** and scaling generation down instead is
rejected for the same reason in reverse: generation is set by a published
figure, and the landfill matched none.

## How we will know it works

- A save written before this epic loads, with no recovery facilities present,
  the city behaving as it did, and its landfill fill _fraction_ unchanged — the
  pile is multiplied by the rescale ratio, not reset. **Written first**: it
  protects every existing city.
- A street of houses in a depot's reach buries 0.131 kg a resident a day less
  than the same street without one, exactly over a day; an apartment block, a
  shop and a works in reach bury the same as before; a depot past its 38,000
  homes serves no more; a house reached by two depots is served once; and a
  month's tally books its credit once.
- A Materials Recovery Facility sorts no more than its 9,072 units a pass,
  the depots' carts before its round; recovers 87% of it; forwards its residue
  to the nearest connected landfill or incinerator with room, at any distance;
  and with none, fills its store, then stops: its round serves no one and the
  depots go regional. Removing it drops its store.
- A transfer station collects only what the incinerators and the landfill
  leave: a building the landfill reaches goes to the landfill, one only the
  station reaches to the station. It collects no more than its 9,072 units a
  pass and its floor's room, holds at most two days (362,880 units), and stops
  collecting when the floor is full. It forwards up to 9,072 a pass to the
  nearest connected landfill or incinerator with room, at any distance and
  outside its own `collectionRange`, a landfill first on a tie, the overflow to
  the next; with none connected its floor fills. Distance does not reduce what
  arrives, it diverts none, and every unit it collects is forwarded or on its
  floor. Two stations over one building share it; its floor saves, an old save
  loads without one, and removing it drops its floor. Through the worker, a
  neighbourhood beyond the landfill's 28-tile reach is collected and the
  landfill fills by what it forwards; without the station that trash piles up.
- Generation is per capita: a 150-resident tower generates 37.5× a 4-resident
  house, not 3×; and a month with 1,000,000 units recovered books ¢160 once.
- Determinism and budget: the same city ticked twice recovers the same units in
  the same facilities, and a profile at the budget city size stays within it.

**This epic renders, so read-backs are not enough.** In a browser, at the
default camera pitch:

1. **The three facilities in a row**, with a 4.0 m car and a 9 m refuse vehicle
   on each apron: every bay door taller than the vehicle using it, and the
   [scale anchors](../../art/README.md) holding.
2. **The kerbside depot at street level**: a maintenance shed and parked
   side-loaders reading as a fleet yard, not a small warehouse.
3. **The recovery facility beside the incinerator**: a 5×6 / 11 m hall reading
   lower and longer than a 4×4 / 20 m burner — silhouette is all that tells them
   apart at distance.
4. **A refuse round and a recycling round on one street**: two liveries
   distinguishable at default camera distance.
5. **A landfill beside a city with a recovery facility, a game year apart**: the
   pile visibly lower — the epic has to be legible on the terrain.

## Out of scope

- **Composting and organics**, **per-material tracking** and **waste export**:
  the published 8.5 pp is in the design document for the next epic; otherwise
  one stream, one rate, no outside world.
- **A payload model for the fleet**, and **reworking collection**: the BFS, the
  building-id order and the full-buffer stop rule are unchanged, and only
  `burnRate` is retuned on the incinerator — its mass and trucks stay.
