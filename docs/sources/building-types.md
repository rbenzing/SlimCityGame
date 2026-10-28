# Building types — sources and derivations

The research behind [the building-types spec](../specs/building-types.md): the per-kind tables, the published figures each kind is built from, and the arithmetic that turns them into catalog numbers. Every figure here is a US figure unless it says otherwise. Lots and land have their own digest in [lots-and-land](lots-and-land.md).

## The residential kinds

| Kind                 | Zone               | From | Weight | Lot (tiles) L1 / L2 / L3 | Storeys       | Homes       | Residents     |
| -------------------- | ------------------ | ---- | ------ | ------------------------ | ------------- | ----------- | ------------- |
| Detached house       | Low density        | M0   | 61.1   | 1×1, 1×2, 2×2, 2×3 or 3×3 by the land, the same at every level ([lots-and-land](../specs/lots-and-land.md)) | 1 / 2 / 2     | 1           | 3             |
| Duplex               | Low density        | M1   | 1.6    | 1×1 or 1×2, the same at every level; 2×1 turned | 2 / 2 / 2.5   | 2           | 5             |
| Fourplex             | Low density        | M1   | 1.2    | 1×1 or 1×2, the same at every level; 2×1 turned | 2.5 / 2.5 / 3 | 4           | 9             |
| Townhouse row        | Row housing        | M1   | 1.6    | 1×2, one normal parcel, at every level; 2×1 turned | 2 / 3 / 3.5   | 3 / 3 / 3   | 8 / 8 / 8     |
| Multiplex            | Medium density     | M2   | 0.63   | 2×2, two normal parcels, at every level | 2.5 / 3 / 3   | 8 / 10 / 12 | 18 / 23 / 27  |
| Courtyard apartments | Medium density     | M2   | 0.30   | 2×2, two normal parcels, at every level | 2 / 3 / 3.5   | 12 / 18 / 24 | 27 / 41 / 54 |
| Mid-rise flats       | High density       | M4   | 0.11   | 1×2 / 2×2 / 3×3, assembling its neighbours | 5 / 8 / 10    | 17 / 47 / 114 | 38 / 106 / 258 |
| Tower                | High density       | M4   | 0.07   | 2×2 / 2×2 / 3×3          | 12 / 18 / 25  | 81 / 105 / 285 | 183 / 237 / 644 |
| Shopfront flats      | Mixed              | M3   | 1      | 1×2 / 2×2 / 3×3, assembling its neighbours | 4 / 8 / 9     | 10 / 40 / 87 | 23 / 90 / 197 |

A tile is 20 m, so a 1×2 lot is 800 m² (0.2 acre), a 2×2 lot 1,600 m² (0.4 acre) and a 3×3 lot 3,600 m² (0.9 acre).

### Where the kinds come from

