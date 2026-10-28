# Truths — Roads: rail, tram and transit

Back to [the index](../GROUND-TRUTHS.md).

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
  [civic-access-and-bus-stops.md](../specs/civic-access-and-bus-stops.md);
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
  [transport-depots.md](../specs/transport-depots.md);
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
  [transport-depots.md](../specs/transport-depots.md);
  `assign` and `crossings` in `src/sim/transit.ts`, `src/sim/deadruns.ts`,
  `inServiceSpan` in `src/shared/transitfleet.ts`
