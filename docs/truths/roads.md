# Truths — Roads, junctions and transit

Back to [the index](../GROUND-TRUTHS.md).


The road model is derived from the published standards in
[Road Guides](../Road%20Guides/README.md) (MUTCD 11th edition, AASHTO, HCM).
MUTCD citations below use 11th-edition section numbers.

- [R-roads-001] A tile carries one road — or two where one passes OVER the other, and only
  there: the road beneath keeps the ordinary road layers, the road passing over
  lives in the over layers, and nothing joins the two. An overpass crosses
  straight over at right angles, clearing the road beneath by 5 m (7 m over
  rail) to its girder's underside; it never turns, ends or has a junction on
  its crossing tile. A road drawn under a road already raised there moves
  the raised one onto the over layer unchanged, and the ground under it is
  never levelled, since that would move the deck above. Rail and street never
  share a tile at grade. —
  [overpasses.md](../world-sim/overpasses.md); `crossingShape` and
  `overpassRise` in `src/shared/overpass.ts`, `roadStep` in
  `src/world/roads.ts`
- [R-roads-002] A road is identified by its tile AND its layer (`RoadKey`); anything that
  counts roads by tile — the graph, masks, the utility and service spreads,
  the approach walk, the renderers — reads the two roads on a crossing tile as
  two. A step onto a crossing tile along the line of its overpass reaches the
  overpass; any other step reaches the road on the tile. —
  [overpasses.md](../world-sim/overpasses.md); `roadStep` in `src/world/roads.ts`
- [R-roads-003] Two road tiles join only at one level: both on the ground, or decks within
  one grade step (`BRIDGE_MAX_GRADE`) of each other, give or take a
  millimetre of float rounding, so a ramp laid at exactly the steepest grade
  still joins. A deck in the air passes beside a road on the ground without
  meeting it. One predicate judges it everywhere. —
  [road-model.md](../world-sim/road-model.md),
  [overpasses.md](../world-sim/overpasses.md); `atOneLevel` in
  `src/shared/overpass.ts`
- [R-roads-004] The ground under a deck is never levelled, but a deck the grade solver
  lifted less than 0.5 m (`GROUND_HUGGING_LIFT_M`) to close a neighbour's
  step is on the ground, not in the air: it is levelled with its run like
  any grounded road tile, or the ground beside it stands proud of the deck. —
  [road-model.md](../world-sim/road-model.md); `GROUND_HUGGING_LIFT_M` in
  `src/sim/worker.entry.ts`
- [R-roads-005] A rail tile between two street tiles
  is a break in the street, not a crossing, and rail laid through a street in
  replace mode severs it: the track draws running straight through and the street ends
  either side, never a crossing box. Level crossings that stop road traffic do
  not exist yet. —
  [road-model.md](../world-sim/road-model.md),
  [transit-model.md](../world-sim/transit-model.md); `isStreetTier` and
  `isRailTier` in `src/shared/types.ts`, `src/world/roads.ts`
- [R-roads-006] The rail and street graphs never share an edge. Every `RoadNetwork` is built
  from one tier predicate (`isStreetTier`, `isRailTier`, `isTramTier`) and
  `edgeTraversable` refuses any edge outside the network being searched; the
  tram network sees every cell of tram track as the tram tier. Rail
  conducts no utility and grants no frontage. —
  [transit-model.md](../world-sim/transit-model.md),
  [pathfinding.md](../world-sim/pathfinding.md); `src/world/pathfind.ts`,
  `tramShape` in `src/world/roadgraph.ts`
- [R-roads-007] Tram track is any street whose profile carries a tram lane — a lane the
  trams share (mixed running) or a reservation of their own — read from the
  tile's profile, never from its tier alone; the Tramway preset is one such
  street. A tram lane composed onto any road is track a tram line can run on.
  Tram track is a street: cars drive it, it carries utilities and frontage, and
  it sits in both graphs. A tram line only ever routes over the tram graph, and
  no line mixes tram and rail track. —
  [transit-model.md](../world-sim/transit-model.md); `isTramTrack` and
  `isTramTile` in `src/shared/roadprofile.ts`
- [R-roads-008] Mixed running stays on the street; a reservation goes up. A road whose
  trams share its lanes runs them at grade. A road that gives its trams a
  reservation carries that reservation on an elevated guideway: two beams
  0.66 × 1.22 m at 3.66 m centres, tops 7.22 m above the road surface, on
  T-columns every 30 m in a 2.4 m median, phased from world-metre zero, never
  in a junction box or on a turn. The guideway passes over every street it
  crosses and never meets one at grade. It ramps to grade over the five tiles
  next to a street tramway. Its trams ride the beams. The road below keeps its
  lanes and draws the reservation as a raised median. —
  [streets.md](../art/streets.md); `computeGuideway` in `src/render/guideway.ts`,
  `carriesGuideway` in `src/shared/roadprofile.ts`
- [R-roads-009] A park is the size the real park type is — a neighbourhood park eight
  acres, a district park forty — and the six-tile siting rule for buildings
  does not apply to open space. A park keeps the ground it is laid on: a
  catalog entry whose `ground` is `drape` is never levelled, and only paving
  and a pitch level theirs. Park coverage takes the best of overlapping parks
  and adds once to land value, never the sum. —
  [parks-and-recreation.md](../game-design/features/parks-and-recreation.md);
  `src/data/catalog.json`, `src/sim/services.ts`
- [R-roads-010] A facility's coverage walks the street network from every road tile within
  reach of its footprint, never from one nearest tile; a park on four streets
  serves from all four. — [services-model.md](../world-sim/services-model.md);
  `src/sim/services.ts`
