# Soil and farms

Every figure is sourced in [specs/farms.md](../../specs/farms.md).

| Constant            | Value                                                         | Meaning                                                                                          | File                      |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| `SAND_BAND_METERS`  | 3 m                                                           | Land this close above sea level is beach: drawn as sand, graded unfit.                           | `src/shared/constants.ts` |
| `PRIME_MAX_SLOPE`   | 0.06                                                          | The steepest very fertile ground (land-judging classes A–B, capability classes I–II).            | `src/shared/soil.ts`      |
| `FERTILE_MAX_SLOPE` | 0.12                                                          | The steepest fertile ground (class C, capability class III); steeper to 20% is somewhat fertile. | `src/shared/soil.ts`      |
| `STONY_CELL_TILES`  | 6                                                             | Stony patches' lattice, in tiles.                                                                | `src/shared/soil.ts`      |
| stony threshold     | 0.28                                                          | The patch field reads below this on about one tile in six (`STONY_BELOW`, not exported).         | `src/shared/soil.ts`      |
| `FARM_DEPTH`        | 8                                                             | Tiles farmland runs back from its dirt road.                                                     | `src/world/zonable.ts`    |
| farm desirability   | very fertile 1.0, fertile 0.8, somewhat 0.6                   | A farm's spawn multiplier, in place of land value (`FARM_DESIRABILITY`).                         | `src/sim/growth.ts`       |
| farm grade by kind  | crops very fertile, orchard fertile, pasture somewhat         | What the soil must be for a farm to start, or to grow onto more land (`FARM_GRADE`).             | `src/sim/growth.ts`       |
| farm lots           | 4×5, 5×6, 6×7                                                 | Tiles a farm takes at levels 1–3, every kind alike.                                              | `src/data/catalog.json`   |
| farm jobs           | crops 1/2/2, orchard 1/2/4, pasture 1/2/5                     | Annual labour hours over 2,000 h a job, at each level's stated scale.                            | `src/data/catalog.json`   |
| farm residents      | 3                                                             | One farm household, at every level (see [Residential kinds](residential-kinds.md)).                | `src/data/catalog.json`   |
| farm power          | crops 2.8/4.2/5.6, orchard 2.8/4.2/7.0, pasture 4.2/8.4/21 kW | A farmstead's draw, in ratio to the detached house's 1.4 kW; a dairy's milking and cooling.      | `src/data/catalog.json`   |
| farm water          | 0                                                             | A farm pumps its own well.                                                                       | `src/data/catalog.json`   |
| pasture pollution   | 12                                                            | A fifth of a workshop's 60; crops and orchards emit none.                                        | `src/data/catalog.json`   |

