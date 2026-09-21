# Service capacity — design

- **Status:** Draft
- **Date:** 2026-09-18

Epic 0 of the municipal services programme
([municipal-services.md](municipal-services.md)), built alone and first because every
later epic consumes it. The technical plan is
[../../engineering/features/service-capacity.md](../../engineering/features/service-capacity.md).

## What the player gets

A service the player can see the state of, and a dial they can turn.

Today neither exists. A service is placed and then forgotten: the building writes its
field, the field goes up, and nothing reports whether that clinic is coping. The funding
dial is worse off than that — it is in the simulation, it scales range and upkeep, and
**no control anywhere in the game reaches it**. A player cannot raise or lower a
service's funding because there is nothing to click.

After this epic there is a **Services panel**: one row per service, each row a funding
slider and a load gauge, sitting together because they are the two halves of one
decision. The gauge answers "is this service coping"; the slider and a second facility
are the two things the player can do about it.

It adds no buildings. It adds the number that makes the buildings mean something: a
facility serves a quantity of **people**, not just an area, and when more people depend
on it than it can serve it gets visibly worse.

## Why it earns its place

Two problems, which are the same problem from either end.

**A service is satisfiable once.** Place a clinic, the health field goes up, and the
health question is answered for the rest of the game however large the city grows. There
is no pressure to build a second, so no siting decision and no budget decision. A city of
five hundred and a city of fifty thousand ask a clinic for the same thing, which is
nothing.

**The one dial that already exists is unreachable.** Service funding runs 0 to 1.5 and
scales a facility's range and its upkeep. It is in the city's stats and in the worker's
command set, and it has never had a control in the interface. That is a pre-existing gap,
not scope invented here, and it is why the funding half of the service decision has never
been played.

Capacity fixes the first by giving a facility a limit; the panel fixes the second by
giving the limit somewhere to be read. Neither works alone: a limit nobody can see is a
difficulty setting, and a slider with nothing to read against it is a guess.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md). "The school is at 180%
because the east district grew and I never built a second one" is the first service
consequence in this game that can be traced back to a decision.

## How it works, for the player

**A facility serves a number of people.** Each service building is worth a stated figure
— a police station is built around the establishment that patrols a town, a school around
the classes it has. That figure is its capacity.

**Load is people in reach divided by places available.** Reach is exactly what it already
was: the facility walks the road network it is connected to, out to its funding-scaled
range, and covers what it can get to. Every resident living in reach counts against it,
whether or not they ever use it — the city does not track who attends which school, only
how many people lean on it.

**Over capacity a service degrades; it does not fail.** At 200% load a facility does half
the good it would, at 400% a quarter, with no threshold to fall over. An overloaded
school still teaches; it teaches worse, and the panel says so long before the education
field looks alarming.

**Facilities that reach the same ground pool their capacity.** Two clinics covering one
neighbourhood are, for load, one clinic of twice the size — so the crowded district's
answer is a second clinic anywhere that reaches it, not one on the same street. It is
also why building another is always a real answer: two half-loaded clinics and one fully
loaded clinic covering the same people produce the same coverage.

**A facility with no capacity figure is uncapped.** Parks have none and never will:
nobody queues for a park, and a park that got worse the more people lived near it would
be a strange thing to model. Anything else without a figure is uncapped too, which keeps
every city built before this epic behaving as it did.

### The Services panel

It opens from the main dock and floats in the left-hand slot the district and transit
panels use. One row per service — Police, Fire, Health, Education, Parks — each carrying
three things:

- **A load gauge**, as a percentage. `Health 138%` means the city's clinics are asked for
  38% more than they can give. Under 100% is not a problem, and the gauge does not reward
  overbuilding.
- **The worst district**, a second smaller figure. A city can sit at 95% overall while
  one district is at 240% because its facilities are the wrong side of a river. The
  aggregate hides that; this is why the gauge is two numbers.
- **A funding slider**, 0 to 1.5, at last reachable. Funding buys reach and throughput
  together: a service at 1.5 covers half again as far and serves half again as many
  people, and its upkeep rises by the same half again — the charge the economy already
  makes.

The two answers share a row on purpose. Money is rented — turn the slider up tonight, pay
for it every month — and a building is owned; splitting them across two screens is how
funding became invisible in the first place. Parks read `—`, because an uncapped service
has no load, and the row is still there so the funding slider is.

