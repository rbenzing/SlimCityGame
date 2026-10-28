# Civic draw

Every figure is derived in [specs/municipal-services.md](../../specs/municipal-services.md).

| Building             | Power     | Water     | Meaning                                                                                                                      | File                    |
| -------------------- | --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| police station       | 0.0243 MW | 2.3 kL    | Its derived 1,420 m² (15,285 sf) at CBECS's public-order intensity; the office water benchmark.                              | `src/data/catalog.json` |
| police district      | 0.0603 MW | 5.7 kL    | Concord NH's 38,000 sf, same intensity and benchmark.                                                                        | `src/data/catalog.json` |
| fire station         | 0.0085 MW | 1.6 kL    | Its derived ~500 m² (5,382 sf); the fire-station water benchmark.                                                            | `src/data/catalog.json` |
| fire district        | 0.025 MW  | 4.7 kL    | Indianapolis Fire Station 20's 15,733 sf, same intensity and benchmark.                                                      | `src/data/catalog.json` |
| clinic               | 0.0158 MW | 1.9 kL    | A 1×2 at 6.4 m, 7,965 sf, at outpatient health care's intensity; the medical-office water benchmark.                         | `src/data/catalog.json` |
| hospital             | 0.592 MW  | 104 kL    | Its stated 180,000 sf at inpatient health care's 28.8 kWh/sf; the hospital water median, 55.71 gal/sf.                       | `src/data/catalog.json` |
| school               | 0.0601 MW | 6.3 kL    | Education's intensity; the K-12 water benchmark.                                                                             | `src/data/catalog.json` |
| middle school        | 0.1028 MW | 10.8 kL   | 95,840 sf (599 × 160) at CBECS education's 9.4 kWh/sf; WaterSense K-12's 10.84 gal/sf a year.                                | `src/data/catalog.json` |
| high school          | 0.1376 MW | 14.4 kL   | 128,200 sf (693 × 185), same intensity and benchmark.                                                                        | `src/data/catalog.json` |
| college              | 0.1875 MW | 19.6 kL   | 174,700 sf (2,730 × 64), the same two: no college figure of its own.                                                          | `src/data/catalog.json` |
| library              | 0.017 MW  | 1.8 kL    | 12,300 sf at public assembly's 12.1 kWh/sf; the office water benchmark, 14.48 gal/sf.                                        | `src/data/catalog.json` |
| rail station         | 0.0322 MW | 5 kL      | A transport terminal's intensity; office water.                                                                              | `src/data/catalog.json` |
| airport              | 0.4 MW    | 175 kL    | A 418,000 sf terminal; four million passengers a year at 4.2 gallons.                                                        | `src/data/catalog.json` |
| incinerator          | 1.18 MW   | 2 kL      | Its 450 ton-a-day burn at 63 kWh a ton; water unsourced.                                                                     | `src/data/catalog.json` |

