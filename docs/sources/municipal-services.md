# Municipal services — sources and derivations

The research behind [the municipal services spec](../specs/municipal-services.md).

## Method

Every figure in the programme is derived from a published municipal standard and the 20 m tile, never picked to feel right. A per-capita figure and a tile count give a capacity; a response time and a speed give a radius.

- A **range** comes from a response-time standard and a speed. A fire service standard of four minutes' travel, against the posted speed of the roads between, is a distance; that distance over 20 m tiles is a tile count.
- A **capacity** comes from a per-capita provision figure. Beds per thousand residents, school places per thousand dwellings, litres per person per day: each gives people-per-facility once the facility's own size is fixed.
- The sources are the public-sector equivalents of the road guides used for the road model: fire and ambulance response-time standards, school place planning per dwelling, hospital beds per thousand, litres per person per day for water, kilograms per person per day for waste. Where a standard gives a range, the plan says which end was taken and why.
- **Building sizes are derived too.** A facility's ground size follows from how many people are inside it and the floor area per person that generic building code requires, converted to tiles by [civic massing](../art/civic-massing/README.md). A fire station is the size of its appliance bays; a school is the size of its classrooms.
- The override, once: if a derived figure makes the small facility unaffordable at the milestone that unlocks it, the plan says so and states what it took instead. A standard that produces an unbuyable first school is the wrong standard for a 20 m-tile toy city.

Settled values live in [balancing](../game-design/balancing/README.md).

## What the facilities draw

