# The simulation tick

What runs inside one sim tick, in what order, and on what cadence. The clock
that drives ticks — rate, speed multipliers, the visual day — is
[time-system.md](time-system.md); this document is only the pipeline that
runs once a tick actually fires.

## The driver

The worker (`src/sim/worker.entry.ts`) wraps a `FixedTimestep`
(`src/core/loop.ts`) around a single private method, `tick()`. Each firing
increments `tickNo` by exactly 1 and calls `tick()` once — the tick logic
itself does not know or care what real-time speed multiplier produced the
call. At speed 0 the timestep never advances and `tick()` never fires; a
separate path, `pumpPaused()`, still drains queued player commands and
recomputes utilities/posts a snapshot immediately, since command application
is pure and tick-independent (no RNG, no growth/fields/economy/traffic), but
`tickNo` does not move and no simulation system runs.

## The order, every tick

Inside `tick()`, in exactly this order:

1. **`drainCommands()`** — applies every queued player command batch
   (build, bulldoze, zone, policy, etc.) before anything else this tick sees
   the grid.
2. **Utilities** — `recomputeUtilitiesNow()` (power/water coverage) runs if
   `utilitiesDirty` is set (a building or road edit that could change
   coverage happened) **or** `tickNo % UTILITY_PERIOD === 0`
   (`UTILITY_PERIOD = 10`, a local const in `worker.entry.ts`).
3. **Demand** — `computeDemand()` (`src/sim/demand.ts`) runs every tick, a
   pure function of the current `CityStats` snapshot. See
   [population-model.md](population-model.md).
4. **Growth** — `GrowthSystem.tick()` (`src/sim/growth.ts`) runs every tick,
   but internally: construction countdowns advance every call; the heavier
   problem/abandonment scan, level-up scan, and spawn scan only run when
   `tickNo % GROWTH_INTERVAL === 0` (`GROWTH_INTERVAL = 10`, defined in
   `growth.ts`). See
   [../game-design/simulation-rules.md](../game-design/simulation-rules.md).
5. **Building + road noise emission** — runs when
   `tickNo % EMIT_PERIOD === EMIT_OFFSET` (`EMIT_PERIOD = 4`,
   `EMIT_OFFSET = 3`): every Active building with a catalog `pollution` or
   `noise` stat emits it into the Pollution/Noise fields, and every road
   edge with positive assigned volume emits noise scaled by its tier's
   `noiseMult`. See [environmental-simulation.md](environmental-simulation.md).
6. **Service coverage** — `ServiceSim.tick()` (`src/sim/services.ts`:
   police/fire/health/education/park coverage, plus ambient Crime/FireRisk
   growth) runs when `tickNo % SERVICE_PERIOD === SERVICE_OFFSET`
   (`SERVICE_PERIOD = 8`, `SERVICE_OFFSET = 6`). See
   [services-model.md](services-model.md).
7. **Garbage generation + collection** — `GarbageSystem.tick()`
   (`src/sim/garbage.ts`: trash generation, landfill collection, incinerator
   collect-and-burn) runs when `tickNo % GARBAGE_PERIOD === GARBAGE_OFFSET`
   (`GARBAGE_PERIOD = 10`, `GARBAGE_OFFSET = 5`, both in
   `src/shared/constants.ts`).
8. **Traffic** — `TrafficSystem.tick()` (`src/sim/traffic.ts`) runs
   **every tick, unconditionally** — no cadence divisor at all. Internally it
   decays every edge's assigned volume once per sim day
   (`tickNo % TICKS_PER_DAY === 0`, `TICKS_PER_DAY = 200`), which also
   re-warrants every junction's control at that same cadence. See
   [../engineering/systems/traffic.md](../engineering/systems/traffic.md) and
   [traffic-model.md](traffic-model.md).
9. **Transit** — `TransitSystem.tick()` (`src/sim/transit.ts`: route +
   ridership recompute, congestion relief) runs **every tick,
   unconditionally**.
10. **Service dispatch** — `DispatchSystem.tick()` (`src/sim/dispatch.ts`:
    incident spawn/advance/resolve) runs **every tick, unconditionally**.
11. **Cosmetic garbage trucks** — `GarbageTruckSystem.tick()`
    (`src/sim/garbagetrucks.ts`) runs **every tick, unconditionally**.
12. **Traffic field bake** — `FieldSim.applyTraffic()` zeroes and rebuilds
    the Traffic scalar field wholesale from the road network's current edge
    volumes when `tickNo % TRAFFIC_FIELD_PERIOD === TRAFFIC_FIELD_OFFSET`
    (`TRAFFIC_FIELD_PERIOD = 4`, `TRAFFIC_FIELD_OFFSET = 1`) — one tick
    before Traffic's own diffusion slot (below), so the freshly baked field
    gets diffused on the very next opportunity.
