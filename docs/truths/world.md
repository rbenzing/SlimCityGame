# Truths — World and simulation

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
- [R-world-007] There are no citizen agents: no person, household, commute or age exists in
  the sim. Population is re-summed every tick from the occupied residents of
  `Active` buildings; `Constructing` and `Abandoned` contribute nothing; it is
  never incremented as an event and never persisted as authoritative. —
  [population-model.md](../world-sim/population-model.md),
  [agent-behavior.md](../world-sim/agent-behavior.md),
  [ADR-0001](../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
- [R-world-008] One helper decides who lives in a building: `occupiedResidents(spec, inst)`,
  0 unless the building is `Active`, else the catalog's residents less the
  building's vacancies. Population, rent, the tax correction, the capacity
  pooling, the inspector, ridership, garbage and the registry totals all ask
  it, and nothing else reads `spec.residents` to count people. —
  [population-model.md](../world-sim/population-model.md);
  `occupiedResidents` in `src/shared/occupancy.ts`
- [R-world-009] Population can fall, and the milestone level never does. Deaths and re-lets
  change who lives in a building and never whether it stands; a city that has
  shrunk below a threshold keeps the milestone's unlocks and reports 0
  progress toward the next. A shrinking city abandons nothing, since
  `LowDemand` stays toothless. —
  [population-model.md](../world-sim/population-model.md),
  [healthcare-and-death-care.md](../engineering/features/healthcare-and-death-care.md);
  `EconomySystem.tick` in `src/sim/economy.ts`
- [R-world-010] Deaths are accrued, never rolled: a city counter advances by population
  times the death rate each tick and a death falls when it passes 1, at a
  resident chosen by a fixed stride over the occupied residents in building-id
  order, so a run is identical across a save and reload and no RNG is drawn.
  A vacancy is re-let by the same method, at a fixed 41 days, only while
  residential demand is above zero, and never faster for a larger demand. —
  [healthcare-and-death-care.md](../engineering/features/healthcare-and-death-care.md);
  `src/sim/deathcare.ts`
- [R-world-011] Death care is collected along the road network, never by a straight-line
  radius: a cemetery reaches the buildings its streets connect to within its
  `collectionRange` by the road BFS garbage uses, one body is one interment, a
  full cemetery collects nothing, and bodies are taken in building-id order,
  each into the nearest facility with room, ties by facility id. A building cut off by road is not collected
  however near it stands. A crematorium never fills: it has a throughput credit
  that accrues per tick at its `rate` (`CREMATIONS_PER_YEAR ÷ TICKS_PER_YEAR`),
  capped at one working day (`CREMATION_CREDIT_CAP`, 8), it has room for its
  whole credit, and each cremation spends one; it competes with cemeteries in the
  same order and draws no random number. —
  [healthcare-and-death-care.md](../engineering/features/healthcare-and-death-care.md),
  [services-model.md](../world-sim/services-model.md#death-care);
  `DeathCareSystem.collect` in `src/sim/deathcare.ts`
- [R-world-012] Demolishing a cemetery that holds interments charges the exhumation,
  `EXHUMATION_FEE_PER_INTERMENT` (¢14) a grave, in hand before anything comes
  down (short of funds, the whole bulldoze is refused and nothing changes), on
  top of the usual 50% refund of its build price. Its undo restores the cemetery
  with every interment and hands the charge back exactly; the bulldoze cursor
  quotes the charge before it is paid. An empty cemetery demolishes as before. —
  [healthcare-and-death-care.md](../engineering/features/healthcare-and-death-care.md);
  `cmdBulldoze` and `cmdPlaceBuilding` in `src/sim/worker.entry.ts`
- [R-world-013] Death-care capital prices are read on one scale, about $200 to the ¢, set by
  the cemetery's own price (¢3,500 for 780 plots at Homer AK's $898 a plot). A
  crematorium costs about one cemetery; the trade is land and running cost, not
  the build price. A real nonzero emission registers as at least 1 on the
  pollution field, however small on the coal plant's scale. —
  [balancing.md](../game-design/balancing.md#death-care)
- [R-world-014] The regional funeral service ends at Big Town, and it is the one rung, like
  septic: below `DEATH_CARE_MILESTONE` (the same `BIG_TOWN_MILESTONE` as
  `SEWER_MILESTONE`) every body no cemetery collected is taken off the map the
  tick it falls, with no penalty, and billed at the sourced `REGIONAL_FUNERAL_FEE`
  in the month's expenses; from Big Town it stops and a body stays where it
  fell. Never add a second rung or a prerequisite to first-town growth. —
  [healthcare-and-death-care.md](../game-design/features/healthcare-and-death-care.md);
  `src/shared/constants.ts`
- [R-world-015] Coverage precedes the penalty: the uncollected-body penalty is subtracted
  from the Health field after every kind's coverage has been written, in the
  same services pass, so a clinic placed on a penalised tile never erases it,
  in any placement order. —
  [healthcare-and-death-care.md](../engineering/features/healthcare-and-death-care.md);
  `ServiceSim.tick` in `src/sim/services.ts`
- [R-world-016] The body penalty never feeds the death rate. Deaths accrue from population
  alone; no field, backlog or health reading changes the rate, since a death
  spiral is a trap and not a lesson. The 32 points a body a month is a dial. —
  [healthcare-and-death-care.md](../game-design/features/healthcare-and-death-care.md);
  `src/sim/deathcare.ts`
- [R-world-017] The workforce is `floor(population × EMPLOYMENT_RATE)`, one constant in
  `src/shared/constants.ts`. Employment, demand and the Advisor's labour
  checks all measure against the workforce, never against every resident. —
  [population-model.md](../world-sim/population-model.md),
  [progression.md](../game-design/progression.md#the-advisor-detecting-and-ranking-problems)
- [R-world-018] Demand is economic base theory. Industry is the basic sector a town lives
  by; commercial demand is only ever the local jobs its industrial jobs
  support (`BASE_MULTIPLIER` 1.81, from published multipliers), so a town
  with no industry supports no shops; and residents follow work, so a
  workforce with no jobs turns households away. Every demand figure cites
  its source. — [simulation-rules.md](../game-design/simulation-rules.md#demand-the-rci-model);
  `computeDemand` in `src/sim/demand.ts`
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
- [R-world-025] Happiness is rewritten wholesale by `computeHappiness` every pass. No feature
  writes to it, diffuses it or emits into it; services and recreation reach it
  only through the fields it reads. —
  [environmental-simulation.md](../world-sim/environmental-simulation.md),
  [parks-and-recreation.md](../engineering/features/parks-and-recreation.md)
- [R-world-026] Only `NoRoad`, `NoPower` or `NoWater` for three consecutive growth passes
  abandon an `Active` building. `LowDemand` is display-only and stays
  toothless, and `NoSewer` stops growth and dirties the ground but never
  abandons. — [population-model.md](../world-sim/population-model.md);
  `ABANDON_BLOCKER_STREAK` in `src/sim/growth.ts`
- [R-world-027] Building ids are monotonic from 1 and never reused in a session. The
  `buildingId` layer is the only spatial index. —
  [entities.md](../world-sim/entities.md)
- [R-world-028] **A street with power and water on it is all a new town needs to grow.**
  Those are the only utilities growth waits for from the opening, and no
  system may add a prerequisite to them: a new utility or service may flag,
  foul, cut, slow or cost, and may gate growth only from a milestone the
  player is warned of one rung before, never the first town. The frozen
  scenario in `tests/interaction/firsttown.test.ts` is the guard; a change
  that needs a step added to it has changed this rule and stops here first.
  — [simulation-rules.md](../game-design/simulation-rules.md),
  [water-and-sewage.md](../game-design/features/water-and-sewage.md)
- [R-world-029] A zoned tile develops only when it is zoned, served with power and water
  on its footprint (and, from `SEWER_MILESTONE`, a drain), and within
  Manhattan distance 3 of a street, on
  the grid or off it, and a building stands only on tiles zoned the same, at spawn and at
  every level-up: it never spills onto the ground beside its zone. One
  zonability predicate decides; the zoning grid visual and the
  `paintZone` command both defer to it and may never disagree, so the render
  thread reads roads off the grid from the network the worker sends, never
  from its road tiles. A road off the grid fronts lots square to its centre
  line from its kerb, out to the zoning depth, and nothing is zoned or built on
  a tile whose centre lies inside its right of way (a tile its footprint
  band only touches, centred on the lot side of the kerb, is lot). The
  zoning depth IS that distance (`ZONE_DEPTH` =
  `ROAD_CHECK_RADIUS` = 3): the brush never paints land no lot can stand on.
  Beside a road off the grid that depth is measured square to the road, from
  the tile's centre to the kerb line, never marched tile by tile from the
  cells the road crosses: a diagonal street zones a band three tiles deep
  along its whole length, not a staircase, which is what a framed parcel
  forty metres deep needs under it. —
  `zonableTiles` in `src/world/zonable.ts`
  The utilities reach one tile off the road and a lot grows when they reach
  any tile of it, so a lot's first row touches the row beside the street and
  the deepest lot in the catalogue, three, reaches the depth; a fourth row
  was a third of a grown town's zoning that could never grow. A zone changes
  only empty land: a building keeps the zone it grew on for life, a denser
  zone painted over a built block takes only the gaps, and a stroke that
  falls wholly on buildings is refused with a reason naming the bulldozer,
  never silently as `invalid`. Clearing a zone is
  exempt from the frontage check so a zone can always be removed. A farm
  departs from this twice: its lot needs a dirt road within 3 tiles, and
  it needs no water or drain, since a building whose entry draws none never
  waits for it. A low-density house is on a private well and a septic tank,
  and needs no water or drain either, when a dirt road lies within 3 tiles
  of its lot and no main — a road that carries water, or a pipe — lies
  beside any tile of it. — [simulation-rules.md](../game-design/simulation-rules.md)
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
- [R-world-036] A zoned building has a `kind`, drawn when its lot grows: among the zone's
  level-1 catalog entries that are unlocked and whose footprint fits the lot,
  one roll of the growth rng against their `share` weights, in catalog
  order. A commercial or industrial kind is a candidate only if its jobs fit
  the sector's room — the jobs the economy still supports, counted down as
  the pass builds — except the smallest kind that fits the lot, which always
  is; a business levels up only with room for the jobs it adds. The kind is
  kept through every level-up; a level-up looks for the same zone and kind at
  the next level. The player never picks a kind. —
  [building-types.md](../game-design/features/building-types.md),
  [simulation-rules.md](../game-design/simulation-rules.md#the-spawner-how-a-lot-is-chosen);
  `spawnCandidates`, `drawKind` in `src/sim/growth.ts`; `jobRoom` in
  `src/sim/demand.ts`
- [R-world-037] A detached house is platted on the lot the land warrants and stays on it:
  the land value at the tile picks half (under 64, 1×1), normal (64–159,
  1×2), double (160–223, 2×2) or acre (224 and over, 3×3, with the 2×3
  estate where only two tiles of frontage are free), or the next
  smaller lot that fits, never a larger one than the land warrants. The three
  levels of a lot share its footprint, a level-up looks up the same zone,
  kind and lot and footprint, and no building ever grows its lot. A house
  body is 9.5 m across the front whatever its lot. A duplex and a fourplex
  stand on one parcel of the plat too, a half or a normal lot (upright or
  turned) with the footprint the parcel has, never on a double or an estate
  parcel, and a level-up never changes their lot; the homes and residents of
  a plex do not change with the lot. A kind takes whole parcels of the plat,
  all fronting one street and tiling its footprint exactly, never half of
  one: a multiplex or a courtyard block (lot normal, 2×2 at every level)
  assembles two normal parcels side by side. Medium density plats normal
  lots at every standing, and a strip too shallow for one plats nothing,
  never a half lot. Row housing plats normal lots at every standing, like
  medium density, and a townhouse row takes one normal parcel at every level
  (1×2, or 2×1 turned) and holds three homes at every level: the level adds
  storeys, never homes or length. The
  zone lens draws the plat only for the zones whose kinds stand on it: low
  density, row housing, medium density, low and high commercial, high density
  and mixed use (`PLATTED_ZONES`); industrial and farm zones are never
  platted. —
  [lots-and-land.md](../game-design/features/lots-and-land.md);
  `lotForStanding`, `platCandidates`, `warrantedLot`, `lotsOfZone`,
  `PLATTED_ZONES` in `src/shared/lots.ts`, `takesWholeParcels`, `platReaches`
  in `src/world/plat.ts`, `tryLevelUp` in `src/sim/growth.ts`
- [R-world-038] A level-up never changes a building's kind; the one change of kind is a
  teardown. A detached house on a half or normal lot whose tile's land value
  is at the estate band (224 and over) converts, with a chance that makes 2%
  a year, into a level-1 duplex or fourplex of the same zone on the same lot
  and footprint, drawn by share, with spare supply for what it adds. It
  never crosses its zone, never grows its lot, and no other kind converts. —
  [lots-and-land.md](../game-design/features/lots-and-land.md#a-small-house-on-prime-land-becomes-a-plex-built-2026-10-08);
  `tryConvert` in `src/sim/growth.ts`
- [R-world-039] A lot forms from its street: the tiles along a street that front the same
  side are cut a frontage at a time, from one end, into parcels, and a
  detached house grows only on the tile a parcel starts on, with its frontage
  along the street (a turned twin on a street running north to south), never
  behind another house. The plat is derived from the zone, the streets, the
  buildings and the land value and stored nowhere; a building standing is a
  parcel the cut steps over and never moves. Round a bend each arm fronts its
  own side, and a cul-de-sac is cut down its two sides, never across its end.
  The whole plat is cut once, run by run in map order, and no two parcels
  ever share a tile: a run cut later steps over what an earlier one claimed.
  The zone lens draws that same plat — the one function, over the render
  mirror and the land value asked of the worker — so the lines the player
  sees are exactly the lots that will grow. A ploppable in hand — any
  service, transport, utility or park building — shows the same zoning grid,
  the painted tint and the plat of every platted zone at once, so nothing is
  ever placed over painted land unseen. The plat is re-cut every growth
  pass and never stored, and it re-cuts only empty ground: a built parcel
  never moves when the land value rises or falls, and painting a zone never
  changes a built tile, so a rezone leaves the standing houses on the lots
  they grew on and replats only the gaps. The inspector's lot line reads the
  catalog entry's lot and footprint, at 400 m² a tile, and a building with
  no lot shows no row. —
  [lots-and-land.md](../game-design/features/lots-and-land.md#the-plat-is-cut-from-the-street-built-2026-10-07);
  `platOf`, `parcelsAnchoredAt` in `src/world/plat.ts`, `setParcels` in
  `src/render/zonegrid.ts`, `cmdPaintZone` in `src/sim/worker.entry.ts`,
  `lotLine` in `src/ui/format.ts`
- [R-world-040] Beside a free-form street a parcel has a frame: a north-fronting grid lot
  moved to the kerb and turned to the road's heading, its front line on the
  right-of-way edge. A building on it carries `frame` and rotation 0, its
  `x, z` the min tile of the tiles whose centres lie in its rectangle; those
  tiles are its footprint for placing, bulldozing, flattening and every
  tile-keyed reader, and claiming by centre is what lets two parcels stand
  end to end at any angle without sharing a tile. Every renderer composes a
  framed building through the one frame transform, never its own centre and
  quarter turn; a grid lot's frame is the identity, and the south and west
  grid layouts stay the mirrors they always were. A building with no frame
  is a grid building and nothing about it changes. —
  [curved-parcels.md](../game-design/features/curved-parcels.md),
  [engineering/features/curved-parcels.md](../engineering/features/curved-parcels.md);
  `src/shared/lotframe.ts`, `platAlongKerbs` in `src/world/plat.ts`,
  `edgeFrameOfParcel` in `src/render/frontage.ts`
- [R-world-041] A building ploppable in hand shows the zoning grid, the painted tint and
  the plat of every platted zone, so nothing is placed over painted land
  unseen; a bus stop tool, which takes no land, shows none of it. —
  [hud.md](../ux/hud.md); `rebuildPlat` in `src/main.ts`
- [R-world-042] A commercial or dense building (a catalog entry with no `lot`) takes whole
  lots along its frontage and never half of one: every lot it touches fronts
  the same street, lies wholly within its width and starts at its front edge;
  where it is shallower than its lots the rest is its yard, and where it is
  deeper it runs into the unparcelled ground behind. Low commercial (3), high
  commercial (4), high density (2) and mixed use (8) are cut into normal lots
  at every standing, low commercial falling back to a half lot on a strip one
  tile deep. On a street running north to south these buildings stand at
  rotation 1, a quarter turn, since the catalog has no turned twins for them.
  Every frontage kind is weighed at the same street-row tile on every side
  of a street, never from the building's back corner, so a south- or
  east-fronting block grows corner shops as a north one does. A level-up
  that keeps its footprint improves in place; one that grows its footprint
  is a redevelopment that keeps its street edge fixed and must take whole
  lots by the same rule, only where they are free, the old building's ground
  counting as part of them, and it never happens where a neighbour stands.
  Along its street it may grow toward either side, its own corner tried
  first. A kind's first level stands on the smallest site that kind is built
  on: mid-rise and shopfront flats start on one normal lot. —
  [lots-and-land.md](../game-design/features/lots-and-land.md#commercial-and-dense-land-is-cut-into-frontage-lots-built-2026-10-07),
  [a block starts on one lot](../game-design/features/lots-and-land.md#a-block-starts-on-one-lot-and-assembles-its-neighbours-built-2026-10-07);
  `takesFrontageLots` in `src/world/plat.ts`, `tryLevelUp` in
  `src/sim/growth.ts`
- [R-world-043] Every zoned catalog figure is derived from a published source by the rules
  in [balancing.md](../game-design/balancing.md#residential-kinds): residents are
  `round(units × household)`, a building's households are its `units`, and
  power and water are per-home survey figures. A number in `catalog.json`
  with no derivation is a bug. — [building-types.md](../game-design/features/building-types.md)
- [R-world-044] A block's homes are the floor it is drawn with: a mid-rise, tower or
  mixed-use block holds its drawn floor area (its body plate over its
  storeys, each tier above the first at the mean setback, a tower's podium
  and a mixed block's shop floor left out) × 85% ÷ a 93 m² apartment,
  rounded. Never count every storey at the ground plate. —
  [building-types.md](../game-design/features/building-types.md#the-residential-kinds);
  `bodyMetresFor` in `src/shared/floorarea.ts`, `computeSetbacks` in
  `src/render/massing.ts`
- [R-world-045] Industry grows on its order book, never its neighbourhood: a works, a
  heavy plant or a farm levels up while industrial demand is above zero and
  the town has room for the jobs it adds, and never reads land value, which
  pushes real industry out of town. Homes and shops keep the land-value
  gate. — [simulation-rules.md](../game-design/simulation-rules.md#levels-construction-and-abandonment);
  `tryLevelUp` in `src/sim/growth.ts`
- [R-world-046] Farmland is painted only where a dirt road's frontage reaches, up to
  `FARM_DEPTH`, and only on soil a farm can work. A paved road fronts no
  farmland, though a field may run up to it. A farm's jobs are industrial
  jobs, and its residents are population. The soil under the lot decides a
  farm's kind; a level-up keeps the kind, needs the kind's own grade and
  industrial demand, and never reads land value. —
  [simulation-rules.md](../game-design/simulation-rules.md#frontage-and-zonability);
  `computeFarmableMask` in `src/world/zonable.ts`, `trySpawnFarm` in
  `src/sim/growth.ts`
- [R-world-047] Growth never builds into a shortage: a building spawns, or levels up, only
  when the grid has spare power and water for what it will draw, counted down
  as the pass builds. A lot or building held back only by that is waiting for
  supply and is counted for the Advisor. A shortage never refuses the player's
  own tools. — [simulation-rules.md](../game-design/simulation-rules.md);
  `runSpawnScan` and `tryLevelUp` in `src/sim/growth.ts`
- [R-world-048] The player paints zones and never places a zoned building; growth runs on the
  sim clock as demand × desirability. Civic and utility buildings are plopped;
  zones, districts, landfill and power lines are painted. —
  [gdd.md](../game-design/gdd.md), [gameplay-loop.md](../game-design/gameplay-loop.md)

