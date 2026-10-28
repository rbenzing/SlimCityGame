# Service capacity

- **Status:** Built

**Owns:** a facility's capacity in people, the load it carries, the smooth degradation, per-tile pooling, the load channels to the panel and the Services panel itself. Coverage is unchanged; the frame is [municipal-services.md](municipal-services.md).

**Rules:**

- Treat a `ServiceSpec` with no `capacity` as uncapped; nobody in reach is uncapped (`Infinity`, never `0/0`). `[R-services-012]`
- Multiply a facility's field by `min(1, supply)`; never exceed 1, never a threshold, queue or refusal. `[R-services-012]`
- Pool capacity per tile by proportional allocation, never by grouping facilities that share a tile. `[R-services-014]`
- Count a building once and in full if any tile is reached; only `Active` residents; jobs never. `[R-services-013]`
- Resolve contributions per facility, never pre-blended per kind, because `clamp255` rounds. `[R-services-013]`
- Run exactly one road BFS per facility per tick; population rides the coverage map. `[R-services-010]`
- Iterate in ascending facility id. `[R-services-011]`
- Keep load on `SimSnapshot`, never in `CityStats` or the save; read no capped facility as `—` and a facility reaching nobody as `0%`. `[R-services-022]` `[R-services-023]`

**Numbers:** derivations and sources are in [the sources](../sources/service-capacity.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Police station capacity | 25,000 (1.9 sworn per 1,000, about 48 sworn, 6 cars) | people | [police](../sources/service-capacity.md#police-station-25000-people) |
| Fire station capacity | 14,000 (4 firefighters × 4.5 = 18 per engine, 1.30 per 1,000) | people | [fire](../sources/service-capacity.md#fire-station-14000-people) |
| Clinic capacity | 8,000 (4 physicians × 2,000 panel) | people | [clinic](../sources/service-capacity.md#clinic-8000-people) |
| School capacity | 7,000 (456 pupils, 64 per 1,000) | people | [school](../sources/service-capacity.md#school-7000-people) |
| Park capacity | none, uncapped | people | dial |
| Funding | 0 to 1.5, scales range, capacity and upkeep | × | dial |
| Police / fire reach | 48 tiles along the road network (police) | tiles | dial |
| Clamp | strength 0..255 | | dial `clamp255` |
| Per 1,000 served: police / fire / clinic / school | ¢160, ¢12 / ¢321, ¢23 / ¢625, ¢48 / ¢857, ¢57 | ¢ | [costs](../sources/service-capacity.md#costs) |
| Fully served city running cost | about ¢140 a month per 1,000 | ¢ | same |
| Panel rows | five kinds; ten numbers a snapshot | rows | dial |

**Code:**

- `src/shared/types.ts` `ServiceSpec.capacity?`, `SimSnapshot.serviceLoad?` (`ServiceLoad`: `load`, `worst`, `capped`), `SelectionInfo.serviceLoad?`.
- `src/sim/services.ts` `ServiceSim.tick`: gather phase then resolve phase; `roadBfsDistances` (injectable), `radiateWeighted`, `applyCoverage`.
- `src/data/catalog.json`: `capacity` on the four service entries, none on parks.
- `src/sim/worker.entry.ts`: per-kind load onto the snapshot, per-facility load onto the held selection.
- `src/ui/ServicesPanel.tsx`: a row per kind, funding slider and load gauge, worst district.
- `src/ui/store.ts`: mirrors `serviceLoad`, clamps and dispatches `setServiceFunding`.
- `src/main.ts`: mirrors `snap.serviceLoad` beside `transit` and `districts`.
- `src/ui/InfoPanel.tsx`: a `LOAD` row for a selected facility.
- `src/sim/economy.ts`: unchanged; `CityStats.population` is the rule residents follow. `src/app/persist.ts` unchanged.

**Tests:** `src/sim/services.test.ts` (each rule below), `src/ui/ServicesPanel.test.tsx`, `src/ui/InfoPanel.test.tsx`.

**Open:** none.

## Why the rules are what they are

### Capacity and the panel

A service was satisfiable once: a clinic answered health for the whole game, however large the city grew. And the one dial that exists, funding, had no control anywhere. Capacity gives a limit; the panel gives it somewhere to be read. A limit nobody can see is a difficulty setting, and a slider with nothing to read against it is a guess.

- A facility serves a number of people. A park has none: nobody queues for a park.
- Load is people in reach over places available. Over capacity a facility degrades: 200% does half the good, 400% a quarter.
- An overloaded school writes a weaker education field, so a district that outgrows it stops levelling up: growth pushes back on itself.
- Funding scales range, capacity and upkeep by one factor, so the price of the slider is charged today. A slider scaling range alone is ambiguous: more range pulls in more people, raising load while improving coverage.
- A save from before loads and plays the same. Capacity is catalog data; load is derived every tick and written nowhere, so `SAVE_VERSION` does not move. An old save never rejects.

### Population in reach

Coverage finds the nearest road tile, walks the road network to the funding-scaled range (`roadBfsDistances`) and radiates two tiles around each reached road tile (`radiateWeighted`). That `Map<tileIndex, value>` already holds every reached tile once.

- Population is read off that map: walk `coverage.keys()`, read `grid.buildingId[tile]` (zero is no building), add the id to a `Set<number>`, sum `residentsById.get(id)`.
- The set is the whole answer to double counting. Without it a 3×3 tower contributes nine times its population and every load is wrong by the average home footprint.
- `residentsById` is built once a tick: `Active` only, `residents` from the catalog entry, `?? 0` otherwise. It must stay the rule `economy.ts` uses for `CityStats.population`.
- A partly reached building counts in full; pro-rating by footprint holds the footprint map alive and models a household as attending two-fifths of a school. Constructing and Abandoned buildings contribute nobody.
- The added cost is one more walk of an existing map: `O(tiles covered)`. No second BFS, no second grid sweep.

### Pooling per tile

Grouping facilities that share any tile is transitive: A overlaps B and B overlaps C pools all three. Police reach 48 tiles, so any dense city chains its stations into one map-wide pool. Load becomes a city average and the worst district equals the aggregate at the size a player needs them apart.

So a facility dedicates its capacity to the people it reaches, and a tile's supply is the sum of those shares:

```
supply[t] = Σ over facilities f reaching t of (capacity_f × funding[kind]) / P_f
load[t]   = 1 / supply[t]
```

`P_f` is the reach population. The multiplier at a tile is `min(1, supply[t])`.

- One clinic of capacity 1,000 reaching 2,000: supply 0.5, load 2.0, half strength. Two reaching the same 2,000: supply 1.0, full strength.
- One reaching 500: supply 2.0, and `min(1, 2.0)` is 1, so slack pays no bonus.
- A starved district stays starved in the reading; nothing from a distant facility reaches its tiles.
- `P_f = 0` makes the share infinite and `min(1, ∞)` is 1; an uncapped facility is infinity the same way, so absent-means-uncapped needs no branch.
- A capacity of zero reaching nobody is `0 / 0`, which is `NaN`; `NaN` survives `min()` into `clamp255`, which writes zero and would erase health another clinic supplied. So the share is `people > 0 ? available / people : Infinity`. No shipped entry carries a zero capacity.
- Distance already enters through `radiateWeighted`, which falls off with hop distance, so a far tile gets a weaker value at an equal share. If that reads wrong, weight the share by the falloff; do not pool facilities.

### The shape of the tick

`ServiceSim.tick` runs one kind at a time in two phases, in facility `id` order.

- Gather: per active facility, nearest road tile, BFS, radiate, collect distinct building ids for `P_f`, accumulate `capacity_f / P_f` into a per-kind `supply` map, keep the coverage map. Nothing is written.
- Resolve: walk the facilities again, scale each tile of a facility's own coverage by `min(1, supply[t])`, apply as `applyCoverage` always did.
- Blending into one map first does not preserve behaviour. Clamping is monotonic, but `clamp255` also rounds: 18.75 and 17.5 land on 19 + 18 = 37 one at a time and 36 together. Two overlapping `small-park` entries show it.
- The price is one coverage map per facility of the kind in flight, the only new allocation, and the first figure to look at if the tick budget slips. Nothing times a tick: the 10 ms target in the [performance budget](../engineering/performance-budget.md) is enforced by no test, so the structural test (one BFS per facility, counted) guards it.
- Funding zero needs no guard: the facility is skipped before the traversal.
- Proportional allocation does not model a resident choosing the nearer clinic: the share is even over the reach.

### What crosses the worker

Two channels, because the panel and a selection ask different questions. No command changes: `setServiceFunding` exists and takes 0..1.5. A mirror that does not understand the field ignores it. See [interfaces](../engineering/interfaces/README.md) and [data model](../engineering/data-model/README.md).

- Per kind on every snapshot: `serviceLoad?: Record<ServiceKind, { load: number; worst: number; capped: number }>`. `load` is Σ reach population ÷ Σ capacity over capped facilities; `worst` is the highest `load[t]` over tiles holding residents. A city can sit at 95% overall with one district at 240% behind a river.
- Tiles supplied only by uncapped facilities are in neither figure.
- `capped` counts capped facilities that contributed. `load` is zero both with no capped facility and with one reaching nobody, which want opposite reactions. So `capped === 0` reads `—` and anything else a real percentage, including `0%`.
- Per facility, only when selected: a bare `serviceLoad?: number` on `SelectionInfo`, kept by `id` from the gather phase. Absent for anything that is not a capped facility with a reach; zero means nobody depends on it. Sending every facility's load every snapshot was rejected as `O(facilities)` for a number read one at a time.
- The panel floats in the left slot the district and transit panels use ([HUD](../ux/hud.md)). The slider sends `setServiceFunding` and flips its local reading at once, as district policies do. A snapshot without `serviceLoad` leaves rows reading `—`.
- Read the gauge as a percentage: `Health 138%` means clinics are asked for 38% more than they can give; "the school is at 180%" is a traceable decision. The funding slider sits beside it.
- A save stores building instances by `catalogId`, never the catalog.
- Parks read `—` because an uncapped service has no load, and the row is there so the funding slider is. Under 100% is not a problem and the gauge does not reward overbuilding.

### Rules the implementation satisfies

1. A `ServiceSpec` with no `capacity` never degrades, at any population.
2. A building counts once towards reach population, in full if any tile is reached.
3. Only `Active` residents count, matching `CityStats.population`.
4. Capacities sum at a tile before the division.
5. The multiplier is `min(1, supply[t])`.
6. A tile reached by one uncapped facility is uncapped.
7. `capacity` and `range` both scale by `funding[kind]`.
8. One road BFS per active facility per tick.
9. Identical input gives identical load, ordered by `id`.
10. A facility whose reach holds nobody is never degraded.

Tests pin them: rule 1, a hundred thousand residents around a no-capacity entry writes what one house does (written first). Rule 2, a 3×3 adds its residents once and equals nine 1×1 homes of a ninth the population. Rules 3 to 5, capacities 1,000 and 1,000 over 3,000 give load 1.5 and two-thirds strength; 1,000 over 500 does not exceed full. Rules 6, 7 and 10, the city at funding 1.5 carries two-thirds its load at 1.0. Rules 8 and 9, a traversal handed to `ServiceSim` in place of `roadBfsDistances` counts the BFS, since an ES module's internal call cannot be spied on. Behaviour preservation: two overlapping facilities of every kind with no capacity write the pre-capacity bytes, captured as a fingerprint per field. That caught the rounding above.

### Fit of the four existing buildings

The sizes of the four buildings were found wrong (three of four heights) and are corrected by the epics that rebuild them; the derivations, the lot-from-site argument and the school's field shortfall are in [the sources](../sources/service-capacity.md#do-the-existing-buildings-match). The school keeps 3×3.

- Existing cities change: this work gives the four entries figures, so a mature city may find its clinics at 150%. Intended, and a release-note item; degradation is smooth and capacities are generous.
- Nothing in the world renders, so there is no in-world shot; the panel is DOM, covered by component tests and one look in a browser.

## Decided

- Optional `capacity`, not required: a park's candidates are a fabricated figure or a zero divide.
- Per-tile pooling, not per-facility load: two clinics on one district would each read overloaded.
- Per-tile, not transitive pooling: the chain closes into one map-wide pool.
- No second BFS for population: it doubles the dearest per-facility work.
- Funding scales capacity as well as range: money is staff.
- Out: queues, waiting lists, dispatch, per-citizen simulation, new buildings, reworking coverage (BFS, two-tile radiation and blend unchanged).
