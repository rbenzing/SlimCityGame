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
| `LEVEL_2_LAND_VALUE`             | 140                                                                    | Land value a tile must exceed to level a building to 2.                                                                                       | `src/sim/growth.ts`       |
| `LEVEL_3_LAND_VALUE`             | 190                                                                    | Land value a tile must exceed to level a building to 3.                                                                                       | `src/sim/growth.ts`       |
| `RES_L3_EDUCATION`               | 60                                                                     | Education a residential tile must also exceed for level 3.                                                                                    | `src/sim/growth.ts`       |
| `HIGH_CRIME`                     | 170                                                                    | Crime above which a building carries the `HighCrime` problem.                                                                                 | `src/sim/growth.ts`       |
| `HIGH_POLLUTION`                 | 170                                                                    | Pollution above which a residential building carries `HighPollution`.                                                                         | `src/sim/growth.ts`       |
| `LOW_DEMAND`                     | -0.5                                                                   | Sector demand below which a building carries `LowDemand`.                                                                                     | `src/sim/growth.ts`       |
| pollution weight in desirability | res 0.5, com 0.2, ind 0                                                | How much pollution discounts spawn desirability, by sector. Inline literal (`desirabilityFor`'s `pollutionWeight`), not an exported constant. | `src/sim/growth.ts`       |
| desirability formula             | `(landValue/255) × 0.6 + 0.4 − (pollution/255) × weight`, clamped 0..1 | The exact spawn-probability multiplier; `simulation-rules.md` states its shape only. Inline literal in `desirabilityFor`.                     | `src/sim/growth.ts`       |
| `ZONE_DEPTH`                     | 4                                                                      | Tiles a frontage march reaches back from the road.                                                                                            | `src/world/zonable.ts`    |
| `MAX_BUILD_SLOPE`                | 4 m                                                                    | Per-tile height delta ceiling for zoning and building.                                                                                        | `src/shared/constants.ts` |

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
| farm residents      | 4                                                              | One farm household, at every level.                                                              | `src/data/catalog.json`   |
| farm power          | crops 0.2/0.3/0.4, orchard 0.2/0.3/0.5, pasture 0.3/0.6/1.5 MW | A farmstead's draw, against the small house's 0.1 MW; a dairy's milking and cooling.             | `src/data/catalog.json`   |
| farm water          | 0                                                              | A farm pumps its own well.                                                                       | `src/data/catalog.json`   |
| pasture pollution   | 12                                                             | A fifth of a workshop's 60; crops and orchards emit none.                                        | `src/data/catalog.json`   |

## Demand (RCI)

| Constant                                   | Value                                               | Meaning                                                                                                              | File                      |
| ------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `DEFAULT_TAX_RATE`                         | 0.09                                                | The tax rate every sector's demand term measures against.                                                            | `src/shared/constants.ts` |
| `BASE_MULTIPLIER`                          | 1.81                                                | Total jobs per basic (industrial) job; each supports 0.81 commercial ones. Mulligan 2008, ~200 small US communities. | `src/sim/demand.ts`       |
| industrial span                            | 16 — one `ind-1`'s jobs, read from the catalog      | A town a whole small factory short of its basic jobs reads full industrial demand.                                   | `src/sim/demand.ts`       |
| commercial span                            | 6 — one `com-low-1`'s jobs, read from the catalog   | A town a whole corner shop short of its supported local jobs reads full commercial demand.                           | `src/sim/demand.ts`       |
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
