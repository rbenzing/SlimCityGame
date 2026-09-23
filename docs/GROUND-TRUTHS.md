# Ground truths

The always/never rules of SlimCity, gathered in one place. Every discipline's
specification spells its rules out at length; this file is the short form an
agent reads before touching anything, so the rules that are easiest to break by
accident are the hardest to miss.

How to use it:

- Follow every line here. When code and a truth disagree, stop and flag the
  disagreement rather than silently choosing one. The truth is usually right and
  the code has drifted, but resolving it is a decision, not a guess.
- A truth is not tuning. A number appears here only when it is a fixed
  calibration constant (a tile is 20 m). Dials live in
  [balancing.md](game-design/balancing.md) and the code it names.
- When a truth changes, change it here and in the specification or decision
  record that decides it, in the same commit. An invariant learned the hard way,
  a bug a rule would have prevented, is added here.
- Each line ends with where the rule is decided and, where it helps, the code
  that enforces it. Line numbers are deliberately absent; search for the heading
  or the symbol.

## Roads, junctions and transit

The road model is derived from the published standards in
[Road Guides](Road%20Guides/README.md) (MUTCD 11th edition, AASHTO, HCM).
MUTCD citations below use 11th-edition section numbers.

- A tile carries exactly one road tier. Two roads never share a tile: no
  overpass, no shared rail and street tile. A rail tile between two street tiles
  is a break in the street, not a crossing, and drawing rail through a street
  severs it. Level crossings that stop road traffic do not exist yet. —
  [road-model.md](world-sim/road-model.md),
  [transit-model.md](world-sim/transit-model.md); `isStreetTier` and
  `isRailTier` in `src/shared/types.ts`, `src/world/roads.ts`
- The rail and street graphs never share an edge. Every `RoadNetwork` is built
  from one tier predicate (`isStreetTier`, `isRailTier`, `isTramTier`) and
  `edgeTraversable` refuses any edge outside the network being searched. Rail
  conducts no utility and grants no frontage. —
  [transit-model.md](world-sim/transit-model.md),
  [pathfinding.md](world-sim/pathfinding.md); `src/world/pathfind.ts`
- Tram track is a street: cars drive it, it carries utilities and frontage, and
  it sits in both graphs. A tram line only ever routes over the tram graph, and
  no line mixes tram and rail track. —
  [transit-model.md](world-sim/transit-model.md); `isTramTier`
- A road is a class, a profile (its cross-section) and its junctions. Markings,
  furniture, crossings and capacity are derived from those three and never
  authored or stored per tier. — [road-model.md](world-sim/road-model.md),
  [ADR-0012](engineering/adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md)
- Roads are grid-aligned. Curves and corner arcs are render-only, and the graph
  never contains a diagonal step. —
  [ADR-0005](engineering/adr/0005-roads-are-grid-aligned-no-freeform-curves.md),
  [streets.md](art/streets.md)
- Never compare a stored `roadFlow` byte to a `RoadFlow` value directly:
  direction is the low three bits (`ROAD_FLOW_DIRECTION_MASK`), bit 3 marks a
  corridor half and bit 4 the right half. —
  [road-model.md](world-sim/road-model.md); `src/shared/types.ts`
- A one-way road flows the way it was drawn (its stored flow), never inferred
  from geometry; the geometric fallback exists only for tiles whose flow is
  `RoadFlow.None`. — [road-model.md](world-sim/road-model.md);
  `src/world/pathfind.ts`
- Roads replace by class rank (dirt, alley, rural, local, one-way, urban,
  collector, arterial, divided, ramp, highway, then rail), never by tier number
  or catalog order. A road with a bus or tram lane outranks the same road
  without one. A drag through a road it does not outrank is refused whole; only
  replace mode overrides. — [road-model.md](world-sim/road-model.md);
  `CLASS_RANK` in `src/shared/roadprofile.ts`
- The `RoadTier` byte is a persisted, append-only preset id, not a hierarchy.
  Never use a tier number as rank. — [road-model.md](world-sim/road-model.md),
  [data-model.md](engineering/data-model.md)
- A motorway (highway class) touches only a highway or a ramp. The rule is an
  accept-list, so a new class stays off the motorway until explicitly admitted.
  A ramp never joins dirt or alley. — [road-model.md](world-sim/road-model.md);
  `MOTORWAY_MEETS` in `src/shared/roadprofile.ts`
- Highway and rail arms never take a junction control — not from the warrant
  and not from a player's override, which is refused. A ramp's motorway end is
  an uncontrolled merge or diverge; its other end is an ordinary warranted
  junction. — [road-model.md](world-sim/road-model.md);
  `takesControl` in `src/shared/junction.ts`, `cmdSetJunctionControl` in
  `src/sim/worker.entry.ts`
- A merge or a diverge is not an intersection. A motorway tile running
  straight through with only ramps beside it (a ramp node) keeps its lane and
  edge lines, grows no junction box and no rounded corners, opens its
  ramp-side edge line only across the ramp's mouth, carries the auxiliary lane
  across itself, and is no junction anything approaches, so nothing is arrowed
  on the way in. Its exit board stands once, on the tile before a ramp that
  leaves. Decided once and asked everywhere: the mesh, the approach walk and
  the furniture never count arms for themselves. —
  [road-model.md](world-sim/road-model.md); `isRampNode` in
  `src/shared/junction.ts`, `isRampNodeAt` in `src/shared/approachzone.ts`
