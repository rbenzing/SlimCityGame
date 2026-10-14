# Healthcare and death care — design

- **Status:** Built 2026-10-14 — the clinic and hospital ladder; deaths and occupancy; bodies, the regional service and the cemetery; the hearse; the crematorium and the exhumation charge
- **Date:** 2026-09-18

## What the player gets

A second rung on the health ladder, and a city where people die. The community
clinic keeps a neighbourhood well; a hospital keeps a district well, and costs
less per person to do it. Alongside them the city gains the two facilities every
real settlement builds and this one never has — a cemetery and a crematorium —
and the obligation that makes them matter: the dead have to be collected, and a
city that does not collect them watches its health field go out. Epic 2 of
[municipal-services.md](municipal-services.md), built on the capacity foundation
in [service-capacity.md](service-capacity.md).

## Why it earns its place

**One clinic satisfies the whole city.** Health is a single field and one
building fills it: no size decision, no siting decision beyond "is it in range",
no way for a growing city to outgrow the healthcare it has. This epic needs
capacity more than any other, because a hospital serving a district and a clinic
serving a street write the same `health` field and nothing today distinguishes
them once it is written.

**Nobody dies.** Population has only ever gone up, so the city has a birth side
and no death side — not a missing statistic but a missing _system_. Without
death there is no death care, no reason a hospital matters beyond a number, and
no facility in the game that fills up and stays full. Burial is the only
municipal service whose resource is land you never get back, and the city has no
such service at all. Serves the **city is legible through data lenses** pillar
in [../gdd.md](../gdd.md): a district that stops collecting its dead goes grey
on a lens the player already reads, traced back to a building they never placed.

## How it works, for the player

### The healthcare ladder, and why it has two rungs

**Community clinic** — primary care for a neighbourhood. The building the game
already has, resized: four full-time doctors, a list of **8,000 people**, 40
tiles of road reach. **Hospital** — acute inpatient care for a district: **72
beds**, a list of **30,000 people**, 72 tiles of reach, six storeys, an
ambulance canopy and a two-level parking deck. It reads as a campus, not a box.

**There is no third rung, and that is a decision.** The obvious candidate is
eldercare, and it does not earn its place: the city has no age structure at all
(see [../../world-sim/population-model.md](../../world-sim/population-model.md)),
so a care home whose residents are a flat fraction of population is a clinic
with a different roof. A middle rung is worse: it sits in a band where the
answer is already "build a second clinic".

The interesting property is which constraint binds where. **A clinic runs out of
reach before capacity** — 40 tiles is 800 m, and a suburb inside that is nowhere
near 8,000 people. **A hospital runs out of capacity before reach** — a dense
district holds more than 30,000. So the answer to a stretched clinic is another
clinic _elsewhere_; to a stretched hospital, another hospital anywhere.

### Death care, and what happens when a cemetery fills

Citizens die at a rate the city cannot change, and each death produces a body. A
hearse comes from the nearest death-care facility that can still take one, by
road, the way a garbage truck comes — so the split between burial and cremation
is not a dial, it is what the player built.

**Until Big Town the county does it.** A village does not run a funeral service:
below Big Town (3,500 people) every body is taken off the map the tick it falls
by a regional funeral service, and the city is billed **¢3.6 a body** in the
monthly settlement. Nothing is left lying and nothing hurts the health field.
From Big Town the service stops, and a body no cemetery of the town's own
collects stays where it fell. The cemetery unlocks at the very start, so a town
that would rather bury its own can switch early, and the advisor warns one rung
before Big Town if it has not. This is the same rung the drains have, for the
same reason: a town of a few thousand buys the service in, and one past that
line is expected to run it.

