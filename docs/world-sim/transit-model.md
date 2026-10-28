# Transit model

Rail, trams, and buses.

A transit **line** is an ordered list of stops and a mode — `bus`, `rail` or
`tram`, defaulting to bus — with everything else about a line (its id, its
colour, its stop list) shared across all three. A single, network-agnostic
module computes every line's route and ridership; the only thing that
changes per mode is which network the line routes over, which vehicle
represents it, and the rates its ridership estimate uses. There is one
route computer (a stop-to-stop A* concatenation, shared junction tiles
between consecutive legs de-duplicated) and one ridership estimator for all
three modes.

**Networks.** The road network, the rail network and the tram network are
the same graph-building code parameterised by a different tier predicate,
not three separate implementations. The rail network's tiles are disjoint
from the street network by construction — rail is not a street, and no
drivable vehicle, pathfinding query or utility conduction ever crosses onto
it. The tram network is different: tram track is also a street (cars drive
over it exactly as over any other road), so a tram tile sits in both graphs
at once, but a tram line itself only ever routes over the tram graph — a
tram that could route down any street would make the embedded track
decorative, which is the one thing this design exists to avoid. Tram track
is read from the profile each tile carries, never from its tier alone: any
street whose cross-section carries a tram lane, mixed or reserved, is track
(`isTramTrack` in `src/shared/roadprofile.ts`), the Tramway preset among
them, so a tram lane composed onto any road joins the tram graph. The tram
graph sees every cell of it as the tram tier, which is the one predicate it
admits edges by. A reservation's tracks run on an elevated guideway above
their street ([../art/streets.md](../art/streets/README.md)); in the graph they are
the same track, and a line runs from a guideway onto a street tramway and
back through the ramp where the two meet, so a tram depot at grade fields a
guideway line. A stop on a guideway tile is served like any other; on the
ground it is drawn as a raised station where the beams are at full height on
a straight tile, and as nothing on a ramp tile, a junction box or a turn
([../art/streets.md](../art/streets/README.md)).

**Tram crossings.** A street tramway crosses another street at grade the way
a real one does, straight over the junction; a guideway crosses it the same
way in the graph and overhead on the ground. A tramway drawn across a street leaves
the crossing tile as that street's — the street keeps its own lanes and class
there, and a tramway never takes a tile from a road it does not outrank — so
the crossing is recognised rather than stored: a straight run of one or two
joined street tiles that are not themselves tram track, with tram track joined
at both ends, is a **tram crossing** along that axis, and the tram graph counts
every tile of it as track. Two tiles is a road laid as two carriageways: the
median opens where the tramway crosses it
([road-model.md](road-model/README.md)), so the tram goes over both halves. Nothing is
saved for it, so it comes and goes with the tramway: take one tram arm away
and the tiles are an ordinary junction again. A tram may only go straight over
a crossing, never turn onto the street it is crossing, because the street has
no track to turn onto. (`tramCrossingAxes` in `src/shared/types.ts`.)

**Ridership** is one statistical estimate for every mode, and its unit is
**daily boardings**: the population and jobs within a search radius of every
stop, summed across the line, times a per-demand rate, times a length bonus
capped at 3× the base (`1 + min(2, 0.01 × route length in tiles)`). What
differs by mode is the radius and the rate, because people walk further to a
fixed, visible route than to a corner stop, and further still to a train: a
bus stop draws on an 8-tile radius at 0.15 riders per demand unit; a tram
stop on 10 tiles at 0.20; a rail station on 14 tiles at 0.28. No per-agent
simulation backs any of this. That estimate is the line's demand; what the
line carries is that demand scaled by the share of its fleet the depots
fielded (below), so a line with no vehicle carries nobody.

**Depots.** A line's vehicles come from a depot of its mode, never from
nowhere. The bus depot and the central bus garage field buses, the tram depot
tram sets and the rail yard train sets; each holds a stated fleet and fields
all but a spare fifth of it (`fieldsOf` in `src/shared/transitfleet.ts`), and
only while it stands built, with power on its lot and its footprint touching
the network its mode runs on — a street for a bus, tram track for a tram, the
railway for a train — by the same predicates the networks are built from
(`connectedDepots` in `src/sim/depots.ts`; `isTramTile` for tram track). Each tick the fielded
vehicles of a mode's depots sum into that mode's pool. Each line asks for a
fleet: the player's own figure (`TransitLine.vehicles`) or, absent one, the
larger of the fleet that holds a ten-minute headway and the fleet that
carries the peak hour, a tenth of its daily boardings at 48 a bus, 150 a tram
set and 450 a train set (`defaultFleet`), the derived figure held steady
across a one-vehicle dip so it never flickers. The pool is shared out in
ascending line id: every line gets its request when the pool covers the lot,
and otherwise each gets its proportional floor with the remainders handed
down the list one at a time, so the served counts sum to exactly the pool
(`allocate`). **A mode with no depot has a pool of zero and every line of it
runs nothing**, carries nobody and relieves nothing; the line panel says so
and names the depot to build. A line's round trip is twice its route length
at the mode's commercial speed — 20 km/h for a bus or a tram in traffic,
48 km/h for a train — plus 15% terminal layover (`cycleSeconds`), and its
headway is that cycle over the vehicles it runs (`headwayMin`). Every vehicle
in service is charged a month's running cost, ¢40 a bus, ¢70 a tram set and
¢142 a train set, summed into the budget's `transitRunning` expense beside
the depots' own upkeep (`runningCost`). The pool is never stored: it is
re-read from the standing buildings every tick, so a save from before depots
loads with every line idle until one is built.

