# Airports

- **Status:** Proposed

**Owns:** the three airports' plots, runways, safety areas, taxiways, aprons, terminals, paint, prices and unlocks.

**Rules:**

- Size every airport from its FAA design group. The runway, its safety area and its object free area all lie inside the plot; never shrink one to fit.
- Lay the plot in strips parallel to the runway: object free area, runway, taxiway, apron, buildings, car park. The car park's edge fronts the street. `[R-world-050]`
- Keep the safety area and the object free area clear: grass only, with no building, tree, fence, lamp or parked aircraft.
- Paint a runway white and a taxiway yellow, with the markings its approach category requires and no more.
- Park aircraft on stands and tie-downs only, nose to the building line, clear of every taxiway's object line.
- Level the whole plot to one height, and refuse it where a tile is steep or wet, as any building is refused.
- Keep the old `airport` entry loadable and drawn as it was, and take it out of the drawer.

**Numbers:** lengths in metres; the rest are in [Dimensions and paint](#dimensions-and-paint).

| Quantity               | Airfield      | Regional           | International           | Source                                          |
| ---------------------- | ------------- | ------------------ | ----------------------- | ----------------------------------------------- |
| Catalog id             | `airfield`    | `regional-airport` | `international-airport` | new entries                                     |
| Design group           | A/B-I small   | C-III              | D-V                     | AC 150/5300-13B Tables 1-1, 1-2                 |
| Runway, long × wide    | 823 × 18.3    | 1,524 × 30.5       | 3,048 × 45.7            | [sources](../sources/airports.md#runway-length) |
| Safety area width      | 36.6          | 152.4              | 152.4                   | 13B Appendix G (G-1, G-9, G-11)                 |
| Object free area width | 76.2          | 243.8              | 243.8                   | same                                            |
| Both, beyond each end  | 73.2          | 304.8              | 304.8                   | same                                            |
| Plot, tiles            | 49 × 9        | 107 × 23           | 183 × 33                | [sources](../sources/airports.md#plots)         |
| Cost; upkeep           | 2,400; 100    | 18,000; 750        | 60,000; 2,500           | [sources](../sources/airports.md#price)         |
| Unlocks at             | Busy Township | Small City         | Metropolis              | dial                                            |

**Code:** planned, none built. `src/shared/airportlayout.ts` (one layout a rung, in the plot's frame), `src/render/landmarks.ts` `LandmarkRenderer` (draws it), `src/data/catalog.json` (three entries; `airport` stays), `src/shared/civicaccess.ts` (the drive on the car park's edge).

**Tests:** planned. A layout test a rung measures every figure here and finds only grass in the clear areas; a contract test pins each entry and the old `airport`; a placement test places, undoes and bulldozes the largest plot inside the frame budget.

**Open:**

- An airport carries no passengers or freight in the simulation: it draws power and water and makes noise.
- Runway and taxiway lights are not specified: their standard (AC 150/5340-30) is not held.
- A wide-body's length is not in the held circulars, so a stand's depth is the game's own 76 m.
- A runway's cost is not sourced, so the price counts the terminal only.

## Dimensions and paint

| Quantity                            | Airfield     | Regional      | International              | Source                                                  |
| ----------------------------------- | ------------ | ------------- | -------------------------- | ------------------------------------------------------- |
| Shoulder                            | 3.0          | 6.1           | 10.7                       | 13B Appendix G                                          |
| Blast pad, wide × long              | none         | 42.7 × 61.0   | 67.1 × 121.9               | same                                                    |
| Runway centre to taxiway centre     | 45.7         | 121.9         | 121.9                      | same                                                    |
| Holding position from runway centre | 38.1         | 76.2          | 76.2                       | same                                                    |
| Taxiway width                       | 7.6          | 15.2          | 22.9                       | 13B Table 4-2 (TDG 1, 3, 5)                             |
| Taxiway centre to a fixed object    | 13.6         | 26.1          | 43.4                       | 13B Table 4-1                                           |
| Clearance between parked aircraft   | 3.0          | 7.6           | 7.6                        | 13B Table 5-1                                           |
| Widest wingspan on a stand          | 14.9         | 36.0          | 65.2                       | 13B Table 1-2, the group's upper bound                  |
| Approach category for paint         | visual       | non-precision | precision                  | AC 150/5340-1M Table 2-1                                |
| Threshold stripes                   | none         | 8             | 12                         | 5340-1M Table 2-2                                       |
| Terminal floor, m²                  | 150          | 11,600        | 38,800                     | [sources](../sources/airports.md#terminal-and-car-park) |
| Passengers a year                   | none         | 1.2 million   | 4 million                  | same                                                    |
| Car park spaces                     | 20           | 1,200         | 4,000                      | same                                                    |
| Aircraft positions                  | 20 tie-downs | 4 stands      | 2 wide and 4 narrow stands | [sources](../sources/airports.md#aircraft-positions)    |
| Power kW; water kL                  | 1.5; 0.5     | 120; 52       | 400; 175                   | [municipal services](../sources/municipal-services.md)  |
| Noise; pollution                    | 60; 5        | 120; 15       | 160; 30                    | dial; the last is the old airport's                     |

Paint, from AC 150/5340-1M:

| Marking              | Size                                                                       | Chapter      |
| -------------------- | -------------------------------------------------------------------------- | ------------ |
| Designation numerals | 18.3 tall, white, read from the approach                                   | 2            |
| Centreline           | 36.6 stripe, 24.4 gap; 0.3, 0.45 or 0.9 wide by category                   | 2            |
| Threshold stripes    | 45.7 long, 1.75 wide, from 6.1 past the threshold                          | 2, Table 2-2 |
| Aiming point         | 45.7 long, on a runway of 1,280 or longer                                  | 2            |
| Touchdown zone       | bar groups of 3, 2 and 1 at 152 steps, precision only                      | 2            |
| Side stripes         | 0.9 wide, precision only                                                   | 2            |
| Taxiway centreline   | 0.15 wide, yellow                                                          | 4            |
| Holding position     | two solid and two broken yellow lines, 0.3 each, solid on the holding side | 3, Pattern A |

## Why the rules are what they are

### Why the plots are this large

A real runway is long, and most of an airport is the empty ground the standard keeps round it. The international's plot is 3.66 km of the map's 5.12 km. Shortening it would draw an airport no wide-body could use, which is the fault this spec replaces.

The safety area and the object free area are part of the plot because nothing else may stand in them. Left outside, the player would build homes under the approach.

### Why three rungs

Each rung is one design group. An airfield serves light aircraft by sight. A regional airport takes turboprop airliners and regional jets on 1,524 m, the least the runway-length circular gives aircraft over 12,500 lb. An international takes wide-bodies on 3,048 m.

### Why strips

Every separation in the standard is a distance from the runway's centreline. Strips parallel to the runway turn each one into a line across the plot, so a test can measure it.

The far side holds half the object free area and nothing else. The near side holds, in order, the taxiway, the apron, the buildings and the car park, so passengers reach the street without crossing aircraft.

### Why the paint differs by rung

The marking circular ties paint to the approach a runway supports. A visual runway has numerals and a centreline. A non-precision runway adds threshold stripes and an aiming point. A precision runway adds touchdown zone bars and side stripes.

Numerals come from the runway's heading on the map with north up: 09 and 27 east to west, 18 and 36 north to south.

### Why the terminal and the car park are these sizes

The international keeps the terminal the old airport was given: 38,800 m² for four million passengers a year, on two floors. The regional takes the terminal that figure was derived from, 11,600 m² for 1.2 million. The airfield has a pilots' building and no airline.

A car park holds 2,000 spaces for each million passengers who start their journey here, the low end of the surveyed range.

### Why the price counts the terminal only

No published cost for a runway was found. Terminal costs were, so each rung is priced from its terminal's floor against the old airport's ₵60,000.

### What happens to the old airport

A save holds a building by its catalog id and its corner. Changing the old entry's footprint would move every saved airport's tiles. It stays as it is, drawn as it was, and can no longer be bought.

### Level ground

A runway's grade is at most 2% for the airfield's group and 1.5% for the larger two (AC 150/5300-13B, figures 3-31 and 3-32). The plot is levelled to one height, as every ploppable is. On a slope the fill shows the footing wall of `[R-render-034]`, which stays open.

## Decided

- True length over a runway scaled to the map: a short runway is the unrealistic airport the player asked to replace.
- One plot a rung over a runway tool the player draws: the separations are fixed by the standard, so there is nothing for the player to draw.
- The regional's 1,524 m over a 2,134 m jet runway: it is the circular's stated figure, and the plot stays under half the map.
- The international unlocks at Metropolis over Grand City: a plot of 6,039 tiles needs a city that can spare them.
- Terminal-only pricing over a guessed runway cost.
