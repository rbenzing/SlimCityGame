# Building types — design

- **Status:** Agreed 2026-10-01; residential kinds built 2026-10-01; commercial kinds built 2026-10-02
- **Date:** 2026-10-01

## What the player gets

A zoned lot grows a **kind** of building, not just a level of one. Paint a
low-density residential street and it fills with detached houses, with the odd
duplex and fourplex where a house would not fit. Row housing comes up as
townhouses two to a lot. Medium density grows multiplexes and courtyard
apartments; high density grows mid-rise slabs and towers on podiums. Each kind
is a real building type with its own lot, massing, population and draw on the
grid, and every figure comes from a published source.

Commercial zones grow the formats a real high street and a real strip have:
corner shops and stores, shopping strips with their car parks in front,
grocers and supermarkets, fast food and restaurants, filling stations under
their canopies; office blocks and towers and hotels at high density. A
business opens only where the town has room for its jobs, so a village gets
a corner shop before a shopping strip. Industry gets the same treatment in
its own change: industry by the kind of business it is, with a separate
heavy-industry zone for the polluters.

## Why it earns its place

Until now every zone had one building per level, so a city of ten thousand
people was the same three houses, three shops and three sheds repeated. The
level ladder gave size without variety, and the variety a real suburb has — a
duplex on the narrow lot, a townhouse row, a courtyard block — was not there to
see.

Pillars served: **you paint zones, you don't place houses** (the zone decides
the density, the lot and the draw decide the building, and the city surprises
you) and **realism grounded in published figures**. See [../gdd.md](../gdd.md).

## How it works, for the player

### A lot picks its building

When growth comes to an empty zoned tile, it lists the kinds its zone can grow
at level 1 that are unlocked at the current milestone **and whose lot fits
there**: buildable, free, and every tile of it zoned the same, so a building
never spills onto the ground beside its zone. It then draws one of
them, weighted by how common that kind of building is in the real housing
stock. The building it picks goes through every check growth has always made:
a street within reach, power and water on the lot, demand, spare supply, and
the desirability draw.

So a wide empty block grows mostly detached houses, because that is most of
the stock; a one-tile sliver beside them, where no house fits, grows a duplex
or a fourplex, because those are the house-scale buildings that fit a narrow
lot. The player never picks a kind. They paint a density and lay out the
blocks, and the shape of the blocks shapes the town.

### A kind is for life

A building keeps its kind through every level-up, as a farm keeps being a crop
farm. A duplex levels up into a better duplex, never into a house or a block.
What a level-up gives depends on the kind: a house-scale building gets a bigger
or better house for the same household; a block gets more storeys and more
homes.

### The residential kinds

| Kind                 | Zone               | From | Weight | Lot (tiles) L1 / L2 / L3 | Storeys       | Homes       | Residents     |
| -------------------- | ------------------ | ---- | ------ | ------------------------ | ------------- | ----------- | ------------- |
| Detached house       | Low density        | M0   | 61.1   | 2×2 / 2×3 / 3×3          | 1 / 2 / 2     | 1           | 3             |
| Duplex               | Low density        | M1   | 1.6    | 1×2 / 1×2 / 2×2          | 2 / 2 / 2.5   | 2           | 5             |
| Fourplex             | Low density        | M1   | 1.2    | 1×2 / 1×2 / 2×2          | 2.5 / 2.5 / 3 | 4           | 9             |
| Townhouse row        | Row housing        | M1   | 1.6    | 1×2 / 1×4 / 1×6          | 2 / 3 / 3.5   | 4 / 8 / 12  | 11 / 21 / 32  |
| Multiplex            | Medium density     | M2   | 0.63   | 2×2 / 2×2 / 2×3          | 2.5 / 3 / 3   | 8 / 10 / 12 | 18 / 23 / 27  |
| Courtyard apartments | Medium density     | M2   | 0.30   | 2×2 / 2×2 / 3×3          | 2 / 3 / 3.5   | 12 / 18 / 24 | 27 / 41 / 54 |
| Mid-rise flats       | High density       | M4   | 0.11   | 2×2 / 2×2 / 3×3          | 5 / 8 / 10    | 35 / 56 / 150 | 79 / 127 / 339 |
| Tower                | High density       | M4   | 0.07   | 2×2 / 2×2 / 3×3          | 12 / 18 / 25  | 84 / 126 / 375 | 190 / 285 / 848 |
| Shopfront flats      | Mixed              | M3   | 1      | 2×2 / 2×2 / 3×3          | 6 / 8 / 9     | 35 / 49 / 120 | 79 / 111 / 271 |

