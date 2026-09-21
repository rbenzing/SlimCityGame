# Power generation — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 6 of the programme in [municipal-services.md](municipal-services.md). The
design it is written against is
[../../game-design/features/power-generation.md](../../game-design/features/power-generation.md),
which holds every derivation; this document holds the code.

## What we are building, and why now

Three catalog entries — a 30 MW gas turbine, a 250 MW combined-cycle station and
a 1,100 MW nuclear station — one new placement gate, and three detail kits. A
city can then answer its own growth with a bigger plant instead of another copy
of the same one. Now, because it is the smallest epic in the programme and the
only one touching neither the save format nor the worker protocol; it can land
before or after [service-capacity.md](service-capacity.md), since power is a
utility rather than a service field and consumes nothing that epic builds.

## What it touches

| Module                      | Change                                                           |
| --------------------------- | ---------------------------------------------------------------- |
| `src/data/catalog.json`     | Three new `utility` entries. No existing entry changes           |
| `src/shared/types.ts`       | `requiresAdjacent?: 'rail'` widens to `'rail' \| 'water'`        |
| `src/sim/worker.entry.ts`   | The placement gate gains a water branch beside the rail one      |
| `src/render/utilitykits.ts` | Three kits added to `UTILITY_KIT_CATALOG_IDS`                    |
| `src/sim/network.ts`        | **None.** Supply already sums `utility.powerMW` over the catalog |
| `src/app/persist.ts`        | **None.** See the save rule below                                |

**Save format: no change.** A save stores building instances by `catalogId`
string and the catalog is code data, so three new entries are invisible to the
serialiser. See [../data-model.md](../data-model.md).

**The additive rule holds anyway, and is what the loader test pins.** A save
written before this epic loads after it with every building intact and every
figure unchanged, because nothing in it names the new entries. In the other
direction — a save holding a nuclear station opened by a build without one —
`recomputeUtilities` already does `catalogMap.get(b.catalogId)` and skips a miss,
so the city loads with that plant absent rather than rejected. A missing catalog
id means "the city never had this", never "reject the file".

**Worker protocol: no change.** No new command, no new snapshot field. Placement
goes through the existing build command, and `SimSnapshot` already carries
`powerSupply` and `powerDemand` in MW. See [../interfaces.md](../interfaces.md).

## The design

### What the existing code actually does

Worth stating precisely, because the epic's point turns on it.
`recomputeUtilities` in `src/sim/network.ts` sums `utility.powerMW` over every
`Active` or `Constructing` building into one **city-wide** `powerSupply` — a
generator on an island with no road or line to the city still counts — and sums
`powerUse` over every non-`Abandoned` building into `powerDemand`. Coverage is a
breadth-first walk from the road or power-line tiles orthogonally adjacent to a
generator's footprint, across sealed street and line tiles, then one orthogonal
step onto non-road tiles.

Then `applyBrownout` runs, and it is not a brownout. It sorts consumers by
**ascending building id**, accumulates each one's `powerUse` against the supply
total, and the moment the running total exceeds supply it clears the power bit on
that building's **footprint tiles only** — and on every later building's, by
construction. So:

- **It is a hard cut, not a dim.** No partial supply, no reduced effect.
- **It is newest-first.** Building ids ascend with placement order, so the
  district the player just built is the one that goes dark.
- **The streets stay lit.** Only footprint tiles are cleared, so the lamp pass —
  which reads the road tile's power bit — carries on as if nothing happened.
- **Then it abandons.** Three growth passes without power while `Active` and the
  building abandons, dropping its demand and re-powering the next one down.

An under-supplied city loses its newest district to a silent rolling collapse
under working street lights. This epic does not change that rule; it gives the
player somewhere to go before it fires.

### Data

Every figure below is derived in the design document:

| `id`             | `utility.powerMW` | `footprint` | `height` | `pollution` | `waterUse` | `cost` | `upkeep` | `unlockMilestone` | `requiresAdjacent` |
| ---------------- | ----------------- | ----------- | -------- | ----------- | ---------- | ------ | -------- | ----------------- | ------------------ |
| `gas-turbine`    | 30                | 2×2         | 14       | 17          | 0.5        | 1600   | 680      | 1                 | —                  |
| `combined-cycle` | 250               | 5×5         | 28       | 41          | 2          | 17500  | 3500     | 4                 | —                  |
| `nuclear-plant`  | 1100              | 8×8         | 40       | —           | 4          | 535000 | 11600    | 5                 | `water`            |

