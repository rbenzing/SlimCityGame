# Truths — Roads: classes, profiles and the network

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
  [road-model.md](../world-sim/road-model/README.md),
  [overpasses.md](../world-sim/overpasses.md); `atOneLevel` in
  `src/shared/overpass.ts`
- [R-roads-004] The ground under a deck is never levelled, but a deck the grade solver
  lifted less than 0.5 m (`GROUND_HUGGING_LIFT_M`) to close a neighbour's
  step is on the ground, not in the air: it is levelled with its run like
  any grounded road tile, or the ground beside it stands proud of the deck. —
  [road-model.md](../world-sim/road-model/README.md); `GROUND_HUGGING_LIFT_M` in
  `src/sim/worker.entry.ts`
- [R-roads-005] A rail tile between two street tiles
  is a break in the street, not a crossing, and rail laid through a street in
  replace mode severs it: the track draws running straight through and the street ends
  either side, never a crossing box. Level crossings that stop road traffic do
  not exist yet. —
  [road-model.md](../world-sim/road-model/README.md),
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
- [R-roads-015] A road is a class, a profile (its cross-section) and its junctions. Markings,
  furniture, crossings and capacity are derived from those three and never
  authored or stored per tier. — [road-model.md](../world-sim/road-model/README.md),
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
  [road-model.md](../world-sim/road-model/README.md); `src/shared/types.ts`
- [R-roads-020] A section is authored left to right in the direction of travel and laid in
  WORLD order: offsets grow east and south, so a road heading south or west
  has its driver's left at the high offset and its section is turned round
  before it is drawn — and before a corridor is halved, since the halves are
  stored by the side of the road they stand on. Nothing lays a section's
  pieces low-to-high without it; an editor working by the driver's own left or
  right asks which way round the section is. Without it a southbound motorway
  put its wide shoulder against the median and a two-way street drawn south
  drove on the left. — [road-model.md](../world-sim/road-model/README.md);
  `worldOrderedProfile` and `reversedInWorld` in `src/shared/roadprofile.ts`
- [R-roads-021] A one-way road flows the way it was drawn (its stored flow), never inferred
  from geometry; the geometric fallback exists only for tiles whose flow is
  `RoadFlow.None`. A run's direction is read from its own tiles before its end
  nodes, because a node two one-ways cross holds only the flow of whichever
  was drawn last. — [road-model.md](../world-sim/road-model/README.md);
  `src/world/pathfind.ts`, `storedRunDirection` in `src/world/roadgraph.ts`
- [R-roads-022] A one-way carriageway — a one-way street, a motorway, a ramp, either half of
  a corridor, any profile whose travel lanes all run one way — is driven only
  the way it flows. A direction the cross-section has no travel lane for is
  never routed, not merely costed high; a run with no recorded flow is gated
  by its spec's `oneWay` and the geometric fallback. —
  [road-model.md](../world-sim/road-model/stored-direction-and-one-way-roads.md);
  `edgeTraversable` in `src/world/pathfind.ts`
- [R-roads-023] Roads replace by class rank (dirt, alley, rural, local, one-way, urban,
  collector, arterial, divided, ramp, highway), never by tier number or catalog
  order. Rail sits outside the ranking: rail never takes a tile from a road nor
  a road from rail, and only replace mode lays one over the other
  (`tierOutranks`, `rankedTogether`). A road with a bus or tram lane outranks the same road
  without one. A drag through a road it does not outrank is refused whole; only
  replace mode overrides. — [road-model.md](../world-sim/road-model/README.md);
  `CLASS_RANK` in `src/shared/roadprofile.ts`
- [R-roads-024] A road through a standing building is refused whole, by the tool's chip
  ("Overlapping items") and by the world with a reason that names the
  building; it is never laid with the building's tiles left out, since that
  leaves a road in pieces that join nothing and read as one. Water and other
  roads are not in the way. — [road-model.md](../world-sim/road-model/README.md);
  `ROAD_THROUGH_BUILDING` in `src/sim/worker.entry.ts`, `isClearOfBuildings`
  in `src/app/clientgrid.ts`
- [R-roads-025] A refused drag says why when it is released, not only while it is held: the
  chip's reason is raised as the same notification a refusal from the world
  raises, and nothing is laid. A tool that refuses silently has laid nothing
  and taught nothing. — [interaction.md](../ux/interaction.md);
  `src/tools/tools.ts`
- [R-roads-026] The `RoadTier` byte is a persisted, append-only preset id, not a hierarchy.
  Never use a tier number as rank. — [road-model.md](../world-sim/road-model/README.md),
  [data-model.md](../engineering/data-model/README.md)
- [R-roads-027] A motorway (highway class) touches only a highway or a ramp. The rule is an
  accept-list, so a new class stays off the motorway until explicitly admitted.
  A ramp never joins dirt or alley. The worker refuses a `buildRoad` that
  breaks either rule whole, not only the road tool. —
  [road-model.md](../world-sim/road-model/README.md); `MOTORWAY_MEETS` in
  `src/shared/roadprofile.ts`, `joinRefusalAround` in `src/sim/worker.entry.ts`
- [R-roads-028] A road tile's neighbour mask is derived, never trusted from a save: loading
  recomputes every mask from today's rules, so a rule change reaches old
  cities. — [data-model.md](../engineering/data-model/README.md);
  `recomputeRoadMasks` in `src/world/roads.ts`
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
  refused. — [road-model.md](../world-sim/road-model/README.md); `src/shared/corridor.ts`
- [R-roads-043] A reserved bus or bike lane always costs a general lane, and a bus lane
  counts against the class's lane range; lanes are never dropped silently to
  fit. A tram reservation is a guideway over a 2.4 m median: it costs the
  road a median, not a lane, and its tracks count against no lane range. A
  guideway track is priced at 2.25 times a street track. —
  [road-model.md](../world-sim/road-model/README.md); `laneCount` and `roadPriceOf` in
  `src/shared/roadprofile.ts`
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
  [road-model.md](../world-sim/road-model/README.md); `src/data/roads.json`
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
  [road-model.md](../world-sim/road-model/README.md)
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
  [road-model.md](../world-sim/road-model/README.md); `sideBySideCarriageways` in
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
  [road-model.md](../world-sim/road-model/README.md); `medianOpens` in
  `src/shared/corridor.ts`
- [R-roads-055] A corridor's two halves are one road. A road laid over a corridor half
  takes that half's partner with it, as its partner, or it is refused; it
  never leaves half a road with nothing beside it. The road tool and the world
  ask the same predicate. The ghost draws each half where it will be laid. A
  bulldoze over one half takes its partner too, on the layer it takes the
  first from, and the preview outlines both; the tool and the world ask
  `bulldozeReach` for it. —
  [road-model.md](../world-sim/road-model/README.md); `corridorSplitRefusal` and
  `bulldozeReach` in `src/shared/corridor.ts`
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
  [road-model.md](../world-sim/road-model/README.md),
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
- [R-roads-080] Bridges are ordinary road tiles plus an elevation layer, never a second
  network. One deck height per road on a tile — the road on it, and at a
  crossing the road passing over it — no tunnels, no third level, and an
  elevated tile, or an overpass, grants no zoning frontage. —
  [road-model.md](../world-sim/road-model/README.md),
  [constraints.md](../engineering/constraints.md)
