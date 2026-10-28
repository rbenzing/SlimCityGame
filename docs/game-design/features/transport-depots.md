# Transport depots — design

- **Status:** Specified 2026-10-16 (draft of 2026-09-18 revised on the player's choices and sourced figures); slice 1, the sim, built 2026-10-16; slice 2, dead runs, built 2026-10-16; slice 3, the kits, built 2026-10-16; epic complete
- **Date:** 2026-09-18, revised 2026-10-16

Epic 7 of the programme in [municipal-services.md](municipal-services.md); the
technical plan is
[../../engineering/features/transport-depots.md](../../engineering/features/transport-depots.md).
It follows [service-capacity.md](service-capacity.md), whose load vocabulary it
borrows.

## What the player gets

A transit line stops being a drawing and becomes a service. Today a line's
vehicles come from nowhere: the simulator carries no vehicle at all, and the
buses on screen are a count derived from ridership and clamped at six. After
this epic the city owns a fleet, the fleet lives in a depot the player sited and
paid for, every vehicle in service costs what a real one costs to run, and the
number the player watches — how long they wait between vehicles — falls out of
how many vehicles that depot released onto the line.

Four new buildings, a bus depot in two sizes, a tram depot and a rail yard, and
two new numbers in the line panel: **headway**, in minutes, and the month's
**running cost**.

## Why it earns its place

Drawing a line costs nothing beyond its stops and is limited by nothing beyond
the map. Every line works as well as the first, so the transit decision is
"where", once, and never "how much". That is the flatness the programme exists
to fix, and it is worse here than elsewhere because transit is the one system
whose output the player can already watch move.

It also removes a small lie. The vehicles on screen are spaced by a density knob
rather than a schedule, and they travel at 144 km/h — seven times a real bus's
operating speed. Once a line's vehicles are a fleet the city bought, the
vehicle on screen has to be the vehicle in the arithmetic, and that is a change
visible the first time the player looks at a street.

The player chose (2026-10-16) the strict reading of the epic — **a mode with no
depot runs nothing** — over a contracted single vehicle for a line without a
base, and chose that **every vehicle in service is charged its operating
cost**, from the National Transit Database, over a depot-only bill.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md): a wait at a
stop traces back to a fleet, the fleet to a depot, and the depot to a piece of
land the player chose.

## How it works, for the player