All three are `category: "utility"` with `powerUse: 0`, like the generators
already in the file. `waterUse` scales off the coal plant's 1 kL by staff count —
condenser cooling comes from the adjacent water body, not the town main — and the
reactor omits `pollution` as the wind turbine does, the field being a local
air-pollutant source that a reactor has none of.

### The placement gate

`requiresAdjacent` is the existing precedent and widens by one member, to
`'rail' | 'water'`. `worker.entry.ts` already refuses a build whose footprint has
no adjacent rail tier; the water branch is the same shape against
`GridState.water`, already the mask that makes a tile unbuildable — so the
footprint stands on land and merely _touches_ water. The rail path stays
byte-identical: the water check is an added branch, not a rewrite of it.

### Rendering

Three kits join `UTILITY_KIT_CATALOG_IDS`, built the same way as the coal
plant's: merged low-poly geometry per part, instanced, placement a pure function
of the catalog footprint with no `Math.random` and no `Date.now`. Parts, in the
language of [../../art/props-and-vehicles.md](../../art/props-and-vehicles.md):
an inlet filter house, low enclosure and one slim unstriped stack to about 26 m
for the **gas turbine**; a turbine hall, taller boiler casing, one stack to about
50 m and a street-facing transformer row for the **combined-cycle station**; a
cylindrical containment with a hemispherical cap about 44 m across and 65 m tall,
a long low turbine hall and a switchyard strip for the **nuclear station** — no
cooling towers, because the water gate buys once-through cooling and a
natural-draught tower would be five tiles wide on its own.

The coal plant already has kit geometry (26 m stacks) standing above its catalog
height (22 m), as [../../art/civic-massing.md](../../art/civic-massing.md)
requires of a process utility. Nothing in picking, outline or bulldoze may assume
kit geometry stays inside the footprint — the turbine's rotor already does not.

## What could go wrong

**The ceiling is a cliff, and this epic does not remove it.** A city one MW short
of supply abandons its newest buildings while the lamps outside them burn; the
ladder makes the cliff avoidable, not visible. The cheap mitigation is the panel,
which already has `powerSupply` and `powerDemand` and could show headroom.

**The nuclear station may not fit any shoreline.** 8×8 contiguous buildable tiles
touching water is a real demand on generated terrain, and if the maps do not
offer one the gate is a wall rather than a decision. Measure it on generated maps
before the entry ships.

**Nuclear is strictly dominant once affordable** — cheapest per MW to run, no
smoke, one placement replacing fifteen coal plants. Every counterweight is
front-loaded: ¢535,000, the milestone gate, the water gate, 64 tiles. If that is
not enough, the dial to turn is the cost, bracketed between $7,000 and $15,000
per kW.

**Widening a shipped field.** `requiresAdjacent` is read in exactly one place
today, which makes the change small and also makes it easy to widen carelessly.
It must not become a general placement-predicate system here.

**The 8×8 breaks the six-tile massing rule** in
[../../art/civic-massing.md](../../art/civic-massing.md). The design document
states the override; if a reviewer disagrees, the answer is to shrink the
reactor's capacity, not its footprint away from its derived plate area.

## Alternatives

**A solar farm.** Rejected on land area, which is arithmetic rather than taste.
Utility photovoltaics deliver about 0.5 MW per hectare; a 20 m tile is 0.04 ha,
so a tile carries **0.02 MW**. The largest footprint the massing rule tolerates,
6×6, is 1.44 ha and therefore **0.72 MW** — an eighth of one wind turbine — and a
solar farm matching the existing coal plant needs 120 ha, or **3,000 tiles**: a
55×55 block, a fifth of the map's linear extent. There is no honest solar farm on
a 20 m grid, and a dishonest one overstates its output a hundredfold.

**Intermittency.** Rejected on the code rather than on taste. The cut rule does
not dim a short city, it blacks out the newest buildings and abandons them after
three growth passes, and `VISUAL_DAY_TICKS` is 2,400 ticks — about six real
minutes at 1× — so a day-linked output would swing supply every few minutes and
roll abandonment across the newest district on that cycle. With no storage and no
reserve margin to plan against, intermittency here is attrition, not a decision.
Taking it later needs, in order: a supply reserve the player can see, a storage
building that turns surplus into headroom, and a cut rule that sheds by priority
rather than by id.

