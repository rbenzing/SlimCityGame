# Healthcare and death care — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 2 of [municipal-services.md](municipal-services.md), written against
[../../game-design/features/healthcare-and-death-care.md](../../game-design/features/healthcare-and-death-care.md),
which holds every capacity, rate and price and the derivation of each. This one
holds the shapes, the arithmetic behind the building sizes, and the risk.

## What we are building, and why now

A hospital above the existing clinic, a cemetery and a crematorium below both,
and the first thing in this simulation that can reduce population. The player
gets a health service that can be outgrown and a consequence for neglecting the
dead; the codebase gets its first non-monotonic population.

Now, because it consumes [service-capacity.md](service-capacity.md) hardest — a
hospital serving a district and a clinic serving a street write the same
`health` field and nothing distinguishes them once written — and because the
population sink is the change most likely to be got wrong on paper.

## What it touches

| Module                  | Change                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`   | `DeathCareSpec`; `BuildingInstance.occupancy`; `VehicleKind.Hearse`; `SimSnapshot.deathCare` |
| `src/data/catalog.json` | `hospital`, `cemetery`, `crematorium` added; `clinic` resized                                |
| `src/sim/deathcare.ts`  | New: death accrual, hearse collection, backlog, the health penalty                           |
| `src/sim/services.ts`   | Coverage unchanged; the backlog penalty applies after it, in the same pass                   |
| `src/sim/economy.ts`    | Population sum weights by `occupancy`                                                        |
| `src/sim/growth.ts`     | Occupancy refills on the existing problems pass                                              |
| `src/app/persist.ts`    | `SaveMeta.deathCare`; `occupancy` on serialized instances                                    |
| `src/ui/`               | Cemetery fill gauge in the service panel; the uncollected-dead notification                  |

**Save format: yes, additively, and the grid is untouched.** No tile layer is
added, so `SAVE_VERSION` stays at **11** and `BYTES_PER_TILE` at **45**
([../data-model.md](../data-model.md)). Two optional `SaveMeta` additions,
defaulted the way the `garbage` block was: `deathCare` — per-facility interments
plus the backlog as a sparse list of `{ tile, count, sinceTick }` — defaults to
empty, and `occupancy` on each serialized `BuildingInstance` **defaults to 1.0**.
**A save written before this epic loads after it with the new service absent
rather than the save rejected**: the programme rule, and the first test written
rather than the last. The backlog cannot be runtime state the way uncollected
trash is — trash regenerates on load, a body is a historical fact.

**Worker protocol: yes, additively.** `SimSnapshot` gains an optional
`deathCare` block (per-facility used/total plus the city's uncollected count) so
the panel reads a gauge without a round trip. **No new `Command`** —
`placeBuilding` and `bulldoze` already exist
([../interfaces.md](../interfaces.md)). **No new `ServiceKind`** either: death
care writes no coverage field and rides the existing `health` funding, so
`ServiceKind`, `CityStats.serviceFunding` and `setServiceFunding` are untouched.

## The design

### Data

`DeathCareSpec` mirrors `GarbageSpec`, the established shape for "a facility
with a road-BFS collection radius and a buffer":

```ts
export interface DeathCareSpec {
  mode: 'burial' | 'cremation';
  collectionRange: number; // road-network BFS distance in tiles
  plots?: number; // burial: interments before full
  rate?: number; // cremation: interments handled per tick
  hearses: number; // cosmetic, like GarbageSpec.trucks
}
```

`BuildingCatalogEntry` gains `deathCare?: DeathCareSpec`; `BuildingInstance`
gains `occupancy: number` in 0..1; `VehicleKind` gains **`Hearse: 7`**, appended
because values are stable and never reordered. The kind is not persisted, so it
costs nothing in the save — it costs **one more InstancedMesh, permanently**,
since the vehicle kit is one mesh per kind
([../../art/props-and-vehicles.md](../../art/props-and-vehicles.md)), charged
against [../performance-budget.md](../performance-budget.md).

Real dimensions, which do not scale with the tile: an **ambulance is 6.5 × 2.1 ×
2.8 m** (London Ambulance Service FOI, box-body Sprinter, 6,492 × 2,105 mm); a
**hearse is 6.2 × 1.9 × 1.9 m** (Coleman Milne Mercedes 214, cross-checked
against a Cadillac XT5 funeral coach at 6.32 × 1.90 × 1.86 m). They are within
0.3 m in length, so **the silhouette read must come from height and livery** —
1.9 m against 2.8 m.

### Deriving every footprint and height

Formula from [../../art/civic-massing.md](../../art/civic-massing.md): gross
floor area = `w × d × 185 × (height ÷ 3.2)`, so tiles = gross ÷ 185 ÷ storeys,
rounded up to a whole rectangle.

| Building    | Occupant load                        | m²/occ | Gross needed | Storeys | Tiles | Result     | Provides |
| ----------- | ------------------------------------ | ------ | ------------ | ------- | ----- | ---------- | -------- |
| Clinic      | 12 staff + 20 patients = 32          | 13.9   | 445 m²       | 2       | 1.20  | 1×2, 6.4 m | 740 m²   |
| Hospital    | 72 beds + 99 staff + 42 others = 213 | 22.3   | 4,750 m²     | 5       | 5.14  | 2×3, 16 m  | 5,550 m² |
| Crematorium | chapel 100 + 8 staff + plant         | mixed  | 626 m²       | 1       | 3.38  | 2×2, 6.4 m | 1,480 m² |
| Cemetery    | gatehouse: 40 mourners + 3 staff     | mixed  | 128 m²       | 1       | 0.69  | 3×3, 3.2 m | ground   |

**The head counts.** Clinic: 4 doctors, 2 nurses, 1 assistant, 5 reception and
admin, plus ~20 patients and companions present. Hospital: 72 beds, staff at
3.45 FTE per occupied bed (the lower US quartile, because "adjusted" beds
inflate the median for outpatient work) = 248 FTE with ~40% on days = 99, plus
**42 attenders at once — an assumption, not a derivation**, anchored on 2,830
admissions a year ÷ 360 = 7.9 arrivals a day plus clinics and visitors.
Crematorium: a 215 m² chapel (100 × 1.4 m² net ÷ 0.65), a 111 m² office, a 60 m²
foyer, and **240 m² of cremator hall, plant and body store — the one number in
this epic with no published source**, assumed at 6 × 10 m per unit including
charging clearance, twice, plus 120 m² of plant and store. The 626 m² total sits
inside the observed 500–800 m² band for a single-chapel municipal crematorium
(Chingford, 568 m² GIA).

**Ground, not just floor.** Open ground inside a footprint is 215 m² per tile
(400 − 185); a 90° stall all-in (2.7 × 5.5 m plus half a 7.3 m aisle) is
24.7 m². Clinic 430 m² against 6 stalls (148 m²) ✓. Hospital 1,290 m² against 3
ambulance canopy bays (100 m²) and 40 staff stalls (988 m²) ✓, frontage 40 m
under the 120 m ceiling ✓. Crematorium 860 m² against 24 stalls (593 m²) and 3
hearse bays (100 m²) ✓. The **cemetery is sized by ground alone** — 4.05 m² of
land per grave over the whole 400 m² tile is 98 graves per tile, so eight burial
tiles plus a gatehouse tile is 780 plots, and that gatehouse fits one tile's
185 m² plate at one storey, hence 3.2 m. The crematorium's 6.4 m is likewise
**one tall storey** the formula counts as two floors, since chapel and cremator
hall do not stack; its flue is a prop above the roofline.

**The existing clinic entry disagrees, and not marginally.** `clinic` is 2×2 at
14 m = **3,237 m²**, **7.3× the 445 m² a four-doctor practice needs**; read
back, 3,237 ÷ 13.9 = 233 occupants, which at a third staff and three staff per
doctor is 26 doctors and a list of 52,000, above the Metropolis milestone. **At
2×2 × 14 m the clinic could never be oversubscribed at any city size this game
reaches, and epic 0's capacity foundation would be dead on arrival for health.**
Correct it to **1×2, 6.4 m** — robustly, since a six-doctor practice (40
occupants, 556 m², 1.50 tiles) lands on the same rectangle.

### Behaviour

**Deaths accrue, they are not rolled.** A fractional city counter advances each
tick by `population × 1.25e-7`; when it passes 1, one body is emitted and 1
subtracted — no RNG, no rounding loss, deterministic across save and reload. The
body is attributed by a rotating index over Active residential instances in id
order, so attribution is deterministic too.

**Collection reuses garbage's mechanism, not the dispatcher's.** A facility with
room collects every building within its `collectionRange` road-BFS radius, in
building-id order; hearses route depot → building → depot like garbage trucks,
and are cosmetic. They deliberately do **not** ride `DispatchSystem`: a funeral
is not an incident, `Incident['kind']` should not gain a member for one, and the
32-slot pool should not have ambulances competing with hearses. A burial
increments a cemetery's interments until `plots` is reached, after which it
collects nothing, as a full landfill already does; a crematorium consumes at
`rate` per tick and never fills.

**The penalty applies after coverage, in the same pass.** For each tile holding
uncollected bodies, subtract `min(255, count × 32 × (ticksUncollected ÷ 6000))`
from `FieldId.Health` there and on the two tiles around it — the radiation the
coverage pass already computes. **Order is a rule, not an accident:** all
coverage first, then the penalty, so a clinic cannot re-cover a tile already
subtracted from in the same tick. Without it, building id order decides.

**Population becomes occupancy-weighted.** `EconomySystem.tick` sums
`round(residents × occupancy)`; a death reduces its building's occupancy by
`1 / residents`; occupancy refills on the growth system's existing problems pass
by `0.002 × max(0, demand.res)`, clamped to 1. In-migration refills homes before
the spawn scan builds new ones — right municipally, and the smallest blast
radius, since the spawn scan itself is untouched.

**The rules the implementation must satisfy**, which become the tests below and
then spec entries reachable from the [documentation map](../../README.md): an
old save loads unchanged; deaths accrue deterministically across a save
boundary; a full cemetery collects nothing and a crematorium never fills;
coverage precedes the penalty for every building order; and population is the
occupancy-weighted sum that tax, demand and milestones all read.

## What could go wrong

**Population has never gone down, and this is where the bugs are.** Each of
these is a real place, not a hypothetical:

- **`economy.ts`, the milestone ratchet** only ever climbs, so a city shrinking
  from Metropolis to Big Town keeps Metropolis unlocks. Probably right; never a
  _decision_. Pin it either way.
- **`economy.ts`, `computeMilestoneProgress`** clamps to 0, so a city that falls
  below its own milestone's threshold shows a flat zero — indistinguishable from
  having just arrived, and no signal at all that it is going backwards. The
  first visible bug, and one line.
- **`demand.ts`, every denominator.** The `max(200, …)`, `max(400, …)` and
  `max(600, …)` floors are divide-by-zero guards for a city starting at zero,
  not behaviour for one shrinking toward it: as population falls, `employed`
  falls and the denominator shrinks with it, so residential demand _rises_ —
  self-correcting, probably desirable, chosen by nobody.
- **`demand.ts`, the commercial term.** Population falling against constant jobs
  drives com demand sharply negative, lighting `LowDemand` on commercial
  buildings, which (if that flag ever gets teeth) removes jobs, which raises res
  demand. A coupled oscillation nothing has exercised; when the city pulses,
  look here first.
- **`growth.ts`, `Problem.LowDemand`** is display-only today, since abandonment
  triggers on NoPower/NoWater/NoRoad alone. This epic lights it on many
  buildings at once for the first time, and it must stay toothless or the
  oscillation above becomes a demolition wave.
- **`economy.ts` monthly tax, `worker.entry.ts` `selectionOccupancy` and
  `traffic.ts` `tripsForTick`** all read population or occupancy directly. Tax
  must use the occupancy-weighted figure or the city collects rent on empty
  flats; the inspector must read the instance rather than assume full; thinning
  traffic is now an _expected_ effect of the sink, not a regression.
- **[../../world-sim/population-model.md](../../world-sim/population-model.md)**
  states as fact that there is "no partial occupancy … no vacancy rate within a
  single building", and that population "only ever changes through the state
  transitions above". Both become false. Stale documentation is the same class
  of defect as stale code, so updating that page is part of this epic.

**Resizing `clinic` orphans grid stamps.** Footprints derive from the catalog at
runtime (`footprintForRotation`) while the 2×2 stamp lives in the saved
`buildingId` layer, so shrinking the entry makes `registry.remove` clear two
tiles of four and leave two permanently unbuildable. The loader must re-stamp
placed ploppables from the catalog: the riskiest single change here.

**The backlog penalty could outrun the warning.** 32 points a month is tuned so
the gauge and the notification both land before the field moves; raise the death
rate or the coefficient later and that ordering silently inverts. The per-tile
backlog is also unbounded — sparse at real rates, since a Metropolis makes 450
bodies a year, but the save block needs a stated cap and a behaviour at it.

## Alternatives

**A `deathcare` `ServiceKind` with its own funding slider.** Rejected: it writes
no coverage field, so it would be a member of an enum that exists to select one,
and it would change `CityStats`, the HUD and the save for no decision.

**Hearses on `DispatchSystem`.** Rejected: it adds a member to
`Incident['kind']`, puts funerals in the incident marker list, and makes hearses
compete with ambulances for 32 slots; garbage collection is the same job with
the right shape already. **Reusing `VehicleKind.Car`** is rejected too —
civilian vehicles pick a randomized saturated colour, so the city would run
magenta hearses, and `Ambulance` puts a red cross on a funeral.

**A city-level population deficit instead of per-building occupancy.** Rejected:
a second authoritative number can drift out of sync with the building set, which
is exactly the property
[../../world-sim/population-model.md](../../world-sim/population-model.md) names
as the current model's strength. **Leaving the clinic at 2×2 × 14 m** and
raising its capacity to match is rejected by the arithmetic above.

## How we will know it works

Behaviour, in the order the risk sits:

- A save written before this epic loads, every building fully occupied, no
  facility holding interments, nothing uncollected. Written first.
- A city of 10,000 run for one game year (72,000 ticks) produces 90 deaths, ±1
  for the fractional remainder, and the same run split by a save and reload
  produces the same 90.
- A cemetery with 780 plots stops collecting on the 781st body; a crematorium
  run for ten game years has collected every body offered.
- One uncollected body four game months old subtracts 128 from `Health` at its
  tile; the same body collected a tick earlier subtracts nothing. A clinic
  placed on a penalised tile does not erase it, in any placement order.
- A hospital covering 60,000 people halves its effective strength, and the same
  hospital plus a second covering the same tiles does not — the contract from
  [service-capacity.md](service-capacity.md), exercised by its first consumer.
- Population falls when residential demand is at or below zero and deaths
  continue, and recovers when demand turns positive. Milestone level does not
  fall with it; milestone _progress_ reports something other than a flat zero.
- Demolishing a cemetery holding 780 interments charges ¢7,800 and an empty one
  does not; a resized `clinic` loaded from a save leaves no orphan tile stamp.

**This epic renders, so these have to be looked at in a browser, not read back:**

- **The ladder, in one frame.** A house, a 1×2 × 6.4 m clinic and a 2×3 × 16 m
  hospital on one street at the default camera pitch. If clinic and hospital are
  not obviously different buildings without labels, the ladder has failed.
- **The cemetery as grounds.** 3×3 at 3.2 m from the default pitch, and again
  zoomed to the 1.75 m pedestrian, to confirm plot rows and a gatehouse rather
  than a 60 m grey slab.
- **Hearse, ambulance and car stopped on one street** — 6.2 m, 6.5 m and 4.0 m.
  The shot checks that height and livery separate the service vehicles, since
  their lengths do not.
- **The crematorium's flue** against the 3.2 m storey and the pedestrian: it has
  to read as plant, which is how a process utility is recognised.
- **The health lens over a district with a backlog.** The grey must be a hole
  where the bodies are, not a city-wide smear.

## Out of scope

- Disease, epidemics and health events; ages, cohorts and cause of death.
  Deaths are a rate, and nothing here creates a demographic model.
- Eldercare as a building, for the reason the design document gives, and grave
  reuse beyond the demolition charge.
- Giving `Problem.LowDemand` teeth — named above precisely because this epic
  must not be the change that arms it.
- Reworking coverage or the road-network BFS, as the programme requires.
