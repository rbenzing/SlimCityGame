# Garbage recovery — design

- **Status:** Built 2026-10-08
- **Date:** 2026-09-18

## What the player gets

Rubbish stops being one dial. Today the city buries it or burns it, and the only
question is how many burners to buy. After this epic the stream can be taken
apart first: a drop-off yard a small town can afford, a sorting plant a city
can, and a transfer station that lets a facility serve ground its own collection
round cannot reach. Every tonne recovered is a tonne of landfill not painted, a
tonne not burned, and a credit on the statement.

Epic 5 of the programme in [municipal-services.md](municipal-services.md).

## Why it earns its place

The waste loop is open at the far end. Collection works — trash accumulates,
trucks run, a landfill fills, an incinerator burns — and then nothing comes back
out. Burning is the only sustainable outcome, so the system reduces to one
purchase repeated, which is a decision the player makes once.

Worse, burying was not a _worse_ option. It was not an option at all. A
painted landfill tile held 600 units and a village of 400 people generated
4,000 units a game day, so the smallest legal landfill filled in about **six
real seconds** at 1× speed and then stopped collecting forever. The first slice
of this epic (built 2026-10-08, [below](#what-a-trash-unit-is-and-what-the-existing-numbers-mean))
put the whole chain on one real unit, so burying is a real, cheap, finite,
visibly-consumed option and recovery has something to be better than.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md): a recovery
facility is the first waste building whose benefit the player traces in three
places at once — the pile growing slower, the burner running cooler, a line on
the budget.

## How it works, for the player

**Every facility that is not a hole in the ground forwards what it cannot
keep.** That is the one new rule and it covers both new buildings. A sorting
plant never collects rubbish: it sorts recycling — the carts of the kerbside
depots its streets connect to, then its own round of apartment blocks and
businesses — sells the 87% a plant
recovers, and sends the residue to the nearest final disposal site its streets
reach. A transfer station collects what no disposal site reaches, keeps it no
longer than its tipping floor allows and forwards all of it. A landfill and an
incinerator forward nothing, which is what makes them final.

**A recovery facility with nothing behind it fills up and stops.** The residue
has to go somewhere. Build a sorting plant and no landfill and its residue
store, a week of it at full throughput, fills; then it stops sorting, the
depots' carts go back to the regional plant and its round's blocks and
businesses put their recycling back in the bin — the incinerator's existing
full-buffer rule, which means the ladder cannot be climbed by skipping its
bottom rung.

**Two rounds, not one truck.** Recovery adds a second collection round with its
own livery rather than a split-body vehicle. A recycling round carries about a
fifth of the weight of a refuse round and wants a different route size; a split
body forces the two into the same one.

### The ladder

| Building                    | Serves                                   | Diverts                           | Reach    | Cost / upkeep    | Unlocks at    |
| --------------------------- | ---------------------------------------- | --------------------------------- | -------- | ---------------- | ------------- |
| Kerbside Recycling Depot    | 38,000 homes                             | 10% of a house's waste            | 32 tiles | ¢3,200 / ¢260    | Busy Township |
| Transfer Station            | 50 short tons a day, about 20,000 people | none                              | 40 tiles | ¢7,500 / ¢540    | Small City    |
| Materials Recovery Facility | 50 t a day: the depots, then its round   | blocks' and businesses' recycling | 48 tiles | ¢24,000 / ¢1,750 | Grand City    |

The Materials Recovery Facility is the third rung (decided 2026-10-08, see
[below](#the-materials-recovery-facility-built-2026-10-08)): it sorts the
depots' carts in town and runs its own round for the apartment blocks and
businesses kerbside does not serve.

The first rung is a **kerbside recycling programme**, built as its depot, not
a drop-off yard (decided 2026-10-08, see
[below](#the-kerbside-recycling-depot-built-2026-10-08)): a drop-off yard
measurably captures about a sixth of what kerbside does, so it would divert
barely 2% of what it served. The transfer station diverts nothing at all,
because what it sells is **reach**. **Overlapping catchments do not stack**:
paper cannot be recycled twice, so a building in reach of two depots is served
once.

**What the player sees**, in order: the landfill pile grows visibly slower, on
the terrain rather than in a panel; the incinerator's plume shrinks, because
burn rate drives emission; a monthly credit appears; a second livery runs.

## What it interacts with

**The existing waste system, extended rather than replaced.** Landfill painting,
per-tile accumulation, the road-network collection radius, the incinerator's
buffer and burn, and the cosmetic fleet all stay as they are. The account in
[../../world-sim/services-model.md](../../world-sim/services-model.md) stays
accurate; recovery adds a step in front of it.

**The trash unit, which has to be fixed first.** A diversion percentage is
meaningless against a base rate that is wrong, and it is wrong in two ways — see
Tuning. Correcting it belongs here, because a share of an incoherent number is
an incoherent number.

**Epic 0, service capacity.** Waste already has a capacity-like mechanic in the
incinerator's buffer, and the two are **not** the same quantity: a buffer is a
stock, epic 0's capacity a population. They stay separate in the data and unify
at their source — a facility's buffer _and_ its people-served figure both fall
out of its daily throughput, one dial with two readings. See
[service-capacity.md](service-capacity.md) and its
[technical plan](../../engineering/features/service-capacity.md).

**The budget.** No funding slider: a sorting line that runs at half speed
because the budget says so is not a thing that happens to a sorting line. The
money here is capital, upkeep and the credit, booked through the existing pass
in [../economy.md](../economy.md). Nothing new gates growth — uncollected trash
does not feed land value or happiness today and this epic does not change that.

## Tuning

Every figure is derived from a published municipal standard and our own 20 m
tile. Settled values belong in [../balancing.md](../balancing.md).

### What a trash unit is, and what the existing numbers mean

Published municipal solid waste generation is **2.2 kg per person per day**
(4.9 lb, the national figure in the waste characterisation used throughout; the
global average is 0.74 and the high-income average 1.57, so this is the top of
the published band and the right end for a car-scaled city).

The code generates trash **per building**: 2 units a pass for a residential
building, times its level, 20 passes a game day. Divided by residents that is 10
units per resident-day for a level-1 house, 7.5 for a level-3 house, 5 for a
terrace and 0.8 for a level-3 tower — **a 12.5× spread** in which a flat-dweller
makes an eighth of a householder's rubbish. No published figure supports that;
generation becomes per resident and per job.

Taking the low-density house as the right rung, 10 units = 2.2 kg, so **one unit
is a shade over 0.2 kg**. We settle on **0.25 kg**, making 4,000 units a tonne.

**Built 2026-10-08, the unit correction.** The 2.2 kg is all municipal waste
over the population, and 55–65% of it comes from homes, the rest from
businesses and institutions
([EPA](https://archive.epa.gov/epawaste/nonhaz/municipal/web/pdf/msw_2010_rev_factsheet.pdf)).
Charging every resident 2.2 kg and every job again would count the shops'
waste twice, so generation splits it: **1.32 kg a resident a day** (60%), 5.28
units, and **1.86 kg a job a day**, the other 40% over the country's 160
million jobs for its 335 million people, 7.44 units. Together they give back
2.2 kg a person. The per-employee planning rates California lists, 9–10 lb a
job, are 1990s estimates the state itself calls unvalidated
([CalRecycle](https://www2.calrecycle.ca.gov/WasteCharacterization/General/Rates)),
and a works' process waste is not municipal waste at all, so a job is a job.
The figures below are the ones this slice re-derived; on the 0.25 kg reading
the incinerator's old catalog entry said:

| Catalog figure           | In units   | Real terms                      | Verdict                            |
| ------------------------ | ---------- | ------------------------------- | ---------------------------------- |
| `burnRate: 4000` a pass  | 80,000/day | **20 t/day**, serving **9,100** | Too small by 15–30×                |
| `bufferCapacity: 400000` | 5 days     | **100 t** of pit storage        | Right — published storage is 3–5 d |
| `trucks: 4`              | —          | a fleet for **50,000** (below)  | Cosmetic; not a capacity           |
| 4×4 tiles at 20 m        | 18,500 m²  | a **300–600 t/day** plant       | The building is right              |

Three dimensions describing three plants, 15× apart. We trust the building: it
is what the player looks at, and
[../../art/civic-massing.md](../../art/civic-massing.md) is the only one of the
three with a rule behind it. `burnRate` is re-derived from it, at **450 t a
day**, the middle of the building's band and about the size of the 475 t a day
line Pasco County is adding: **90,000 units a pass**, a plant for about 200,000
people. The pit is five days of that, **9,000,000 units** — the usual design,
though no published figure was found, so it is a dial. Its own draw follows the
plant: 450 t at 63 kWh a tonne is **1.18 MW**. `trucks` stays at 4, a render
budget rather than a capacity.

**The landfill was short by more than 10,000×.** A tile renders a pile up to
6 m over 20 × 20 m — 2,400 m³ — and held 600 units, which is 150 kg: 0.06
kg/m³, lighter than air. A modern landfill compacts its waste to 1,200–1,500
lb a cubic yard: Sioux Falls calls 1,200–1,300 typical and reached 1,500,
Chattanooga measured 1,460
([Sioux Falls](https://www.waste360.com/landfill/sioux-falls-s-d-improves-airspace-utilization-for-regional-landfill),
[Chattanooga](https://register.chattanooga.gov/sites/default/files/resources/Audit1508Landfill_Sustainability.pdf)).
The 0.3–0.5 t/m³ once taken here is waste as it is hauled, before the
compactor. At the conservative 1,200 lb, **0.712 t/m³**, a tile holds about
1,700 t, **6,835,200 units**, derived in the code from the tile, the pile and
the density. A city of 100,000 then fills some 47 tiles a game year, and the
pile's 6 m is one lift, where a real landfill closes 40–150 m tall. Burying
becomes cheap, finite and visible. A save from before the slice keeps the fill
fraction it had: its stored units are scaled by the new capacity over the old.

### The recovery rates

Diversion comes from published recovery rates by material weighted by published
composition. Nothing here is chosen.

| Material                  | Share | Recovered | Contribution |
| ------------------------- | ----- | --------- | ------------ |
| Paper and paperboard      | 23.1% | 68.2%     | 15.7 pp      |
| Food                      | 21.6% | 4.1%      | 0.9 pp       |
| Plastics                  | 12.2% | 8.7%      | 1.1 pp       |
| Yard trimmings            | 12.1% | 63.0%     | 7.6 pp       |
| Rubber, leather, textiles | 11.1% | 13.3%     | 1.5 pp       |
| Metals                    | 8.8%  | 34.0%     | 3.0 pp       |
| Wood                      | 6.2%  | 17.1%     | 1.1 pp       |
| Glass                     | 4.2%  | 25.0%     | 1.1 pp       |

The eight sum to **32.0%** against the published national recycling-and-
composting headline of 32.1% — the derivation checks against its own source.
The four dry streams — paper, plastics, metals, glass — come to **20.9%**, but
that is the nation's dry recovery across every programme at once: kerbside,
drop-off, commercial and deposit. It is kept here as context only. A sorting
plant that diverted 21% of everything in its reach would count kerbside's
share a second time, so no building earns it; the depot and the sorting plant
each divert what their own programme measurably captures, below. The 8.5 pp in
food and yard is composting, a different building, out of scope.

The draft gave a drop-off recycling centre 7% of the same four streams, from a
participation claim no source supports; measured drop-off collection is about
a sixth of kerbside's, and the first rung became the kerbside depot (see
[the kerbside recycling depot](#the-kerbside-recycling-depot-built-2026-10-08)).
Of the rates above, paper, food, yard trimmings and plastics are confirmed on
EPA's 2018 overview
([EPA](https://www.epa.gov/facts-and-figures-about-materials-waste-and-recycling/national-overview-facts-and-figures-materials));
glass is 25% there, not the 31.3% first written, which is the container rate;
metals, textiles and wood are still to confirm, though nothing built rests on
them.

### Catchments, and the one figure we could not derive

A collection round's published time budget is roughly four hours on route, two
hauling and one at the disposal site across 4.3 round trips — 14 minutes one
way, about 9 km. Our map is 5.12 km across, so the published haul says every
facility is within reach of every round, and the existing 28-tile landfill and
40-tile incinerator radii are a **game** constraint, not a physical one. The
three new reaches are calibrated against those two — 32, 40 and 48 tiles by
facility size — an assumption, stated rather than dressed up.

The transfer station inherits the finding. EPA's costing puts its break-even
at a **35-mile round trip**: past that, a 21 t trailer hauls more cheaply than
the 7 t packers would drive themselves
([EPA costing tool](https://www.epa.gov/system/files/documents/2024-05/costingtool-introduction-20180620.pdf)).
That is about 28 km one way, more than five times the width of the map, so
the honest translation is that it **forwards to any facility on the map at no
distance penalty** — trailer economics never bind at our scale — and its value
is purely that it collects where the disposal site cannot.

### What a recovered unit is worth

A recovered tonne of residential single-stream earned $123 in the Northeast in
the second quarter of 2024 against $86–90 to sort it, and $75 in the third
quarter of 2025 ([NERC via Waste Dive](https://www.wastedive.com/news/nerc-commodities-mrf-value-report/727375/),
[NERC via Packaging Dive](https://www.packagingdive.com/news/nerc-mrf-commodity-value-decreases-2025/807522/)):
value and cost cross _inside their own volatility_, so the commodity cheque is
not what recovery is for. What recovery is for is the **avoided landfill
tipping fee, $57–62 a tonne** in 2023–24
([EREF](https://erefdn.org/analyzing-municipal-solid-waste-landfill-tipping-fees/)) —
stable, and paid whether or not anyone wants the city's cardboard. The player is
not running a scrap business; they are not buying ground and not filling it.

In ¢ the credit is derived the same way, from what burying the unit would have
cost us in our own published-in-code figures. A landfill tile costs ¢40 to paint
and ¢3/month indefinitely, and post-closure care is a published 30-year
obligation, so a tile's whole-life cost is ¢40 + 360 × ¢3 = ¢1,120 across
6,835,200 units: **¢0.000164 a unit**, settled at **¢0.00016**, or **¢0.66 a
tonne recovered**. A sorting plant running at its full 50 t a day sorts 5.4
million units a month, recovers 87% of them, 4.7 million, and earns about ¢780
against ¢1,750 of upkeep. The credit covers under half the plant, and
recovery is a cost the city pays to bury less, which is the real relation: a
recovered tonne costs $86–90 to sort and more to collect, against the $57–62
tipping fee it saves.

### Building sizes

Derived by the civic-massing formula with one departure: a recovery building is
a single clear-span hall, so it is sized by **throughput and vehicle movement**
and the occupant-load method only confirms the staff fit, which it does by an
order of magnitude every time. Arithmetic in the
[technical document](../../engineering/features/garbage-recovery.md).

| Building                    | Plan area     | Footprint | Height | Staff |
| --------------------------- | ------------- | --------- | ------ | ----- |
| Kerbside Recycling Depot    | 2,160 m²      | 2×3       | 8 m    | 5     |
| Transfer Station            | 1,500 m² hall | 4×5       | 11 m   | 4     |
| Materials Recovery Facility | 2,510 m² hall | 5×6       | 11 m   | 17    |

Affordability holds: ¢3,200 at Busy Township, whose milestone reward is ¢15,000,
¢7,500 at Small City, whose reward is ¢40,000, and ¢24,000 at Grand City, whose
reward is ¢75,000. The sorting plant and the transfer station are not sized by
the massing formula but from built plants of their throughput, below.

The depot is a fleet yard, four trucks at about 540 m² each, with a
maintenance shed 8 m to the eaves for a side-loader's raised arm; four drivers
and a mechanic.

**Pollution** is proportional to site vehicle movements, since none of the three
burns: 10 for the depot, four trucks out and back each day (a dial on the
draft's 5 for one container pull), 20 for
the sorting plant, a dial for its own four trucks and the depots' loads in,
the diesel loaders on its tipping floor and its balers, and **25 for the
transfer station**. All three are dials: no published figure normalises a
waste site's pollution per tonne. The transfer station ranks above the sorting
plant because what it handles is mixed, putrescible rubbish rather than clean
recyclables, and below the incinerator's 120 and a landfill's nuisance,
because it neither burns nor keeps anything and a modern station tips indoors,
in an enclosed hall
([EPA](https://archive.epa.gov/epawaste/nonhaz/municipal/web/html/transfer.html)).
The painted landfill carries no pollution figure of its own yet.

### The kerbside recycling depot (built 2026-10-08)

The draft's first rung was a staffed drop-off yard diverting 7%, on a claim
that drop-off programmes reach 20–30% of households against kerbside's
70–90%. No source supports that claim, and what programmes measure does not:
North Carolina's drop-off sites collected 44 lb a household in FY2024-25
against 264 for its kerbside programmes
([NC DEQ](https://www.deq.nc.gov/environmental-assistance-and-customer-service/reports-and-studies/state-state-recycling-report-fy-2024-25/open)).
A drop-off yard would divert about 2%, so the player chose the kerbside
programme instead: a depot whose trucks empty household recycling carts.

- **What a served home sets out.** 264 lb a household a year, North
  Carolina's newest measured kerbside figure, near the 245 lb implied by the
  national 32% capture of single-family recyclables in 2020
  ([Recycling Partnership via Waste360](https://www.waste360.com/recycling/highlights-recycling-partnerships-2020-curbside-report))
  and below the 357 lb of the 2016 national survey
  ([State of Curbside via Waste Dive](https://www.wastedive.com/news/state-of-curbside-report-single-stream-carts-lead-to-highest-performing-r/432266/)).
  At the national household of 2.5 that is **0.131 kg a resident a day**,
  about 10% of a resident's 1.32 kg. It is diverted at source: a served home's
  recyclables go in the cart, never onto the trash tiles, so the landfill and
  the incinerator receive that much less.
- **Which homes.** A city's kerbside service covers single-family homes up to
  three or four units; apartment blocks and businesses hire private haulers
  ([Chandler](https://chandleraz.gov/residents/recycling-and-trash/commercial-trash-service),
  [Cincinnati](https://cincinnati-oh.gov/recycling/curbside/eligibility)).
  So the depot serves buildings of **four homes or fewer** — the house, the
  duplex, the fourplex and the townhouse row — and no block, shop or works.
- **How many homes.** A one-person automated side-loader serves about 950
  homes a day ([MTAS](https://www.mtas.tennessee.edu/reference/cost-and-productivity-estimates)),
  and recycling is collected every other week, so one truck covers about
  **9,500 homes** — derived, since no recycling-specific figure was found. A
  fleet yard takes about 540 m² a truck all in
  ([Calgary](https://www.calgary.ca/planning/projects/east-calgary-truck-maintenance-storages-facility.html),
  60 trucks on 8 acres), so a 2×3 yard holds **four trucks** and the depot
  serves **38,000 homes**, first come by building, within its 32-tile road
  reach. A home past that waits for a second depot; one reached by two is
  served once, by the first.
- **What it earns.** The recyclables go to a Materials Recovery Facility in
  town when one the depot's streets connect to has room, and otherwise leave
  the map for a regional sorting plant. Either way 87% of what is set out is recovered and the other 13% is
  sorting residue ([below](#the-materials-recovery-facility-built-2026-10-08));
  the regional plant buries its residue out of town, so a depot's credit is on
  87% of its carts, not all of them. The commodity
  margin swings too far to bank on — a Northeast single-stream tonne was worth
  $123 in the second quarter of 2024, against $86–90 to sort it
  ([NERC via Waste Dive](https://www.wastedive.com/news/nerc-commodities-mrf-value-report/727375/)),
  and $75 in the third quarter of 2025
  ([NERC via Packaging Dive](https://www.packagingdive.com/news/nerc-mrf-commodity-value-decreases-2025/807522/)) —
  so the credit is the disposal it avoids, ¢0.00016 a unit
  ([above](#what-a-recovered-unit-is-worth)), booked once a month. A city of
  40,000 in houses diverts about 630,000 units a month, recovers 550,000 of
  them and earns about ¢90;
  kerbside recycling costs a real city about $45 a household a year beyond
  its refuse round
  ([National Academies](https://www.nationalacademies.org/read/27978/chapter/6)),
  so the programme is a cost the city pays to bury less, as it is in fact.
  The cost and upkeep are dials on the existing ladder.
- **What the player sees.** A depot of sheds and parked trucks, a second
  livery of recycling trucks running the house streets, the landfill pile
  growing a tenth slower where the houses are served, and the credit in the
  month's income.

### The Materials Recovery Facility (built 2026-10-08)

The draft's third rung collected everything in its reach and diverted 21% of
it. That 21% is the nation's dry recovery across every programme, kerbside
included, so a plant earning it on top of the depots would count the houses'
recycling twice. The player chose a plant that does what a municipal sorting
plant does: it sorts the depots' carts in town, and runs its own recycling
round for the apartment blocks and businesses the kerbside round leaves to
private haulers.

- **How much it sorts.** **50 short tons a day**, 45.36 t: the size of a
  small municipal single-stream plant. Kauai's evaluation sizes its start-up
  plant at 55 t a day on 3 acres with 27,000 sq ft enclosed
  ([Kauai MRF evaluation, HDR](https://www.kauai.gov/files/assets/public/v/1/public-works/solid-waste/recycling/documents/cofk-materials-recovery-facility-evaluation.pdf)),
  and Isabella County's runs a 7 t an hour line one shift, about 50 t a day,
  with 17 staff
  ([Isabella County MRF evaluation, RRS 2023](https://www.isabellacounty.org/wp-content/uploads/2023/02/MRF-Evaluation-Full-Report-FINAL.pdf)).
  That is 181,440 units a day, **9,072 a garbage pass**, derived in code from
  the tons and the unit. Each pass it takes first the carts of the depots its
  streets connect to, at any distance, depot by depot in id order, then its
  own round, up to that figure. A depot on a road network of its own sends
  its carts to the regional plant.
- **Its round.** Within its 48-tile road reach, in building id order, it
  serves what kerbside does not: an apartment block of more than four homes at
  **0.30 kg a home a day**, and every job at **0.30 kg a day in commerce** and
  **0.25 kg in industry**. A block with shops below is served for both. The
  home figure is Hennepin County's measured 0.63 lb a unit a day
  ([Hennepin County multifamily study 2017](https://www.hennepincounty.gov/-/media/hennepinus/your-government/projects-initiatives/solid-waste-planning/multifamily-waste-study-2017.pdf)),
  under California's 0.13 t a unit a year; the job figures come from
  California's per-employee curbside-recycling rates
  ([CalRecycle 2014 Business Group Rates](https://www2.calrecycle.ca.gov/WasteCharacterization/BusinessGroupRates)),
  0.08–0.30 t a year across shops, restaurants, hotels and offices (0.22–0.82
  kg a day) and 0.05–0.16 t across manufacturing and wholesale (0.14–0.44 kg),
  taken at a typical business of each. A house, a duplex, a fourplex or a farm
  is never on the round: it is the depot's. A building is served once, by the
  first plant with room for its recycling that pass, and like kerbside its
  recycling is set aside at source and never reaches the trash tiles.
- **What it recovers.** A plant sells **87%** of what it sorts and rejects
  13% as residue
  ([Recycling Partnership 2024, via National Academies](https://www.nationalacademies.org/read/27978/chapter/4)).
  The 87% earns the avoided-disposal credit, ¢0.00016 a unit, booked once a
  month. A regional plant does the same with the depots' carts no town plant
  takes, burying its residue out of town.
- **Where the residue goes.** To the nearest landfill or incinerator its
  streets connect to, at **any distance** — a haul never binds at our map's
  scale ([above](#catchments-and-the-one-figure-we-could-not-derive)) —
  nearest by road from the plant's street, a landfill before an incinerator at
  the same distance, the next nearest when one is full. It lands in the
  landfill's pile or the incinerator's pit like collected trash. With none
  that has room, the residue fills the plant's own store, **one week of it at
  full throughput** (165,110 units, about 41 t, derived), and a full store
  stops the plant: its round serves no one, those buildings put their
  recycling back in the bin, and the depots' carts go regional again. A plant
  that is bulldozed loses its store.
- **The building.** **5×6 tiles**, 12,000 m², Kauai's 3-acre site; a
  clear-span hall of **2,510 m²** (27,000 sq ft) **11 m** tall over its tipping
  floor and balers, with bay doors on the street side, a bale yard of stacked
  cubes, a small office and its trucks parked in the yard. **17 staff.**
- **Its power.** **20 kWh a tonne** sorted, building included: Pressley and
  others measured 23.8 kWh a tonne at a single-stream plant, and Bradshaw and
  others' 2024 survey puts large plants near 10
  ([Bradshaw et al. 2024](https://www.osti.gov/servlets/purl/3015366)). 45.36 t
  a day is 907 kWh, a daily average of **0.0378 MW**, the incinerator's
  convention of its day's use over 24 hours. Its water is its staff's, 13
  gallons a worker a day, 0.8 kL.
- **Its trucks.** **Four**, in the recycling livery: a recycling body carries
  about 4 t a load at 180–200 kg a cubic metre in a 27 cubic yard body, so 50 t
  a day is about 12 loads, three a truck. The trucks are cosmetic, as every
  service fleet is.
- **Dials.** The 48-tile reach, ¢24,000 to build and ¢1,750 a month, pollution
  20 and the unlock at Grand City are kept from the draft.
- **What the player sees.** A long sorting hall and a yard of bales, a second
  fleet of recycling trucks running the blocks and the shopping streets, the
  landfill pile growing slower again where the round runs, and a larger
  credit; with no landfill or incinerator connected, a plant that sorts for a
  week and then stops.

### The transfer station (built 2026-10-08)

The draft's transfer station served 20,000 on a 3×4 lot 9 m tall, from a
participation figure and a plan-area sum. Its throughput holds up; its lot did
not. Every figure below is re-sourced.

- **What it is for.** Reach, and nothing else. It diverts nothing and is never
  final: it collects only after the incinerators and the landfill have
  collected, so what it takes is what no disposal site reaches, and it
  forwards all of it to one that has room.
- **How much it handles.** **50 short tons a day**, 45.36 t: a station in EPA's
  small class, under 100 t a day
  ([EPA transfer station design training](https://www.epa.gov/system/files/documents/2024-05/tribal-waste-mgmt-transfer-station-design-training-slide-deck1-4.pdf)).
  It is the draft's 20,000 people: 20,000 at 2.2 kg is about 44 t, and a
  typical rural station takes under 60 t a day for about 20,000 people
  ([Waste360](https://www.waste360.com/waste-collection-transfer/rural-transfer-stations-built-for-the-long-haul)).
  That is 181,440 units a day, **9,072 a garbage pass**, the same derivation
  as the Materials Recovery Facility's.
- **Whom it collects from.** Within its 40-tile road reach, in building id
  order, up to that throughput and the room on its floor each pass. A building
  reached by two stations gives each an equal share, as one reached by two
  incinerators does.
- **Its tipping floor.** EPA sizes a floor at 4,000 sq ft plus 20 sq ft for
  each ton a day to hold one day's waste
  ([Waste Advantage](https://wasteadvantagemag.com/determining-transfer-station-size-and-capacity/)),
  and states cap how long waste may stay: Kansas wants the floor cleared and
  the loaded trailers gone within 48 hours
  ([K.A.R. 28-29-23a](https://www.law.cornell.edu/regulations/kansas/K-A-R-28-29-23a)),
  and Oregon's Metro region allows 48 hours for dry waste. So the floor holds
  at most **two days' throughput**, 362,880 units, about 91 t, derived; a full
  floor stops the station collecting and the streets it served back up again.
- **Where it sends it.** Each pass up to its throughput, to the nearest
  landfill or incinerator its streets connect to that has room, at **any
  distance** ([above](#catchments-and-the-one-figure-we-could-not-derive)):
  nearest by road from its street, a landfill before an incinerator at the
  same distance, the next nearest when one is full. Distance never reduces
  what arrives. It lands in the landfill's pile or the incinerator's pit, and
  the incinerator burns it on its next pass. A station that is bulldozed loses
  its floor.
- **The building.** **4×5 tiles**, 8,000 m², 2 acres: Isle of Wight County's
  150 t a day station stands on 2 acres
  ([Isle of Wight](https://www.spsava.gov/187/Isle-of-Wight)) and Mammoth
  Lakes' on 2.42 ([CEQA](https://ceqanet.lci.ca.gov/2021050146)); the draft's
  3×4, 4,800 m², is smaller than every real site found. A tipping hall of
  **1,500 m²**: Becker County's 16,000 sq ft station holds three days at 55–60 t
  a day ([CRA](https://www.cra-recycle.org/?p=5555)). It is **10 m** to the
  eaves under a low-pitched roof, **11 m** at the ridge, because a tipping
  packer needs 25–30 ft (7.6–9.1 m) clear
  ([Waste Advantage](https://wasteadvantagemag.com/building-reuse-weighing-the-consequences/)).
  Tall roll-up doors face the street; along the hall's side a sunken load-out
  bay lets a loader push the floor down into a 53 ft (16 m) open-top transfer
  trailer, with a second trailer waiting; a scale house and its weighbridge
  stand at the entry. **4 staff**: the scale, the loader, a spotter and a lead
  (North Platte, Nebraska ran 85 t a day with 6).
- **Its power.** **5 kWh a tonne**: two small Irish stations measured 2.5–6.1
  ([EPA Ireland](https://epawebapp.epa.ie/licences/lic_eDMS/090151b2802fc4c9.pdf)),
  taken near the top for an enclosed, ventilated hall. 45.36 t a day is
  227 kWh, a daily average of **0.00945 MW**, the incinerator's convention.
  Its water is its staff's, 13 gallons a worker a day, 0.2 kL.
- **Its trucks.** **Four**, in the refuse livery. The trucks are cosmetic, as
  every service fleet is.
- **Dials.** The 40-tile reach, ¢7,500 to build and ¢540 a month, pollution 25
  and the unlock at Small City are kept from the draft. Against the sorting
  plant both money figures sit at 0.31, near the real ratios: Becker County's
  $2.9 million station against Kauai's $10.9 million plant is 0.27, and a
  station's $15–25 a tonne to run — $15–20 at 100 tons a day
  ([Waste360](https://waste360.com/archive/the-transfer-tune-up)), $25.34 in
  Portland Metro's 2017 audit
  ([Oregon Metro](https://www.oregonmetro.gov/sites/default/files/2019/03/12/private-transfer-station-rate-transparency-report-03122019.pdf)) —
  against a plant's $86–90 to sort is 0.2–0.3.
- **What the player sees.** A tipping hall with its doors to the street, a
  transfer trailer sunk beside it and another waiting, a weighbridge at the
  gate, refuse trucks reaching a neighbourhood the landfill's round never
  did, that neighbourhood's trash gone from the lens and the landfill filling
  by as much; with nothing connected behind it, a station that collects for
  two days and then stops.

## What it is not

- **Not composting.** The 8.5 pp in food and yard waste is a larger prize than
  half of what this epic recovers, and a different building with a different
  process. The number is stated above so the next epic need not derive it again.
- **Not a per-material simulation.** One stream, one diversion rate. Eight
  materials through three facilities is eight times the state for a figure the
  player reads as one percentage.
- **Not a rework of collection**, and not a payload model for trucks. The BFS,
  the building-id order and the full-buffer stop rule are unchanged, and a
  split-body vehicle would need trucks to carry something, which they do not.
- **Not waste export.** Shipping rubbish out of the city is real municipal
  practice and an interesting mechanic, and it needs somewhere to ship to. There
  is no outside world; see [../../DESIGN.md](../../DESIGN.md).
