# Service capacity — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 0 of the municipal services programme
([municipal-services.md](municipal-services.md)), built alone and first. Its design is
[../../game-design/features/service-capacity.md](../../game-design/features/service-capacity.md).

## What we are building, and why now

A service facility gains a **capacity** in people. Each tick the simulation works out
how many residents are within a facility's reach, divides by the capacity available to
them, and scales that facility's contribution to its field by `min(1, 1 / load)`, so an
oversubscribed service degrades smoothly instead of failing at a cliff. Nothing about
coverage changes.

It also builds the **Services panel**, which does not exist. Service funding is in
`CityStats`, `setServiceFunding` is in the worker protocol, and the economy already
multiplies a service building's upkeep by it — but nothing under `src/ui/` reads or
writes it, so the one dial the service model already has has never been reachable by a
player. That is a pre-existing gap, not scope invented here, and closing it belongs in
this epic: a load figure with nowhere to be read and a slider with nothing to read
against it are each half of a feature. Now, because eight epics queue behind this one and
this is the only change any of them makes to an existing contract.

## What it touches

| Module                     | Change                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `src/shared/types.ts`      | `ServiceSpec.capacity?`; `SimSnapshot.serviceLoad?`; `SelectionInfo.serviceLoad?`    |
| `src/sim/services.ts`      | `tick()` splits into a gather phase and a resolve phase; the traversal is unchanged  |
| `src/data/catalog.json`    | `capacity` on the four service entries; park entries deliberately without one        |
| `src/sim/worker.entry.ts`  | Per-kind load onto the snapshot; per-facility load onto the held selection           |
| `src/ui/ServicesPanel.tsx` | New — a row per `ServiceKind`: funding slider, load gauge, worst district            |
| `src/ui/store.ts`          | Mirror `serviceLoad`; clamp and dispatch the funding command                         |
| `src/main.ts`              | Mirror `snap.serviceLoad` into the store, beside `transit` and `districts`           |
| `src/ui/InfoPanel.tsx`     | A `LOAD` row for a selected facility, from `SelectionInfo.serviceLoad`               |
| `src/app/persist.ts`       | **Unchanged**; `src/sim/economy.ts` unchanged, as upkeep already scales with funding |

**Save format: no.** Capacity is catalog data and catalogs ship with the build; a save
stores building instances by `catalogId`, never the catalog itself, and load is derived
every tick and written nowhere, so `SAVE_VERSION` does not move and no layer is appended
(see [../data-model.md](../data-model.md)). The additive rule still has to be stated,
because it is what the loader relies on: **a save written before this epic loads after
it**, with the new field absent rather than rejected — absent meaning uncapped, never
capacity zero.

**Worker protocol: yes, additively.** `SimSnapshot` gains an optional `serviceLoad`,
`SelectionInfo` an optional `serviceLoad`. No command changes: `setServiceFunding`
exists and already takes 0..1.5. A mirror that does not understand the new field ignores
it. See [../interfaces.md](../interfaces.md).

## The design

### Data: what is stored, what is derived

Stored, in [`src/data/catalog.json`](../../../src/data/catalog.json):

```ts
export interface ServiceSpec {
  kind: ServiceKind;
  strength: number; // unchanged: 0..255 written into the field at the source
  range: number; // unchanged: road-network BFS distance in tiles
  capacity?: number; // NEW: people this facility can serve; absent = uncapped
}
```

`capacity` is **optional**, and that is load-bearing rather than tidiness: a required
field forces a number onto the two park entries, where the candidates are a lie (some
finite figure) or a bug (zero, which divides to infinite load). Population in reach,
per-tile supply and load are derived every tick and stored nowhere — load in
particular not in `CityStats`, which the save serializes, and a stale derived value is
what that would invite.

### Where population-in-reach comes from

The part most likely to be got quietly wrong, so it is specified exactly. Coverage works
in three steps per facility in [`src/sim/services.ts`](../../../src/sim/services.ts):
find the nearest road tile to the footprint, walk the connected road network to the
funding-scaled range (`roadBfsDistances`), then radiate two tiles around every reached
road tile into a per-tile coverage map (`radiateWeighted`). That map —
`Map<tileIndex, value>` — already holds **every tile the facility reaches, each exactly
once**. It is built today, iterated once by `applyCoverage`, and thrown away. Population
is read off that same map: walk `coverage.keys()`, read `grid.buildingId[tile]` (zero
means no building), add the id to a `Set<number>`, then sum `residentsById.get(id)`.

