# Economy

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

