# Service capacity — design

- **Status:** Built 2026-09-18; the Services panel built 2026-09-21
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

Every figure comes from published staffing, workload or enrolment figures and our own
scale, and shows its arithmetic; where no source was found, the figure is a stated dial.
Settled values belong in [../balancing.md](../balancing.md).

**Police station — 25,000 people.** There is no national per-capita staffing standard for
police ([ICMA, myths vs reality](https://icma.org/myths-vs-reality)), so the station is
sized on what towns actually field. US cities of 10,000–24,999 residents employ **1.9
full-time sworn officers per 1,000**, in 2016 and again in 2019
([FBI, Crime in the United States 2019, table 71](https://ucr.fbi.gov/crime-in-the-u.s/2019/crime-in-the-u.s.-2019/tables/table-71));
the national rate across all local agencies is higher and falling, from 2.42 in 1997 to
2.17 in 2016
([BJS, full-time employees in law enforcement agencies 1997–2016](https://bjs.ojp.gov/library/publications/full-time-employees-law-enforcement-agencies-1997-2016)),
and we take the small-city figure because the first station serves a town. The 25,000 is
the dial: the top of that town class, whose whole force works out of one station. It
holds 25 × 1.9 = **about 48 sworn**. About **68%** of local officers are assigned to
patrol ([BJS, local police departments 2013](https://bjs.ojp.gov/content/pub/ascii/lpd13ppp.txt)),
so 32 patrol, and one post staffed round the clock takes **5.5–6 officers**
([Seattle, SPD staffing](https://www.seattle.gov/Documents/Departments/Council/Committees/CentralStaff/TopicPapers/6d.-SPD-Staffing.pdf)):
32 ÷ 5.5 ≈ **6 cars on duty at every hour**, a town patrolling itself without calling on
a neighbour.

**Fire station — 14,000 people.** NFPA 1710 puts **4 firefighters** on an engine company,
and that seat has to be filled every hour of the year: a 24-hour rotation with relief for
leave and training costs about **4.5 people per seat** (Kirkland, Washington derives 4.75
for its own department,
[2025–26 fire overtime issue paper](https://www.kirklandwa.gov/files/sharedassets/public/v/1/finance-and-administration/budget-documents/25-26-budget/2025-2026-fire-overtime-issue-paper.pdf)),
so one engine company is 4 × 4.5 = **18 career firefighters**. The median for
communities of 25,000–49,999 is **1.30 career firefighters per 1,000 residents**
([NFPA, US Fire Department Profile 2020](https://content.nfpa.org/-/media/Project/Storefront/Catalog/Files/Research/NFPA-Research/Emergency-responders/osFDProfileTables.pdf)).
18 ÷ 1.30 × 1,000 = 13,846 → **14,000**. It agrees with the NFPA Fire Protection Handbook
(2003), which puts 15,000–20,000 people behind each engine in large cities. The often
quoted one engine per 20,000 is neither an ISO nor an NFPA standard, so it is not used.

**Clinic — 8,000 people.** A full-time primary-care physician carries a panel of about
**2,000**, between the workable panels Altschuler and colleagues derive — **1,947**,
1,523 and 1,387 patients as more or less care is delegated to the team
([Annals of Family Medicine, 2012](https://www.annfammed.org/content/10/5/396)) — and the
observed US average of about **2,300**, which describes practices already overloaded. A
community clinic is **4 full-time physicians**, a stated dial: no source was found for
physicians per site. 4 × 2,000 = **8,000**.

**School — 7,000 people.** The average US public elementary school enrols **456** pupils
([NCES Digest table 216.75, 2019–20](https://nces.ed.gov/programs/digest/d21/tables/dt21_216.75.asp)).
Public enrolment in kindergarten through grade 5 was 21.34 million in fall 2022
([NCES Digest table 203.10](https://nces.ed.gov/programs/digest/d23/tables/dt23_203.10.asp)),
against about 333 million residents: **64 pupils per 1,000**. 456 ÷ 64 × 1,000 = 7,125 →
**7,000**. The national count agrees: about 52,300 public elementary schools for about
328 million people is one school per 6,300 residents.

Together these say a fully served city of 25,000 holds one police station, two fire
stations, three clinics and four schools. That is roughly the shape of a real town, and
it is that shape because the published figures say so.

### Do the existing buildings match?

Checked against [../../art/civic-massing.md](../../art/civic-massing.md) — gross floor
area = w × d × 185 × (height ÷ 3.2) — at the scale in
[../../art/README.md](../../art/README.md).

| Building       | Derived area | Catalog size | Catalog area | Verdict                           |
| -------------- | ------------ | ------------ | ------------ | --------------------------------- |
| police-station | 1,420 m²     | 2×2 × 12 m   | 2,775 m²     | 95% over; height should be 6.4 m  |
| fire-station   | ~500 m²      | 2×2 × 12 m   | 2,775 m²     | height should be 6.4 m; lot right |
| clinic         | 690 m²       | 2×2 × 14 m   | 3,238 m²     | height should be 6.4 m; lot right |
| school         | 2,240 m²     | 3×3 × 10 m   | 5,203 m²     | height should be 6.4 m; lot right |

- **Police**: 48 sworn + 20 civilian = 68 staff at the business occupancy factor of 13.9
  m² gross = 945 m² of office and counter, plus half as much again for custody,
  evidence, armoury, gear and garage = **1,420 m²**. On a 2×2 lot that is 1,420 ÷ 740 ×
  3.2 = 6.1 m; two storeys, **6.4 m**, is the round.
- **Fire**: two back-in apparatus bays at 4.9 × 14.0 m = 137 m², quarters for five
  on-duty positions at about 35 m² each = 175 m², offices 3 × 13.9 = 42 m², plus 40% for
  circulation, gear and plant = **~500 m²**. Height comes from the bay, not the area: a
  10 m appliance needs a door about 4.3 m clear, so the body is **6.4 m**. The lot comes
  from the apron — 14.0 m of bay plus 18.3 m of apron is 32.3 m, two tiles deep.
- **Clinic**: 12 staff, 15 people in ten exam rooms and 10 waiting is 37 occupants at
  13.9 m² gross = 514 m², plus a third for imaging, records and plant = **690 m²** over
  two storeys. The lot comes from the car park: 25 stalls at 2.7 × 5.5 m with a 7.3 m
  aisle is about 600 m² of ground.
- **School**: 456 pupils at the classroom factor of 1.9 m² net ÷ 0.65 efficiency = 1,333
  m²; hall and dining for half the school at a sitting, 228 × 1.4 m² net ÷ 0.65 = 491 m²;
  30 staff at 13.9 m² = 417 m². Total **2,240 m²**, which is 4.9 m² per place.

**The contradiction is the heights, and it is all four of them.** Every existing service
building is between 3.1 and 4.4 storeys, and none of a town police station, a firehouse,
a community clinic or a primary school is a four-storey building. The corrected heights
above are the fix.

**The footprints are right, for a reason worth stating.** Three of these need more ground
than floor — a fire apron, a clinic car park, a school field — so their lot is set by the
site rather than by the massing formula, which assumes a building filling 13.6 m of every
tile. Where that happens the formula over-reads the floor area, and the honest move is to
say by how much rather than shave the height until the sum balances.

The school is where a standard loses outright. Outdoor play for 456 elementary pupils is
about 10 m² each, or 4,560 m², and a 3×3 lot leaves only 1,936 m² outside the building. A
4×4 lot is still short at 3,441 m² and is 80 m of frontage no growing city can site. The
grid wins: the school keeps 3×3 and is under-provided with playing field, and this note
is the record of that rather than a rounded number hiding it.

**None of these size changes are made by this epic.** Each belongs to the epic that
rebuilds that building — emergency services, healthcare, the education ladder — because
those epics touch the geometry and this one deliberately does not.

### Costs

This epic changes no cost. It makes the existing ones comparable, because a price divided
by a capacity is a price per person. Per 1,000 residents served, a police station costs
¢160 to build and ¢12 a month to run; a fire station ¢321 and ¢23; a clinic ¢625 and ¢48;
a school ¢857 and ¢57 — the ladder the published figures imply, cheapest service first.

A fully served city pays about ¢140 a month per 1,000 residents across the four. The
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
