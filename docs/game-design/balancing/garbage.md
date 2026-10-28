# Garbage

Every figure is sourced in [specs/garbage-recovery.md](../../specs/garbage-recovery.md)
and [../world-sim/services-model.md](../../world-sim/services-model.md#garbage-and-waste-management).

| Constant                        | Value                           | Meaning                                                                                                                                 | File                      |
| ------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `TRASH_UNITS_PER_TONNE`         | 4,000                           | A trash unit is 0.25 kg; every figure in the chain is in it.                                                                            | `src/shared/constants.ts` |
| `TRASH_KG_PER_RESIDENT_DAY`     | 1.32                            | 60% of EPA's 2.2 kg a person a day, the residential share.                                                                              | `src/shared/constants.ts` |
| `TRASH_KG_PER_JOB_DAY`          | 1.86                            | The other 40%, commercial and institutional, over 160 million jobs for 335 million people.                                              | `src/shared/constants.ts` |
| `LANDFILL_DENSITY_T_PER_M3`     | 0.712                           | 1,200 lb a cubic yard, compacted municipal fill (landfills measure 1,200–1,500).                                                        | `src/shared/constants.ts` |
| `LANDFILL_CAPACITY_PER_TILE`    | 6,835,200                       | Derived: 400 m² × the 6 m pile × 0.712 t/m³ × 4,000; about 1,700 t.                                                                     | `src/shared/constants.ts` |
| incinerator `burnRate`          | 90,000 a pass                   | 450 t a day, the middle of the 300–600 t a day a 4×4, 20 m mass-burn plant is.                                                          | `src/data/catalog.json`   |
| incinerator `bufferCapacity`    | 9,000,000                       | Five days of burn in the pit; a dial, no published figure found.                                                                        | `src/data/catalog.json`   |
| `RECYCLING_KG_PER_RESIDENT_DAY` | 0.131                           | 264 lb a household a year of kerbside recycling (NC FY2024-25) over a household of 2.5.                                                 | `src/shared/constants.ts` |
| `RECYCLING_HOMES_PER_TRUCK`     | 9,500                           | 950 homes a day for a one-person side-loader, every other week; derived.                                                                | `src/shared/constants.ts` |
| `KERBSIDE_MAX_HOMES`            | 4                               | City kerbside covers buildings of up to three or four homes; blocks hire private haulers.                                               | `src/shared/constants.ts` |
| `RECYCLING_CREDIT_PER_UNIT`     | ¢0.000164                       | Derived: a landfill tile's paint cost plus 30 years of upkeep over its capacity.                                                        | `src/shared/constants.ts` |
| recycling depot                 | 2×3, 4 trucks, 38,000 homes     | 540 m² of fleet yard a truck (Calgary); cost, upkeep and pollution are dials.                                                           | `src/data/catalog.json`   |
| `MRF_SHORT_TONS_PER_DAY`        | 50                              | A small single-stream plant: Kauai's 55 t a day start-up, Isabella County's 7 t an hour one shift.                                      | `src/shared/constants.ts` |
| `MRF_SORT_UNITS_PER_PASS`       | 9,072                           | Derived: 50 short tons (45.36 t) × 4,000 units ÷ 20 passes.                                                                             | `src/shared/constants.ts` |
| `MRF_YIELD_PERCENT`             | 87                              | MRFs sort 87% of what they take to market (Recycling Partnership 2024); 13% is residue.                                                 | `src/shared/constants.ts` |
| `MRF_RESIDUE_STORE_UNITS`       | 165,110                         | Derived: one week of residue at full throughput, 13% × 181,440 × 7; a dial, no published figure.                                        | `src/shared/constants.ts` |
| `MRF_KG_PER_HOME_DAY`           | 0.30                            | A home in a block of five or more: Hennepin County's measured 0.63 lb a unit a day.                                                     | `src/shared/constants.ts` |
| `MRF_KG_PER_COMMERCIAL_JOB_DAY` | 0.30                            | CalRecycle 2014 curbside recycling, 0.08–0.30 t an employee a year across shops and offices.                                            | `src/shared/constants.ts` |
| `MRF_KG_PER_INDUSTRIAL_JOB_DAY` | 0.25                            | CalRecycle 2014 curbside recycling, 0.05–0.16 t an employee a year across manufacturing and wholesale.                                  | `src/shared/constants.ts` |
| materials recovery facility     | 5×6, 11 m, 4 trucks, 0.0378 MW  | Kauai's 3-acre site and 27,000 sq ft hall; 20 kWh a tonne over the day; reach 48, cost, upkeep, pollution dials.                        | `src/data/catalog.json`   |
| `TRANSFER_SHORT_TONS_PER_DAY`   | 50                              | EPA's small class (under 100 t a day); a typical rural station, under 60 t a day for about 20,000 people.                               | `src/shared/constants.ts` |
| `TRANSFER_UNITS_PER_PASS`       | 9,072                           | Derived like `MRF_SORT_UNITS_PER_PASS`: 50 short tons × 4,000 units ÷ 20 passes.                                                        | `src/shared/constants.ts` |
| `TRANSFER_FLOOR_DAYS`           | 2                               | The common 48-hour state limit on waste left at a station (Kansas K.A.R. 28-29-23a, Oregon Metro dry waste).                            | `src/shared/constants.ts` |
| `TRANSFER_FLOOR_UNITS`          | 362,880                         | Derived: two days at full throughput, 9,072 × 20 × 2; about 91 t.                                                                       | `src/shared/constants.ts` |
| transfer station                | 4×5, 11 m, 4 trucks, 0.00945 MW | 2-acre sites (Isle of Wight, Mammoth Lakes), Becker County's 16,000 sq ft hall, 5 kWh a tonne; reach 40, cost, upkeep, pollution dials. | `src/data/catalog.json`   |