- The warrant ladder is none, yield, stop, all-way stop, signal, and it only
  climbs. Roundabout is never a warrant default because it changes geometry. A
  player's control override is never stepped down by a warrant, and the warrant
  is still computed for the inspector. —
  [road-model.md](world-sim/road-model.md); `src/shared/junction.ts`
- Warrants are re-evaluated only on a graph rebuild and once per game day,
  never continuously. Thresholds are stored as volume/capacity fractions that
  restate the MUTCD absolute volumes (500 + 150 veh/h for a signal, 300 + 200
  for an all-way stop), never as veh/h. —
  [systems/traffic.md](engineering/systems/traffic.md),
  [road-model.md](world-sim/road-model.md)
- Signals run a 60 s cycle (90 s with a dedicated left) on one city-wide clock,
  and the rendered head cycles on that same clock. —
  [road-model.md](world-sim/road-model.md)
- k = 3/7 game-capacity units per veh/h is the one calibration constant between
  the published standards and game units, and it must keep the two-lane preset
  at 600. —
  [ADR-0013](engineering/adr/0013-traffic-figures-come-from-published-standards.md),
  [road-model.md](world-sim/road-model.md)
- Edge cost is length ÷ speed × (1 + 2·min(1, v/c)) plus the junction delay,
  paid on departure; merge delay applies only from a ramp onto a highway. The
  A\* heuristic stays admissible (Manhattan ÷ `MAX_ROAD_SPEED`) and a junction
  delay is never negative. — [traffic-model.md](world-sim/traffic-model.md),
  [pathfinding.md](world-sim/pathfinding.md); `src/world/pathfind.ts`
- A\* state is (node, arriving edge), never a bare node id, because turn
  legality and delay depend on the arriving arm. A banned turn is no path, never
  a priced detour, and a U-turn is never offered by default. —
  [pathfinding.md](world-sim/pathfinding.md); `turnAllowed` in
  `src/world/pathfind.ts`, `src/shared/approach.ts`
- Any grid edit invalidates the whole road graph and reassigns every node and
  edge id. Never persist an edge or node id across an edit. Tram-graph edge ids
  are a private numbering, and tram relief is recomputed over the road graph. —
  [pathfinding.md](world-sim/pathfinding.md),
  [systems/traffic.md](engineering/systems/traffic.md),
  [transit-model.md](world-sim/transit-model.md)
