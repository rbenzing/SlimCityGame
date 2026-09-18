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
| `src/ui/`                  | Waste panel reports diverted, forwarded and buffered                              |

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
`recoveredTotal`. `VehicleKind` gains `Recycling: 7`, and a mirror that does not
know the value falls back to the `Garbage` livery rather than dropping the
vehicle. No new `Command`. See [../interfaces.md](../interfaces.md).

## The design

### Data

`GarbageSpec` gains three optional fields, so every existing entry keeps its
meaning unedited: `diversion` (0..1 of the collected stream recovered, default
0), `servesPeople` (capacity in people), and `final` (true = disposal, forwards
nothing). `final` defaults to **true**, so the incinerator means tomorrow what
it means now; forwarding facilities set it false.

`servesPeople` is the concession to epic 0, and it is **not** `bufferCapacity`
renamed: a buffer is a stock of material, epic 0's `ServiceSpec.capacity` is a
population, and treating a stock as a rate would be a modelling error. What
unifies them is their _source_ — both fall out of the facility's daily
throughput: `servesPeople` is that throughput in kg ÷ 2.2 kg a person a day, and
`bufferCapacity` is days of storage × throughput ÷ 0.25 kg a unit. One dial, two
readings. Waste gets **no** `ServiceKind` member and no coverage field: the
umbrella already rejected a field per service on memory grounds, and
`collectionRange` is the reach model waste has always had.

### The unit correction, first

Diversion is a percentage of a base rate, so the base rate has to mean something
before anything else lands. Both are balance, derived in the design document,
living in `src/shared/constants.ts`:

- **Generation becomes per capita**, at **9 units per resident per game day**
  (2.25 kg at 0.25 kg a unit, against the published 2.2), with commercial and
  industrial per job at the ratio the sector constants already set. The present
  per-building rate implies 0.8 to 10 units a resident-day.
- **`LANDFILL_CAPACITY_PER_TILE: 600 → 3,000,000`**, from the tile's rendered
  2,400 m³ pile at the published light-compaction density of 0.31 t/m³.

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

The arithmetic, as the check on `trucks: 4`: a published round is about **1,000
lifts a shift**; a household of 2.5 people at 2.2 kg a day sets out 38.5 kg a
week; 1,000 lifts is 38.5 t against a published 9 t payload, 4.3 loads a shift,
matching the published 3–5 round trips. One truck on a weekly cycle serves 5,000
households — **12,500 residents**. So four trucks draw a fleet for 50,000 while
`burnRate` serves 9,100 and the 4×4 / 20 m building is a plant for 136,000. The
fleet stays at 4: a render budget, not a capacity, with `MAX_GARBAGE_TRUCKS` 16
citywide.

### Building sizes

The formula in [../../art/civic-massing.md](../../art/civic-massing.md) reads
`height ÷ 3.2` as storeys, and a recovery building is one clear-span hall, so
gross floor area is a **volume proxy** here and the sizing runs the other way:
derive single-level plan area from throughput and vehicle movement, ÷ 185 m² a
tile, round up to a rectangle, take height from the process's clear height.

| Plan area (m²)     | Recycling Centre | Transfer Station | Recovery Facility |
| ------------------ | ---------------- | ---------------- | ----------------- |
| Tipping / drop-off | 269              | 550              | 625               |
| Process            | 168              | 300              | 1,300             |
| Aisle, load-out    | 105              | —                | 400               |
| Weighbridge, queue | 70               | 150              | 190               |
| Site circulation   | 280              | 790              | 1,160             |
| Office, welfare    | —                | 80               | 110               |
| **Total ÷ 185**    | **892** → 4.8    | **1,870** → 10.1 | **3,785** → 20.5  |
| Footprint, height  | **2×3**, **8 m** | **3×4**, **9 m** | **4×6**, **11 m** |
| Formula GFA        | 6×185×2.5=2,775  | 12×185×2.8=6,244 | 24×185×3.4=15,263 |
| Occupant check     | 3 × 9.3 = 28     | 4 × 9.3 = 37     | 15 × 9.3 = 140    |