## What it interacts with

**Coverage.** Unchanged — the road walk from the nearest road tile, the funding-scaled
range, the two-tile radiation, the per-kind blend. Capacity is a multiplier on what a
facility contributes, not a new way of deciding where.

**The budget.** Funding already scaled range and upkeep; it now scales capacity by the
same factor, which is the "money buys reach _and_ throughput" the programme promised.
That upkeep already moved with it matters: the price of turning the slider up is charged
today, so this epic makes an existing cost legible rather than adding one.

**Growth.** The education field gates what a residential zone can grow into. An
overloaded school writes a weaker field, so a district that outgrows its school stops
levelling up until the school is answered — the first time growth has pushed back on
itself.

**The ladder epics.** Every service epic that follows puts a large facility beside a small
one, and capacity is what makes the large one worth its price: more people served per
tile of ground and per coin of upkeep. Without it a hospital and a clinic are the same
building at different prices.

**Saves.** A city saved before this epic loads after it and plays the same. The save does
not change — capacity is catalog data, not saved state.

## Tuning

Every figure comes from a published per-capita provision standard and our own scale, and
shows its arithmetic. Settled values belong in [../balancing.md](../balancing.md).

**Police station — 25,000 people.** Full-time sworn officers per 1,000 residents in the
United States has sat at about **2.4** for two decades, across a range from roughly 1.8
in low-density suburbs to 3.5 in large dense cities; we take the average, because the
first station here serves a town. A station is built around the smallest
establishment that patrols a town round the clock without calling on a neighbour: **60
sworn**, which after the usual five-to-one factor for shifts, leave, training and
non-patrol assignment puts about twelve officers on duty at any hour. 60 ÷ 2.4 × 1,000 =
**25,000**.

**Fire station — 13,000 people.** The national fire service standard puts **4
firefighters** on the first-arriving engine, and that seat has to be filled every hour of
the year: a three-platoon rotation with relief for leave and training costs about **4.5
people per seat**, so one engine company is 4 × 4.5 = **18 career firefighters**. Career
departments run at about **1.4 firefighters per 1,000 protected residents**. 18 ÷ 1.4 ×
1,000 = 12,857 → **13,000**. The common rule of one engine per 20,000 would be more
generous; we took the staffing route because it multiplies two published figures rather
than quoting a rule of thumb.

**Clinic — 8,000 people.** A full-time primary-care physician's registered panel is
quoted between **1,500 and 2,500 patients**; the observed average sits near the top and
the "reasonable panel" literature near the bottom. We take the middle, **2,000**, because
the top end describes practices already overloaded and we are deriving what a clinic
_can_ serve. A community clinic is **4 full-time physicians**, the smallest practice that
covers its own rota without locum cover. 4 × 2,000 = **8,000**.

**School — 5,000 people.** A primary cohort is **7 year groups** (ages 5 to 11). A single
year of age is about **1.2%** of a stable population — an even spread over a 75-year span
gives 1.33%, and a real city skews older. Seven year groups is 8.4% of the population, or
**84 primary places per 1,000 residents**, which sits between the two ratios it can be
checked against: elementary enrolment of about 7% of population (70 per 1,000), and the
dwelling-based planning ratio of 25 primary places per 100 dwellings at 2.3 residents per
dwelling (109 per 1,000). A standard **two-form-entry** primary is 2 classes × 7 years ×
30 pupils = **420 places**. 420 ÷ 84 × 1,000 = **5,000**.

Together these say a fully served city of 25,000 holds one police station, two fire
stations, three clinics and five schools. That is roughly the shape of a real town, and
it is that shape because the standards say so.

### Do the existing buildings match?

Checked against [../../art/civic-massing.md](../../art/civic-massing.md) — gross floor
area = w × d × 185 × (height ÷ 3.2) — at the scale in
[../../art/README.md](../../art/README.md).

| Building       | Derived area | Catalog size | Catalog area | Verdict                           |
| -------------- | ------------ | ------------ | ------------ | --------------------------------- |
| police-station | 1,670 m²     | 2×2 × 12 m   | 2,775 m²     | 66% over; height should be 8.0 m  |
| fire-station   | ~500 m²      | 2×2 × 12 m   | 2,775 m²     | height should be 6.4 m; lot right |
| clinic         | 690 m²       | 2×2 × 14 m   | 3,238 m²     | height should be 6.4 m; lot right |
| school         | 2,100 m²     | 3×3 × 10 m   | 5,203 m²     | height should be 6.4 m; lot right |