**The set is the whole answer to double counting.** A building whose footprint spans six
reached tiles is added to the set six times and stored once, so its residents are
counted once. Without it a 3×3 tower inside a station's reach contributes nine times its
population, and every load figure in the game is wrong by roughly the average footprint
area of a home — which reads as bad balance rather than as a bug.

`residentsById` is a `Map<buildingId, number>` built once per tick from the
`BuildingInstance[]` the tick already receives: `Active` state only, `residents` from the
catalog entry, `?? 0` otherwise. That is exactly the rule
[`src/sim/economy.ts`](../../../src/sim/economy.ts) uses for `CityStats.population` and
has to stay that rule, because a load measured against a different population than the
one on screen is a long hunt. Three consequences follow, each a decision. A building
**partly** in reach counts in full and once — pro-rating by footprint fraction was
rejected, because it holds the footprint map alive for the whole pass and models a
household as attending two-fifths of a school. **Jobs never count**, since capacity is
people who depend on a service where they live. And **Constructing and Abandoned
buildings contribute nobody**.

The added cost is one more walk of a map that already exists — `O(tiles covered)` on top
of an existing `O(tiles covered)`. There is **no second BFS and no second grid sweep**,
which is the gate [../performance-budget.md](../performance-budget.md) sets.

### Pooling, and the shape of the tick

Capacities have to sum where reaches overlap. The obvious way to do that is to group
facilities that share any tile into one pool and give every member the pool's load, and
it is **wrong for this game** — not subtly, and the argument is worth keeping because it
is the kind of mistake that looks like a simplification until the city gets big.

Pooling by shared tiles is transitive. A overlapping B and B overlapping C pools all
three even where A and C are nowhere near each other. Police coverage reaches 48 tiles
along the road network, so in any city dense enough to have several stations they form a
chain, and the chain closes into a single pool spanning the map. Load then becomes one
city-wide average, which destroys the exact signal the panel below exists to show: the
worst district and the aggregate become the same number at precisely the size where a
player needs to tell them apart. A model whose accuracy collapses as the city grows is
the wrong model for a city builder.

So capacity is pooled **per tile**, by proportional allocation. A facility dedicates its
capacity to the people it reaches, so a tile's share of that facility is its share of the
facility's reach population, and the tile's total supply is the sum of those shares:

```
supply[t] = Σ over facilities f reaching t of (capacity_f × funding[kind]) / P_f
load[t]   = 1 / supply[t]
```

where `P_f` is the reach population derived above. The multiplier applied to the blended
field at that tile is then `min(1, supply[t])`, which is `min(1, 1 / load[t])` — the same
rule the programme states, resolved where the people actually are.

It gives the properties we asked for, and they are worth checking rather than asserting.
One clinic with capacity 1,000 reaching 2,000 people: `supply = 0.5`, load 2.0, half
strength. **Two** such clinics reaching the same 2,000: `supply = 1.0`, load 1.0, full
strength — two half-loaded clinics and one fully loaded clinic covering the same people
do give the same result, which is what makes "build another one" a real answer. One
clinic capacity 1,000 reaching 500: `supply = 2.0`, and `min(1, 2.0)` is 1, so slack
never pays a bonus. And a starved district stays starved in the reading, because nothing
from a distant facility reaches its tiles.

`P_f = 0` — a station in an industrial district with no residents — makes `capacity / P_f`
infinite, and `min(1, ∞)` is 1. That is correct rather than a special case: there is
nobody to overload it. A facility with **no** `capacity` contributes infinity the same
way, which is why absent-means-uncapped needs no separate branch in the code. Both fall
out of the arithmetic, and the test that a pre-capacity save is unaffected therefore
passes for a real reason rather than because a flag was checked.

`ServiceSim.tick` runs **one kind at a time**, in two phases. Gather: for each active
facility of the kind, in `id` order as today — nearest road tile, BFS, radiate, collect
the distinct building ids for `P_f`, accumulate `capacity_f / P_f` into a per-kind
`supply` map over its coverage tiles, and keep the coverage map. Nothing is written in
this phase. Resolve: walk the same facilities again in `id` order, scale each tile of a
facility's own coverage by `min(1, supply[t])`, and apply it exactly as
`applyCoverage` applies it today.

