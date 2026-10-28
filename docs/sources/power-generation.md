# Power generation — sources and derivations

The rules are in [the spec](../specs/power-generation.md). Every figure is derived here; the settled numbers belong in [balancing](../game-design/balancing.md) once they stop moving.

## What demand looks like

The building-types work made every zoned `powerUse` a surveyed average: a detached house 1.4 kW, a shop or a workshop tens of kilowatts, a heavy plant a megawatt or two. A developed economy draws about 1.37 kW per person across every sector, so the plants a city needs by milestone are:

| Milestone  | Residents | Average demand | Coal plants | Turbines |
| ---------- | --------- | -------------- | ----------- | -------- |
| Small Town | 400       | 0.6 MW         | 1           | 3        |
| Small City | 8,000     | 11 MW          | 1           | 55       |
| Grand City | 20,000    | 28 MW          | 2           | 140      |
| Metropolis | 50,000    | 70 MW          | 3           | 350      |

Three coal plants is not a chore, so the ladder's case is choice, not count: a Metropolis on three coal plants is 420 pollution laid over three neighbourhoods and ¢2,400 a month; on turbines it is three hundred and fifty machines on three hundred and fifty tiles.

**Real units sized to our cities.** The first draft took utility-scale machines, a 250 MW combined-cycle block and a 1,100 MW reactor, under the old convention that inflated demand twentyfold. With demand honest, a 250 MW block would carry 110,000 people and the reactor 730,000, more than any city the game can grow. The player chose to keep every figure real and pick the real machines that fit: each rung carries about the next milestone.

## The ladder

| Plant                  | Unit                        | Nameplate | Capacity factor | Delivers  | Footprint | Height | Pollution | Cost    | Upkeep | Unlocks at   |
| ---------------------- | --------------------------- | --------- | --------------- | --------- | --------- | ------ | --------- | ------- | ------ | ------------ |
| Wind Turbine           | EWT DW61                    | 1 MW      | 20%             | 0.2 MW    | 1×1       | 69 m   | —         | ¢190    | ¢3     | Tiny Village |
| Solar Farm             | 1 MWac fixed-tilt array     | 1 MW      | 23.2%           | 0.23 MW   | 6×6       | 2.9    | —         | ¢97     | ¢2     | Tiny Village |
| Gas Turbine            | GE LM6000 peaker            | 50 MW     | 13.9%           | 6.95 MW   | 2×2       | 14     | 5         | ¢3,170  | ¢256   | Small Town   |
| Coal Power Plant       | small unit                  | 60 MW     | 42.6%           | 25.6 MW   | 4×4       | 22 m   | 140       | ¢12,000 | ¢800   | Tiny Village |
| Combined-Cycle Station | Siemens SCC-800 1x1         | 89 MW     | 60.5%           | 53.8 MW   | 4×3       | 24     | 26        | ¢5,260  | ¢1,030 | Small City   |
| Nuclear Station        | NuScale US460 module        | 77 MW     | 90.8%           | 69.9 MW   | 6×5       | 24     | —         | ¢68,800 | ¢1,314 | Grand City   |

Per megawatt **delivered**, which is what the grid counts:

| Plant          | Build per MW | Upkeep per MW a month | Pollution per MW |
| -------------- | ------------ | --------------------- | ---------------- |
| Wind turbine   | ¢950         | ¢15.0                 | 0                |
| Solar farm     | ¢418         | ¢8.6                  | 0                |
| Gas turbine    | ¢456         | ¢36.9                 | 0.7              |
| Coal           | ¢469         | ¢31.3                 | 5.5              |
| Combined-cycle | ¢98          | ¢19.1                 | 0.5              |
| Nuclear        | ¢984         | ¢18.8                 | 0                |

**The solar farm trades land for money.** It is the cheapest power on the list to build and to run, and it lays no smoke, but a 6×6 lot of panels delivers less than one wind turbine: 6.4 kW a tile, four or five houses' worth. A village can live on one; a Metropolis on solar alone would want three hundred of them, about a sixth of the map.

**The gas turbine is the small clean step.** A peaker runs 13.9% of the year, so its 50 MW delivers 7: about five thousand people. It costs a quarter of a coal plant, about the same per megawatt delivered, runs dearer, and lays a thirtieth of the smoke. A Small Town chooses a ¢3,170 step that does not blight a neighbourhood, or a ¢12,000 one that carries the town to Grand City and does.

