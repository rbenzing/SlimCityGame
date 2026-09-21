# Transport depots — design

- **Status:** Draft
- **Date:** 2026-09-18

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
paid for, and the number the player watches — how long they wait between
vehicles — falls out of how many vehicles that depot released onto the line.

Two new buildings, a bus depot in two sizes and a tram depot, and one new number
in the line panel: **headway**, in minutes.

## Why it earns its place

Drawing a line costs nothing beyond its stops and is limited by nothing beyond
the map. Every line works as well as the first, so the transit decision is
"where", once, and never "how much". That is the flatness the programme exists
to fix, and it is worse here than elsewhere because transit is the one system
whose output the player can already watch move.

It also removes a small lie. The vehicles on screen are spaced by a density knob
rather than a schedule, and they travel at roughly 115 km/h — five times a real
bus's operating speed. Once a line's vehicles are a fleet the city bought, the
vehicle on screen has to be the vehicle in the arithmetic, and that is a change
visible the first time the player looks at a street.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md): a wait at a
stop traces back to a fleet, the fleet to a depot, and the depot to a piece of
land the player chose.

## How it works, for the player

**1. A depot holds vehicles; the city's fleet is the sum of its depots.** Each
depot states a capacity — ten buses, thirty-six buses, eight tram sets. The two
pools never mix.

**2. Lines draw from the pool.** Each line asks for a number of vehicles. If the
pool covers every request, everyone gets what they asked for; if not, every line
is cut back in proportion, so an under-supplied network degrades evenly rather
than starving whichever line was drawn last.

**3. Headway is what the player actually reads.** A line's headway is its
round-trip time divided by the vehicles running it. Round-trip time comes from
the route's length and a bus's real operating speed, so a long line eats more
vehicles to hold the same wait — the decision this epic exists to create.

**4. A depot must stand on the network it serves.** A bus depot needs a street;
a tram depot needs tram track. This is the argument the rail station already
makes with its track-adjacency rule: a tram depot off the tramway is a shed.

**5. Vehicles drive to work.** A bus pulling out drives to its line's first stop
on the ordinary road network, in ordinary traffic, and back at the end of the
day. Those trips are simulated, so a depot on the far side of the city sends its
fleet across the city twice a day and the streets between show it.

**6. The fleet is a running cost, not a purchase.** The depot has its own
upkeep, and every vehicle in service is charged monthly on top. A depot with
half its bays empty pays its whole building bill for half a service.

**7. A city with no depot is unchanged.** Every line that exists today keeps
running exactly as it does; the depot becomes the ceiling only once the city has
built one.

### The buildings

| Building               | Size       | Fleet       | Needs      | Milestone |
| ---------------------- | ---------- | ----------- | ---------- | --------- |
| **Bus Depot**          | 2×2, 5.5 m | 10 buses    | A street   | 2         |
| **Central Bus Garage** | 3×4, 6.4 m | 36 buses    | A street   | 4         |
| **Tram Depot**         | 2×3, 6.0 m | 8 tram sets | Tram track | 3         |

Two depots rather than one combined building, deliberately. A bus parks on
tarmac and swings out of its stall through twelve metres of aisle; a tram set is
twenty-two metres of vehicle on rails that cannot be parked at an angle or cross
another stabling road without a turnout. Putting both behind one gate builds two
yards and calls them one. The placement rules argue the same way: a combined
depot would carry both adjacency gates, so it could stand only where a street
and tram track both run — the scarcest siting constraint in the game, applied to
the largest building in the epic. A player who wants both beside each other can
site them beside each other.

## What it interacts with

**Existing lines and existing cities.** This is the interaction that matters
most, because getting it wrong breaks every save. The rule is the one epic 0
sets for capacity: **a mode with no depot is uncapped.** A city that has never
built a bus depot runs its bus lines exactly as it does today. The ceiling
appears the first time a depot of that mode is built, and that depot's build
panel says what the city's lines currently run before the player commits, so the
change is never a surprise.

Demolishing every depot of a mode returns it to uncapped, which would otherwise
be an exploit — knock the garage down, keep the buses, save its upkeep. It is
closed by price rather than by a rule: a vehicle with no depot behind it is
charged what a depot would have cost per vehicle to keep, so demolishing is
never cheaper than the smallest depot that would have held the fleet.

**Traffic.** Every vehicle a depot releases is a vehicle on the road, both in
service and dead-running to and from its line. This is why the epic sits late in
the programme: it is the only one whose output is measured in vehicles on the
network rather than in a coverage field. A player who sites a large garage in a
quiet suburb and runs it across town will find the congestion they built.

