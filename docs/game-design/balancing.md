# Balancing

Every tuning constant behind [simulation-rules.md](simulation-rules.md) and
[economy.md](economy.md)/[progression.md](progression.md), gathered in one
place so a designer can find the dial without reading the sim code. Each
row names the constant as it exists in the source (or, where a rule is an
inline literal rather than an exported constant, the file and expression
that carries it) and the file it lives in. Every figure below was checked
against the running code while writing this table; none of it changed a
figure already stated in [simulation-rules.md](simulation-rules.md),
[economy.md](economy.md), or [progression.md](progression.md) — the two
agree everywhere they overlap.

## Growth and construction

| Constant                         | Value                                                                  | Meaning                                                                                                                                       | File                      |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `GROWTH_INTERVAL`                | 10                                                                     | Ticks between growth passes.                                                                                                                  | `src/sim/growth.ts`       |
| `SCAN_STRIDE`                    | 32                                                                     | Passes needed to sweep the whole map once (1-in-32).                                                                                          | `src/sim/growth.ts`       |
| `CONSTRUCTION_TICKS`             | 100                                                                    | Ticks a spawned or leveled-up building spends building.                                                                                       | `src/sim/growth.ts`       |
| `ROAD_CHECK_RADIUS`              | 3                                                                      | Manhattan tiles to the nearest street a lot may be.                                                                                           | `src/shared/constants.ts` |
| `ABANDON_BLOCKER_STREAK`         | 3                                                                      | Consecutive blocked passes before an Active building abandons.                                                                                | `src/sim/growth.ts`       |
| `DESPAWN_ABANDONED_PASSES`       | 10                                                                     | Consecutive still-blocked passes before an Abandoned building is removed.                                                                     | `src/sim/growth.ts`       |
| `LAND_VALUE_DECAY_NUM`           | 243 (of 256)                                                           | Land value's decay a pass, the only thing that gives a field fed a gain an equilibrium; bare clean ground settles at `LAND_VALUE_BASE` = 119, a river bank at `LAND_VALUE_BANK` = 181. | `src/sim/fields.ts`       |
| `LEVEL_2_LAND_VALUE`             | 140                                                                    | Land value a tile must exceed to level a building to 2; bare ground settles under it, a shore over it.                                       | `src/sim/growth.ts`       |
| `LEVEL_3_LAND_VALUE`             | 190                                                                    | Land value a tile must exceed to level a building to 3.                                                                                       | `src/sim/growth.ts`       |
| `RES_L3_EDUCATION`               | 60                                                                     | Education a residential tile must also exceed for level 3.                                                                                    | `src/sim/growth.ts`       |
| `HIGH_CRIME`                     | 170                                                                    | Crime above which a building carries the `HighCrime` problem.                                                                                 | `src/sim/growth.ts`       |
| `HIGH_POLLUTION`                 | 170                                                                    | Pollution above which a residential building carries `HighPollution`.                                                                         | `src/sim/growth.ts`       |
| `LOW_DEMAND`                     | -0.5                                                                   | Sector demand below which a building carries `LowDemand`.                                                                                     | `src/sim/growth.ts`       |
| pollution weight in desirability | res 0.5, com 0.2, ind 0                                                | How much pollution discounts spawn desirability, by sector. Inline literal (`desirabilityFor`'s `pollutionWeight`), not an exported constant. | `src/sim/growth.ts`       |
| desirability formula             | `(landValue/255) × 0.6 + 0.4 − (pollution/255) × weight`, clamped 0..1 | The exact spawn-probability multiplier; `simulation-rules.md` states its shape only. Inline literal in `desirabilityFor`.                     | `src/sim/growth.ts`       |
| `ZONE_DEPTH`                     | 3 (= `ROAD_CHECK_RADIUS`)                                              | Tiles a frontage march reaches back from the road: the distance a lot may stand from its street, so nothing painted is land that cannot grow. | `src/world/zonable.ts`    |
| `MAX_BUILD_SLOPE`                | 4 m                                                                    | Per-tile height delta ceiling for zoning and building.                                                                                        | `src/shared/constants.ts` |

## Residential kinds

Every figure is sourced in [features/building-types.md](features/building-types.md).

| Constant               | Value                                                        | Meaning                                                                                          | File                    |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------- |
| household, owned       | 2.63                                                         | People in a detached house, a townhouse or a farmhouse (ACS 2024, owner-occupied).               | `src/data/catalog.json` |
| household, rented      | 2.26                                                         | People in a home of any other kind (ACS 2024, renter-occupied).                                  | `src/data/catalog.json` |
| residents              | `round(units × household)`                                   | A building's population.                                                                         | `src/data/catalog.json` |
| homes per block        | drawn floor area × 0.85 ÷ 93 m², rounded                     | A 93 m² median new apartment; tiers above the first at the mean 15% setback; no podium or shop floor. | `src/data/catalog.json` |
| homes per frontage     | townhouse 3 per 20 m, duplex and fourplex 2                  | Townhouses about 6 m wide, inside the type's 18–25 ft; 3 homes, 15 an acre, at every level.      | `src/render/houselot.ts` |
| power per home         | detached 1.4, attached 0.97, 2–4 units 0.76, 5+ units 0.70 kW | RECS 2020 annual electricity per household, over 8,760 h.                                        | `src/data/catalog.json` |
| water per person       | 0.34 kL a day                                                | 90 US gallons, the middle of USGS's 80–100 indoor gallons a day.                                 | `src/data/catalog.json` |
| retail floor power     | 16.7 kWh per sq ft a year                                    | CBECS 2018 mercantile electricity over its stock; a mixed block's ground floor.                  | `src/data/catalog.json` |
| retail jobs            | net 80% of plate ÷ 17.5 m² per FTE                           | HCA Employment Density Guide, high-street retail 15–20 m² NIA per FTE.                           | `src/data/catalog.json` |
| water per job          | 0.104 kL a day                                               | 27.5 gallons, the middle of EPA's 20–35 gallons an employee a day.                               | `src/data/catalog.json` |
| `share`                | detached 61.1, duplex 1.6, fourplex 1.2, townhouse 1.6, multiplex 0.63, garden 0.30, midrise 0.11, tower 0.07, mixed 1 | A kind's weight in the lot draw: its ACS share of units ÷ homes per building. | `src/data/catalog.json` |
| lot floors             | half 0, normal 64, double 160, estate 224 (land value, 0–255) | The land-value bands a detached house's lot is platted at; dials, set so bare clean ground (119) plats a normal lot. | `src/shared/lots.ts`    |
| detached lots          | half 1×1, normal 1×2, double 2×2, estate 2×3                 | US zoning minimums of 3,500–5,000, 5,000–7,200, 12,000–15,000 and 20,000+ sq ft on the 20 m tile ([lots-and-land.md](features/lots-and-land.md)). | `src/data/catalog.json` |
| detached body          | 4.75 m per lot tile, never under 9.5 m                        | A house is 9.5 m across the front whatever the lot; the estate's depth is 14.25 m.               | `src/render/massing.ts` |
| farm power             | the detached house's draw × 2/3/4 (crops), 2/3/5 (orchard), 3/6/15 (pasture) | A farmstead's draw, in the ratio it always had to the small house.                               | `src/data/catalog.json` |
| farm residents         | 3                                                            | One owner household.                                                                             | `src/data/catalog.json` |

## Commercial kinds

Every figure is sourced in [features/building-types.md](features/building-types.md#the-commercial-kinds).

| Constant             | Value                                                                                   | Meaning                                                                                       | File                    |
| -------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| net floor            | 80% of the plate                                                                        | Corridors, stores and plant take the rest.                                                    | `src/data/catalog.json` |
| retail jobs          | net ÷ 17.5 m² per FTE                                                                   | HCA: shops, food stores and restaurants at 15–20 m² NIA per FTE.                              | `src/data/catalog.json` |
| office jobs          | net ÷ 13 m² per FTE                                                                     | HCA general office.                                                                           | `src/data/catalog.json` |
| hotel rooms and jobs | plate ÷ 52 m² a room; 1 job per 5 / 3 / 2 rooms by level                                | DOE small hotel 43,200 sq ft over 77 rooms; HCA limited-service, mid-scale, upscale staffing. | `src/data/catalog.json` |
| power per sq ft      | retail 16.7, food service 44.2, lodging 14.4, convenience store 53.3, office 13.6 kWh/yr | CBECS 2018, by principal building activity (the first three derived from totals over stock). | `src/data/catalog.json` |
| restaurant water     | 22.0 kL a day sit-down, 7.3 quick-service                                               | EPA WaterSense 5,800 gallons a day and a third of it.                                         | `src/data/catalog.json` |
| hotel water          | 0.5 kL a room a day                                                                     | EPA 132 gallons per room, every room taken.                                                   | `src/data/catalog.json` |
| body caps            | restaurant 24 m a side; filling-station kiosk 35% of the lot to 16 m                    | A fast-food box and a convenience store on a lot that is mostly car park and forecourt.       | `src/render/massing.ts` |
| `share`              | shop 350, restaurant 286, strip 166, fuel 123, supermarket 46; office 970, hotel 107    | CBECS 2018 building counts (thousands); NACS fuel-selling stores; FMI supermarkets.           | `src/data/catalog.json` |

## Industrial kinds

Every figure is sourced in [features/building-types.md](features/building-types.md#the-industrial-kinds).

| Constant             | Value                                                                                                  | Meaning                                                                                                              | File                    |
| -------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| industrial jobs      | floor ÷ 36 m² per FTE; small units 47; R&D 50; distribution 70 / 77 / 95 by level                      | HCA Employment Density Guide, gross floor per job; a flex building's floor is plate × storeys.                       | `src/data/catalog.json` |
| power per job        | machinery 22,600, fabricated metal 24,900, food 62,600, paper 161,800, chemicals 193,200, metals 273,500 kWh/yr | MECS 2018 energy per employee × the purchased-electricity share; workshop as machinery, factory as fabricated metal. | `src/data/catalog.json` |
| power per sq ft      | warehouse 5.8, flex 9.7 kWh/yr                                                                         | CBECS 2018 warehouse median; flex half office (13.6) and half warehouse.                                             | `src/data/catalog.json` |
| water per job        | machinery 110, fabricated metal 738, chemicals 833, paper 1,000, metals 1,318, food 1,967 gal a day   | Pacific Institute 2003, appendix C; warehouse and flex at the 27.5 gal domestic figure.                              | `src/data/catalog.json` |
| pollution scale      | 140 per 484,000 lb a year                                                                              | The coal plant's 140 for the average TRI electric utility's releases; a plant's level 2 is its industry's average.   | `src/data/catalog.json` |
| releases per plant   | machinery 7,200, fabricated metal 13,500, food 88,600, chemicals 119,900, metals 210,700, paper 416,300 lb | EPA TRI 2023 releases by industry over its reporting facilities; warehouse and flex release nothing.                 | `src/data/catalog.json` |
| industrial noise     | manufacturing 38, warehouse 8, flex 0                                                                  | 75 dBA and a dock's 68 dB against a motorway at capacity (120) taken as 80 dBA: 10^(−5/10), 10^(−12/10).            | `src/data/catalog.json` |
| body fills           | flex 55% a side, chemical plant 50%; the rest 13.6 m per tile                                          | ULI site coverage: R&D flex 25–40%, heavy manufacturing 40–50%, warehouse up to 50%.                                 | `src/render/massing.ts` |
| heavy stack          | 2 × 12 m, at every level; a kindless works 1.6 × 6 m from level 2; light kinds none                    | A plant reads as a plant from its first day; a workshop's few units raise no stack.                                  | `src/render/props.ts`   |
| `share`              | warehouse 55, workshop 22, factory 8, flex 9; food 43, chemicals 26, metals 6, paper 6                 | ULI floor-space shares, manufacturing split 3:1 by firm size (SUSB); BLS establishments in thousands.                | `src/data/catalog.json` |
| Heavy Industrial     | unlocks at milestone 2                                                                                 | A Busy Township's workforce (600) supports about 330 basic jobs, a plant or two.                                     | `src/ui/categories.ts`  |

## Water and sewer

Every figure is sourced in [features/water-and-sewage.md](features/water-and-sewage.md#tuning).

| Constant                       | Value                                      | Meaning                                                                                                     | File                      |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------- |
| water tower                    | 378.5 kL a day; 7.5 kW                     | A 100,000-gallon tank turned over once a day, the storage rule's one day of demand; a groundwater system's 1,800 kWh/MG. | `src/data/catalog.json`   |
| water pumping station          | 3,785 kL a day; 62.5 kW; on a shore; M1    | The 1 MGD class of small surface intake; a surface-water system's 1,500 kWh/MG.                              | `src/data/catalog.json`   |
| water drain pipe               | 3,785 kL of sewage a day; on a shore; M0   | The 1 MGD class of outfall and lift station; a gravity outfall pumps nothing.                                | `src/data/catalog.json`   |
| `SEWAGE_RETURN_FRACTION`       | 0.88                                       | The share of city water that comes back as sewage: public supply consumes 12% (USGS).                        | `src/shared/constants.ts` |
| `SEWAGE_POLLUTION_PER_KL`      | 0.0466 per kL a day                        | 200 mg/L of oxygen demand = 161 lb a year per kL a day, on the coal plant's scale (140 per 484,000 lb).      | `src/shared/constants.ts` |
| outfall pollution              | 176                                        | The drain's rated 3,785 kL a day at that figure, emitted like any plant's.                                   | `src/data/catalog.json`   |
| undrained emission             | `ceil(sewage × 0.0466)`, at least 1        | What a building no drain reaches fouls the ground with, each emission pass.                                 | `src/sim/worker.entry.ts` |
| `WATER_PIPE_COST_PER_TILE`     | ¢12                                        | The power line's figure: a pipe has to be the cheapest thing that reaches a shore.                          | `src/shared/constants.ts` |
| `WATER_PIPE_UPKEEP_PER_TILE`   | ¢0.5 a month                               | The power line's figure.                                                                                    | `src/shared/constants.ts` |
| station / drain cost, upkeep   | ¢3,600 / ¢180; ¢1,800 / ¢90                | The programme's ladder dials: the outfall is always the cheaper answer.                                      | `src/data/catalog.json`   |
| sewage treatment works         | 3,785 kL of sewage a day; `effluent` 0.15; 93 kW; pollution 26; ¢9,000 / ¢520; on a shore; M2 | The drain's class, discharging 30 mg/L against 200 in (40 CFR 133.102); an activated-sludge plant's 2,236 kWh/MG (EPRI). | `src/data/catalog.json`   |
| `WATER_FOUL_PER_KL`            | 255 / 3,785 per kL a day                   | A full raw one-million-gallon outfall saturates the water beside it.                                        | `src/shared/constants.ts` |
| `WATER_FOUL_REACH_TILES`       | 25 tiles (500 m)                           | How far a discharge's fouling reaches along the water before fading to nothing, between the statutory intake setbacks of 500 ft and five miles. | `src/shared/constants.ts` |
| intake yield                   | `waterKL × (1 − foul / 255)`               | A shore intake's supply, scaled by the worst fouling on the water beside it; the tower is never scaled.      | `src/sim/network.ts`      |

## Power

Every figure is derived in [features/power-generation.md](features/power-generation.md#the-generators-re-derived).

| Constant                 | Value                                              | Meaning                                                                                                         | File                     |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| supply                   | `powerMW × capacityFactor`, summed                 | A plant counts for what it delivers over a year, never its nameplate.                                           | `src/shared/power.ts`    |
| wind turbine             | 3.4 MW × 0.335 = 1.14 MW; 103 m hub, 134 m rotor; ¢320 / ¢9 | The average onshore machine installed in 2023 (LBNL) at the modern fleet's capacity factor; cost and upkeep from EIA $/kW against the coal plant's anchors. | `src/data/catalog.json`  |
| coal plant               | 60 MW × 0.426 = 25.6 MW; ¢12,000 / ¢800; pollution 140; 5 kL water | A small unit at coal's 2024 fleet capacity factor (EIA); its cost, upkeep and pollution are the anchors everything else is scaled to; its staff's water. | `src/data/catalog.json`  |
| ¢ per $ of capital       | ¢12,000 ≙ $270 million (60 MW × $4,507/kW)         | The scale a new generator's cost is derived on.                                                                 | `src/data/catalog.json`  |
| ¢ per $ of operation     | ¢800 a month ≙ $8.65 million a year                | Coal's fixed and variable O&M plus fuel at 42.6%; the scale a new generator's upkeep is derived on.             | `src/data/catalog.json`  |

## Civic draw

Every figure is derived in [features/municipal-services.md](features/municipal-services.md#what-the-facilities-draw-derived-2026-10-05).

| Building             | Power     | Water   | Meaning                                                                                              | File                    |
| -------------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------- | ----------------------- |
| police, fire station | 0.0474 MW | 4.5, 9 kL | The floor the massing rule gives a 2×2 at 12 m, at CBECS's public-order intensity; office and fire-station water benchmarks. | `src/data/catalog.json` |
| clinic               | 0.0692 MW | 8.5 kL  | Outpatient health care's intensity; the medical-office water benchmark.                              | `src/data/catalog.json` |
| school               | 0.0601 MW | 6.3 kL  | Education's intensity; the K-12 water benchmark.                                                     | `src/data/catalog.json` |
| rail station         | 0.0322 MW | 5 kL    | A transport terminal's intensity; office water.                                                      | `src/data/catalog.json` |
| airport              | 0.4 MW    | 175 kL  | A 418,000 sf terminal; four million passengers a year at 4.2 gallons.                               | `src/data/catalog.json` |
| incinerator          | 0.66 MW   | 2 kL    | A 250 ton-a-day combustor's own use at 63 kWh a ton; water unsourced.                               | `src/data/catalog.json` |

## Soil and farms

Every figure is sourced in [features/farms.md](features/farms.md).

| Constant            | Value                                                          | Meaning                                                                                          | File                      |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| `SAND_BAND_METERS`  | 3 m                                                            | Land this close above sea level is beach: drawn as sand, graded unfit.                           | `src/shared/constants.ts` |
| `PRIME_MAX_SLOPE`   | 0.06                                                           | The steepest very fertile ground (land-judging classes A–B, capability classes I–II).            | `src/shared/soil.ts`      |
| `FERTILE_MAX_SLOPE` | 0.12                                                           | The steepest fertile ground (class C, capability class III); steeper to 20% is somewhat fertile. | `src/shared/soil.ts`      |
| `STONY_CELL_TILES`  | 6                                                              | Stony patches' lattice, in tiles.                                                                | `src/shared/soil.ts`      |
| stony threshold     | 0.28                                                           | The patch field reads below this on about one tile in six (`STONY_BELOW`, not exported).         | `src/shared/soil.ts`      |
| `FARM_DEPTH`        | 8                                                              | Tiles farmland runs back from its dirt road.                                                     | `src/world/zonable.ts`    |
| farm desirability   | very fertile 1.0, fertile 0.8, somewhat 0.6                    | A farm's spawn multiplier, in place of land value (`FARM_DESIRABILITY`).                         | `src/sim/growth.ts`       |
| farm grade by kind  | crops very fertile, orchard fertile, pasture somewhat          | What the soil must be for a farm to start, or to grow onto more land (`FARM_GRADE`).             | `src/sim/growth.ts`       |
| farm lots           | 4×5, 5×6, 6×7                                                  | Tiles a farm takes at levels 1–3, every kind alike.                                              | `src/data/catalog.json`   |
| farm jobs           | crops 1/2/2, orchard 1/2/4, pasture 1/2/5                      | Annual labour hours over 2,000 h a job, at each level's stated scale.                            | `src/data/catalog.json`   |
| farm residents      | 3                                                              | One farm household, at every level (see [Residential kinds](#residential-kinds)).                | `src/data/catalog.json`   |
| farm power          | crops 2.8/4.2/5.6, orchard 2.8/4.2/7.0, pasture 4.2/8.4/21 kW  | A farmstead's draw, in ratio to the detached house's 1.4 kW; a dairy's milking and cooling.      | `src/data/catalog.json`   |
| farm water          | 0                                                              | A farm pumps its own well.                                                                       | `src/data/catalog.json`   |
| pasture pollution   | 12                                                             | A fifth of a workshop's 60; crops and orchards emit none.                                        | `src/data/catalog.json`   |

## Demand (RCI)

| Constant                                   | Value                                               | Meaning                                                                                                              | File                      |
| ------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `DEFAULT_TAX_RATE`                         | 0.09                                                | The tax rate every sector's demand term measures against.                                                            | `src/shared/constants.ts` |
| `BASE_MULTIPLIER`                          | 1.81                                                | Total jobs per basic (industrial) job; each supports 0.81 commercial ones. Mulligan 2008, ~200 small US communities. | `src/sim/demand.ts`       |
| industrial span                            | 16 — one `ind-1`'s jobs, read from the catalog      | A town a whole workshop yard short of its basic jobs reads full industrial demand.                                   | `src/sim/demand.ts`       |
| commercial span                            | 8 — one `com-low-1`'s jobs, read from the catalog   | A town a whole corner shop short of its supported local jobs reads full commercial demand.                           | `src/sim/demand.ts`       |
| job room                                   | supported − open − going up, per sector             | The jobs a sector still has room for; a business kind is a spawn candidate only within it (`jobRoom`).               | `src/sim/demand.ts`       |
| residential base term                      | 0.3                                                 | Lets a town's first households arrive before there is any work.                                                      | `src/sim/demand.ts`       |
| residential jobs-gap                       | (jobs − workforce), over max(200, population × 0.5) | Empty jobs pull residents in; a workforce with no work turns them away.                                              | `src/sim/demand.ts`       |
| residential happiness term                 | (happiness − 50) / 150                              | Above-50 happiness pulls demand up.                                                                                  | `src/sim/demand.ts`       |
| residential/commercial/industrial tax term | (rate − 0.09) × 4                                   | Above-default tax repels demand, all three sectors alike.                                                            | `src/sim/demand.ts`       |

## Economy

| Constant                     | Value      | Meaning                                                                                                                             | File                      |
| ---------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `TICKS_PER_MONTH`            | 6,000      | `TICKS_PER_DAY` (200) × `DAYS_PER_MONTH` (30); the monthly settlement boundary.                                                     | `src/shared/constants.ts` |
| `EMPLOYMENT_RATE`            | 0.5        | The workforce is floor(population × 0.5), the US labour force's 50.0% of residents (BLS CPS 2025); employed = min(workforce, jobs). | `src/shared/constants.ts` |
| `LAND_VALUE_FACTOR_BASE`     | 0.75       | Floor of the income land-value multiplier.                                                                                          | `src/sim/economy.ts`      |
| `LAND_VALUE_FACTOR_SPAN`     | 0.5        | Added span on top of the base, scaled by average land value / 255.                                                                  | `src/sim/economy.ts`      |
| `MAX_TAX_RATE`               | 0.3        | Per-sector tax rate ceiling.                                                                                                        | `src/shared/constants.ts` |
| `FUNDS_WARNING_THRESHOLD`    | ¢2,000     | Funds below this raise the "budget low" warning.                                                                                    | `src/sim/economy.ts`      |
| `MAX_LOAN`                   | ¢100,000   | Outstanding loan-balance ceiling.                                                                                                   | `src/shared/constants.ts` |
| `LOAN_MONTHLY_INTEREST`      | 0.01       | Monthly interest on the outstanding loan balance.                                                                                   | `src/shared/constants.ts` |
| `LANDFILL_UPKEEP_PER_TILE`   | ¢3/month   | Monthly upkeep per painted landfill tile.                                                                                           | `src/shared/constants.ts` |
| `POWER_LINE_UPKEEP_PER_TILE` | ¢0.5/month | Monthly upkeep per power-line tile.                                                                                                 | `src/shared/constants.ts` |

## Sound walls

| Constant                     | Value       | Meaning                                                                                                          | File                      |
| ---------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `SOUND_WALL_HEIGHTS_M`       | 3, 4.5, 6 m | The heights the tool offers.                                                                                     | `src/shared/soundwall.ts` |
| `LINE_OF_SIGHT_HEIGHT_M`     | 3 m         | The height at which a wall just breaks the line from a truck's stack to a ground-floor window.                   | `src/shared/soundwall.ts` |
| `LOSS_AT_LINE_OF_SIGHT_DB`   | 5 dB        | A wall's insertion loss at that height (FHWA Noise Barrier Design Handbook §3.5.1).                              | `src/shared/soundwall.ts` |
| `LOSS_PER_METRE_DB`          | 1.5 dB      | Each metre above it (same section).                                                                              | `src/shared/soundwall.ts` |
| `WALL_USD_PER_M2`            | $525        | $48.76/ft², the 2020–22 national average (FHWA noise barrier inventory).                                         | `src/shared/soundwall.ts` |
| `MOTORWAY_USD_PER_LANE_MILE` | $3.551M     | A rural freeway on new alignment, 2014 dollars (FHWA C&P Exhibit A-1); with the motorway's price, prices a wall. | `src/shared/soundwall.ts` |

## Progression

| Constant                      | Value                                             | Meaning                                                                         | File                      |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------- |
| `MILESTONES`                  | see the table in [progression.md](progression.md) | Population thresholds and one-time rewards.                                     | `src/shared/constants.ts` |
| `LOW_TAX_MULT`                | 0.7                                               | `lowTax` district tax multiplier.                                               | `src/sim/policy.ts`       |
| `HIGH_TAX_MULT`               | 1.3                                               | `highTax` district tax multiplier.                                              | `src/sim/policy.ts`       |
| `NO_HEAVY_TRAFFIC_MULT`       | 1.6                                               | `noHeavyTraffic` pathfind-cost multiplier on a district's roads.                | `src/sim/policy.ts`       |
| `GREEN_ENERGY_POLLUTION_MULT` | 0.5                                               | `greenEnergy` pollution-emission multiplier.                                    | `src/sim/policy.ts`       |
| `ADVISOR_REFRESH_SNAPSHOTS`   | 10                                                | Snapshots between Advisor re-ranks (≈ once a second, at ~10 snapshots/s).       | `src/ui/advisor.ts`       |
| `LABOUR_MARKET_SLACK`         | 0.25                                              | Share of the workforce out of work, or in empty jobs, before the Advisor warns. | `src/ui/advisor.ts`       |

## Verification note

Every constant above was checked directly against the source it names.
None of them disagreed with the prose already carried in
[simulation-rules.md](simulation-rules.md), [economy.md](economy.md), or
[progression.md](progression.md) — this table adds file locations and, for
the desirability formula and the demand-model's coefficients (which the
prose describes only in shape), the exact expressions, but changes no
number.
