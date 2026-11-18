# Truths — Roads: junctions, signs and ramps

Back to [the index](../GROUND-TRUTHS.md).

- [R-roads-029] Highway and rail arms never take a junction control — not from the warrant
  and not from a player's override, which is refused. A ramp's motorway end is
  an uncontrolled merge or diverge; its other end is an ordinary warranted
  junction. — [road-model.md](../world-sim/road-model/README.md);
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
  [road-model.md](../world-sim/road-model/README.md); `isRampNode` in
  `src/shared/junction.ts`, `isRampNodeAt` in `src/shared/approachzone.ts`
- [R-roads-031] The warrant ladder is none, yield, stop, all-way stop, signal, and it only
  climbs. Roundabout is never a warrant default because it changes geometry. A
  player's control override is never stepped down by a warrant, and the warrant
  is still computed for the inspector. —
  [road-model.md](../world-sim/road-model/README.md); `src/shared/junction.ts`
- [R-roads-032] Warrants are re-evaluated only on a graph rebuild and once per game day,
  never continuously. Thresholds are stored as volume/capacity fractions that
  restate the MUTCD absolute volumes (500 + 150 veh/h for a signal, 300 + 200
  for an all-way stop), never as veh/h. —
  [systems/traffic.md](../engineering/systems/traffic/README.md),
  [road-model.md](../world-sim/road-model/README.md)
- [R-roads-033] Signals run a 60 s cycle (90 s with a dedicated left) on one city-wide clock,
  and the rendered head cycles on that same clock. —
  [road-model.md](../world-sim/road-model/README.md)
- [R-roads-034] k = 3/7 game-capacity units per veh/h is the one calibration constant between
  the published standards and game units, and it must keep the two-lane preset
  at 600. —
  [ADR-0013](../engineering/adr/0013-traffic-figures-come-from-published-standards.md),
  [road-model.md](../world-sim/road-model/README.md)
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
  [road-model.md](../world-sim/road-model/sound-walls.md); `soundWallsAt` in
  `src/shared/soundwallsites.ts`
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
  merge and the upstream half at a diverge. — [road-model.md](../world-sim/road-model/README.md);
  `rampJoin` and `rampJoinAround` in `src/shared/corridor.ts`, `rampMouthAt`
  in `src/shared/approachzone.ts`, `emitRampTaper` in `src/render/roadsmesh.ts`
- [R-roads-062] An interchange is only the roads it lays, sent as one batch of ordinary
  road commands with every height given exactly: nothing of the interchange
  is stored. A ramp is laid at ground level, and a stamp's street is laid out
  above sea level, so neither is left to a solver that could join it to the
  wrong road. The tool refuses before sending anything the world would refuse
  partway. — [interchanges](../specs/interchanges.md);
  `src/shared/interchange.ts`
- [R-roads-063] A two-way road's lane drop closes both directions' kerbside lanes together,
  after taking an uneven road down to even, so its centre line runs straight
  down the taper. A road whose lanes all run one way closes the driver's
  right-hand lane first. — [road-model.md](../world-sim/road-model/README.md);
  `taperedCrossSection` in `src/shared/taper.ts`
- [R-roads-064] A road's edge never steps where its width changes; it bends. A lane drop
  closes over a taper that begins at full width, never part-closed, and a
  wide run shorter than its class's taper closes over the length it has, so
  its kerb never steps where it leaves a junction. A ramp node carries its
  auxiliary lane in full only over the half of the tile the ramp joins over,
  and bends to the plain motorway over the other half. A corridor's island
  and the lines beside it bend with it across a seam. A lane drop's shoulder
  hatching takes its edge line's colour (MUTCD 3B.25 ¶07–08). —
  [road-model.md](../world-sim/road-model/README.md); `narrowingAhead` in
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
  lanes bend with the edge across a tile and never step at a seam. Where a
  two-way road meets a one-way, a yellow line holds its place: it never
  drifts across the pavement to meet another yellow. —
  [road-model.md](../world-sim/road-model/README.md); `narrowingAhead` in
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
  recomputing one of its own. — [streets.md](../art/streets/README.md);
  `CANTILEVER_FACE_Z`, `cantileverSide`, `flowFacingYaw` and
  `signWorldTransform` in `src/render/roadfurniture.ts`
- [R-roads-067] A manhole cover is the top of a sewer and is drawn only on a road whose
  class carries water: a street's main is also its sewer, which is why a
  drain reaches along the same roads a tower does. A motorway and a ramp
  carry none, so they carry no covers; the test is the water flag, never a
  tier list. — [road-model.md](../world-sim/road-model/README.md); `src/render/roadfurniture.ts`
