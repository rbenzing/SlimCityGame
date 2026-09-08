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
| `ROAD_CHECK_RADIUS`              | 3                                                                      | Manhattan tiles to the nearest street a lot may be.                                                                                           | `src/sim/growth.ts`       |
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

## Demand (RCI)

| Constant                                   | Value                                              | Meaning                                                              | File                      |
| ------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| `DEFAULT_TAX_RATE`                         | 0.09                                               | The tax rate every sector's demand term measures against.            | `src/shared/constants.ts` |
| residential base term                      | 0.3                                                | Keeps res demand positive with no population yet.                    | `src/sim/demand.ts`       |
| residential jobs-gap denominator           | max(200, population × 0.5)                         | Floors how sharply unfilled jobs pull demand in a small city.        | `src/sim/demand.ts`       |
| residential happiness term                 | (happiness − 50) / 150                             | Above-50 happiness pulls demand up.                                  | `src/sim/demand.ts`       |
| residential/commercial/industrial tax term | (rate − 0.09) × 4                                  | Above-default tax repels demand, all three sectors alike.            | `src/sim/demand.ts`       |
| commercial base term                       | 0.15                                               | Keeps com demand positive with no population yet.                    | `src/sim/demand.ts`       |
| commercial shopper ratio                   | population − jobs × 1.6, over max(400, population) | More shoppers than shop jobs pulls com demand up.                    | `src/sim/demand.ts`       |
| industrial base term                       | 0.4                                                | Keeps ind demand positive with no population yet.                    | `src/sim/demand.ts`       |
| industrial employed-absorption denominator | max(1, population × 0.55)                          | How fully the workforce is already absorbed.                         | `src/sim/demand.ts`       |
| industrial outgrow-jobs denominator        | max(600, population)                               | Floors how sharply a population outgrowing jobs pulls ind demand up. | `src/sim/demand.ts`       |

## Economy

| Constant                     | Value      | Meaning                                                                         | File                      |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------- | ------------------------- |
| `TICKS_PER_MONTH`            | 6,000      | `TICKS_PER_DAY` (200) × `DAYS_PER_MONTH` (30); the monthly settlement boundary. | `src/shared/constants.ts` |
| `EMPLOYMENT_RATE`            | 0.55       | Employed = min(population × 0.55, jobs).                                        | `src/sim/economy.ts`      |
| `LAND_VALUE_FACTOR_BASE`     | 0.75       | Floor of the income land-value multiplier.                                      | `src/sim/economy.ts`      |
| `LAND_VALUE_FACTOR_SPAN`     | 0.5        | Added span on top of the base, scaled by average land value / 255.              | `src/sim/economy.ts`      |
| `MAX_TAX_RATE`               | 0.3        | Per-sector tax rate ceiling.                                                    | `src/shared/constants.ts` |
| `FUNDS_WARNING_THRESHOLD`    | ¢2,000     | Funds below this raise the "budget low" warning.                                | `src/sim/economy.ts`      |
| `MAX_LOAN`                   | ¢100,000   | Outstanding loan-balance ceiling.                                               | `src/shared/constants.ts` |
| `LOAN_MONTHLY_INTEREST`      | 0.01       | Monthly interest on the outstanding loan balance.                               | `src/shared/constants.ts` |
| `LANDFILL_UPKEEP_PER_TILE`   | ¢3/month   | Monthly upkeep per painted landfill tile.                                       | `src/shared/constants.ts` |
| `POWER_LINE_UPKEEP_PER_TILE` | ¢0.5/month | Monthly upkeep per power-line tile.                                             | `src/shared/constants.ts` |

## Progression

| Constant                       | Value                                             | Meaning                                                                                            | File                      |
| ------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------- |
| `MILESTONES`                   | see the table in [progression.md](progression.md) | Population thresholds and one-time rewards.                                                        | `src/shared/constants.ts` |
| `LOW_TAX_MULT`                 | 0.7                                               | `lowTax` district tax multiplier.                                                                  | `src/sim/policy.ts`       |
| `HIGH_TAX_MULT`                | 1.3                                               | `highTax` district tax multiplier.                                                                 | `src/sim/policy.ts`       |
| `NO_HEAVY_TRAFFIC_MULT`        | 1.6                                               | `noHeavyTraffic` pathfind-cost multiplier on a district's roads.                                   | `src/sim/policy.ts`       |
| `GREEN_ENERGY_POLLUTION_MULT`  | 0.5                                               | `greenEnergy` pollution-emission multiplier.                                                       | `src/sim/policy.ts`       |
| `ADVISOR_REFRESH_SNAPSHOTS`    | 10                                                | Snapshots between Advisor re-ranks (≈ once a second, at ~10 snapshots/s).                          | `src/ui/advisor.ts`       |
| unemployment warning threshold | 0.25                                              | Share of population unemployed before the Advisor warns. Inline literal, not an exported constant. | `src/ui/advisor.ts`       |

## Verification note

Every constant above was checked directly against the source it names.
None of them disagreed with the prose already carried in
[simulation-rules.md](simulation-rules.md), [economy.md](economy.md), or
[progression.md](progression.md) — this table adds file locations and, for
the desirability formula and the demand-model's coefficients (which the
prose describes only in shape), the exact expressions, but changes no
number.
