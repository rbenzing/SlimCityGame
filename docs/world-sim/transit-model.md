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
decorative, which is the one thing this design exists to avoid.

**Tram crossings.** A tramway crosses another street at grade the way a real
one does, straight over the junction. A tramway drawn across a street leaves
the crossing tile as that street's — the street keeps its own lanes and class
there, and a tramway never takes a tile from a road it does not outrank — so
the crossing is recognised rather than stored: a straight run of one or two
joined street tiles that are not themselves tram track, with tram track joined
at both ends, is a **tram crossing** along that axis, and the tram graph counts
every tile of it as track. Two tiles is a road laid as two carriageways: the
median opens where the tramway crosses it
([road-model.md](road-model.md)), so the tram goes over both halves. Nothing is
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
the network its mode runs on — a street for a bus, the tram tier for a tram,
the railway for a train — by the same tier predicates the networks are built
from (`connectedDepots` in `src/sim/depots.ts`). Each tick the fielded
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

**Stops differ by mode.** A bus stop is a small road-adjacent catalog
ploppable, unlocked at milestone 1. A rail station is a much larger
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
beside it, since a bus stop never stands on the street but on the kerb tile
beside it. So a station or a tram stop placed partway down a long line, and a
bus stop partway down a long block, still route correctly rather than
carrying nobody. A point two or more tiles from any road is off the network
and routes to nothing.

Lines are saved and restored with the world, each with the fleet its player
asked for; a line created after loading resumes id assignment past the
highest id the save restored.

Deferred, deliberately: no timetables, no per-vehicle capacity or bunching,
no signal-block simulation, no freight, no level crossings that stop road
traffic, no overhead wires or catenary poles, no tram priority at
junctions, no dead runs between a depot and its line yet (the next slice of
[transport depots](../engineering/features/transport-depots.md)), and no
line that mixes tram and rail track. See [../DESIGN.md](../DESIGN.md) for
the backlog.
