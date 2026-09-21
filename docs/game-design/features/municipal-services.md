# Municipal services — design

- **Status:** Draft
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
| **Water & sewage** | Water only            | The other half of the loop: collection, treatment, and a river you can spoil |
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
