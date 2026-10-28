# Demand (RCI)

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

