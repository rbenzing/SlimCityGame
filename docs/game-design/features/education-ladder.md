# Education ladder — design

- **Status:** Draft
- **Date:** 2026-09-18

Epic 3 of the programme in [municipal-services.md](municipal-services.md), on the
capacity foundation of epic 0 — [service-capacity.md](service-capacity.md) and
[../../engineering/features/service-capacity.md](../../engineering/features/service-capacity.md)
— with its technical plan in
[../../engineering/features/education-ladder.md](../../engineering/features/education-ladder.md).

## What the player gets

Three schools instead of one, and each opens a door the one below it cannot.
Houses level up behind a primary school, apartment blocks and high streets behind
a secondary school, office towers behind a university. A library is the fourth
building and it is not a school — it stretches the catchment of the schools
already there, so a block just outside a school gate can be brought inside one.

A player should be able to look at a stalled district and say "those blocks will
not level up until I build a secondary school" and be right.

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

| Rung | Building             | What it opens                                                                 |
| ---- | -------------------- | ----------------------------------------------------------------------------- |
| 1    | **Primary School**   | Low-density residential reaches level 3                                       |
| 2    | **Secondary School** | Medium and high-density residential, mixed and local commercial reach level 3 |
| 3    | **University**       | High-density commercial reaches level 3                                       |
| —    | **Library**          | Nothing on its own; extends every school's reach by up to a fifth             |

Level 2 is not gated by education at any density. A city has to be able to grow
before it can afford a school, and a game that stops a village at level 1 until
it buys a ¢6,000 building has not made a decision, it has made a toll gate.
Industry is not gated either: it is a young city's tax base and the sector least
able to pay for the ladder that would unblock it, so its level 3 stays what it is
today, land value alone.

### The thresholds

The education field runs 0–255 and a school writes into it, strongest at its own
door and falling to nothing at the edge of its range. Today a residential lot
needs that field over **60** to reach level 3; that number does not change.

| Gate                                                | Field            | Threshold | Reached by       |
| --------------------------------------------------- | ---------------- | --------- | ---------------- |
| Low-density residential, level 3                    | Education        | over 60   | Primary school   |
| Dense residential, mixed, local commercial, level 3 | Education        | over 150  | Secondary school |
| High-density commercial, level 3                    | Higher education | over 60   | University       |

A primary school writes 150 at its own door and never more, so it can never open
a dense-residential lot however many are built. That is the ladder: the rung
below cannot substitute for the rung above, at any quantity.

### Catchments, not circles

A school reaches people down the road network, as every service does. The
distance at which its coverage still clears its gate is its **catchment**, and it
is shorter than its range because coverage falls off with distance:

| Rung       | Range               | Catchment at full funding   |
| ---------- | ------------------- | --------------------------- |
| Primary    | 50 tiles (1,000 m)  | 30 tiles — 600 m of walking |
| Secondary  | 100 tiles (2,000 m) | 41 tiles — 820 m            |
| University | 100 tiles (2,000 m) | 60 tiles — 1,200 m          |

The ladder is also a ladder of reach — neighbourhood, district, city, which is
how school provision is organised — and that falls out of the arithmetic.

### The library

A library is a **multiplier on reach**, not a rung. Inside a library's own range,
every education building's range is stretched by up to a fifth — the full fifth
at the library's door, tapering to nothing at its edge. A primary school's
catchment goes from 600 m to 720 m, a secondary's from 820 m to 980 m.

It is worth more than a fourth school for three reasons. It cannot open a gate on
its own, so a library with no school in reach does nothing at all — the honest
model of what a branch library is for. It is most valuable exactly where a school
is weakest, at the edge of a catchment, so it is a **siting** decision rather
than a buying one. And it is cheap, ¢87 per thousand people served against a
primary school's ¢1,200, which makes "patch the edge" a real alternative to
"build another school" rather than a strictly worse one.

### When a school is overloaded

Under [service-capacity.md](service-capacity.md) a facility serving more people
than it has places writes a weaker field. For a school that is not cosmetic: its
catchment shrinks toward its own door, and the edge blocks stop levelling first.

| Primary school load | Catchment                            |
| ------------------- | ------------------------------------ |
| 100%                | 600 m                                |
| 150%                | 400 m                                |
| 200%                | 200 m                                |
| 250%                | nothing — the gate closes everywhere |

A secondary school has less headroom, not more: it closes at **170%**, because
its threshold is a larger fraction of its strength. The city's second one is
needed sooner than the first one's margin suggests, and that is the mistake this
epic expects players to make.

### Being told about it

Education gating growth means an under-built ladder quietly caps the city, and a
cap with no explanation is the worst thing a builder does to a player, so the
ladder is told three ways:

- **On the lot.** A building that meets every other requirement for its next
  level and fails only the education gate carries a problem marker, the same one
  already used for no power and no water. The answer is on the stuck building.
- **In the Services panel.** The Education row splits into three, one per rung,
  each with its own load gauge. A city reading `Primary 45% · Secondary 310%`
  has a diagnosis, not a number.
- **In the overlay.** The education overlay draws the three gate lines rather
  than a gradient, so a catchment has a visible edge and a player can see which
  side of it a block is on. This turns "my city stopped growing" into "my city
  stopped growing there".

## What it interacts with

**Growth.** The existing rule — residential level 3 needs education over 60,
recorded in [../simulation-rules.md](../simulation-rules.md) — is preserved
exactly for low-density residential and extended to new gates elsewhere. Nothing
already legal becomes illegal at the bottom rung; the tightening is that dense
zones, which were never education-gated, now are. Level 3 still needs land value
over 190 everywhere, so education is an additional gate and never a substitute:
a district with a university and no land value is still a district of level 1
buildings.