- Traffic and pathfinding draw no RNG: route jitter is a pure hash of origin
  and destination. Cosmetic vehicles never feed back into the sim. —
  [systems/traffic.md](engineering/systems/traffic.md),
  [ADR-0001](engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
- The tile is the 20 m width budget. A profile wider than one tile becomes a
  two-tile corridor only when the class's own largest road needs one, otherwise
  it is refused with a reason; a corridor is a straight run and a bend is
  refused. — [road-model.md](world-sim/road-model.md); `src/shared/corridor.ts`
- A reserved lane (bus, tram, bike) always costs a general lane and counts
  against the class's lane range; lanes are never dropped silently to fit. —
  [road-model.md](world-sim/road-model.md)
- Yellow marks the side of a line that oncoming traffic is on, adjacent or
  not. On an undivided road that is the centre line. On a **one-way
  carriageway — a motorway, a ramp, a one-way street, either half of a
  divided road — the LEFT edge line is solid yellow and the right is solid
  white** (MUTCD §3B.09 ¶02–03); lane lines between same-direction lanes are
  broken white (§3B.06 ¶05). Every paved road carries edge lines; dirt, alley
  and rail carry no paint; one-way, highway and ramp paint no centre line. —
  [road-model.md](world-sim/road-model.md); `src/render/roadmarkings.ts`
- A motorway is ONE carriageway, not a road with two halves. Highway and ramp
  are the only classes whose lane range counts a single direction, they admit
  no median piece, and a dual carriageway is two runs laid side by side and
  widened independently. —
  [road-model.md](world-sim/road-model.md); `src/data/roads.json`
- Two motorway carriageways may lie on adjacent tiles and never connect. A
  highway tile is not an arm of a highway lying across its stored flow when
  each lies across the other's — no mask bit, no graph edge, no junction — so
  the pair never merges into one unpainted slab that traffic drifts sideways
  across. The only way onto or off a motorway is a ramp, so a ramp alongside
  is always an arm. A motorway in line joins; one arriving square-on is a
  junction. It is decided in the grid, never refused by the road tool, so it
  holds however the roads were drawn. The mask, the graph, the approach walk
  and the road furniture all read the one predicate, so what is drawn, what is
  driven and what is signed cannot disagree — counted as an arm anywhere, a
  second carriageway took every gantry off the first. —
  [road-model.md](world-sim/road-model.md); `sideBySideCarriageways` in
  `src/shared/corridor.ts`
- A sign faces the traffic it serves (MUTCD §2A.17 ¶01), and its facing comes
  from the direction of approaching traffic, not from the roadway edge it
  stands on (§2A.17 ¶02). On a one-way carriageway — a motorway, a ramp, a
  one-way street — both kerbs carry the same stream, so every board and every
  gantry faces back against the tile's stored flow; only a two-way road takes
  its facing from which kerb the board is on. A cantilever (signal, exit
  board) has its face welded to its arm, on local −Z, so it faces its drivers
  only from their right: a signal stands on the approaching driver's right,
  and a one-way carriageway's exit stands right of the flow or not at all.
  The placement decides the facing and the renderer applies it, never
  recomputing one of its own. — [streets.md](art/streets.md);
  `CANTILEVER_FACE_Z`, `cantileverSide`, `flowFacingYaw` and
  `signWorldTransform` in `src/render/roadfurniture.ts`
- A manhole cover is the top of a sewer and is drawn only on a road whose
  class carries water. A motorway and a ramp carry none, so they carry no
  covers; the test is the water flag, never a tier list. —
  [road-model.md](world-sim/road-model.md); `src/render/roadfurniture.ts`
- A broken line is 3.05 m of paint and a 9.15 m gap (a 12.2 m period), 0.15 m
  wide, with its phase anchored at world metre 0 across every seam. —
  [road-model.md](world-sim/road-model.md); `src/render/roadsmesh.ts`
- Turn arrows exist only where a lane's resolved movement set says the movement
  exists, and a single-lane approach is unmarked (MUTCD 3D.06 ¶01). Gore
  hatching slants away from the adjacent traffic (MUTCD 3B.25 ¶08–09). —
  [road-model.md](world-sim/road-model.md)
- A roundabout carries a yield line of white triangles pointing at approaching
  traffic on every entry (MUTCD 3B.19 ¶10) and a YIELD sign on every approach
  (MUTCD 2B.10 ¶06); it is the only junction where a yield faces every approach.
  No stop bar, crosswalk or centre line runs through it, and the edge line never
  crosses an exit (MUTCD 3D.03). — [road-model.md](world-sim/road-model.md)
- Crosswalks are derived (footway present, arm below top rank), lie against the
  kerb line, are as deep as the footway but never under 1.8 m (MUTCD 3C.03
  ¶05), and the stop line sits at least 1.2 m in advance of the crossing (MUTCD
  3B.19 ¶13). Never over an alley mouth. —
  [road-model.md](world-sim/road-model.md); `src/render/roadsmesh.ts`
- An alley is an access, not a leg: no turn bay, no swept footway, no crossing
  at its mouth. A dirt track is a leg. —
  [road-model.md](world-sim/road-model.md)
- Bridges are ordinary road tiles plus an elevation layer, never a second
  network. One deck height per tile, no tunnels, no stacked decks, and an
  elevated tile grants no zoning frontage. —
  [road-model.md](world-sim/road-model.md),
  [constraints.md](engineering/constraints.md)

## World and simulation

- The map is `MAP_SIZE` (256) tiles a side at `TILE_METERS` (20 m) each; every
  allocation sized to the map reads those constants and never a literal. Lane,
  vehicle and person dimensions are absolute metres and never scale with the
  tile. — [world-model.md](world-sim/world-model.md),
  [ADR-0010](engineering/adr/0010-map-size-is-capped.md),
  [constraints.md](engineering/constraints.md); `src/shared/constants.ts`
- World state is one flat typed array per layer, indexed `z * size + x`. A new
  fact about a tile is a new layer wired into the tick, never a per-tile object
  or an entity-component system. —
  [ADR-0003](engineering/adr/0003-world-state-is-layered-flat-typed-arrays.md);
  `src/world/grid.ts`
- Nothing under `src/sim`, `src/world`, `src/core` or `src/render` calls
  `Math.random`, `Date.now` or `performance.now`. Randomness comes from the
  seeded RNG forked per system; "now" is the tick or the caller's elapsed time.
  Only `src/app` is exempt. —
  [ADR-0002](engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md),
  [constraints.md](engineering/constraints.md); `src/core/rng.ts`
- The sim ticks at `TICK_RATE` (20) and `tickNo` advances by exactly one per
  `FixedTimestep` firing. Tick logic never reads the speed multiplier; at speed
  0 commands still drain and utilities recompute, but `tickNo` does not move. —
  [tick.md](world-sim/tick.md), [time-system.md](world-sim/time-system.md)
- The tick order is fixed: commands, utilities, demand, growth, emission,
  services, garbage, traffic, transit, dispatch, trucks, traffic bake, fields,
  economy, snapshot. A new system is slotted into that order explicitly. —
  [tick.md](world-sim/tick.md); `tick()` in `src/sim/worker.entry.ts`
- The calendar is 200 ticks a day and 30 days a month. `VISUAL_DAY_TICKS` and
  `CLOCK_START_OFFSET_TICKS` are display-only and never drive a sim rule. —
  [time-system.md](world-sim/time-system.md)
- There are no citizen agents: no person, household, commute or age exists in
  the sim. Population is re-summed every tick from the catalog residents of
  `Active` buildings; `Constructing` and `Abandoned` contribute nothing; it is
  never incremented as an event and never persisted as authoritative. —
  [population-model.md](world-sim/population-model.md),
  [agent-behavior.md](world-sim/agent-behavior.md),
  [ADR-0001](engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
- Vehicles and pedestrians are cosmetic: they draw along a real route and
  simulate nothing, and a cosmetic route is computed once and never re-solved.
  Traffic is statistical assignment. —
  [ADR-0001](engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md),
  [agent-behavior.md](world-sim/agent-behavior.md)
- Simulation fidelity never varies with camera distance or visibility; the
  worker is never told where the camera is. —
  [lod-strategy.md](world-sim/lod-strategy.md)
- Weather, seasons and temperature do not exist in the sim. The season chip is
  display flavour. —
  [environmental-simulation.md](world-sim/environmental-simulation.md)
- A tile is water iff its height is strictly below `SEA_LEVEL` (0). Water is
  derived from terrain, never authored; it has no flow and no fresh/salt
  distinction, and terraforming re-derives the mask. —
  [world-model.md](world-sim/world-model.md); `SEA_LEVEL` in
  `src/shared/constants.ts`
- Field diffusion is integer fixed-point, `(154·self + 102·nbrAvg) >> 8` over
  four von Neumann neighbours, never float. Each field runs only on its
  `(period, offset)` slot. —
  [environmental-simulation.md](world-sim/environmental-simulation.md);
  `src/sim/fields.ts`
- Happiness is rewritten wholesale by `computeHappiness` every pass. No feature
  writes to it, diffuses it or emits into it; services and recreation reach it
  only through the fields it reads. —
  [environmental-simulation.md](world-sim/environmental-simulation.md),
  [parks-and-recreation.md](engineering/features/parks-and-recreation.md)
- Only `NoRoad`, `NoPower` or `NoWater` for three consecutive growth passes
  abandon an `Active` building. `LowDemand` is display-only and stays toothless.
  — [population-model.md](world-sim/population-model.md);
  `ABANDON_BLOCKER_STREAK` in `src/sim/growth.ts`
- Building ids are monotonic from 1 and never reused in a session. The
  `buildingId` layer is the only spatial index. —
  [entities.md](world-sim/entities.md)
- A zoned tile develops only when it is zoned, served with power and water on
  its footprint, and within Manhattan distance 3 of a street. One zonability
  predicate decides; the zoning grid visual and the `paintZone` command both
  defer to it and may never disagree. Clearing a zone is exempt from the
  frontage check so a zone can always be removed. —
  [simulation-rules.md](game-design/simulation-rules.md)
- The player paints zones and never places a zoned building; growth runs on the
  sim clock as demand × desirability. Civic and utility buildings are plopped;
  zones, districts, landfill and power lines are painted. —
  [gdd.md](game-design/gdd.md), [gameplay-loop.md](game-design/gameplay-loop.md)

## Utilities and services

- Power, water and every service reach the city only along the street-tier road
  network: a breadth-first search from the road tiles orthogonally adjacent to
  the footprint, radiating one step (utilities) or two steps (services) onto
  non-road tiles. Never a straight-line radius. —
  [utilities-model.md](world-sim/utilities-model.md),
  [services-model.md](world-sim/services-model.md),
  [ADR-0009](engineering/adr/0009-utilities-propagate-along-roads.md);
  `src/sim/services.ts`, `src/sim/network.ts`
- A facility with no street-tier road within two orthogonal steps of its
  footprint covers nothing. — [services-model.md](world-sim/services-model.md);
  `NEAR_ROAD_RADIUS` in `src/sim/services.ts`
- Service range is a road-hop count in tiles, scaled by funding and floored. It
  is never called, drawn or computed as a radius. —
  [services-model.md](world-sim/services-model.md)
- Water conducts along every street tier unless its spec says
  `carriesWater: false` (highway, ramp). Power conducts only where the class
  surface is `paved`, read from the spec, never from a separate flag. Rail
  conducts neither. — [utilities-model.md](world-sim/utilities-model.md);
  `src/sim/network.ts`
- Utility supply is one city-wide total and an unconnected generator still
  counts. When demand exceeds supply, consumers are cut in ascending building
  id, footprint tiles only, as a hard cut, never a dim. —
  [utilities-model.md](world-sim/utilities-model.md),
  [power-generation.md](engineering/features/power-generation.md)
- Because supply counts it anyway, a generator that cannot deliver must say
  so: a utility whose footprint touches no tile that conducts **what it
  produces** carries `Problem.NoRoad`. Touching a road is not enough — a
  motorway and a ramp carry no water, an unsealed lane conducts no power, and
  a power line carries electricity only — so the test is the same predicate
  the coverage walk seeds from, never a second idea of "connected". Otherwise
  the supply figures read healthy while nothing is served and the city
  silently stops growing. —
  [utilities-model.md](world-sim/utilities-model.md); `utilityCanDeliver` in
  `src/sim/network.ts`, `flagUnservedUtilities` in `src/sim/growth.ts`
- Exactly one road BFS runs per active facility per tick. Population in reach,
  collection and forwarding ride that traversal, never a second BFS or a grid
  sweep. — [service-capacity.md](engineering/features/service-capacity.md)
- All per-facility iteration (coverage, collection, brownout cut, fleet
  allocation) runs in ascending building id with id tiebreaks, so two runs
  agree. — [services-model.md](world-sim/services-model.md),
  [service-capacity.md](engineering/features/service-capacity.md)
- `ServiceSpec.capacity` is optional and absent means uncapped. Nobody in reach
  means uncapped (share is `Infinity`, never `0/0`). The field multiplier is
  `min(1, supply)` and never exceeds 1. Over capacity degrades smoothly (200%
  load halves the good); never a threshold, a queue, a waiting list or a
  refusal. — [service-capacity.md](engineering/features/service-capacity.md)
- Facility contributions resolve per facility and are never pre-blended per
  kind, because `clamp255` rounds. A building in reach counts once and in full;
  only `Active` residents count; jobs never count. —
  [service-capacity.md](engineering/features/service-capacity.md)
- Capacity pools per tile, by proportional allocation: `supply[t]` is the sum
  over the facilities reaching `t` of capacity ÷ that facility's reach
  population. Facilities are never grouped into a shared pool by overlapping
  coverage — that grouping is transitive, so one chain of stations closes into
  a single map-wide pool and the worst district stops differing from the
  city average exactly when a player needs the two apart. —
  [service-capacity.md](engineering/features/service-capacity.md)
- Education and Health coverage blend as a maximum; police and fire subtract
  half from Crime and FireRisk; a park adds a quarter into LandValue. No kind
  switches to additive stacking, and LandValue is never floored at a park
  value. — [services-model.md](world-sim/services-model.md),
  [environmental-simulation.md](world-sim/environmental-simulation.md)
- Dispatch is read-only presentation: it reads Crime, FireRisk, Pollution and
  the registry, and never writes a field, a building, coverage or the economy.
  — [services-model.md](world-sim/services-model.md),
  [emergency-services.md](engineering/features/emergency-services.md)
- Derived per-tick figures (service load, population in reach, provision) live
  on `SimSnapshot`, never in `CityStats` or the save. —
  [service-capacity.md](engineering/features/service-capacity.md)
- A load reading of zero and no load reading at all are different answers and
  are never collapsed into one. No capped facility of a kind reads `—`; a
  capped facility that reaches nobody reads `0%`. —
  [service-capacity.md](engineering/features/service-capacity.md),
  [hud.md](ux/hud.md); `ServiceLoad.capped` in `src/shared/types.ts`
- Landfill is a painted layer, not a ploppable; a connected area under
  `LANDFILL_MIN_AREA_TILES` (4) is rejected. —
  [services-model.md](world-sim/services-model.md)
- Every figure in a service plan derives from a published municipal standard
  plus the 20 m tile, never picked to feel right, and any override is stated.
  The smallest facility of a ladder must be affordable to a city that has just
  unlocked it, and that one rule overrides the derivation. —
  [municipal-services.md](game-design/features/municipal-services.md)

## Saves and the data model

- Enum-like value sets (`ZoneType`, `RoadTier`, `RoadFlow`, `FieldId`,
  `BuildingState`, `Problem`, `VehicleKind`, `CONTROL_BY_CODE`) are `as const`
  objects, never TypeScript enums. Members are explicitly numbered and never
  reordered or reused; a new member appends with the next free number. —
  [naming.md](engineering/standards/naming.md),
  [data-model.md](engineering/data-model.md); `src/shared/types.ts`
- A new per-tile layer is appended as the last thing `serializeGrid` writes,
  `SAVE_VERSION` rises by exactly one, `BYTES_PER_TILE_BY_VERSION` gains one
  entry, and older saves default the layer. An existing layer is never
  reordered, resized or given a new meaning. —
  [data-model.md](engineering/data-model.md),
  [ADR-0007](engineering/adr/0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md);
  `src/world/grid.ts`
- `SAVE_VERSION` is taken as current + 1 at build time; no plan owns a number in
  advance. —
  [municipal-services.md](engineering/features/municipal-services.md)
- Save changes are additive: a save written before a feature loads with the
  feature absent, never rejected and never rescaled into deficit on load. A
  missing field means the city never had it; a missing `catalogId` skips the
  building. —
  [municipal-services.md](engineering/features/municipal-services.md),
  [power-generation.md](engineering/features/power-generation.md)
- Loading refuses `version < 1` or `version > SAVE_VERSION`. There is no
  downgrade path. — [interfaces.md](engineering/interfaces.md);
  `deserializeGrid` in `src/world/grid.ts`
- Resizing a shipped building's footprint is a save migration (re-stamp
  ploppables from the catalog on load), never a bare catalog edit. Height-only
  changes are exempt. —
  [municipal-services.md](engineering/features/municipal-services.md)
- The `junctionControl` byte is read and written only through
  `codeForControl` and `controlFromCode`; the order of `CONTROL_BY_CODE` is
  save-format identity. — [interfaces.md](engineering/interfaces.md)
- Preset road profile ids 1..12 equal their tier; custom profiles start at
  `FIRST_CUSTOM_PROFILE_ID` (13) and are renumbered on load by
  `adoptCustomProfiles`. — [data-model.md](engineering/data-model.md);
  `src/shared/roadprofile.ts`
- `SaveHeader.savedAt` is stamped on the main thread; the worker writes 0. —
  [interfaces.md](engineering/interfaces.md)
- The app has no backend. State lives in tab memory, IndexedDB (`slimcity` /
  `saves`, at most 10), `localStorage` and `sessionStorage`; nothing fetches an
  API. — [constraints.md](engineering/constraints.md),
  [data-model.md](engineering/data-model.md)

## Architecture and the thread boundary

- `src/sim` never imports `src/render` or `src/ui`; `src/render` never imports
  `src/sim`; `src/ui` never imports `src/sim`, `src/render` or three.js;
  `src/sim` and `src/render` never import React. No lint rule enforces this,
  only review, so check the diff. —
  [architecture-rules.md](engineering/standards/architecture-rules.md),
  [dependency-map.md](engineering/dependency-map.md),
  [ui-architecture.md](ux/ui-architecture.md)
- `src/shared` is the contract layer every module codes against: types,
  constants and pure helpers with no three.js and no DOM. Edit it deliberately,
  as a contract change, never as a convenience. —
  [architecture-rules.md](engineering/standards/architecture-rules.md),
  [interfaces.md](engineering/interfaces.md)
- The worker is authoritative and never touches the DOM or a `THREE.Scene`. It
  never originates a `Command`; every `Command` starts on the main thread (tool
  commit, undo/redo, settings). — [architecture.md](engineering/architecture.md),
  [interfaces.md](engineering/interfaces.md)
- Player `Command`s are the only way the world mutates. The render thread and
  React never write grid or building state; they read `SimSnapshot` deltas into
  `ClientGridMirror` and the store. All cross-thread exchange is a
  `MainToWorker` / `WorkerToMain` message, never a shared object. —
  [ADR-0002](engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md),
  [ui-architecture.md](ux/ui-architecture.md)
- Anything the UI needs from the sim is added to `SimSnapshot` or a
  `WorkerToMain` variant; there is no ambient shared access. `SimSnapshot`
  carries deltas: a channel is present only when it changed (`stats`, `vehicles`
  and `transit` excepted), and `roadProfiles` is always sent before `roads`. —
  [ADR-0002](engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md),
  [interfaces.md](engineering/interfaces.md)
- Only `src/main.ts` imports from every directory and spawns the worker. A UI
  panel reaches the render thread only through a method on `BoundActions` in
  `src/ui/store.ts`, bound in `main.ts`. —
  [architecture.md](engineering/architecture.md),
  [dependency-map.md](engineering/dependency-map.md)
- Every `Command` kind has an `applyCommand` case that returns its literal, exact
  inverse (the prior values, not a re-derived approximation); undo replays that
  inverse, refund included. Settings commands return an empty inverse and are
  simply not undoable. Sim-grown changes (spawn, level-up, abandonment) never
  enter the undo stack. —
  [ADR-0008](engineering/adr/0008-every-tool-commit-is-a-reversible-command.md),
  [interfaces.md](engineering/interfaces.md); `applyCommand` in
  `src/sim/worker.entry.ts`, `src/tools/undo.ts`
- Command batches are not atomic: `drainCommands` has no early exit, `ok` is
  false if any command failed, and `cost` and `inverse` still accumulate the
  successes; inverses are unshifted so undo replays in reverse. `drainCommands`
  touches no RNG, growth, fields, economy or traffic, so commands apply while
  paused; a new handler stays tick-independent. —
  [interfaces.md](engineering/interfaces.md)
- Every priced command refuses with `reason: 'funds'` when cost exceeds funds
  (unless unlimited money is on). Zoning, de-zoning, bulldoze and district paint
  are always free. Every catalog entry, zone tier and tool carries an
  `unlockMilestone` and the worker refuses `'locked'`; Sandbox and Unlimited
  money bypass a real gate, never replace it with a weaker one. —
  [economy.md](game-design/economy.md),
  [progression.md](game-design/progression.md)
- A command failure returns a specific `CommandAck.reason` and the toast copy in
  `main.ts`'s `onAck` names it; never a generic failure. —
  [error-handling.md](engineering/standards/error-handling.md)
- No React and no React Three Fiber in the render path; the 3D world is
  imperative three.js driven from `main.ts`. Viewport pointer and keyboard input
  and the cursor chip live in `main.ts` / `src/app` with `addEventListener`,
  never React handlers. —
  [ADR-0004](engineering/adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md),
  [ui-architecture.md](ux/ui-architecture.md)
- Only state the render thread or worker must read (tool, overlay, photo mode,
  screen, settings) goes in the store; transient navigation state is `useState`
  in `App.tsx`. — [ui-architecture.md](ux/ui-architecture.md)
- Dev-only read-backs hang off `window.__slimcity` behind
  `import.meta.env.DEV`. Add a read method there rather than inferring from
  pixels, and never edit `src/` while a screenshot harness is running. —
  [interfaces.md](engineering/interfaces.md),
  [debugging.md](engineering/standards/debugging.md)
- Expected, recoverable failures (storage, optional GPU features) are handled
  locally with a fallback and a comment naming the expected failure; they never
  crash boot or the frame loop, and there are no retries. Only `console.warn`
  and `console.error` are used; there is no logger. —
  [error-handling.md](engineering/standards/error-handling.md),
  [logging.md](engineering/standards/logging.md)

## Rendering and art

- Every repeated placeable (building, tree, prop, lamp, shelter, vehicle,
  pedestrian) is drawn through one `InstancedMesh` bucket per kind, never a
  per-object `THREE.Mesh`. Plain merged meshes are only for ground surfaces
  rebuilt whole per chunk (terrain, roads, water, lots). —
  [ADR-0006](engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md),
  [asset-guidelines.md](art/asset-guidelines.md),
  [rendering-architecture.md](visual-render/rendering-architecture.md)
- Picking is a CPU raycast against the instanced mesh cross-checked against a
  24-bit RGB id colour per instance, never a per-object mesh. —
  [ADR-0006](engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md);
  `src/render/picking.ts`
- No custom shaders: no `ShaderMaterial`, GLSL or `onBeforeCompile`. Effects
  come from stock materials, TSL node graphs on `MeshStandardNodeMaterial`,
  vertex colour and instance colour. — [shaders.md](visual-render/shaders.md),
  [asset-guidelines.md](art/asset-guidelines.md)
- Nothing is textured or imported: no image textures on world surfaces beyond
  the sun/moon disc, the cloud puff and the map pin, and no GLTF, FBX or OBJ
  loader. Every asset is a TypeScript function of (catalog entry, seed). —
  [texture-standards.md](art/texture-standards.md),
  [asset-guidelines.md](art/asset-guidelines.md)
- Per-instance variation is only a transform and a colour (`setMatrixAt`,
  `setColorAt`), never new topology. One merged geometry per archetype; a
  multi-colour shape uses a region-mask vertex attribute inside one geometry,
  not child meshes. A new material is a new draw batch, so reach for vertex or
  instance colour on an existing one first. —
  [modeling-standards.md](art/modeling-standards.md),
  [materials.md](visual-render/materials.md)
- Slot pools grow by doubling and recycle free slots; live slots are never
  compacted or renumbered, and nothing allocates per frame. —
  [asset-guidelines.md](art/asset-guidelines.md); `src/render/massing.ts`
- `frustumCulled = false` only on meshes whose instances move every frame
  (vehicles, clouds, sky, stars); default culling stays on everywhere else. —
  [rendering-architecture.md](visual-render/rendering-architecture.md)
- `CHUNK_TILES` is 16, and a tile edit dirties every chunk sharing the edited
  corner vertex, never just its own. —
  [rendering-architecture.md](visual-render/rendering-architecture.md),
  [terrain.md](visual-render/terrain.md)
- There is no LOD, no particle or VFX system and no animation system; anything
  that moves is a transform written per frame. — [lod.md](visual-render/lod.md),
  [vfx.md](visual-render/vfx.md), [animation.md](visual-render/animation.md)
- A render file needing a hash copies the local `hash1` function byte for byte
  and never imports it from a shared module; all variation hashes an id, a tile
  coordinate or a caller-owned deterministic clock. —
  [naming-conventions.md](art/naming-conventions.md),
  [asset-guidelines.md](art/asset-guidelines.md)
- A storey is `FLOOR_HEIGHT_METERS` (3.2 m); floor count is height ÷ storey and
  a taller catalog height reads as more storeys, never a stretched box. The
  ground-floor band is the first storey. — [buildings.md](art/buildings.md),
  [modeling-standards.md](art/modeling-standards.md)
- Scale anchors are absolute metres: cosmetic car 4.0 × 1.8 m, pedestrian
  1.75 m, fire appliance 10 m, garbage truck 9 m, standard lane 3.75 m, footway
  1.875 m. A person beside a car reaches just above its roof. —
  [art/README.md](art/README.md), [civic-massing.md](art/civic-massing.md),
  [props-and-vehicles.md](art/props-and-vehicles.md)
- A civic building's footprint and height derive from occupant-load arithmetic
  shown in its plan, never guessed; it goes up rather than out beyond about six
  tiles, and it is identifiable at the default camera pitch without its label by
  the part that does its work (bay doors, entrance, plant, grounds). —
  [civic-massing.md](art/civic-massing.md)
- Every surface colour resolves through `src/render/palette.ts`; no channel
  exceeds `MAX_MATERIAL_CHANNEL` (140) except snow (144), saturated accents stay
  at or below 102, and vehicle paint is the sole exemption. —
  [texture-standards.md](art/texture-standards.md)
- Emissive appears only on a real light source (night windows, luminaires,
  vehicle lights, beacons) because the bloom pass picks up everything emissive.
  Only an `Active` building lights its windows; an `Abandoned` one stays dark at
  every hour. — [materials.md](visual-render/materials.md),
  [lighting.md](visual-render/lighting.md)
- Every sunlit material reads correctly at every hour of the single day/night
  ramp; night tinting rides the ramp, never a second dark material. No
  transparency without a reason; water and the additive lamp pool are the
  exceptions. — [materials.md](visual-render/materials.md),
  [lighting.md](visual-render/lighting.md)
- Anything laid on the ground (pad, apron, driveway, bay, lamp pool, grid)
  samples real terrain height per vertex and splits on the terrain's own
  diagonal. — [buildings.md](art/buildings.md),
  [lighting.md](visual-render/lighting.md), [streets.md](art/streets.md)
- Nothing kerbside stands on a tile with road on both axes (manholes excepted);
  one prop per kerbside slot; everything beside a road measures from
  `curbWidthMeters`. A road-facing kit part is skipped when a building fronts
  no street. — [streets.md](art/streets.md),
  [props-and-vehicles.md](art/props-and-vehicles.md),
  [buildings.md](art/buildings.md)
- A vehicle mesh's nose is at +Z, yaw is `atan2(dx, dz)`, and cars sit in their
  right-hand lane by a tier-derived half-lane offset. —
  [props-and-vehicles.md](art/props-and-vehicles.md)
- Road paint is true-world scale, and dash and sleeper phase are taken from
  global world coordinates, never the tile or the chunk; the line figures are
  in the roads section above. — [streets.md](art/streets.md),
  [road-model.md](world-sim/road-model.md)
- Wherever visual time is derived, add `CLOCK_START_OFFSET_TICKS` (tick 0 is
  09:00) and run on `VISUAL_DAY_TICKS`, never the calendar day. —
  [lighting.md](visual-render/lighting.md)
- Render work is done only when a screenshot from a real browser has been looked
  at; passing tests and read-backs are necessary, never sufficient. —
  [testing.md](engineering/standards/testing.md),
  [debugging.md](engineering/standards/debugging.md)
- UI colours come only from the `@theme` tokens in `src/ui/styles.css`, never a
  hardcoded hex; every icon is the `Icon` component (viewBox 24, 1.8 stroke,
  `currentColor`, `aria-hidden`); no emoji in finished chrome. —
  [ui-style-guide.md](art/ui-style-guide.md),
  [iconography.md](art/iconography.md)

## Game design and interface

- Rule Zero: every rendered control is wired to real, currently consumed
  behaviour. An unbuilt feature is absent and listed in
  [DESIGN.md](DESIGN.md), never a disabled, placeholder or "coming soon"
  control. —
  [ADR-0011](engineering/adr/0011-rule-zero-every-control-is-wired-to-real-behaviour.md),
  [ux/README.md](ux/README.md)
- A tuning constant lives in code and [balancing.md](game-design/balancing.md)
  names its file. Change the number in the code, never only the doc, and never
  create a second copy of a dial. —
  [game-design/README.md](game-design/README.md)
- There are no difficulty levels; game speed (0, 1, 2, 4) changes pacing only,
  never a rule. — [difficulty.md](game-design/difficulty.md)
- Progression is by milestone, never "level" or "tier"; buildings have levels
  1–3. — [progression.md](game-design/progression.md)
- The Advisor re-ranks every tenth snapshot, sorts by severity, then affected
  count, then fixed priority so it never reshuffles under the cursor, and
  returns an empty list for a healthy city. —
  [progression.md](game-design/progression.md), [hud.md](ux/hud.md)
- A tool preview reads back before commit: invalid tint plus a cursor-chip
  reason ("Insufficient funds", "Locked", "Overlapping items"), never a red tint
  alone. — [ux-design.md](ux/ux-design.md), [interaction.md](ux/interaction.md)
- Disabled (nothing to do now, about 30% opacity) and gated by milestone (40%
  opacity, lock, tooltip naming the milestone) are distinct treatments and are
  never merged. — [interaction.md](ux/interaction.md),
  [components.md](ux/components.md)
- Escape is a fixed stack: leave photo mode, cancel the drag, close the drawer,
  drop the tool to select and deselect. In the pause menu Escape only means
  Resume; on the start screen it does nothing. Opening the pause overlay pauses
  at the running speed and Resume restores that exact speed. —
  [interaction.md](ux/interaction.md), [menu-flow.md](ux/menu-flow.md)
- New Game, Load and Quit write an intent to `sessionStorage` and reload; there
  is no in-app teardown path. Save and Options act on the live game. —
  [menu-flow.md](ux/menu-flow.md)
- Every clickable control is a real `<button type="button">` or a native input;
  toggles use `aria-pressed`, never `role="switch"`; icon-only buttons carry
  `aria-label`. — [accessibility.md](ux/accessibility.md),
  [components.md](ux/components.md)
- A key binding is listed in the docs or the Help popover only after it is
  verified against `main.ts` and `App.tsx`; never an aspirational binding. —
  [hud.md](ux/hud.md), [input-mapping.md](ux/input-mapping.md)
- A game-design document precedes the technical plan, which precedes the code.
  A shipped design document stays as a record of intent, and the behaviour moves
  to the specifications. —
  [game-design/features/README.md](game-design/features/README.md)

## Process

- Never name or imitate a commercial city-builder in names, assets, branding,
  code or docs; say "city builder" or "city simulator". Genre grammar is reused
  deliberately; originality is elsewhere. —
  [ADR-0014](engineering/adr/0014-genre-grammar-is-deliberate-originality-is-elsewhere.md),
  [DESIGN.md](DESIGN.md)
- Code comments explain why, never what, and never cite a documentation section
  or narrate history. Test names describe behaviour, without section
  citations. — [coding.md](engineering/standards/coding.md),
  [naming.md](engineering/standards/naming.md)
- Tests are co-located as `<module>.test.ts(x)` beside the module, never in a
  `__tests__` folder. — [naming.md](engineering/standards/naming.md),
  [testing.md](engineering/standards/testing.md)
- Files are lowercase run-together (`roadprofile.ts`); React components are
  `PascalCase.tsx`; only `worker.entry.ts` carries a dot suffix; constants are
  `UPPER_SNAKE_CASE`, and a derived constant is computed from its source
  constant in the same file. — [naming.md](engineering/standards/naming.md)
- Commit subjects use Conventional Commit prefixes; a PR title that will land
  as a merge commit is plain prose with no prefix, or the changelog
  double-counts. Releases are cut by release-please: never hand-tag, never
  hand-edit the package version or the changelog. —
  [commits.md](engineering/standards/commits.md),
  [CONTRIBUTING.md](../CONTRIBUTING.md)
- The version is one number in three files — `package.json`,
  `.release-please-manifest.json`, and the newest heading in `CHANGELOG.md` —
  and they never disagree. release-please writes all three in one commit, so a
  disagreement means someone edited one by hand. The menu shows the version of
  the BUILD, baked from `package.json`, which is why a feature branch behind
  main honestly reads older than the newest release: that is correct, and
  showing the latest release instead would make the menu lie about what is
  running. — `src/shared/contracts.version.test.ts`, `vite.config.ts`
- An accepted decision record is never rewritten beyond typos and links; a
  changed decision gets a new number and the old one is marked superseded.
  Numbers are never reused. — [adr/README.md](engineering/adr/README.md)
- A volatile number (test count, date) lives in one document only; delivery
  status lives in [ROADMAP.md](ROADMAP.md) and "not building" in
  [DESIGN.md](DESIGN.md). Documentation carries one overall version, never
  per-section versioning. — [CONTRIBUTING.md](../CONTRIBUTING.md)
- The gate for every change is typecheck, lint, lint:docs, test and build, in
  that order, and a render change adds a looked-at screenshot. —
  [testing.md](engineering/standards/testing.md),
  [branching.md](engineering/standards/branching.md)