- [R-roads-070] A roundabout carries a yield line of white triangles pointing at approaching
  traffic on every entry (MUTCD 3B.19 ¶10) and a YIELD sign on every approach
  (MUTCD 2B.10 ¶06); it is the only junction where a yield faces every approach.
  No stop bar or centre line runs through it and no crosswalk reaches the
  island; an arm with footways carries one crosswalk 6.1 m back from the ring
  (3C.09). The ring's edge line is dotted across an entry and never crosses
  an exit (3D.03). — [roundabouts.md](../specs/roundabouts.md)
- [R-roads-071] A compact roundabout is the roundabout control stored on all four tiles of a
  2×2 block of street tiles on the ground, joined round the square, and
  nothing else is stored. One predicate decides it for the worker, the graph
  and the mirror; four coded tiles no longer joined are no roundabout, and
  read as no override. The ring is one thing: no control, turn or lane
  restriction is set on one of its tiles alone, bulldozing any of its tiles
  takes the whole roundabout out, and undo puts it back. It is driven only
  anticlockwise, on the circle, and only a driver arriving on a leg pays its
  delay. — [road-model.md](../world-sim/road-model/README.md); `roundaboutBlockOf` in
  `src/shared/roundabout.ts`
- [R-roads-072] A roundabout entry, mini or compact, carries the HCM's single-lane entry
  capacity, `1,380 · e^(−0.00102 · v_c)` veh/h, against the traffic
  circulating in front of it, never a fixed share of its road's. That
  conflicting flow is the ring traffic carrying on past the entry on a compact
  roundabout, and is worked out from the other legs' arrivals on a mini one,
  each car bound for each other leg alike. The delay curve reads the entry's
  v/c against that capacity. — [road-model.md](../world-sim/road-model/README.md);
  `roundaboutEntryCapacity` in `src/shared/junction.ts`
- [R-roads-073] Crosswalks are derived (footway present, arm below top rank). The crossing
  over an arm is as deep as the footway it carries but never under 1.8 m
  (3C.03 ¶05), and stands outside the box, where `[R-roads-095]` puts it.
  Every mark lies on carriageway, the crossing meets a kerb at both ends,
  and no two crossings touch. The stop line sits at least
  1.2 m in advance of it (3B.19 ¶13), and lane lines, centre lines and arrows
  end by the stop line. Never over an alley mouth. —
  [road-model.md](../world-sim/road-model/README.md); `junctionArmLayout` in
  `src/shared/junctionpaint.ts`
- [R-roads-074] An alley is an access, not a leg: no turn bay, no swept footway, no crossing,
  no control and no paint at its mouth, and the street's lines, median and
  footway run unbroken past it (MUTCD 1C.02: an alley's junction is no
  intersection). A gravel road or a dirt track is a leg, but unpaved: no stop
  line, crossing or turn bay, its own width and one colour. A crossing lies
  only over an arm with a footway of its own. —
  [road-model.md](../world-sim/road-model/README.md); `warrantedControl` in
  `src/shared/junction.ts`, `junctionArmPaint` in `src/shared/junctionpaint.ts`
- [R-roads-075] A turn bay exists only where the junction's control holds that road. A
  short block's shared centre turn lane stands in for two bays, so it appears
  only where BOTH junctions would give the road one: never on a two-lane
  street running through side streets that give way to it. —
  [road-model.md](../world-sim/road-model/README.md); `armWarrant` and
  `sharedTurnLaneAt` in `src/shared/approachzone.ts`
- [R-roads-078] A turn bay never narrows its road. On a tile where the bay is partly open,
  the road gives up only what the opened bay needs beyond the tile's spare
  width: the parking or shoulder narrows over the taper, and the through
  lanes narrow with it, so the carriageway is never narrower than the plain
  road's anywhere along the bay. A parking lane narrowed below its own width
  is a kerb strip, with no stalls, cars or meters. Whatever the full bay
  decides holds at the junction unchanged. — [road-model.md](../world-sim/road-model/README.md);
  `withTurnPocket` in `src/shared/roadprofile.ts`
