# Healthcare and death care: sources and derivations

The research behind [the healthcare-and-death-care spec](../specs/healthcare-and-death-care.md): every capacity, rate, size and price, with the published figure each is built from. Every figure is derived from a published standard and the game's own scale, 20 m tiles, a 3.2 m storey, 6,000 ticks per game month, never picked to feel right. Settled values are in [balancing.md](../game-design/balancing/README.md); sizes follow [civic massing](../art/civic-massing/README.md) against the anchors in [the art README](../art/README.md).

## The death rate, and what a tick is

A game month is `TICKS_PER_DAY × DAYS_PER_MONTH` = 200 × 30 = **6,000 ticks**, so a game year is **72,000 ticks**. The United States' crude death rate was **9.03 per 1,000** in 2024, 3,072,666 deaths ([CDC/NCHS, FastStats](https://www.cdc.gov/nchs/FASTATS/deaths.htm)).

**Take 9 per 1,000 per year**, that rate rounded down, because the population has no age structure and so cannot carry the elderly skew that pushes an older town toward 11.

```
9 / 1,000 / 72,000 ticks = 1.25 × 10⁻⁷ deaths per resident per tick
```

| City                | Deaths/year | One death every              | 780 plots last  |
| ------------------- | ----------- | ---------------------------- | --------------- |
| 400 (Small Town)    | 3.6         | 20,000 ticks (100 game days) | not applicable  |
| 8,000 (Small City)  | 72          | 1,000 ticks (5 game days)    | 10.8 game years |
| 20,000 (Grand City) | 180         | 400 ticks (2 game days)      | 4.3 game years  |
| 50,000 (Metropolis) | 450         | 160 ticks                    | 1.7 game years  |

## The regional funeral fee