**Hydroelectricity.** Rejected. `GridState.water` is a flat `Uint8Array` mask
with no flow, head or catchment, and hydro output is flow times head, so a dam's
capacity could only be picked — which the tuning rule in
[municipal-services.md](municipal-services.md) forbids. A reservoir is also a
terrain edit the game has no concept of.

**A clearance ring around the reactor** — no housing within N tiles — instead of
the water gate. Rejected as fiddly and holed: a placement-time gate does not stop
a zone growing a house inside the ring afterwards, so it needs a second rule in
the growth pass to mean anything, and a one-way gate the player walks around by
zoning later is worse than no gate. Water adjacency is one branch, true of every
station of that class, and creates the same "site it out of town and run a line"
decision.

**Rescaling `powerUse` to reality**, and **raising the coal plant to a real
600 MW unit.** Both rejected. Dividing demand by twenty makes one existing coal
plant carry a city of 27,000 and deletes the problem; multiplying coal by ten
makes the 6 MW turbine a hundredth of the next rung and collapses the bottom of
the ladder, which is the half a new player actually meets.

**Per-network supply islands.** Rejected here as its own epic — it changes what
supply _means_ for every existing city, exactly the contract change this epic is
scoped to avoid.

## How we will know it works

Behaviour, in tests — the rules these pin become the spec entry, which starts
from the [documentation map](../../README.md):

- Placing a gas turbine raises `powerSupply` by exactly 30 and leaves
  `powerDemand`, `waterSupply` and coverage outside its reach unchanged.
- A nuclear station with no orthogonally adjacent water tile is refused; the same
  station one tile nearer the shore is accepted. The gate is adjacency, not
  occupancy — the footprint still may not stand on water.
- `requiresAdjacent: 'rail'` behaves exactly as today. This is the regression the
  widened union has to earn.
- A save written before this epic loads with every building intact and the same
  `powerSupply`, `powerDemand` and coverage grid. Written first, because it
  protects every city that already exists.
- A save naming a `catalogId` the catalog does not hold loads with that building
  contributing neither supply nor demand, without throwing.
- Demand crossing supply still cuts by ascending building id, clears footprint
  tiles only, and leaves road tiles powered; a combined-cycle station then
  restores exactly the buildings the cut removed, in id order.
- A combined-cycle station writes 41 into the pollution field at its own tiles;
  two overlapping stay under the 170 growth threshold and three exceed it.
- Every new entry's footprint, height, pollution, cost and upkeep match the
  design document's table — a data test, so a derivation cannot be edited away
  without the document being edited too.
- Each kit's part placements are a pure function of the catalog footprint, with
  no `Math.random` and no `Date.now`, as every sibling kit already is, and three
  more kit registries keep the render frame inside
  [../performance-budget.md](../performance-budget.md) at budget city size.

Looked at in a browser, because all three render:

1. **A gas turbine beside a police station**, default camera pitch — both are
   2×2, and if the turbine reads as another civic box the stack is not working.
2. **A combined-cycle station on an avenue frontage**, with a 4.0 m car and a
   pedestrian in shot, checking the 28 m casing and 50 m stack against the
   anchors in [../../art/README.md](../../art/README.md).
3. **A nuclear station on a shoreline**, camera low from across the water, a
   Residential Tower (46 m) in frame. The dome must stand clearly above the tower
   and the hall read as longer than a city block.
4. **A wind turbine and a gas turbine in one frame**, confirming the rotor still
   sits inside its 20 m tile and the taller object is visibly the smaller plant.
5. **The nuclear ghost over dry land**, confirming the refusal reads as refused.
6. **Night.** The new kits stay unlit; the turbine's nacelle beacon is still the
   only kit part that reacts to night.

## Out of scope

- Changing the cut rule, adding storage or a reserve margin, or making any supply
  vary with time.
- Rescaling `powerUse` on any existing catalog entry, and re-sizing the coal plant
  or the wind turbine — both are checked in the design document and stay.
- Per-network supply islands, transmission losses, and anything that makes supply
  other than a single city-wide total. Settled dials live in
  [../../game-design/balancing.md](../../game-design/balancing.md); anything that
  should never be built belongs in [../../DESIGN.md](../../DESIGN.md).