The fee is what a county pays. Crow Wing County, Minnesota, paid **$2,900** for
an indigent immediate cremation and **$3,900** for an immediate burial in 2026
([Brainerd Dispatch, 3 Feb 2026](https://www.brainerddispatch.com/news/local/crow-wing-county-board-county-tweaks-indigent-burial-policy)).
Cremation was 62.8% of US dispositions in 2025
([CANA 2026 report, via Kates-Boylston](https://www.kates-boylston.com/industry_news/cana-releases-2026-annual-cremation-statistics-report/article_ccaf21d4-a825-4050-8148-cfc549653411.html)),
so the weighted cost of a body is 0.628 × $2,900 + 0.372 × $3,900 =
**$3,272**. On the game's operating scale (¢800 a month stands for $8.65
million a year, [balancing.md](../balancing.md#power)), $901 to the ¢,
that is **¢3.6**. Laramie County, Wyoming's flat $1,500 rotation rate in 2026
is the low cross-check, ¢1.7. A city of 3,500 loses 31 residents a year and
pays about ¢9 a month for them, less than one cemetery's ¢140 upkeep: the
regional service is the cheap way to be a village, and the cemetery is what a
town builds because it must.

**Cemetery** — 3×3 tiles of ground, a gatehouse, **780 burial plots**. Cheap to
place, cheap to run, and it fills: a city of 20,000 fills one in four game
years. **Crematorium** — 2×2 tiles, a chapel, two retorts, a flue. Unlocked at
Big Town. No capacity at all, only a throughput of **2,080 cremations a year**,
four times what the largest city this game names can produce. It never fills,
costs about one cemetery to build, emits a little pollution, and is the only
permanent answer. A full cemetery is the decision this epic exists for, and it
has three answers.

**Build another cemetery.** ¢3,500 and nine more tiles, permanently — those
tiles never come back. Demolishing one that holds interments costs **¢14 per
interment** to exhume and reinter, on top of the usual half refund of its build
price, so clearing a full cemetery costs ¢10,920, about three times what it cost
to build; an empty one demolishes normally. The charge is paid in hand before
anything comes down, the bulldoze cursor quotes it with the number of graves, and
undoing the demolition stands the cemetery back with every interment and hands
the charge back. Burial is cheap to start and expensive to undo, which is
exactly what it is.

**Build a crematorium.** ¢3,800 and four tiles, once — about the price of one
cemetery, where the first plan had it at seven. The trade is no longer the
build price: it is land and running cost. Its upkeep of ¢600 a month is more
than four cemeteries' ¢140, so a city that keeps burying overtakes it around its
fifth, having committed 45 tiles, 1.8 hectares, to ground it can never rezone.
Or **do nothing,** and find out what that costs.

### What happens when the dead are not collected

A body nobody comes for stays at the building where the death happened, and
**subtracts from the health field** there and on the two tiles around it — the
shape a clinic's coverage radiates in, with the sign reversed. The penalty grows
with neglect rather than city size: **32 points per body per game month
uncollected**, out of the 255 the field holds. A clinic writes 140, so one body
left four months all but cancels one, and eight takes the tile to zero whatever
is built nearby. Health feeds happiness and happiness feeds residential demand,
so a district that stops burying its dead stops attracting residents.

The player sees it coming in four stages: **a gauge, game-years ahead** (every
cemetery reports plots used against plots total, the way a landfill reports
fill); **a notification, immediately** (the first body no facility can reach
raises an advisor warning before any field has moved); **the health lens, a
month later**; and **happiness and demand, later still**. The penalty never
feeds back into the death rate — a death spiral is a trap, not a lesson.

## What it interacts with

**Capacity, from [service-capacity.md](service-capacity.md).** Both healthcare
buildings carry a capacity in people and degrade smoothly when oversubscribed;
without it this epic is two more buildings saturating one field.

**Population, which can now go down.** The first downward pressure the city has
ever had, and the riskiest thing here — not because the numbers are large, but
because nothing downstream has been asked to handle a falling one. Every place
that assumed otherwise is listed in
[../../engineering/features/healthcare-and-death-care.md](../../engineering/features/healthcare-and-death-care.md).
At 9 deaths per 1,000 a year against positive residential demand the sink is a
slow leak, not a collapse: in-migration refills homes faster than deaths empty
them. Population only truly falls when demand is at or below zero — **a city
that has stopped attracting residents now shrinks instead of standing still.**

**How a home empties and fills.** A death takes one resident out of a building,
chosen in proportion to who lives where, so a tower loses people in proportion
to its size; the building stands, its flats a little emptier, and pays rent on
the people still in it. While the city is attracting residents (residential
demand above zero) each empty place is let again after **41 game days** on
average. That is RentCafe's 2025 national average of 41 days to rent a vacant
apartment across 137 markets
([Multifamily Executive](https://www.multifamilyexecutive.com/apartment-trends/rentcafe-miami-hottest-rental-market-2025)),
and the National Association of Realtors' 2025 Profile of Home Buyers and
Sellers, a median of four weeks on the market, agrees within a fortnight. How
strongly the city attracts does not speed it up: any positive demand re-lets at
the market's pace, and demand at or below zero re-lets nothing. A city holding
steady therefore carries about one empty place in a thousand; one that stops
attracting residents loses them at the death rate, 9 in 1,000 a year, until
demand returns.

**Traffic, and the garbage system.** Hearses are new traffic in exactly the
densest districts, which generate the most deaths — the interesting version of
that problem, not to be smoothed away. Collection borrows garbage's shape
deliberately: road reach, a facility that fills, a permanent one that does not,
a backlog on a lens
([../../world-sim/services-model.md](../../world-sim/services-model.md)). Death
care also rides the existing health funding slider rather than adding a sixth:
public health and burial are one department, and two buildings need no slider.

## Tuning

Every figure is derived from a published standard and our own scale — 20 m
tiles, a 3.2 m storey, 6,000 ticks per game month — never picked to feel right.
Settled values belong in [../balancing.md](../balancing.md); sizes follow
[../../art/civic-massing.md](../../art/civic-massing.md) against the anchors in
[../../art/README.md](../../art/README.md). Where a standard gives a range, this
says which end we took and why.

### The death rate, and what a tick is

A game month is `TICKS_PER_DAY × DAYS_PER_MONTH` = 200 × 30 = **6,000 ticks**,
so a game year is **72,000 ticks**. The United States' crude death rate was
**9.03 per 1,000** in 2024, 3,072,666 deaths
([CDC/NCHS, FastStats](https://www.cdc.gov/nchs/FASTATS/deaths.htm)). **Take 9
per 1,000 per year**, that rate rounded down, because our population has no age
structure and so cannot carry the elderly skew that pushes an older town toward 11.

```
9 / 1,000 / 72,000 ticks = 1.25 × 10⁻⁷ deaths per resident per tick
```

| City                | Deaths/year | One death every              | 780 plots last  |
| ------------------- | ----------- | ---------------------------- | --------------- |
| 400 (Small Town)    | 3.6         | 20,000 ticks (100 game days) | —               |
| 8,000 (Small City)  | 72          | 1,000 ticks (5 game days)    | 10.8 game years |
| 20,000 (Grand City) | 180         | 400 ticks (2 game days)      | 4.3 game years  |
| 50,000 (Metropolis) | 450         | 160 ticks                    | 1.7 game years  |

### Capacities

**Clinic — 8,000 people.** Four full-time physicians, a stated dial, at a panel
of about **2,000** each. Altschuler and colleagues derive the panel a primary-care
physician can carry with the care delegated to the team as **1,947**, and observe
a US average of about **2,300**, which describes practices already overloaded
([Annals of Family Medicine, 2012](https://www.annfammed.org/content/10/5/396)).
2,000 sits between the workable panel and the observed one: 4 × 2,000 = **8,000**.

**Hospital — 30,000 people.** **72 staffed beds**, a small community hospital:
57% of US community hospitals have fewer than 100
([AHA Hospital Statistics, 2023](https://kha-net.org/DataProductsandServices/STAT/HospitalCharacteristics/CommunityHospitalsbyBedSize/)).
The United States has **2.28 staffed community-hospital beds per 1,000
residents**
([KFF, 2024](https://www.kff.org/other/state-indicator/beds-by-ownership/)), so
72 beds serve 72 ÷ 2.28 × 1,000 = **31,600** people. Cross-checked by
admissions: America's community hospitals ran 775,297 staffed beds and admitted
33.55 million patients in 2024, **43.3 admissions a bed a year**
([AHA Fast Facts](https://www.aha.org/statistics/fast-facts-us-hospitals)), and
the country is admitted at **99 per 1,000** residents a year (KFF). 72 × 43.3 ÷
99 × 1,000 = **31,500**. Both routes land within 0.3% of each other; take
**30,000**, about 5% conservative, so the hospital sits between the Grand City
and Metropolis milestones and a Metropolis needs two.

**Cemetery — 780 plots.** A modern grave plot is 2.44 m × 1.22 m = 2.98 m². The
source is ASPO's _Cemeteries in the City Plan_ (Planning Advisory Service Report
16, 1950,
[planning.org](https://www.planning.org/pas/reports/report16.htm)), which says
that "the burials per acre devoted to single-graves will probably be around
1,000". Its overall figure, 620 burials per gross acre, describes family-lot
cemeteries (Hare and Hare's 62 lots of 20 × 20 ft, ten burials each, to the
gross acre), which is not what a modern lawn cemetery is: that is laid in single
graves. So take **about 1,000 graves an acre**, 2,471 a hectare, **4.05 m² of
cemetery land per grave**, roads and paths inside it. Cross-checks, each a
single source: Cabarrus County, North Carolina's appraisal guidance puts a
cemetery at 900–1,100 graves per usable acre, default 1,000; Forest Lawn
Memorial Park in Ohio has about 44,000 graves on 47 developed acres, about 940.
The same report's land-use split for a typical cemetery (roads 10–15%, paths
10–12%, saleable lots 70–77%) agrees with the plot: 2.98 m² ÷ 73% saleable is
4.08 m². (The report's own single grave is a smaller 20–25 sq ft, 2.5–3 × 8
ft, so its 1,000 is not the ceiling of the arithmetic, only the density it
reports.) A cemetery is ground, so it uses the whole
400 m² tile rather than a building's 185 m² plate: 400 ÷ 4.05 = 98 graves per
tile, and over a 3×3 site with one tile given to the gatehouse, 8 × 98 = 784 →
**780 plots**. Deliberately smaller than the planning standard — ASPO's "one
acre per 1,000 population" would last 111 game years at our death rate, past
even the 30–40 the ICCM asks authorities to secure — because a cemetery must
fill inside a session or it is not a system.

**Crematorium — 2,080 cremations a year**: two retorts, four cremations a day
each, 260 working days, `2,080 / 72,000` = **0.0289 per tick**, 173 per game
month, derived from the calendar constants. A Pyrox X1000 retort is rated four
to five cremations a day and over 1,000 a year on an eight-hour, five-day
schedule (vendor figures), a 70–100 minute cycle; the lower end of the rating,
four, is taken. The throughput is **credit**: it accrues at that rate each tick
and is capped at one working day's cremations, 8, so an idle crematorium banks
nothing past a day. It has room for as many bodies as its whole credit, and each
cremation spends one. The US average is 1,917,413 cremations in 2024 over 3,721
crematories, about 515 each (CANA via cremation.org.uk): that is demand, not
capacity. A Metropolis produces 450 deaths a year, so **one crematorium covers
the largest city in the game four times over.** Throughput never binds at our
scale; the decision is siting and money. The figure earns its place as the rate
a backlog drains at — 300 uncollected bodies clear in 1.7 months.

Cremation competes with burial for each body on the same terms: the nearest
facility with room by road reach, ties by facility id, a cemetery and a
crematorium alike. A crematorium with its credit spent takes no more that tick;
what it cannot take goes to the next facility, or waits. It counts the
cremations it has done, which the inspector shows.

**The price ladder, in dollars.** Death care's capital prices sit on one scale,
set by the cemetery's own: Homer, Alaska, Memo 15-205 (December 2015), put
**$628,500** to develop 700 plots, land excluded, **$898 a plot**
([memo](https://www.cityofhomer-ak.gov/memorandum/memorandum-15-205-hickerson-memorial-cemetery-expansion)).
The cemetery's ¢3,500 for 780 plots therefore stands for 780 × $898 = $700,440,
about **$200 to the ¢**. The crematorium's **¢3,800** is a New York Department
of State cemetery-board filing, Forest Hill Cemetery (Oneida), April 2021: a
crematory at most **$757,712**
([filing](https://dos.ny.gov/system/files/documents/2021/05/33-063-forest-hill-cemetery-crematory-4-23-21.pdf),
figure from the filing summary), $757,712 ÷ $200 = ¢3,789, to ¢3,800.
Cross-check: Mount Calvary (Erie) in 2023 replaced three retorts with
construction for **$804,616**, about $268,000 a retort
([packet](https://dos.ny.gov/system/files/documents/2023/09/15-066-mount-calvary-retort-packet-82523.pdf));
two retorts with their building come to about $536,000–844,000. A crematorium
now costs about one cemetery to build, against the seven the first plan had; the
trade is land and running cost, not the build price. Its **¢600** upkeep is the
first plan's figure; no US crematory operating cost was found, so it is a dial.

**Exhumation — ¢14 a grave.** The median of four municipal fee schedules for an
adult disinterment plus reinterment: Salt Lake City FY2026-27, $3,500
([slc.gov](https://www.slc.gov/cemetery/city-cemetery-fees/)); Richmond VA 2021,
$1,200 + $800 ([rva.gov](https://www.rva.gov/sites/default/files/2021-06/Cemetery%20Fees%202021.pdf));
Lorain OH, $3,000 + $1,200 ([cityoflorain.org](https://cityoflorain.org/200/Pricing));
Douglas GA, $1,300 + $900 ([cityofdouglas.org](https://cityofdouglas.org/178/Cemetery-Fees)).
The median of {2,000, 2,200, 3,500, 4,200} is **$2,850**, ÷ $200 = ¢14.25, to
**¢14**. Whole-cemetery relocations at about $4,300–5,000 a grave (Hunter Army
Airfield; Bibb County, Georgia) are the cross-check that this is not high. A full
cemetery of 780 costs ¢10,920 to clear.

**Ranges.** A hospital catchment in the world is a 20–30 minute drive, 8–15 km,
which is 400–750 of our tiles; the whole map is 256 tiles, 5.12 km across. **The
standard does not survive contact with a 20 m tile**, so the hospital's range
comes from the game's own service band instead — police and fire at 48, school
at 56 — and is **72 tiles**, the widest reach of anything but the airport. That
is 1,440 m, a 2.5-minute drive at an urban ambulance's 35 km/h, generous against
every published response target rather than mean. The clinic keeps its **40**
(800 m, 82 seconds).

### Sizes, costs and the ladder rule

| Building         | Footprint | Height | Gross floor | Capacity      | Cost    | Upkeep | Milestone |
| ---------------- | --------- | ------ | ----------- | ------------- | ------- | ------ | --------- |
| Community clinic | 1×2       | 6.4 m  | 740 m²      | 8,000 people  | ¢5,000  | ¢380   | 1         |
| Hospital         | 3×5       | 27 m   | 16,700 m²   | 30,000 people | ¢18,000 | ¢1,300 | 3         |
| Cemetery         | 3×3       | 3.2 m  | ground      | 780 plots     | ¢3,500  | ¢140   | 0         |
| Crematorium      | 2×2       | 6.4 m  | 1,480 m²    | 2,080/year    | ¢3,800  | ¢600   | 3         |

The arithmetic behind each size is shown once, in the technical document.

**The clinic is 1×2 tiles, two storeys, 6.4 m: 740 m² (7,965 sf) gross.** A
medical practice plans on **1,000–1,500 sf per provider**
([MGMA](https://www.mgma.com/articles/size-matters-in-medical-practice-space-selection)),
so four full-time physicians need 372–557 m² net; the rest is circulation,
reception and plant. The clinic it replaces was 2×2 × 14 m, 3,237 m² of floor,
four times the most a four-doctor practice uses, and a building that size
could never have been oversubscribed at any city size this game reaches.

**The hospital is a 3×5 lot: a 3×3 building and a 3×2 parking deck beside it,
both fronting the street along the lot's 5-tile side.** The building is 72 beds
at **2,500 sf a bed**, the US planning figure for a hospital of 50 beds or more
([Definitive Healthcare](https://www.definitivehc.com/index%2ephp/resources/healthcare-insights/average-us-hospital-square-footage)
puts it at about 2,400–2,600 from Medicare cost reports): 180,000 sf, **16,700
m²**. That is a plate of about 2,800 m² over **six storeys at 4.5 m** floor to
floor, the low end of the 14 ft 8 in–16 ft (4.5–4.9 m) inpatient floors run in
project examples
([City of Naples planning record](https://www.naplesgov.com/media/98066);
a single source), so it stands **27 m**. It is the one civic building whose
floor is stated rather than read off the massing formula: 15 tiles at 27 m would claim 23,400 m², and the
deck is ground, not floor.

**The cemetery's reach, draw and price.** Its **collection range is 40 tiles**,
the health ladder's clinic band: no published standard gives a cemetery's reach,
so this is the game's band, taken because death care rides the health
department. Its **¢3,500 and ¢140 a month** are priced on the civic ladder beside
the recycling depot, the clinic and the transfer station, not on the generators'
dollar scale. Its draw is the gatehouse's alone, one 128 m² floor (1,378 sf) at
the office intensity of 13.6 kWh/sf a year (CBECS 2018, table C14) and 14.48
gal/sf a year (EPA WaterSense at Work), the method
[municipal-services.md](municipal-services.md#what-the-facilities-draw-derived-2026-10-05)
runs for every civic building: 18,738 kWh over 8,760 hours is 2.14 kW, **0.0021
MW**, and 19,950 gallons over 365 days is 54.7 a day, **0.2 kL**. The grounds
draw nothing. A body's penalty, **32 points a month**, is a dial with no
published figure behind it, set so that one body left four months all but
cancels a clinic's 140; it never feeds the death rate.

**The crematorium's draw and emissions.** Its floor is the massing rule's, 2 × 2
× 185 × 2 = 1,480 m², 15,931 sf. Power at CBECS 2018's "service" intensity, 7.2
kWh/sf a year: 114,700 kWh over 8,760 hours is 13.1 kW, **0.0131 MW**. Water at
the office benchmark, 14.48 gal/sf a year: 230,700 gallons over 365 days is 632
a day, **2.4 kL**. The retorts burn natural gas, 12.5–28.5 therms a cremation
(American Crematory), which the game's power model does not carry, so the draw
is the building's alone. **Pollution 1.** Crematories do not report to the Toxics
Release Inventory (40 CFR 372.23 lists no NAICS 8122xx), so there is no TRI
figure; measured emissions are about 0.12 lb/hr particulate (a WV DEP source
test, [permit evaluation](https://dep.wv.gov/daq/Documents/August%202016%20Draft%20Permits/3327-Eval.pdf))
and about 0.0028 lb of mercury a cremation (Ohio EPA GP-23.1, second-hand). Over
a 2,080-hour year that is about 255 lb, which on the scale where the coal plant's
484,000 lb stands for 140 is **0.07**. It is **rounded up to 1**, the field's
smallest nonzero value, because a real nonzero emission should register. The
flue is one stack, **7.6 m (25 ft)** above grade, inside the 18–25 ft range of
US crematory air permits (Mojave AQMD 18 ft, Auburn ME 23 ft, SW Clean Air 24.7
ft) and at least 3 ft above the roof (Michigan general permit). The crematorium's
hearses are the cemetery's: two, collecting from it as from a cemetery.

The cemetery unlocks at **milestone 0**: a burial ground is the first public
facility any settlement builds, and a village that meets its first death with no
way to answer it and none to buy is a bad first hour. The programme rule is that
the large facility costs less per person served and more per tile:

|          | Per tile | Per person | Upkeep/tile | Upkeep/person |
| -------- | -------- | ---------- | ----------- | ------------- |
| Clinic   | ¢2,500   | ¢0.625     | ¢190        | ¢0.0475       |
| Hospital | ¢1,200   | ¢0.600     | ¢87         | ¢0.0433       |

**The per-person clause holds; the per-tile clause does not, and it gives way
to the deck.** A hospital is cheaper per person than the clinic to build and to
run, which is the ladder the player feels. Per tile it is less than half the
clinic's, because six of its fifteen tiles are a car park a clinic does not
need; even its nine building tiles alone come to ¢2,000 a tile. Parking to code
is worth more to this building than a price contrived to keep a ratio, so the
price stays where the per-person figures put it.

**Hospital parking is to code.** The common US zoning minimum for a hospital
is **2 spaces a bed** (St Charles MO, Wadsworth OH, Stacy MN, Canby OR,
Marshfield MA; for example
[Wadsworth's chapter 25](https://www.zoneomics.com/code/wadsworth-OH/chapter_25)),
so 72 beds need **144**. They go in a two-level deck, ground and roof, on the
3×2 tiles. It is laid in the 60 ft module of 90° parking, 9 × 18 ft stalls
either side of a **24 ft two-way aisle**, the width the codes ask (for example
[Forest Lake MN](https://codelibrary.amlegal.com/codes/forestlake/latest/forestlake_mn/0-0-0-40825)).
Two modules and a 12 ft ramp lane beside its parapet are 40.5 m, so the deck
reaches half a metre past its two tiles toward the block: about 2,430 m² a
level. Less a cross-aisle at the back, the ramp and two stair-and-lift cores, a
level holds **72**, and the deck **144**: 33.7 m² (363 sf) a space all-in, about
4% over the top of the 300–350 sf a structured space takes
([Parking Professional, 2013](https://www.parking.org/wp-content/uploads/2016/01/TPP-2013-10-How-Much-does-a-Structure-Cost.pdf)),
because a deck this small carries its ramp and cores over fewer spaces.
The deck is 3.35 m (11 ft) floor to floor, which clears the 2.49 m (98 in) a
van's route needs. The accessible spaces stand on the surface by the main
entrance, nearer it than any deck space, as the ADA allows: 149 spaces in all
take **5 accessible spaces, 1 of them van-accessible** (one in six), under
[ADA 2010 §208.2](https://www.access-board.gov/ada/guides/chapter-5-parking/) —
a car space 2.44 m wide with a 1.52 m aisle, a van space 3.35 m with the same
aisle. The 10% that §208.2.1 asks of parking serving outpatient facilities is
not applied: this is an inpatient hospital, and the clinic carries the
outpatients. Beside the main entrance, on the building's street side, an
ambulance canopy covers the emergency drop-off.

## What it is not

- **Not a demographic model, and not eldercare.** No ages, cohorts, causes of
  death or life expectancy — one constant against one aggregate. Eldercare needs
  an age structure that does not exist.
- **Not disease or epidemics.** An outbreak is an _event_, and events are
  excluded from this whole programme for the reason the umbrella gives.
- **Not a death spiral.** Uncollected bodies hit one field and stop. **Not grave
  reuse** either: real jurisdictions reuse plots after 20 to 75 years, and at
  72,000 ticks to a game year no session would ever see one come back.
- **Not a rework of coverage.** Road-network BFS is untouched; the penalty rides
  the pass that already exists.
