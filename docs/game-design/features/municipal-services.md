# Municipal services — design

- **Status:** In progress — epics 0 (service capacity), 1 (water and sewage) and 5 (garbage recovery) built, 6 (power generation) partly built; 2, 3, 4, 7 and 8 not started
- **Date:** 2026-09-18

## What the player gets

A city whose services are a system to plan rather than a checklist to satisfy.
Today a service is one building with one radius: place a clinic, the health
field goes up, done. This programme gives every service a **ladder** — a small
facility for a neighbourhood, a large one for a district, and where it is real,
a network behind it — so the question stops being "have I placed one?" and
becomes "where, how big, and what happens when it is not enough?"

It also closes the loops the city currently has no answer for: water goes in and
nothing comes out, people are born and never die, rubbish is collected and only
ever buried or burned.

## Why it earns its place

The city simulates demand it cannot answer. Every service field is satisfiable
by a single cheap building, so the interesting decision — how much of a service
to buy, and where to put it so it reaches the people who need it — never
arrives. A player who places four buildings has finished the service game
before the city is a town.

Three loops are open, and an open loop is a system the player cannot reason
about:

- **Water in, nothing out.** The city produces and distributes water. Sewage
  does not exist, so a pumping station has no consequence downstream and a
  river cannot be spoiled by the city drinking from it.
- **Birth without death.** Population grows; nobody dies, so there is no
  death care, no ageing pressure on healthcare, and no reason a hospital
  matters beyond a number going up.
- **Collection without processing.** Rubbish is collected and stored or burned.
  Nothing is recovered, so the garbage decision is "how many incinerators",
  which is one dial.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md): the player
should be able to trace a consequence back to a decision. A service that is one
building with one radius cannot be traced back to anything.

## How it works, for the player

Every service in the programme follows the same three rules, so learning one
teaches the rest.

**1. A ladder, not a switch.** Each service offers a small facility and a large
one. The small one is cheap, covers a neighbourhood, and is what a young city
can afford. The large one costs more per tile but far less per person served,
and only pays back once there are enough people to serve. Choosing too big too
early is a real mistake the budget punishes; so is a city of forty clinics.

**2. Coverage is travel, not distance.** A service reaches people down the road
network it is connected to, as it already does — the range is how far a vehicle
or a resident can get, not how far a circle reaches. So a service building on a
cul-de-sac serves less than one on a through road, and building the road is
sometimes the answer to a service problem.

**3. Capacity is people, not area.** A facility serves a number of people. When
more people depend on it than it can serve, coverage does not simply stop — the
service degrades, visibly, before it fails. An overloaded school still teaches;
it teaches worse, and the player can see that in the panel before the field
turns red.

### The services, and what each adds

| Service            | Today                 | After                                                                        |
| ------------------ | --------------------- | ---------------------------------------------------------------------------- |
| **Power**          | Two generators        | A thermal tier between them, and generation that can be outgrown             |
| **Water & sewage** | Water only            | The other half of the loop: pipes, a shore intake and an outfall are built (2026-10-02); treatment and a river you can spoil follow |
| **Healthcare**     | One clinic            | Clinic → hospital, plus care for the old and the dead                        |
| **Education**      | Elementary            | Primary → secondary → tertiary, each gating the next, plus a library         |
| **Emergency**      | One police, one fire  | A station ladder for each, sized on response time                            |
| **Garbage**        | Landfill, incinerator | Recovery, so burying is the worst option rather than the only one            |
| **Transport**      | Stops                 | Depots, so a line has somewhere its vehicles come from                       |
| **Parks**          | A pocket park         | A recreation ladder, and leisure the city can be short of                    |

Each is its own epic with its own document; this one is the frame they share.

## What it interacts with

**The service coverage field.** Today `ServiceKind` has five members and each
building projects one field. A ladder does not need a new field — a hospital and
a clinic both write `health` — but **capacity** does, because a field says how
well-served a tile is and not how many people are asking. This is the one
genuinely new concept and every epic depends on it, which is why it is built
first and alone.