**Dead runs.** A line's vehicles come from a particular depot, and drive to
work. Per mode, the lines in id order take their served vehicles from the
nearest connected depot with vehicles left — nearest by path cost over the
mode's own graph from the depot's gate (the footprint tile nearest the
network, by the node it snaps to) to the line's first stop, ties by depot
id — and spill to the next nearest when it runs dry; the depot fielding most
of a line is its depot (`depotId` in the snapshot), and a depot's "in
service" is what left it. The dead-run path, `findPath(gate, stops[0])`, is
cached per line and found again only when the line's route or the mode's
depots change, or the graph is rebuilt under it. The service span is 05:00
to 23:00 on the clock the sky keeps (`dayHourFromTick`, so a visual day): at
the tick the clock crosses 05:00 every bus line's path takes its served
vehicles of volume on each edge, the pull-out, and at 23:00 the same again,
the pull-in — once each per day, decaying with the day as every trip does.
Its buses are simulated (`src/sim/deadruns.ts`), in the shared vehicle
buffer as `VehicleKind.Bus`: at pull-out they leave the gate along the path
one per headway at the commercial speed and are dropped at the first stop;
at pull-in the same number drive it back and are dropped at the gate; a new
run takes over from whatever of the last is still out. The renderer hides a
line's looping vehicles outside the span, so the street shows buses pulling
out at dawn, the line running by day and the buses going home at night. A
tram or a train dead-runs over its own graph, which carries no traffic, and
no vehicle kind draws it: neither loads nor animates anything.

**Congestion relief** feeds ridership back into the road network, but the
formula differs by how a mode actually removes cars from the street:

- A **bus** relieves the road edges its own route drives over — riders it
  carries would otherwise have driven those exact streets.
- A **tram** shares the street with cars, so its riders would have driven
  the very road it runs down — but its route comes off the tram graph,
  whose edge ids are a private numbering that does not correspond to the
  road graph's. Relieving by those ids would silently improve traffic
  somewhere else in the city, so a tram's relief route is recomputed
  against the road network instead, which can carry it because tram track
  is itself a street.
- A **train** drives over no road edge at all, so route relief would
  relieve nothing. Its riders' car trips would instead have started or
  ended at a station, so relief lands on the road edges nearest each
  station's own door (the edges of the road network's closest node to each
  stop), deduplicated across stops that share a doorstep street. A station
  with no street within reach relieves nothing, correctly — nobody could
  have driven there anyway.

In every case the relief taken off an edge is `ridership × 0.02`
(`CONGESTION_RELIEF_PER_RIDER`), clamped so an edge's volume never goes
negative.

**Stops differ by mode.** A bus stop is road furniture on one side of a
street tile, never a building on a tile of its own: a sign on a pole on an
8 ft by 5 ft boarding pad, or a shelter on the same pad, placed by its own
tool on the side of the road the pointer is on and unlocked at milestone 1.
A bus line's stops name the street tiles those stops stand on; a tile with
no stop cannot be a bus line's stop, and taking the last stop off a tile
takes the tile off every line. Each stop keeps its boardings a day, the
sum over the lines calling at it; a shelter that 25 or more board a day is
warranted and sells its ad panel for ₵7 a month against its ₵10 upkeep,
while a sign costs and earns nothing
([civic-access-and-bus-stops.md](../specs/civic-access-and-bus-stops.md)).
A rail station is a much larger
ploppable (a 2×3 footprint) gated on standing adjacent to rail track rather
than to a street — the first ploppable in the game whose placement rule is
not "next to a road" — unlocked at milestone 3. A tram stop is neither: it
is a shelter only, with no ploppable, no land taken and no milestone gate
beyond the track's own, which is the whole of a tram's economic argument
against a railway.

**Vehicles are cosmetic**, the same way traffic's cars are: a bus is a
single vehicle; a train is three cars and a tram two, one shared lead
distance per set with each following car holding a fixed distance behind
it, clamped rather than wrapped at the ends of an open route so a set
queues briefly at its terminus instead of tearing apart across it. How
many vehicles a line shows is the sim's own count — the `served` figure the
snapshot carries, never a number derived from ridership on the render
thread — spaced evenly round the route at one served-th of its length, so
the gap between them on screen is the headway the panel reports, and moving
at the commercial speed that headway is worked out from.

**A stop standing mid-run, not just at the ends of a line, still finds the
network**: a stop resolves to a graph node by proximity (within 8 tiles), and
a long junction-free corridor — exactly the shape of a dedicated transit
route — only has nodes at its two ends. Snapping falls back to the nearer end
of the specific run a point stands on, or of a run on one of the four tiles
beside it, which a rail station still needs, standing beside its track; a
bus stop names its own street tile. So a station or a tram stop placed partway down a long line, and a
bus stop partway down a long block, still route correctly rather than
carrying nobody. A point two or more tiles from any road is off the network
and routes to nothing.

Lines are saved and restored with the world, each with the fleet its player
asked for; a line created after loading resumes id assignment past the
highest id the save restored.

Deferred, deliberately: no timetables, no per-vehicle capacity or bunching,
no signal-block simulation, no freight, no level crossings that stop road
traffic, no overhead wires (the contact poles are drawn, the wire is not),
no tram priority at junctions, no animated tram or train dead runs, and no
line that mixes tram and rail track. See [../DESIGN.md](../DESIGN.md) for the backlog.
