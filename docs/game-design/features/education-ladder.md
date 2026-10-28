# Education ladder — design

- **Status:** Built — the ladder in the sim: four schools, the library, the gates; the school buildings drawn as campuses (2026-10-14)
- **Date:** 2026-10-14

Epic 3 of the programme in [municipal-services.md](municipal-services.md), on the
capacity foundation of epic 0 — [service-capacity.md](service-capacity.md) and
[../../engineering/features/service-capacity.md](../../engineering/features/service-capacity.md)
— with its technical plan in
[../../engineering/features/education-ladder.md](../../engineering/features/education-ladder.md).

The epic is two slices. **Slice 1, built,** is everything the sim, the catalog,
the save, the panels and the Advisor need: the four schools, the library, the
gates and the problem that tells a player which school is missing. **Slice 2,
built,** draws the five buildings: classroom wings at their stated floor, gyms,
and grounds a player reads them by — see
[../../art/civic-massing/reading-a-civic-building-at-a-glance/the-schools-the-college-and-the-library.md](../../art/civic-massing/reading-a-civic-building-at-a-glance/the-schools-the-college-and-the-library.md).

The 2026-09-18 draft was built on English sources. It is rewritten here on the
United States' own: NCES enrolment and school counts, a US school construction
survey, US state library and school-bus rules. The draft's two-form-entry 420
places, its 5,000 and 15,000 capacities, its English walking guidance, its
statutory miles and its line that nobody ever dies are **withdrawn**. The
last was already false: the city has had deaths since the healthcare epic.

## What the player gets

Four schools instead of one, and each opens a door the ones below it cannot.
Houses level up behind an elementary school, apartment blocks and high streets
behind a middle school **and** a high school, office towers behind a college. A
library is the fifth building and it is not a school: it stretches the catchment of the
schools already there, so a block just outside a school gate can be brought
inside one.

A player should be able to look at a stalled district and say "those blocks
will not level up until I build a high school" and be right.

## Why it earns its place

Education is the one service in the game that already changes what the city
becomes. Everything else writes a field the player watches; education writes a
field that decides whether a lot grows. That mechanism works, and there is
exactly one building on it. So this is the cheapest epic in the programme to get
right — it extends a gate rather than inventing one — and it gives capacity its
first real test, because an overloaded school stops a district growing.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md). A district that
stops levelling is a consequence; the school that caused it is the decision; the
ladder is the line between them.

## How it works, for the player

### The ladder

| Rung | Building              | Unlocks at     | What it opens                                                                             |
| ---- | --------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| 1    | **Elementary School** | Small Town     | Detached and row houses reach level 3                                                     |
| 2    | **Middle School**     | Big Town       | With a high school: blocks, towers, mixed and local commercial reach level 3              |
| 3    | **High School**       | Big Town       | With a middle school: the same                                                            |
| 4    | **College**           | Grand City     | High-density commercial reaches level 3                                                   |
| —    | **Public Library**    | Busy Township  | Nothing on its own; extends every school's reach by up to a fifth                         |

Each rung writes **its own field**: elementary, middle, high and college
coverage are four separate maps. That is the whole ladder. A rung cannot stand in
for another, at any quantity, because it never writes the field the other
rung's gate reads. Four elementary schools overlapping a block leave the middle
field at zero.

**Level 2 is not gated by schooling anywhere, at any density.** A city has to be
able to grow before it can afford a school, and a game that stops a village at
level 1 until it buys a ¢6,000 building has not made a decision, it has made a
toll gate. Industry and farms are not gated either: they are a young city's tax
base and the sector least able to pay for the ladder that would unblock it, so
their level 3 stays what it is, an order book.

### The gates

Every school writes **150** at its own door, falling to nothing at the edge of
its range, and every gate reads **over 60**. The land-value gates, 140 for level
2 and 190 for level 3, do not change; schooling is an additional gate on level 3
and never a substitute for land value.

| Level 3 of                                                 | Needs, over 60                          | Built by                          |
| ---------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| Low-density housing (`ResLow`), row houses (`ResMediumRow`) | Elementary                              | Elementary School                 |
| Medium and high-density housing, mixed use, local commercial | Middle **and** high                    | Middle School and High School     |
| High-density commercial (`ComHigh`)                         | College                                 | College                           |
| Industry, heavy industry, farms                             | Nothing                                 | —                                 |

Because every gate is the same fraction of every school's strength, the
**catchment** — the distance at which a school's coverage still clears its gate
— is the same fraction of every range: `range × (1 − 60 ÷ 150)` = **0.6 × range**.

### Catchments, not circles

