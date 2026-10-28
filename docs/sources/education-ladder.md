# Education ladder — sources and derivations

The rules are in [the spec](../specs/education-ladder.md). Every figure derives from a published US source and the 20 m tile. Settled numbers are in [balancing](../game-design/balancing/README.md).

## Capacities

A capacity is the people one building serves: its enrolment over the share of the population that attends that rung. National figures are public enrolment from the [NCES Digest](https://nces.ed.gov/programs/digest/) over the 2024 Census population of 340,110,988.

| Building   | Enrolment of an average school | Per 1,000 residents | Capacity |
| ---------- | ------------------------------ | ------------------- | -------- |
| Elementary | 456 ([Digest 216.75](https://nces.ed.gov/programs/digest/d21/tables/dt21_216.75.asp), 2019–20) | About 62–64 pupils in grades K–5; fall 2020 reads 62.4 ([Digest 203.10](https://nces.ed.gov/programs/digest/d21/tables/dt21_203.10.asp)) | 7,000 |
| Middle     | 599 (Digest 216.75) | 33.8 in grades 6–8 (fall 2020, Digest 203.10) | 17,700 |
| High       | 693 (Digest 216.75) | 45.7 in grades 9–12 ([fall 2022](https://nces.ed.gov/programs/digest/d23/tables/dt23_203.10.asp)) | 15,200 |
| College    | None: sized to the city's top milestone | 54.6 enrolled in postsecondary ([fall 2022, Digest 303.10](https://nces.ed.gov/programs/digest/d23/tables/dt23_303.10.asp)) | 50,000 |
| Library    | None: the national count of outlets | 16,607 public library stationary outlets, 8,884 central and 7,723 branch ([Digest 701.60](https://nces.ed.gov/programs/digest/d21/tables/dt21_701.60.asp), FY2019) | 20,500 |

- Elementary: 456 ÷ 62.4 × 1,000 = 7,308 and 456 ÷ 64 × 1,000 = 7,125, so the built **7,000** stands.
- Middle: 599 ÷ 33.8 × 1,000 = 17,722, **17,700**.
- High: 693 ÷ 45.7 × 1,000 = 15,164, **15,200**.
- College: 18.58 million enrolled ÷ 340.1 million = 54.6 per 1,000. No standard campus size exists, so the roll comes from our own scale: the top milestone, Metropolis, is 50,000 people, and 50,000 × 5.46% = **2,730 places**, which one campus provides. Its capacity is that **50,000**.
- Library: 340.1 million ÷ 16,607 outlets = 20,479, **20,500**.
- Cross-check by school count (Digest 216.10, 2022–23): about 6,500 people per elementary school, 20,900 per middle school and 14,300 per high school.

## Ranges

A range is derived from a capacity at the density of a town, because a school has to reach the people it serves, and the same school in a sparser town has to reach further. The method, stated so it can be redone:

1. **Residents per building tile.** The mean, over the 60 residential entries in the catalog (every zoned residential kind at every level, farmhouses excluded), of `residents ÷ (w × d)` is **8.106**.
2. **Residents per covered tile.** A district a school covers is not all homes: streets, parks, shops and the school itself take the rest. Residential buildings are taken to fill **35%** of it. This is an **assumption**, not a sourced figure. 8.106 × 0.35 = **2.837 residents per covered tile**.
3. **Catchment.** The catchment is a diamond of `2R²` tiles, and it has to hold the people the school serves: `R = √(capacity ÷ (2 × 2.837))`.
4. **Range.** The gate sits at 0.6 of the range, so `range = R ÷ 0.6`. A library holds no gate and its uplift is positive anywhere in its range, so its range is `R` itself.

| Building   | Capacity | `R` (tiles) | Range |
| ---------- | -------- | ----------- | ----- |
| Elementary | 7,000    | 35.1        | 59    |
| Middle     | 17,700   | 55.9        | 93    |
| High       | 15,200   | 51.8        | 86    |
| College    | 50,000   | 93.9        | 156   |
| Library    | 20,500   | 60.1        | 60    |

The elementary school's range was 56, traceable to no source; it becomes **59** by the same method as the others.

### Catchments at full funding

| Rung       | Range     | Catchment (0.6 × range) | In metres | In miles |
| ---------- | --------- | ----------------------- | --------- | -------- |
| Elementary | 59 tiles  | 35.4 tiles              | 708 m     | 0.44     |
| Middle     | 93 tiles  | 55.8 tiles              | 1,116 m   | 0.69     |
| High       | 86 tiles  | 51.6 tiles              | 1,032 m   | 0.64     |
| College    | 156 tiles | 93.6 tiles              | 1,872 m   | 1.16     |

### Against the real walk and bus

The catchments are 0.44 to 1.16 miles. School districts begin paying for a bus where a walk gets long: Douglas County, Colorado, buses elementary pupils beyond 1 mile and secondary pupils beyond 2 (one district, a single source); New Jersey's N.J.S.A. 18A:39-1 sets 2 miles for elementary and 2.5 for secondary pupils; and in the 2009 National Household Travel Survey 31% of K–8 pupils lived within a mile of school. The elementary catchment, 0.44 miles, sits inside the mile; the middle and high catchments, 0.69 and 0.64, sit inside the 2 miles. So every catchment is walkable or a short bus. The college has no bus line to sit inside, and its 1.16 miles is a campus's reach by road, not a walk.

### Overload, worked

At a school load `L` the catchment is `range × (1 − 0.4 L)`: 100% gives 0.6 of the range, 150% gives 0.4, 200% gives 0.2 and 250% gives nothing. A strength of 255 would have closed a gate at 170%; every rung writes 150, so every rung closes at 250%. A lone school in a fully built district reads about 280%, because its reach covers about 2.8 times the people its catchment holds. Schools spaced at catchment distance pool their places and settle at about 100%.

### The library's reach, worked

With a library at its door an elementary school's catchment edge, 35 tiles out, sits where the uplift has fallen to about 8%, so the catchment goes from 35 tiles to about 38. At a 35-tile edge the uplift is about 7%. A library costs ¢38 per thousand people served against an elementary school's ¢857.

## Prices

Prices are **real cost ratios** off the one entry the game was balanced around: the elementary school's ¢6,000 to build and ¢400 a month.

**Build cost per pupil** from one source, _School Planning & Management_'s 20th Annual School Construction Report (2014 data), as summarised at [spaces4learning.com](https://spaces4learning.com/articles/2015/07/01/school-costs.aspx): $43,693 a pupil for an elementary school, $43,635 for a middle school and $49,000 for a high school.

| Building   | Pupils | Build cost | Ratio to elementary | Price      |
| ---------- | ------ | ---------- | ------------------- | ---------- |
| Elementary | 456    | $19.92 M   | 1                   | ¢6,000     |
| Middle     | 599    | $26.14 M   | 1.312               | **¢7,870**  |
| High       | 693    | $33.96 M   | 1.705               | **¢10,230** |

Rounded to the nearest ¢10.

**The college has no like-for-like source.** The floor is 2,730 places × 64 gross sf a student (Evergreen Valley College, 677,403 gross sf for 10,564 students, from the San José–Evergreen district's facilities master plan) = 174,700 sf, at the high school's $235.29 a square foot from the same report = $41.1 M, a ratio of 2.06 to the elementary school: **¢12,400** (to the nearest ¢100). No like-for-like $/sf for a college exists in what was found, and Washington's Office of Financial Management gives $405 a square foot as its 2019-dollar maximum for a classroom, so this price is **low**. It stays, because the programme's price is a ratio and the next source should move it up, not down.

**The library has no like-for-like source either.** Virginia's is the lowest state standard found, 0.6 sf a head (Maryland's Essential standard is 1.0): 0.6 × 20,500 = 12,300 sf at the elementary school's $211.55 a square foot ($2.60 M), a ratio of 0.1306: **¢785**.

## Upkeep by all-staff ratio

NCES Digest 213.10 (fall 2022) counts [7.3 pupils per member of staff](https://nces.ed.gov/programs/digest/d23/tables/dt23_213.10.asp), all staff. The elementary school's 456 ÷ 7.3 = 62.5 staff is ¢400, so ¢6.40 a member of staff a month.

| Building   | Staff | Upkeep |
| ---------- | ----- | ------ |
| Elementary | 62.5 | ¢400 |
| Middle     | 599 ÷ 7.3 = 82.1 | ¢525 |
| High       | 693 ÷ 7.3 = 94.9 | ¢608 |
| College    | 2,730 ÷ 8.0 = 341 (public two-year colleges at [8.0 FTE students per FTE staff](https://nces.ed.gov/programs/digest/d21/tables/dt21_314.50.asp), Digest 314.50, fall 2020) | ¢2,185 |
| Library    | About 8.5 FTE an outlet (IMLS FY2019: about 143,883 paid FTE over about 17,000 outlets; the **denominator is approximate**) | ¢54 |

**The programme's affordability override does not bite.** Each rung unlocks at a milestone whose reward covers it outright: ¢15,000 at Busy Township for the library, ¢25,000 at Big Town for the middle and high schools together, ¢75,000 at Grand City for the college.

| Building   | Cost    | Upkeep | Per 1,000 served | Upkeep per 1,000 |
| ---------- | ------- | ------ | ---------------- | ---------------- |
| Elementary | ¢6,000  | ¢400   | ¢857             | ¢57              |
| Middle     | ¢7,870  | ¢525   | ¢445             | ¢30              |
| High       | ¢10,230 | ¢608   | ¢673             | ¢40              |
| College    | ¢12,400 | ¢2,185 | ¢248             | ¢44              |
| Library    | ¢785    | ¢54    | ¢38              | ¢3               |

## Sizes

Sizes come from a floor, by the massing rule in [civic massing](../art/civic-massing/README.md): gross floor = `w × d × 185 × height ÷ 3.2` square metres. The floor a pupil is allowed comes from Maine's Department of Education space-allocation guidelines (2025): 140 sf for an elementary pupil, 160 for a middle and 185 for a high school pupil, with Connecticut's published ranges as the cross-check (both read from secondary summaries; the tables were not retrieved).

| Building   | Floor                                | Catalog size | Storeys | Gross floor as built | Against the floor |
| ---------- | ------------------------------------ | ------------ | ------- | -------------------- | ----------------- |
| Elementary | 56,000 sf (456 × 104–140)            | 3×3 × 10 m   | 3.1     | 5,203 m² (56,000 sf) | unchanged         |
| Middle     | 599 × 160 = 95,840 sf (8,904 m²)     | 4×4 × 9.6 m  | 3       | 8,880 m²             | −0.3%             |
| High       | 693 × 185 = 128,200 sf (11,911 m²)   | 5×4 × 9.6 m  | 3       | 11,100 m²            | −6.8%             |
| College    | 2,730 × 64 = 174,700 sf (16,230 m²)  | 6×5 × 9.6 m  | 3       | 16,650 m²            | +2.6%             |
| Library    | 0.6 × 20,500 = 12,300 sf (1,143 m²)  | 3×2 × 3.2 m  | 1       | 1,110 m²             | −2.9%             |

Each is the nearest footprint of two to six tiles a side at a whole number of storeys of 3.2 m, at most three, and no longer than twice as long as wide. The high school's nearest fit with those limits is 7% short rather than a fourth storey.

The **existing school stays 3×3 × 10 m**: its 5,203 m², about 56,000 sf, is 456 pupils at 123 sf each, inside the 104–140 the guidelines give. The earlier note that its height "should be 6.4 m" was derived from an English classroom factor and is **superseded** by these figures.

**The site falls short, and the grid wins.** The Council of Educational Facility Planners' site guidance is 10 acres plus one per 100 pupils for an elementary school, 20 plus one for a middle school and 30 plus one for a high school. An elementary school of 456 pupils would ask for 14.6 acres, 59,000 m², or 148 tiles; it gets 9. A middle school asks for 26 acres, a high school for 37. None of that land fits a 20 m grid in a city, so the shortfall is recorded here and the lots stay the massing rule's.

## Draw

Draw follows the civic method in [balancing](../game-design/balancing/civic-draw.md): the floor at the building type's intensity over the year, and the water by the type's benchmark. Education reads 9.4 kWh/sf (CBECS) and a K-12 school 10.84 gallons a square foot a year (WaterSense); a college has no figure of its own and takes the same two. A library is public assembly at 12.1 kWh/sf with the office water benchmark, 14.48 gal/sf.

| Building   | Floor      | Power     | Water   |
| ---------- | ---------- | --------- | ------- |
| Elementary | 56,000 sf  | 0.0601 MW | 6.3 kL  |
| Middle     | 95,840 sf  | 0.1028 MW | 10.8 kL |
| High       | 128,200 sf | 0.1376 MW | 14.4 kL |
| College    | 174,700 sf | 0.1875 MW | 19.6 kL |
| Library    | 12,300 sf  | 0.0170 MW | 1.8 kL  |

## What the ladder does to an existing city

Before the ladder every residential zone needed the elementary field over 60 at level 3 and commercial level 3 needed land value alone. Now medium and high-density housing and mixed use need a middle and a high school, unlocked at Big Town; local commercial needs the same two; high-density commercial needs a college, from Grand City. The elementary range moved 56 to 59. Nothing loses a level, because growth gates level-up and never level-down. Until a rung unlocks a town cannot build it, so a building waiting on it is held at level 2, every building's floor in a town that small. The marker and the Advisor say so in the same change as the gate.

## Withdrawn draft figures

An earlier draft was built on English sources and is withdrawn: its two-form-entry 420 places, its 5,000 and 15,000 capacities, its English walking guidance and statutory miles, a secondary school closing at 170% load (an artefact of a strength of 255), and a line that nobody ever dies, already false since the city has deaths. The figures above rest on US sources instead: NCES enrolment and school counts, a US school construction survey, US state library and school-bus rules.

## Not built, on purpose

No per-pupil simulation, no school buses, catchment drawing or term time, no education as an economic input (productivity, wages, crime), no new zone levels. No real school site: a track, a football field, a baseball diamond and the parking a real campus asks fit none of the lots, and the grid wins. Anything that should never be built belongs in [DESIGN.md](../DESIGN.md).
