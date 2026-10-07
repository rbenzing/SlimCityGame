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

- A tile carries one road — or two where one passes OVER the other, and only
  there: the road beneath keeps the ordinary road layers, the road passing over
  lives in the over layers, and nothing joins the two. An overpass crosses
  straight over at right angles, clearing the road beneath by 5 m (7 m over
  rail) to its girder's underside; it never turns, ends or has a junction on
  its crossing tile. A road drawn under a road already raised there moves
  the raised one onto the over layer unchanged, and the ground under it is
  never levelled, since that would move the deck above. Rail and street never
  share a tile at grade. —
  [overpasses.md](world-sim/overpasses.md); `crossingShape` and
  `overpassRise` in `src/shared/overpass.ts`, `roadStep` in
  `src/world/roads.ts`
- A road is identified by its tile AND its layer (`RoadKey`); anything that
  counts roads by tile — the graph, masks, the utility and service spreads,
  the approach walk, the renderers — reads the two roads on a crossing tile as
  two. A step onto a crossing tile along the line of its overpass reaches the
  overpass; any other step reaches the road on the tile. —
  [overpasses.md](world-sim/overpasses.md); `roadStep` in `src/world/roads.ts`
- Two road tiles join only at one level: both on the ground, or decks within
  one grade step (`BRIDGE_MAX_GRADE`) of each other, give or take a
  millimetre of float rounding, so a ramp laid at exactly the steepest grade
  still joins. A deck in the air passes beside a road on the ground without
  meeting it. One predicate judges it everywhere. —
  [road-model.md](world-sim/road-model.md),
  [overpasses.md](world-sim/overpasses.md); `atOneLevel` in
  `src/shared/overpass.ts`
