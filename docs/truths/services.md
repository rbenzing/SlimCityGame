# Truths — Utilities and services

Back to [the index](../GROUND-TRUTHS.md).


- [R-services-001] Power, water, sewage and every service reach the city only along the
  street-tier road network: a breadth-first search from the road tiles
  orthogonally adjacent to the footprint, radiating one step (utilities) or
  two steps (services) onto non-road tiles. Never a straight-line radius. The
  search follows the road network's links (`roadCellsOf`), so it goes only
  where roads join: never across to a road that merely lies alongside, never
  between two levels. A power line is not a road, and passes power to
  whatever stands beside it; a water pipe is not a road, and passes water
  and sewage the same way. —
  [utilities-model.md](../world-sim/utilities-model.md),
  [services-model.md](../world-sim/services-model.md),
  [ADR-0009](../engineering/adr/0009-utilities-propagate-along-roads.md);
  `src/sim/services.ts`, `src/sim/network.ts`
- [R-services-002] A facility with no street-tier road within two orthogonal steps of its
  footprint covers nothing. — [services-model.md](../world-sim/services-model.md);
  `NEAR_ROAD_RADIUS` in `src/sim/services.ts`
- [R-services-003] A generator is worth its **nameplate × capacity factor** to the grid, the
  published share of the year a plant of its kind runs at rating, never its
  nameplate alone; the inspector shows both. Every ploppable's draw and every
  generator's rating, factor, cost and upkeep is derived from a published
  figure the way the zoned catalog's are, and the wind turbine is drawn at
  the size of the machine its figures describe: a distributed-wind machine
  sized to the map, not a wind farm's. A catalog entry with `spacing` keeps
  that many clear tiles between its footprint and another of its own kind in
  every direction, read at placement by the worker; the turbine's three keep
  one rotor out of another's and nothing more, and no other entry carries
  one. —
  [power-generation.md](../game-design/features/power-generation.md#the-generators-re-derived),
  [utilities-model.md](../world-sim/utilities-model.md#production-and-demand);
  `averageOutputMW` in `src/shared/power.ts`, `crowdsItsKind` in
  `src/sim/worker.entry.ts`
- [R-services-004] Supply never varies with the hour: solar and wind count for their year's
  average, their night and calm inside the capacity factor, because the cut rule
  abandons districts rather than dimming them. A generator's pollution follows the
  energy it makes — emission intensity times the megawatts it delivers, on the coal
  plant's anchor of 140 — never its nameplate. —
  [power-generation.md](../game-design/features/power-generation.md#tuning)
- [R-services-005] Service range is a road-hop count in tiles, scaled by funding and floored. It
  is never called, drawn or computed as a radius. —
  [services-model.md](../world-sim/services-model.md)
- [R-services-006] Water, and the sewage coming back, conduct along every street tier unless
  its spec says `carriesWater: false` (dirt road, highway, ramp), and along
  a water pipe. Power conducts only where the class surface is `paved`, read
  from the spec, never from a separate flag, and along a power line. Rail
  conducts neither; a line carries no water and a pipe no power. —
  [utilities-model.md](../world-sim/utilities-model.md); `src/sim/network.ts`
- [R-services-007] Utility supply is one city-wide total and an unconnected generator still
  counts. Demand is what the network reaches: every building it reaches,
  abandoned ones included, and nothing it does not. When demand exceeds
  supply the grid gives out from its far end: buildings are cut in order of
  network steps from the nearest generator, furthest first, ties by id,
  footprint tiles only, as a hard cut, never a dim. An abandoned building
  keeps its place in that line, so abandoning never hands a building its own
  supply back. Supply and use are summed in whole millionths (watts,
  millilitres), never as floats. —
  [utilities-model.md](../world-sim/utilities-model.md#brownouts),
  [power-generation.md](../engineering/features/power-generation.md);
  `recomputeUtilities` in `src/sim/network.ts`
- [R-services-008] A building a shortage cuts carries `PowerShortage` or `WaterShortage` beside
  `NoPower` or `NoWater`. The shortage flag only says why and never abandons a
  building on its own. —
  [utilities-model.md](../world-sim/utilities-model.md#brownouts)
- [R-services-009] Because supply counts it anyway, a generator that cannot deliver must say
  so: a utility whose footprint touches no tile that conducts **what it
  produces** (or, for a drain, takes) carries `Problem.NoRoad`. Touching a
  road is not enough — a motorway and a ramp carry no water, an unsealed
  lane conducts no power, and a power line carries electricity only — so the
  test is the same predicate the coverage walk seeds from, never a second
  idea of "connected". Otherwise
  the supply figures read healthy while nothing is served and the city
  silently stops growing. —
  [utilities-model.md](../world-sim/utilities-model.md); `utilityCanDeliver` in
  `src/sim/network.ts`, `flagUnservedUtilities` in `src/sim/growth.ts`
- [R-services-010] Exactly one road BFS runs per active facility per tick. Population in reach,
  collection and forwarding ride that traversal, never a second BFS or a grid
  sweep. — [service-capacity.md](../engineering/features/service-capacity.md)
- [R-services-011] All per-facility iteration (coverage, collection, fleet allocation) runs in
  ascending building id with id tiebreaks, and the shortage cut breaks its
  distance ties by id, so two runs agree. — [services-model.md](../world-sim/services-model.md),
  [service-capacity.md](../engineering/features/service-capacity.md)
- [R-services-012] `ServiceSpec.capacity` is optional and absent means uncapped. Nobody in reach
  means uncapped (share is `Infinity`, never `0/0`). The field multiplier is
  `min(1, supply)` and never exceeds 1. Over capacity degrades smoothly (200%
  load halves the good); never a threshold, a queue, a waiting list or a
  refusal. — [service-capacity.md](../engineering/features/service-capacity.md)
- [R-services-013] Facility contributions resolve per facility and are never pre-blended per
  kind, because `clamp255` rounds. A building in reach counts once and in full;
  only `Active` residents count; jobs never count. —
  [service-capacity.md](../engineering/features/service-capacity.md)
- [R-services-014] Capacity pools per tile, by proportional allocation: `supply[t]` is the sum
  over the facilities reaching `t` of capacity ÷ that facility's reach
  population. Facilities are never grouped into a shared pool by overlapping
  coverage — that grouping is transitive, so one chain of stations closes into
  a single map-wide pool and the worst district stops differing from the
  city average exactly when a player needs the two apart. —
  [service-capacity.md](../engineering/features/service-capacity.md)
- [R-services-015] Education and Health coverage blend as a maximum; police and fire subtract
  half from Crime and FireRisk; a park adds a quarter into LandValue. No kind
  switches to additive stacking, and LandValue is never floored at a park
  value. — [services-model.md](../world-sim/services-model.md),
  [environmental-simulation.md](../world-sim/environmental-simulation.md)
- [R-services-016] Education is one field per rung — elementary (`Education`), middle, high and
  college — and a school writes only its own, so no rung ever substitutes for
  another at any quantity. Every school writes 150 and every gate is the field
  over 60, so a catchment is 0.6 of the range at any rung. A library writes no
  field: it lifts the range of every school in its reach by up to a fifth,
  resolved before any school radiates, and does nothing where no school is. All
  rungs and the library share the one Education funding slider. —
  [education-ladder.md](../game-design/features/education-ladder.md),
  [education-ladder.md](../engineering/features/education-ladder.md);
  `src/shared/schooling.ts`, `ServiceSim.tick` in `src/sim/services.ts`
- [R-services-017] Level 2 is never gated by schooling, at any density. Only level 3 asks for
  it, by zone: elementary for detached and row housing, middle and high both
  for denser housing, mixed use and local commercial, college for high-density
  commercial, and nothing for industry or farms. A building that clears land
  value and fails only its schooling carries `Problem.NeedsSchool`, which never
  counts toward abandonment. —
  [simulation-rules.md](../game-design/simulation-rules.md);
  `level3Schooling` in `src/shared/schooling.ts`
- [R-services-018] Dispatch is read-only presentation: it reads Crime, FireRisk, Pollution and
  the registry, and never writes a field, a building, coverage or the economy.
  — [services-model.md](../world-sim/services-model.md),
  [emergency-services.md](../engineering/features/emergency-services.md)
- [R-services-019] A station answers only within its road reach, counted in path tiles
  (`path.points.length - 1`) and scaled by the kind's funding, never by
  straight line and never by `path.cost`, which is congestion-scaled time and
  not a distance. — [emergency-services.md](../engineering/features/emergency-services.md)
- [R-services-020] `ServiceSpec.responders` caps the calls a facility has in flight; absent is
  unlimited. A call no station can answer still spawns as unanswered
  (`answered: false`), takes no vehicle slot and lapses; unanswered calls are
  capped apart from the answered pool. —
  [emergency-services.md](../engineering/features/emergency-services.md)
- [R-services-021] Incidents spawn at real per-resident rates (fire 0.042, medical 0.085,
  police 0.45 a year) scaled by occupants and by field ÷ `FIELD_REFERENCE`,
  never at a flat chance per building. —
  [balancing.md](../game-design/balancing.md#emergency-dispatch)
- [R-services-022] Derived per-tick figures (service load, population in reach, provision) live
  on `SimSnapshot`, never in `CityStats` or the save. —
  [service-capacity.md](../engineering/features/service-capacity.md)
- [R-services-023] A load reading of zero and no load reading at all are different answers and
  are never collapsed into one. No capped facility of a kind reads `—`; a
  capped facility that reaches nobody reads `0%`. —
  [service-capacity.md](../engineering/features/service-capacity.md),
  [hud.md](../ux/hud.md); `ServiceLoad.capped` in `src/shared/types.ts`
- [R-services-024] Landfill is a painted layer, not a ploppable; a connected area under
  `LANDFILL_MIN_AREA_TILES` (4) is rejected. —
  [services-model.md](../world-sim/services-model.md)
- [R-services-025] A facility group shares its load: a building reached by several
  incinerators with room gives each an equal share, as a tile reached by
  several service facilities sums what each dedicates to it. Incinerators
  collect before the landfill, since they process what they take and a
  landfill only keeps it. An incinerator burns what it holds up to its
  ceiling and its pollution is its catalog figure scaled by the share of
  that ceiling the last pass used, never a flat figure while idle. —
  [services-model.md](../world-sim/services-model.md#garbage-and-waste-management);
  `shareOut` and `incineratorEmission` in `src/sim/garbage.ts`
- [R-services-026] Garbage is one unit end to end, 0.25 kg: generation, the per-tile backlog,
  the landfill, the incinerator's burn and buffer all count it, so a change to
  one is a change to the chain. A building's trash is its people's, 1.32 kg a
  resident and 1.86 kg a job a day, never a per-building or per-level figure,
  and a pass emits the whole units its rate has reached, exact over a day with
  no stored remainder. A landfill tile's capacity is derived from the tile, the
  pile and the compacted density, never set by hand. —
  [services-model.md](../world-sim/services-model.md#garbage-and-waste-management);
  `src/shared/constants.ts`, `src/sim/garbage.ts`
- [R-services-027] Kerbside recycling diverts at source and only from homes: a depot serves
  residents of buildings of four or fewer homes in its road reach, up to its
  homes, each served once, and their recycling never reaches the trash tiles,
  and reaches a disposal facility only as a sorting plant's residue. Jobs are
  never served. A depot is never a disposal
  facility and forwards nothing. Its credit is the disposal it avoids, derived
  from the landfill's own costs, booked once a month. —
  [garbage-recovery.md](../game-design/features/garbage-recovery.md#the-kerbside-recycling-depot-built-2026-10-08);
  `src/sim/garbage.ts`
- [R-services-028] A Materials Recovery Facility sorts recycling; it never takes rubbish. It
  sorts, up to its daily throughput, first the kerbside recycling of the
  depots its streets connect to, at any distance, and then its own round's. The round serves, in its road reach and in building
  id order, what kerbside does not: apartment blocks of more than four homes
  at 0.30 kg a home a day, and jobs at 0.30 kg a day in commerce and 0.25 kg
  in industry (CalRecycle 2014). Like kerbside, that recycling is set aside
  at source and never reaches the trash tiles, and a building is served once.
  Of everything sorted, in town or at the regional plant, 87% is recovered
  and earns the credit (Recycling Partnership 2024). The other 13% is
  residue. A regional plant buries its residue out of town; an MRF forwards
  its residue to the nearest landfill or incinerator its streets connect to,
  at any distance. With none that has room, the residue fills the MRF's own
  store, and a full store stops it sorting. A stopped MRF's round serves no
  one, and the depots' recycling goes regional again. —
  [garbage-recovery.md](../game-design/features/garbage-recovery.md); `src/sim/garbage.ts`
- [R-services-029] A transfer station is never final and diverts nothing; it lends reach. It
  collects only after the incinerators and the landfill have collected, so
  it takes what no disposal site reaches, up to its daily throughput and the
  room on its tipping floor. Each pass it forwards up to that throughput to
  the nearest landfill or incinerator its streets connect to that has room,
  at any distance; distance never reduces what arrives. The floor holds at
  most two days' throughput (the common 48-hour state limit), and a full
  floor stops it collecting. —
  [garbage-recovery.md](../game-design/features/garbage-recovery.md); `src/sim/garbage.ts`
- [R-services-030] A facility's trucks leave from the street nearest any tile of its turned
  lot, never only its corner: a 2×3 depot or a 4×4 incinerator whose corner
  stands three tiles from its street still sends its fleet. —
  `src/sim/worker.entry.ts`; `tests/interaction/depottrucks.test.ts`
- [R-services-031] A civic ploppable's power and water derive from its floor at its activity's
  surveyed intensity. The floor is the massing rule's (footprint × 185 m² a
  tile × storeys) unless the building's plan states one, and the hospital's
  does: 72 beds at 2,500 sf, because six of its fifteen tiles are a parking
  deck. — [municipal-services.md](../game-design/features/municipal-services.md#what-the-facilities-draw-derived-2026-10-05);
  `src/shared/contracts.test.ts`
- [R-services-032] Off-street parking is counted to code: a hospital holds 2 spaces a bed, and
  its accessible spaces follow ADA 2010 §208.2 over the spaces it provides,
  1 van space in 6. The kerbside table (PROWAG R211) is a different table and
  is never used for a lot or a deck. —
  [healthcare-and-death-care.md](../game-design/features/healthcare-and-death-care.md#sizes-costs-and-the-ladder-rule);
  `adaAccessibleSpaces` in `src/shared/parkingcode.ts`
- [R-services-033] A suburban commercial or industrial lot draws its code-minimum spaces (by
  kind, from its floor: the body's plate times its storeys), its ADA
  accessible spaces nearest the entrance, its loading berths and its planted
  islands and trees, all from one shared requirement and one layout of
  9 × 18 ft stalls on 24 ft aisles. The body is slid, never cut, so the
  drawn building keeps the floor its jobs come from; a lot that cannot meet
  its code draws as many spaces as fit, and never a space without the
  accessible ones it owes. Downtown kinds (ComHigh's office and hotel, Mixed)
  draw no lot parking and park at the kerb. —
  [parking-to-code.md](../specs/parking-to-code.md);
  `src/shared/parkingcode.ts`, `src/shared/lotlayout.ts`, `src/shared/floorarea.ts`
- [R-services-034] Such a lot is paved only where its layout uses the ground: the body and
  its walks, the drive, its throat and the aisles, the spaces and access
  aisles, the berths and the aisle that reaches them, the forecourt and the
  tank farm, all listed by the one layout the car park is drawn from. The
  rest of the lot is planted, and the verge is paved only where the drive
  and the walk cross it. Downtown and non-parking lots keep their pads. —
  [parking-to-code.md](../specs/parking-to-code.md#the-paved-ground);
  `lotPaving` in `src/shared/lotlayout.ts`, `src/render/lots.ts`
- [R-services-035] The first 3,000 sq ft of a single-tenant shop's or restaurant's floor parks
  nothing and the rest parks at the full rate; a strip, a supermarket and
  industry get no exemption. So the corner shop owes no space and grows on a
  strip one tile deep. — [parking-to-code.md](../specs/parking-to-code.md#the-requirement);
  `SMALL_USE_EXEMPT_SQ_FT` in `src/shared/parkingcode.ts`
- [R-services-036] A lot's kerb credit is one space for every stall the street paints on the
  lot's own side whose middle lies along the lot's frontage: parallel, angled
  and head-in alike, accessible stalls included, no cap; the far kerb and the
  junctions' no-parking zones count nothing. The sim and the renderer count
  it with the one shared function over the same stalls. —
  [parking-to-code.md](../specs/parking-to-code.md#the-requirement);
  `kerbCreditFor` in `src/shared/kerblayout.ts`
- [R-services-037] A lot's on-site requirement is its code requirement less its kerb credit,
  never below none, and the ADA accessible spaces it owes are counted within
  what it holds on site: a kerb stall never meets one, and a lot left nothing
  to hold draws no car park and owes no accessible space. A suburban
  commercial or industrial building is built and levels up only onto a lot
  that meets that, choosing the smallest of its kind's footprints that does;
  a larger lot is the kind's own building (same floor, staff and draw, its
  body sized on the kind's footprint) and never a kind of its own in the
  draw, so a kind's share is counted once. A level-up never takes a smaller
  lot. A lot that stops meeting its code — the kerb parking painted out — is
  legal nonconforming: it is never abandoned for it, and only a level-up
  must meet the code again. — [parking-to-code.md](../specs/parking-to-code.md#which-kinds-fit-and-larger-lots);
  `holdsLotParkingAt` in `src/shared/lotparking.ts`, `footprintsOf`,
  `spawnCandidates`, `tryLevelUp` in `src/sim/growth.ts`
- [R-services-038] Every figure in a service plan derives from a published municipal standard
  plus the 20 m tile, never picked to feel right, and any override is stated.
  The smallest facility of a ladder must be affordable to a city that has just
  unlocked it, and that one rule overrides the derivation. —
  [municipal-services.md](../game-design/features/municipal-services.md)