A school reaches people down the road network, as every service does. Its
catchment is shorter than its range because coverage falls off with distance.

| Rung       | Range     | Catchment at full funding        | In metres | In miles |
| ---------- | --------- | -------------------------------- | --------- | -------- |
| Elementary | 59 tiles  | 35.4 tiles                       | 708 m     | 0.44     |
| Middle     | 93 tiles  | 55.8 tiles                       | 1,116 m   | 0.69     |
| High       | 86 tiles  | 51.6 tiles                       | 1,032 m   | 0.64     |
| College    | 156 tiles | 93.6 tiles                       | 1,872 m   | 1.16     |

The ladder is also a ladder of reach — neighbourhood, district, city — and it falls
out of the arithmetic: a bigger school serves more people, so it has to reach
further to find them.

### The library

A library is a **multiplier on reach**, not a rung, and it writes no field. Inside a
library's own range, every school's range is stretched by up to a fifth — the
full fifth at the library's door, tapering to nothing at its edge. The fifth is the
uplift at the library, not at the school's gate: with a library at its door, an
elementary school's catchment edge, 35 tiles out, sits where the uplift has
fallen to about 8%, so the catchment goes from 35 tiles to about 38. A library
helps most the blocks nearest it, which is why it is a siting decision.

It is worth more than a sixth school for three reasons. It cannot open a gate on
its own, so a library with no school in reach does nothing at all — the honest
model of what a branch library is for. It is most valuable exactly where a school
is weakest, at the edge of a catchment, so it is a **siting** decision rather
than a buying one. And it is cheap, ¢38 per thousand people served against an
elementary school's ¢857, which makes "patch the edge" a real alternative to
"build another school" rather than a strictly worse one.

The fifth is **an unsourced dial**: nothing quantifies a library's effect on
attainment. It is set to move a catchment edge visibly and no further.

A library is a capped facility like any other, 20,500 people. It follows the
existing supply-share model: its uplift is scaled by `min(1, capacity ÷ people in
reach)`, so a library serving twice the people it holds gives half its uplift.
That is the model every other service already uses, and it is the one the Services
panel reads.

### When a school is overloaded

Under [service-capacity.md](service-capacity.md) a facility serving more people
than it has places writes a weaker field. For a school that is not cosmetic: its
catchment shrinks toward its own door, and the edge blocks stop levelling first.
At a load `L` the catchment is `range × (1 − 0.4 L)`:

| School load | Catchment                            |
| ----------- | ------------------------------------ |
| 100%        | 0.6 of its range                     |
| 150%        | 0.4 of its range                     |
| 200%        | 0.2 of its range                     |
| 250%        | nothing — the gate closes everywhere |

Every rung closes at the same 250%, because every rung has the same strength and the
same gate. The draft's claim that a secondary school closes at 170% was an artefact
of a strength of 255 and is **withdrawn**.

