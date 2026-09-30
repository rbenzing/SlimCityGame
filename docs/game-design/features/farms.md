# Farms — design

- **Status:** Shipped 2026-09-29
- **Date:** 2026-09-29

## What the player gets

A painted **Agriculture** zone, the fourth kind of zone. Farms grow on it the way
homes grow on residential land. A farm is the industry a small town lives by:
its jobs are basic jobs, like a mill's, and they support the town's shops.

Where a farm can go is decided by the ground. Every tile of the map has a
**soil grade**, and the new Soil lens shows it. Farms take only land that is
somewhat fertile or better. The soil also decides what grows:

- the best, flattest land grows row crops;
- rolling land grows orchards;
- the poorest farmable land is fenced pasture with animals on it.

Barns, silos, grain bins, furrowed fields, orchard rows and grazing herds make a
farming district read as one from across the map.

## Why it earns its place

The demand model already treats a small town as a farming or mill town: it
lives on its basic jobs, and shops follow them. Until now "industry" meant a
workshop yard, which is a mill town and never a farm town. Farms give the
player the other half of that choice. They also give the terrain a job. Today
the ground is either buildable or not; with soil, a flat river plain and a
stony hillside are different places to build a town.

Pillars served: **legible cause and effect** (the soil you paint on decides
what grows) and **realism grounded in published figures**. Every number below
cites its source. See [../gdd.md](../gdd.md).

## How it works, for the player

### Soil

Every land tile has one of four grades, read from the ground itself:

| Grade            | What makes it                                          | Farming               |
| ---------------- | ------------------------------------------------------ | --------------------- |
| Very fertile     | slope under 6%                                         | row crops             |
| Fertile          | slope 6–12%                                            | orchards              |
| Somewhat fertile | slope 12–20%, or stony ground                          | pasture and livestock |
| Unfit            | beach sand, the water's edge, rock and slopes over 20% | none                  |

Stony ground is shallow soil over rock. It takes a plough badly on any slope,
so it is somewhat fertile at best. It lies in patches across about one tile in
six. On a generated map, about two-thirds of the land comes out very fertile,
a sixth somewhat fertile, a tenth fertile, and the rest unfit.

The grades follow the USDA's land capability classes.

