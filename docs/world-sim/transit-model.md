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

**Ridership** is one statistical estimate for every mode: the population
and jobs within a search radius of every stop, summed across the line,
times a per-demand rate, times a length bonus capped at 3× the base
(`1 + min(2, 0.01 × route length in tiles)`). What differs by mode is the
radius and the rate, because people walk further to a fixed, visible route
than to a corner stop, and further still to a train: a bus stop draws on an
8-tile radius at 0.15 riders per demand unit; a tram stop on 10 tiles at
0.20; a rail station on 14 tiles at 0.28. No per-agent simulation backs any
of this.

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
many vehicles a line shows is deterministic and monotonic in its
ridership: one bus per 40 riders (up to 6 per line), one tram per 90 riders
(up to 4, with at least one running the moment ridership is positive at
all, so a line that carries anyone never reads as abandoned track), one
train per 220 riders (up to 3, same floor of one).

**A stop standing mid-run, not just at the ends of a line, still finds the
network**: a stop resolves to a graph node by proximity, and a long
junction-free corridor — exactly the shape of a dedicated transit route —
only has nodes at its two ends. Snapping falls back to the nearer end of
the specific run a point stands on, so a station or a tram stop placed
partway down a long line still routes correctly rather than carrying
nobody.

Lines are saved and restored with the world; a line created after loading
resumes id assignment past the highest id the save restored.

Deferred, deliberately: no timetables, no per-vehicle capacity or bunching,
no signal-block simulation, no freight, no level crossings that stop road
traffic, no overhead wires or catenary poles, no tram priority at
junctions, no depots, and no line that mixes tram and rail track. See
[../DESIGN.md](../DESIGN.md) for the backlog.