Load is counted over the whole reach, not only the catchment, because that is
how coverage has always counted people; a school in a fully built district
therefore reads more than the 100% its catchment alone would give. The
[technical document](../../engineering/features/education-ladder.md#what-could-go-wrong)
records it as a risk to watch rather than hides it.

### Being told about it

Education gating growth means an under-built ladder quietly caps the city, and a
cap with no explanation is the worst thing a builder does to a player, so the
ladder is told four ways:

- **On the lot.** A building that clears land value for level 3 and fails only
  its schooling carries a **Needs School** problem marker, the same kind as no
  power and no water. The inspector names the school or schools it is missing.
- **In the Services panel.** The Education row splits into one per rung, and
  the library has its own, each with its own load. A city reading `Elementary
  45% · Middle 310%` has a diagnosis, not a number. All of them share the one
  Education funding slider: it is one department.
- **In the lenses.** Each rung has its own coverage lens in the infoview grid.
- **From the Advisor.** It counts the buildings held at level 2 by schooling,
  and names the rung each is waiting on.

## What it interacts with

**Growth.** Before this epic every residential zone needed the elementary
field over 60 to reach level 3, and commercial level 3 needed land value alone. The
new gates are the table above, so on a city that already exists:

- Detached and row housing are exactly as before.
- Medium and high-density housing and mixed use used to be opened by the
  elementary school. They now need a middle school and a high school, which
  unlock at Big Town. An elementary school opens none of them any more.
- Local commercial, never schooling-gated, now needs the same two schools.
  High-density commercial now needs a college, from Grand City.
- Nothing loses a level, because growth gates level-up and never level-down. The
  tightening is only that buildings at level 2 stay there until the rung is built,
  and the marker and the Advisor say so in the same change.
- Until the rung unlocks, a town cannot build it. A building waiting on a school
  the town cannot yet build is held at level 2, which is every building's
  floor in a town that small.

**Capacity.** This is where capacity stops being a gauge and becomes a
consequence. Two schools covering the same district pool their places, so a
second is always a real answer to an overloaded first — and because coverage
takes the strongest source rather than the sum, two side by side buy capacity,
not reach, which is the library's job.

**The budget.** Funding scales range and capacity together, so turning the
education slider up widens every catchment and serves more people at once. It is
the fast answer to a stalled district and it is rented monthly; the school is the
slow answer and it is owned.

**Milestones.** Each rung unlocks by population — see
[../progression.md](../progression.md). No rung requires the rung below to have been
_built_: a hard lock on a ploppable is a worse failure than a soft one, so the city
is pushed up the ladder by needing the levels rather than by being refused the
button.

## Tuning

Every figure derives from a published US source and our own 20 m tile. Settled
numbers belong in [../balancing.md](../balancing.md).

### Capacities

A capacity is the people one building serves: its enrolment over the share of
the population that attends that rung. National figures are public enrolment from
the [NCES Digest](https://nces.ed.gov/programs/digest/) over the 2024 Census
population of 340,110,988.

| Building   | Enrolment of an average school                                                                                              | Per 1,000 residents                                                                                                                | Capacity   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Elementary | 456 ([Digest 216.75](https://nces.ed.gov/programs/digest/d21/tables/dt21_216.75.asp), 2019–20)                               | About 62–64 pupils in grades K–5; fall 2020 reads 62.4 ([Digest 203.10](https://nces.ed.gov/programs/digest/d21/tables/dt21_203.10.asp)) | 7,000      |
| Middle     | 599 (Digest 216.75)                                                                                                          | 33.8 in grades 6–8 (fall 2020, Digest 203.10)                                                                                      | 17,700     |
| High       | 693 (Digest 216.75)                                                                                                          | 45.7 in grades 9–12 ([fall 2022](https://nces.ed.gov/programs/digest/d23/tables/dt23_203.10.asp))                                  | 15,200     |
| College    | None: sized to the city's top milestone                                                                                      | 54.6 enrolled in postsecondary ([fall 2022, Digest 303.10](https://nces.ed.gov/programs/digest/d23/tables/dt23_303.10.asp))         | 50,000     |
| Library    | None: the national count of outlets                                                                                          | 16,607 public library stationary outlets, 8,884 central and 7,723 branch ([Digest 701.60](https://nces.ed.gov/programs/digest/d21/tables/dt21_701.60.asp), FY2019) | 20,500     |

- Elementary: 456 ÷ 62.4 × 1,000 = 7,308 and 456 ÷ 64 × 1,000 = 7,125, so the built
  **7,000** stands.
- Middle: 599 ÷ 33.8 × 1,000 = 17,722, **17,700**.
- High: 693 ÷ 45.7 × 1,000 = 15,164, **15,200**.
- College: 18.58 million enrolled ÷ 340.1 million = 54.6 per 1,000. No standard
  campus size exists, so the roll comes from our own scale: the top milestone,
  Metropolis, is 50,000 people, and 50,000 × 5.46% = **2,730 places**, which one
  campus provides. Its capacity is that **50,000**.
- Library: 340.1 million ÷ 16,607 outlets = 20,479, **20,500**.
- Cross-check by school count (Digest 216.10, 2022–23): about 6,500 people per
  elementary school, 20,900 per middle school and 14,300 per high school.

### Ranges

A range is derived from a capacity at the density of a town, because a school
has to reach the people it serves, and the same school in a sparser town has to
reach further. The method, stated so it can be redone:

1. **Residents per building tile.** The mean, over the 60 residential entries
   in the catalog (every zoned residential kind at every level, farmhouses
   excluded), of `residents ÷ (w × d)` is **8.106**.
2. **Residents per covered tile.** A district a school covers is not all homes:
   streets, parks, shops and the school itself take the rest. Residential
   buildings are taken to fill **35%** of it. This is an **assumption**, not a
   sourced figure. 8.106 × 0.35 = **2.837 residents per covered tile**.
3. **Catchment.** The catchment is a diamond of `2R²` tiles, and it has to hold
   the people the school serves: `R = √(capacity ÷ (2 × 2.837))`.
4. **Range.** The gate sits at 0.6 of the range, so `range = R ÷ 0.6`. A
   library holds no gate and its uplift is positive anywhere in its range, so its
   range is `R` itself.

| Building   | Capacity | `R` (tiles) | Range |
| ---------- | -------- | ----------- | ----- |
| Elementary | 7,000    | 35.1        | 59    |
| Middle     | 17,700   | 55.9        | 93    |
| High       | 15,200   | 51.8        | 86    |
| College    | 50,000   | 93.9        | 156   |
| Library    | 20,500   | 60.1        | 60    |

The elementary school's range was 56, traceable to no source; it becomes **59**
by the same method as the others.

**Against the real walk and bus.** The catchments are 0.44 to 1.16 miles. School
districts begin paying for a bus where a walk gets long: Douglas County, Colorado,
buses elementary pupils beyond 1 mile and secondary pupils beyond 2 (one district,
a single source); New Jersey's N.J.S.A. 18A:39-1 sets 2 miles for elementary and
2.5 for secondary pupils; and in the 2009 National Household Travel Survey 31% of
K–8 pupils lived within a mile of school. The elementary catchment, 0.44 miles,
sits inside the mile; the middle and high catchments, 0.69 and 0.64, sit inside
the 2 miles. So every catchment is walkable or a short bus. The college has no bus
line to sit inside, and its 1.16 miles is a campus's reach by road, not a walk.

### Prices

Prices are **real cost ratios** off the one entry the game was balanced around:
the elementary school's ¢6,000 to build and ¢400 a month.

**Build cost per pupil** from one source, _School Planning & Management_'s 20th
Annual School Construction Report (2014 data), as summarised at
[spaces4learning.com](https://spaces4learning.com/articles/2015/07/01/school-costs.aspx):
$43,693 a pupil for an elementary school, $43,635 for a middle school and $49,000
for a high school.

| Building   | Pupils | Build cost | Ratio to elementary | Price     |
| ---------- | ------ | ---------- | ------------------- | --------- |
| Elementary | 456    | $19.92 M   | 1                   | ¢6,000    |
| Middle     | 599    | $26.14 M   | 1.312               | **¢7,870** |
| High       | 693    | $33.96 M   | 1.705               | **¢10,230** |

Rounded to the nearest ¢10.

**The college has no like-for-like source.** The floor is 2,730 places × 64
gross sf a student (Evergreen Valley College, 677,403 gross sf for 10,564
students, from the San José–Evergreen district's facilities master plan) =
174,700 sf, at the high school's $235.29 a square foot from the same report =
$41.1 M, a ratio of 2.06 to the elementary school: **¢12,400** (to the nearest
¢100). No like-for-like $/sf for a college exists in what was found, and
Washington's Office of Financial Management gives $405 a square foot as its
2019-dollar maximum for a classroom, so this price is **low**. It stays, because the
programme's price is a ratio and the next source should move it up, not down.

**The library has no like-for-like source either.** Virginia's is the lowest state
standard found, 0.6 sf a head (Maryland's Essential standard is 1.0): 0.6 × 20,500
= 12,300 sf at the elementary school's $211.55 a square foot ($2.60 M), a ratio of
0.1306: **¢785**.

**Upkeep by all-staff ratio.** NCES Digest 213.10 (fall 2022) counts
[7.3 pupils per member of staff](https://nces.ed.gov/programs/digest/d23/tables/dt23_213.10.asp),
all staff. The elementary school's 456 ÷ 7.3 = 62.5 staff is ¢400, so ¢6.40 a
member of staff a month.

| Building   | Staff                                                                                                                                                    | Upkeep     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Elementary | 62.5                                                                                                                                                     | ¢400       |
| Middle     | 599 ÷ 7.3 = 82.1                                                                                                                                         | ¢525       |
| High       | 693 ÷ 7.3 = 94.9                                                                                                                                         | ¢608       |
| College    | 2,730 ÷ 8.0 = 341 (public two-year colleges at [8.0 FTE students per FTE staff](https://nces.ed.gov/programs/digest/d21/tables/dt21_314.50.asp), Digest 314.50, fall 2020) | ¢2,185     |
| Library    | About 8.5 FTE an outlet (IMLS FY2019: about 143,883 paid FTE over about 17,000 outlets; the **denominator is approximate**)                                 | ¢54        |

**The programme's affordability override does not bite.** Each rung unlocks at a
milestone whose reward covers it outright: ¢15,000 at Busy Township for the
library, ¢25,000 at Big Town for the middle and high schools together, ¢75,000 at
Grand City for the college.

| Building   | Cost    | Upkeep | Per 1,000 served | Upkeep per 1,000 |
| ---------- | ------- | ------ | ---------------- | ---------------- |
| Elementary | ¢6,000  | ¢400   | ¢857             | ¢57              |
| Middle     | ¢7,870  | ¢525   | ¢445             | ¢30              |
| High       | ¢10,230 | ¢608   | ¢673             | ¢40              |
| College    | ¢12,400 | ¢2,185 | ¢248             | ¢44              |
| Library    | ¢785    | ¢54    | ¢38              | ¢3               |

### Sizes and draw

Sizes come from a floor, by the massing rule in
[../../art/civic-massing/README.md](../../art/civic-massing/README.md): gross floor =
`w × d × 185 × height ÷ 3.2` square metres. The floor a pupil is allowed comes from
Maine's Department of Education space-allocation guidelines (2025): 140 sf for an
elementary pupil, 160 for a middle and 185 for a high school pupil, with
Connecticut's published ranges as the cross-check (both read from secondary
summaries; the tables were not retrieved).

| Building   | Floor                                   | Catalog size | Storeys | Gross floor as built | Against the floor |
| ---------- | --------------------------------------- | ------------ | ------- | -------------------- | ----------------- |
| Elementary | 56,000 sf (456 × 104–140)               | 3×3 × 10 m   | 3.1     | 5,203 m² (56,000 sf) | unchanged         |
| Middle     | 599 × 160 = 95,840 sf (8,904 m²)        | 4×4 × 9.6 m  | 3       | 8,880 m²             | −0.3%             |
| High       | 693 × 185 = 128,200 sf (11,911 m²)      | 5×4 × 9.6 m  | 3       | 11,100 m²            | −6.8%             |
| College    | 2,730 × 64 = 174,700 sf (16,230 m²)     | 6×5 × 9.6 m  | 3       | 16,650 m²            | +2.6%             |
| Library    | 0.6 × 20,500 = 12,300 sf (1,143 m²)     | 3×2 × 3.2 m  | 1       | 1,110 m²             | −2.9%             |

Each is the nearest footprint of two to six tiles a side at a whole number of
storeys of 3.2 m, at most three, and no longer than twice as long as wide. The high
school's nearest fit with those limits is 7% short rather than a fourth storey.

The **existing school stays 3×3 × 10 m**: its 5,203 m², about 56,000 sf, is 456
pupils at 123 sf each, inside the 104–140 the guidelines give. The
[service-capacity](service-capacity.md) note that its height "should be 6.4 m" was
derived from an English classroom factor and is **superseded** by these figures.

**The site falls short, and the grid wins.** The Council of Educational Facility
Planners' site guidance is 10 acres plus one per 100 pupils for an elementary
school, 20 plus one for a middle school and 30 plus one for a high school. An
elementary school of 456 pupils would ask for 14.6 acres, 59,000 m², or 148 tiles; it
gets 9. A middle school asks for 26 acres, a high school for 37. None of that land
fits a 20 m grid in a city, so the shortfall is recorded here and the lots stay the
massing rule's.

**Draw** follows the civic method in [../balancing.md](../balancing.md#civic-draw):
the floor at the building type's intensity over the year, and the water by the
type's benchmark. Education reads 9.4 kWh/sf (CBECS) and a K-12 school 10.84
gallons a square foot a year (WaterSense); a college has no figure of its own and takes
the same two. A library is public assembly at 12.1 kWh/sf with the office water
benchmark, 14.48 gal/sf.

| Building   | Floor      | Power     | Water    |
| ---------- | ---------- | --------- | -------- |
| Elementary | 56,000 sf  | 0.0601 MW | 6.3 kL   |
| Middle     | 95,840 sf  | 0.1028 MW | 10.8 kL  |
| High       | 128,200 sf | 0.1376 MW | 14.4 kL  |
| College    | 174,700 sf | 0.1875 MW | 19.6 kL  |
| Library    | 12,300 sf  | 0.0170 MW | 1.8 kL   |

## What it is not

- **Not a sixth school.** The library is deliberately a different kind of thing;
  a ladder of five schools is four decisions about money and none about place.
- **Not per-pupil simulation.** Nothing tracks a child to a school, a roll or an
  admission. Capacity is an aggregate of people in reach against places provided.
- **Not a rework of coverage.** Road-network walking from the nearest road tile,
  funding-scaled range, two tiles of radiation — unchanged. The library changes
  how far a school's falloff carries, not how it travels.
- **Not new zone levels.** The ladder gates the three that exist.
- **Not education as an economic input.** Nothing here makes an educated
  population richer, more productive, or less criminal. Those are demand and
  economy questions; what should never be built belongs in
  [../../DESIGN.md](../../DESIGN.md).
- **Not school buses, catchment drawing, or term time.** Each is a system of its
  own and none changes what this epic is for.
- **Not a real school site.** A track, a football field and a baseball diamond fit
  none of the lots, and neither does the parking a real campus asks; the grid wins,
  and the kits draw what fits.