**Blending the kind's facilities into one map before applying it does not preserve
behaviour, and the obvious argument that it does is wrong.** Subtraction and addition are
monotonic and clamp at a fixed bound, so the clamping is indeed safe to defer — but
`clamp255` also **rounds**, and rounding two facilities' contributions separately is not
the same byte as rounding their sum: 18.75 and 17.5 land on 19 + 18 = 37 one at a time
and on 36 together. Two `small-park` entries overlapping on one street are enough to show
it, and a test that asserts the pre-capacity bytes for two facilities of every kind
catches it. So the resolve phase stays per facility, at the cost of holding one coverage
map per facility of the kind in flight rather than one per kind — the only new allocation
this epic asks for, and the price of every existing city loading unchanged.

**Funding scales capacity as well as range**, by the same `funding[kind]` factor: funding
is money and money is staff, and upkeep already moves with it in `economy.ts`, so the
cost is charged today. Funding zero needs no guard, because the facility is skipped
before the traversal.

**One division does need a guard, and it is not the one you would expect.** Nobody in
reach divides to `Infinity`, and `min(1, Infinity)` is the uncapped facility with no
branch to forget — that is the whole point of letting the arithmetic answer. But a
facility with capacity **zero** reaching nobody is `0 / 0`, which is `NaN`, and `NaN`
survives `min()` to reach `clamp255`, which writes **zero**. On a max-blended kind that
does not merely fail to help: it erases health another clinic had already supplied. So
the share is `people > 0 ? available / people : Infinity` — nobody in reach is uncapped
whatever the capacity says. No shipped entry carries a zero capacity, and the design
calls one a bug; the guard is there because the failure mode is silent, and a field
quietly zeroed is the hardest kind of wrong to find.

### What crosses the worker protocol, and what the panel shows

Two channels, because the panel and the selection ask different questions. The first is a
per-kind aggregate on every snapshot — ten numbers, cheap at the snapshot rate:

```ts
serviceLoad?: Record<ServiceKind, { load: number; worst: number }>;
```

`load` is the city aggregate for the kind — Σ reach population ÷ Σ capacity over the
capped facilities — and `worst` is the highest `load[t]` over tiles that actually hold
residents. Both are needed: the aggregate answers "have I bought enough", the worst
answers "is one district starved", and a city can sit at 95% overall with one district at
240% because its facilities are the wrong side of a river. Per-tile pooling is what makes
that second figure mean anything; under a model that pools facilities transitively the
two numbers converge on each other as the city grows, and the district signal disappears
exactly when it starts to matter. Tiles supplied only by uncapped facilities are in
neither figure, and a kind with no capped facility reports zero, which the panel renders
as `—`. The second
channel is **per-facility, only when selected**: the worker already recomputes and pushes
the held selection every snapshot, so a facility's own load rides `SelectionInfo` and
costs nothing when nothing is selected. It is a bare `serviceLoad?: number`, not a
`ServiceLoad` — "the worst district" means nothing for one building — and the gather
phase has already divided its reach population by its capacity, so `ServiceSim` keeps
that figure by `id` and the selection reads it rather than traversing again. Absent
for anything that is not a capped facility with a reach; zero is a real reading there
and means nobody in reach depends on it. Sending every facility's load every snapshot was
rejected — `O(facilities)` per snapshot for a number read one at a time.

The panel floats in the left slot the district and transit panels use (see
[../../ux/hud.md](../../ux/hud.md)), one row per `ServiceKind`. Each row carries the
funding slider and the load gauge **together**, because they are the two answers to one
question and splitting them is what made funding invisible. The slider sends
`setServiceFunding` and flips its local reading immediately, as district policies do.

### Rules the implementation must satisfy

1. A `ServiceSpec` with no `capacity` never degrades, at any population.
2. A building counts once towards a facility's reach population, in full if any tile of
   it is reached, however many of its tiles are.
3. Only `Active` buildings' `residents` count, matching `CityStats.population`.
4. Capacities sum at a tile before the division, so two facilities each covering half a
   tile's need together cover it.
5. The multiplier is `min(1, supply[t])`, never above 1 — slack never pays a bonus.
6. A tile reached by one uncapped facility is uncapped.
7. `capacity` and `range` both scale by `funding[kind]`.
8. Exactly one road BFS per active facility per tick, before and after.
9. Identical input gives identical load, ordered by facility `id`.
10. A facility whose reach holds nobody is never degraded.

## What could go wrong