The types are the ones the building code and the housing survey already distinguish. The code puts one- and two-family houses in one occupancy group (R-3), apartment houses of three or more dwellings in another (R-2), and calls a building of three or more attached single-family units a townhouse ([IBC Group R](https://up.codes/s/residential-group-r-2), [townhouse](https://up.codes/s/townhouse)); a high-rise is any building with an occupied floor more than 22.9 m up ([IBC high-rise](https://up.codes/s/high-rise-building)). The housing survey counts units by the size of the structure they are in: one detached, one attached, 2, 3–4, 5–9, 10–19, 20–49 and 50 or more ([ACS B25024](https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25024&geo_ids=01000US)). Between the house and the block, the "missing middle" typology names the house-scale buildings that fit a house lot — the duplex, the fourplex, the townhouse, the multiplex and the courtyard building — with the lot and building sizes each one takes ([Opticos, the types](https://missingmiddlehousing.com/the-types/)). Traffic engineering splits multifamily at 1–2, 3–10 and over 10 floors, which is the line between the courtyard, the mid-rise and the tower here.

### Lots

A new detached house sits on a median lot of 780 m² ([Census SOC via NAHB](https://eyeonhousing.org/2024/07/share-of-smaller-lots-is-at-new-high/)), two tiles, and a typical suburban subdivision is about two homes to the acre ([Lincoln Institute](https://www.lincolninst.edu/data/visualizing-density/background-context/)), which is the 2×2 lot at 2.5 to the acre. A duplex takes a lot 45–75 ft wide by 100–150 ft deep and a fourplex 50–75 by 100–150 ([duplex](https://missingmiddlehousing.com/types/duplex-stacked/), [fourplex](https://missingmiddlehousing.com/types/fourplex/)): a 20 × 40 m tile pair.

A townhouse unit is 18–25 ft wide on a lot 85–120 ft deep, at a net 11–25 homes to the acre, in runs of 2 to 16 ([townhouse](https://missingmiddlehousing.com/types/townhouse/)). Municipal fee-simple townhouse lots run 1,600–2,000 sq ft and 20–24 ft wide ([Alva, OK](https://codelibrary.amlegal.com/codes/alvaok/latest/alva_ok/0-0-0-12052), [Big Timber, MT](https://www.zoneomics.com/code/big-timber-MT/chapter_16)), zoning caps a row at 4–8 units ([Garfield, NJ](https://www.zoneomics.com/code/garfield-NJ/chapter_12), [Utah missing-middle toolkit](https://luau.utah.gov/wp-content/uploads/UMH_MMH-Toolkit_NeighborhoodTypes_Central.pdf)), and the median new single-family attached home is 1,800 sq ft ([NAHB on the Census SOC, 2019](https://www.nahb.org/blog/2020/12/where-are-the-largest-homes-built)).

So the 1×2 normal parcel, 20 m of frontage by 40 m deep (0.198 acre), holds **three homes at every level**, each about 6 m (20–22 ft) wide: 15 homes to the acre, inside the type's 11–25. The level adds storeys and value, never homes or length; Opticos gives the same unit width at 2 to 3.5 storeys, so a taller townhouse is more floor per home. A long terrace is neighbouring parcels in a run, each parcel's building a run of three, with side yards between runs ([lots-and-land](../specs/lots-and-land.md#medium-density-and-row-housing)).

A multiplex of 5–12 homes takes a lot 95–120 by 100–150 ft and a courtyard building of 6–25 homes one of 100–135 by 110–150 ([multiplex](https://missingmiddlehousing.com/types/multiplex-small/), [courtyard](https://missingmiddlehousing.com/types/courtyard-apartments/)): a 2×2 lot each, at 20 and 30 homes to the acre against the types' 12–70 and 26–70. The 2×2 is two normal parcels of the plat assembled side by side, and it stays two at every level.

### Storeys

Opticos gives the duplex and fourplex 2–2.5 storeys, the townhouse 2–3.5, the multiplex 2–2.5 and the courtyard building 1–3.5, with eave heights the ladder above stays inside; a townhouse row's storeys 2, 3 and 3.5 stand at 7, 9 and 11 m on the same three homes. Half of new detached houses are two storeys ([NAHB](https://eyeonhousing.org/2025/07/two-or-more-story-home-starts-rebound-in-2024/)), so the first level is a one-storey house and the levels above it two. The mid-rise runs 5 to 10 storeys and the tower 12 to 25, both over the code's high-rise line of 7 storeys for the tower.

### Homes per block

A block holds the floor it is drawn with. Its ground plate is its body, 13.6 m per lot tile (740 m² on a 2×2 lot, 1,665 m² on a 3×3; see [civic massing](../art/civic-massing/README.md)), and a storey is 3.2 m, inside the 3.0–3.4 m a residential floor runs. A grown block is drawn as one tier for each level, the storeys shared evenly, and each tier above the first stands 10–20% narrower on both sides than the one below; the homes count each upper tier at the middle of that, 15%, so its floor is 72% of the tier beneath. A tower's podium is lobby and amenity and holds no homes, and a shopfront block's ground storey is its shops, so its homes start on the storey above.

A new rental apartment has a median 1,000 sq ft, 93 m² ([Census CNH 2025](https://www.census.gov/construction/chars/highlights.html)), and 80–85% of a residential floor is homes, the rest corridor, core and plant; the homes take 85%. So a block's homes are its drawn floor × 0.85 ÷ 93 m², rounded: a level-3 tower's 25 storeys on a 3×3 plate step back to 31,100 m² and hold 285 homes, not the 375 that counting every storey at the ground plate gave. Its top tier is about 870 m², inside the 600–900 m² a residential tower's floorplate is held to ([Vancouver](https://guidelines.vancouver.ca/bulletins/bulletin-residential-tower-floor-plates.pdf), [Toronto](https://urbantoronto.ca/news/2022/04/explainer-residential-vs-office-tower-floor-plates)).

On their lots the blocks come to 86 to 128 homes an acre for the mid-rise and 205 to 320 for the tower, against the 90–150 of podium mid-rise and the 140–200 and up of high-rise ([J. Haddad Partners](https://jhparch.com/density), [Clark County](https://websvc2.clark.wa.gov/CommunityPlanning/2025CompPlanUpdate/36702724.pdf)). The missing-middle kinds take their home counts from the type, inside the ranges above.

### Residents

A home holds an average household: 2.63 people where the occupant owns, 2.26 where they rent ([ACS B25010](https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25010&geo_ids=01000US)). Detached houses and townhouses are owned; everything from the duplex up is rented. Residents are homes × household, rounded to the nearest person. A farm's household is an owner's, 3 people.

### Weight

The draw weight is the kind's share of the real stock by building: the survey's share of units in that size of structure, divided by the homes in one such building. Detached houses are 61.1% of units and one home each; two-unit structures 3.2% at two homes; three-to-four 4.3% at three and a half; 5–9 units 4.4% at seven; 10–19 4.3% at fourteen and a half; 20–49 3.8% at thirty-five; 50 or more 6.9% at a hundred; and attached one-unit homes 6.3% at four to a row. Weights only matter among the kinds that fit one lot, so a kind alone in its zone grows every time.

### What a home draws from the grid

**Electricity** is the average draw of a household of that kind, from the residential energy survey: a detached house uses about 12,400 kWh a year, an attached house 8,460, a home in a 2–4 unit building 6,640 and a home in a building of five or more 6,090 ([RECS 2020 CE4.1](https://www.eia.gov/consumption/residential/data/2020/c&e/pdf/ce4.1.pdf)). Over 8,760 hours that is 1.4 kW, 0.97 kW, 0.76 kW and 0.70 kW per home. A building's `powerUse` is its homes × that figure ÷ 1000, in MW; a farm's keeps its ratio to the detached house (twice at the first level, and so on up).

**Water** is 90 US gallons a person a day, the middle of the 80–100 gallons a person uses indoors ([USGS](https://www.usgs.gov/special-topics/water-science-school/science/water-qa-how-much-water-do-i-use-home-each-day)), 0.34 kL; a family of three comes to the 300 gallons a day the EPA gives for an American family ([EPA WaterSense](https://www.epa.gov/watersense/how-we-use-water)). A building's `waterUse` is residents × 0.34 kL a day. A farm and a house on a well draw none (see [the well rule](../game-design/simulation-rules/the-spawner-how-a-lot-is-chosen.md#a-house-on-a-well)).

A shopfront block's shops add the draw of a retail floor: a mercantile building uses 16.7 kWh per square foot a year (derived under the commercial kinds below from [CBECS 2018](https://www.eia.gov/consumption/commercial/pba/mercantile.php)), 7.6 kW on a 370 m² floor and 15.2 kW on a 740 m² one; and 27.5 gallons a day per employee, the middle of the 20–35 the EPA gives for domestic use at a workplace ([EPA](https://www.epa.gov/sustainability/lean-water-toolkit-appendix-c)). Its shop jobs are the floor's net area, 80% of its plate, at 17.5 m² per full-time job, the middle of the 15–20 m² a high-street shop runs at ([HCA Employment Density Guide, 3rd ed.](https://www.gov.uk/government/publications/employment-densities-guide-3rd-edition)).

## The commercial kinds

| Kind              | Zone             | From | Weight | Lot (tiles) L1 / L2 / L3 | Storeys     | Jobs             |
| ----------------- | ---------------- | ---- | ------ | ------------------------ | ----------- | ---------------- |
| Shop              | Low commercial   | M0   | 350    | 1×1 / 1×2 / 2×2          | 1 / 1 / 1   | 8 / 17 / 34      |
| Restaurant        | Low commercial   | M0   | 286    | 1×2 / 2×2 / 3×2          | 1 / 1 / 2   | 15 / 26 / 53     |
| Filling station   | Low commercial   | M0   | 123    | 2×2 / 3×2 / 3×3          | 1 / 1 / 1   | 9 / 10 / 12      |
| Shopping strip    | Low commercial   | M1   | 166    | 3×2 / 4×2 / 5×2          | 1 / 1 / 1   | 51 / 68 / 85     |
| Supermarket       | Low commercial   | M1   | 46     | 3×3 / 4×3 / 5×4          | 1 / 1 / 1   | 76 / 101 / 169   |
| Office            | High commercial  | M4   | 970    | 2×2 / 3×3 / 3×3          | 5 / 8 / 16  | 228 / 820 / 1,639 |
| Hotel             | High commercial  | M4   | 107    | 2×2 / 2×2 / 3×3          | 4 / 6 / 8   | 11 / 28 / 128    |

### Where the kinds come from

The commercial building survey sorts buildings by what they do: retail stores are 57% of mercantile buildings and strip shopping centres 32%, with enclosed malls under 1% ([CBECS 2018, mercantile](https://www.eia.gov/consumption/commercial/pba/mercantile.php)); food service is restaurants (61%) and fast food (24%) ([CBECS 2018, food service](https://www.eia.gov/consumption/commercial/pba/food-service.php)); lodging is hotels (32%) and motels (about 20%) ([CBECS 2018, lodging](https://www.eia.gov/consumption/commercial/pba/lodging.php)). Four in five convenience stores sell fuel ([NACS](https://www.convenience.org/topics/fuels-and-energy/the-us-petroleum-industry-statistics-definitions)), so the filling station is the convenience store with a canopy.

The weights are the survey's building counts: 350,000 retail, 286,000 food service, 167,000 strip centres and malls, 970,000 offices, 207,000 lodging of which about half are hotels and motels ([CBECS 2018, table B1](https://www.eia.gov/consumption/commercial/data/2018/bc/html/b1.php)); 123,000 fuel-selling convenience stores (NACS); 45,600 supermarkets ([FMI](https://www.fmi.org/our-research/food-industry-facts)).

### Lots and bodies

The reference designs the energy codes are tested on give the sizes: a strip mall of 22,500 sq ft, a supermarket of 45,000, a stand-alone shop of 25,000, a quick-service restaurant of 2,500 and a full-service one of 5,500, a small hotel of 43,200 sq ft on four floors and a large one of 122,120 on six, a medium office of 53,628 sq ft on three floors and a large one of 498,588 on twelve ([DOE commercial reference buildings](https://www.energy.gov/eere/buildings/commercial-reference-buildings)). A convenience store averages 3,041 sq ft ([NACS](https://www.convenience.org/Topics/Community/Convenience-Stores-and-Their-Communities/Scope-of-the-Industry)); a supermarket 42,272 (FMI); a strip centre 29,600 and a retail store 15,200 (CBECS).

On the game's plate of 13.6 m per lot tile that is a 2×2 store of 740 m² (8,000 sq ft), a 5×2 strip of 1,850 m² (20,000 sq ft), a 5×4 superstore of 3,700 m² (40,000 sq ft) and a 3×3 office floor of 1,665 m². A restaurant's body is capped at 24 m a side (a 1×2 fast-food box of 326 m² and a 2×2 restaurant of 576 m²) and a filling station's kiosk fills 35% of its lot to 16 m (196 m² on a 2×2), the rest of the lot being the forecourt and the car park. Hotel rooms are the body over 52 m² gross a room, the small reference hotel's 43,200 sq ft over its 77 rooms.

### Jobs

From the employment density guide: a shop, a food store and a restaurant run at 15–20 m² of net floor per full-time job, taken at 17.5; a general office at 13 m²; a hotel at one job per five rooms limited-service, three mid-scale, two upscale ([HCA Employment Density Guide, 3rd ed.](https://www.gov.uk/government/publications/employment-densities-guide-3rd-edition)). Net floor is 80% of the plate. The hotel levels are the three classes.

### What a business draws from the grid

**Electricity** is the survey's own figure per square foot a year, by what the building does. Offices use a median 13.6 kWh per square foot ([CBECS 2018, table C14](https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c14.pdf)). For the rest the survey gives each activity's electricity and its stock, and the quotient: mercantile 616 TBtu over 517,000 buildings of 20,900 sq ft is **16.7 kWh/sq ft**; food service 207 TBtu over 286,000 of 4,800 is **44.2**; lodging 342 TBtu over 207,000 of 33,700 is **14.4** ([mercantile](https://www.eia.gov/consumption/commercial/pba/mercantile.php), [food service](https://www.eia.gov/consumption/commercial/pba/food-service.php), [lodging](https://www.eia.gov/consumption/commercial/pba/lodging.php)); a convenience store, a food-sales building, uses **53.3** ([food sales](https://www.eia.gov/consumption/commercial/pba/food-sales.php)). A building's `powerUse` is its plate × that figure over 8,760 hours. The mixed block's shops use the mercantile figure too.

**Water** is 27.5 gallons a day per employee, the middle of the EPA's 20–35 ([EPA](https://www.epa.gov/sustainability/lean-water-toolkit-appendix-c)), except where a building's water is its trade: a sit-down restaurant uses about 5,800 gallons a day and a quick-service one a third of that ([EPA WaterSense](https://www.epa.gov/sites/default/files/2017-01/documents/ws-commercial-factsheet-restaurants.pdf)), and a hotel 132 gallons a day per room ([EPA WaterSense case study](https://19january2017snapshot.epa.gov/www3/watersense/docs/ci_casestudy_holidayinnsanantonioairport_508.pdf)), taken for every room, the load the mains are sized for.

## The industrial kinds

| Kind           | Zone  | From | Weight | Lot (tiles) L1 / L2 / L3 | Height (m)       | Jobs           |
| -------------- | ----- | ---- | ------ | ------------------------ | ---------------- | -------------- |
| Workshop       | light | M0   | 22     | 2×2 / 3×2 / 3×3          | 6.1              | 16 / 24 / 35   |
| Warehouse      | light | M0   | 55     | 3×3 / 4×3 / 5×4          | 7.3 / 9.8 / 12.2 | 24 / 29 / 39   |
| Factory        | light | M1   | 8      | 2×3 / 3×3 / 4×3          | 6.1 / 7.3 / 7.3  | 31 / 46 / 62   |
| Flex / R&D     | light | M3   | 9      | 2×2 / 3×2 / 3×4          | 6.4 / 6.4 / 9.6  | 19 / 29 / 87   |
| Food plant     | heavy | M2   | 43     | 3×3 / 4×3 / 5×4          | 8 / 9 / 10       | 46 / 62 / 103  |
| Chemical plant | heavy | M2   | 26     | 3×3 / 4×4 / 5×4          | 10 / 12 / 15     | 25 / 44 / 56   |
| Steelworks     | heavy | M2   | 6      | 3×3 / 4×3 / 5×3          | 12 / 15 / 18     | 46 / 62 / 77   |
| Paper mill     | heavy | M2   | 6      | 3×3 / 4×4 / 5×4          | 10 / 13 / 15     | 46 / 82 / 103  |

### Where the kinds come from

The industry's own classification of its property sorts it into warehouse distribution (over 55% of the floor space), manufacturing (30%) and flex (9%), and within those names the types here: the multi-tenant building of small units (about 80,000 sq ft in units of 5,000–15,000, 16–24 ft ceilings, covering half its site) that is the workshop yard; the regional and bulk warehouses (16–24 ft and over 20 ft clear, covering up to half the site); light manufacturing (under 300,000 sq ft, 14–24 ft ceilings, covering about 40%); heavy manufacturing (over 300,000 sq ft on average, 16–60 ft, covering 40–50%); and R&D flex, one or two storeys with 25–70% office and parking that holds its coverage to 25–40% ([ULI, Guide to Classifying Industrial Property](http://courses.washington.edu/cee320ag/warehousing/WarehouseClassification.pdf)). The heavy kinds are the four manufacturing industries that release the most: chemicals, primary metals, paper and food ([EPA TRI 2023, releases by industry](https://enviro.epa.gov/triexplorer/release_industry?BGCOLOR=&COUNTY=All+counties&FLD=RELLBY&FLD=TSFDSP&LINESPP=&STATE=All+states&TAB_RPT=1&TopN=50&chemical=_ALL_&epa_region=&p_view=USSC&report=&sort=RE_TOLBY&sort_fmt=2&trilib=TRIQ1&year=2023)), and together the most energy-intensive ([MECS 2018, table 6.1](https://www.eia.gov/consumption/manufacturing/data/2018/pdf/Table6_1.pdf)).

### Lots, bodies and heights

A warehouse fills its plate like any block, 13.6 m per lot tile, which covers 46% of its site, inside the type's half; a factory, a food plant, a steelworks and a paper mill do the same, inside heavy manufacturing's 40–50%; a flex building fills 55% of each side, 30% of its site; a chemical plant half of each side, a quarter, and the rest is its tank farm and yards. A warehouse's heights are the clear heights of its generations: half the national stock is 27 ft clear or lower ([Cushman & Wakefield](https://www.cushmanwakefield.com/en/united-states/insights/the-industrial-spec-sweet-spot-what-tenants-want)), new buildings are 36–40 ft ([NAIOP](https://www.naiop.org/research-and-publications/magazine/2024/spring-2024/development-ownership/new-noteworthy-projects/)), so 24, 32 and 40 ft. The workshop and the factory sit at light manufacturing's 20–24 ft, the flex building at two and three storeys, and the plants inside heavy manufacturing's 16–60 ft, a steel mill the tallest. The light lots keep to what a warehouse averages, 17,400 sq ft, with 69% of them under 10,000 ([CBECS 2018, warehouses](https://www.eia.gov/consumption/commercial/pba/warehouse-and-storage.php)); the heavy lots are the biggest the zone depth holds, since a real plant's 300,000 sq ft fits no lot here.

### Jobs

From the employment density guide, in gross floor per full-time job: general industrial 36 m², small business units 47 m², research and development 40–60 m² (taken at 50), and distribution 70 m² for a final-mile depot, 77 m² regional and 95 m² national ([HCA Employment Density Guide, 3rd ed.](https://www.gov.uk/government/publications/employment-densities-guide-3rd-edition)). A flex building's floor is its plate times its storeys; every other works is one working floor.

### Weight

In the light zone the weight is the type's share of the industrial floor space, 55 warehouse, 30 manufacturing and 9 flex (ULI, above), with manufacturing split between the workshop and the factory by the firms: about three-quarters of manufacturing firms have fewer than 20 employees ([NAM, from the Census SUSB 2022](https://nam.org/mfgdata/facts-about-manufacturing-expanded/)), so 22 and 8. In the heavy zone it is each industry's count of establishments, in thousands: food 43, chemicals 26, primary metals 6, paper 6 ([BLS QCEW, food](https://www.bls.gov/iag/tgs/iag311.htm), [chemicals](https://www.bls.gov/iag/tgs/iag325.htm), [primary metals](https://www.bls.gov/iag/tgs/iag331.htm), [paper](https://www.bls.gov/iag/tgs/iag322.htm)).

### What a works draws from the grid, and what it puts into the air

**Electricity** is each industry's grid electricity per employee from the manufacturing energy survey, its energy per employee times the share of that energy that is purchased electricity ([MECS 2018, table 6.1](https://www.eia.gov/consumption/manufacturing/data/2018/pdf/Table6_1.pdf), [table 3.2](https://www.eia.gov/consumption/manufacturing/data/2018/pdf/Table3_2.pdf)): machinery 22,600 kWh a year, fabricated metal 24,900, food 62,600, paper 161,800, chemicals 193,200, primary metals 273,500. A workshop yard draws like a small machinery shop, a factory like a fabricated-metal plant, and a plant like its industry; `powerUse` is jobs × that figure over 8,760 hours. A warehouse draws the survey's median 5.8 kWh per square foot a year ([CBECS 2018, table C14](https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c14.pdf)) and a flex building, half office and half warehouse, 9.7, over its floor.

**Water** is each industry's use per employee per working day from the one public coefficient table that covers every sector, a state water survey: machinery 110 gallons, fabricated metal 738, chemicals 833, paper 1,000, primary metals 1,318, food 1,967 ([Pacific Institute, Waste Not, Want Not, appendix C](https://pacinst.org/wp-content/uploads/2013/02/appendix_c.pdf)); a warehouse and a flex building use the 27.5 gallons an employee of the domestic figure ([EPA](https://www.epa.gov/sustainability/lean-water-toolkit-appendix-c)). A plant draws it from the mains, the load the mains are sized for: a food plant drinks like a town of two thousand, which is what a food plant does.

**Pollution** is each industry's toxic releases per reporting plant, from the inventory's 2023 pounds by industry over its facilities: machinery 7,200 lb a year, fabricated metal 13,500, food 88,600, chemicals 119,900, primary metals 210,700, paper 416,300 ([EPA TRI 2023, releases by industry](https://enviro.epa.gov/triexplorer/release_industry?BGCOLOR=&COUNTY=All+counties&FLD=RELLBY&FLD=TSFDSP&LINESPP=&STATE=All+states&TAB_RPT=1&TopN=50&chemical=_ALL_&epa_region=&p_view=USSC&report=&sort=RE_TOLBY&sort_fmt=2&trilib=TRIQ1&year=2023), [facility counts](https://enviro.epa.gov/triexplorer/release_fac?p_view=USFA&trilib=TRIQ1&sort=_VIEW_&sort_fmt=1&state=All+states&county=All+counties&zipcode=&epa_region=&chemical=All+chemicals&industry=322&fedcode=&year=2023&V_NA_INDICATOR=.&tab_rpt=1&fld=RELLBY&fld=TSFDSP)). The scale is the one the coal plant already sets: an electric utility releases 484,000 lb a year on the same measure, and the coal plant emits 140, so a plant's level-2 figure is its industry's releases at 140 per 484,000 lb, and its other levels scale with their jobs. A warehouse and a flex building release nothing; a workshop or a factory emits a few units, which is what light industry's releases are next to a paper mill's. No light works raises a stack; every heavy plant does. The Industrial zone is therefore nearly clean, and the Heavy Industrial zone is where the air goes bad.

**Noise.** The loudest tile the roads make, a motorway at capacity, is taken as 80 dBA, the federal emission limit for a heavy truck at 50 ft ([FHWA](https://www.fhwa.dot.gov/environment/noise/regulations_and_guidance/probresp.cfm)). Manufacturing runs at the 75 dBA daytime property-line standard most codes set for industry, 5 dB under it, so a works or a plant emits 10^(−5/10) of a motorway tile's 120: **38**. A loading dock measures 68 dB at 50 ft, 12 dB under, so a warehouse emits **8**; a flex building, an office in all but zoning, emits none.

## Effects on the rest of the model, in figures

- **Pacing.** A detached house holds 3 people where it held 4, and a tower up to 644 where it held 150, so a town of houses reaches each milestone a little later and a city of towers much sooner.
- **Utilities.** A detached house draws 1.4 kW where it drew 100 kW, so one wind turbine, delivering 1.1 MW on average once its capacity factor was modelled, lights about 800 houses. Water stays near its old figure per person, so a 400 kL water tower serves about 1,200 people. Light industry draws tens of kilowatts where it drew megawatts; a heavy plant draws 0.3–2.4 MW and hundreds of kL of water a day, so a heavy estate needs a tower or two of its own. A heavy plant draws 80–770 kL a day, up to twice a water tower's 400 kL.
- **Pollution.** The Industrial zone's buildings emit a few units (1–5) where they emitted 60 and 90, and the heavy plants 19–151, the paper mill above the coal plant's 140 at its third level.
- **Catalog numbers.** The household sizes, per-home draws and floor-plate arithmetic are in [balancing](../game-design/balancing/residential-kinds.md), with the commercial and industrial rules beside them.
