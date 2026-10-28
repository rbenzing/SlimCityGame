# Sound walls

| Constant                     | Value       | Meaning                                                                                                          | File                      |
| ---------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `SOUND_WALL_HEIGHTS_M`       | 3, 4.5, 6 m | The heights the tool offers.                                                                                     | `src/shared/soundwall.ts` |
| `LINE_OF_SIGHT_HEIGHT_M`     | 3 m         | The height at which a wall just breaks the line from a truck's stack to a ground-floor window.                   | `src/shared/soundwall.ts` |
| `LOSS_AT_LINE_OF_SIGHT_DB`   | 5 dB        | A wall's insertion loss at that height (FHWA Noise Barrier Design Handbook §3.5.1).                              | `src/shared/soundwall.ts` |
| `LOSS_PER_METRE_DB`          | 1.5 dB      | Each metre above it (same section).                                                                              | `src/shared/soundwall.ts` |
| `WALL_USD_PER_M2`            | $525        | $48.76/ft², the 2020–22 national average (FHWA noise barrier inventory).                                         | `src/shared/soundwall.ts` |
| `MOTORWAY_USD_PER_LANE_MILE` | $3.551M     | A rural freeway on new alignment, 2014 dollars (FHWA C&P Exhibit A-1); with the motorway's price, prices a wall. | `src/shared/soundwall.ts` |