- [R-roads-011] A tram stop on a guideway tile at full height is a raised station: two side
  platforms at the trams' floor outside the beams, a canopy each, a stair and
  a lift each side down to the footway, derived from the stop and the road
  every rebuild and never saved. The stair lands at the platform's low end
  unless that tile is a crossing street or junction box, when it swaps ends;
  a stair never lands in a junction. No kerb shelter stands under it, and no
  lamp or pole on its tiles; its idlers stand on the platforms, never at the
  kerb where the shelter would be. A stop on a ramp tile, a junction box or
  a turn draws no station; the line serves it all the same. —
  [streets.md](../art/streets.md); `computeTramStations` in
  `src/render/tramstations.ts`
- [R-roads-012] No overpass crosses a guideway, and no guideway passes under an overpass:
  the beams stand 6 to 7.22 m up and an overpass deck 5 m up. The worker
  refuses both, and the tool's preview says so. —
  [overpasses.md](../world-sim/overpasses.md); `src/sim/worker.entry.ts`
- [R-roads-013] A street's track is drawn as a street tramway's is: per tram lane, two
  grooved rails at standard gauge flush in a 2.7 m concrete slab, and no
  sleepers. Only the railway, on its ballast, has sleepers. Contact poles
  stand at the kerb of a street whose trams share its lanes, one every 22 m
  phased from world-metre zero, never in a junction box or a driveway's
  mouth, and a street lamp within 2 m of one is not drawn. —
  [streets.md](../art/streets.md); `emitStreetTrack` in
  `src/render/roadsmesh.ts`, `computeTramPolePlacements` in
  `src/render/roadfurniture.ts`
