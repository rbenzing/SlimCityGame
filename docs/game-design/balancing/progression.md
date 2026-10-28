# Progression

| Constant                      | Value                                             | Meaning                                                                         | File                      |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------- |
| `MILESTONES`                  | see the table in [progression.md](../progression.md) | Population thresholds and one-time rewards.                                     | `src/shared/constants.ts` |
| `LOW_TAX_MULT`                | 0.7                                               | `lowTax` district tax multiplier.                                               | `src/sim/policy.ts`       |
| `HIGH_TAX_MULT`               | 1.3                                               | `highTax` district tax multiplier.                                              | `src/sim/policy.ts`       |
| `NO_HEAVY_TRAFFIC_MULT`       | 1.6                                               | `noHeavyTraffic` pathfind-cost multiplier on a district's roads.                | `src/sim/policy.ts`       |
| `GREEN_ENERGY_POLLUTION_MULT` | 0.5                                               | `greenEnergy` pollution-emission multiplier.                                    | `src/sim/policy.ts`       |
| `ADVISOR_REFRESH_SNAPSHOTS`   | 10                                                | Snapshots between Advisor re-ranks (≈ once a second, at ~10 snapshots/s).       | `src/ui/advisor.ts`       |
| `LABOUR_MARKET_SLACK`         | 0.25                                              | Share of the workforce out of work, or in empty jobs, before the Advisor warns. | `src/ui/advisor.ts`       |