**1. A depot holds vehicles; the city's fleet is the sum of its depots.** Each
depot states a capacity — ten buses, thirty-six buses, eight tram sets, five
train sets — and keeps a fifth of it as spares, as the FTA holds an agency to
([the 20% spare ratio of Circular 5010](https://apta.com/wp-content/uploads/APTA-Impacts-of-Spare-Ratio-Full-Report-03-2025.pdf)),
so a ten-bus depot fields eight. The pools never mix across modes.

**2. Lines draw from the pool.** Each line asks for a number of vehicles. If the
pool covers every request, everyone gets what they asked for; if not, every line
is cut back in proportion, so an under-supplied network degrades evenly rather
than starving whichever line was drawn last. A line fielded short carries riders
in proportion; a line with no vehicle carries nobody and relieves nothing.

**3. Headway is what the player actually reads.** A line's headway is its
round-trip time divided by the vehicles running it. Round-trip time comes from
the route's length and the vehicle's real operating speed, so a long line eats
more vehicles to hold the same wait — the decision this epic exists to create.

**4. A depot must stand on the network it serves.** A bus depot needs a street;
a tram depot needs tram track; a rail yard needs the railway. This is the
argument the rail station already makes with its track-adjacency rule: a tram
depot off the tramway is a shed.

**5. Vehicles drive to work.** A bus pulling out drives to its line's first stop
on the ordinary road network, in ordinary traffic, and back at the end of the
day. Those trips are simulated, so a depot on the far side of the city sends its
fleet across the city twice a day and the streets between show it.

**6. The fleet is a running cost, not a purchase.** The depot has its own
upkeep, and every vehicle in service is charged monthly on top, at what the
agencies report it costs. A depot with half its bays empty pays its whole
building bill for half a service.

**7. A mode with no depot runs nothing.** A bus line in a city with no bus
depot fields no bus, carries nobody and relieves nothing, and the panel says
why. Lines in a city saved before this epic load the same way: every one of
them stands idle until the player builds the depot that fields it. That is the
strict reading the player chose; the alternative, a contracted single vehicle
for a line without a base, was offered and declined. The demolition exploit
the draft had to price — knock the garage down, keep the buses — closes by
itself.

### The buildings

| Building               | Size       | Holds        | Fields | Needs       | Milestone |
| ---------------------- | ---------- | ------------ | ------ | ----------- | --------- |
| **Bus Depot**          | 2×2, 5.5 m | 10 buses     | 8      | A street    | 1         |
| **Central Bus Garage** | 3×4, 6.4 m | 36 buses     | 28     | A street    | 4         |
| **Tram Depot**         | 2×3, 6.0 m | 8 tram sets  | 6      | Tram track  | 3         |
| **Rail Yard**          | 3×4, 6.0 m | 5 train sets | 4      | The railway | 3         |

Four depots rather than one combined building, deliberately. A bus parks on
tarmac and swings out of its stall through twelve metres of aisle; a tram set is
twenty-two metres of vehicle on rails that cannot be parked at an angle or cross
another stabling road without a turnout; a train set is forty-six. Putting them
behind one gate builds three yards and calls them one. The placement rules argue
the same way: a combined depot would carry every adjacency gate, so it could
stand only where a street, tram track and a railway all run — the scarcest
siting constraint in the game, applied to the largest building in the epic. A
player who wants them beside each other can site them beside each other.

## What it interacts with

**Existing lines and existing cities.** The interaction that matters most. The
rule is the player's: **a mode with no depot runs nothing.** A city that has
never built a bus depot runs no bus the moment this epic lands, its lines stand
idle, and the line panel and the budget panel both say "no depot". The bus depot
unlocks at the first milestone with the bus stop, so the remedy is one building
a town can afford. Demolishing every depot of a mode idles its lines the same
way. **A line is never deleted, re-routed or stripped of stops** because of a
depot; it runs fewer vehicles, or none, and says so.

**Traffic.** Every vehicle a depot releases is a vehicle on the road, both in
service and dead-running to and from its line. This is why the epic sits late in
the programme: it is the only one whose output is measured in vehicles on the
network rather than in a coverage field. A player who sites a large garage in a
quiet suburb and runs it across town will find the congestion they built.

**The road model.** A bus lane and a tram lane are already lane pieces a player
can compose into a road
([../../world-sim/road-model.md](../../world-sim/road-model/README.md)). A dedicated
lane shortens the derived round-trip time, so for the first time those lanes buy
a number rather than a coloured stripe. Worth stating plainly about trams:
today's tram track is an ordinary street with rails embedded in its running
lanes, so a tram sits in the same traffic a bus does and its operating speed is
a bus's.

**Ridership.** Unchanged. The estimate in
[../../world-sim/transit-model.md](../../world-sim/transit-model.md) still
decides how many people ride; this epic decides how many vehicles carry them and
how long they wait, and scales what a short-fielded line carries. Those stay
different questions.

**The budget.** Transit gains a line of its own: the month's running cost
summed over every vehicle in service, beside the depots' upkeep. Fares are not
collected (see below), so transit's return is the streets it clears and the
land a station lifts.

## Tuning

Every figure derives from a published operating standard and our own scale — 20 m
tiles, a 10 m bus, a 14 m rail car, a 4.1 m clear overhead
([../../art/README.md](../../art/README.md)). Settled numbers move to
[../balancing.md](../balancing.md).

**Round-trip time, and the headway it buys.** The chain the epic hangs on:

1. Route length in tiles × 20 m is the one-way length; a line runs out and back,
   so the round trip is twice that.
2. A bus or a tram covers it at **20 km/h**, the published average commercial
   speed of urban bus service; a train at **48 km/h**, the game's own for a
   commuter service with stops a few tiles apart. Plus **15%** terminal layover,
   the middle of the published 10–20% recovery allowance.
3. Headway is that cycle divided by the vehicles in service.

State the consequence honestly: **at this map's scale a line is short, so a
small allocation buys a frequency that would be extravagant in a real city.**
The scarcity the player feels is across lines, not within one — a ten-bus depot
runs one long line beautifully or five short ones adequately. We have not slowed
the bus to make a single line feel tight.

**What a line asks for** is the larger of two derived numbers:

- **Frequency:** the fleet that buys a 10-minute headway, the conventional
  threshold at which riders stop consulting a timetable and turn up —
  `ceil(cycle ÷ 10)`.
- **Capacity:** the fleet that carries the peak. The ridership estimate is
  declared to be **daily boardings**, and peak-hour boardings are **10% of
  daily**, the standard urban planning share. A bus carries **48** and a tram
  set **150** — the figures the road model already derives its bus-lane and
  tram-track throughputs from — and a three-car train set **450**, three
  bilevel coaches at 136–162 seats each
  ([Bombardier BiLevel](https://en.wikipedia.org/wiki/Bombardier_BiLevel_Coach)).
  So `ceil(peak × cycle_hours ÷ capacity)`.

Worked: a line drawing 6,000 daily boardings over a 150-tile route has a
600-rider peak hour and a 0.345-hour cycle, so capacity asks for
`600 × 0.345 ÷ 48` = 4.3 → **5 buses**, against frequency's 3. It runs five, at
a 4.1-minute headway.

**Depot sizes, derived from the vehicles inside them.** A bus is 10.0 m × 2.5 m
and 3.0 m tall. Published bus parking puts a 12.2 m bus in a 13.7 m × 3.66 m
stall — 1.5 m longitudinal and 1.07 m lateral clearance — so our 10 m bus takes
an **11.5 m × 3.6 m stall**, with the published **12.2 m aisle** for 90° bus
stalls between facing rows. (The 7.3 m aisle in
[../../art/civic-massing.md](../../art/civic-massing.md) is a car figure; a bus
needs its own length to swing.) Maintenance runs at **one bay per ten buses**,
the lean end of transit facility planning (one per fifteen is the common
figure, [Walker](https://walkerconsultants.com/planning-beyond-the-route-addressing-transit-planning-maintenance-constraints/);
Washington's streetcar plans one per nine,
[DDOT](https://ddot.dc.gov/sites/default/files/dc/sites/ddot/publication/attachments/dctf_4_p45-p54.pdf)),
and a bay is our own 4.9 m × 18.3 m drive-through figure. One fuelling position
turns a bus round in five minutes, so over a six-hour overnight window it serves
72 — one is always enough; a wash lane at three minutes serves 120. Staffing is
**2.5 operators per peak vehicle** plus a fitter per eight, of whom about a
third are on site at once, at the 13.9 m² business occupancy factor.

For the **10-bus depot**: two rows of five about one aisle is 18.0 × 35.2 m =
634 m² of apron, plus a 7.2 × 20 m drive (144 m²) — 778 m² of open ground, or
1.95 tiles at the full 400 m² a tile of open yard holds. Covered: one
maintenance bay, one fuelling position, one wash lane (270 m²) and 125 m² of
office = 395 m², which at 185 m² per tile of body over one level is 2.14 tiles.
**4.09 tiles → a 2×2**, and the 40 m square genuinely holds a 35.2 m apron
entered from the side. Height: the floor-area arithmetic alone gives a 1.7 m
building, which is shorter than the bus inside it, so the clearance rule
overrides — a 4.1 m clear bay door (our own unobstructed-overhead figure for a
10 m appliance) plus 1.3 m of roof over the 14.7 m three-bay span gives
**5.5 m**. The built examples agree on the order: 246 buses on 4.4 acres at
San Francisco's four-storey Potrero yard
([SFMTA](https://www.sfmta.com/node/22330)), 200 on 10 at Minneapolis's
Heywood II
([Metro Transit](https://metrocouncil.org/Council-Meetings/Committees/Metropolitan-Council/2017/9-13-17/0913_2017_133.aspx));
ten on 0.4 acres sits between them.

The **36-bus garage** adds a second double row, and that is what sets its size:
two rows of stalls with their aisles are 70.4 m deep and nothing shorter holds
them. Four rows of nine is 32.4 × 70.4 m = 2,281 m² of apron; four maintenance
bays, two fuelling positions, one wash and a two-storey office for 32 on site
give 4.59 tiles of body against 6.15 of yard, **10.74 → a 3×4**. The office is
taller than the hall, so **6.4 m**.

The **tram depot** is sized by a vehicle that cannot turn. A set is two 11 m
cars and a 0.4 m coupling — **22.4 m** — stabled on roads at our own 3.5 m tram
lane spacing, reached through a 20 m depot turnout lead. Eight roads is 28.0 m
wide × 42.4 m deep = 1,187 m² of open track, 2.97 tiles. Covered: one
maintenance road (22.4 m plus 3 m of working room each end, 4.9 m wide), one
wash road and 97 m² of office = 375 m² = 2.03 tiles. **5.0 tiles, and a 42.4 m
depth will not fit in 40 m → a 2×3** — the rail station's footprint, for the
rail station's reason. Height is set by the wire rather than the tram: 4.6 m
minimum contact-wire clearance plus 0.95 m of roof over the 9.8 m span, rounded
up to **6.0 m**. There is no fuelling position, because a tram takes its current
from the wire; that missing line item is the clearest difference between the two
yards. Oklahoma City stables six cars, growing to twelve, on 2.7 acres
([OKC](https://okc.gov/home/showdocument?id=4542)) and Kansas City four on
two ([KC Streetcar](https://kcstreetcar.org/the-singleton-yard-goes-vertical/));
eight on 0.6 acres is the dense end, which a 20 m tile is.

The **rail yard** is sized the same way by a set that cannot turn either: three
14 m cars at a 15.2 m pitch — **45.6 m** — stabled on roads at a 4.5 m track
spacing, reached through a 20 m turnout lead off the main line, so the yard
lies along the railway. Five roads is 22.5 m wide × 65.6 m deep = 1,476 m² of
open track, 3.7 tiles; covered: one maintenance road (45.6 m plus 3 m each end,
6 m wide), one wash road and 125 m² of office = 737 m² = 4.0 tiles; a 7.2 × 20 m
drive, 0.36. **8.1 tiles, and a 65.6 m depth needs 80 m → a 3×4, the long side
on the railway.** A diesel set needs a fuelling position and no wire: a 4.6 m
clear shop door under 1.4 m of roof over the 12 m two-road span gives **6.0 m**.
Caltrain keeps about a hundred cars on 20 acres
([CEMOF](https://www.caltrain.com/projects/central-equipment-maintenance-facility-cemof))
and Denver 80 on 30
([RTD](https://www.rtd-denver.com/projects/commuter-rail-maintenance-facility));
fifteen on 1.2 acres is, again, the tile's density.

**Money.** Prices follow the civic rule the player set for the stations and
death care: the real cost against the fire station's $8M at ¢4,500, so ¢1 is
about $1,780. A bus base costs **$0.53M a bus** (Heywood II, $106M for 200);
a streetcar depot **$0.9M a car** (Oklahoma City's $5.4M for six); a rail yard
**$1.4M a car** (Caltrain's $140M for about a hundred). Monthly upkeep holds
the catalog's established 6–8% of build cost for the building, which is
premises and nothing else; what runs is charged below.

| Building           | Capital                | Price   | Upkeep |
| ------------------ | ---------------------- | ------- | ------ |
| Bus Depot          | 10 × $0.53M = $5.3M    | ¢3,000  | ¢200   |
| Central Bus Garage | 36 × $0.53M = $19.1M   | ¢10,700 | ¢700   |
| Tram Depot         | 8 × $0.9M = $7.2M      | ¢4,050  | ¢280   |
| Rail Yard          | 15 cars × $1.4M = $21M | ¢11,800 | ¢800   |

The ladder lives in the per-vehicle figure: ¢200 ÷ 10 is ¢20 per bus of
capacity, ¢700 ÷ 36 is ¢19 — the garage is cheaper per bus to keep, which is
the reason to build it, and smaller than the draft's 17% because the price is
now the real one.

**Running cost, per vehicle in service.** The agencies report operating cost
per revenue hour — a bus about **$200** (the 2023 profiles run $149 at North
County to $275 at MTA Bus,
[NTD](https://www.transit.dot.gov/sites/fta.dot.gov/files/transit_agency_profile_doc/2023/90030.pdf),
[NTD](https://www.transit.dot.gov/sites/fta.dot.gov/files/transit_agency_profile_doc/2023/20188.pdf)),
a commuter train **$702** a train-hour (North County, the same source), and a
streetcar **$350**, the game's own between them where no figure was found. At
twelve revenue hours a day:

| Vehicle   | A month's running | Charged |
| --------- | ----------------- | ------- |
| Bus       | $72,000           | ¢40     |
| Tram set  | $126,000          | ¢70     |
| Train set | $253,000          | ¢142    |

The NTD figure is the whole of operations, maintenance included, so the
depot's upkeep above is premises only and the two do not count a fitter twice.

**What the depots draw**, by the method of
[municipal-services.md](municipal-services.md#what-the-facilities-draw-derived-2026-10-05):
the covered floor derived above at the transport terminal's 8.4 kWh a square
foot a year and the office's 14.5 gallons, the categories the rail station
already uses; the bus wash's water is reclaimed and not counted.

| Building                                                                        | Covered floor    | Power  | Water a day |
| ------------------------------------------------------------------------------- | ---------------- | ------ | ----------- |
| Bus Depot                                                                       | 395 m², 4,250 sf | 4.1 kW | 0.6 kL      |
| Central Bus Garage                                                              | 849 m², 9,140 sf | 8.8 kW | 1.4 kL      |
| Tram Depot                                                                      | 375 m², 4,040 sf | 3.9 kW | 0.6 kL      |
| Rail Yard                                                                       | 737 m², 7,930 sf | 7.6 kW | 1.2 kL      |
| A Metropolis running ten bus lines at six buses pays ¢2,400 a month for them,   |
| about a hospital and a half; that is what a transit agency costs, and the panel |
| says so per line.                                                               |

## What it is not

- **Not a timetable.** No departures, no schedules, no bunching. Headway is a
  derived number the panel reports and the render spaces vehicles by.
- **Not per-vehicle rider capacity, and not driver or shift simulation.** A bus
  does not fill up and leave people behind; the capacity figure sizes the fleet
  and stops, and staffing appears once as floor-area input to the office.
- **Not fares.** Riders pay nothing; farebox recovery, a fifth to a third of
  operating cost across US agencies, is a later dial.
- **Not a rework of ridership or routing.** Both are unchanged; this epic adds a
  supply side to a demand model that already works.
- **Not a road-maintenance depot.** Roads do not decay, so a depot for repairing
  them is a building with no behaviour — see the note on absent categories in
  [municipal-services.md](municipal-services.md) and [../../DESIGN.md](../../DESIGN.md).
- **Not a rule on growth:** no first-town step depends on a depot.