**The budget.** Funding sliders already scale a service's range. Capacity gives
the slider a second, more legible meaning: money buys reach _and_ throughput,
and a player starving a service sees the reach shrink before they see a red
field.

One consequence of scaling both with the same dial is worth stating, because it
is the opposite of what it sounds like: **cutting a service's funding does not
raise its load.** Measured on a running city, health at ×0.10 reads 3% and the
same service at ×1.00 reads 8% — a narrower catchment holds fewer people, and
below the point where a facility already reaches the whole city that shrinks
demand faster than it shrinks capacity. Past that point more money does relieve
it, and ×1.50 reads 5% again. So the gauge answers "is this facility stretched
over the people it reaches", not "have I underfunded this" — the budget shows
up as the size of the area served, and the load only turns when the area stops
growing.

**Demand and growth.** Education already gates what a zone can grow into.
Adding secondary and tertiary education extends that ladder rather than
replacing it; adding death care creates the first _downward_ pressure on
population the city has ever had.

**Traffic.** Every service that dispatches vehicles — ambulances, fire engines,
garbage trucks, hearses — adds traffic. A service plan that ignores this makes
congestion worse in exactly the districts that need the service most, which is
the interesting version of the problem and should not be smoothed away.

**The save format.** Each epic adds state. The programme's rule is that a save
written before an epic loads after it, with the new service absent rather than
the save rejected — the same rule the road model has held to.

## Tuning

Every figure in these plans is **derived from a published municipal standard and
our own scale**, never picked to feel right. The city is 20 m tiles; a
per-capita figure and a tile count give a capacity, and a response time and a
speed give a radius. Worked examples belong in each epic's document, and the
settled numbers in [../balancing.md](../balancing.md).

The sources are the public-sector equivalents of the road guides already used
for the road model: fire and ambulance response-time standards, school place
planning per dwelling, hospital beds per thousand, litres per person per day for
water, kilograms per person per day for waste. Where a standard gives a range,
the plan says which end we took and why.

**Building sizes are derived too.** How large a facility is on the ground is
not a look — it follows from how many people are inside it and the floor area
per person that generic building code requires, converted to our tiles by
[../../art/civic-massing.md](../../art/civic-massing.md). A fire station is
the size of its appliance bays; a school is the size of its classrooms. Each
epic shows that arithmetic for each building it adds.

The one rule that overrides a standard: **the small facility must be affordable
to a city that has just unlocked it.** A derived figure that makes the first
school unbuyable is a wrong figure for this game, and the plan says so rather
than quietly rounding it.

### What the facilities draw (derived 2026-10-05)

