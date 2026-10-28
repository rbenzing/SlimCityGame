# Truths — World: grid and simulation core

Back to [the index](../GROUND-TRUTHS.md).

- [R-world-001] The map is `MAP_SIZE` (256) tiles a side at `TILE_METERS` (20 m) each; every
  allocation sized to the map reads those constants and never a literal. Lane,
  vehicle and person dimensions are absolute metres and never scale with the
  tile. — [world-model.md](../world-sim/world-model.md),
  [ADR-0010](../engineering/adr/0010-map-size-is-capped.md),
  [constraints.md](../engineering/constraints.md); `src/shared/constants.ts`

- [R-world-002] World state is one flat typed array per layer, indexed `z * size + x`. A new
  fact about a tile is a new layer wired into the tick, never a per-tile object
  or an entity-component system. —
  [ADR-0003](../engineering/adr/0003-world-state-is-layered-flat-typed-arrays.md);
  `src/world/grid.ts`

- [R-world-003] Nothing under `src/sim`, `src/world`, `src/core` or `src/render` calls
  `Math.random`, `Date.now` or `performance.now`. Randomness comes from the
  seeded RNG forked per system; "now" is the tick or the caller's elapsed time.
  Only `src/app` is exempt. —
  [ADR-0002](../engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md),
  [constraints.md](../engineering/constraints.md); `src/core/rng.ts`

- [R-world-004] The sim ticks at `TICK_RATE` (20) and `tickNo` advances by exactly one per
  `FixedTimestep` firing. Tick logic never reads the speed multiplier; at speed
  0 commands still drain and utilities recompute, but `tickNo` does not move. —
  [tick.md](../world-sim/tick.md), [time-system.md](../world-sim/time-system.md)

- [R-world-005] The tick order is fixed: commands, utilities, demand, growth, emission,
  services, garbage, traffic, transit, dispatch, trucks, traffic bake, fields,
  economy, deaths and re-lets (with the collection of the bodies they leave),
  snapshot. The uncollected-body penalty rides the services step, after
  coverage. A new system is slotted into that order explicitly. —
  [tick.md](../world-sim/tick.md); `tick()` in `src/sim/worker.entry.ts`

- [R-world-006] The calendar is 200 ticks a day and 30 days a month. `VISUAL_DAY_TICKS` and
  `CLOCK_START_OFFSET_TICKS` are display-only and never drive a sim rule. —
  [time-system.md](../world-sim/time-system.md)

- [R-world-019] Vehicles and pedestrians are cosmetic: they draw along a real route and
  simulate nothing, and a cosmetic route is computed once and never re-solved.
  A vehicle drives the line the road network traces — grid tile centres and
  the centre lines of roads off the grid — never a straight line between two
  tiles that are not neighbours. A walker walks the footway, which is on the
  ROAD tile where the street's own section puts it, never the lot's first row
  (the lawn, or the house), and goes in by the front door the house kit drew,
  along that kit's own path; a walker anchored a tile back from the street
  walked through the living room of any home that touched it. —
  [props-and-vehicles.md](../art/props-and-vehicles.md); `computeWalkPath` and
  `walkSample` in `src/render/pedestrians.ts`, `frontDoorOf` in
  `src/render/houselot.ts`
  Traffic is statistical assignment. —
  [ADR-0001](../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md),
  [agent-behavior.md](../world-sim/agent-behavior.md)

- [R-world-020] Simulation fidelity never varies with camera distance or visibility; the
  worker is never told where the camera is. —
  [lod-strategy.md](../world-sim/lod-strategy.md)

- [R-world-021] Weather, seasons and temperature do not exist in the sim. The season chip is
  display flavour. —
  [environmental-simulation.md](../world-sim/environmental-simulation.md)

- [R-world-022] A tile is water iff its height is strictly below `SEA_LEVEL` (0). Water is
  derived from terrain, never authored; it has no flow and no fresh/salt
  distinction, and terraforming re-derives the mask. —
  [world-model.md](../world-sim/world-model.md); `SEA_LEVEL` in
  `src/shared/constants.ts`

- [R-world-023] Field diffusion is integer fixed-point, `(154·self + 102·nbrAvg) >> 8` over
  four von Neumann neighbours, never float. Each field runs only on its
  `(period, offset)` slot. —
  [environmental-simulation.md](../world-sim/environmental-simulation.md);
  `src/sim/fields.ts`

- [R-world-024] A field fed a gain every pass has an equilibrium only through its decay,
  and the decay is set for the thresholds that read the field. Land value's
  (243/256) settles bare clean ground at 119, under the level-2 line, and a
  river bank at 181, over it: a level-up is earned by water, trees, a park or
  a clean quiet street, never by waiting. At 255/256 the field saturated the
  whole map within thirty seconds of a new game and every reader of it —
  level-ups, spawn desirability, the tax factor — read a constant. —
  [environmental-simulation.md](../world-sim/environmental-simulation.md);
  `LAND_VALUE_DECAY_NUM`, `LAND_VALUE_BASE` and `LAND_VALUE_BANK` in
  `src/sim/fields.ts`