A tile is 20 m, so a 1×2 lot is 800 m² (0.2 acre), a 2×2 lot 1,600 m²
(0.4 acre) and a 3×3 lot 3,600 m² (0.9 acre).

**Where the kinds come from.** The types are the ones the building code and
the housing survey already distinguish. The code puts one- and two-family
houses in one occupancy group (R-3), apartment houses of three or more
dwellings in another (R-2), and calls a building of three or more attached
single-family units a townhouse
([IBC Group R](https://up.codes/s/residential-group-r-2),
[townhouse](https://up.codes/s/townhouse)); a high-rise is any building with
an occupied floor more than 22.9 m up
([IBC high-rise](https://up.codes/s/high-rise-building)). The housing survey
counts units by the size of the structure they are in: one detached, one
attached, 2, 3–4, 5–9, 10–19, 20–49 and 50 or more
([ACS B25024](https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25024&geo_ids=01000US)).
Between the house and the block, the "missing middle" typology names the
house-scale buildings that fit a house lot — the duplex, the fourplex, the
townhouse, the multiplex and the courtyard building — with the lot and
building sizes each one takes
([Opticos, the types](https://missingmiddlehousing.com/the-types/)). Traffic
engineering splits multifamily at 1–2, 3–10 and over 10 floors, which is the
line between the courtyard, the mid-rise and the tower here.

**Lots.** A new detached house sits on a median lot of 780 m²
([Census SOC via NAHB](https://eyeonhousing.org/2024/07/share-of-smaller-lots-is-at-new-high/)),
two tiles, and a typical suburban subdivision is about two homes to the acre
([Lincoln Institute](https://www.lincolninst.edu/data/visualizing-density/background-context/)),
which is the 2×2 lot at 2.5 to the acre. A duplex takes a lot 45–75 ft wide
by 100–150 ft deep and a fourplex 50–75 by 100–150
([duplex](https://missingmiddlehousing.com/types/duplex-stacked/),
[fourplex](https://missingmiddlehousing.com/types/fourplex/)): a 20 × 40 m
tile pair. A townhouse unit is 18–25 ft wide
([townhouse](https://missingmiddlehousing.com/types/townhouse/)), so a 20 m
frontage holds two at 6.8 m, which puts a 1×2 row at 20 homes to the acre,
inside the type's 11–25. A multiplex of 5–12 homes takes a lot 95–120 by
100–150 ft and a courtyard building of 6–25 homes one of 100–135 by 110–150
([multiplex](https://missingmiddlehousing.com/types/multiplex-small/),
[courtyard](https://missingmiddlehousing.com/types/courtyard-apartments/)):
a 2×2 lot each, at 20 and 30 homes to the acre against the types' 12–70 and
26–70.

**Storeys.** Opticos gives the duplex and fourplex 2–2.5 storeys, the
townhouse 2–3.5, the multiplex 2–2.5 and the courtyard building 1–3.5, with
eave heights the ladder above stays inside. Half of new detached houses are
two storeys ([NAHB](https://eyeonhousing.org/2025/07/two-or-more-story-home-starts-rebound-in-2024/)),
so the first level is a one-storey house and the levels above it two. The
mid-rise runs 5 to 10 storeys and the tower 12 to 25, both over the code's
high-rise line of 7 storeys for the tower.

**Homes per block.** A block's floor plate is its body, 13.6 m per lot tile
(740 m² on a 2×2 lot, 1,665 m² on a 3×3; see
[../../art/civic-massing.md](../../art/civic-massing.md)). A new apartment
has a median 93 m² ([Census CNH 2025](https://www.census.gov/construction/chars/highlights.html)),
and about 15% of a residential floor is corridor, stair and plant, which
gives 7 homes per floor on a 2×2 plate and 15 on a 3×3. A shopfront block's
ground floor is its shops, so its homes start on the first floor. The
missing-middle kinds take their home counts from the type, inside the ranges
above.

**Residents.** A home holds an average household: 2.63 people where the
occupant owns, 2.26 where they rent
([ACS B25010](https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25010&geo_ids=01000US)).
Detached houses and townhouses are owned; everything from the duplex up is
rented. Residents are homes × household, rounded to the nearest person. A
farm's household is an owner's, 3 people.

**Weight.** The draw weight is the kind's share of the real stock by
building: the survey's share of units in that size of structure, divided by
the homes in one such building. Detached houses are 61.1% of units and one
home each; two-unit structures 3.2% at two homes; three-to-four 4.3% at
three and a half; 5–9 units 4.4% at seven; 10–19 4.3% at fourteen and a
half; 20–49 3.8% at thirty-five; 50 or more 6.9% at a hundred; and attached
one-unit homes 6.3% at four to a row. Weights only matter among the kinds
that fit one lot, so a kind alone in its zone grows every time.

### A business opens where the town has room

A shop or an office is drawn the same way a home is, with one more test. The
demand model already knows how many local jobs the town's industry supports
and how many basic jobs its workforce calls for (see
[../simulation-rules.md](../simulation-rules.md#demand-the-rci-model)); the gap between
that and the jobs already open or going up is the **room** the economy has.
A commercial or industrial kind is a candidate for a lot only if its jobs fit
in that room — except the smallest kind that fits the lot, which is always a
candidate, so growth never stalls at a gap smaller than any building. The
room counts down as a pass builds, so two lots on one pass cannot both fill
it. A business also levels up only when the town has room for the jobs the
bigger building adds. A village of forty therefore gets a corner shop, not a
shopping strip, and the strip comes when the town's industry supports its
eighty jobs.

### The commercial kinds

| Kind              | Zone             | From | Weight | Lot (tiles) L1 / L2 / L3 | Storeys     | Jobs             |
| ----------------- | ---------------- | ---- | ------ | ------------------------ | ----------- | ---------------- |
| Shop              | Low commercial   | M0   | 350    | 1×1 / 1×2 / 2×2          | 1 / 1 / 1   | 8 / 17 / 34      |
| Restaurant        | Low commercial   | M0   | 286    | 1×2 / 2×2 / 3×2          | 1 / 1 / 2   | 15 / 26 / 53     |
| Filling station   | Low commercial   | M0   | 123    | 2×2 / 3×2 / 3×3          | 1 / 1 / 1   | 9 / 10 / 12      |
| Shopping strip    | Low commercial   | M1   | 166    | 3×2 / 4×2 / 5×2          | 1 / 1 / 1   | 51 / 68 / 85     |
| Supermarket       | Low commercial   | M1   | 46     | 3×3 / 4×3 / 5×4          | 1 / 1 / 1   | 76 / 101 / 169   |
| Office            | High commercial  | M4   | 970    | 2×2 / 3×3 / 3×3          | 5 / 8 / 16  | 228 / 820 / 1,639 |
| Hotel             | High commercial  | M4   | 107    | 2×2 / 2×2 / 3×3          | 4 / 6 / 8   | 11 / 28 / 128    |

**Where the kinds come from.** The commercial building survey sorts
buildings by what they do: retail stores are 57% of mercantile buildings and
strip shopping centres 32%, with enclosed malls under 1%
([CBECS 2018, mercantile](https://www.eia.gov/consumption/commercial/pba/mercantile.php));
food service is restaurants (61%) and fast food (24%)
([CBECS 2018, food service](https://www.eia.gov/consumption/commercial/pba/food-service.php));
lodging is hotels (32%) and motels (about 20%)
([CBECS 2018, lodging](https://www.eia.gov/consumption/commercial/pba/lodging.php)).
Four in five convenience stores sell fuel
([NACS](https://www.convenience.org/topics/fuels-and-energy/the-us-petroleum-industry-statistics-definitions)),
so the filling station is the convenience store with a canopy. The weights
are the survey's building counts: 350,000 retail, 286,000 food service,
167,000 strip centres and malls, 970,000 offices, 207,000 lodging of which
about half are hotels and motels
([CBECS 2018, table B1](https://www.eia.gov/consumption/commercial/data/2018/bc/html/b1.php));
123,000 fuel-selling convenience stores (NACS); 45,600 supermarkets
([FMI](https://www.fmi.org/our-research/food-industry-facts)).

**Lots and bodies.** The reference designs the energy codes are tested on
give the sizes: a strip mall of 22,500 sq ft, a supermarket of 45,000, a
stand-alone shop of 25,000, a quick-service restaurant of 2,500 and a
full-service one of 5,500, a small hotel of 43,200 sq ft on four floors and a
large one of 122,120 on six, a medium office of 53,628 sq ft on three floors
and a large one of 498,588 on twelve
([DOE commercial reference buildings](https://www.energy.gov/eere/buildings/commercial-reference-buildings)).
A convenience store averages 3,041 sq ft
([NACS](https://www.convenience.org/Topics/Community/Convenience-Stores-and-Their-Communities/Scope-of-the-Industry));
a supermarket 42,272 (FMI); a strip centre 29,600 and a retail store 15,200
(CBECS). On the game's plate of 13.6 m per lot tile that is a 2×2 store of
740 m² (8,000 sq ft), a 5×2 strip of 1,850 m² (20,000 sq ft), a 5×4
superstore of 3,700 m² (40,000 sq ft) and a 3×3 office floor of 1,665 m².
A restaurant's body is capped at 24 m a side (a 1×2 fast-food box of 326 m²
and a 2×2 restaurant of 576 m²) and a filling station's kiosk fills 35% of
its lot to 16 m (196 m² on a 2×2), the rest of the lot being the forecourt
and the car park. Hotel rooms are the body over 52 m² gross a room, the small
reference hotel's 43,200 sq ft over its 77 rooms.

**Jobs.** From the employment density guide: a shop, a food store and a
restaurant run at 15–20 m² of net floor per full-time job, taken at 17.5; a
general office at 13 m²; a hotel at one job per five rooms limited-service,
three mid-scale, two upscale
([HCA Employment Density Guide, 3rd ed.](https://www.gov.uk/government/publications/employment-densities-guide-3rd-edition)).
Net floor is 80% of the plate. The hotel levels are the three classes.

### What a business draws from the grid

**Electricity** is the survey's own figure per square foot a year, by what
the building does. Offices use a median 13.6 kWh per square foot
([CBECS 2018, table C14](https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c14.pdf)).
For the rest the survey gives each activity's electricity and its stock, and
the quotient: mercantile 616 TBtu over 517,000 buildings of 20,900 sq ft
is **16.7 kWh/sq ft**; food service 207 TBtu over 286,000 of 4,800 is
**44.2**; lodging 342 TBtu over 207,000 of 33,700 is **14.4**
([mercantile](https://www.eia.gov/consumption/commercial/pba/mercantile.php),
[food service](https://www.eia.gov/consumption/commercial/pba/food-service.php),
[lodging](https://www.eia.gov/consumption/commercial/pba/lodging.php)); a
convenience store, a food-sales building, uses **53.3**
([food sales](https://www.eia.gov/consumption/commercial/pba/food-sales.php)).
A building's `powerUse` is its plate × that figure over 8,760 hours. The
mixed block's shops use the mercantile figure too.

**Water** is 27.5 gallons a day per employee, the middle of the EPA's 20–35
([EPA](https://www.epa.gov/sustainability/lean-water-toolkit-appendix-c)),
except where a building's water is its trade: a sit-down restaurant uses
about 5,800 gallons a day and a quick-service one a third of that
([EPA WaterSense](https://www.epa.gov/sites/default/files/2017-01/documents/ws-commercial-factsheet-restaurants.pdf)),
and a hotel 132 gallons a day per room
([EPA WaterSense case study](https://19january2017snapshot.epa.gov/www3/watersense/docs/ci_casestudy_holidayinnsanantonioairport_508.pdf)),
taken for every room, the load the mains are sized for.

### What the player sees, on a commercial street

- a **shop** as a storefront: canopy over the frontage, a sign band above it,
  a car park in front;
- a **shopping strip** as a long, low storefront, its car park in front;
- a **supermarket** as a big, tall single storey with a sign band;
- a **restaurant** as a small storefront on a lot that is mostly car park;
- a **filling station** as a small kiosk behind a tall canopy on four posts
  with pump islands under it, the cars at the pumps;
- an **office** as a glass block or tower with no shopfront;
- a **hotel** as a block with a canopy at its entrance and a sign.

### What a home draws from the grid

**Electricity** is the average draw of a household of that kind, from the
residential energy survey: a detached house uses about 12,400 kWh a year, an
attached house 8,460, a home in a 2–4 unit building 6,640 and a home in a
building of five or more 6,090
([RECS 2020 CE4.1](https://www.eia.gov/consumption/residential/data/2020/c&e/pdf/ce4.1.pdf)).
Over 8,760 hours that is 1.4 kW, 0.97 kW, 0.76 kW and 0.70 kW per home. A
building's `powerUse` is its homes × that figure, in MW; a farm's keeps its
ratio to the detached house (twice at the first level, and so on up).

**Water** is 90 US gallons a person a day, the middle of the 80–100 gallons
a person uses indoors
([USGS](https://www.usgs.gov/special-topics/water-science-school/science/water-qa-how-much-water-do-i-use-home-each-day)),
0.34 kL; a family of three comes to the 300 gallons a day the EPA gives for
an American family ([EPA WaterSense](https://www.epa.gov/watersense/how-we-use-water)).
A building's `waterUse` is residents × 0.34 kL a day. A farm and a house on a
well draw none (see
[../simulation-rules.md](../simulation-rules.md#a-house-on-a-well)).

A shopfront block's shops add the draw of a retail floor: a mercantile
building uses 16.7 kWh per square foot a year (derived above from
[CBECS 2018](https://www.eia.gov/consumption/commercial/pba/mercantile.php)),
15.2 kW on a 740 m² floor; and 27.5 gallons a day per employee, the middle of
the 20–35 the EPA gives for domestic use at a workplace
([EPA](https://www.epa.gov/sustainability/lean-water-toolkit-appendix-c)).
Its shop jobs are the floor's net area, 80% of its plate, at 17.5 m² per
full-time job, the middle of the 15–20 m² a high-street shop runs at
([HCA Employment Density Guide, 3rd ed.](https://www.gov.uk/government/publications/employment-densities-guide-3rd-edition)).

### What the player sees

Each kind reads as itself at the default camera, without a label (see
[../../art/buildings.md](../../art/buildings.md#residential-kinds)):

- a **detached house** on its lawn with a drive, a garage and a yard;
- a **duplex** as two homes in one body with two front doors and two drives;
- a **fourplex** as a two-and-a-half-storey house-form block with two front
  doors and two drives;
- a **townhouse row** as attached homes two to a lot tile, each with its door
  and pad;
- a **multiplex** as a low flat-roofed block; **courtyard apartments** as a
  wider, lower block;
- **mid-rise flats** as a slab, and a **tower** rising from a two-storey
  podium that fills its lot.

The building inspector names the kind: "Duplex", "Courtyard Apartments",
"Tower". Its household count is the building's homes.

## What it interacts with

- **Zoning.** Nothing changes about where a zone may be painted; the kinds
  take the lots the zone already offers. A player who wants duplexes zones
  narrow strips; one who wants towers zones high density on big blocks.
- **Milestones.** The missing-middle kinds arrive at Small Town (M1) and the
  denser blocks with their zones, so a Tiny Village is detached houses only.
- **Demand and growth.** Unchanged in rule. In figures, a detached house
  holds 3 people where it held 4, and a tower holds up to 848 where it held
  150, so a town of houses reaches each milestone a little later and a city
  of towers much sooner. The level ladder no longer adds people to a house;
  it adds homes to a block.
- **Utilities.** A home's draw falls to its real average: a detached house
  draws 1.4 kW where it drew 100 kW, so one 6 MW turbine lights about 4,000
  houses. Water stays near its old figure per person, so a 400 kL water tower
  serves about 1,200 people.
- **Saves.** A saved building keeps its catalog id, and every old id maps to
  a kind: the old low-density houses are detached houses, the old row houses
  townhouses, the old medium blocks courtyard apartments, the old high blocks
  mid-rise flats. Their residents and draw change to the sourced figures on
  load, like any catalog change.

## Tuning

The weights are in the catalog on each kind's first level (`share`), and the
household sizes, per-home draws and the floor-plate arithmetic are in
[../balancing.md](../balancing.md#residential-kinds). The one dial a designer
is likely to turn is the weight: the national stock is mostly detached houses,
and a town that wants more missing-middle variety gets it by raising the
duplex and fourplex weights, or by zoning the narrow lots they fit.

## What it is not

- Not a new zone. Density is still the zone the player paints; the kind is
  drawn inside it. (Heavy industry does get a zone, in its own change.)
- Not malls or big-box stores. An enclosed mall is under 1% of mercantile
  buildings and a supercentre averages 178,000 sq ft on a lot no zone depth
  here holds; the superstore at 40,000 sq ft is the biggest low-rise retail.
- Not player-placed housing, and not a type picker: pillar one.
- Not manufactured homes or mobile-home parks, 5.4% of the stock, which
  belong where land is cheap and would need a land-value rule the draw does
  not have.
- Not households as simulated entities. A home count is a catalog figure
  used for display and for the draw on the grid, not an agent.
