# Parking to code — sources and audit

Tier 3 appendix to [the spec](../specs/parking-to-code.md). It holds the code survey behind each figure and the audit tables measured on the layout.

## The requirement: where the rates come from

The rates are the modal minimums in US municipal codes: St Charles MO, Wadsworth OH, Stacy MN, Canby OR, North Reading MA, Columbus IN and Medfield MA. For example [Wadsworth OH chapter 25](https://www.zoneomics.com/code/wadsworth-OH/chapter_25).

| Kind                                                             | Spaces per 1,000 sq ft of floor | Loading table |
| ---------------------------------------------------------------- | ------------------------------- | ------------- |
| Shop, strip, supermarket                                         | 5                               | retail        |
| Restaurant                                                       | 10                              | retail        |
| Filling station (its kiosk; pumps earn none)                     | 5                               | retail        |
| Office (downtown, exempt; for reference)                         | 3                               | none          |
| Workshop, factory, food, chemical, metals, paper (manufacturing) | 1                               | industrial    |
| Warehouse                                                        | 0.5                             | industrial    |
| Flex (half office at 3, half warehouse at 1)                     | 2                               | industrial    |

A lot's floor is its body's plate times its storeys. The plate is the massing rule's, 13.6 m a lot tile or the kind's own. The storeys are one per 3.2 m for a shop or flex space and one high-bay floor for every other works ([building-types.md](../specs/building-types.md)). Spaces round up.

### The small-use exemption

A single-tenant shop or restaurant owes no space for the first 3,000 sq ft of its floor. 3,000 is the median of thirteen codes surveyed, which range from 1,500 to 10,000. The four named are Baltimore 16-601(c), which excludes multi-tenant buildings; Spokane SMC 17C.230.130 as of 2015; Hampton VA; and New Orleans CZO 22.5.A, which excludes shopping centres. A strip and a supermarket are the multi-tenant and shopping-centre configurations those codes leave out, and industry has no such exemption, so neither gets one. The corner shop (1,991 sq ft) owes nothing and keeps growing on a strip one tile deep. The fast-food stand (3,513 sq ft) owes 6.

### The kerb credit

Every stall the street paints on the lot's own side counts one for one, whatever the lane style, with no cap. Codes that allow it: Bakersfield [§17.58.100](https://bakersfield.municipal.codes/Code/17.58.100), [Schenectady §264-42](https://www.zoneomics.com/code/schenectady-NY/chapter_6), the SmartCode as El Paso, Petaluma and Chico adopt it, and Mukilteo 17B.56. A stall that straddles two lots is decided by its middle, as Hamilton MT and Bloomington IN apportion one.

### Accessible spaces and loading

Accessible spaces follow ADA 2010 §208.2: one per 25 to 100 spaces, one per 50 to 200, one per 100 to 500. One in six is a van space (§208.2.4). A car space is 96 in (2.44 m) and a van space 132 in (3.35 m), each beside a 60 in (1.52 m) access aisle ([US Access Board](https://www.access-board.gov/ada/guides/chapter-5-parking/)).

Loading berths are 12 × 50 ft (3.66 × 15.24 m) with 14 ft (4.27 m) clear, by floor, on Wadsworth OH's tables.

- Retail, grocery and restaurant: none to 5,000 sq ft, one to 20,000, two to 40,000, three to 100,000.
- Industry: one from 5,001 to 30,000 sq ft, two to 80,000, three to 175,000.

### Planting

A planted island at least 5 ft wide at every row end and after every ten spaces in a row ([Tyler TX](https://codelibrary.amlegal.com/codes/tyler/latest/tyler_tx/0-0-0-81565)). One tree for every ten spaces or part of ten (Moses Lake WA, Chardon OH, Raleigh NC).

The planting rules give islands of 2–11% of the paved car park, drive and aisles included. The codes' separate 5–10% interior-landscaping minimum (Chardon 5, Redmond 5–7, Forest Grove 8, Defiance 10) is not applied on top, and the interior share stays short of it.

### The module

A stall is 9 × 18 ft (2.74 × 5.49 m) at 90°, on a two-way 24 ft (7.32 m) aisle. The ULI double-loaded module of stall, aisle, stall is 60 ft (18.3 m), and a single row on its aisle 42 ft (12.8 m) ([Forest Lake MN](https://codelibrary.amlegal.com/codes/forestlake/latest/forestlake_mn/0-0-0-40825)). One curb cut, 24 ft wide, sits inside the 24–36 ft (7.3–11 m) codes allow for a two-way driveway.

The entrance walk is 8 ft (2.44 m) deep along the body's street face, and 8 ft wide from the street to the door. The large-retail design standards walk along a facade with a customer entrance and from the public sidewalk to it (Fort Collins Land Use Code 3.5.4, widely copied).

## The audit: which kinds fit

Measured on the layout itself, with each kind's catalog width along the street, every level, on its own lot with no kerb credit. The shop and restaurant are measured after the small-use exemption.

| Kind        | L   | Lot           | Floor                | Spaces       | Accessible | Berths    | Laid | Fit / short |
| ----------- | --- | ------------- | -------------------- | ------------ | ---------- | --------- | ---- | ----------- |
| shop        | 1   | 1×1           | 185 m² (1,991 sf)    | 0            | —          | 0         | 0    | fits        |
| shop        | 2   | 1×2           | 370 m² (3,982 sf)    | 5            | 1          | 0         | 3    | −2          |
| shop        | 3   | 2×2           | 740 m² (7,964 sf)    | 25           | 1          | 1         | 15   | −10         |
| restaurant  | 1   | 1×2           | 326 m² (3,513 sf)    | 6            | 1          | 0         | 4    | −2          |
| restaurant  | 2   | 2×2           | 576 m² (6,200 sf)    | 33           | 1          | 1         | 15   | −18         |
| restaurant  | 3   | 3×2           | 1,152 m² (12,400 sf) | 95           | 2          | 1         | 42   | −53         |
| fuel        | 1   | 2×2           | 196 m² (2,110 sf)    | 11           | 1          | 0         | 11   | fits        |
| fuel        | 2   | 3×2           | 224 m² (2,411 sf)    | 13           | 1          | 0         | 13   | fits        |
| fuel        | 3   | 3×3           | 256 m² (2,756 sf)    | 14           | 1          | 0         | 14   | fits        |
| strip       | 1   | 3×2           | 1,110 m² (11,945 sf) | 60           | 1          | 1         | 25   | −35         |
| strip       | 2   | 4×2           | 1,480 m² (15,927 sf) | 80           | 2          | 1         | 37   | −43         |
| strip       | 3   | 5×2           | 1,850 m² (19,909 sf) | 100          | 2          | 1         | 50   | −50         |
| supermarket | 1   | 3×3           | 1,665 m² (17,918 sf) | 90           | 2          | 1         | 47   | −43         |
| supermarket | 2   | 4×3           | 2,220 m² (23,891 sf) | 120          | 3          | 2         | 63   | −57         |
| supermarket | 3   | 5×4           | 3,699 m² (39,818 sf) | 200          | 5          | 2         | 102  | −98         |
| workshop    | 1–3 | 2×2, 3×2, 3×3 | 740–1,665 m²         | 8 / 12 / 18  | 1          | 1         | all  | fits        |
| warehouse   | 1–3 | 3×3, 4×3, 5×4 | 1,665–3,699 m²       | 9 / 12 / 20  | 1          | 1 / 1 / 2 | all  | fits        |
| factory     | 1–3 | 2×3, 3×3, 4×3 | 1,110–2,220 m²       | 12 / 18 / 24 | 1          | 1         | all  | fits        |
| flex        | 1   | 2×2           | 968 m² (10,420 sf)   | 21           | 1          | 1         | 15   | −6          |
| flex        | 2   | 3×2           | 1,452 m² (15,629 sf) | 32           | 2          | 1         | 32   | fits        |
| flex        | 3   | 3×4           | 4,356 m² (46,888 sf) | 94           | 4          | 2         | 79   | −15         |
| food plant  | 1–3 | 3×3, 4×3, 5×4 | 1,665–3,699 m²       | 18 / 24 / 40 | 1 / 1 / 2  | 1 / 1 / 2 | all  | fits        |
| chemical    | 1–3 | 3×3, 4×4, 5×4 | 900–2,000 m²         | 10 / 18 / 22 | 1          | 1         | all  | fits        |
| steelworks  | 1–3 | 3×3, 4×3, 5×3 | 1,665–2,774 m²       | 18 / 24 / 30 | 1 / 1 / 2  | 1         | all  | fits        |
| paper mill  | 1–3 | 3×3, 4×4, 5×4 | 1,665–3,699 m²       | 18 / 32 / 40 | 1 / 2 / 2  | 1 / 2 / 2 | all  | fits        |

The fuel station and seven of the eight works fit at every level. The four retail kinds fall short on their own lots at every level but the corner shop's, and so does flex at its first and third. An area count (about 30 m² a space all in) said flex fits. Laid out in 60 ft modules with its berths and islands it does not: a 22 m body on a 40 m lot leaves 18 m in front, 0.3 m short of a module. Flex at its second level fits only with its long side on the street. The corner shop owes nothing, draws no car park and its customers use the kerb.

## The planted share

Measured on the layout, on the lot that holds the whole code with no kerb credit (a short kind's larger lot), with its catalog width on the street. The share of the lot left planted counts the islands and excludes the body, its walks and all paving.

| Kind        | L1  | L2  | L3  |
| ----------- | --- | --- | --- |
| shop        | 45% | 60% | 24% |
| restaurant  | 60% | 23% | 24% |
| fuel        | 43% | 54% | 59% |
| strip       | 21% | 12% | 9%  |
| supermarket | 26% | 13% | 12% |
| workshop    | 9%  | 23% | 25% |
| warehouse   | 33% | 36% | 35% |
| factory     | 22% | 25% | 23% |
| flex        | 28% | 12% | 23% |
| food plant  | 25% | 23% | 29% |
| chemical    | 47% | 48% | 50% |
| steelworks  | 25% | 23% | 24% |
| paper mill  | 16% | 19% | 21% |

Kerb credit plants more: with the whole code at the kerb a lot keeps 27–80% planted. That is lot landscaping, not the interior planting the 5–10% asks for, and is not counted toward it.

## Larger lots

Each ladder grows the frontage a lot at a time, at the kind's own depth, up to the first lot that holds the whole code with no kerb credit at every turn and frontage. The credit each lot still needs is what a street must paint along it: a parallel lane paints about three stalls a tile, an angled one about seven, a head-in one about eight, mid-block.

| Kind        | L | Own lot (credit it needs)                              | Larger lots (credit each needs)  |
| ----------- | - | ------------------------------------------------------ | -------------------------------- |
| shop        | 2 | 1×2 (2)                                                | 2×2 (0)                          |
| shop        | 3 | 2×2 (10)                                               | 3×2 (0)                          |
| restaurant  | 1 | 1×2 (2)                                                | 2×2 (0)                          |
| restaurant  | 2 | 2×2 (18)                                               | 3×2 (0)                          |
| restaurant  | 3 | 3×2 (53)                                               | 4×2 (26), 5×2 (1), 6×2 (0)      |
| strip       | 1 | 3×2 (35)                                               | 4×2 (9), 5×2 (0)                 |
| strip       | 2 | 4×2 (43)                                               | 5×2 (16), 6×2 (0)                |
| strip       | 3 | 5×2 (50)                                               | 6×2 (23), 7×2 (0)                |
| supermarket | 1 | 3×3 (43)                                               | 4×3 (2), 5×3 (0)                 |
| supermarket | 2 | 4×3 (57)                                               | 5×3 (15), 6×3 (0)               |
| supermarket | 3 | 5×4 (98)                                               | 6×4 (43), 7×4 (0)                |
| flex        | 1 | 2×2 (6)                                                | 3×2 (0)                          |
| flex        | 2 | 3×2 (0 with its long side on the street, 3 across it)  | 4×2 (0 either way)               |
| flex        | 3 | 3×4 (15)                                               | 4×4 (0)                          |

So a strip on a street painting parallel parking takes four lots, and on a street painting none, five.

## Kinds not covered

Parking maximums, shared-parking reductions and transit-area waivers (Minneapolis 2021, Austin 2023, California AB 2097 near major transit) repeal minimums rather than draw them, so the game does not model them.