Every ploppable's `powerUse` and `waterUse` is a surveyed figure, the way the zoned catalog's and the generators' are. The method is the massing rule run backwards: a building's floor is its footprint times 185 m² a tile times its storeys at 3.2 m, and that floor draws the electricity the national building survey measures for its activity ([CBECS 2018, table C14](https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c14.pdf)) and the water the federal benchmarking programme measures for it ([EPA WaterSense at Work, benchmarking](https://www.epa.gov/system/files/documents/2024-03/ws-commercial-bmp-watersenseatwork_section2.3_benchmarking.pdf)), averaged over the year. Before this a police station drew 0.6 MW, the power of 430 houses, and the airport 8 MW, the power of a town of six thousand.

| Building              | Floor      | Electricity                                  | Draw   | Water                                                      | Draw   |
| --------------------- | ---------- | -------------------------------------------- | ------ | ---------------------------------------------------------- | ------ |
| Police station (2×2)  | 15,285 sf  | public order and safety, 13.9 kWh/sf         | 24 kW  | office, 14.5 gal/sf a year                                 | 2.3 kL |
| Police district (3×3) | 38,000 sf  | public order and safety, 13.9 kWh/sf         | 60 kW  | office, 14.5 gal/sf a year                                 | 5.7 kL |
| Fire station (2×2)    | 5,382 sf   | public order and safety, 13.9 kWh/sf         | 8.5 kW | fire station, 28.9 gal/sf a year                           | 1.6 kL |
| Fire district (3×2)   | 15,733 sf  | public order and safety, 13.9 kWh/sf         | 25 kW  | fire station, 28.9 gal/sf a year                           | 4.7 kL |
| Clinic (1×2)          | 7,965 sf   | health care, outpatient, 17.4 kWh/sf         | 16 kW  | medical office, 23.4 gal/sf a year                         | 1.9 kL |
| Hospital (3×5)        | 180,000 sf | health care, inpatient, 28.8 kWh/sf          | 592 kW | hospital, 55.71 gal/sf a year                              | 104 kL |
| School (3×3)          | 56,000 sf  | education, 9.4 kWh/sf                        | 60 kW  | K-12 school, 10.8 gal/sf a year                            | 6.3 kL |
| Rail station (2×3)    | 33,600 sf  | transport terminal, 8.4 kWh/sf               | 32 kW  | office, 14.5 gal/sf a year                                 | 5 kL   |
| Airport (8×6)         | 418,000 sf | transport terminal, 8.4 kWh/sf               | 400 kW | 4 million passengers a year at 4.2 gal each                | 175 kL |
| Incinerator (4×4)     | —          | a 250 ton-a-day combustor's own 63 kWh a ton | 660 kW | kept at 2 kL: no figure found                              | 2 kL   |
| Coal plant (4×4)      | —          | —                                            | —      | fifty staff at 13 gal a day; cooling water is its own, raw | 2.5 kL |

The incinerator row is the first derivation; the waste chain later re-derived its throughput and draw (see [the garbage sources](garbage-recovery.md#the-incinerator-re-derived)).

The four stations are stated floors too, since their lots are set by bays, apron and car park rather than by the floor: the first rungs' 1,420 m² and about 500 m² from [the capacity sources](service-capacity.md#do-the-existing-buildings-match), the district rungs' exemplar floors. The hospital's floor is stated as well: 72 beds at 2,500 sf a bed, since six of its fifteen tiles are a parking deck. Its water is the general medical and surgical hospital median in ENERGY STAR Portfolio Manager's water use intensity table ([US water use intensity by property type](https://www.energystar.gov/buildings/benchmark/understand-metrics/what-water-use-intensity-wui)), the table the office, medical office and fire station medians also come from: 382 gallons a bed a day at 2,500 sf a bed.

The transport terminal's electricity is ENERGY STAR's 56.2 kBtu/sf site median for a terminal or station ([US national median table](https://portfoliomanager.energystar.gov/pdf/reference/US%20National%20Median%20Table.pdf)) at public assembly's 51% electric share. The airport's passengers come from its terminal: one regional terminal is sized at 125,000 sf for 600,000 enplanements ([Minot, in the FAA's NPIAS](https://www.faa.gov/sites/faa.gov/files/NPIAS-2023-2027-Appendix-C.pdf)), so a 418,000 sf terminal boards two million and sees four million, each drinking what a large hub's do, 4.2 gallons ([an airport water tally](https://www.chicagofaucets.com/airports-water-management-statistics-usa)).

The incinerator is the largest small municipal waste combustor the Clean Air Act defines, 250 tons a day ([40 CFR 60 subpart AAAA](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAAA)), using the share of its own generation a waste-to-energy fleet consumes, 17% of about 370 kWh a ton ([a national fleet study](https://www.nature.com/articles/s41467-026-69897-w)); its water stays a dial because no figure was found. Staff water is the office median of 13 gallons a worker a day ([ENERGY STAR DataTrends](https://www.energystar.gov/sites/default/files/buildings/tools/DataTrends_Water_20121002.pdf)). The pocket park's 0.2 kL and the bus stop's nothing are unchanged and unsourced; a lit shelter draws single watts. Each row is re-derived by the catalog contract test, so a figure cannot drift from its method.

## Funding and load, measured

Measured on a running city, health at ×0.10 reads 3% load and the same service at ×1.00 reads 8%; ×1.50 reads 5% again.

## The epic order

| #   | Epic                        | Why here                                                     |
| --- | --------------------------- | ------------------------------------------------------------ |
| 0   | **Service capacity**        | Shared foundation; nothing else starts until it lands        |
| 1   | **Water & sewage**          | Closes the biggest open loop; pure system, no new UI idioms  |
| 2   | **Healthcare & death care** | Closes the birth/death loop; needs capacity most             |
| 3   | **Education ladder**        | Extends existing growth gating; lowest risk                  |
| 4   | **Emergency services**      | Police and fire ladders; touches the dispatcher              |
| 5   | **Garbage recovery**        | Closes the waste loop; existing garbage system extends       |
| 6   | **Power generation**        | Smallest: a tier and a ceiling; can slot anywhere after 0    |
| 7   | **Transport depots**        | Vehicles get an origin; interacts with traffic most          |
| 8   | **Parks and recreation**    | Last because it is the one service the city survives without |

The foundation is built alone and first, because every epic consumes it and it is the only change to an existing contract. After that the order is by how much each closes a loop, not by size.

## What the programme replaced, by service

| Service            | Before                | After                                                                                          |
| ------------------ | --------------------- | ---------------------------------------------------------------------------------------------- |
| **Power**          | Two generators        | A solar farm, a gas turbine, a combined-cycle station and a reactor, each a real small unit    |
| **Water & sewage** | Water only            | Pipes, a shore intake and an outfall; treatment and a river you can spoil follow               |
| **Healthcare**     | One clinic            | Clinic, hospital, plus care for the old and the dead                                           |
| **Education**      | Elementary            | Elementary, middle, high, college, each its own field, plus a library, each drawn as a campus  |
| **Emergency**      | One police, one fire  | A station ladder for each, sized on response time                                              |
| **Garbage**        | Landfill, incinerator | Recovery, so burying is the worst option rather than the only one                              |
| **Transport**      | Stops                 | Depots: the fleet, the headway and the running cost; dead runs; the kits                       |
| **Parks**          | A pocket park         | A recreation ladder, and leisure the city can be short of                                      |
