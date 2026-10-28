# Transport depots — derivations and sources

The research behind [the spec](../specs/transport-depots.md): every figure derives from a published operating standard and our own scale — 20 m tiles, a 10 m bus, a 14 m rail car, a 4.1 m clear overhead ([art](../art/README.md)).

## Round-trip time, and the headway it buys

1. Route length in tiles × 20 m is the one-way length; a line runs out and back, so the round trip is twice that.
2. A bus or a tram covers it at **20 km/h**, the published average commercial speed of urban bus service; a train at **48 km/h**, the game's own for a commuter service with stops a few tiles apart. Plus **15%** terminal layover, the middle of the published 10–20% recovery allowance.
3. Headway is that cycle divided by the vehicles in service.

At this map's scale a line is short, so a small allocation buys a frequency that would be extravagant in a real city. The scarcity the player feels is across lines, not within one: a ten-bus depot runs one long line beautifully or five short ones adequately. The bus was not slowed to make a single line feel tight.

## What a line asks for

The larger of two derived numbers:

- **Frequency:** the fleet that buys a 10-minute headway, the conventional threshold at which riders stop consulting a timetable and turn up: `ceil(cycle ÷ 10)`.
- **Capacity:** the fleet that carries the peak. Ridership is declared to be **daily boardings**; peak-hour boardings are **10% of daily**, the standard urban planning share. A bus carries **48** and a tram set **150**, the figures the road model derives its bus-lane and tram-track throughputs from; a three-car train set carries **450**, three bilevel coaches at 136–162 seats each ([Bombardier BiLevel](https://en.wikipedia.org/wiki/Bombardier_BiLevel_Coach)). So `ceil(peak × cycle_hours ÷ capacity)`.

Worked: a line drawing 6,000 daily boardings over a 150-tile route has a 600-rider peak hour and a 0.345-hour cycle, so capacity asks for `600 × 0.345 ÷ 48` = 4.3 → **5 buses**, against frequency's 3. It runs five, at a 4.1-minute headway.

A 60-tile line has an 8.3-minute cycle, so two buses buy a 4-minute headway. The 5.12 km map at 20 km/h puts the worst dead run at 15 minutes each way.

## Depot sizes, from the vehicles inside them

**Bus depot, 10 buses.** A bus is 10.0 m × 2.5 m and 3.0 m tall. Published bus parking puts a 12.2 m bus in a 13.7 m × 3.66 m stall (1.5 m longitudinal and 1.07 m lateral clearance), so our 10 m bus takes an **11.5 m × 3.6 m stall**, with the published **12.2 m aisle** for 90° bus stalls between facing rows. The 7.3 m aisle in [civic massing](../art/civic-massing/README.md) is a car figure; a bus needs its own length to swing. Maintenance runs at **one bay per ten buses**, the lean end of transit facility planning (one per fifteen is the common figure, [Walker](https://walkerconsultants.com/planning-beyond-the-route-addressing-transit-planning-maintenance-constraints/); Washington's streetcar plans one per nine, [DDOT](https://ddot.dc.gov/sites/default/files/dc/sites/ddot/publication/attachments/dctf_4_p45-p54.pdf)), and a bay is our own 4.9 m × 18.3 m drive-through figure. One fuelling position turns a bus round in five minutes, so over a six-hour overnight window it serves 72; one is always enough. A wash lane at three minutes serves 120. Staffing is **2.5 operators per peak vehicle** plus a fitter per eight, about a third of them on site at once, at the 13.9 m² business occupancy factor.

Two rows of five about one aisle is 18.0 × 35.2 m = 634 m² of apron, plus a 7.2 × 20 m drive (144 m²): 778 m² of open ground, or 1.95 tiles at the full 400 m² a tile of open yard holds. Covered: one maintenance bay, one fuelling position, one wash lane (270 m²) and 125 m² of office = 395 m², which at 185 m² per tile of body over one level is 2.14 tiles. **4.09 tiles → a 2×2**, and the 40 m square holds a 35.2 m apron entered from the side. The floor-area arithmetic alone gives a 1.7 m building, shorter than the bus inside it, so the clearance rule overrides: a 4.1 m clear bay door plus 1.3 m of roof over the 14.7 m three-bay span gives **5.5 m**. Built examples agree on the order: 246 buses on 4.4 acres at San Francisco's four-storey Potrero yard ([SFMTA](https://www.sfmta.com/node/22330)), 200 on 10 at Minneapolis's Heywood II ([Metro Transit](https://metrocouncil.org/Council-Meetings/Committees/Metropolitan-Council/2017/9-13-17/0913_2017_133.aspx)); ten on 0.4 acres sits between them.

**Central Bus Garage, 36 buses.** A second double row sets its size: two rows of stalls with their aisles are 70.4 m deep and nothing shorter holds them. Four rows of nine is 32.4 × 70.4 m = 2,281 m² of apron; four maintenance bays, two fuelling positions, one wash and a two-storey office for 32 on site give 4.59 tiles of body against 6.15 of yard, **10.74 → a 3×4**. The office is taller than the hall, so **6.4 m**.

**Tram depot, 8 sets.** A set is two 11 m cars and a 0.4 m coupling, **22.4 m**, stabled on roads at our own 3.5 m tram lane spacing, reached through a 20 m depot turnout lead. Eight roads is 28.0 m wide × 42.4 m deep = 1,187 m² of open track, 2.97 tiles. Covered: one maintenance road (22.4 m plus 3 m of working room each end, 4.9 m wide), one wash road and 97 m² of office = 375 m² = 2.03 tiles. **5.0 tiles, and a 42.4 m depth will not fit in 40 m → a 2×3**, the rail station's footprint for the rail station's reason. Height is set by the wire: 4.6 m minimum contact-wire clearance plus 0.95 m of roof over the 9.8 m span, rounded up to **6.0 m**. There is no fuelling position, because a tram takes its current from the wire. Oklahoma City stables six cars, growing to twelve, on 2.7 acres ([OKC](https://okc.gov/home/showdocument?id=4542)) and Kansas City four on two ([KC Streetcar](https://kcstreetcar.org/the-singleton-yard-goes-vertical/)); eight on 0.6 acres is the dense end, which a 20 m tile is.

**Rail yard, 5 sets.** Three 14 m cars at a 15.2 m pitch = **45.6 m**, stabled on roads at a 4.5 m track spacing, reached through a 20 m turnout lead off the main line, so the yard lies along the railway. Five roads is 22.5 m wide × 65.6 m deep = 1,476 m² of open track, 3.7 tiles; covered: one maintenance road (45.6 m plus 3 m each end, 6 m wide), one wash road and 125 m² of office = 737 m² = 4.0 tiles; a 7.2 × 20 m drive, 0.36. **8.1 tiles, and a 65.6 m depth needs 80 m → a 3×4, the long side on the railway.** A diesel set needs a fuelling position and no wire: a 4.6 m clear shop door under 1.4 m of roof over the 12 m two-road span gives **6.0 m**. Caltrain keeps about a hundred cars on 20 acres ([CEMOF](https://www.caltrain.com/projects/central-equipment-maintenance-facility-cemof)) and Denver 80 on 30 ([RTD](https://www.rtd-denver.com/projects/commuter-rail-maintenance-facility)); fifteen on 1.2 acres is, again, the tile's density.

## Money

Prices follow the civic rule the player set for the stations and death care: the real cost against the fire station's $8M at ¢4,500, so ¢1 is about $1,780. A bus base costs **$0.53M a bus** (Heywood II, $106M for 200); a streetcar depot **$0.9M a car** (Oklahoma City's $5.4M for six); a rail yard **$1.4M a car** (Caltrain's $140M for about a hundred). Monthly upkeep holds the catalog's established 6–8% of build cost for the building: premises and nothing else.

| Building           | Capital                | Price   | Upkeep |
| ------------------ | ---------------------- | ------- | ------ |
| Bus Depot          | 10 × $0.53M = $5.3M    | ¢3,000  | ¢200   |
| Central Bus Garage | 36 × $0.53M = $19.1M   | ¢10,700 | ¢700   |
| Tram Depot         | 8 × $0.9M = $7.2M      | ¢4,050  | ¢280   |
| Rail Yard          | 15 cars × $1.4M = $21M | ¢11,800 | ¢800   |

The ladder lives in the per-vehicle figure: ¢200 ÷ 10 is ¢20 per bus of capacity, ¢700 ÷ 36 is ¢19; the garage is cheaper per bus to keep, which is the reason to build it, and smaller than the draft's 17% because the price is now the real one.

## Running cost per vehicle in service

Agencies report operating cost per revenue hour: a bus about **$200** (the 2023 profiles run $149 at North County to $275 at MTA Bus, [NTD](https://www.transit.dot.gov/sites/fta.dot.gov/files/transit_agency_profile_doc/2023/90030.pdf), [NTD](https://www.transit.dot.gov/sites/fta.dot.gov/files/transit_agency_profile_doc/2023/20188.pdf)), a commuter train **$702** a train-hour (North County, the same source), a streetcar **$350**, the game's own between them where no figure was found. At twelve revenue hours a day:

| Vehicle   | A month's running | Charged |
| --------- | ----------------- | ------- |
| Bus       | $72,000           | ¢40     |
| Tram set  | $126,000          | ¢70     |
| Train set | $253,000          | ¢142    |

The NTD figure is the whole of operations, maintenance included, so the depot's upkeep is premises only and the two do not count a fitter twice. A Metropolis running ten bus lines at six buses pays ¢2,400 a month for them, about a hospital and a half.

## What the depots draw

By the method of [municipal services](../specs/municipal-services.md): the covered floor derived above at the transport terminal's 8.4 kWh a square foot a year and the office's 14.5 gallons, the categories the rail station already uses; the bus wash's water is reclaimed and not counted.

| Building           | Covered floor    | Power  | Water a day |
| ------------------ | ---------------- | ------ | ----------- |
| Bus Depot          | 395 m², 4,250 sf | 4.1 kW | 0.6 kL      |
| Central Bus Garage | 849 m², 9,140 sf | 8.8 kW | 1.4 kL      |
| Tram Depot         | 375 m², 4,040 sf | 3.9 kW | 0.6 kL      |
| Rail Yard          | 737 m², 7,930 sf | 7.6 kW | 1.2 kL      |

## Dead-run arithmetic

A dead run of `d` minutes each way over an 18-hour service span costs `2d / (60 × 18)` of a vehicle's availability. Across the 5.12 km map at 20 km/h the worst case is 15 minutes each way, or **2.8% of a fleet, one vehicle in thirty-six**. The fleet effect at this map size is small, so moving a depot two tiles closer buys nothing; if it wants more weight the lever is the service span, not a fudge on the availability term.

A visual hour is a hundred ticks, five seconds at normal speed, and a bus drives at its commercial 5.56 m/s in real seconds, so a 15-tile pull-out leaving at 05:00 is still on the road at 06:00 and a 23:00 pull-in can still be driving at 03:00.

## Looked at in a browser

1. A 2×2 bus depot from the street at the default pitch: the bay doors identify it, and a bus at a door is visibly shorter than the door.
2. The same depot part-allocated (apron buses equal capacity minus vehicles in service, countable) and the 3×4 garage beside it.
3. A tram depot on tram track, sets stabled on parallel roads, one pulling out; a rail yard along the railway with its sets on the ladder.
4. Dead-running buses between a depot and a line's first stop: they drive there, not appear at it.
5. A before/after pair of the same line at the same camera, old cosmetic speed against the commercial speed, beside ordinary traffic.
6. Two consecutive buses on one line, timed against the stated headway.

Shots: `tools/depot-shots.mjs`.
