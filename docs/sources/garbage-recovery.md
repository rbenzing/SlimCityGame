# Garbage recovery — sources and derivations

The research behind [the garbage recovery spec](../specs/garbage-recovery.md): every figure is derived from a published municipal standard and the 20 m tile. Where nothing was found the figure is a stated dial.

## What a trash unit is

Published municipal solid waste generation is **2.2 kg per person per day** (4.9 lb, the national figure in the waste characterisation used throughout). The global average is 0.74 and the high-income average 1.57, so this is the top of the published band and the right end for a car-scaled city.

The old code generated trash per building: 2 units a pass for a residential building, times its level, 20 passes a game day. Divided by residents that was 10 units per resident-day for a level-1 house, 7.5 for a level-3 house, 5 for a terrace and 0.8 for a level-3 tower: a **12.5× spread**. No published figure supports it, so generation became per resident and per job.

Taking the low-density house as the right rung, 10 units = 2.2 kg, so one unit is a shade over 0.2 kg. The unit is settled at **0.25 kg**, making 4,000 units a tonne.

The 2.2 kg is all municipal waste over the population, and 55–65% of it comes from homes, the rest from businesses and institutions ([EPA](https://archive.epa.gov/epawaste/nonhaz/municipal/web/pdf/msw_2010_rev_factsheet.pdf)). Charging every resident 2.2 kg and every job again would count shops twice, so generation splits it:

- **1.32 kg a resident a day** (60%), 5.28 units.
- **1.86 kg a job a day**, the other 40% over the country's 160 million jobs for its 335 million people, 7.44 units.

Together they give back 2.2 kg a person. California's per-employee planning rates, 9–10 lb a job, are 1990s estimates the state itself calls unvalidated ([CalRecycle](https://www2.calrecycle.ca.gov/WasteCharacterization/General/Rates)), and a works' process waste is not municipal waste, so a job is a job.

### The incinerator, re-derived

On the 0.25 kg reading the incinerator's old catalog entry said:

| Catalog figure           | In units   | Real terms                      | Verdict                            |
| ------------------------ | ---------- | ------------------------------- | ---------------------------------- |
| `burnRate: 4000` a pass  | 80,000/day | **20 t/day**, serving **9,100** | Too small by 15–30×                |
| `bufferCapacity: 400000` | 5 days     | **100 t** of pit storage        | Right; published storage is 3–5 d  |
| `trucks: 4`              | —          | a fleet for **50,000** (below)  | Cosmetic; not a capacity           |
| 4×4 tiles at 20 m        | 18,500 m²  | a **300–600 t/day** plant       | The building is right              |

Three dimensions described three plants, 15× apart. The building is trusted: it is what the player sees, and [civic massing](../art/civic-massing/README.md) is the only one of the three with a rule behind it. `burnRate` is re-derived from it at **450 t a day**, the middle of the building's band and about the size of the 475 t a day line Pasco County is adding: **90,000 units a pass**, a plant for about 200,000 people. The pit is five days of that, **9,000,000 units**, the usual design; no published figure was found, so it is a dial. Its own draw follows the plant: 450 t at 63 kWh a tonne is **1.18 MW**. `trucks` stays at 4, a render budget rather than a capacity.

The existing incinerator checks out on size and failed on throughput: 4×4 at 20 m is 18,500 m², a 300–600 t/day mass-burn plant, while `burnRate: 4000` a pass was 80,000 units a day, 20 t/day, 15 to 30 times too little, and `bufferCapacity: 400000` was 100 t, five days of that burn.

### The truck check

A residential truck makes about **2,000 stops a five-day week**, some 400 a day ([Waste Today](https://www.wastetodaymagazine.com/article/smooth-rides)). A household of 2.5 people at 1.32 kg a resident a day sets out 23 kg a week, so 400 stops is about 9 t, one or two loads of a 20–32 cubic yard body. One truck on a weekly cycle serves 2,000 households, **5,000 residents**. Four trucks draw a fleet for 20,000 while `burnRate` serves about 200,000. The fleet stays at 4: a render budget, not a capacity, with `MAX_GARBAGE_TRUCKS` 16 citywide.

A recycling round carries about a fifth of the weight of a refuse round: recyclables are 21% of the weight and about 40% of the volume of a refuse set-out, so a 50/50 split body wastes capacity on one side and fills early on the other.

## The landfill

The landfill was short by more than 10,000×. A tile renders a pile up to 6 m over 20 × 20 m, 2,400 m³, and held 600 units, which is 150 kg: 0.06 kg/m³, lighter than air. A modern landfill compacts its waste to 1,200–1,500 lb a cubic yard: Sioux Falls calls 1,200–1,300 typical and reached 1,500, Chattanooga measured 1,460 ([Sioux Falls](https://www.waste360.com/landfill/sioux-falls-s-d-improves-airspace-utilization-for-regional-landfill), [Chattanooga](https://register.chattanooga.gov/sites/default/files/resources/Audit1508Landfill_Sustainability.pdf)).

The 0.3–0.5 t/m³ once taken here, and the 0.31 t/m³ first proposed in the plan, was waste as it is hauled, before the compactor. At the conservative 1,200 lb, **0.712 t/m³** (`LANDFILL_DENSITY_T_PER_M3`), a tile holds about 1,700 t, **6,835,200 units**, derived in code from `TILE_METERS`, `LANDFILL_MAX_PILE_METERS` and that density. A city of 100,000 then fills some 47 tiles a game year, and the pile's 6 m is one lift, where a real landfill closes 40–150 m tall. A save from before the rescale keeps its fill fraction: its stored units are scaled by the new capacity over the old 600.

## The recovery rates

Diversion comes from published recovery rates by material, weighted by published composition. Nothing is chosen.

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

The eight sum to **32.0%** against the published national recycling-and-composting headline of 32.1%. The four dry streams (paper, plastics, metals, glass) come to **20.9%**, but that is the nation's dry recovery across every programme at once: kerbside, drop-off, commercial and deposit. A sorting plant that diverted 21% of everything in its reach would count kerbside's share twice, so no building earns it. The 8.5 pp in food and yard is composting, a different building.

The draft gave a drop-off recycling centre 7% of the same four streams, from a participation claim no source supports; measured drop-off collection is about a sixth of kerbside's. Paper, food, yard trimmings and plastics are confirmed on EPA's 2018 overview ([EPA](https://www.epa.gov/facts-and-figures-about-materials-waste-and-recycling/national-overview-facts-and-figures-materials)). Glass is 25% there, not the 31.3% first written, which is the container rate. Metals, textiles and wood are still to confirm, though nothing built rests on them.

## Catchments

A collection round's published time budget is roughly four hours on route, two hauling and one at the disposal site across 4.3 round trips: 14 minutes one way, about 9 km. The map is 5.12 km across, so the published haul says every facility is within reach of every round; the existing 28-tile landfill and 40-tile incinerator radii are a game constraint, not a physical one. The three new reaches (32, 40 and 48 tiles by facility size) are calibrated against those two: an assumption, stated.

EPA's costing puts a transfer station's break-even at a **35-mile round trip**: past that, a 21 t trailer hauls more cheaply than the 7 t packers would drive themselves ([EPA costing tool](https://www.epa.gov/system/files/documents/2024-05/costingtool-introduction-20180620.pdf)). That is about 28 km one way, more than five times the width of the map, so a station forwards to any facility on the map at no distance penalty.

## What a recovered unit is worth

A recovered tonne of residential single-stream earned $123 in the Northeast in the second quarter of 2024 against $86–90 to sort it, and $75 in the third quarter of 2025 ([NERC via Waste Dive](https://www.wastedive.com/news/nerc-commodities-mrf-value-report/727375/), [NERC via Packaging Dive](https://www.packagingdive.com/news/nerc-mrf-commodity-value-decreases-2025/807522/)). Value and cost cross inside their own volatility, so the commodity cheque is not what recovery is for. What it is for is the **avoided landfill tipping fee, $57–62 a tonne** in 2023–24 ([EREF](https://erefdn.org/analyzing-municipal-solid-waste-landfill-tipping-fees/)): stable, and paid whether or not anyone wants the city's cardboard.

In ¢ the credit is derived from what burying the unit would have cost in the code's own figures. A landfill tile costs ¢40 to paint and ¢3/month indefinitely, and post-closure care is a published 30-year obligation, so a tile's whole-life cost is ¢40 + 360 × ¢3 = ¢1,120 across 6,835,200 units: **¢0.000164 a unit**, settled at **¢0.00016** (`RECYCLING_CREDIT_PER_UNIT`), or **¢0.66 a tonne recovered**.

A sorting plant at its full 50 t a day sorts 5.4 million units a month, recovers 87% of them, 4.7 million, and earns about ¢780 against ¢1,750 of upkeep. The credit covers under half the plant: recovery is a cost the city pays to bury less. A recovered tonne costs $86–90 to sort and more to collect, against the $57–62 tipping fee it saves.

## Building sizes

Derived by the civic-massing formula with one departure: a recovery building is a single clear-span hall, sized by **throughput and vehicle movement**; the occupant-load method only confirms the staff fit, which it does by an order of magnitude every time. The formula reads `height ÷ 3.2` as storeys, so gross floor area is a volume proxy here; single-level plan area is derived from throughput and vehicle movement, ÷ 185 m² a tile, rounded up to a rectangle, with height from the process's clear height.

| Building                    | Plan area     | Footprint | Height | Staff |
| --------------------------- | ------------- | --------- | ------ | ----- |
| Kerbside Recycling Depot    | 2,160 m²      | 2×3       | 8 m    | 5     |
| Transfer Station            | 1,500 m² hall | 4×5       | 11 m   | 4     |
| Materials Recovery Facility | 2,510 m² hall | 5×6       | 11 m   | 17    |

Affordability holds: ¢3,200 at Busy Township, whose milestone reward is ¢15,000, ¢7,500 at Small City, whose reward is ¢40,000, and ¢24,000 at Grand City, whose reward is ¢75,000. The sorting plant and the transfer station are sized from built plants of their throughput, not the formula.

The first-draft recycling centre, before the kerbside depot replaced it, was sized as follows.

| Plan area (m²)     | Recycling Centre | Transfer Station        |
| ------------------ | ---------------- | ----------------------- |
| Tipping / drop-off | 269              | 557                     |
| Process            | 168              | —                       |
| Aisle, load-out    | 105              | 943                     |
| Weighbridge, queue | 70               | 100                     |
| Site circulation   | 280              | 6,400                   |
| Office, welfare    | —                | in the scale house      |
| **Total ÷ 185**    | **892** → 4.8    | **8,000**, a real site  |
| Footprint, height  | **2×3**, **8 m** | **4×5**, **11 m**       |
| Formula GFA        | 6×185×2.5=2,775  | 20×185×3.44=12,719      |
| Occupant check     | 3 × 9.3 = 28     | 4 × 9.3 = 37            |

The drivers. **Recycling centre:** six 30 yd³ roll-offs at 2.4 m wide, each needing 6.7 m of container and 12 m of hook-lift pull clearance, a 7.3 m aisle and eight 2.7 × 5.5 m stalls; 2×3 rather than 5 tiles, because a 1×5 strip cannot hold a 26 m service depth, and 8 m is hook-lift tipping height plus door clearance.

**Transfer station**, sized from built sites: at 50 short tons a day, EPA's 4,000 sq ft plus 20 sq ft a ton a day for each day held gives a two-day floor of 6,000 sq ft, 557 m²; the rest of a 1,500 m² hall (Becker County's 16,000 sq ft at 55–60 t a day) is push wall, loader aisle and one sunken load-out bay for a 53 ft (16 m) open-top trailer behind its tractor, about 22 × 4.9 m. A 21 m weighbridge and a scale house take about 100 m², and the rest of the site is queue, trailer parking and turning. Real stations of this size stand on 2–2.4 acres (Isle of Wight's 150 t a day on 2, Mammoth Lakes on 2.42), so 4×5 tiles, 8,000 m²; the draft's 3×4 was smaller than any. 10 m eaves and an 11 m ridge clear the 25–30 ft (7.6–9.1 m) a tipping packer needs. In both the occupant check is under 4% of the plan area: throughput, not head count, drives the size.

**The Materials Recovery Facility** is sized from Kauai's 3-acre, 27,000 sq ft plan for 55 t a day: 5×6 tiles and a 2,510 m² hall, 11 m for 8 m clear over the tipping floor and a baler bay.

The depot is a fleet yard: four trucks at about 540 m² each, with a maintenance shed 8 m to the eaves for a side-loader's raised arm; four drivers and a mechanic.

## Pollution

Pollution is proportional to site vehicle movements, since none of the three burns: 10 for the depot, four trucks out and back each day (a dial on the draft's 5 for one container pull), 20 for the sorting plant, a dial for its own four trucks and the depots' loads in, the diesel loaders on its tipping floor and its balers, and **25 for the transfer station**. All three are dials: no published figure normalises a waste site's pollution per tonne. The transfer station ranks above the sorting plant because what it handles is mixed, putrescible rubbish, and below the incinerator's 120 and a landfill's nuisance, because it neither burns nor keeps anything and a modern station tips indoors, in an enclosed hall ([EPA](https://archive.epa.gov/epawaste/nonhaz/municipal/web/html/transfer.html)). The painted landfill carries no pollution figure of its own yet.

## The kerbside recycling depot

The draft's first rung was a staffed drop-off yard diverting 7%, on a claim that drop-off programmes reach 20–30% of households against kerbside's 70–90%. No source supports it, and what programmes measure does not: North Carolina's drop-off sites collected 44 lb a household in FY2024-25 against 264 for its kerbside programmes ([NC DEQ](https://www.deq.nc.gov/environmental-assistance-and-customer-service/reports-and-studies/state-state-recycling-report-fy-2024-25/open)). A drop-off yard would divert about 2%, so the player chose the kerbside programme.

- **What a served home sets out.** 264 lb a household a year, North Carolina's newest measured kerbside figure, near the 245 lb implied by the national 32% capture of single-family recyclables in 2020 ([Recycling Partnership via Waste360](https://www.waste360.com/recycling/highlights-recycling-partnerships-2020-curbside-report)) and below the 357 lb of the 2016 national survey ([State of Curbside via Waste Dive](https://www.wastedive.com/news/state-of-curbside-report-single-stream-carts-lead-to-highest-performing-r/432266/)). At the national household of 2.5 that is **0.131 kg a resident a day** (`RECYCLING_KG_PER_RESIDENT_DAY`), about 10% of a resident's 1.32 kg.
- **Which homes.** A city's kerbside service covers single-family homes up to three or four units; apartment blocks and businesses hire private haulers ([Chandler](https://chandleraz.gov/residents/recycling-and-trash/commercial-trash-service), [Cincinnati](https://cincinnati-oh.gov/recycling/curbside/eligibility)). So the depot serves buildings of **four homes or fewer** (`KERBSIDE_MAX_HOMES`).
- **How many homes.** A one-person automated side-loader serves about 950 homes a day ([MTAS](https://www.mtas.tennessee.edu/reference/cost-and-productivity-estimates)), and recycling is collected every other week, so one truck covers about **9,500 homes** (`RECYCLING_HOMES_PER_TRUCK`), derived since no recycling-specific figure was found. A fleet yard takes about 540 m² a truck all in ([Calgary](https://www.calgary.ca/planning/projects/east-calgary-truck-maintenance-storages-facility.html), 60 trucks on 8 acres), so a 2×3 yard holds four trucks and the depot serves **38,000 homes**, first come by building, within its 32-tile road reach.
- **What it earns.** 87% of what is set out is recovered and 13% is sorting residue. The commodity margin swings too far to bank on, so the credit is the disposal it avoids, ¢0.00016 a unit. A city of 40,000 in houses diverts about 630,000 units a month, recovers 550,000 of them and earns about ¢90. Kerbside recycling costs a real city about $45 a household a year beyond its refuse round ([National Academies](https://www.nationalacademies.org/read/27978/chapter/6)), so the programme is a cost the city pays to bury less.
- **Power and water.** About 4 kW and 0.2 kL: a 600 m² shed at the warehouse class's 5.5 kWh a square foot a year, derived from the national building survey's own totals, and an office's water for its staff.

## The Materials Recovery Facility

The draft's third rung collected everything in its reach and diverted 21% of it. That 21% is the nation's dry recovery across every programme, kerbside included, so a plant earning it on top of the depots would count the houses' recycling twice.

- **How much it sorts.** **50 short tons a day**, 45.36 t (`MRF_SHORT_TONS_PER_DAY`, `TONNES_PER_SHORT_TON`): the size of a small municipal single-stream plant. Kauai's evaluation sizes its start-up plant at 55 t a day on 3 acres with 27,000 sq ft enclosed ([Kauai MRF evaluation, HDR](https://www.kauai.gov/files/assets/public/v/1/public-works/solid-waste/recycling/documents/cofk-materials-recovery-facility-evaluation.pdf)), and Isabella County's runs a 7 t an hour line one shift, about 50 t a day, with 17 staff ([Isabella County MRF evaluation, RRS 2023](https://www.isabellacounty.org/wp-content/uploads/2023/02/MRF-Evaluation-Full-Report-FINAL.pdf)). That is 181,440 units a day, **9,072 a garbage pass** (`MRF_SORT_UNITS_PER_PASS`).
- **Its round.** Within its 48-tile road reach, an apartment block of more than four homes at **0.30 kg a home a day** (`MRF_KG_PER_HOME_DAY`), and every job at **0.30 kg a day in commerce** (`MRF_KG_PER_COMMERCIAL_JOB_DAY`) and **0.25 kg in industry** (`MRF_KG_PER_INDUSTRIAL_JOB_DAY`). The home figure is Hennepin County's measured 0.63 lb a unit a day ([Hennepin County multifamily study 2017](https://www.hennepincounty.gov/-/media/hennepinus/your-government/projects-initiatives/solid-waste-planning/multifamily-waste-study-2017.pdf)), under California's 0.13 t a unit a year. The job figures come from California's per-employee curbside-recycling rates ([CalRecycle 2014 Business Group Rates](https://www2.calrecycle.ca.gov/WasteCharacterization/BusinessGroupRates)): 0.08–0.30 t a year across shops, restaurants, hotels and offices (0.22–0.82 kg a day) and 0.05–0.16 t across manufacturing and wholesale (0.14–0.44 kg), taken at a typical business of each.
- **What it recovers.** A plant sells **87%** (`MRF_YIELD_PERCENT`) and rejects 13% as residue ([Recycling Partnership 2024, via National Academies](https://www.nationalacademies.org/read/27978/chapter/4)).
- **Its residue store.** One week of residue at full throughput, 165,110 units, about 41 t (`MRF_RESIDUE_STORE_UNITS`).
- **The building.** **5×6 tiles**, 12,000 m², Kauai's 3-acre site; a clear-span hall of **2,510 m²** (27,000 sq ft) **11 m** tall over its tipping floor and balers, with bay doors on the street side, a bale yard of stacked cubes, a small office and its trucks parked in the yard. **17 staff.**
- **Its power.** **20 kWh a tonne** sorted, building included: Pressley and others measured 23.8 kWh a tonne at a single-stream plant, and Bradshaw and others' 2024 survey puts large plants near 10 ([Bradshaw et al. 2024](https://www.osti.gov/servlets/purl/3015366)). 45.36 t a day is 907 kWh, a daily average of **0.0378 MW**, the incinerator's convention of its day's use over 24 hours. Its water is its staff's, 13 gallons a worker a day, 0.8 kL.
- **Its trucks.** **Four**, in the recycling livery: a recycling body carries about 4 t a load at 180–200 kg a cubic metre in a 27 cubic yard body, so 50 t a day is about 12 loads, three a truck.
- **Dials.** The 48-tile reach, ¢24,000 to build and ¢1,750 a month, pollution 20 and the unlock at Grand City.

## The transfer station

The draft's transfer station served 20,000 on a 3×4 lot 9 m tall, from a participation figure and a plan-area sum. Its throughput holds up; its lot did not.

- **How much it handles.** **50 short tons a day**, 45.36 t (`TRANSFER_SHORT_TONS_PER_DAY`): a station in EPA's small class, under 100 t a day ([EPA transfer station design training](https://www.epa.gov/system/files/documents/2024-05/tribal-waste-mgmt-transfer-station-design-training-slide-deck1-4.pdf)). It is the draft's 20,000 people: 20,000 at 2.2 kg is about 44 t, and a typical rural station takes under 60 t a day for about 20,000 people ([Waste360](https://www.waste360.com/waste-collection-transfer/rural-transfer-stations-built-for-the-long-haul)). That is 181,440 units a day, **9,072 a garbage pass** (`TRANSFER_UNITS_PER_PASS`).
- **Its tipping floor.** EPA sizes a floor at 4,000 sq ft plus 20 sq ft for each ton a day to hold one day's waste ([Waste Advantage](https://wasteadvantagemag.com/determining-transfer-station-size-and-capacity/)), and states cap how long waste may stay: Kansas wants the floor cleared and the loaded trailers gone within 48 hours ([K.A.R. 28-29-23a](https://www.law.cornell.edu/regulations/kansas/K-A-R-28-29-23a)), and Oregon's Metro region allows 48 hours for dry waste. The floor holds at most **two days' throughput** (`TRANSFER_FLOOR_DAYS`), 362,880 units (`TRANSFER_FLOOR_UNITS`), about 91 t.
- **The building.** **4×5 tiles**, 8,000 m², 2 acres: Isle of Wight County's 150 t a day station stands on 2 acres ([Isle of Wight](https://www.spsava.gov/187/Isle-of-Wight)) and Mammoth Lakes' on 2.42 ([CEQA](https://ceqanet.lci.ca.gov/2021050146)); the draft's 3×4, 4,800 m², is smaller than every real site found. A tipping hall of **1,500 m²**: Becker County's 16,000 sq ft station holds three days at 55–60 t a day ([CRA](https://www.cra-recycle.org/?p=5555)). It is **10 m** to the eaves under a low-pitched roof, **11 m** at the ridge, because a tipping packer needs 25–30 ft (7.6–9.1 m) clear ([Waste Advantage](https://wasteadvantagemag.com/building-reuse-weighing-the-consequences/)). Tall roll-up doors face the street; a sunken load-out bay lets a loader push the floor down into a 53 ft (16 m) open-top transfer trailer, with a second trailer waiting; a scale house and its weighbridge stand at the entry. **4 staff**: the scale, the loader, a spotter and a lead (North Platte, Nebraska ran 85 t a day with 6).
- **Its power.** **5 kWh a tonne**: two small Irish stations measured 2.5–6.1 ([EPA Ireland](https://epawebapp.epa.ie/licences/lic_eDMS/090151b2802fc4c9.pdf)), taken near the top for an enclosed, ventilated hall. 45.36 t a day is 227 kWh, a daily average of **0.00945 MW**. Its water is its staff's, 13 gallons a worker a day, 0.2 kL.
- **Dials.** The 40-tile reach, ¢7,500 to build and ¢540 a month, pollution 25 and the unlock at Small City. Against the sorting plant both money figures sit at 0.31, near the real ratios: Becker County's $2.9 million station against Kauai's $10.9 million plant is 0.27, and a station's $15–25 a tonne to run, $15–20 at 100 tons a day ([Waste360](https://waste360.com/archive/the-transfer-tune-up)), $25.34 in Portland Metro's 2017 audit ([Oregon Metro](https://www.oregonmetro.gov/sites/default/files/2019/03/12/private-transfer-station-rate-transparency-report-03122019.pdf)), against a plant's $86–90 to sort is 0.2–0.3.

## The kit geometry

- **Materials Recovery Facility** (`src/render/utilitykits.ts`): a yard slab over the lot, the hall (54 × 46.5 m, 11 m) with three tipping-floor bay doors on the street side, a bale yard of stacked 1.1 × 0.75 × 1.5 m bales, an office and four parked recycling trucks, all inside the 100 × 120 m lot. The kit paves its lot (`pavesLot`): it stands on the highest ground under the lot and its yard carries an 8 m footing, so on a slope the instancer's plinth stays under the yard and the low side shows a graded pad, not a gap.
- **Transfer station**: a yard slab over the 80 × 100 m lot, a 30 × 50 m tipping hall 10 m to the eaves under a low-pitched roof whose ridge is the catalog's 11 m, three roll-up doors 7.5 m tall on the street side, a sunken load-out bay along the hall's side with one tractor and 16 m open-top trailer in it and one waiting in the yard, two parked refuse packers on the apron, and a scale house beside a 21.3 × 3.4 m weighbridge at the entry.

## Visual checks the epic required

In a browser, at the default camera pitch: the three facilities in a row with a 4.0 m car and a 9 m refuse vehicle on each apron (every bay door taller than the vehicle using it, the [scale anchors](../art/README.md) holding); the kerbside depot at street level reading as a fleet yard; the recovery facility beside the incinerator reading lower and longer than a 4×4 / 20 m burner; a refuse round and a recycling round on one street in two distinguishable liveries; a landfill beside a city with a recovery facility, a game year apart, the pile visibly lower.