**Capacity.** This is where capacity stops being a gauge and becomes a
consequence. Two schools covering the same district pool their places, so a
second is always a real answer to an overloaded first — and because coverage
takes the strongest source rather than the sum, two side by side buy capacity,
not reach, which is the library's job.

**The budget.** Funding scales range and capacity together, so turning the
education slider up widens every catchment and serves more people at once. It is
the fast answer to a stalled district and it is rented monthly; the school is the
slow answer and it is owned. The ladder sharpens that trade, because the slider
can move a gate line across a block overnight.

**Milestones.** Each rung unlocks by population, and the population that unlocks
it is the population that needs it — see [../progression.md](../progression.md).
No rung requires the rung below to have been _built_: a hard lock on a ploppable
is a worse failure than a soft one, so the city is pushed up the ladder by
needing the levels rather than by being refused the button.

## Tuning

Every figure derives from a published provision standard and our own 20 m tile.
Settled numbers belong in [../balancing.md](../balancing.md).

**The age assumption, stated because the city has no age model.** A single year
of age is taken as **1.2%** of the population, the figure epic 0 derived and this
epic reuses rather than restates. The city does not track ages and nobody ever
dies, so any school figure makes an age assumption; ours is written down, and it
understates demand in a boom because a fast-growing city is younger.

| Rung      | Ages                                    | Years | Places per 1,000 |
| --------- | --------------------------------------- | ----- | ---------------- |
| Primary   | 5–11                                    | 7     | 84               |
| Secondary | 11–16                                   | 5     | 60               |
| Tertiary  | 16–18 full, 18–21 at half participation | 2 + 3 | 42               |

**Capacities** follow from a standard school size divided by that rate. A
two-form-entry primary is 2 × 30 × 7 = 420 places, so 420 ÷ 84 × 1,000 =
**5,000 people**; a six-form-entry secondary is 6 × 30 × 5 = 900 places, so
900 ÷ 60 × 1,000 = **15,000 people**. There is no standard university size, so
that roll comes from our own scale: the top milestone is 50,000 people needing
50,000 × 4.2% = **2,100 places**, and one campus provides them. A library is
provided at about 30 m² of floor per 1,000 population, so a 450 m² branch
serves **15,000 people**.

**Ranges** come from published walking distances at 20 m per tile. The transport
guidance most often used gives a school journey a desirable walk of 500 m, an
acceptable 1,000 m and a preferred maximum of 2,000 m. Primary takes the
acceptable figure, 1,000 ÷ 20 = **50 tiles**; secondary the preferred maximum,
2,000 ÷ 20 = **100 tiles**, which is also where the statutory step from 2 miles
to 3 miles at age 8 points. The university keeps 100 tiles as an assumption:
there is no walking standard for higher education because its students do not
walk, and the simulator has no student travel to model. A library takes the
public-library access standard of one mile in an urban area, 1,609 ÷ 20 =
**80 tiles**.

**The existing school's range of 56 does not survive.** 56 tiles is 1,120 m, 12%
over the acceptable school walk and traceable to no standard; it becomes 50. The
statutory distances are not the answer either: 2 miles is 161 tiles and 3 miles
241 on a map 256 tiles wide, so a school ranged to the statutory limit would
cover most of the city and there would be no ladder to climb. That distance is
where an authority starts paying for a bus, not where a catchment ends.

**Sizes** are derived in the technical document by the formula in
[../../art/civic-massing.md](../../art/civic-massing.md), against the scale in
[../../art/README.md](../../art/README.md). Two results matter here. The existing
school's 3×3 lot survives and its 10 m height does not — it is a two-storey
building, 6.4 m, and a 3-storey box reads as an office. And two buildings get
less ground than the standard asks: the primary school's lot holds about half
the outdoor play its roll needs, and the university needs 72 tiles and gets 36.
Both are recorded as shortfalls rather than hidden in a rounded number.

**Prices** scale from the one entry the game already balanced around: the
existing school is ¢6,000 for 2,100 m² of floor and ¢400 for 30 staff, so ¢2.86
per m² and ¢13.30 per member of staff per month.

| Building         | Cost    | Upkeep | Per 1,000 served | Upkeep per 1,000 | Milestone |
| ---------------- | ------- | ------ | ---------------- | ---------------- | --------- |
| Primary School   | ¢6,000  | ¢400   | ¢1,200           | ¢80              | 1         |
| Library          | ¢1,300  | ¢80    | ¢87              | ¢5               | 2         |
| Secondary School | ¢15,000 | ¢850   | ¢1,000           | ¢57              | 3         |
| University       | ¢50,000 | ¢4,000 | ¢1,000           | ¢80              | 5         |

The programme's affordability override does not bite: each rung unlocks at a
milestone whose reward covers it outright — ¢15,000 at Busy Township for the
library, ¢25,000 at Big Town for the secondary, ¢75,000 at Grand City for the
university — and the first school still costs what it always did.

## What it is not

- **Not a fourth school.** The library is deliberately a different kind of
  thing; a ladder of four schools is three decisions about money and none about
  place.
- **Not per-pupil simulation.** Nothing tracks a child to a school, a roll or an
  admission. Capacity is an aggregate of people in reach against places provided.
- **Not a rework of coverage.** Road-network walking from the nearest road tile,
  funding-scaled range, two tiles of radiation — unchanged. The library changes
  how far a school's falloff carries, not how it travels.
- **Not new zone levels.** The ladder gates the three that exist. A fourth
  residential level is a zoning question and belongs with zoning.
- **Not education as an economic input.** Nothing here makes an educated
  population richer, more productive, or less criminal. Those are demand and
  economy questions; what should never be built belongs in
  [../../DESIGN.md](../../DESIGN.md).
- **Not school buses, catchment drawing, or term time.** Each is a system of its
  own and none changes what this epic is for.