- A rail tile between two street tiles
  is a break in the street, not a crossing, and rail laid through a street in
  replace mode severs it: the track draws running straight through and the street ends
  either side, never a crossing box. Level crossings that stop road traffic do
  not exist yet. —
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
- A tramway crosses a street straight over the junction. A straight run of one
  or two joined street tiles that are not tram track, with tram track joined at
  both ends, is a tram crossing: each tile keeps its own road, the tram graph
  counts it as track along that axis, and the road mesh lays the rails across
  it. It is derived from the
  tiles every time, never stored, and a tram never turns at one. —
  [transit-model.md](world-sim/transit-model.md#tram-crossings);
  `tramCrossingAxes` in `src/shared/types.ts`
- A road is a class, a profile (its cross-section) and its junctions. Markings,
  furniture, crossings and capacity are derived from those three and never
  authored or stored per tier. — [road-model.md](world-sim/road-model.md),
  [ADR-0012](engineering/adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md)
- The road network of nodes and segments is where roads are stored: a save
  holds the network and never the road tile layers, which are derived from it
  on load (`deriveRoadLayers`). The grid commands still plan on tiles; after
  every command batch the network takes up the plan (`reconcileRoads`) and the
  layers are derived again (`syncRoadLayers`), after every command, not every
  batch. A tile that derives differently is a conversion bug, reported with
  `console.error`, never kept quietly. The graph never contains a diagonal
  step, and a grid corner's arc is render-only. —
  [ADR-0016](engineering/adr/0016-roads-are-a-network-of-nodes-and-segments.md),
  [road-network.md](world-sim/road-network.md), [streets.md](art/streets.md)
- A road off the grid (at an angle, curved, or ending off a tile centre)
  writes no road tile layer. It holds the tiles its whole cross-section
  covers in the derived `roadFootprint` layer, which nothing else is built on
  and no grid drag enters except where the two meet; it meets a grid road
  only at one of its tile centres, which stays a node of the grid; and it
  obeys every geometry rule — radius by class, 30° between roads, six roads a
  junction, 10 m long, never crossing or crowding another road but at a node,
  on dry, unbuilt ground at a road's slope. `planSegment` in
  `src/world/freeroads.ts` is the only place those are checked. —
  [road-network.md](world-sim/road-network.md); `src/shared/roadgeom.ts`
- A grid tile where a road off the grid meets is drawn by one renderer only:
  the free-road junction, whole, with each grid road carried to the tile's
  edge. The tile renderer draws none of its road, and no furniture or lamp the
  tile's own role earned stands on it. Drawn twice, the tile's old corner or
  straight showed through the junction — its kerb across the new road's
  mouth, its corner sign standing in the carriageway. —
  [road-network.md](world-sim/road-network.md); `freeJunctionTiles` in
  `src/render/freeroadmesh.ts`, `setFreeJunctionTiles` in
  `src/render/roadsmesh.ts`
- Never compare a stored `roadFlow` byte to a `RoadFlow` value directly:
  direction is the low three bits (`ROAD_FLOW_DIRECTION_MASK`), bit 3 marks a
  corridor half and bit 4 the half at the HIGH offset. —
  [road-model.md](world-sim/road-model.md); `src/shared/types.ts`
- A section is authored left to right in the direction of travel and laid in
  WORLD order: offsets grow east and south, so a road heading south or west
  has its driver's left at the high offset and its section is turned round
  before it is drawn — and before a corridor is halved, since the halves are
  stored by the side of the road they stand on. Nothing lays a section's
  pieces low-to-high without it; an editor working by the driver's own left or
  right asks which way round the section is. Without it a southbound motorway
  put its wide shoulder against the median and a two-way street drawn south
  drove on the left. — [road-model.md](world-sim/road-model.md);
  `worldOrderedProfile` and `reversedInWorld` in `src/shared/roadprofile.ts`
- A one-way road flows the way it was drawn (its stored flow), never inferred
  from geometry; the geometric fallback exists only for tiles whose flow is
  `RoadFlow.None`. A run's direction is read from its own tiles before its end
  nodes, because a node two one-ways cross holds only the flow of whichever
  was drawn last. — [road-model.md](world-sim/road-model.md);
  `src/world/pathfind.ts`, `storedRunDirection` in `src/world/roadgraph.ts`
- A one-way carriageway — a one-way street, a motorway, a ramp, either half of
  a corridor, any profile whose travel lanes all run one way — is driven only
  the way it flows. A direction the cross-section has no travel lane for is
  never routed, not merely costed high; a run with no recorded flow is gated
  by its spec's `oneWay` and the geometric fallback. —
  [road-model.md](world-sim/road-model.md#stored-direction-and-one-way-roads);
  `edgeTraversable` in `src/world/pathfind.ts`
- Roads replace by class rank (dirt, alley, rural, local, one-way, urban,
  collector, arterial, divided, ramp, highway), never by tier number or catalog
  order. Rail sits outside the ranking: rail never takes a tile from a road nor
  a road from rail, and only replace mode lays one over the other
  (`tierOutranks`, `rankedTogether`). A road with a bus or tram lane outranks the same road
  without one. A drag through a road it does not outrank is refused whole; only
  replace mode overrides. — [road-model.md](world-sim/road-model.md);
  `CLASS_RANK` in `src/shared/roadprofile.ts`
- A road through a standing building is refused whole, by the tool's chip
  ("Overlapping items") and by the world with a reason that names the
  building; it is never laid with the building's tiles left out, since that
  leaves a road in pieces that join nothing and read as one. Water and other
  roads are not in the way. — [road-model.md](world-sim/road-model.md);
  `ROAD_THROUGH_BUILDING` in `src/sim/worker.entry.ts`, `isClearOfBuildings`
  in `src/app/clientgrid.ts`
- The `RoadTier` byte is a persisted, append-only preset id, not a hierarchy.
  Never use a tier number as rank. — [road-model.md](world-sim/road-model.md),
  [data-model.md](engineering/data-model.md)
- A motorway (highway class) touches only a highway or a ramp. The rule is an
  accept-list, so a new class stays off the motorway until explicitly admitted.
  A ramp never joins dirt or alley. The worker refuses a `buildRoad` that
  breaks either rule whole, not only the road tool. —
  [road-model.md](world-sim/road-model.md); `MOTORWAY_MEETS` in
  `src/shared/roadprofile.ts`, `joinRefusalAround` in `src/sim/worker.entry.ts`
- A road tile's neighbour mask is derived, never trusted from a save: loading
  recomputes every mask from today's rules, so a rule change reaches old
  cities. — [data-model.md](engineering/data-model.md);
  `recomputeRoadMasks` in `src/world/roads.ts`
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
- A transit stop finds the network through the tile it stands on OR a tile
  beside it: a node within 8 tiles by proximity, else the nearer end of the
  run under it or under one of its four neighbours. A bus stop never stands on
  the street but on the kerb tile beside it, so a stop partway down a block
  longer than sixteen tiles routed to nothing and carried nobody until this
  was so. A point two or more tiles from any road is off the network. —
  [transit-model.md](world-sim/transit-model.md); `nearestNode` in
  `src/world/roadgraph.ts`
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
  [road-model.md](world-sim/road-model.md); `src/data/roads.json`
- Half of a two-way corridor carries one direction. Where its lanes are the
  road's `back` lanes, they run against the way its tile was drawn, and they
  arrive at a junction from the other end. The arrows, the stop line and the
  turn bay follow the lanes, never the drawn flow alone
  (`runsAgainstDrawing` in `src/shared/roadprofile.ts`). A stop line crosses
  only the lanes arriving; an arm on which none arrive gets no bar, and no
  stop board, give-way board or signal head either. The road graph drives a
  half only the way its own lanes run: it reads the half's section, never the
  whole road's, whose lanes run both ways (`runFacts` in
  `src/world/roadgraph.ts`). —
  [road-model.md](world-sim/road-model.md)
- Two motorway carriageways may lie on adjacent tiles and never connect. A
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
  [road-model.md](world-sim/road-model.md); `sideBySideCarriageways` in
  `src/shared/corridor.ts`
- A corridor's two halves never join along the road, except on a row where a
  street crosses it: a road that is not a corridor half joining each half from
  outside, in line across it, opens the median there, and the halves join
  across that row as two junctions side by side. On a corridor nothing divides
  (no median or barrier at its middle, `isDividedCorridor`), one street joining
  either half from outside is enough, so a T onto it is a full junction and
  holds the far half too; a divided corridor's T stays right-in, right-out. It
  is derived from the tiles and the profile table, never stored, and the mask,
  the approach walk and the furniture ask the same predicate. —
  [road-model.md](world-sim/road-model.md); `medianOpens` in
  `src/shared/corridor.ts`
- A corridor's two halves are one road. A road laid over a corridor half
  takes that half's partner with it, as its partner, or it is refused; it
  never leaves half a road with nothing beside it. The road tool and the world
  ask the same predicate. The ghost draws each half where it will be laid. A
  bulldoze over one half takes its partner too, on the layer it takes the
  first from, and the preview outlines both; the tool and the world ask
  `bulldozeReach` for it. —
  [road-model.md](world-sim/road-model.md); `corridorSplitRefusal` and
  `bulldozeReach` in `src/shared/corridor.ts`
- A sound wall is a piece of a motorway's or ramp's own cross-section, never
  a separate structure, and only those two classes admit it. Which tile edge
  it stands on is read off the road's own section in world order by one
  function for the noise field and the renderer alike; where across the tile
  follows the drawn section, so an auxiliary lane runs inside the wall, the
  hard shoulder narrowing to 1.2 m at the least to make its room. It stands
  only on an edge no arm leaves by. It cuts
  noise by its insertion loss, 5 dB plus 1.5 dB a metre above 3 m (FHWA),
  never blocks it outright, and cuts nothing else. A wall that would overrun
  its tile, or one on a road off the grid, is refused. —
  [road-model.md](world-sim/road-model.md#sound-walls); `soundWallsAt` in
  `src/shared/soundwallsites.ts`
- Two neighbouring grid road tiles are joined exactly when the network links
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
  [road-model.md](world-sim/road-model.md),
  [interaction.md](ux/interaction.md#snapping-to-roads); `settleArms` in
  `src/world/roads.ts`, `separateUnlinked` in `src/world/roadnet.ts`
- The road tool's `Roads` snap toggle, on by default, is the only thing that
  decides whether a new road snaps and joins. On, a road end within half a
  tile of the cursor takes the drag — a node at most one road leaves, never a
  junction — ahead of every other snap, for grid drags and roads off the grid
  alike. Off, nothing snaps (no node, road end, centre line or tile centre, no
  bend pulled into line, no split) and every `buildRoad` is sent with
  `join: false`. Guide snapping is its own toggle and works either way. —
  [interaction.md](ux/interaction.md#snapping-to-roads); `nearestRoadEnd` in
  `src/world/freeroads.ts`
- With snapping to roads on, a grid drag starting or ending on a road off
  the grid's end moves that end onto its tile's centre in the same undo step,
  or is refused with the reason in the preview. The move is its own command
  (`moveSegmentEnd`, free, its inverse the move back), sent ahead of the grid
  road; the world plans it with the road's old self taken away, and the
  preview judges the grid road against the world as the move leaves it, with
  the same function. — [interaction.md](ux/interaction.md#snapping-to-roads);
  `moveRoadEnd` and `gridRunRefusalAfter` in `src/world/freeroads.ts`
- A grid drag into ground a road off the grid holds, anywhere but a tile
  centre where the two meet, is refused in the preview with the world's own
  sentence, never shown valid and refused after release. One predicate
  decides it for the world's `buildRoad` and for the tool's preview against
  the mirror. — [interaction.md](ux/interaction.md#snapping-to-roads);
  `gridRunRefusal` in `src/world/freeroads.ts`
- A ramp meets a motorway alongside it, never head-on. It elbows round to run
  beside the motorway the way it goes and joins at one tile: an on-ramp at its
  END (a ramp arriving, none ahead), an off-ramp at its START (a ramp ahead,
  none arriving) — read from stored flows, never from shape, which is how an
  elbow beside the motorway joins nothing. Everywhere else beside it the ramp
  is its own road. A ramp that would join across the motorway or against it is
  refused whole, by the road tool and again by the worker, with a reason
  saying what to do (`rampMeetingRefusal`); a save that already holds one
  keeps it connected. The join tile draws as a taper into
  the motorway — the lane narrowing to nothing against its edge — never as a
  corner, and the motorway's edge line opens over the downstream half at a
  merge and the upstream half at a diverge. — [road-model.md](world-sim/road-model.md);
  `rampJoin` and `rampJoinAround` in `src/shared/corridor.ts`, `rampMouthAt`
  in `src/shared/approachzone.ts`, `emitRampTaper` in `src/render/roadsmesh.ts`
- An interchange is only the roads it lays, sent as one batch of ordinary
  road commands with every height given exactly: nothing of the interchange
  is stored. A ramp is laid at ground level, and a stamp's street is laid out
  above sea level, so neither is left to a solver that could join it to the
  wrong road. The tool refuses before sending anything the world would refuse
  partway. — [interchanges](engineering/features/interchanges.md);
  `src/shared/interchange.ts`
- A two-way road's lane drop closes both directions' kerbside lanes together,
  after taking an uneven road down to even, so its centre line runs straight
  down the taper. A road whose lanes all run one way closes the driver's
  right-hand lane first. — [road-model.md](world-sim/road-model.md);
  `taperedCrossSection` in `src/shared/taper.ts`
- A road's edge never steps where its width changes; it bends. A lane drop
  closes over a taper that begins at full width, never part-closed, and a
  wide run shorter than its class's taper closes over the length it has, so
  its kerb never steps where it leaves a junction. A ramp node carries its
  auxiliary lane in full only over the half of the tile the ramp joins over,
  and bends to the plain motorway over the other half. —
  [road-model.md](world-sim/road-model.md); `narrowingAhead` in
  `src/shared/approachzone.ts`, `roadTileVertices` in `src/render/roadsmesh.ts`
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
  class carries water: a street's main is also its sewer, which is why a
  drain reaches along the same roads a tower does. A motorway and a ramp
  carry none, so they carry no covers; the test is the water flag, never a
  tier list. — [road-model.md](world-sim/road-model.md); `src/render/roadfurniture.ts`
- A broken line is 3.05 m of paint and a 9.15 m gap (a 12.2 m period), 0.15 m
  wide, with its phase anchored at world metre 0 across every seam. —
  [road-model.md](world-sim/road-model.md); `src/render/roadsmesh.ts`
- Turn arrows exist only where a lane's resolved movement set says the movement
  exists, and a single-lane approach is unmarked (MUTCD 3D.06 ¶01). Every
  arrow is the _Standard Highway Signs_ size the MUTCD points to (§3B.20 ¶05):
  a through arrow 2.90 m, a turn arrow 2.44 m, turn and through 3.89 m, stems
  0.30 m, never wider than its lane. Gore
  hatching slants away from the adjacent traffic (MUTCD 3B.25 ¶08–09). —
  [road-model.md](world-sim/road-model.md)
- A roundabout carries a yield line of white triangles pointing at approaching
  traffic on every entry (MUTCD 3B.19 ¶10) and a YIELD sign on every approach
  (MUTCD 2B.10 ¶06); it is the only junction where a yield faces every approach.
  No stop bar, crosswalk or centre line runs through it, and the edge line never
  crosses an exit (MUTCD 3D.03). — [road-model.md](world-sim/road-model.md)
- A compact roundabout is the roundabout control stored on all four tiles of a
  2×2 block of street tiles on the ground, joined round the square, and
  nothing else is stored. One predicate decides it for the worker, the graph
  and the mirror; four coded tiles no longer joined are no roundabout, and
  read as no override. The ring is one thing: no control, turn or lane
  restriction is set on one of its tiles alone, bulldozing any of its tiles
  takes the whole roundabout out, and undo puts it back. It is driven only
  anticlockwise, on the circle, and only a driver arriving on a leg pays its
  delay. — [road-model.md](world-sim/road-model.md); `roundaboutBlockOf` in
  `src/shared/roundabout.ts`
- A roundabout entry, mini or compact, carries the HCM's single-lane entry
  capacity, `1,380 · e^(−0.00102 · v_c)` veh/h, against the traffic
  circulating in front of it, never a fixed share of its road's. That
  conflicting flow is the ring traffic carrying on past the entry on a compact
  roundabout, and is worked out from the other legs' arrivals on a mini one,
  each car bound for each other leg alike. The delay curve reads the entry's
  v/c against that capacity. — [road-model.md](world-sim/road-model.md);
  `roundaboutEntryCapacity` in `src/shared/junction.ts`
- Crosswalks are derived (footway present, arm below top rank), lie against the
  kerb line, are as deep as the footway but never under 1.8 m (MUTCD 3C.03
  ¶05), and the stop line sits at least 1.2 m in advance of the crossing (MUTCD
  3B.19 ¶13). Never over an alley mouth. —
  [road-model.md](world-sim/road-model.md); `src/render/roadsmesh.ts`
- An alley is an access, not a leg: no turn bay, no swept footway, no crossing
  at its mouth. A dirt track is a leg. —
  [road-model.md](world-sim/road-model.md)
- A turn bay exists only where the junction's control holds that road. A
  short block's shared centre turn lane stands in for two bays, so it appears
  only where BOTH junctions would give the road one: never on a two-lane
  street running through side streets that give way to it. —
  [road-model.md](world-sim/road-model.md); `armWarrant` and
  `sharedTurnLaneAt` in `src/shared/approachzone.ts`
- Bridges are ordinary road tiles plus an elevation layer, never a second
  network. One deck height per road on a tile — the road on it, and at a
  crossing the road passing over it — no tunnels, no third level, and an
  elevated tile, or an overpass, grants no zoning frontage. —
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
- The workforce is `floor(population × EMPLOYMENT_RATE)`, one constant in
  `src/shared/constants.ts`. Employment, demand and the Advisor's labour
  checks all measure against the workforce, never against every resident. —
  [population-model.md](world-sim/population-model.md),
  [progression.md](game-design/progression.md#the-advisor-detecting-and-ranking-problems)
- Demand is economic base theory. Industry is the basic sector a town lives
  by; commercial demand is only ever the local jobs its industrial jobs
  support (`BASE_MULTIPLIER` 1.81, from published multipliers), so a town
  with no industry supports no shops; and residents follow work, so a
  workforce with no jobs turns households away. Every demand figure cites
  its source. — [simulation-rules.md](game-design/simulation-rules.md#demand-the-rci-model);
  `computeDemand` in `src/sim/demand.ts`
- Vehicles and pedestrians are cosmetic: they draw along a real route and
  simulate nothing, and a cosmetic route is computed once and never re-solved.
  A vehicle drives the line the road network traces — grid tile centres and
  the centre lines of roads off the grid — never a straight line between two
  tiles that are not neighbours. A walker walks the footway, which is on the
  ROAD tile where the street's own section puts it, never the lot's first row
  (the lawn, or the house), and goes in by the front door the house kit drew,
  along that kit's own path; a walker anchored a tile back from the street
  walked through the living room of any home that touched it. —
  [props-and-vehicles.md](art/props-and-vehicles.md); `computeWalkPath` and
  `walkSample` in `src/render/pedestrians.ts`, `frontDoorOf` in
  `src/render/houselot.ts`
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
- A field fed a gain every pass has an equilibrium only through its decay,
  and the decay is set for the thresholds that read the field. Land value's
  (243/256) settles bare clean ground at 119, under the level-2 line, and a
  river bank at 181, over it: a level-up is earned by water, trees, a park or
  a clean quiet street, never by waiting. At 255/256 the field saturated the
  whole map within thirty seconds of a new game and every reader of it —
  level-ups, spawn desirability, the tax factor — read a constant. —
  [environmental-simulation.md](world-sim/environmental-simulation.md);
  `LAND_VALUE_DECAY_NUM`, `LAND_VALUE_BASE` and `LAND_VALUE_BANK` in
  `src/sim/fields.ts`
- Happiness is rewritten wholesale by `computeHappiness` every pass. No feature
  writes to it, diffuses it or emits into it; services and recreation reach it
  only through the fields it reads. —
  [environmental-simulation.md](world-sim/environmental-simulation.md),
  [parks-and-recreation.md](engineering/features/parks-and-recreation.md)
- Only `NoRoad`, `NoPower` or `NoWater` for three consecutive growth passes
  abandon an `Active` building. `LowDemand` is display-only and stays
  toothless, and `NoSewer` stops growth and dirties the ground but never
  abandons. — [population-model.md](world-sim/population-model.md);
  `ABANDON_BLOCKER_STREAK` in `src/sim/growth.ts`
- Building ids are monotonic from 1 and never reused in a session. The
  `buildingId` layer is the only spatial index. —
  [entities.md](world-sim/entities.md)
- **A street with power and water on it is all a new town needs to grow.**
  Those are the only utilities growth waits for from the opening, and no
  system may add a prerequisite to them: a new utility or service may flag,
  foul, cut, slow or cost, and may gate growth only from a milestone the
  player is warned of one rung before, never the first town. The frozen
  scenario in `tests/interaction/firsttown.test.ts` is the guard; a change
  that needs a step added to it has changed this rule and stops here first.
  — [simulation-rules.md](game-design/simulation-rules.md),
  [water-and-sewage.md](game-design/features/water-and-sewage.md)
- A zoned tile develops only when it is zoned, served with power and water
  on its footprint (and, from `SEWER_MILESTONE`, a drain), and within
  Manhattan distance 3 of a street, on
  the grid or off it, and a building stands only on tiles zoned the same, at spawn and at
  every level-up: it never spills onto the ground beside its zone. One
  zonability predicate decides; the zoning grid visual and the
  `paintZone` command both defer to it and may never disagree, so the render
  thread reads roads off the grid from the network the worker sends, never
  from its road tiles. A road off the grid fronts lots square to its centre
  line from its kerb, out to the zoning depth, and nothing is zoned or built on
  its footprint. The zoning depth IS that distance (`ZONE_DEPTH` =
  `ROAD_CHECK_RADIUS` = 3): the brush never paints land no lot can stand on.
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
  beside any tile of it. — [simulation-rules.md](game-design/simulation-rules.md)
- Who draws city water is one predicate, `cityWaterUse`, read by growth and
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
  [simulation-rules.md](game-design/simulation-rules.md#a-house-on-a-well);
  `src/sim/network.ts`
- Sewage is the third utility and runs on the water's own network: a drain
  reaches along every road that carries water and every pipe, the buildings
  it reaches line up by steps from the nearest drain, and the far end is cut
  when the drains run out, exactly as the water is. From Big Town a lot grows
  and a building levels up only where a drain reaches it with room for its
  sewage; the drain and the works unlock the rung before, at Busy Township,
  and the Advisor warns there that the town is outgrowing its septic tanks.
  A standing building nothing drains carries `NoSewer`, fouls the ground
  around it in proportion to its sewage, and is **never abandoned for it**,
  so a city saved before there were drains loads standing. —
  [water-and-sewage.md](game-design/features/water-and-sewage.md),
  [utilities-model.md](world-sim/utilities-model.md#sewage); `recomputeUtilities`
  in `src/sim/network.ts`, `tryLevelUp` and `runSpawnScan` in `src/sim/growth.ts`
- A water pipe is to water and sewage what the power line is to power: a
  painted layer, not a road, that conducts between its own tiles and into
  any road or building it touches. It stands on no water and no footprint,
  and laying over a laid tile changes and charges nothing. A pumping station
  and a drain pipe stand only where their footprint touches water
  (`requiresAdjacent: 'water'`), as a station stands only on the rails. —
  [utilities-model.md](world-sim/utilities-model.md#conducting-roads-power-lines-and-pipes);
  `src/world/waterpipe.ts`, `hasAdjacentWater` in `src/world/grid.ts`
- A pipe is buried: nothing on the surface ever shows it. The water system —
  the mains under the streets, the laid pipes, the risers of the water
  buildings — is seen only underground, which the city goes to while a
  water tool, a water building or a water lens is in hand and leaves when
  none is. The underground is a view: it changes nothing about what carries
  water or where a pipe may go; the surface goes to glass by material
  opacity, never a shader, and comes back exactly as it was. A pipe drag's
  ends snap onto the system a tile away, a run along a street lays nothing,
  and the cursor says what the run joins. —
  [underground-view.md](game-design/features/underground-view.md);
  `UndergroundView` in `src/render/underground.ts`, `PipeOverlayRenderer` in
  `src/render/pipes.ts`, `planPipeRun` in `src/tools/pipe.ts`
- The water's fouling (`g.waterFoul`) spreads only over connected water,
  from each drain's and works' discharge, fading to nothing at
  `WATER_FOUL_REACH_TILES`; it is the worst of what reaches a tile, never
  the sum; it is derived every utility pass and never saved. A drain that
  takes no sewage fouls nothing, and a works fouls at its `effluent` share.
  An intake yields its rating scaled by the worst fouling beside it; the
  tower is never scaled; the sewer pass runs before the water pass so the
  yield is known when the water is cut. There is no current and no
  downstream. — [water-and-sewage.md](game-design/features/water-and-sewage.md),
  [utilities-model.md](world-sim/utilities-model.md#the-fouled-water);
  `spreadFouling` and `recomputeUtilities` in `src/sim/network.ts`
- A tile's soil grade is derived from its height, the water beside it and the
  map seed, and never saved. It is graded by one function, `soilGradeAt`,
  for the worker, the render mirror, the Soil lens, farmland painting and
  farm growth alike, and it is regraded wherever heights change. Beach sand
  (under `SAND_BAND_METERS` above sea level), the water's edge, rock (over
  `MAX_BUILD_SLOPE`) and stony ground better than pasture are never
  cropland. The sand and the rock are the same bands the terrain draws, read
  from the same constants, so the ground's colour and its soil cannot
  disagree. — [world-model.md](world-sim/world-model.md#soil);
  `src/shared/soil.ts`
- A zoned building has a `kind`, drawn when its lot grows: among the zone's
  level-1 catalog entries that are unlocked and whose footprint fits the lot,
  one roll of the growth rng against their `share` weights, in catalog
  order. A commercial or industrial kind is a candidate only if its jobs fit
  the sector's room — the jobs the economy still supports, counted down as
  the pass builds — except the smallest kind that fits the lot, which always
  is; a business levels up only with room for the jobs it adds. The kind is
  kept through every level-up; a level-up looks for the same zone and kind at
  the next level. The player never picks a kind. —
  [building-types.md](game-design/features/building-types.md),
  [simulation-rules.md](game-design/simulation-rules.md#the-spawner-how-a-lot-is-chosen);
  `spawnCandidates`, `drawKind` in `src/sim/growth.ts`; `jobRoom` in
  `src/sim/demand.ts`
- A detached house is platted on the lot the land warrants and stays on it:
  the land value at the tile picks half (under 64, 1×1), normal (64–159,
  1×2), double (160–223, 2×2) or estate (224 and over, 2×3), or the next
  smaller lot that fits, never a larger one than the land warrants. The three
  levels of a lot share its footprint, a level-up looks up the same zone,
  kind and lot and footprint, and no building ever grows its lot. A house
  body is 9.5 m across the front whatever its lot. —
  [lots-and-land.md](game-design/features/lots-and-land.md);
  `lotForStanding`, `platCandidates` in `src/shared/lots.ts`, `tryLevelUp` in
  `src/sim/growth.ts`
- A lot forms from its street: the tiles along a street that front the same
  side are cut a frontage at a time, from one end, into parcels, and a
  detached house grows only on the tile a parcel starts on, with its frontage
  along the street (a turned twin on a street running north to south), never
  behind another house. The plat is derived from the zone, the streets, the
  buildings and the land value and stored nowhere; a building standing is a
  parcel the cut steps over and never moves. Round a bend each arm fronts its
  own side, and a cul-de-sac is cut down its two sides, never across its end.
  — [lots-and-land.md](game-design/features/lots-and-land.md#the-plat-is-cut-from-the-street-built-2026-10-07);
  `parcelsAnchoredAt` in `src/world/plat.ts`
- Every zoned catalog figure is derived from a published source by the rules
  in [balancing.md](game-design/balancing.md#residential-kinds): residents are
  `round(units × household)`, a building's households are its `units`, and
  power and water are per-home survey figures. A number in `catalog.json`
  with no derivation is a bug. — [building-types.md](game-design/features/building-types.md)
- Industry grows on its order book, never its neighbourhood: a works, a
  heavy plant or a farm levels up while industrial demand is above zero and
  the town has room for the jobs it adds, and never reads land value, which
  pushes real industry out of town. Homes and shops keep the land-value
  gate. — [simulation-rules.md](game-design/simulation-rules.md#levels-construction-and-abandonment);
  `tryLevelUp` in `src/sim/growth.ts`
- Farmland is painted only where a dirt road's frontage reaches, up to
  `FARM_DEPTH`, and only on soil a farm can work. A paved road fronts no
  farmland, though a field may run up to it. A farm's jobs are industrial
  jobs, and its residents are population. The soil under the lot decides a
  farm's kind; a level-up keeps the kind, needs the kind's own grade and
  industrial demand, and never reads land value. —
  [simulation-rules.md](game-design/simulation-rules.md#frontage-and-zonability);
  `computeFarmableMask` in `src/world/zonable.ts`, `trySpawnFarm` in
  `src/sim/growth.ts`
- Growth never builds into a shortage: a building spawns, or levels up, only
  when the grid has spare power and water for what it will draw, counted down
  as the pass builds. A lot or building held back only by that is waiting for
  supply and is counted for the Advisor. A shortage never refuses the player's
  own tools. — [simulation-rules.md](game-design/simulation-rules.md);
  `runSpawnScan` and `tryLevelUp` in `src/sim/growth.ts`
- The player paints zones and never places a zoned building; growth runs on the
  sim clock as demand × desirability. Civic and utility buildings are plopped;
  zones, districts, landfill and power lines are painted. —
  [gdd.md](game-design/gdd.md), [gameplay-loop.md](game-design/gameplay-loop.md)

## Utilities and services

- Power, water, sewage and every service reach the city only along the
  street-tier road network: a breadth-first search from the road tiles
  orthogonally adjacent to the footprint, radiating one step (utilities) or
  two steps (services) onto non-road tiles. Never a straight-line radius. The
  search follows the road network's links (`roadCellsOf`), so it goes only
  where roads join: never across to a road that merely lies alongside, never
  between two levels. A power line is not a road, and passes power to
  whatever stands beside it; a water pipe is not a road, and passes water
  and sewage the same way. —
  [utilities-model.md](world-sim/utilities-model.md),
  [services-model.md](world-sim/services-model.md),
  [ADR-0009](engineering/adr/0009-utilities-propagate-along-roads.md);
  `src/sim/services.ts`, `src/sim/network.ts`
- A facility with no street-tier road within two orthogonal steps of its
  footprint covers nothing. — [services-model.md](world-sim/services-model.md);
  `NEAR_ROAD_RADIUS` in `src/sim/services.ts`
- A generator is worth its **nameplate × capacity factor** to the grid, the
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
  [power-generation.md](game-design/features/power-generation.md#the-generators-re-derived),
  [utilities-model.md](world-sim/utilities-model.md#production-and-demand);
  `averageOutputMW` in `src/shared/power.ts`, `crowdsItsKind` in
  `src/sim/worker.entry.ts`
- Service range is a road-hop count in tiles, scaled by funding and floored. It
  is never called, drawn or computed as a radius. —
  [services-model.md](world-sim/services-model.md)
- Water, and the sewage coming back, conduct along every street tier unless
  its spec says `carriesWater: false` (dirt road, highway, ramp), and along
  a water pipe. Power conducts only where the class surface is `paved`, read
  from the spec, never from a separate flag, and along a power line. Rail
  conducts neither; a line carries no water and a pipe no power. —
  [utilities-model.md](world-sim/utilities-model.md); `src/sim/network.ts`
- Utility supply is one city-wide total and an unconnected generator still
  counts. Demand is what the network reaches: every building it reaches,
  abandoned ones included, and nothing it does not. When demand exceeds
  supply the grid gives out from its far end: buildings are cut in order of
  network steps from the nearest generator, furthest first, ties by id,
  footprint tiles only, as a hard cut, never a dim. An abandoned building
  keeps its place in that line, so abandoning never hands a building its own
  supply back. Supply and use are summed in whole millionths (watts,
  millilitres), never as floats. —
  [utilities-model.md](world-sim/utilities-model.md#brownouts),
  [power-generation.md](engineering/features/power-generation.md);
  `recomputeUtilities` in `src/sim/network.ts`
- A building a shortage cuts carries `PowerShortage` or `WaterShortage` beside
  `NoPower` or `NoWater`. The shortage flag only says why and never abandons a
  building on its own. —
  [utilities-model.md](world-sim/utilities-model.md#brownouts)
- Because supply counts it anyway, a generator that cannot deliver must say
  so: a utility whose footprint touches no tile that conducts **what it
  produces** (or, for a drain, takes) carries `Problem.NoRoad`. Touching a
  road is not enough — a motorway and a ramp carry no water, an unsealed
  lane conducts no power, and a power line carries electricity only — so the
  test is the same predicate the coverage walk seeds from, never a second
  idea of "connected". Otherwise
  the supply figures read healthy while nothing is served and the city
  silently stops growing. —
  [utilities-model.md](world-sim/utilities-model.md); `utilityCanDeliver` in
  `src/sim/network.ts`, `flagUnservedUtilities` in `src/sim/growth.ts`
- Exactly one road BFS runs per active facility per tick. Population in reach,
  collection and forwarding ride that traversal, never a second BFS or a grid
  sweep. — [service-capacity.md](engineering/features/service-capacity.md)
- All per-facility iteration (coverage, collection, fleet allocation) runs in
  ascending building id with id tiebreaks, and the shortage cut breaks its
  distance ties by id, so two runs agree. — [services-model.md](world-sim/services-model.md),
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
- A facility group shares its load: a building reached by several
  incinerators with room gives each an equal share, as a tile reached by
  several service facilities sums what each dedicates to it. Incinerators
  collect before the landfill, since they process what they take and a
  landfill only keeps it. An incinerator burns what it holds up to its
  ceiling and its pollution is its catalog figure scaled by the share of
  that ceiling the last pass used, never a flat figure while idle. —
  [services-model.md](world-sim/services-model.md#garbage-and-waste-management);
  `shareOut` and `incineratorEmission` in `src/sim/garbage.ts`
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
- A snapshot's `buildings` delta names each id in exactly one of `added`,
  `updated` and `removed`, carrying the building as it stands now, so no
  renderer depends on the order it applies them in. Sent as logged, a home
  updated and then levelled up in one window arrived both updated and removed,
  and every renderer that applied removals first put the old home's roof back
  beside the new house. — [interfaces.md](engineering/interfaces.md);
  `settleBuildingDelta` in `src/sim/buildings.ts`
- Only `src/main.ts` imports from every directory and spawns the worker. A UI
  panel reaches the render thread only through a method on `BoundActions` in
  `src/ui/store.ts`, bound in `main.ts`. —
  [architecture.md](engineering/architecture.md),
  [dependency-map.md](engineering/dependency-map.md)
- Every `Command` kind has an `applyCommand` case that returns its literal, exact
  inverse (the prior values, not a re-derived approximation); undo replays that
  inverse, refund included. A road it puts back carries the stored flow and
  deck height each tile had (`flows`, `elevations`), never a direction read
  off the order its tiles were listed in: a bulldoze lists a rectangle, and
  its undo once laid one-way roads and corridor halves back running the wrong
  way, unpaired. An inverse is never refused by a rule a player's own command
  would face: zones go back with `restore`, since a zone can outlive the road
  that allowed it. Settings commands return an empty inverse and are
  simply not undoable. Sim-grown changes (spawn, level-up, abandonment) never
  enter the undo stack. —
  [ADR-0008](engineering/adr/0008-every-tool-commit-is-a-reversible-command.md),
  [interfaces.md](engineering/interfaces.md); `applyCommand` in
  `src/sim/worker.entry.ts`, `src/tools/undo.ts`
- A command batch lands whole or not at all. At the first command the world
  refuses, `drainCommands` stops, takes back every command of the batch that
  landed by replaying their exact inverses newest first, and puts the funds
  back as they stood before the batch. The ack is `ok: false` with that
  command's reason, no cost and no inverse. A batch that lands acks the summed
  cost and the inverses unshifted, so undo replays in reverse. An undo or redo
  is a batch like any other: one the world refuses changes nothing, and the
  client puts the edit back where it was in the history. A batch once kept
  what landed before a refusal, with no undo for it. — `drainCommands` in
  `src/sim/worker.entry.ts`, `refused` in `src/tools/undo.ts`
- `drainCommands`
  touches no RNG, growth, fields, economy or traffic, so commands apply while
  paused; a new handler stays tick-independent. What a command builds reaches
  the next snapshot as it stands, paused or not, and only what the sim works
  out (ridership, say) waits for a tick: a transit line drawn while paused once
  stayed off the screen until play resumed, because its snapshot read the last
  tick's lines. — [interfaces.md](engineering/interfaces.md)
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
  corner vertex, never just its own. A road tile's drawn cross-section reads
  its run out to `SECTION_REACH_TILES`, so a road or junction-control change
  rebuilds every road chunk within that reach along both axes, plus the tile
  that bends to meet it; rebuilt alone, a turn bay opened by a new signal
  drew a notch at the chunk seam. —
  [rendering-architecture.md](visual-render/rendering-architecture.md),
  [terrain.md](visual-render/terrain.md); `SECTION_REACH_TILES` in
  `src/shared/approachzone.ts`, `chunksReading` in `src/render/roadsmesh.ts`
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
- A farm counts as industry and is never drawn as industry. Every renderer
  that dresses industry — lot pad, setback tiers, roof props and stacks,
  parking bays and kerb cars, the facade — asks `isFarmEntry` first. A farm's
  pickable body is its barn walls, placed by the one farm plan (`planFarm`)
  that the ground, the instancer and the kit all read, so the roof sits on the
  barn and the silo stands in its yard. — [buildings.md](art/buildings.md);
  `src/render/archetypes.ts`, `src/render/farmlot.ts`
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
- Every building levels its footprint when it is placed, grown or plopped,
  spawn or level-up: the footprint's own vertices and the far-edge vertices
  open ground owns, never one a road, another building or water owns. A body
  and everything that stands with it (podium, roof props, kit, a home's
  parts) is seated on the highest ground under the body's own rectangle
  through `maxHeightUnderBody`, never under the whole footprint. A grown
  house on a hillside hung over its downhill side, and a works' dock floated
  over its car park, until both held. —
  [terrain.md](visual-render/terrain.md#levelling-under-structures),
  [buildings.md](art/buildings.md#lots-and-paved-ground);
  `computeFlattenPatch` in `src/sim/worker.entry.ts`, `src/render/footprint.ts`
- A data lens paints tile (x, z) over tile (x, z): the lens texture's column x
  and row z are that tile, so the quad's u runs with world x and its v with
  world z, set from its own positions. Built on a rotated plane's stock UVs,
  every lens drew its data mirrored north to south, and the power lens showed
  a powered street as dark ground. —
  [architecture.md](engineering/architecture.md); `OverlayRenderer` in
  `src/render/overlays.ts`
- No wild tree stands on a tile holding a grid road, a road off the grid's
  footprint, or a building. It is read from the mirror whenever roads, the
  network or buildings change, never from the commands that laid them:
  trimmed by command, a curve kept every tree it was laid through and a
  loaded city regrew a tree on every road. A home's yard trees are its own
  kit, planted clear of its house, drive and furniture. —
  [vegetation.md](visual-render/vegetation.md); `occupiedTiles` in
  `src/app/clientgrid.ts`
- A home faces the street it fronts: its lawn runs across the verge to the
  sidewalk, its front wall stands 5.5 m behind the sidewalk (never outside its
  lot), its door faces the street, and a drive — dirt or concrete — crosses
  the sidewalk and verge to the carriageway. Its car stands on that drive,
  never at the kerb. A home that fronts no street has no drive and no car.
  The street it fronts is the one bordering the most of its edge, so a home
  on a bend or beside a cul-de-sac faces the street it runs along; ties go
  north, east, south, west. —
  [buildings.md](art/buildings.md#residential-lots); `findRoadFacingEdge` in
  `src/render/frontage.ts`
- A kerb takes cars at any hour only where the street paints a parking lane on
  that side; a street whose tier allows parking but paints no lane takes short
  daytime stays and nothing overnight; every other road takes none. —
  [props-and-vehicles.md](art/props-and-vehicles.md#parked-cars-and-lot-life),
  [road-model.md](world-sim/road-model.md#furniture-and-what-gates-it)
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
- The Advisor reports a grid too small for its city as a shortage ("build
  another plant"), never as a gap in the network, and says so for as long as
  a building stands dark from it or growth waits on it. —
  [progression.md](game-design/progression.md#the-advisor-detecting-and-ranking-problems);
  `cityIssues` in `src/ui/advisor.ts`
- The Advisor reports zoned land the road it fronts brings no power or water:
  an empty zoned tile beside a road, without a utility its zone needs. Before
  it, a town zoned down a gravel road, which carries no cable, sat empty with
  the Advisor silent, since no building stood there to carry a flag. Ground
  zoned too deep to reach the road is not counted; the road is not what fails
  it. —
  [progression.md](game-design/progression.md#the-advisor-detecting-and-ranking-problems);
  `zonedUnserved` in `src/sim/growth.ts`
- A tool preview reads back before commit: invalid tint plus a cursor-chip
  reason ("Insufficient funds", "Locked", "Overlapping items"), never a red tint
  alone. — [ux-design.md](ux/ux-design.md), [interaction.md](ux/interaction.md)
- A road off the grid is previewed by the same `planSegment` its command runs,
  against the render thread's mirror of the grid and the road network, so the
  ghost and the command never disagree about what may be laid. A motorway
  offers no `Grid` mode. — [road-network.md](world-sim/road-network.md),
  [interaction.md](ux/interaction.md)
- A road option that would compose a road the tool refuses is disabled with
  the refusal as its tooltip, never offered and then refused; the choice
  already made is never disabled. A selected tool's card is always on the
  drawer's visible sub-tab: opening another sub-tab puts the tool down. —
  [hud.md](ux/hud.md), [road-model.md](world-sim/road-model.md); `layRefusal`
  in `src/shared/roadprofile.ts`, `src/ui/RoadToolOptions.tsx`
- Disabled (nothing to do now, about 30% opacity) and gated by milestone (40%
  opacity, lock, tooltip naming the milestone) are distinct treatments and are
  never merged. — [interaction.md](ux/interaction.md),
  [components.md](ux/components.md)
- Text the layout may cut short (a card's name, a track's title, anything
  `truncate`d) always carries its full text as a `title` tooltip; a clipped
  label the player cannot read in full is a broken control. —
  [components.md](ux/components.md), [accessibility.md](ux/accessibility.md)
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
- A unit test is co-located as `<module>.test.ts(x)` beside the module, never
  in a `__tests__` folder. A test that sends the sim commands is an
  interaction test and lives in `tests/interaction/`, named for what the
  player does, never beside a module. A feature a player can build adds a
  step to the small town in `tests/support/town.ts`. —
  [naming.md](engineering/standards/naming.md),
  [testing.md](engineering/standards/testing.md)
- A passing test that a new feature can only keep passing by adding a setup
  step is not a test to fix but a rule the feature has changed: stop, name
  the rule, and move it in [GROUND-TRUTHS.md](GROUND-TRUTHS.md) and its spec
  before the test. The sewer gate shipped in 1.31.0 by giving every growth
  test a pond and a drain, and no new town could grow until 1.32. —
  [testing.md](engineering/standards/testing.md);
  `tests/interaction/firsttown.test.ts`
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
