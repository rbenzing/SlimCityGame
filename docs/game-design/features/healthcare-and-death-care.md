# Healthcare and death care — design

- **Status:** Draft
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
beds**, a list of **30,000 people**, 72 tiles of reach, five storeys, an
ambulance canopy and a staff car park. It reads as a campus, not a box.

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

**Cemetery** — 3×3 tiles of ground, a gatehouse, **780 burial plots**. Cheap to
place, cheap to run, and it fills: a city of 20,000 fills one in four game
years. **Crematorium** — 2×2 tiles, a chapel, two cremators, an abatement flue.
No capacity at all, only a throughput of **1,600 cremations a year**, more than
three times what the largest city this game names can produce. It never fills,
costs about seven cemeteries to build, emits a little pollution, and is the only
permanent answer. A full cemetery is the decision this epic exists for, and it
has three answers.

**Build another cemetery.** ¢3,500 and nine more tiles, permanently — those
tiles never come back. Demolishing one that holds interments costs **¢10 per
interment** to exhume and reinter, so clearing a full cemetery costs ¢7,800,
twice what it cost to build; an empty one demolishes normally. Burial is cheap
to start and expensive to undo, which is exactly what it is.

**Build a crematorium.** ¢26,000 and four tiles, once. Its upkeep is worse than
four cemeteries' and better than five, so a city that keeps burying overtakes it
around its fifth — having committed 45 tiles, 1.8 hectares, to ground it can
never rezone. Or **do nothing,** and find out what that costs.

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
so a game year is **72,000 ticks**. Crude death rates for developed, urbanised
countries: England and Wales 9.20 per 1,000 in 2024 (ONS); the United States
9.03 (CDC/NCHS, 2024); the world figure around 7.8 (UN World Population
Prospects). **Take 9 per 1,000 per year** — the bottom of the developed band,
because our population has no age structure and so cannot carry the elderly skew
that pushes a real city toward 11.

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

**Clinic — 8,000 people.** Four full-time doctors at 2,000 patients each — the
cap the 1966 Family Doctor Charter set, which is a _standard_. The current
English actual is 2,176 per FTE doctor and rising (BMA, 2026), which would give
8,700; we took the standard, not the symptom.

**Hospital — 30,000 people.** 72 beds at 2.4 acute beds per 1,000 residents (the
UK's OECD figure; the OECD's own 4.2 is _total_ beds including psychiatric and
long-term care, which this building is not). The lean end, deliberately: at 4.2
the same 72 beds serve 17,000 and at Japan's 12.5 only 5,800, either of which
collapses the ladder into the clinic. At 2.4 the hospital sits between the Grand
City and Metropolis milestones, so a Grand City needs one and a Metropolis two.
Cross-checked another way: 72 beds × 39.3 admissions per bed-year (AHA, 2024 US
survey; independently 365 × 0.72 occupancy ÷ 6.5 days OECD length of stay = 40)
= 2,830 admissions a year against an OECD curative discharge rate of 128 per
1,000 = **22,100**. The routes bracket 22,000–30,000; we took the top so the
hospital is a clear step, not a marginal one.

**Cemetery — 780 plots.** A grave plot is 2.44 m × 1.22 m = 2.98 m². Gross
density in single-grave lawn sections is 1,000 burials per gross acre (ASPO,
_Cemeteries in the City Plan_, 1950) = 2,471 per hectare = **4.05 m² of cemetery
land per grave**, which the same source's land-use split confirms independently
(2.98 m² ÷ 73% saleable = 4.08 m²). A cemetery is ground, so it uses the whole
400 m² tile rather than a building's 185 m² plate: 400 ÷ 4.05 = 98 graves per
tile, and over a 3×3 site with one tile given to the gatehouse, 8 × 98 = 784 →
**780 plots**. Deliberately smaller than the planning standard — ASPO's "one
acre per 1,000 population" would last 111 game years at our death rate, past
even the 30–40 the ICCM asks authorities to secure — because a cemetery must
fill inside a session or it is not a system.

**Crematorium — 1,600 cremations a year**, i.e. `1,600 / 72,000` = **0.0222 per
tick**, 133 per game month. 522,733 cremations across the British Isles in 2024
over 325 crematoria = 1,608 each (Cremation Society of Great Britain).
Cross-check: two cremators at the UK's average 90-minute cycle over an
eight-hour day is 2,670 a year, and 1,608 is 60% of that — matching both the
80%-of-practical-capacity ceiling planning inspectors apply and the fact that
chapel slots, not cremators, are usually what binds. Say plainly what that means
here: a Metropolis produces 450 deaths a year, so **one crematorium covers the
largest city in the game three and a half times over.** Throughput never binds
at our scale; the decision is siting and money. The figure earns its place as
the rate a backlog drains at — 300 uncollected bodies clear in 2.3 months.

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
| Hospital         | 2×3       | 16 m   | 5,550 m²    | 30,000 people | ¢18,000 | ¢1,300 | 3         |
| Cemetery         | 3×3       | 3.2 m  | ground      | 780 plots     | ¢3,500  | ¢140   | 0         |
| Crematorium      | 2×2       | 6.4 m  | 1,480 m²    | 1,600/year    | ¢26,000 | ¢600   | 3         |

Every footprint and height is derived by the civic-massing formula, and the
arithmetic is shown once, in the technical document. **The existing clinic's
2×2 × 14 m does not agree with the capacity derived for it** — 3,237 m² of floor
against the 445 m² a four-doctor practice needs, seven times over, implying a
list of 52,000 and a building that could never be oversubscribed at any city
size this game reaches. Corrected to 1×2 × 6.4 m. The cemetery unlocks at
**milestone 0**: a burial ground is the first public facility any settlement
builds, and a village that meets its first death with no way to answer it and
none to buy is a bad first hour. The programme rule is that the large facility
costs more per tile and less per person served; both clauses hold, and only just:

|          | Per tile | Per person | Upkeep/tile | Upkeep/person |
| -------- | -------- | ---------- | ----------- | ------------- |
| Clinic   | ¢2,500   | ¢0.625     | ¢190        | ¢0.0475       |
| Hospital | ¢3,000   | ¢0.600     | ¢217        | ¢0.0433       |

That is what fixed the hospital at five storeys on six tiles rather than four on
eight: an eight-tile hospital has a 4× footprint against a 3.75× capacity, and
no price satisfies both clauses at once.

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