- [R-roads-014] A tramway crosses a street straight over the junction. A straight run of one
  or two joined street tiles that are not tram track, with tram track joined at
  both ends, is a tram crossing: each tile keeps its own road, the tram graph
  counts it as track along that axis, and the road mesh lays the rails across
  it, unless the track is a guideway, whose beams span it overhead. It is
  derived from the
  tiles every time, never stored, and a tram never turns at one. —
  [transit-model.md](../world-sim/transit-model.md#tram-crossings);
  `tramCrossingAxes` in `src/shared/types.ts`
- [R-roads-015] A road is a class, a profile (its cross-section) and its junctions. Markings,
  furniture, crossings and capacity are derived from those three and never
  authored or stored per tier. — [road-model.md](../world-sim/road-model.md),
  [ADR-0012](../engineering/adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md)
- [R-roads-016] The road network of nodes and segments is where roads are stored: a save
  holds the network and never the road tile layers, which are derived from it
  on load (`deriveRoadLayers`). The grid commands still plan on tiles; after
  every command batch the network takes up the plan (`reconcileRoads`) and the
  layers are derived again (`syncRoadLayers`), after every command, not every
  batch. A tile that derives differently is a conversion bug, reported with
  `console.error`, never kept quietly. The graph never contains a diagonal
  step, and a grid corner's arc is render-only. —
  [ADR-0016](../engineering/adr/0016-roads-are-a-network-of-nodes-and-segments.md),
  [road-network.md](../world-sim/road-network.md), [streets.md](../art/streets.md)
- [R-roads-017] A road off the grid (at an angle, curved, or ending off a tile centre)
  writes no road tile layer. It holds the tiles its whole cross-section
  covers in the derived `roadFootprint` layer, which nothing else is built on
  and no grid drag enters except where the two meet; it meets a grid road
  only at one of its tile centres, which stays a node of the grid; and it
  obeys every geometry rule — radius by class, 30° between roads, six roads a
  junction, 10 m long, never crossing or crowding another road but at a node,
  on dry, unbuilt ground at a road's slope. `planSegment` in
  `src/world/freeroads.ts` is the only place those are checked. —
  [road-network.md](../world-sim/road-network.md); `src/shared/roadgeom.ts`
- [R-roads-018] A grid tile where a road off the grid meets is drawn by one renderer only:
  the free-road junction, whole, with each grid road carried to the tile's
  edge. The tile renderer draws none of its road, and no furniture or lamp the
  tile's own role earned stands on it. Drawn twice, the tile's old corner or
  straight showed through the junction — its kerb across the new road's
  mouth, its corner sign standing in the carriageway. —
  [road-network.md](../world-sim/road-network.md); `freeJunctionTiles` in
  `src/render/freeroadmesh.ts`, `setFreeJunctionTiles` in
  `src/render/roadsmesh.ts`
- [R-roads-019] Never compare a stored `roadFlow` byte to a `RoadFlow` value directly:
  direction is the low three bits (`ROAD_FLOW_DIRECTION_MASK`), bit 3 marks a
  corridor half and bit 4 the half at the HIGH offset. —
  [road-model.md](../world-sim/road-model.md); `src/shared/types.ts`
- [R-roads-020] A section is authored left to right in the direction of travel and laid in
  WORLD order: offsets grow east and south, so a road heading south or west
  has its driver's left at the high offset and its section is turned round
  before it is drawn — and before a corridor is halved, since the halves are
  stored by the side of the road they stand on. Nothing lays a section's
  pieces low-to-high without it; an editor working by the driver's own left or
  right asks which way round the section is. Without it a southbound motorway
  put its wide shoulder against the median and a two-way street drawn south
  drove on the left. — [road-model.md](../world-sim/road-model.md);
  `worldOrderedProfile` and `reversedInWorld` in `src/shared/roadprofile.ts`
- [R-roads-021] A one-way road flows the way it was drawn (its stored flow), never inferred
  from geometry; the geometric fallback exists only for tiles whose flow is
  `RoadFlow.None`. A run's direction is read from its own tiles before its end
  nodes, because a node two one-ways cross holds only the flow of whichever
  was drawn last. — [road-model.md](../world-sim/road-model.md);
  `src/world/pathfind.ts`, `storedRunDirection` in `src/world/roadgraph.ts`
- [R-roads-022] A one-way carriageway — a one-way street, a motorway, a ramp, either half of
  a corridor, any profile whose travel lanes all run one way — is driven only
  the way it flows. A direction the cross-section has no travel lane for is
  never routed, not merely costed high; a run with no recorded flow is gated
  by its spec's `oneWay` and the geometric fallback. —
  [road-model.md](../world-sim/road-model.md#stored-direction-and-one-way-roads);
  `edgeTraversable` in `src/world/pathfind.ts`
- [R-roads-023] Roads replace by class rank (dirt, alley, rural, local, one-way, urban,
  collector, arterial, divided, ramp, highway), never by tier number or catalog
  order. Rail sits outside the ranking: rail never takes a tile from a road nor
  a road from rail, and only replace mode lays one over the other
  (`tierOutranks`, `rankedTogether`). A road with a bus or tram lane outranks the same road
  without one. A drag through a road it does not outrank is refused whole; only
  replace mode overrides. — [road-model.md](../world-sim/road-model.md);
  `CLASS_RANK` in `src/shared/roadprofile.ts`
- [R-roads-024] A road through a standing building is refused whole, by the tool's chip
  ("Overlapping items") and by the world with a reason that names the
  building; it is never laid with the building's tiles left out, since that
  leaves a road in pieces that join nothing and read as one. Water and other
  roads are not in the way. — [road-model.md](../world-sim/road-model.md);
  `ROAD_THROUGH_BUILDING` in `src/sim/worker.entry.ts`, `isClearOfBuildings`
  in `src/app/clientgrid.ts`
- [R-roads-025] A refused drag says why when it is released, not only while it is held: the
  chip's reason is raised as the same notification a refusal from the world
  raises, and nothing is laid. A tool that refuses silently has laid nothing
  and taught nothing. — [interaction.md](../ux/interaction.md);
  `src/tools/tools.ts`
- [R-roads-026] The `RoadTier` byte is a persisted, append-only preset id, not a hierarchy.
  Never use a tier number as rank. — [road-model.md](../world-sim/road-model.md),
  [data-model.md](../engineering/data-model.md)
- [R-roads-027] A motorway (highway class) touches only a highway or a ramp. The rule is an
  accept-list, so a new class stays off the motorway until explicitly admitted.
  A ramp never joins dirt or alley. The worker refuses a `buildRoad` that
  breaks either rule whole, not only the road tool. —
  [road-model.md](../world-sim/road-model.md); `MOTORWAY_MEETS` in
  `src/shared/roadprofile.ts`, `joinRefusalAround` in `src/sim/worker.entry.ts`
- [R-roads-028] A road tile's neighbour mask is derived, never trusted from a save: loading
  recomputes every mask from today's rules, so a rule change reaches old
  cities. — [data-model.md](../engineering/data-model.md);
  `recomputeRoadMasks` in `src/world/roads.ts`
- [R-roads-029] Highway and rail arms never take a junction control — not from the warrant
  and not from a player's override, which is refused. A ramp's motorway end is
  an uncontrolled merge or diverge; its other end is an ordinary warranted
  junction. — [road-model.md](../world-sim/road-model.md);
  `takesControl` in `src/shared/junction.ts`, `cmdSetJunctionControl` in
  `src/sim/worker.entry.ts`
- [R-roads-030] A merge or a diverge is not an intersection. A motorway tile running
  straight through with only ramps beside it (a ramp node) keeps its lane and
  edge lines, grows no junction box and no rounded corners, opens its
  ramp-side edge line only across the ramp's mouth, carries the auxiliary lane
  across itself, and is no junction anything approaches, so nothing is arrowed
  on the way in. Its exit board stands once, on the tile before a ramp that
  leaves. Only a motorway grows an auxiliary lane; a street a ramp ends on
  takes its ordinary approach. Decided once and asked everywhere: the mesh,
  the approach walk and the furniture never count arms for themselves. —
  [road-model.md](../world-sim/road-model.md); `isRampNode` in
  `src/shared/junction.ts`, `isRampNodeAt` in `src/shared/approachzone.ts`
- [R-roads-031] The warrant ladder is none, yield, stop, all-way stop, signal, and it only
  climbs. Roundabout is never a warrant default because it changes geometry. A
  player's control override is never stepped down by a warrant, and the warrant
  is still computed for the inspector. —
  [road-model.md](../world-sim/road-model.md); `src/shared/junction.ts`
- [R-roads-032] Warrants are re-evaluated only on a graph rebuild and once per game day,
  never continuously. Thresholds are stored as volume/capacity fractions that
  restate the MUTCD absolute volumes (500 + 150 veh/h for a signal, 300 + 200
  for an all-way stop), never as veh/h. —
  [systems/traffic.md](../engineering/systems/traffic.md),
  [road-model.md](../world-sim/road-model.md)
- [R-roads-033] Signals run a 60 s cycle (90 s with a dedicated left) on one city-wide clock,
  and the rendered head cycles on that same clock. —
  [road-model.md](../world-sim/road-model.md)
- [R-roads-034] k = 3/7 game-capacity units per veh/h is the one calibration constant between
  the published standards and game units, and it must keep the two-lane preset
  at 600. —
  [ADR-0013](../engineering/adr/0013-traffic-figures-come-from-published-standards.md),
  [road-model.md](../world-sim/road-model.md)
- [R-roads-035] Edge cost is length ÷ speed × (1 + 2·min(1, v/c)) plus the junction delay,
  paid on departure; merge delay applies only from a ramp onto a highway. The
  A\* heuristic stays admissible (Manhattan ÷ `MAX_ROAD_SPEED`) and a junction
  delay is never negative. — [traffic-model.md](../world-sim/traffic-model.md),
  [pathfinding.md](../world-sim/pathfinding.md); `src/world/pathfind.ts`
- [R-roads-036] A\* state is (node, arriving edge), never a bare node id, because turn
  legality and delay depend on the arriving arm. A banned turn is no path, never
  a priced detour, and a U-turn is never offered by default. —
  [pathfinding.md](../world-sim/pathfinding.md); `turnAllowed` in
  `src/world/pathfind.ts`, `src/shared/approach.ts`
- [R-roads-037] A transit stop finds the network through the tile it stands on OR a tile
  beside it: a node within 8 tiles by proximity, else the nearer end of the
  run under it or under one of its four neighbours. A rail station stands
  beside its track, so a stop partway down a block longer than sixteen
  tiles routed to nothing and carried nobody until this was so. A bus stop
  is road furniture on one side of its street tile, never a building on a
  tile of its own: a sign or a shelter on an 8 by 5 ft pad at the outer
  edge of the footway, the footway kept clear, or up to the road where
  there is none,
  placed by its own tool, refused on a junction, a motorway, a ramp, rail or
  a tram reservation; a bus line names only tiles holding a stop, and the
  last stop leaving a tile leaves every line. A shelter with 25 boardings a
  day is warranted and earns its ad income; a sign costs and earns nothing.
  A point two or more tiles from any road is off the network. —
  [transit-model.md](../world-sim/transit-model.md),
  [civic-access-and-bus-stops.md](../game-design/features/civic-access-and-bus-stops.md);
  `nearestNode` in `src/world/roadgraph.ts`, `src/sim/stops.ts`
- [R-roads-038] A line's vehicles are fielded by a depot of its mode over the mode's own
  network, never from nowhere: a bus depot touching a street, a tram depot
  touching tram track (`isTramTile`, the tram graph's own test), a rail yard
  touching the railway, each built
  and powered, fielding all but a spare fifth of what it holds. A mode with no
  depot runs nothing: its lines carry nobody, relieve nothing and say so, and a
  city saved before depots loads that way. Every vehicle in service is charged
  its running cost beside the depot's upkeep. The renderer draws the sim's
  served count at the commercial speed, never a count of its own. —
  [transit-model.md](../world-sim/transit-model.md),
  [transport-depots.md](../engineering/features/transport-depots.md);
  `connectedDepots` in `src/sim/depots.ts`, `allocate` in
  `src/shared/transitfleet.ts`
- [R-roads-039] A line's vehicles come from the nearest depot of its mode by path cost
  from the depot's gate to the line's first stop, spilling to the next when
  it runs dry, and a depot's "in service" is what left it. A bus line's dead
  run loads the road graph exactly twice a clock day — its served vehicles on
  every edge of that path when the clock crosses 05:00 (pull-out) and again
  at 23:00 (pull-in), and never between — and its buses are sim-animated
  along it, never drawn by the renderer; the renderer hides the loop outside
  the 05:00–23:00 span. Tram and rail dead runs load nothing and animate
  nothing. The dead-run path is cached per line and recomputed only when the
  route, the depots or the graph under it change; a cached edge id is never
  trusted across a graph rebuild. —
  [transit-model.md](../world-sim/transit-model.md),
  [transport-depots.md](../engineering/features/transport-depots.md);
  `assign` and `crossings` in `src/sim/transit.ts`, `src/sim/deadruns.ts`,
  `inServiceSpan` in `src/shared/transitfleet.ts`
- [R-roads-040] Any grid edit invalidates the whole road graph and reassigns every node and
  edge id. Never persist an edge or node id across an edit. Tram-graph edge ids
  are a private numbering, and tram relief is recomputed over the road graph. —
  [pathfinding.md](../world-sim/pathfinding.md),
  [systems/traffic.md](../engineering/systems/traffic.md),
  [transit-model.md](../world-sim/transit-model.md)
- [R-roads-041] Traffic and pathfinding draw no RNG: route jitter is a pure hash of origin
  and destination. Cosmetic vehicles never feed back into the sim. —
  [systems/traffic.md](../engineering/systems/traffic.md),
  [ADR-0001](../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
- [R-roads-042] The tile is the 20 m width budget. A profile wider than one tile becomes a
  two-tile corridor only when the class's own largest road needs one, otherwise
  it is refused with a reason; a corridor is a straight run and a bend is
  refused. — [road-model.md](../world-sim/road-model.md); `src/shared/corridor.ts`
- [R-roads-043] A reserved bus or bike lane always costs a general lane, and a bus lane
  counts against the class's lane range; lanes are never dropped silently to
  fit. A tram reservation is a guideway over a 2.4 m median: it costs the
  road a median, not a lane, and its tracks count against no lane range. A
  guideway track is priced at 2.25 times a street track. —
  [road-model.md](../world-sim/road-model.md); `laneCount` and `roadPriceOf` in
  `src/shared/roadprofile.ts`
- [R-roads-044] Yellow marks the side of a line that oncoming traffic is on, adjacent or
  not. On an undivided road that is the centre line. On a **one-way
  carriageway — a motorway, a ramp, a one-way street, either half of a
  divided road — the LEFT edge line is solid yellow and the right is solid
  white** (MUTCD §3B.09 ¶02–03); lane lines between same-direction lanes are
  broken white (§3B.06 ¶05). Every paved road carries edge lines; dirt, alley
  and rail carry no paint; one-way, highway and ramp paint no centre line. —
  [road-model.md](../world-sim/road-model.md); `src/render/roadmarkings.ts`
- [R-roads-045] An edge line is broken only across the mouth of a road that joins. On a
  junction tile, every side with no arm keeps its edge line for the tile's
  full length, so the far side of a T is unbroken (MUTCD 3B.09 ¶07, 3B.11
  ¶07–08). Between two arms, the edge line follows the kerb return, bending
  from one arm's inset to the other's. — [road-model.md](../world-sim/road-model.md);
  `src/render/roadsmesh.ts`
- [R-roads-046] A bike lane lies between two white lines: the solid bike-lane line on the
  travel side, and on the other the edge line or the parking lane line, or
  the kerb where one bounds it (MUTCD 9E.01, 9E.02). Green is only a
  supplement inside those lines (3H.06): never under a line, past one, or off
  the pavement. — [road-model.md](../world-sim/road-model.md);
  `src/render/roadmarkings.ts`
- [R-roads-047] A parking lane's travel side is its solid white parking lane line, and no
  edge line runs inside the lane. Its stall marks are white ticks from that
  line toward the kerb (MUTCD 3B.27), inside the lane and never past the
  pavement. Stalls are 6.7 m (22 ft) long, and the stall nearest a junction is
  6.1 m (20 ft); no marked stall is shorter than 6.1 m or longer than 7.9 m
  (26 ft). Where the pitch leaves an odd length beside the end stall, the end
  stall takes it up to 7.9 m and beyond that the no-parking zone grows, never
  a stall. A car on a painted parking lane stands one to a stall, centred in
  it. No stall is marked and no car parks within 9.1 m (30 ft) of a
  stop line or signal, or within 6.1 m (20 ft) of a crosswalk or of the
  junction mouth where there is no crosswalk, on either side of the junction
  (UVC §11-1003). — [road-model.md](../world-sim/road-model.md);
  `src/shared/kerbstalls.ts`, `src/shared/kerblayout.ts`, `src/render/parked.ts`
- [R-roads-048] A parking lane is parallel, angled or head-in, and the style is part of
  the road's profile (a field on its parking piece, parallel when absent), so
  an old save reads as it was. The stall is 2.6 × 5.5 m (8.5 × 18 ft). An
  angled lane parks at 60° for backing in: the lane is 6.0 m deep, one stall
  per 3.0 m of kerb, and each stall's kerb end lies upstream of its travel
  end, so a car leaves nose-first with the flow. A head-in lane parks at 90°:
  5.5 m deep, one stall per 2.6 m. The deeper lane counts against the tile's
  width like any piece, and the road tool refuses a profile that does not
  fit. An angled or head-in stall is marked only where its whole footprint
  stands clear of the no-parking zones. — [road-model.md](../world-sim/road-model.md);
  `src/shared/roadprofile.ts`, `src/shared/kerbstalls.ts`
- [R-roads-049] Every block face that marks stalls and has room for an accessible one
  marks accessible ones, to PROWAG R211:
  1 for 1–25 stalls, 2 for 26–50, 3 for 51–75, 4 for 76–100, 5 for 101–150,
  6 for 151–200, and 4% beyond that. They stand at the end of the block face
  nearest a crosswalk, or nearest a junction where there is none. A parallel
  one is 7.3 m (24 ft) long (R310.2.1); an angled one is 3.35 m (11 ft) wide
  with a 1.5 m (5 ft) aisle (R310.4); a head-in one has a 2.4 m (8 ft) aisle
  (R310.3). The aisle is on the passenger side and hatched white. Each one
  carries the International Symbol of Accessibility on a blue square
  (MUTCD 3B.22 ¶08–09), drawn as geometry. — [road-model.md](../world-sim/road-model.md);
  `src/shared/kerbstalls.ts`, `src/render/roadsmesh.ts`
- [R-roads-050] The kerb stall layout and its no-parking zones are computed in one shared
  module that the renderer and the sim both call, each reading the roads
  through a `KerbSurroundings` built by the same `roadSurroundings`; the sim
  never infers stalls another way. Every input is grid state (the road tiles,
  the profile table, the junction controls), never anything only the mesh
  knows, and nothing off the map: a lookup past the edge finds no road on
  either thread. — [parking-to-code.md](../engineering/features/parking-to-code.md);
  `src/shared/kerblayout.ts`, `src/sim/kerbsurroundings.ts`
- [R-roads-051] A motorway is ONE carriageway, not a road with two halves. Highway and ramp
  are the only classes whose lane range counts a single direction, they admit
  no median piece, and a dual carriageway is two runs laid side by side and
  widened independently. A motorway too wide for a tile is still one
  carriageway: its two tiles draw one unbroken road, each half pushed against
  the edge they share, with no edge line, kerb or furniture on it — never two
  carriageways centred on their tiles (`seam` in `corridorHalfProfile`,
  `carriagewayShiftOf` in `src/shared/roadprofile.ts`). Any corridor with no
  median or barrier at its middle is drawn the same way. No corner, kerb,
  crossing or stop line stands on the shared edge, and nothing kerbside is
  seated there. A corridor half's partner is not an arm of it to the road
  furniture or the lamps either: they ask `isSeparateRoad`
  (`src/shared/approachzone.ts`), the approach walk's own predicate, so a
  corridor is lit and signed along its outer kerbs. —
  [road-model.md](../world-sim/road-model.md); `src/data/roads.json`
- [R-roads-052] Half of a two-way corridor carries one direction. Where its lanes are the
  road's `back` lanes, they run against the way its tile was drawn, and they
  arrive at a junction from the other end. The arrows, the stop line and the
  turn bay follow the lanes, never the drawn flow alone
  (`runsAgainstDrawing` in `src/shared/roadprofile.ts`). A stop line crosses
  only the lanes arriving; an arm on which none arrive gets no bar, and no
  stop board, give-way board or signal head either. The road graph drives a
  half only the way its own lanes run: it reads the half's section, never the
  whole road's, whose lanes run both ways (`runFacts` in
  `src/world/roadgraph.ts`). —
  [road-model.md](../world-sim/road-model.md)
- [R-roads-053] Two motorway carriageways may lie on adjacent tiles and never connect. A
  highway tile is not an arm of a highway lying across its stored flow when
  each lies across the other's — no mask bit, no graph edge, no junction — so
  the pair never merges into one unpainted slab that traffic drifts sideways
  across. The only way onto or off a motorway is a ramp, which joins it where
  it merges or diverges (below). A motorway in line joins; one arriving
  square-on is a junction. It is decided in the grid, never refused by the road tool, so it
  holds however the roads were drawn. The mask, the graph, the approach walk
  and the road furniture all read the one predicate, so what is drawn, what is
  driven and what is signed cannot disagree — counted as an arm anywhere, a
  second carriageway took every gantry off the first. —
  [road-model.md](../world-sim/road-model.md); `sideBySideCarriageways` in
  `src/shared/corridor.ts`
- [R-roads-054] A corridor's two halves never join along the road, except on a row where a
  street crosses it: a road that is not a corridor half joining each half from
  outside, in line across it, opens the median there, and the halves join
  across that row as two junctions side by side. On a corridor nothing divides
  (no median or barrier at its middle, `isDividedCorridor`), one street joining
  either half from outside is enough, so a T onto it is a full junction and
  holds the far half too; a divided corridor's T stays right-in, right-out. It
  is derived from the tiles and the profile table, never stored, and the mask,
  the approach walk and the furniture ask the same predicate. —
  [road-model.md](../world-sim/road-model.md); `medianOpens` in
  `src/shared/corridor.ts`
- [R-roads-055] A corridor's two halves are one road. A road laid over a corridor half
  takes that half's partner with it, as its partner, or it is refused; it
  never leaves half a road with nothing beside it. The road tool and the world
  ask the same predicate. The ghost draws each half where it will be laid. A
  bulldoze over one half takes its partner too, on the layer it takes the
  first from, and the preview outlines both; the tool and the world ask
  `bulldozeReach` for it. —
  [road-model.md](../world-sim/road-model.md); `corridorSplitRefusal` and
  `bulldozeReach` in `src/shared/corridor.ts`
- [R-roads-056] A sound wall is a piece of a motorway's or ramp's own cross-section, never
  a separate structure, and only those two classes admit it. Which tile edge
  it stands on is read off the road's own section in world order by one
  function for the noise field and the renderer alike; where across the tile
  follows the drawn section, so an auxiliary lane runs inside the wall, the
  hard shoulder narrowing to 1.2 m at the least to make its room. It stands
  only on an edge no arm leaves by. It cuts
  noise by its insertion loss, 5 dB plus 1.5 dB a metre above 3 m (FHWA),
  never blocks it outright, and cuts nothing else. A wall that would overrun
  its tile, or one on a road off the grid, is refused. —
  [road-model.md](../world-sim/road-model.md#sound-walls); `soundWallsAt` in
  `src/shared/soundwallsites.ts`
- [R-roads-057] Two neighbouring grid road tiles are joined exactly when the network links
  them. A road laid with snapping off (`buildRoad` with `join: false`) joins
  nothing it only lies beside or ends against, and still joins where it
  crosses or overlaps a road on the same level; laid with it on, it joins
  everything its tiles touch, a road held apart before included. The
  held-apart arms are a derived layer (`roadSeparate`), recomputed from the
  network and never saved, holding only arms the other rules would join;
  `isSeparateRoad`, the approach walk and the road furniture read it, so
  every system keeps the two roads apart. An undo puts back exactly what was
  held apart: a command that lays over or takes away a road hands the arms
  back in its inverse (`apart`). —
  [road-model.md](../world-sim/road-model.md),
  [interaction.md](../ux/interaction.md#snapping-to-roads); `settleArms` in
  `src/world/roads.ts`, `separateUnlinked` in `src/world/roadnet.ts`
- [R-roads-058] The road tool's `Roads` snap toggle, on by default, is the only thing that
  decides whether a new road snaps and joins. On, a road end within half a
  tile of the cursor takes the drag — a node at most one road leaves, never a
  junction — ahead of every other snap, for grid drags and roads off the grid
  alike. Off, nothing snaps (no node, road end, centre line or tile centre, no
  bend pulled into line, no split) and every `buildRoad` is sent with
  `join: false`. Guide snapping is its own toggle and works either way. —
  [interaction.md](../ux/interaction.md#snapping-to-roads); `nearestRoadEnd` in
  `src/world/freeroads.ts`
- [R-roads-059] With snapping to roads on, a grid drag starting or ending on a road off
  the grid's end moves that end onto its tile's centre in the same undo step,
  or is refused with the reason in the preview. The move is its own command
  (`moveSegmentEnd`, free, its inverse the move back), sent ahead of the grid
  road; the world plans it with the road's old self taken away, and the
  preview judges the grid road against the world as the move leaves it, with
  the same function. — [interaction.md](../ux/interaction.md#snapping-to-roads);
  `moveRoadEnd` and `gridRunRefusalAfter` in `src/world/freeroads.ts`
- [R-roads-060] A grid drag into ground a road off the grid holds, anywhere but a tile
  centre where the two meet, is refused in the preview with the world's own
  sentence, never shown valid and refused after release. One predicate
  decides it for the world's `buildRoad` and for the tool's preview against
  the mirror. — [interaction.md](../ux/interaction.md#snapping-to-roads);
  `gridRunRefusal` in `src/world/freeroads.ts`
- [R-roads-061] A ramp meets a motorway alongside it, never head-on. It elbows round to run
  beside the motorway the way it goes and joins at one tile: an on-ramp at its
  END (a ramp arriving, none ahead), an off-ramp at its START (a ramp ahead,
  none arriving) — read from stored flows, never from shape, which is how an
  elbow beside the motorway joins nothing. Everywhere else beside it the ramp
  is its own road. A ramp that would join across the motorway or against it is
  refused whole, by the road tool and again by the worker, with a reason
  saying what to do (`rampMeetingRefusal`); a save that already holds one
  keeps it connected. The player marks a ramp's two ends and the tool bends
  it: an L-path ramp is laid in whichever leg order joins, so the elbow lands
  beside the motorway; it still flows the way it was drawn and is never
  turned round to run with the traffic. A ramp's street
  end is a junction on the street, never a tile of it: a drag ended on a
  street tile stops one short, and a ramp never replaces a street tile. The join tile draws as a taper into
  the motorway — the lane narrowing to nothing against its edge — never as a
  corner, and the motorway's edge line opens over the downstream half at a
  merge and the upstream half at a diverge. — [road-model.md](../world-sim/road-model.md);
  `rampJoin` and `rampJoinAround` in `src/shared/corridor.ts`, `rampMouthAt`
  in `src/shared/approachzone.ts`, `emitRampTaper` in `src/render/roadsmesh.ts`
- [R-roads-062] An interchange is only the roads it lays, sent as one batch of ordinary
  road commands with every height given exactly: nothing of the interchange
  is stored. A ramp is laid at ground level, and a stamp's street is laid out
  above sea level, so neither is left to a solver that could join it to the
  wrong road. The tool refuses before sending anything the world would refuse
  partway. — [interchanges](../engineering/features/interchanges.md);
  `src/shared/interchange.ts`
- [R-roads-063] A two-way road's lane drop closes both directions' kerbside lanes together,
  after taking an uneven road down to even, so its centre line runs straight
  down the taper. A road whose lanes all run one way closes the driver's
  right-hand lane first. — [road-model.md](../world-sim/road-model.md);
  `taperedCrossSection` in `src/shared/taper.ts`
- [R-roads-064] A road's edge never steps where its width changes; it bends. A lane drop
  closes over a taper that begins at full width, never part-closed, and a
  wide run shorter than its class's taper closes over the length it has, so
  its kerb never steps where it leaves a junction. A ramp node carries its
  auxiliary lane in full only over the half of the tile the ramp joins over,
  and bends to the plain motorway over the other half. —
  [road-model.md](../world-sim/road-model.md); `narrowingAhead` in
  `src/shared/approachzone.ts`, `roadTileVertices` in `src/render/roadsmesh.ts`
- [R-roads-065] A road tapers only into more of itself. A lane reduction happens away from a
  junction (MUTCD 3B.12 ¶01), so a road keeps its full width up to the mouth
  of any junction it meets and never narrows toward the road it crosses,
  however much narrower that road is. The junction mouth is drawn at each
  arm's own width, footways or not, and the corner rounds between the two at
  the kerb return. The side of a T that has no arm carries the through
  arms' width across the tile — its footway and its edge line ease from the
  one arm's edge to the other's — never the junction tile's own section,
  which a turn bay or an auxiliary lane on the arms has outgrown. Along one
  road, the pieces that end close over the taper
  and the pieces that carry on keep their width: a lane drop never squeezes
  the lanes that remain. The paint follows the pavement: lines and coloured
  lanes bend with the edge across a tile and never step at a seam. —
  [road-model.md](../world-sim/road-model.md); `narrowingAhead` in
  `src/shared/approachzone.ts`, `taperedCrossSection` in `src/shared/taper.ts`
- [R-roads-066] A sign faces the traffic it serves (MUTCD §2A.17 ¶01), and its facing comes
  from the direction of approaching traffic, not from the roadway edge it
  stands on (§2A.17 ¶02). On a one-way carriageway — a motorway, a ramp, a
  one-way street — both kerbs carry the same stream, so every board and every
  gantry faces back against the tile's stored flow; only a two-way road takes
  its facing from which kerb the board is on. A cantilever (signal, exit
  board) has its face welded to its arm, on local −Z, so it faces its drivers
  only from their right: a signal stands on the approaching driver's right,
  and a one-way carriageway's exit stands right of the flow or not at all.
  The placement decides the facing and the renderer applies it, never
  recomputing one of its own. — [streets.md](../art/streets.md);
  `CANTILEVER_FACE_Z`, `cantileverSide`, `flowFacingYaw` and
  `signWorldTransform` in `src/render/roadfurniture.ts`
- [R-roads-067] A manhole cover is the top of a sewer and is drawn only on a road whose
  class carries water: a street's main is also its sewer, which is why a
  drain reaches along the same roads a tower does. A motorway and a ramp
  carry none, so they carry no covers; the test is the water flag, never a
  tier list. — [road-model.md](../world-sim/road-model.md); `src/render/roadfurniture.ts`
- [R-roads-068] A broken line is 3.05 m of paint and a 9.15 m gap (a 12.2 m period), 0.15 m
  wide, with its phase anchored at world metre 0 across every seam. —
  [road-model.md](../world-sim/road-model.md); `src/render/roadsmesh.ts`
- [R-roads-069] Turn arrows exist only where a lane's resolved movement set says the movement
  exists, and a single-lane approach is unmarked (MUTCD 3D.06 ¶01). Every
  arrow is the _Standard Highway Signs_ size the MUTCD points to (§3B.20 ¶05):
  a through arrow 2.90 m, a turn arrow 2.44 m, turn and through 3.89 m, stems
  0.30 m, never wider than its lane. Gore
  hatching slants away from the adjacent traffic (MUTCD 3B.25 ¶08–09). —
  [road-model.md](../world-sim/road-model.md)
- [R-roads-070] A roundabout carries a yield line of white triangles pointing at approaching
  traffic on every entry (MUTCD 3B.19 ¶10) and a YIELD sign on every approach
  (MUTCD 2B.10 ¶06); it is the only junction where a yield faces every approach.
  No stop bar, crosswalk or centre line runs through it, and the edge line never
  crosses an exit (MUTCD 3D.03). — [road-model.md](../world-sim/road-model.md)
- [R-roads-071] A compact roundabout is the roundabout control stored on all four tiles of a
  2×2 block of street tiles on the ground, joined round the square, and
  nothing else is stored. One predicate decides it for the worker, the graph
  and the mirror; four coded tiles no longer joined are no roundabout, and
  read as no override. The ring is one thing: no control, turn or lane
  restriction is set on one of its tiles alone, bulldozing any of its tiles
  takes the whole roundabout out, and undo puts it back. It is driven only
  anticlockwise, on the circle, and only a driver arriving on a leg pays its
  delay. — [road-model.md](../world-sim/road-model.md); `roundaboutBlockOf` in
  `src/shared/roundabout.ts`
- [R-roads-072] A roundabout entry, mini or compact, carries the HCM's single-lane entry
  capacity, `1,380 · e^(−0.00102 · v_c)` veh/h, against the traffic
  circulating in front of it, never a fixed share of its road's. That
  conflicting flow is the ring traffic carrying on past the entry on a compact
  roundabout, and is worked out from the other legs' arrivals on a mini one,
  each car bound for each other leg alike. The delay curve reads the entry's
  v/c against that capacity. — [road-model.md](../world-sim/road-model.md);
  `roundaboutEntryCapacity` in `src/shared/junction.ts`
- [R-roads-073] Crosswalks are derived (footway present, arm below top rank), lie against the
  kerb line, are as deep as the footway but never under 1.8 m (MUTCD 3C.03
  ¶05), and the stop line sits at least 1.2 m in advance of the crossing (MUTCD
  3B.19 ¶13). Never over an alley mouth. —
  [road-model.md](../world-sim/road-model.md); `src/render/roadsmesh.ts`
- [R-roads-074] An alley is an access, not a leg: no turn bay, no swept footway, no crossing
  at its mouth. A dirt track is a leg. —
  [road-model.md](../world-sim/road-model.md)
- [R-roads-075] A turn bay exists only where the junction's control holds that road. A
  short block's shared centre turn lane stands in for two bays, so it appears
  only where BOTH junctions would give the road one: never on a two-lane
  street running through side streets that give way to it. —
  [road-model.md](../world-sim/road-model.md); `armWarrant` and
  `sharedTurnLaneAt` in `src/shared/approachzone.ts`
- [R-roads-076] A road levels its footprint and a one-tile apron, and past a dead end the
  levelling runs out two tiles, each run-out cell taking the height of the
  end or apron cell behind it, held at or below the end tile and never a cell
  a road, a building or water owns: a wide road's turning head reaches past
  its tile and stands on that ground. A rendered corner is the mean of the
  four cells meeting there, never one tile's own height. —
  [terrain.md](../visual-render/terrain.md); `computeRoadGradePatch` in
  `src/sim/worker.entry.ts`, `cornerHeight` in `src/render/terrain.ts`
- [R-roads-077] The grade solver reads a drag as contiguous runs and solves each on its
  own ground; the two halves of a corridor, which the road tool lays in one
  command, take the higher of their lifts at each station, so they are on
  the ground together or on decks together. — [terrain.md](../visual-render/terrain.md);
  `solveElevationProfile` and `shareCorridorLifts` in `src/world/bridges.ts`
- [R-roads-078] A turn bay never narrows its road. On a tile where the bay is partly open,
  the road gives up only what the opened bay needs beyond the tile's spare
  width: the parking or shoulder narrows over the taper, and the through
  lanes narrow with it, so the carriageway is never narrower than the plain
  road's anywhere along the bay. A parking lane narrowed below its own width
  is a kerb strip, with no stalls, cars or meters. Whatever the full bay
  decides holds at the junction unchanged. — [road-model.md](../world-sim/road-model.md);
  `withTurnPocket` in `src/shared/roadprofile.ts`
- [R-roads-079] A lot's drive, walk and yard are laid to the street as it is drawn,
  turn bay included, and are re-laid when a junction gains or loses its bay or a road edit
  beside them redraws the street;
  the section without the bay puts a drive across the widened carriageway.
  Kerb-parked cars read the same drawn section: where a bay has taken the
  parking, no car stands, rather than a row at the plain section's offset
  held off only by the junction's no-parking zone. —
  [buildings.md](../art/buildings.md#residential-lots); `drawnProfileAt` in
  `src/app/clientgrid.ts`
- [R-roads-080] Bridges are ordinary road tiles plus an elevation layer, never a second
  network. One deck height per road on a tile — the road on it, and at a
  crossing the road passing over it — no tunnels, no third level, and an
  elevated tile, or an overpass, grants no zoning frontage. —
  [road-model.md](../world-sim/road-model.md),
  [constraints.md](../engineering/constraints.md)

