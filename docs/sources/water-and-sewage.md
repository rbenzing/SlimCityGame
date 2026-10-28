# Water and sewage — sources and derivations

The rules are in [the spec](../specs/water-and-sewage.md). Every figure is derived from a published source and the 20 m tile; the settled values are in [balancing](../game-design/balancing.md#water-and-sewer).

## Return to sewer

Public supply consumes 12% of what it withdraws, 0.08 to 0.23 by region, the rest returning as wastewater ([USGS, water years 2010–20](https://pubs.usgs.gov/publication/pp1894D/full)); the engineering range is 60–90% ([WEF MOP 8, as applied by a facilities plan](https://portal.ct.gov/-/media/DEEP/water/municipal_wastewater/Bridgeport-FP-Section-05-112430.pdf)). We take the national figure: **0.88**.

## The tower

Elevated tanks come in standard sizes from 50,000 to 2,000,000 gallons, 100,000 among them ([Caldwell Tanks](https://www.caldwelltanks.com/tank_types/multi-column-elevated-storage-tank-leg), [Phoenix Fabricators](https://phoenixtank.com/elevated-water-storage-tanks/standards-specifications/)), and the water-works standard sizes storage at one day's average consumption ([Recommended Standards for Water Works §7.0.1](https://www.mass.gov/doc/guidelines-for-public-water-systems-chapter-8-finished-water-storage-0/download)). A 100,000-gallon tank turned over once a day is **378.5 kL**: at 0.34 kL a person, about 1,100 people. Its borehole pumps draw a groundwater system's 1,800 kWh per million gallons ([EPA, energy at public water systems](https://www.epa.gov/sites/default/files/2015-04/documents/epa816f13004.pdf)): 180 kWh a day, **7.5 kW**.

A 100,000-gallon multi-leg tank is 30 ft across on four columns, and its legs stand inside a 20 m square ([props and vehicles](../art/props-and-vehicles.md)), so it takes one tile.

## The pumping station

Small surface-water plants are built in the 1 MGD class, serving 2,000–2,750 people each in one state's register ([NH DES, surface water systems](https://www.des.nh.gov/sites/g/files/ehbemt341/files/documents/2020-01/dwgb-13-2.pdf)); we take 1 MGD, **3,785 kL a day**, delivered as the design capacity it is. A surface-water system draws 1,500 kWh per million gallons (EPA, above): **62.5 kW**. Footprint 2×2.

## The drain

Lift stations and outfalls are classed from 1 MGD up ([Aurora lift-station guidelines](https://cdnsm5-hosted.civiclive.com/UserFiles/Servers/Server_1881137/File/Business%20Services/Development%20Center/Water%20&%20Other%20Utilities/2022/LS%20Guidelines%20Oct%202022-%20FINAL.pdf), [Cedar Rapids](https://www.cedar-rapids.org/local_government/departments_g_-_v/public_works/lift_stations.php)); the smallest, **3,785 kL a day**, takes the sewage of 12,600 people at 0.3 kL each. A gravity outfall pumps nothing. Footprint 1×1.

## What raw sewage fouls

Medium-strength domestic sewage carries about 200 mg/L of five-day oxygen demand (100–300: [OSU Extension](https://ohioline.osu.edu/factsheet/aex-768); 110–190 in the standard text), 0.2 kg a kL, **161 lb a year per kL a day**. On the scale the coal plant sets, 140 for an electric utility's 484,000 lb a year, that is 0.0466 a kL a day (`UNSEWERED_POLLUTION_PER_KL`): an outfall at its rated 3,785 kL emits **176**, and an undrained building its own sewage's share, never less than one unit.

## The works

Secondary treatment must leave no more than 30 mg/L of five-day oxygen demand in its effluent and remove at least 85% of what came in ([40 CFR 133.102](https://www.law.cornell.edu/cfr/text/40/133.102)); against raw sewage at 200 mg/L that is **15% of the load** reaching the water, so the works' `effluent` is 0.15 and it fouls the ground at 176 × 0.15 = **26**. It takes the same 3,785 kL a day as the drain, so the choice between them is only what comes out.

An activated-sludge plant of the one-million-gallon class draws **2,236 kWh per million gallons**, against about 1,000 at a hundred times the size ([EPRI, via ACEEE](https://www.aceee.org/files/proceedings/2009/data/papers/6_83.pdf)): at 1 MGD, 2,236 kWh a day, **93 kW**. Its land is the vessel sum of the first draft, a 2×2, and not the 2–5 acres a planner reserves per million gallons, which is buffer and perimeter rather than plant. It unlocks at Busy Township: a town builds a drain first and a conscience second.

## What the water carries, and how far

The fouling layer runs 0..255 and saturates where a full raw outfall empties: `WATER_FOUL_PER_KL` is 255 / 3,785, so a works at its rating emits 38 and a village's first drain a unit or two. It fades to nothing **25 tiles** (`WATER_FOUL_REACH_TILES`), 500 m, along the water.

Real rivers recover over days of travel (oxygen demand decays at 0.05–0.5 a day, [Streeter–Phelps](https://en.wikipedia.org/wiki/Streeter%E2%80%93Phelps_equation), with the oxygen sag worst two to three days downstream), which is tens of kilometres and off any map we have; and what the statutes actually regulate is the siting. One state keeps an intake **500 ft** from a treatment plant ([30 Tex. Admin. Code §290.41](https://www.law.cornell.edu/regulations/texas/30-Tex-Admin-Code-SS-290-41)), another five miles below one ([401 KAR 8:100](https://www.law.cornell.edu/regulations/kentucky/401-KAR-8-100)). Our 500 m sits between them on purpose: at the Texas setback, eight tiles, a station below a works keeps 90% of its yield, and one below a raw outfall keeps a third, which is the difference the setback was written for.

The fading is linear because nothing flows: there is no current to carry the load away or dilute it, so the stain is the same in every direction and the only lever is distance. Real flow is a heightfield simulation the world model rejects on cost.

A station five tiles from a drain emptying a full million gallons of raw sewage delivers a fifth of its 3,785 kL; one 25 tiles away delivers all of it.

## A fouled intake

Utilities shut or derate a surface intake when the raw water turns: one city closed its river intakes for 38 hours during a spill upstream and ran on its groundwater plant ([Cincinnati, 2014](https://www.cincinnati-oh.gov/water/news/west-virginia-chemical-spill/)), another switches its whole supply to wells for a week or more whenever turbidity rises ([Portland Water Bureau](https://www.portland.gov/water/about-portlands-water-system/groundwater-use)). The station's yield falls in a straight line with the fouling beside it, `waterKL × (1 − foul / 255)`, and the tower on its borehole is the groundwater plant those cities fall back on, never scaled.

## Septic tanks until Big Town

About one American household in five still is on a septic tank and so are most communities under the Census' old urban line of 2,500 people. Below **Big Town** (3,500, `SEWER_MILESTONE`) nothing in the city makes sewage. The drain and the works unlock one rung before, at Busy Township.

## Pipe

A pipe costs and keeps what a power line does, ¢12 a tile (`WATER_PIPE_COST_PER_TILE`) and ¢0.5 a month (`WATER_PIPE_UPKEEP_PER_TILE`), because it has to be the cheapest thing that reaches a shore, or a street gets laid to the water instead. Real mains run about $410 a foot for water and $350 for sewer ([Phoenix unit cost study, 2024](https://www.phoenix.gov/content/dam/phoenix/pddsite/documents/impact-fees/2025-if-update/Water%20and%20Wastewater%20Unit%20Cost%20Study_08142024_v2.pdf)), and water main and sanitary sewer share the street corridor in separate trenches ten feet apart ([Recommended Standards for Wastewater Facilities §38.31](https://www.health.state.mn.us/communities/environment/water/docs/tenstates/tenstatestan2014.pdf)), which is why a street's main is also its sewer here.

## Costs and upkeep

The station (¢3,600 / ¢180), the drain (¢1,800 / ¢90) and the works (¢9,000 / ¢520) are the programme's ladder dials, kept from the first draft: the cheapest answer to "where does it go" is the outfall, which is why real cities built them for a century. The works at five times the drain understates the real gap, if anything: a secondary plant of this class costs $12–21 million per million gallons a day to build ([a 1.2 MGD plant, 2024](https://fbmud142.com/posts/2024-12-02/wastewater-treatment-plant-expansion-to-12-million-gallon-per-day-mgd/), [an engineering rule of thumb](https://www.fehrgraham.com/about-us/blog/calculating-wastewater-treatment-plant-construction-costs-fg)) and $700–2,000 per million gallons to run, where an outfall is a pipe and a headwall.

## Catalog entries

| id            | name                  | utility                | footprint | requiresAdjacent |
| ------------- | --------------------- | ---------------------- | --------- | ---------------- |
| `water-pump`  | Water Pumping Station | `waterKL`              | 2×2       | `water`          |
| `water-drain` | Water Drain Pipe      | `sewerKL`              | 1×1       | `water`          |
| `water-tower` | Water Tower           | `waterKL` (re-derived) | 1×1       | —                |

`sewage-works` (Sewage Treatment Works) is a drain with `effluent: 0.15`: the same `sewerKL` as the outfall, its own cost, upkeep, power and `pollution`, from Busy Township. The contract test checks its pollution is the drain's times its effluent, and that the works and the drain take the same sewage.

## What it is not

- Not a flow model: no current, direction or downstream.
- Not a drinking-water treatment plant: nothing cleans fouled water on its way in; a larger, cleaner supply rung belongs to the water ladder with the power ladder's re-derivation.
- Not pipes instead of streets: re-piping every street would have put every existing city dry.
- Not drinking-water illness: there is no illness system; health has its own feature.