The drivers. **Recycling centre:** six 30 yd³ roll-offs at 2.4 m wide, each
needing 6.7 m of container and 12 m of hook-lift pull clearance, a 7.3 m aisle
and eight 2.7 × 5.5 m stalls; 2×3 rather than 5 tiles, because a 1×5 strip
cannot hold a 26 m service depth, and 8 m is hook-lift tipping height plus door
clearance. **Transfer station:** 44 t/day at one unloading stall per
25–30 t/day is two stalls at 4.0 × 24 m, plus a one-day surge pile at 300 kg/m³
stacked 2 m and one below-grade trailer position at 22 × 4.9 m; 9 m is inside
the published 7.5–9 m tipping-hall clear height and above a rear loader's raised
tailgate. **Recovery facility:** 88 t/day of which 21.1% is
recovered, and at the published 20% MRF residue rate the inbound is 23.2 t/day,
2.9 t/h over a shift — a line at the published 1,200–1,600 m² for the class; 4×6
gives a workable 80 × 120 m site inside the 6-tile frontage ceiling, and 11 m
covers 8 m clear over the tipping floor, a 4.5 m sort platform and a 9 m baler
bay. In all three the occupant check lands at 1–4% of the plan area — the
evidence that throughput, not head count, drives the size.

**The existing incinerator checks out on size and fails on throughput.** 4×4 at
20 m is 18,500 m², a 300–600 t/day mass-burn plant, while `burnRate: 4000` a
pass is 80,000 units a day — **20 t/day**, 15 to 30 times too little.
`bufferCapacity: 400000` is 100 t, exactly 5 days of that burn against published
refuse-pit storage of 3–5 days, so the buffer is the one figure that is right.
The building is authoritative; `burnRate` is re-derived from it.

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
accumulator is cleared once at the month boundary or it double-counts.

**A recovery facility with no disposal behind it is a trap** — intended, and it
reads as a bug, so the panel must say _forwarded: 0, no disposal in reach_.

## Alternatives

**A recycling percentage slider.** Rejected: replacing one dial with another is
what this epic exists not to do. (The split-body vehicle is rejected above.)

**Merging `bufferCapacity` into epic 0's `ServiceSpec.capacity`.** Rejected as a
merge, adopted as a shared derivation: a stock in units and a population are
different quantities, and deriving both from one throughput figure gives one
source of truth without pretending they are the same number.

**Diversion at source**, and **leaving `LANDFILL_CAPACITY_PER_TILE` at 600.**
Both rejected: diverting at source lets a facility work with nothing behind it,
removing the ladder's bottom rung; and low-density generation already matches a
published figure, while the landfill matches none.

## How we will know it works

- A save written before this epic loads, with no recovery facilities present,
  the city behaving exactly as it did, and its landfill fill _fraction_
  unchanged — the stored pile is multiplied by the rescale ratio, not reset.
  **Written first**: it protects every existing city.
- A city with a recycling centre in reach buries 7% less than the same city
  without one, over the same number of passes; and a building reached by both a
  centre and a recovery facility is diverted once, at 21% and not at 28%.
- A recovery facility with no landfill or incinerator reachable collects until
  its buffer is full, then stops and trash backs up; removing it drops that
  buffer, as `drop(id)` already does.
- A transfer station forwards to a final facility outside its own
  `collectionRange`, distance does not reduce what arrives, and it diverts none
  of it.
- Generation is per capita: a 150-resident tower generates 37.5× a 4-resident
  house, not 3×; and a month with 1,000,000 units recovered books ¢400 through
  the existing income pass, once.
- Determinism and budget: the same city ticked twice recovers the same units in
  the same facilities, and a profile at the performance-budget city size keeps
  the garbage pass within budget.

**This epic renders, so read-backs are not enough.** In a browser, at the
default camera pitch:

1. **The three facilities in a row**, with a 4.0 m car and a 9 m refuse vehicle
   on each apron: every bay door taller than the vehicle using it, and the
   anchors in [../../art/README.md](../../art/README.md) holding.
2. **The recycling centre at street level**: roll-off containers and a hook-lift
   shed reading as a drop-off yard, not a small warehouse.
3. **The recovery facility beside the incinerator**: a 4×6 / 11 m hall reading
   lower and longer than a 4×4 / 20 m burner — silhouette is all that tells them
   apart at distance.
4. **A refuse round and a recycling round on one street**: two liveries
   distinguishable at default camera distance.
5. **A landfill beside a city with a recovery facility, a game year apart**: the
   pile visibly lower — the epic has to be legible on the terrain.

## Out of scope

- **Composting and organics**, **per-material tracking** and **waste export**:
  the published 8.5 pp is in the design document for the next epic; otherwise
  one stream, one rate, and no outside world to ship to.
- **A payload model for the fleet**, and **reworking collection**: the BFS, the
  building-id order and the full-buffer stop rule are unchanged.
- **Retuning the incinerator's mass or truck count** — only `burnRate`, because
  diversion depends on it; the building and its four trucks stay.
