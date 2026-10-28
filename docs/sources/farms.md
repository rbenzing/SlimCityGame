# Farms — sources and derivations

Tier 3 appendix to [the spec](../specs/farms.md). It holds the soil research digest, the scale reasoning and the jobs derivation behind each figure.

## Soil grades and the USDA classes

The grades follow the USDA's land capability classes.

- Classes I–IV can be cultivated. Classes VI–VII suit pasture only.
- Class VIII, "rock outcrop, sand dunes, beaches", suits no commercial crop ([NRCS land capability](https://www.nrdnet.org/sites/default/files/interpretive_groups_wetlands.pdf); [land judging, classes and subclasses](http://www.landjudging.com/land_capability.htm)).
- The slope bands are the state land-judging slope classes, A 0–2%, B 2–6%, C 6–12% and D 12–20%. NRCS sets them per state rather than nationally ([Kentucky land-judging card](https://kyffa.org/system/ckeditor_assets/attachments/1093/Land_Judging_Card-_New.pdf)). Very fertile is classes A and B together, the slopes of classes I and II.
- Prime farmland needs its erodibility factor K times its slope in percent to be under 2, and it must flood less than once in two years ([7 CFR 657.5](https://www.law.cornell.edu/cfr/text/7/657.5)). With a common K of 0.3, that puts the edge of prime land at about 6%, and it is why the water's edge is unfit.
- Stony, shallow soil is the land capability "s" subclass, which limits land to pasture whatever its slope.
- Orchards take the rolling middle grade because cold air drains off a slope, and that drainage is what an orchard is planted on a slope for.
- A 20% slope is 4 m over a 20 m tile, the steepest ground anything is built on. The terrain already draws rock beyond it and sand within 3 m of sea level, so the Soil lens and the ground's own colours agree about where the beach and the rock are.

## Scale: why a lot stands for a farm

A 20 m tile is 0.0988 acres, and the whole map is about 6,500 acres. The median US farm is 72 acres ([AFBF from the 2022 Census](https://www.fb.org/intel/markets/small-family-farms-the-roots-of-american-agriculture)), about 730 tiles. A farm drawn at full size would cover a tenth of the map.

A farm lot therefore draws its farmstead and the fields nearest it, and stands for the whole farm. Its jobs and its herd are the whole farm's. This is the one stated override: the lot is compressed, and the figures are not.

A farmstead alone averages about 2.9 acres. That is the 6 million acres of farmsteads and farm roads the ERS counts, divided among 2.04 million farms ([ERS major land uses](https://www.ers.usda.gov/amber-waves/2024/december/ers-data-series-tracks-major-uses-of-u-s-land-with-a-focus-on-agriculture)). It is about 30 tiles, so even the 4×5 lot is smaller than the real farmstead.

## Jobs

Jobs are the farm's annual labour hours divided by 2,000 hours a full-time job, rounded, and never below one.

| Farm    | Level 1 (homestead)                | Level 2 (family farm)             | Level 3 (large farm)               |
| ------- | ---------------------------------- | --------------------------------- | ---------------------------------- |
| Crops   | 160 ac × 6.0 h = 960 h → **1 job** | 463 ac × 6.0 h = 2,778 h → **2**  | 1,500 ac × 2.3 h = 3,450 h → **2** |
| Orchard | 10 ac × 126 h = 1,260 h → **1**    | 25 ac × 126 h = 3,150 h → **2**   | 60 ac × 126 h = 7,560 h → **4**    |
| Pasture | 50 cows × 39 h = 1,950 h → **1**   | 100 cows × 39 h = 3,900 h → **2** | 250 cows × 39 h = 9,750 h → **5**  |

- **Crop hours.** 6.0 hours an acre on crop farms under 500 acres, and 2.3 on farms of 1,000–2,000 acres ([farmdoc daily, FINBIN 2007–24](https://farmdocdaily.illinois.edu/2026/01/labor-standards.html)).
- **Crop acreages.** 160 acres is the Homestead Act's quarter section, and 463 acres is the average farm in the 2022 Census ([NASS](https://www.nass.usda.gov/Newsroom/2024/02-13-2024.php)).
- **Orchard hours.** The apple harvest alone is 126 hours an acre ([UC Davis, Rural Migration News](https://migration.ucdavis.edu/rmn/blog/post/?id=2497)). Pruning and thinning are left out, so orchard jobs are a floor.
- **Pasture hours.** The pasture farm is a dairy at 39 hours a cow a year ([FINBIN labour estimates](https://www.cffm.umn.edu/finpackkb/finpack-knowledge-base-general/labor-hour-estimates/)). That agrees with New York's 44 cows per worker on herds under 650 ([Cornell DFBS 2025](https://www.northeastalliance.com/neafanews/2026/8/25/2025-trends-in-production-and-financial-performance-of-ny-dairy-farms-participating-in-the-dairy-farm-business-summary-and-analysis-program)).

Row crops employ almost nobody per acre, and that is the published truth: a large crop farm adds output, not jobs. Dairy is the labour-hungry farm.

## Drawn stock

- **Orchard trees.** Semi-dwarf apples at 16 ft in the row and 20 ft between rows, 4.9 m × 6.1 m ([eXtension](https://apples.extension.org/understanding-apple-tree-size-dwarf-semi-dwarf-and-standard/)).
- **Silos.** 6 m across and 16 m tall; concrete stave silos run 4.9–7.3 m by 12–21 m ([Oak Point](https://www.oakpointagronomics.com/tower-silos/)).
- **Grain bins.** 5.5 m across, eaves at 4 m ([Brock](https://www.brockgrain.com/brock-product/on-farm-grain-bins/)).
- **Barn.** 11 m wide, the width of a Wisconsin dairy barn ([Camavision](https://www.camavision.com/barns-a-historical-overview-fall-winter-2016-newsletter/)).
- **Crop rows.** Drawn at 30 inches (0.76 m), the spacing of 86% of US corn ([Iowa State](https://crops.extension.iastate.edu/encyclopedia/row-spacing-corn)). They are banded in fours so they hold still at the default camera.
- **Farmhouse windows.** 36 × 60 inches (0.91 × 1.52 m), the commonest double-hung window ([Thompson Creek](https://www.thompsoncreek.com/blog/double-hung-window-sizes/)), with sills at 0.9 m, inside the 44-inch limit for a bedroom window ([Today's Homeowner](https://todayshomeowner.com/windows/guides/standard-window-sizes/)).
- **The farm truck.** A full-size regular-cab pickup, 5.31 × 2.03 × 1.91 m, the Ford F-150 with its standard bed ([dimensions.com](https://www.dimensions.com/element/ford-f150-regular-cab-standard-bed-p702-14th-gen)).
