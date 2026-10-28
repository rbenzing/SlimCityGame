# Power generation — technical design

- **Status:** Partly built — the water placement gate built 2026-10-02 for the pumping station, and the baseline it builds on changed 2026-10-05 (nameplate × capacity factor, every ploppable's draw sourced, the turbine drawn at size); the ladder re-planned 2026-10-14 on real small units with a solar farm; the four plants built 2026-10-14 (slice 1) and drawn the same day (slice 2)
- **Date:** 2026-09-18, re-planned 2026-10-14
- **Author:** Claude Opus 5

Epic 6 of the programme in [municipal-services.md](municipal-services.md). The
design it is written against is
[../../game-design/features/power-generation.md](../../game-design/features/power-generation.md),
which holds every derivation; this document holds the code.

## What we are building, and why now

Four catalog entries — a 1 MWac solar farm, a 50 MW gas turbine, an 89 MW
combined-cycle station and a 77 MW nuclear station — and four detail kits, the
reactor sited by the existing water placement gate. A city can then answer its
growth with a different kind of plant instead of another copy of the same one.
Now, because it is the smallest epic in the programme and touches neither the
save format nor the worker protocol.

**Two slices.** Slice 1 is the four entries and the tests that pin them: the
plants work, and draw as the generic catalog box at their true size. Slice 2 is
the four kits and the screenshots that judge them.

## What it touches

| Module                      | Change                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| `src/data/catalog.json`     | Slice 1: four new `utility` entries. No existing entry changes               |
| `src/shared/types.ts`       | **None.** `capacityFactor` and `requiresAdjacent: 'water'` exist             |
| `src/sim/worker.entry.ts`   | **None.** The placement gate already has a water branch                      |
| `src/sim/network.ts`        | **None.** Supply already sums `averageOutputMW` over the catalog             |
| `src/app/persist.ts`        | **None.** See the save rule below                                            |
| `src/render/utilitykits.ts` | Slice 2: four kits added to `UTILITY_KIT_CATALOG_IDS`                        |

**Save format: no change.** A save stores building instances by `catalogId`
string and the catalog is code data, so new entries are invisible to the
serialiser. See [../data-model/README.md](../data-model/README.md).

**The additive rule holds anyway, and is what the loader test pins.** A save
written before this epic loads after it with every building intact and every
figure unchanged, because nothing in it names the new entries. In the other
direction — a save holding a nuclear station opened by a build without one —
`recomputeUtilities` does `catalogMap.get(b.catalogId)` and skips a miss, so the
city loads with that plant absent rather than rejected. A missing catalog id
means "the city never had this", never "reject the file".

**Worker protocol: no change.** No new command, no new snapshot field. Placement
goes through the existing build command, and `SimSnapshot` already carries
`powerSupply` and `powerDemand` in MW. See [../interfaces/README.md](../interfaces/README.md).

## The design

### What the existing code actually does

Worth stating precisely, because the epic's point turns on it.
`recomputeUtilities` in `src/sim/network.ts` sums each `Active` or
`Constructing` generator's `averageOutputMW` — `powerMW × capacityFactor`, from
`src/shared/power.ts` — into one **city-wide** `powerSupply`; a generator on an
island with no road or line to the city still counts. It sums `powerUse` over
every non-`Abandoned` building into `powerDemand`. Coverage is a breadth-first
walk from the road or power-line tiles orthogonally adjacent to a generator's
footprint, across sealed street and line tiles, then one orthogonal step onto
non-road tiles.

Then the shortage cut runs, and it cuts from the far end of the grid (see
[Brownouts](../../world-sim/utilities-model.md#brownouts)). So:

- **It is a hard cut, not a dim.** No partial supply, no reduced effect.
- **It is furthest-first.** Buildings line up by network steps from the
  nearest generator, so the edge of the grid is what goes dark, and it stays
  dark: an abandoned building keeps its place in line.
- **The streets stay lit.** Only footprint tiles are cleared, so the lamp pass —
  which reads the road tile's power bit — carries on as if nothing happened.
- **Growth waits.** Nothing spawns or levels up into a shortage, and the
  Advisor names the shortage for as long as it holds anything back.

This epic does not change that rule; it gives the player somewhere to go before
it fires.

### Data

Every figure below is derived in the design document. All four are
`category: "utility"` with `powerUse: 0`, like the generators already in the
file; the solar farm and the reactor omit `pollution`, as the wind turbine does.

| `id`             | `name`                 | `powerMW` | `capacityFactor` | `footprint` | `height` | `pollution` | `waterUse` | `cost` | `upkeep` | `unlockMilestone` | `requiresAdjacent` |
| ---------------- | ---------------------- | --------- | ---------------- | ----------- | -------- | ----------- | ---------- | ------ | -------- | ----------------- | ------------------ |
| `solar-farm`     | Solar Farm             | 1         | 0.232            | 6×6         | 2.9      | —           | 0          | 97     | 2        | Tiny Village      | —                  |
| `gas-turbine`    | Gas Turbine            | 50        | 0.139            | 2×2         | 14       | 5           | 0          | 3170   | 256      | Small Town        | —                  |
| `combined-cycle` | Combined-Cycle Station | 89        | 0.605            | 4×3         | 24       | 26          | 1.2        | 5260   | 1030     | Small City        | —                  |
| `nuclear-plant`  | Nuclear Station        | 77        | 0.908            | 6×5         | 24       | —           | 4.9        | 68800  | 1314     | Grand City        | `water`            |

The milestone column is looked up by name in `MILESTONES`, never written as a
number in a test.

**The solar farm is optional at the first milestone.** It joins the wind turbine
and the coal plant as a Tiny Village generator, and nothing requires it, so the
opening of the game is untouched: `tests/interaction/firsttown.test.ts` does not
change.

### The placement gate

`requiresAdjacent` already takes `'rail' | 'water'`; the water member arrived with
the pumping station. `worker.entry.ts` refuses a build whose footprint has no
orthogonally adjacent water tile, against `GridState.water`, the mask that makes
a tile unbuildable — so the footprint stands on land and merely _touches_ water.
The reactor sets `requiresAdjacent: 'water'` and adds no gate code.

### Rendering (slice 2)

Four kits join `UTILITY_KIT_CATALOG_IDS`, built the same way as the coal plant's
and the stations': a pure layout from the catalog footprint, merged low-poly
geometry per part, instanced, no `Math.random` and no `Date.now`. Each is read by
its plant; every part and dimension is in
[../../art/civic-massing.md](../../art/civic-massing.md#the-generators-solar-gas-combined-cycle-and-the-reactor).
Two of them read the world beyond their footprint, both already done by sibling
kits: the solar rows face the sun's noon side of the scene **whatever the lot's
rotation**, and the reactor's cooling-water intake stands on the edge that touches
the water, found as the sewage works finds its outfall's.

The coal plant's kit stacks already stand above its catalog height, as a
process utility's may. Nothing in picking, outline or bulldoze may assume kit
geometry stays inside the catalog box — the turbine's rotor already does not.

## What could go wrong

**The ceiling is a cliff, and this epic does not remove it.** A city one MW short
of supply abandons the far end of its grid while the lamps outside it burn; the
ladder makes the cliff avoidable, and the Advisor names it for as long as it
holds anything back.

**The reactor may not fit a shoreline.** 6×5 contiguous buildable tiles touching
water is a real demand on generated terrain. Measure it on generated maps in
slice 1; if the maps do not offer one, the gate is a wall rather than a decision.

**Solar carpets the map.** A Metropolis on solar alone is three hundred 6×6 farms,
each a dozen rows. The rows are instanced, so a farm is a handful of instances,
but slice 2 measures the frame with a field of farms against
[../performance-budget.md](../performance-budget.md).

**The combined-cycle station supersedes coal.** That is the real relationship
and the design says so; the decision it leaves is when to stop burning coal.

**Leaning on a shipped field.** `requiresAdjacent` is read in exactly one place,
which makes it easy to widen carelessly. It must not become a general
placement-predicate system here.

## Alternatives

**Utility-scale units** — a 250 MW combined-cycle block and a 1,100 MW reactor.
Rejected by the player on 2026-10-14: with demand honest, the block would carry
110,000 people and the reactor 730,000, more than any city the game can grow.

**The reactor at EIA's table cost**, $8,349/kW, ¢28,570. Rejected by the player
for the real project cost of the machine drawn, $20,100/kW: every real small
reactor project has cost two to three times the table.

**Solar ruled out on land area.** The 2026-09-18 draft rejected a solar farm
because a tile of panels delivers so little. Counted at its real density and its
real capacity factor, the little it delivers is honest, and the land it takes is
the decision it offers; the player asked for it on 2026-10-14.

**Intermittency.** Rejected on the code rather than on taste. The cut rule does
not dim a short city, it blacks out the far end of the grid and abandons it after
three growth passes, and `VISUAL_DAY_TICKS` is 2,400 ticks — about six real
minutes at 1× — so a day-linked output would swing supply every few minutes and
roll abandonment across the edge of the city on that cycle. Solar and wind count
for their year's average instead. Taking intermittency later needs, in order: a
supply reserve the player can see, a storage building that turns surplus into
headroom, and a cut rule that sheds by priority rather than by id.

**Hydroelectricity.** Rejected. `GridState.water` is a flat `Uint8Array` mask
with no flow, head or catchment, and hydro output is flow times head, so a dam's
capacity could only be picked — which the tuning rule in
[municipal-services.md](municipal-services.md) forbids.

**A clearance ring around the reactor** instead of the water gate. Rejected: a
placement-time gate does not stop a zone growing a house inside the ring
afterwards, so it needs a second rule in the growth pass to mean anything.

**Raising the coal plant to a real 600 MW unit.** Rejected: it collapses the
bottom of the ladder, the half a new player actually meets.

**Per-network supply islands.** Rejected here as its own epic — it changes what
supply _means_ for every existing city.

## How we will know it works

Slice 1, in tests:

- A save written before this epic loads with every building intact and the same
  `powerSupply`, `powerDemand` and coverage grid. Written first, because it
  protects every city that already exists.
- A save naming a `catalogId` the catalog does not hold loads with that building
  contributing neither supply nor demand, without throwing.
- Placing each new plant raises `powerSupply` by exactly its `powerMW ×
  capacityFactor` — a gas turbine by 6.95, a solar farm by 0.232 — and leaves
  `powerDemand` and coverage outside its reach unchanged.
- A nuclear station with no orthogonally adjacent water tile is refused; the same
  station one tile nearer the shore is accepted; the footprint still may not
  stand on water. `requiresAdjacent: 'rail'` and the pumping station, drain and
  treatment works keep their gates.
- Demand crossing supply cuts from the far end of the grid; a combined-cycle
  station then restores exactly the buildings the cut removed.
- A combined-cycle station writes 26 into the pollution field at its anchor tile,
  where every plant emits, a gas turbine 5, and the solar farm and reactor
  nothing.
- Every new entry's figures match the table above — a data test, so a
  derivation cannot be edited away without this document being edited too.
- The reactor's 6×5 finds a legal shoreline site on the generated maps the tests
  use.

Slice 2, in tests: each kit's layout is deterministic and inside its lot at all
four rotations, and the solar rows face the same way at every rotation.

Looked at in a browser in slice 2:

1. **A gas turbine beside a police station**, default camera pitch — both are
   2×2, and if the turbine reads as another civic box the stack is not working.
2. **A combined-cycle station on an avenue frontage**, with a 4.0 m car in shot,
   the 24 m boiler and 40 m stack against the anchors in
   [../../art/README.md](../../art/README.md).
3. **A nuclear station on a shoreline**, camera low from across the water, a
   Podium Tower (`res-tower-1`, 38.4 m) in frame; the dome-free reactor building,
   24 m at its crane hall, stands below it, which is the honest read.
4. **A solar farm beside houses**, then the same farm turned, rows facing the
   same way.
5. **A field of solar farms**, frame time read.
6. **The nuclear ghost over dry land**, confirming the refusal reads as refused.
7. **Night.** The new kits stay unlit; the turbine's nacelle beacon is still the
   only generator part that reacts to night.

## Out of scope

- Changing the cut rule, adding storage or a reserve margin, or making any supply
  vary with time.
- Re-sizing the coal plant.
- Rooftop solar on zoned buildings.
- Per-network supply islands, transmission losses, and anything that makes supply
  other than a single city-wide total. Settled dials live in
  [../../game-design/balancing.md](../../game-design/balancing.md); anything that
  should never be built belongs in [../../DESIGN.md](../../DESIGN.md).