**The road model.** A bus lane and a tram lane are already lane pieces a player
can compose into a road
([../../world-sim/road-model.md](../../world-sim/road-model.md)). A dedicated
lane shortens the derived round-trip time, so for the first time those lanes buy
a number rather than a coloured stripe. Worth stating plainly about trams:
today's tram track is an ordinary street with rails embedded in its running
lanes, so a tram sits in the same traffic a bus does and its operating speed is
a bus's.

**Ridership.** Unchanged. The estimate in
[../../world-sim/transit-model.md](../../world-sim/transit-model.md) still
decides how many people ride; this epic decides how many vehicles carry them and
how long they wait. Those stay different questions.

## Tuning

Every figure derives from a published operating standard and our own scale — 20 m
tiles, a 10 m bus, a 4.1 m clear overhead
([../../art/README.md](../../art/README.md)). Settled numbers move to
[../balancing.md](../balancing.md).

**Round-trip time, and the headway it buys.** The chain the epic hangs on:

1. Route length in tiles × 20 m is the one-way length; a line runs out and back,
   so the round trip is twice that.
2. **Commercial speed, 20 km/h (5.56 m/s).** National reporting of fixed-route
   bus operations puts average system speed at about 12.7 mph, and transit
   capacity guidance places urban bus commercial speed between 15 and 25 km/h
   once dwell and signals are counted. We take the middle, which is also the
   reported average. It is not the road's posted speed — the two-lane tier runs
   at 50 km/h — and the difference is stops.
3. **Layover, 15%**, the middle of the published 10–20% terminal recovery
   allowance.
4. So **cycle = 2 × length ÷ 5.56 × 1.15**, and **headway = cycle ÷ vehicles.**

For a 60-tile line: 1,200 m out, 2,400 m round trip, 432 s of running, 497 s
with layover — an **8.3-minute cycle**. One bus gives an 8.3-minute headway, two
give 4.2, four give 2.1. For a 150-tile line the cycle is **20.7 minutes**, so
four buses give 5.2 and ten give 2.1.

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
  tram-track throughputs from. So `ceil(peak × cycle_hours ÷ capacity)`.

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
the lean end of transit facility planning, and a bay is our own 4.9 m × 18.3 m
drive-through figure. One fuelling position turns a bus round in five minutes,
so over a six-hour overnight window it serves 72 — one is always enough; a wash
lane at three minutes serves 120. Staffing is **2.5 operators per peak vehicle**
plus a fitter per eight, of whom about a third are on site at once, at the
13.9 m² business occupancy factor.

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
**5.5 m**.

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
yards.

**Money.** Civic ploppables in the catalog run 1,000–1,250 per tile and their
monthly upkeep is consistently 6–8% of build cost, so we hold that ratio rather
than invent one. A depot is mostly tarmac, so it takes the low end: **bus depot
4,000 / 280**, **garage 12,000 / 840**. The tram depot's ground is track, which
the road catalogue prices at 3.5× tarmac, giving **13,500 / 950**.

The ladder lives in the per-vehicle figure: 280 ÷ 10 is 28 per bus of capacity,
840 ÷ 36 is 23 — the garage is 17% cheaper per bus to keep, which is the whole
reason to build it. Fleet cost is charged separately, at **65 per bus and 130
per tram set per month, per vehicle in service**, from the share of transit
operating cost that is labour and energy rather than premises. A vehicle running
with no depot pays **93** instead — the in-service charge plus the small depot's
own cost per bay — which is what closes the demolition exploit.

## What it is not

- **Not a timetable.** No departures, no schedules, no bunching. Headway is a
  derived number the panel reports and the render spaces vehicles by.
- **Not per-vehicle rider capacity, and not driver or shift simulation.** A bus
  does not fill up and leave people behind; the capacity figure sizes the fleet
  and stops, and staffing appears once as floor-area input to the office.
- **Not a rework of ridership or routing.** Both are unchanged; this epic adds a
  supply side to a demand model that already works. **Not rail**, either —
  trains have no depot here, and the pool rule is written so a third mode costs
  one table entry when it arrives.
- **Not a road-maintenance depot.** Roads do not decay, so a depot for repairing
  them is a building with no behaviour — see the note on absent categories in
  [municipal-services.md](municipal-services.md) and [../../DESIGN.md](../../DESIGN.md).