Crow Wing County, Minnesota, paid **$2,900** for an indigent immediate cremation and **$3,900** for an immediate burial in 2026 ([Brainerd Dispatch, 3 Feb 2026](https://www.brainerddispatch.com/news/local/crow-wing-county-board-county-tweaks-indigent-burial-policy)).

Cremation was 62.8% of US dispositions in 2025 ([CANA 2026 report, via Kates-Boylston](https://www.kates-boylston.com/industry_news/cana-releases-2026-annual-cremation-statistics-report/article_ccaf21d4-a825-4050-8148-cfc549653411.html)). So the weighted cost of a body is 0.628 × $2,900 + 0.372 × $3,900 = **$3,272**.

On the game's operating scale (¢800 a month stands for $8.65 million a year, [balancing.md](../game-design/balancing/power.md)), $901 to the ¢, that is **¢3.6**. Laramie County, Wyoming's flat $1,500 rotation rate in 2026 is the low cross-check, ¢1.7.

A city of 3,500 loses 31 residents a year and pays about ¢9 a month for them, less than one cemetery's ¢140 upkeep. The regional service is the cheap way to be a village, and the cemetery is what a town builds because it must.

## Re-let of vacancies

Each vacancy is let again in **41 game days** on average: RentCafe's 2025 national average of 41 days to rent a vacant apartment across 137 markets ([Multifamily Executive](https://www.multifamilyexecutive.com/apartment-trends/rentcafe-miami-hottest-rental-market-2025)). The National Association of Realtors' 2025 Profile of Home Buyers and Sellers, a median of four weeks on the market, agrees within a fortnight.

A city holding steady carries about one empty place in a thousand. One that stops attracting residents loses them at the death rate, 9 in 1,000 a year, until demand returns.

## Capacities

### Clinic, 8,000 people

Four full-time physicians, a stated dial, at a panel of about **2,000** each. Altschuler and colleagues derive the panel a primary-care physician can carry with the care delegated to the team as **1,947**, and observe a US average of about **2,300**, which describes practices already overloaded ([Annals of Family Medicine, 2012](https://www.annfammed.org/content/10/5/396)). 2,000 sits between the workable panel and the observed one: 4 × 2,000 = **8,000**.

### Hospital, 30,000 people

**72 staffed beds**, a small community hospital: 57% of US community hospitals have fewer than 100 ([AHA Hospital Statistics, 2023](https://kha-net.org/DataProductsandServices/STAT/HospitalCharacteristics/CommunityHospitalsbyBedSize/)).

The United States has **2.28 staffed community-hospital beds per 1,000 residents** ([KFF, 2024](https://www.kff.org/other/state-indicator/beds-by-ownership/)), so 72 beds serve 72 ÷ 2.28 × 1,000 = **31,600** people.

Cross-check by admissions: America's community hospitals ran 775,297 staffed beds and admitted 33.55 million patients in 2024, **43.3 admissions a bed a year** ([AHA Fast Facts](https://www.aha.org/statistics/fast-facts-us-hospitals)), and the country is admitted at **99 per 1,000** residents a year (KFF). 72 × 43.3 ÷ 99 × 1,000 = **31,500**.

Both routes land within 0.3% of each other. Take **30,000**, about 5% conservative, so the hospital sits between the Grand City and Metropolis milestones and a Metropolis needs two.

### Cemetery, 780 plots

A modern grave plot is 2.44 m × 1.22 m = 2.98 m². The source is ASPO's _Cemeteries in the City Plan_ (Planning Advisory Service Report 16, 1950, [planning.org](https://www.planning.org/pas/reports/report16.htm)), which says that "the burials per acre devoted to single-graves will probably be around 1,000".

Its overall figure, 620 burials per gross acre, describes family-lot cemeteries (Hare and Hare's 62 lots of 20 × 20 ft, ten burials each, to the gross acre). A modern lawn cemetery is laid in single graves, so take **about 1,000 graves an acre**, 2,471 a hectare, **4.05 m² of cemetery land per grave**, roads and paths inside it.

Cross-checks, each a single source: Cabarrus County, North Carolina's appraisal guidance puts a cemetery at 900–1,100 graves per usable acre, default 1,000; Forest Lawn Memorial Park in Ohio has about 44,000 graves on 47 developed acres, about 940.

The same report's land-use split for a typical cemetery (roads 10–15%, paths 10–12%, saleable lots 70–77%) agrees with the plot: 2.98 m² ÷ 73% saleable is 4.08 m². The report's own single grave is a smaller 20–25 sq ft, 2.5–3 × 8 ft, so its 1,000 is not the ceiling of the arithmetic, only the density it reports.

A cemetery is ground, so it uses the whole 400 m² tile rather than a building's 185 m² plate: 400 ÷ 4.05 = 98 graves per tile. Over a 3×3 site with one tile given to the gatehouse, 8 × 98 = 784 → **780 plots**.

This is deliberately smaller than the planning standard. ASPO's "one acre per 1,000 population" would last 111 game years at the game's death rate, past even the 30–40 the ICCM asks authorities to secure. A cemetery must fill inside a session or it is not a system.

### Crematorium, 2,080 cremations a year

Two retorts, four cremations a day each, 260 working days: `2,080 / 72,000` = **0.0289 per tick**, 173 per game month, derived from the calendar constants.

A Pyrox X1000 retort is rated four to five cremations a day and over 1,000 a year on an eight-hour, five-day schedule (vendor figures), a 70–100 minute cycle. The lower end of the rating, four, is taken.

The throughput is **credit**: it accrues at that rate each tick and is capped at one working day's cremations, 8, so an idle crematorium banks nothing past a day. It has room for as many bodies as its whole credit, and each cremation spends one.

The US average is 1,917,413 cremations in 2024 over 3,721 crematories, about 515 each (CANA via cremation.org.uk): that is demand, not capacity. A Metropolis produces 450 deaths a year, so **one crematorium covers the largest city in the game four times over**. Throughput never binds at the game's scale; the decision is siting and money. The figure is the rate a backlog drains at: 300 uncollected bodies clear in 1.7 months, about 10,400 ticks.

## Ranges

A hospital catchment in the world is a 20–30 minute drive, 8–15 km, which is 400–750 of the game's tiles; the whole map is 256 tiles, 5.12 km across. **The standard does not survive contact with a 20 m tile**, so the hospital's range comes from the game's own service band instead: police and fire at 48, school at 56. It is **72 tiles**, the widest reach of anything but the airport.

That is 1,440 m, a 2.5-minute drive at an urban ambulance's 35 km/h, generous against every published response target rather than mean. The clinic keeps its **40** (800 m, 82 seconds).

A cemetery's **collection range is 40 tiles**, the health ladder's clinic band: no published standard gives a cemetery's reach.

## The price ladder, in dollars

Death care's capital prices sit on one scale, set by the cemetery's own. Homer, Alaska, Memo 15-205 (December 2015), put **$628,500** to develop 700 plots, land excluded, **$898 a plot** ([memo](https://www.cityofhomer-ak.gov/memorandum/memorandum-15-205-hickerson-memorial-cemetery-expansion)). The cemetery's ¢3,500 for 780 plots therefore stands for 780 × $898 = $700,440, about **$200 to the ¢**.

The crematorium's **¢3,800** is a New York Department of State cemetery-board filing, Forest Hill Cemetery (Oneida), April 2021: a crematory at most **$757,712** ([filing](https://dos.ny.gov/system/files/documents/2021/05/33-063-forest-hill-cemetery-crematory-4-23-21.pdf), figure from the filing summary). $757,712 ÷ $200 = ¢3,789, to ¢3,800.

Cross-check: Mount Calvary (Erie) in 2023 replaced three retorts with construction for **$804,616**, about $268,000 a retort ([packet](https://dos.ny.gov/system/files/documents/2023/09/15-066-mount-calvary-retort-packet-82523.pdf)). Two retorts with their building come to about $536,000–844,000.

A crematorium now costs about one cemetery to build, against the seven the first plan had; the trade is land and running cost. Its **¢600** upkeep is the first plan's figure. No US crematory operating cost was found, so it is a dial.

The cemetery's **¢3,500 and ¢140 a month** are priced on the civic ladder beside the recycling depot (¢3,200), the clinic (¢5,000) and the transfer station (¢7,500), not on the generators' dollar scale.

### Exhumation, ¢14 a grave

The median of four municipal fee schedules for an adult disinterment plus reinterment: Salt Lake City FY2026-27, $3,500 ([slc.gov](https://www.slc.gov/cemetery/city-cemetery-fees/)); Richmond VA 2021, $1,200 + $800 ([rva.gov](https://www.rva.gov/sites/default/files/2021-06/Cemetery%20Fees%202021.pdf)); Lorain OH, $3,000 + $1,200 ([cityoflorain.org](https://cityoflorain.org/200/Pricing)); Douglas GA, $1,300 + $900 ([cityofdouglas.org](https://cityofdouglas.org/178/Cemetery-Fees)).

The median of {2,000, 2,200, 3,500, 4,200} is **$2,850**, ÷ $200 = ¢14.25, to **¢14**. Whole-cemetery relocations at about $4,300–5,000 a grave (Hunter Army Airfield; Bibb County, Georgia) are the cross-check that this is not high. A full cemetery of 780 costs ¢10,920 to clear, ¢9,170 net of the refund.

## Sizes

The massing formula is gross floor = `w × d × 185 × (height ÷ 3.2)`, so tiles = gross ÷ 185 ÷ storeys, rounded up to a whole rectangle. Open ground inside a footprint is 215 m² per tile (400 − 185); a 90° stall all-in is 24.7 m².

| Building    | Occupant load    | Gross needed | Storeys → tiles | Result     | Floor     | Site vs ground |
| ----------- | ---------------- | ------------ | --------------- | ---------- | --------- | -------------- |
| Clinic      | 4 providers      | 372–557 m²   | 2 → 1.01–1.51   | 1×2, 6.4 m | 740 m²    | 148 ≤ 430 m²   |
| Hospital    | 72 beds          | 16,700 m²    | 6, stated floor | 3×5, 27 m  | 16,700 m² | deck, 144      |
| Crematorium | parts, see below | 626 m²       | 1 → 3.38        | 2×2, 6.4 m | 1,480 m²  | 693 ≤ 860 m²   |
| Cemetery    | gatehouse only   | 128 m²       | 1 → 0.69        | 3×3, 3.2 m | ground    | 780 plots      |

### The clinic

The clinic is 1×2 tiles, two storeys, 6.4 m: 2 × 185 × 2 = 740 m² (7,965 sf) gross. A medical practice plans on **1,000–1,500 sf per provider** ([MGMA](https://www.mgma.com/articles/size-matters-in-medical-practice-space-selection)), so four full-time physicians need 372–557 m² net; the rest is circulation, reception and plant.

The clinic it replaces was 2×2 × 14 m, 3,237 m² of floor, four to nine times what a four-doctor practice uses. A building that size could never have been oversubscribed at any city size the game reaches.

### The hospital

The hospital is a 3×5 lot: a 3×3 building and a 3×2 parking deck beside it, both fronting the street along the lot's 5-tile side. The building is 72 beds at **2,500 sf a bed**, the US planning figure for a hospital of 50 beds or more ([Definitive Healthcare](https://www.definitivehc.com/index%2ephp/resources/healthcare-insights/average-us-hospital-square-footage) puts it at about 2,400–2,600 from Medicare cost reports): 180,000 sf, **16,700 m²**.

That is a plate of about 2,800 m² (drawn 58 × 48 m, 2,784 m²) over **six storeys at 4.5 m** floor to floor, the low end of the 14 ft 8 in–16 ft (4.5–4.9 m) inpatient floors run in project examples ([City of Naples planning record](https://www.naplesgov.com/media/98066); a single source). It stands **27 m**.

It is the one civic building whose floor is stated rather than read off the massing formula: 15 tiles at 27 m would claim 23,400 m², and the deck is ground, not floor. The catalog contract test re-derives the hospital's draw from the stated floor.

### Hospital parking, to code

The common US zoning minimum for a hospital is **2 spaces a bed** (St Charles MO, Wadsworth OH, Stacy MN, Canby OR, Marshfield MA; for example [Wadsworth's chapter 25](https://www.zoneomics.com/code/wadsworth-OH/chapter_25)), so 72 beds need **144**.

They go in a two-level deck, ground and roof, on the 3×2 tiles, 3.35 m (11 ft) floor to floor, which clears the 2.49 m (98 in) a van's route needs. It is laid in the 60 ft module of 90° parking: four rows of 9 × 18 ft stalls (2.74 × 5.49 m) on two **24 ft** (7.32 m) two-way aisles running to the street, the width the codes ask (for example [Forest Lake MN](https://codelibrary.amlegal.com/codes/forestlake/latest/forestlake_mn/0-0-0-40825)).

A 12 ft (3.66 m) ramp lane and its 0.25 m parapet run along the far side. Two modules and the ramp lane are 40.48 m across, so the deck reaches half a metre past its two tiles toward the block: 2,429 m² a level.

Along the street each row holds 19 stalls, leaving a 7.58 m cross-aisle at the back. Two stair-and-lift cores at the street corners take two stalls each, so a level holds **72** and the deck **144**: 33.7 m² (363 sf) a space all-in, about 4% over the top of the 300–350 sf a structured space takes ([Parking Professional, 2013](https://www.parking.org/wp-content/uploads/2016/01/TPP-2013-10-How-Much-does-a-Structure-Cost.pdf)), because a deck this small carries its ramp and cores over fewer spaces.

The accessible spaces stand on the surface between the main entrance and the deck, nearer the entrance than any deck space, as the ADA allows: 149 spaces in all take **5 accessible spaces, 1 of them van-accessible** (one in six), under [ADA 2010 §208.2](https://www.access-board.gov/ada/guides/chapter-5-parking/) for 101–150 spaces provided. A car space is 2.44 m wide with a 1.52 m aisle, a van space 3.35 m with the same aisle.

The 10% that §208.2.1 asks of parking serving outpatient facilities is not applied: this is an inpatient hospital, and the clinic carries the outpatients. An ambulance canopy beside the main entrance, on the building's street side, covers the emergency drop-off. Every count is derived in `src/render/utilitykits.ts` from these dimensions and checked by its tests.

### The cemetery's draw

The draw is the gatehouse's alone, one 128 m² floor (1,378 sf: 128 × 10.7639) at the office intensity of 13.6 kWh/sf a year (CBECS 2018, table C14) and 14.48 gal/sf a year (EPA WaterSense at Work), the method [municipal-services.md](../specs/municipal-services.md) runs for every civic building.

18,738 kWh over 8,760 hours is 2.14 kW, **0.0021 MW**; 19,950 gallons over 365 days is 54.7 a day, **0.2 kL**. The grounds draw nothing: no irrigation figure is modelled for any open ground.

A body's penalty, **32 points a month**, is a dial with no published figure behind it, set so that one body left four months all but cancels a clinic's 140. It never feeds the death rate.

### The crematorium

The parts: a 215 m² chapel (100 × 1.4 m² net ÷ 0.65), a 111 m² office, a 60 m² foyer, and **240 m² of cremator hall, plant and body store**, assumed at 6 × 10 m per unit plus 120 m² of plant. That one number has no published source. The 626 m² total sits inside the observed 500–800 m² band (Chingford, 568 m² GIA).

The 6.4 m is one tall storey counted as two floors, since chapel and cremator hall do not stack: 2 × 2 × 185 × 2 = 1,480 m², 15,931 sf.

Power at CBECS 2018's "service" intensity, 7.2 kWh/sf a year: 114,700 kWh over 8,760 hours is 13.1 kW, **0.0131 MW**. Water at the office benchmark, 14.48 gal/sf a year: 230,700 gallons over 365 days is 632 a day, **2.4 kL**.

The retorts burn natural gas, 12.5–28.5 therms a cremation (American Crematory), which the game's power model does not carry, so the draw is the building's alone.

**Pollution 1.** Crematories do not report to the Toxics Release Inventory (40 CFR 372.23 lists no NAICS 8122xx), so there is no TRI figure. Measured emissions are about 0.12 lb/hr particulate (a WV DEP source test, [permit evaluation](https://dep.wv.gov/daq/Documents/August%202016%20Draft%20Permits/3327-Eval.pdf)) and about 0.0028 lb of mercury a cremation (Ohio EPA GP-23.1, second-hand). Over a 2,080-hour year that is about 255 lb, which on the scale where the coal plant's 484,000 lb stands for 140 is **0.07**. It is **rounded up to 1**, the field's smallest nonzero value, because a real nonzero emission should register.

The flue is one stack, **7.6 m (25 ft)** above grade, inside the 18–25 ft range of US crematory air permits (Mojave AQMD 18 ft, Auburn ME 23 ft, SW Clean Air 24.7 ft) and at least 3 ft above the roof (Michigan general permit). It is 3.1 m clear of the hall roof deck, an 8-sided steel stack about 0.9 m across (the game's own diameter) on the hall's street-side roof edge, so it shows from the default pitch. The cremator hall's flat roof is 4.5 m (15 ft), the game's own height and unsourced, enough to clear a retort and its breeching duct; the gabled chapel keeps the 6.4 m ridge. The crematorium's hearses are the cemetery's: two.

## The ladder rule

The cemetery unlocks at **milestone 0**: a burial ground is the first public facility any settlement builds, and a village that meets its first death with no way to answer it and none to buy is a bad first hour. The programme rule is that the large facility costs less per person served and more per tile.

|          | Per tile | Per person | Upkeep/tile | Upkeep/person |
| -------- | -------- | ---------- | ----------- | ------------- |
| Clinic   | ¢2,500   | ¢0.625     | ¢190        | ¢0.0475       |
| Hospital | ¢1,200   | ¢0.600     | ¢87         | ¢0.0433       |

The per-person clause holds; the per-tile clause does not, and it gives way to the deck. A hospital is cheaper per person than the clinic to build and to run, which is the ladder the player feels. Per tile it is less than half the clinic's, because six of its fifteen tiles are a car park a clinic does not need; even its nine building tiles alone come to ¢2,000 a tile. Parking to code is worth more to this building than a price contrived to keep a ratio.

## Vehicles

Real metres do not scale with the tile. An **ambulance is 6.9 × 2.5 × 2.7 m**, a US Type III on a Ford E-450 with a 170-inch module, the commonest US box ambulance. Builders land within a few inches of each other: an [AEV at 269 × 97 × 107.5 in](https://www.shopgarage.com/listing/2026-AEV-Ford-Type-III-1c9eec37-5413-4926-a252-c480804653f4), a [Braun Chief XL bid at 272.75 × 98 × 106.5 in](https://docs.southbendin.gov/WebLink/0/doc/106217/Page26.aspx) and a [PL Custom Medallion at 275 × 99 × 107 in](https://signal-12.com/wiki/13-EM_%282013%29).

A **hearse is 6.2 × 1.9 × 1.9 m** (Coleman Milne Mercedes 214; a Cadillac XT5 coach is 6.32 m). The ambulance is 0.7 m longer and 0.8 m taller, so the silhouette read comes from height and livery as much as length.

## Where the mechanism names code

- `DeathCareSpec` mirrors `GarbageSpec`, a road-BFS radius plus a buffer, and hangs on `BuildingCatalogEntry` as `deathCare`.
- The death rate is derived from `TICKS_PER_YEAR`; the regional service ends at `DEATH_CARE_MILESTONE`, the same `BIG_TOWN_MILESTONE` that sets `SEWER_MILESTONE`.
- A body is left at the building's anchor tile, `inst.x` and `inst.z`, by `DeathCareSystem.tick`.
- The stale-population hazards were in `demand.ts` (the denominators and the commercial term), `growth.ts` (`Problem.LowDemand`, display-only) and `traffic.ts` (`tripsForTick`).
- The resized clinic's 2×2 stamp lives in the saved `buildingId` layer while the renderer draws the catalog's 1×2.

## Checks, in numbers

- A hospital covering 60,000 people halves its effective strength; the same hospital plus a second covering the same tiles does not.
- One uncollected body four game months old subtracts 128 from `Health` at its tile; collected a tick earlier it subtracts nothing.
- A city of 10,000 run for 72,000 ticks produces 90 deaths, plus or minus 1, and the same run split by a save and restore produces the same.
- A cemetery of 780 plots stops collecting on the 781st body; a backlog of 300 drains at the crematorium's rate in about 10,400 ticks.
- Looked at in a browser: the ladder in one frame (house, clinic, hospital); the cemetery at the default pitch and at the 1.75 m pedestrian; hearse, ambulance and car stopped on one street at 6.2 m, 6.9 m and 4.0 m; the health lens over a backlog, a hole where the bodies are and not a city-wide smear.
- The deck's width is 40.5 m (40.48) and a level 2,430 m² (2,429).

## The population sink

At 9 deaths per 1,000 a year against positive residential demand the sink is a slow leak, not a collapse: in-migration refills homes faster than deaths empty them. Population only truly falls when demand is at or below zero.

A city of 10,000 run for one game year (72,000 ticks) produces 90 deaths. A city of 3,500 loses 31 a year. A Metropolis of 50,000 produces 450.