**The combined-cycle station supersedes coal.** It is the gas turbine's exhaust burned again through a steam turbine, so it runs on two-thirds of the fuel per megawatt-hour and three-fifths of the year. Per megawatt delivered it costs a fifth of coal to build, three-fifths to run, and lays a tenth of the smoke. From Small City the question is when the player can afford to stop burning coal.

**The nuclear station is the ceiling, and it is a project.** One NuScale module carries a Metropolis, emits nothing and runs cheapest of all, but ¢68,800 is about two months of a Grand City's gross tax, for no more power than a combined-cycle station and a gas turbine give for a seventh of the price. What it buys is a city with no smoke at all.

**Siting.** A reactor rejects about twice its electrical output as heat through its condenser, and US stations take that from a river, a lake or the sea. So its footprint must touch water. Nothing else gains a constraint.

**Pollution and land value.** The pollution field condemns residential growth above 170. The coal plant's 140 sits just under it, so one plant does not blight its neighbours and two overlapping do. A gas turbine's 5 and a combined-cycle station's 26 sit far below it.

## Per-capita demand

A developed economy consumes about 12,000 kWh of electricity per person per year, all sectors, which over 8,760 hours is an average draw of **1.37 kW**. Supply is an average as well, a plant's nameplate times its capacity factor, so the grid compares like with like and a plant here serves the people its real counterpart does.

## Capacity factors

The US fleet's for 2024 ([EIA, Electric Power Annual 4.08.A](https://www.eia.gov/electricity/annual/html/epa_04_08_a.html) and [4.08.B](https://www.eia.gov/electricity/annual/html/epa_04_08_b.html)), the basis coal's 42.6% already stands on: natural-gas combined cycle **60.5%**, natural-gas combustion turbine **13.9%**, nuclear **90.8%**. Utility photovoltaics ran at **23.2%** in 2024 (EIA 4.08.B), an AC figure on the AC rating.

## The units