- Classes I–IV can be cultivated. Classes VI–VII suit pasture only.
- Class VIII, "rock outcrop, sand dunes, beaches", suits no commercial crop
  ([NRCS land capability](https://www.nrdnet.org/sites/default/files/interpretive_groups_wetlands.pdf);
  [land judging, classes and subclasses](http://www.landjudging.com/land_capability.htm)).
- The slope bands are the state land-judging slope classes, A 0–2%, B 2–6%,
  C 6–12% and D 12–20%. NRCS sets them per state rather than nationally
  ([Kentucky land-judging card](https://kyffa.org/system/ckeditor_assets/attachments/1093/Land_Judging_Card-_New.pdf)).
  Very fertile is classes A and B together, the slopes of classes I and II.
- Prime farmland needs its erodibility factor K times its slope in percent to
  be under 2, and it must flood less than once in two years
  ([7 CFR 657.5](https://www.law.cornell.edu/cfr/text/7/657.5)). With a common
  K of 0.3, that puts the edge of prime land at about 6%, and it is why the
  water's edge is unfit.
- Stony, shallow soil is the land capability "s" subclass, which limits land
  to pasture whatever its slope.
- Orchards take the rolling middle grade because cold air drains off a slope,
  and that drainage is what an orchard is planted on a slope for.
- A 20% slope is 4 m over a 20 m tile, the steepest ground anything is built
  on. The terrain already draws rock beyond it and sand within 3 m of sea
  level. So the Soil lens and the ground's own colours agree about where the
  beach and the rock are.

Soil is a property of the land's shape, so terraforming changes it. Raise a
beach and it stops being a beach.

### Painting farmland

The Agriculture card sits with the other zone cards and is free to paint, like
every zone. While it is in hand, the zoning grid shows only the tiles a farm
could take. A tile can be painted when:

- its soil is somewhat fertile or better, and
- it is reached from a **dirt road**, marching straight out from the road's side
  up to 8 tiles, and stopping at anything that blocks the way: a building,
  water, another road, or ground too steep to build on.

A farm's entrance is on a dirt road and nothing else. Fields can run right up
to the edge of a paved street or a motorway, but only a dirt road gives the land
access. A paved road beside a field still does what it always does: it carries
power, which reaches the farm from the road next to it.

### Growing a farm

A farm needs four things before it starts:

- **A lot of farmable land.** A new farm takes a 4×5-tile lot, every tile zoned
  Agriculture on soil it can farm.
- **A dirt road within three tiles of the lot.** That is where its drive and
  gate are.
- **Power on the lot.** A dirt road carries no power, so a farm on dirt
  roads needs a **power line** run out to it. That is how farms were actually
  electrified: along lines on country roads. A farm beside a paved street takes
  power from the street.
- **Industrial demand.** A farm's jobs are basic jobs, so it grows when the
  industrial bar asks for work.

A farm draws **no city water**: it pumps its own well. A town with farmland
and no water tower still farms.

The grade that at least half the lot's tiles reach decides the farm. Very
fertile land becomes a crop farm, fertile land an orchard, and somewhat fertile
land a pasture farm. Better soil also makes a farm likelier to start: a lot is
as desirable as its soil.

### Farms growing larger

A farm levels up from homestead to family farm to large farm by taking more
land: 5×6 tiles, then 6×7. It grows only onto more Agriculture land that holds
its own grade. A crop farm expands only onto very fertile land, an orchard onto
fertile land or better, and a pasture farm onto anything farmable. Land value
plays no part. High land value is what pushes real farms out, so it would be
the wrong signal. A farm expands only while the industrial bar still asks for
work, since expanding is the town adding basic jobs.

### What the player sees

- **Crop farm:** a farmhouse, a gambrel-roofed barn and a tower silo at the
  gate, and fields in furrowed rows behind. Grain bins join the silo as the farm
  grows.
- **Orchard:** a farmhouse and packing barn, then rows of round-headed fruit
  trees at orchard spacing.
- **Pasture farm:** a farmhouse, a barn and a silo, and a fenced paddock with
  cattle grazing across it.

A farm's drive runs from its farmstead to the dirt road. A working farm has a
pickup that does the rounds of its yard through the day, out behind the barn,
past the silos and back along the barn's front. It stops at the silos for a
while, and parks on the drive by the house from sunset to sunrise. At night
the farmhouse lights its windows, as every lived-in house in town does.

Like every grown building, a farm without power sits dark and says why in the
info panel and the Advisor. After three growth passes cut off it is abandoned: its fields go
fallow and its herd is gone.

## What it interacts with

- **Demand.** A farm's jobs are industrial jobs: they count towards the basic
  jobs the town lives by and towards the shops those jobs support. The
  industrial bar asks for workshops and farms alike. Which one grows is
  whichever the player has zoned, where a lot is ready.
- **Population.** A farmhouse is home to the farm family, four residents,
  the same as a small house. On a homestead there are more working-age people
  than farm jobs, so a farm town looks for work in town as well. That is true
  of real farm households.
- **Utilities.** A farm needs power and no water. The power rule is the one
  every building follows: power travels along paved roads and power lines, and
  a dirt road carries none.
- **Pollution.** A pasture farm gives off a little manure smell, emitted as
  pollution at a fifth of a workshop's. Crop farms and orchards emit nothing.
- **The Advisor.** A farm is a building like any other, so a dark farm is
  reported the way a dark house is. A farm cut off from its dirt road reads
  "no road".
- **Trees.** Wild trees give way to a farm's lot, as they do to any building.

## Tuning

Every figure is sourced. A 20 m tile is 0.0988 acres, and the whole map is
about 6,500 acres. The median US farm is 72 acres
([AFBF from the 2022 Census](https://www.fb.org/intel/markets/small-family-farms-the-roots-of-american-agriculture)),
about 730 tiles. A farm drawn at full size would cover a tenth of the map.

A farm lot therefore draws its farmstead and the fields nearest it, and stands
for the whole farm. Its jobs and its herd are the whole farm's. This is the one
stated override: the lot is compressed, and the figures are not. A farmstead
alone averages about 2.9 acres. That is the 6 million acres of farmsteads and
farm roads the ERS counts, divided among 2.04 million farms
([ERS major land uses](https://www.ers.usda.gov/amber-waves/2024/december/ers-data-series-tracks-major-uses-of-u-s-land-with-a-focus-on-agriculture)).
It is about 30 tiles, so even the 4×5 lot is smaller than the real farmstead.

Jobs are the farm's annual labour hours divided by 2,000 hours a full-time job,
rounded, and never below one:

| Farm    | Level 1 (homestead)                | Level 2 (family farm)             | Level 3 (large farm)               |
| ------- | ---------------------------------- | --------------------------------- | ---------------------------------- |
| Crops   | 160 ac × 6.0 h = 960 h → **1 job** | 463 ac × 6.0 h = 2,778 h → **2**  | 1,500 ac × 2.3 h = 3,450 h → **2** |
| Orchard | 10 ac × 126 h = 1,260 h → **1**    | 25 ac × 126 h = 3,150 h → **2**   | 60 ac × 126 h = 7,560 h → **4**    |
| Pasture | 50 cows × 39 h = 1,950 h → **1**   | 100 cows × 39 h = 3,900 h → **2** | 250 cows × 39 h = 9,750 h → **5**  |

Sources for the table:

- **Crop hours.** 6.0 hours an acre on crop farms under 500 acres, and 2.3 on
  farms of 1,000–2,000 acres
  ([farmdoc daily, FINBIN 2007–24](https://farmdocdaily.illinois.edu/2026/01/labor-standards.html)).
- **Crop acreages.** 160 acres is the Homestead Act's quarter section, and 463
  acres is the average farm in the 2022 Census
  ([NASS](https://www.nass.usda.gov/Newsroom/2024/02-13-2024.php)).
- **Orchard hours.** The apple harvest alone is 126 hours an acre
  ([UC Davis, Rural Migration News](https://migration.ucdavis.edu/rmn/blog/post/?id=2497)).
  Pruning and thinning are left out, so orchard jobs are a floor.
- **Pasture hours.** The pasture farm is a dairy at 39 hours a cow a year
  ([FINBIN labour estimates](https://www.cffm.umn.edu/finpackkb/finpack-knowledge-base-general/labor-hour-estimates/)).
  That agrees with New York's 44 cows per worker on herds under 650
  ([Cornell DFBS 2025](https://www.northeastalliance.com/neafanews/2026/8/25/2025-trends-in-production-and-financial-performance-of-ny-dairy-farms-participating-in-the-dairy-farm-business-summary-and-analysis-program)).

Row crops employ almost nobody per acre, and that is the published truth: a
large crop farm adds output, not jobs. Dairy is the labour-hungry farm.

Everything else:

- **Residents.** Four, one farm household, at every level.
- **Power.** A farmstead draws what a small house does and more for its barn:
  - crops 0.2, 0.3 and 0.4 MW;
  - orchard 0.2, 0.3 and 0.5 MW (cold storage);
  - pasture 0.3, 0.6 and 1.5 MW, for milking and milk cooling, which scale
    with the herd.

  These are game-scale figures, set against the small house's 0.1 MW the way
  every building's are.

- **Water.** 0 for every farm.
- **Pollution.** Pasture 12 (a fifth of the workshop's 60); crops and orchards 0.
- **Drawn stock.**
  - **Orchard trees.** Semi-dwarf apples at 16 ft in the row and 20 ft between
    rows, 4.9 m × 6.1 m
    ([eXtension](https://apples.extension.org/understanding-apple-tree-size-dwarf-semi-dwarf-and-standard/)).
  - **Silos.** 6 m across and 16 m tall; concrete stave silos run 4.9–7.3 m
    by 12–21 m ([Oak Point](https://www.oakpointagronomics.com/tower-silos/)).
  - **Grain bins.** 5.5 m across, eaves at 4 m
    ([Brock](https://www.brockgrain.com/brock-product/on-farm-grain-bins/)).
  - **Barn.** 11 m wide, the width of a Wisconsin dairy barn
    ([Camavision](https://www.camavision.com/barns-a-historical-overview-fall-winter-2016-newsletter/)).
  - **Crop rows.** Drawn at 30 inches (0.76 m), the spacing of 86% of US corn
    ([Iowa State](https://crops.extension.iastate.edu/encyclopedia/row-spacing-corn)).
    They are banded in fours so they hold still at the default camera.
  - **Farmhouse windows.** 36 × 60 inches (0.91 × 1.52 m), the commonest
    double-hung window
    ([Thompson Creek](https://www.thompsoncreek.com/blog/double-hung-window-sizes/)),
    with sills at 0.9 m, inside the 44-inch limit for a bedroom window
    ([Today's Homeowner](https://todayshomeowner.com/windows/guides/standard-window-sizes/)).
    Eight windows: two in front, two behind, one in each gable end at ground
    level, and one high in each gable for the half storey.
  - **The farm truck.** A full-size regular-cab pickup, 5.31 × 2.03 × 1.91 m,
    the Ford F-150 with its standard bed
    ([dimensions.com](https://www.dimensions.com/element/ford-f150-regular-cab-standard-bed-p702-14th-gen)).
    It drives the yard at 15 km/h, a speed for a yard with people and stock
    in it, and works sunrise to sunset on the game's clock, 06:00 to 18:00.
- **Access and depth.** 8 tiles of painting depth from a dirt road. A farm needs
  a dirt road within 3 tiles of its lot, the same reach every other lot has to a
  street.

## What it is not

- Not a harvest: there is no crop yield, season, harvest or market price.
  Weather and seasons do not exist in the sim.
- Not a supply chain: farms ship nothing to factories and nothing is trucked
  anywhere. The farm truck is drawn, not simulated: it carries nothing and
  never leaves its own yard.
- Not a soil you can improve: no irrigation, fertiliser or drainage tools.
  Terraforming is the only thing that changes soil.
- Not a ploppable: there are no farm buildings to place by hand.