- [R-roads-079] A lot's drive, walk and yard are laid to the street as it is drawn,
  turn bay included, and are re-laid when a junction gains or loses its bay or a road edit
  beside them redraws the street;
  the section without the bay puts a drive across the widened carriageway.
  Kerb-parked cars read the same drawn section: where a bay has taken the
  parking, no car stands, rather than a row at the plain section's offset
  held off only by the junction's no-parking zone. —
  [buildings.md](../art/buildings/residential-lots.md); `drawnProfileAt` in
  `src/app/clientgrid.ts`
- [R-roads-083] A street crossing a divided road is one intersection for everything
  painted: the median stores no design vehicle between the two halves (MUTCD
  1C.02 def. 113(c)). Between the halves the box carries no edge line, stop
  line, crosswalk or arrow. The crossing over the divided road runs kerb to
  kerb unbroken and the median's nose ends behind it. Where nothing divides
  a corridor's halves the crossing is one run of bars over both, and each
  stop line ends at their shared edge. The graph still holds
  a node on each half `[R-roads-054]`. —
  [how roads meet](../world-sim/road-model/how-roads-meet-rank-replacement-and-transitions.md);
  `src/shared/junctionpaint.ts`
- [R-roads-084] A raised median is one kerbed island at its section's own width wherever
  its road runs: straight, round a bend on the road's arc, and tapering where
  a neighbour's is narrower, with no step at a seam. Every end is a rounded
  nose of the island's half-width with a yellow kerb (MUTCD 3J.04 ¶02),
  behind the stop line at a junction. Solid yellow lines run both sides
  (3J.05 ¶02) and end where the nose begins. Where two roads meet in line no
  closing line crosses another. One function draws it for grid and free
  roads, and for a divided corridor, whose island is drawn once between its
  two halves. — [median, dividers and kerbs](../art/streets/median-dividers-and-kerbs.md);
  `emitIsland` in `src/render/medianisland.ts`
- [R-roads-085] A plain dead end is frontage along its two sides only: the ground it faces
  is never zoned from it, and no drive or walk meets its rounded cap. Its
  kerbs run straight to the end tile's far edge and the cap stands beyond, on
  the run-out ground; where that ground is taken the road ends square. Homes
  form round a road's end only where a cul-de-sac was built (the player's
  rule). — [cul-de-sacs.md](../specs/cul-de-sacs.md); `frontageDirs` in
  `src/world/zonable.ts`, `emitEndCap` in `src/render/roadsmesh.ts`
- [R-roads-086] A cul-de-sac is the cul-de-sac code on all four tiles of an intact 2×2
  block of street tiles beyond a dead end, and nothing else is stored; the
  code shares the junction-control byte and is never a control. One predicate
  decides it for the worker, the graph and the mirror, and coded tiles no
  longer such a block read as plain road. The bulb is one thing: no control,
  turn rule, crossing or paint on its tiles, bulldozing one removes all four,
  and undo puts them back. Every outer side is frontage, and a lot reaches
  the ring's footway along a line through its centre. —
  [cul-de-sacs.md](../specs/cul-de-sacs.md); `culDeSacBlockOf` in
  `src/shared/culdesac.ts`
- [R-roads-093] A turn bay is a short bay taper and a storage lane, never a lane-drop
  taper: one tile of taper on a street, two on a divided road or a highway,
  and full width for every tile nearer the junction. A solid white line
  divides the storage from the through lane, and the bay's arrow is painted
  at its head and before the stop line. A bay drawn at the lane-drop length
  was a wedge (the player's report). —
  [approach lanes](../world-sim/road-model/approach-lanes-turn-pockets-and-tapers.md);
  `pocketOpenness` in `src/shared/approachzone.ts`
- [R-roads-094] A crossing over an arm a signal, a stop or a give-way holds is two
  transverse white lines 0.3 m wide (MUTCD 3C.04). Bars along the traffic's
  path are for a crossing nothing holds and a crossing away from a junction
  (3C.05, 3C.03 ¶07). —
  [furniture](../world-sim/road-model/furniture-and-what-gates-it.md);
  `emitJunctionArmMarkings` in `src/render/roadsmesh.ts`
- [R-roads-095] A crossing meets the kerb where the kerb is straight: its nearer line is
  at the corner's tangent point, cut back to what the arm holds. Each end
  has a kerb ramp square to it and wholly within its lines (3C.03 ¶09), the
  kerb face dropped flush, with a detectable warning pad 0.61 m deep at the
  back of the kerb (PROWAG R305). The stop line keeps 1.2 m before it. —
  [furniture](../world-sim/road-model/furniture-and-what-gates-it.md);
  `junctionArmLayout` in `src/shared/junctionpaint.ts`