- **Gas turbine: a GE LM6000**, the aeroderivative peaker US utilities install in ones and twos. Wallingford, Connecticut runs seven at **50 MW** each ([CT DEEP Title V permit](https://portal.ct.gov/-/media/deep/air/permits/titlev/wallingford_energy_llc/p-189-0247.pdf)).
- **Combined cycle: a Siemens SCC-800 1x1**, one SGT-800 gas turbine, one heat-recovery boiler and one steam turbine, rated 66.5–89 MW gross; we take the current machine's **89 MW** ([Siemens Energy, combined-cycle technical data](https://assets.siemens-energy.com/dam/8224a82f-9ed8-475e-b946-b26c0169f8fd/brochure-combined-cycle-technical-Data-250121b-pdf_Original%20file.pdf)). US municipal utilities build this class: Roseville Energy Park runs two SGT-800s at 120–125 MW ([California Energy Commission](https://www.energy.ca.gov/powerplant/combined-cycle/roseville-energy-park)), Holland Energy Park in Michigan 145 MW.
- **Nuclear: one NuScale US460 module, 77 MWe**, the design the NRC approved in May 2025 ([POWER](https://www.powermag.com/nuscales-77-mwe-smr-clears-nrc-review-sets-stage-for-first-firm-order)). NuScale sells plants of four, six or twelve modules; the game's station is one module's share of such a plant, and a city that wants more builds more.

## Footprints

The civic massing rule ([civic massing](../art/civic-massing/README.md)) sizes a building by occupant load, but a boiler hall is one volume with nobody in it, so the coal plant's 4×4 came from its built plate (about 2,900 m² at 185 m² a tile). The new plants take the nearest evidence each has:

| Plant          | Evidence | Footprint |
| -------------- | -------- | --------- |
| Gas turbine    | The LM6000's power-generation package is 20 × 5 m ([Baker Hughes](https://dam.bakerhughes.com/m/6932123e8e7b0784/original/LM6000PF-Overview.pdf)); with its inlet filter house, generator, catalyst and stack, about 40 × 18 m, 720 m² | 2×2 |
| Combined cycle | Lodi Energy Center sits 296 MW on 4.4 acres ([ENR](https://enr.com/articles/19216-massive-lodi-energy-power-plant-project-gets-under-way)), 60 m² a MW; 89 MW is 5,360 m², 13.4 tiles | 4×3 |
| Nuclear        | A twelve-module NuScale plant is about 38 acres (reported, not read from a primary source); one module's share is 12,800 m², 32 tiles | 6×5 |

Real sites are larger: two LM6000s at Kings River stand on 9.5 acres ([CEQAnet](https://ceqanet.lci.ca.gov/2004031053)). The grid wins, as it does for the schools. The reactor's 6×5 keeps inside the six-tile rule.

## Heights

The tallest enclosed volume, with stacks left to the kit: the gas turbine's inlet filter house at **14 m**; the combined-cycle station's heat-recovery boiler at **24 m**, an assumption under the 105 ft (32 m) a 540 MW plant's permit caps it at ([James City County](https://documents.jamescitycountyva.gov/Minutes/AdoptedResolutions/2001/November/hw101res11272001.pdf)); the reactor building at **24 m**, an assumption, since NuScale's building dimensions are not published (its 76 ft containment stands in a pool below grade). The gas turbine's stack is **30.5 m**, Wallingford's 100 ft minimum; the combined-cycle stack **40 m**, an assumption between that and the 144 ft of the 880 MW Delta Energy Center. A NuScale module sits in a pool below grade inside a flat-roofed reactor building: there is no dome, and drawing one would draw a different machine.

## Pollution

Pollution follows the energy a plant makes, not its nameplate: emissions are fuel burned, and fuel burned is megawatt-hours. Intensity is NOx + SO₂ + PM per MWh at today's federal and permit limits, times the megawatts delivered, scaled so the coal plant lands on its existing 140:

| Plant          | NOx + SO₂ + PM (lb/MWh) | Relative | × MW delivered | Pollution    |
| -------------- | ----------------------- | -------- | -------------- | ------------ |
| Coal           | 0.70 + 1.0 + 0.090 = 1.79, the new-unit standard ([40 CFR 60.42–44Da](https://www.law.cornell.edu/cfr/text/40/60.44Da)) | 1.000 | 25.6 | 140 (anchor) |
| Gas turbine    | 0.086 + 0.021 + 0.12 = 0.227, the LM6000's permit limits at 50 MW (Wallingford, above) | 0.127 | 6.95 | **5** |
| Combined-cycle | 0.227 × 6,431 ÷ 9,124 = 0.160: the same controls per unit of fuel, at combined cycle's heat rate | 0.089 | 53.8 | **26** |
| Nuclear        | 0 at the stack | 0 | 69.9 | **none** |

The coal plant's own 140 is an anchor, tied to the Toxics Release Inventory (below), not a derivation from these limits.

## Milestones

Milestones follow demand: the gas turbine at Small Town, where a coal plant is still four times what the town draws; the combined-cycle station at Small City, where it carries everything to Metropolis; the reactor at Grand City, when the treasury can contemplate it.

## Costs

Capital per kilowatt on the coal plant's scale: its ¢12,000 stands for 60 MW at $4,507/kW, ¢1 for $22,500. Gas and combined cycle come from the same table, [EIA's AEO2023 cost and performance assumptions](https://www.eia.gov/outlooks/aeo/assumptions/pdf/elec_cost_perf.pdf) (2022 dollars): the aeroderivative combustion turbine at **$1,428/kW** (50 MW, ¢3,170) and the single-shaft combined cycle at **$1,330/kW** (89 MW, ¢5,260), the table's smallest block at 418 MW, so a small plant's real figure runs higher.

The reactor does not follow the table: its small-reactor row is $8,349/kW, ¢28,570 for 77 MW, and every real project has cost two to three times that. The player chose the real project's figure for the machine drawn: **$20,100/kW**, NuScale's own Carbon Free Power Project estimate of $9.3 billion for 462 MW before it was cancelled in November 2023 ([World Nuclear News](https://world-nuclear-news.org/Articles/NuScale-CEO-remains-upbeat-after-CFPP-cancellation); the $9.3 billion is IEEFA's reading, single-source), bracketed by Ontario's first BWRX-300 at C$25,700/kW ([POWER](https://www.powermag.com/ontario-authorizes-opg-to-start-construction-of-first-commercial-nuclear-smr)) and TVA's at about $18,000/kW: 77 MW, **¢68,800**.

## Upkeep

Fixed and variable operations and maintenance plus fuel at the output a plant delivers, on coal's scale: its $8.65 million a year is ¢800 a month, so ¢1 a month for $10,814 a year. Fixed and variable O&M and heat rates from AEO2023; natural gas at the 2024 delivered price of **$2.76/MMBtu** ([EIA, Electric Power Annual 7.4](https://www.eia.gov/electricity/annual/html/epa_07_04.html)); nuclear fuel at **$6.37/MWh** ([8.4](https://www.eia.gov/electricity/annual/html/epa_08_04.html)):

| Plant          | MWh a year | Fixed                  | Variable       | Fuel                           | Total    | Upkeep     |
| -------------- | ---------- | ---------------------- | -------------- | ------------------------------ | -------- | ---------- |
| Gas turbine    | 60,882     | $18.35/kW-yr: $0.918M  | $5.29: $0.322M | 9,124 Btu/kWh × $2.76: $1.533M | $2.773M  | **¢256**   |
| Combined-cycle | 471,688    | $15.87/kW-yr: $1.412M  | $2.87: $1.354M | 6,431 Btu/kWh × $2.76: $8.372M | $11.138M | **¢1,030** |
| Nuclear        | 612,467    | $106.92/kW-yr: $8.233M | $3.38: $2.070M | $6.37/MWh: $3.901M             | $14.204M | **¢1,314** |

The reactor's fixed O&M is the table's small-reactor row, not a project's; no operating SMR has published one.

## The solar farm

A 1 MWac fixed-tilt array, the size of a community solar garden, on the 6×6 the massing rule allows. US fixed-tilt plants built in 2019 reached a median **0.69 MWac a hectare** (0.28 MWac an acre at an inverter loading ratio of 1.25; Bolinger and Bolinger, LBNL 2022, read through [Renewable Energy World](https://www.renewableenergyworld.com/solar/utility-scale/new-utility-scale-solar-needs-far-less-land-than-a-decade-ago-lbnl-says/)), so the lot's 1.44 ha holds **1 MWac**; NREL's 2013 survey of small plants needed 7.6 acres a megawatt, and LBNL finds that figure overstates today's. At 23.2% it delivers **0.23 MW**.

It is priced as the wind turbine is, at its own small class rather than a utility farm's: NREL's Q1 2023 benchmark for community solar is **$1.75/Wdc** ([NREL](https://docs.nrel.gov/docs/fy23osti/87303.pdf)), 1.25 MWdc for $2.19 million, **¢97**; AEO2023's 150 MW tracking array would be $1,443/kWac, ¢64. Its upkeep is the utility fleet's fixed O&M of **$24/kWac-yr** for 2022 ([NREL ATB 2024](https://atb.nlr.gov/electricity/2024/utility-scale_pv)), no community-solar figure being published: $24,000 a year, **¢2** a month. No staff (about 0.1 of a job a megawatt, [DOE](https://www.energy.gov/sites/prod/files/2019/05/f63/gagne-rule-thumb-ppt.pdf)) and no water: most operators never wash their panels (NREL, Macknick 2011). Its 2.9 m is the inverter skid, an SMA medium-voltage station on a 20 ft skid (6.06 × 2.44 × 2.9 m); the panel rows stand lower.

## Water

Staff water, 13 gallons a head a day, as the coal plant's: cooling water is raw water from the plant's own intake, never the city's. A peaker is dispatched remotely and staffs no one on site day to day (an assumption: no published figure), so **0**; a combined-cycle plant runs on about 25 (Hoosier Energy's 630 MW Holland plant, [info sheet](https://www.hoosierenergy.com/wp-content/uploads/2018/10/2018_InfoSheet_Holland.pdf)), **1.2 kL**; a reactor on about 100 (GE Vernova's figure for one BWRX-300, a vendor claim), **4.9 kL**.

## The wind turbine

A turbine's spread footing is one tile, the one catalog entry whose footprint is the tile rather than the 13.6 m body. The first draft kept a 34 m mast with 8.5 m blades, a rotor sweeping 266 m² that at modern power densities is a 110 kW machine, because one prop three times the height of the tallest building would break the art bible's scale read. The decision then went the other way, to the 2023 wind-farm average: a 103 m hub and a 134 m rotor sweeping three tiles either side. Played, that machine was too large for the map: a city block under one rotor, and no honest spacing rule under nine tiles. So the machine was sized to the map rather than the map to the machine, and the figure followed it.

The turbine is a **distributed-wind** machine, the class a town, a school district or a works puts up for itself, the EWT DW61: **1 MW on a 61 m rotor at a 69 m hub** ([wind-turbine-models.com](https://en.wind-turbine-models.com/turbines/1906-ewt-dw-61-1mw), [thewindpower.net](https://www.thewindpower.net/turbine_en_1512_directwind-1000-61.php)). It still stands over the town twice, as a real one does, and its blades sweep a tile and a half either side; the art bible keeps it as the one placeable drawn above the skyline on purpose.

Before that it was the average turbine installed in the United States in 2023, **3.4 MW** on a **103 m** hub and **134 m** rotor at the modern fleet's 33.5% ([LBNL, Land-Based Wind Market Report, 2024 edition](https://www.energy.gov/eere/wind/land-based-wind-market-report-2024-edition)), 1.14 MW delivered. The kit draws the DW61 at its 69 m hub and 61 m rotor; its nacelle and tower base are read off the machine's proportions, since no drawing is published, and are said to be.

**Cost.** PNNL's Distributed Wind Market Report (2024 edition) puts the capacity-weighted installed cost of distributed projects using midsize and large turbines, 2015–2022, at **$4,310/kW** ([PNNL](https://www.pnnl.gov/publications/distributed-wind-market-report-2024-edition)), twice a wind farm's per kilowatt, as a one-off machine on a town's own site is; against the coal anchor that gives **¢190**. Its upkeep is held to the onshore fleet's $29.64 per kW-year of fixed cost, for want of a published distributed figure, so **¢3 a month**. Projects using midsize turbines (101 kW to 1 MW) in the same report series average a **20%** capacity factor, a town site being no wind farm's, so the machine delivers **0.2 MW**: about a hundred and forty houses, or a village.

**Spacing: rotors never overlap, and that is all.** A wind project keeps turbines three rotor diameters apart across the wind and seven along it (Ireland's Wind Energy Development Guidelines, 2006, the figure planners cite), spreads 34 ha per megawatt with 5 to 10 diameters between though only 0.3 ha per megawatt is pad and road ([NREL, Denholm 2009](https://docs.nlr.gov/docs/fy09osti/45834.pdf)), and one state's siting code keeps a turbine 1.1 tip heights from a property line and 3.1 tip heights, or 1,250 ft, from a neighbour's house, for a night limit of 45 dBA ([Wisconsin PSC 128.13–14](https://docs.legis.wisconsin.gov/document/administrativecode/PSC%20128.14)). Three diameters of the DW61 is nine tiles, which the user judged too far for a game whose power lines are what join a row of turbines up; the rule chosen is the physical minimum instead. The catalog's turbine carries `spacing: 3`: three clear tiles between it and any other turbine in any direction, so centres stand 80 m apart against a 61 m rotor and no blade sweeps another's. The wake loss a real farm pays for packing this tight is not modelled. It carries no `noise`: a 1 MW machine's sound power is lower still than the 104–106 dB(A) of the wind-farm class ([Vestas V136-4.2](https://www.vestas.com/en/energy-solutions/onshore-wind-turbines/4-mw-platform/V136-4-2-MW)), which already arrived below the noise field's floor.

## The coal plant

Coal's fleet ran at **42.6%** in 2024 ([EIA, Electric Power Monthly 6.07.A](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_6_07_a)), so the 60 MW plant delivers **25.6 MW**. It is a **60 MW** unit at the small end of what is built and retired: the units retired in 2015 averaged 133 MW ([EIA](https://www.eia.gov/todayinEnergy/detail.php?id=25272)), a 99 MW lignite unit opened in 2014 ([Great River Energy](https://greatriverenergy.com/electricity-sources/combined-heat-power/)), and the Department of Energy's small-modular coal band runs 50–350 MW ([DOE](https://www.energy.gov/hgeo/articles/small-scale-modular-coal-fired-plants-future)). Its 4×4 is its built plate, about 2,900 m²; its 22 m is short, since a 60 MW boiler house stands nearer 40 m, but the kit's stacks reach 26 m above it, so the silhouette reads.

Its anchors predate the rest and everything else is scaled to them: ¢12,000 is 60 MW at $4,507/kW ([EIA, AEO2023](https://www.eia.gov/outlooks/aeo/assumptions/pdf/elec_cost_perf.pdf)), and ¢800 is $8.65 million a year: $45.68 per kW-year fixed, $5.06 per MWh variable, and 8,638 Btu per kWh of coal at $2.47 per million Btu ([EIA, Electric Power Annual 7.4](https://www.eia.gov/electricity/annual/html/epa_07_04.html)) over the 224,000 MWh a 60 MW unit makes at 42.6%. The pollution anchor is tied to the Toxics Release Inventory (an electric utility released about half a million pounds in 2023, 388 facilities, [EPA TRI](https://www.epa.gov/trinationalanalysis/electric-utilities-waste-management-trend)), which is where the zoned plants' figures hang. Its `waterUse` is its staff's water: about fifty people at 13 gallons a day, **2.5 kL** a day, not the thousand a cooling tower evaporates. The incinerator's 120 stays a dial: municipal waste-to-energy plants do not report to the Inventory.

## The catalog entries

All four new entries are `category: "utility"` with `powerUse: 0`; the solar farm and the reactor omit `pollution`, as the wind turbine does. The milestone column is looked up by name in `MILESTONES` through `unlockMilestone`, never written as a number in a test.

| `id`             | `name`                 | `powerMW` | `capacityFactor` | `footprint` | `height` | `pollution` | `waterUse` | `cost` | `upkeep` | `unlockMilestone` | `requiresAdjacent` |
| ---------------- | ---------------------- | --------- | ---------------- | ----------- | -------- | ----------- | ---------- | ------ | -------- | ----------------- | ------------------ |
| `solar-farm`     | Solar Farm             | 1         | 0.232            | 6×6         | 2.9      | —           | 0          | 97     | 2        | Tiny Village      | —                  |
| `gas-turbine`    | Gas Turbine            | 50        | 0.139            | 2×2         | 14       | 5           | 0          | 3170   | 256      | Small Town        | —                  |
| `combined-cycle` | Combined-Cycle Station | 89        | 0.605            | 4×3         | 24       | 26          | 1.2        | 5260   | 1030     | Small City        | —                  |
| `nuclear-plant`  | Nuclear Station        | 77        | 0.908            | 6×5         | 24       | —           | 4.9        | 68800  | 1314     | Grand City        | `water`            |

## Alternatives not taken

- **Utility-scale units** (250 MW block, 1,100 MW reactor): too big for any city the game can grow.
- **The reactor at EIA's table cost**, $8,349/kW, ¢28,570: every real small-reactor project has cost two to three times the table.
- **Solar ruled out on land area.** An earlier draft rejected it because a tile of panels delivers so little; counted at real density and capacity factor the little is honest, and the land is the decision.
- **Intermittency.** `VISUAL_DAY_TICKS` is 2,400 ticks, about six real minutes at 1×, so a day-linked output would swing supply every few minutes and roll abandonment across the edge of the city. Taking it later needs, in order: a supply reserve the player can see, a storage building that turns surplus into headroom, and a cut rule that sheds by priority rather than by id.
- **Hydroelectricity.** `GridState.water` is a flat `Uint8Array` mask with no flow, head or catchment; hydro output is flow times head, so a dam's capacity could only be picked, which the tuning rule forbids.
- **A clearance ring around the reactor** instead of the water gate: a placement-time gate does not stop a zone growing a house inside the ring afterwards.
- **Raising the coal plant to a real 600 MW unit:** it collapses the bottom of the ladder, the half a new player actually meets.
- **Per-network supply islands:** its own epic, changing what supply means for every existing city.
- Out of scope: storage or a reserve margin, re-sizing the coal plant, rooftop solar on zoned buildings, transmission losses, and anything that makes supply other than one city-wide total. Anything that should never be built belongs in [DESIGN.md](../DESIGN.md).
