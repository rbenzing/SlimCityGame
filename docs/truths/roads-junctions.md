# Truths — Roads: junctions, markings and ramps

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
- [R-roads-044] Yellow marks the side of a line that oncoming traffic is on, adjacent or
  not. On an undivided road that is the centre line. On a **one-way
  carriageway — a motorway, a ramp, a one-way street, either half of a
  divided road — the LEFT edge line is solid yellow and the right is solid
  white** (MUTCD §3B.09 ¶02–03); lane lines between same-direction lanes are
  broken white (§3B.06 ¶05). Every paved road carries edge lines; dirt, alley
  and rail carry no paint; one-way, highway and ramp paint no centre line. —
  [road-model.md](../world-sim/road-model/README.md); `src/render/roadmarkings.ts`
- [R-roads-045] An edge line is broken only across the mouth of a road that joins. On a
  junction tile, every side with no arm keeps its edge line for the tile's
  full length, so the far side of a T is unbroken (MUTCD 3B.09 ¶07, 3B.11
  ¶07–08). Between two arms, the edge line follows the kerb return, bending
  from one arm's inset to the other's. — [road-model.md](../world-sim/road-model/README.md);
  `src/render/roadsmesh.ts`
- [R-roads-046] A bike lane lies between two white lines: the solid bike-lane line on the
  travel side, and on the other the edge line or the parking lane line, or
  the kerb where one bounds it (MUTCD 9E.01, 9E.02). Green is only a
  supplement inside those lines (3H.06): never under a line, past one, or off
  the pavement. — [road-model.md](../world-sim/road-model/README.md);
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
  (UVC §11-1003). — [road-model.md](../world-sim/road-model/README.md);
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
  stands clear of the no-parking zones. — [road-model.md](../world-sim/road-model/README.md);
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
  (MUTCD 3B.22 ¶08–09), drawn as geometry. — [road-model.md](../world-sim/road-model/README.md);
  `src/shared/kerbstalls.ts`, `src/render/roadsmesh.ts`
- [R-roads-050] The kerb stall layout and its no-parking zones are computed in one shared
  module that the renderer and the sim both call, each reading the roads
  through a `KerbSurroundings` built by the same `roadSurroundings`; the sim
  never infers stalls another way. Every input is grid state (the road tiles,
  the profile table, the junction controls), never anything only the mesh
  knows, and nothing off the map: a lookup past the edge finds no road on
  either thread. — [parking-to-code.md](../specs/parking-to-code.md);
  `src/shared/kerblayout.ts`, `src/sim/kerbsurroundings.ts`
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
  and bends to the plain motorway over the other half. —
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
  lanes bend with the edge across a tile and never step at a seam. —
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
- [R-roads-068] A broken line is 3.05 m of paint and a 9.15 m gap (a 12.2 m period), 0.15 m
  wide, with its phase anchored at world metre 0 across every seam. —
  [road-model.md](../world-sim/road-model/README.md); `src/render/roadsmesh.ts`
- [R-roads-069] Turn arrows exist only where a lane's resolved movement set says the movement
  exists, and a single-lane approach is unmarked (MUTCD 3D.06 ¶01). Every
  arrow is the _Standard Highway Signs_ size the MUTCD points to (§3B.20 ¶05):
  a through arrow 2.90 m, a turn arrow 2.44 m, turn and through 3.89 m, stems
  0.30 m, never wider than its lane. Gore
  hatching slants away from the adjacent traffic (MUTCD 3B.25 ¶08–09). —
  [road-model.md](../world-sim/road-model/README.md)
- [R-roads-070] A roundabout carries a yield line of white triangles pointing at approaching
  traffic on every entry (MUTCD 3B.19 ¶10) and a YIELD sign on every approach
  (MUTCD 2B.10 ¶06); it is the only junction where a yield faces every approach.
  No stop bar, crosswalk or centre line runs through it, and the edge line never
  crosses an exit (MUTCD 3D.03). — [road-model.md](../world-sim/road-model/README.md)
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
- [R-roads-073] Crosswalks are derived (footway present, arm below top rank), lie against the
  kerb line, are as deep as the footway but never under 1.8 m (MUTCD 3C.03
  ¶05), and the stop line sits at least 1.2 m in advance of the crossing (MUTCD
  3B.19 ¶13). Never over an alley mouth. —
  [road-model.md](../world-sim/road-model/README.md); `src/render/roadsmesh.ts`
- [R-roads-074] An alley is an access, not a leg: no turn bay, no swept footway, no crossing
  at its mouth. A dirt track is a leg. —
  [road-model.md](../world-sim/road-model/README.md)
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