Every ploppable's `powerUse` and `waterUse` is now a surveyed figure, the way
the zoned catalog's and the generators' are. The method is the massing rule
run backwards: a building's floor is its footprint times 185 m² a tile times
its storeys at 3.2 m, and that floor draws the electricity the national
building survey measures for its activity
([CBECS 2018, table C14](https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c14.pdf))
and the water the federal benchmarking programme measures for it
([EPA WaterSense at Work, benchmarking](https://www.epa.gov/system/files/documents/2024-03/ws-commercial-bmp-watersenseatwork_section2.3_benchmarking.pdf)),
averaged over the year. Before this a police station drew 0.6 MW, the power of
430 houses, and the airport 8 MW, the power of a town of six thousand.

| Building              | Floor      | Electricity                                        | Draw      | Water                                            | Draw     |
| --------------------- | ---------- | -------------------------------------------------- | --------- | ------------------------------------------------ | -------- |
| Police station (2×2)  | 29,900 sf  | public order and safety, 13.9 kWh/sf               | 47 kW     | office, 14.5 gal/sf a year                       | 4.5 kL   |
| Fire station (2×2)    | 29,900 sf  | public order and safety, 13.9 kWh/sf               | 47 kW     | fire station, 28.9 gal/sf a year                 | 9 kL     |
| Clinic (1×2)          | 7,965 sf   | health care, outpatient, 17.4 kWh/sf               | 16 kW     | medical office, 23.4 gal/sf a year               | 1.9 kL   |
| Hospital (3×5)        | 180,000 sf | health care, inpatient, 28.8 kWh/sf                | 592 kW    | hospital, 55.71 gal/sf a year                    | 104 kL   |
| School (3×3)          | 56,000 sf  | education, 9.4 kWh/sf                              | 60 kW     | K-12 school, 10.8 gal/sf a year                  | 6.3 kL   |
| Rail station (2×3)    | 33,600 sf  | transport terminal, 8.4 kWh/sf                     | 32 kW     | office, 14.5 gal/sf a year                       | 5 kL     |
| Airport (8×6)         | 418,000 sf | transport terminal, 8.4 kWh/sf                     | 400 kW    | 4 million passengers a year at 4.2 gal each      | 175 kL   |
| Incinerator (4×4)     | —          | a 250 ton-a-day combustor's own 63 kWh a ton       | 660 kW    | kept at 2 kL: no figure found                    | 2 kL     |
| Coal plant (4×4)      | —          | —                                                  | —         | fifty staff at 13 gal a day; cooling water is its own, raw | 2.5 kL |

The hospital is the one row whose floor is stated rather than read off its
footprint: 72 beds at 2,500 sf a bed (see
[healthcare-and-death-care.md](healthcare-and-death-care.md#sizes-costs-and-the-ladder-rule)),
since six of its fifteen tiles are a parking deck. Its water is the general
medical and surgical hospital median in ENERGY STAR Portfolio Manager's water
use intensity table
([US water use intensity by property type](https://www.energystar.gov/buildings/benchmark/understand-metrics/what-water-use-intensity-wui)),
the table the office, medical office and fire station medians also come from:
382 gallons a bed a day at 2,500 sf a bed.

The transport terminal's electricity is ENERGY STAR's 56.2 kBtu/sf site
median for a terminal or station
([US national median table](https://portfoliomanager.energystar.gov/pdf/reference/US%20National%20Median%20Table.pdf))
at public assembly's 51% electric share. The airport's passengers come from
its terminal: one regional terminal is sized at 125,000 sf for 600,000
enplanements
([Minot, in the FAA's NPIAS](https://www.faa.gov/sites/faa.gov/files/NPIAS-2023-2027-Appendix-C.pdf)),
so a 418,000 sf terminal boards two million and sees four million, each
drinking what a large hub's do, 4.2 gallons
([an airport water tally](https://www.chicagofaucets.com/airports-water-management-statistics-usa)).
The incinerator is the largest small municipal waste combustor the Clean Air
Act defines, 250 tons a day
([40 CFR 60 subpart AAAA](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAAA)),
using the share of its own generation a waste-to-energy fleet consumes, 17%
of about 370 kWh a ton
([a national fleet study](https://www.nature.com/articles/s41467-026-69897-w));
its water stays a dial because no figure was found. Staff water is the
office median of 13 gallons a worker a day
([ENERGY STAR DataTrends](https://www.energystar.gov/sites/default/files/buildings/tools/DataTrends_Water_20121002.pdf)).
The pocket park's 0.2 kL and the bus stop's nothing are unchanged and
unsourced; a lit shelter draws single watts. Each row is re-derived by the
catalog contract test, so a figure cannot drift from its method.

## What it is not

- **Not a building catalogue.** The point is the systems behind the buildings.
  A plan that lists twenty facilities and gives them numbers has not designed
  anything; each epic must say what decision its buildings create.
- **Not disaster simulation, and not road decay.** Catastrophes and wearing
  roads are _events_, and an event is a separate question from the service
  that answers it. A disaster station with nothing to respond to and a
  maintenance depot for roads that never break are both buildings with no
  behaviour, so neither is in this programme. See the note in the sequence.
- **Not per-citizen simulation.** Capacity is an aggregate against a coverage
  field. The city does not track which child attends which school, and nothing
  in this programme requires it to.
- **Not a rework of coverage.** Road-network BFS from the nearest road tile
  stays exactly as it is. Capacity is added beside it.