- **Police**: 60 sworn + 20 civilian = 80 staff at the business occupancy factor of 13.9
  m² gross = 1,112 m² of office and counter, plus half as much again for custody,
  evidence, armoury, gear and garage = **1,670 m²**. Over two storeys on a 2×2 lot that
  is 1,670 ÷ 740 × 3.2 = 7.2 m; **8.0 m** is the round.
- **Fire**: two back-in apparatus bays at 4.9 × 14.0 m = 137 m², quarters for five
  on-duty positions at about 35 m² each = 175 m², offices 3 × 13.9 = 42 m², plus 40% for
  circulation, gear and plant = **~500 m²**. Height comes from the bay, not the area: a
  10 m appliance needs a door about 4.3 m clear, so the body is **6.4 m**. The lot comes
  from the apron — 14.0 m of bay plus 18.3 m of apron is 32.3 m, two tiles deep.
- **Clinic**: 12 staff, 15 people in ten exam rooms and 10 waiting is 37 occupants at
  13.9 m² gross = 514 m², plus a third for imaging, records and plant = **690 m²** over
  two storeys. The lot comes from the car park: 25 stalls at 2.7 × 5.5 m with a 7.3 m
  aisle is about 600 m² of ground.
- **School**: 420 pupils at the classroom factor of 1.9 m² net ÷ 0.65 efficiency = 1,228
  m²; hall and dining for half the school at a sitting, 210 × 1.4 m² net ÷ 0.65 = 452 m²;
  30 staff at 13.9 m² = 417 m². Total **2,100 m²**, which is 5.0 m² per place — what a
  two-form-entry primary actually is.

**The contradiction is the heights, and it is all four of them.** Every existing service
building is between 3.1 and 4.4 storeys, and none of a town police station, a firehouse,
a community clinic or a primary school is a four-storey building. The corrected heights
above are the fix.

**The footprints are right, for a reason worth stating.** Three of these need more ground
than floor — a fire apron, a clinic car park, a school field — so their lot is set by the
site rather than by the massing formula, which assumes a building filling 13.6 m of every
tile. Where that happens the formula over-reads the floor area, and the honest move is to
say by how much rather than shave the height until the sum balances.

The school is where a standard loses outright. Outdoor play for 420 primary pupils is
about 10 m² each, or 4,200 m², and a 3×3 lot leaves only 1,936 m² outside the building. A
4×4 lot is still short at 3,441 m² and is 80 m of frontage no growing city can site. The
grid wins: the school keeps 3×3 and is under-provided with playing field, and this note
is the record of that rather than a rounded number hiding it.

**None of these size changes are made by this epic.** Each belongs to the epic that
rebuilds that building — emergency services, healthcare, the education ladder — because
those epics touch the geometry and this one deliberately does not.

### Costs

This epic changes no cost. It makes the existing ones comparable, because a price divided
by a capacity is a price per person. Per 1,000 residents served, a police station costs
¢160 to build and ¢12 a month to run; a fire station ¢346 and ¢25; a clinic ¢625 and ¢48;
a school ¢1,200 and ¢80 — the ladder the standards imply, cheapest service first.

A fully served city pays about ¢165 a month per 1,000 residents across the four. The
programme's affordability override — the small facility must be buyable by a city that
has just unlocked it — does not bite here: the first school still costs ¢6,000 at the
milestone it always did, and capacity adds nothing to the bill. It bites in the ladder
epics instead.

## What it is not

- **Not a building.** No catalog entry is added. One optional field goes onto the four
  that exist, and the park entries deliberately do not get it.
- **Not per-citizen simulation.** Load is an aggregate of residents in reach against a
  capacity. Nothing tracks which child attends which school.
- **Not a rework of coverage.** Road-network walking from the nearest road tile is
  unchanged.
- **Not queues, waiting lists or dispatch.** An overloaded facility is a weaker facility:
  it grows no backlog, sends no vehicle, and turns nobody away.
- **Not a rebuild of the four existing buildings.** Their sizes are wrong and this
  document records how; the corrections belong to the epics that own them.