13. **Scalar fields** — `FieldSim.tick()` (`src/sim/fields.ts`) runs every
    tick, but each of the nine fields only diffuses/decays on its own
    staggered slot inside that call; see
    [environmental-simulation.md](environmental-simulation.md) for the full
    schedule.
14. **Economy** — `EconomySystem.tick()` (`src/sim/economy.ts`) runs every
    tick to re-sum population/jobs/employed from Active buildings and check
    milestones, but the monthly tax/upkeep settlement inside it only fires
    when `tickNo !== 0 && tickNo % TICKS_PER_MONTH === 0`
    (`TICKS_PER_MONTH = TICKS_PER_DAY × DAYS_PER_MONTH = 6,000`). See
    [population-model.md](population-model.md) and
    [../game-design/economy.md](../game-design/economy.md).
15. **`stats.tick = tickNo`**.
16. **Snapshot** — `postSnapshot()` runs when
    `tickNo % SNAPSHOT_TICKS === 0`, where
    `SNAPSHOT_TICKS = round(TICK_RATE / SNAPSHOT_HZ) = round(20 / 10) = 2` —
    every other tick, i.e. 10 times a real second at the reference 1×
    pacing.

A system not listed as gated above (demand, growth's construction advance,
economy's population/jobs/milestone aggregation, traffic, transit, dispatch,
garbage trucks, the fields' own per-tick scheduler call) is invoked every
tick; what varies per-field or per-system is what happens _inside_ that call,
not whether the call happens.

## Every gated cadence, in one table

| System                                                  | Constant(s)                                     | Value                     | Defined in                       |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------- | -------------------------------- |
| Utilities recompute                                     | `UTILITY_PERIOD`                                | 10 ticks                  | `worker.entry.ts`                |
| Growth's heavy passes (problems/abandon/level-up/spawn) | `GROWTH_INTERVAL`                               | 10 ticks, offset 0        | `growth.ts`                      |
| Building + road noise emission                          | `EMIT_PERIOD` / `EMIT_OFFSET`                   | every 4 ticks, offset 3   | `worker.entry.ts`                |
| Service coverage (police/fire/health/education/park)    | `SERVICE_PERIOD` / `SERVICE_OFFSET`             | every 8 ticks, offset 6   | `worker.entry.ts`                |
| Garbage generation + collection                         | `GARBAGE_PERIOD` / `GARBAGE_OFFSET`             | every 10 ticks, offset 5  | `src/shared/constants.ts`        |
| Traffic volume decay + control re-warrant               | `TICKS_PER_DAY`                                 | every 200 ticks, offset 0 | `src/shared/constants.ts`        |
| Traffic field bake                                      | `TRAFFIC_FIELD_PERIOD` / `TRAFFIC_FIELD_OFFSET` | every 4 ticks, offset 1   | `worker.entry.ts`                |
| LandValue diffusion                                     | period 8, offset 0                              | every 8 ticks             | `fields.ts`'s `DIFFUSING_FIELDS` |
| Crime diffusion                                         | period 8, offset 1                              | every 8 ticks             | `fields.ts`                      |
| FireRisk diffusion                                      | period 8, offset 2                              | every 8 ticks             | `fields.ts`                      |
| Education diffusion                                     | period 8, offset 3                              | every 8 ticks             | `fields.ts`                      |
| Health diffusion                                        | period 8, offset 4                              | every 8 ticks             | `fields.ts`                      |
| Happiness recompute                                     | `HAPPINESS_PERIOD` / `HAPPINESS_OFFSET`         | every 8 ticks, offset 5   | `fields.ts`                      |
| Pollution diffusion                                     | period 4, offset 0                              | every 4 ticks             | `fields.ts`                      |
| Noise diffusion                                         | period 4, offset 1                              | every 4 ticks             | `fields.ts`                      |
| Traffic diffusion                                       | period 4, offset 2                              | every 4 ticks             | `fields.ts`                      |
| Economy monthly settlement                              | `TICKS_PER_MONTH`                               | every 6,000 ticks         | `src/shared/constants.ts`        |
| Snapshot post                                           | `SNAPSHOT_TICKS`                                | every 2 ticks             | `worker.entry.ts`                |

Traffic, transit, service dispatch, and cosmetic garbage trucks are the
notable **absence** from this table: all four run every single tick with no
divisor at all, unlike the coverage/funding system (`ServiceSim`, gated at
`SERVICE_PERIOD`) and garbage generation/collection (`GarbageSystem`, gated
at `GARBAGE_PERIOD`) that share the same problem space. A city's assigned
traffic, transit ridership, incident vehicles and garbage-truck routes are
therefore as current as the last tick, not the last gated pass.