- [R-world-027] Building ids are monotonic from 1 and never reused in a session. The
  `buildingId` layer is the only spatial index. —
  [entities.md](../world-sim/entities.md)

- [R-world-030] Who draws city water is one predicate, `cityWaterUse`, read by growth and
  the water line alike. It looks only at the roads and pipes, never at the
  supply, so a shortage never moves a house onto a well. A house on a well
  draws nothing: it is never refused, held back or flagged for water, and
  takes no place in the water line. A building's sewage is `sewageOf`, the
  return-to-sewer share of that same figure, so a house on a well makes
  none and a farm makes none; and below `SEWER_MILESTONE` (Big Town, 3,500
  people) the whole town is on septic tanks and makes none, so a new town
  never sees a sewer. That one predicate is the only place the milestone is
  read; growth, the sewer line, the flag, the stink and the Advisor's counts
  all follow from it. —
  [simulation-rules.md](../game-design/simulation-rules.md#a-house-on-a-well);
  `src/sim/network.ts`

- [R-world-031] Sewage is the third utility and runs on the water's own network: a drain
  reaches along every road that carries water and every pipe, the buildings
  it reaches line up by steps from the nearest drain, and the far end is cut
  when the drains run out, exactly as the water is. From Big Town a lot grows
  and a building levels up only where a drain reaches it with room for its
  sewage; the drain and the works unlock the rung before, at Busy Township,
  and the Advisor warns there that the town is outgrowing its septic tanks.
  A standing building nothing drains carries `NoSewer`, fouls the ground
  around it in proportion to its sewage, and is **never abandoned for it**,
  so a city saved before there were drains loads standing. —
  [water-and-sewage.md](../game-design/features/water-and-sewage.md),
  [utilities-model.md](../world-sim/utilities-model.md#sewage); `recomputeUtilities`
  in `src/sim/network.ts`, `tryLevelUp` and `runSpawnScan` in `src/sim/growth.ts`

- [R-world-032] A water pipe is to water and sewage what the power line is to power: a
  painted layer, not a road, that conducts between its own tiles and into
  any road or building it touches. It stands on no water and no footprint,
  and laying over a laid tile changes and charges nothing. A pumping station
  and a drain pipe stand only where their footprint touches water
  (`requiresAdjacent: 'water'`), as a station stands only on the rails. —
  [utilities-model.md](../world-sim/utilities-model.md#conducting-roads-power-lines-and-pipes);
  `src/world/waterpipe.ts`, `hasAdjacentWater` in `src/world/grid.ts`

- [R-world-033] A pipe is buried: nothing on the surface ever shows it. The water system —
  the mains under the streets, the laid pipes, the risers of the water
  buildings — is seen only underground, which the city goes to while a
  water tool, a water building or a water lens is in hand and leaves when
  none is. The underground is a view: it changes nothing about what carries
  water or where a pipe may go; the surface goes to glass by material
  opacity, never a shader, and comes back exactly as it was. A pipe drag's
  ends snap onto the system a tile away, a run along a street lays nothing,
  and the cursor says what the run joins. —
  [underground-view.md](../game-design/features/underground-view.md);
  `UndergroundView` in `src/render/underground.ts`, `PipeOverlayRenderer` in
  `src/render/pipes.ts`, `planPipeRun` in `src/tools/pipe.ts`

- [R-world-034] The water's fouling (`g.waterFoul`) spreads only over connected water,
  from each drain's and works' discharge, fading to nothing at
  `WATER_FOUL_REACH_TILES`; it is the worst of what reaches a tile, never
  the sum; it is derived every utility pass and never saved. A drain that
  takes no sewage fouls nothing, and a works fouls at its `effluent` share.
  An intake yields its rating scaled by the worst fouling beside it; the
  tower is never scaled; the sewer pass runs before the water pass so the
  yield is known when the water is cut. There is no current and no
  downstream. — [water-and-sewage.md](../game-design/features/water-and-sewage.md),
  [utilities-model.md](../world-sim/utilities-model.md#the-fouled-water);
  `spreadFouling` and `recomputeUtilities` in `src/sim/network.ts`

- [R-world-035] A tile's soil grade is derived from its height, the water beside it and the
  map seed, and never saved. It is graded by one function, `soilGradeAt`,
  for the worker, the render mirror, the Soil lens, farmland painting and
  farm growth alike, and it is regraded wherever heights change. Beach sand
  (under `SAND_BAND_METERS` above sea level), the water's edge, rock (over
  `MAX_BUILD_SLOPE`) and stony ground better than pasture are never
  cropland. The sand and the rock are the same bands the terrain draws, read
  from the same constants, so the ground's colour and its soil cannot
  disagree. — [world-model.md](../world-sim/world-model.md#soil);
  `src/shared/soil.ts`