**Existing cities will change, and the umbrella's mitigation covers half of it.** "No
capacity figure means uncapped" protects a city whose entries have none — but this epic
_gives_ the four existing entries figures, so a mature city loaded after it may find its
clinics at 150%. Intended, and still a regression. Survivable because the degradation is
smooth, the panel explains it the moment it opens, and the capacities are generous
against the populations cities actually reach — but it belongs in the release note.

**Proportional allocation assumes a facility spreads itself evenly over the people it
reaches.** It does not model a resident choosing the nearer clinic, so a tile at the far
edge of a large facility's reach draws the same share as one at its door. That is the
right simplification here — distance already enters through `radiateWeighted`, which
falls off with hop distance, so the far tile gets a weaker coverage value even though its
supply share is equal. If it ever reads wrong, the fix is to weight the share by the same
falloff rather than to pool facilities, and it is not in this epic.

**Holding coverage maps costs memory the old pass did not** — one kind at a time, each
map sized by its facility's reach, and the first figure to look at if the tick budget
slips. Nothing times a tick today: [../performance-budget.md](../performance-budget.md)
is honest that the 10 ms target is enforced by no test, so the structural test (one BFS
per facility, counted) is the weaker thing that actually guards it.

## Alternatives

| Shape                         | Why not                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Required `capacity: number`   | Uncapped must be representable; a park's candidates are a fabricated figure or a zero divide |
| Per-facility load, no pooling | Contradicts the programme rule; two clinics on one district each read as overloaded          |
| A second BFS for population   | Doubles the most expensive per-facility work to find what the first traversal already knows  |
| Funding scaling range only    | Ambiguous slider: more range pulls more people in, raising load while improving coverage     |

## How we will know it works

Behaviour tests in `src/sim/services.test.ts`, panel tests in the pattern the other
panels use. Each pins a rule above.

- **Rule 1** — an entry with no capacity figure, surrounded by a hundred thousand
  residents, writes the field it writes beside one house. Written first: it protects
  every existing city.
- **Rule 2** — a 3×3 building in reach adds its residents once, not nine times; splitting
  it into nine 1×1 homes of a ninth the population gives the same load, and a building
  with one tile in reach counts in full.
- **Rules 3, 4 and 5** — Constructing and Abandoned contribute nobody and a facility
  reaching the whole city sees exactly `CityStats.population`; capacities 1,000 and 1,000
  over 3,000 give load 1.5 and both write two-thirds strength; 1,000 over 500 does not
  exceed full strength.
- **Rules 6, 7 and 10** — a tile reached by one uncapped facility is uncapped however
  loaded its other supplier is, non-overlapping facilities do not pool, the city at
  funding 1.5 carries two-thirds its load at 1.0, and a facility reaching nobody at all
  writes full strength rather than dividing by zero.
- **Rules 8 and 9** — exactly one road BFS per active facility per tick, counted by a
  traversal handed to `ServiceSim` in place of `roadBfsDistances` (an ES module's internal
  call cannot be spied on from outside it), and identical load and fields across ticks.
- **Behaviour preservation** — two overlapping facilities of every kind, at the shipped
  strengths and ranges and with no capacity anywhere, write the fields the pre-capacity
  pass wrote, byte for byte. Captured from that implementation and asserted as a
  fingerprint per field; it is what "every old save plays the same" means, and it is what
  caught the rounding above.
- **The panel** — a snapshot carrying `serviceLoad` shows a gauge per kind, one without
  leaves the rows reading `—` rather than throwing, and the slider sends
  `setServiceFunding` with the value it shows before the worker confirms.

**Nothing in the world renders** — no mesh, no footprint, no field colour the simulation
was not already writing — so there is no in-world shot to take and none is invented here.
The Services panel is DOM overlay, covered by component tests plus one look in a browser.

## Out of scope

- **New service buildings.** None. Four catalog entries gain a field.
- **Correcting those four buildings' sizes.** The design document derives them and
  records that all four existing heights are wrong; the corrections belong to the epics
  that rebuild them, by [../../art/civic-massing.md](../../art/civic-massing.md).
- **Reworking coverage.** The BFS, the two-tile radiation and the blend are unchanged.
- **Queues, waiting lists, dispatch and per-citizen simulation.** An overloaded facility
  is a weaker facility; it grows no backlog, sends no vehicle, and tracks no individual.
  Settled figures land in [../../game-design/balancing.md](../../game-design/balancing.md).
