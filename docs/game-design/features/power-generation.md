# Power generation — design

- **Status:** Draft; the two existing generators re-derived from published figures, the grid sized on nameplate × capacity factor and the turbine drawn at the size of its machine, agreed 2026-10-02 and built 2026-10-05 (see [The generators, re-derived](#the-generators-re-derived))
- **Date:** 2026-09-18, baseline rewritten 2026-10-05

## What the player gets

Three generators between the two the city starts with, and the ceiling it has
never had: a gas turbine a young town can afford, a combined-cycle station that
carries a district, and a nuclear station that carries half a city and has to be
sited on the water. The question stops being "how many more coal plants" and
becomes "what can I afford to run, where will it go, and how much smoke am I
willing to sit downwind of".

## Why it earns its place

The city has two generators and nothing between them: a wind turbine that
delivers 1.1 MW on average and a coal plant that delivers 26, both available at
the first milestone, both placeable for ever. There is no rung above coal, so
growth is answered by repetition.

The arithmetic is now honest on both sides. The building-types work made every
zoned `powerUse` a surveyed average — a detached house 1.4 kW, a shop or a
workshop tens of kilowatts, a heavy plant a megawatt or two — and the
re-derivation below made every generator deliver its nameplate times the
published share of the year its kind actually runs. A developed economy draws
about 1.4 kW per person across every sector, so:

| Milestone  | Residents | Average demand | Coal plants | Turbines |
| ---------- | --------- | -------------- | ----------- | -------- |
| Small Town | 400       | 0.6 MW         | 1           | 1        |
| Small City | 8,000     | 11 MW          | 1           | 10       |
| Grand City | 20,000    | 28 MW          | 2           | 25       |
| Metropolis | 50,000    | 70 MW          | 3           | 62       |

Three coal plants is not a chore, so the ladder's case is no longer count. It
is **choice**: a Metropolis on three coal plants is 420 pollution laid over
three neighbourhoods and ¢2,400 a month in coal; on sixty-two turbines it is
sixty-two machines 170 m tall and the land they stand over; the ladder is what
sits between — a plant a town can afford, a station that carries a district
cleanly, and the one project that carries half a city and has to be sited on the
water.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md). A player who
chose cheap-and-dirty over expensive-and-clean can trace the haze over their east
side back to the month they took the cheaper option.

## How it works, for the player

The demand side does not change; buildings draw what they already draw. What
changes is what the player can build to answer it.

### The ladder

| Plant                      | Nameplate    | Delivers    | Footprint | Height    | Pollution | Cost         | Upkeep      | Unlocks at     |
| -------------------------- | ------------ | ----------- | --------- | --------- | --------- | ------------ | ----------- | -------------- |
| Wind Turbine               | 3.4 MW       | 1.1 MW      | 1×1       | 103 m hub | —         | ¢320         | ¢9          | Tiny Village   |
| **Gas Turbine**            | **30 MW**    | _to derive_ | **2×2**   | **14 m**  | **17**    | **¢1,600**   | **¢680**    | **Small Town** |
| Coal Power Plant           | 60 MW        | 26 MW       | 4×4       | 22 m      | 140       | ¢12,000      | ¢800        | Tiny Village   |
| **Combined-Cycle Station** | **250 MW**   | _to derive_ | **5×5**   | **28 m**  | **41**    | **¢17,500**  | **¢3,500**  | **Small City** |
| **Nuclear Station**        | **1,100 MW** | _to derive_ | **8×8**   | **40 m**  | **—**     | **¢535,000** | **¢11,600** | **Grand City** |

Bold rows are new. The two existing entries carry the re-derived figures below;
the new rows keep the draft's nameplate figures and will take capacity factors
of their own when they are built — a gas turbine is a peaker that runs 14% of
the year, a combined-cycle block 60%, a reactor 91%
([EIA, Electric Power Monthly 6.07.A/B](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_6_07_a)),
which reorders the ladder's economics and is this draft's next revision.

**The gas turbine is the cheap thing to build and the dear thing to run.** It
costs ¢54 per MW against the coal plant's ¢200, and ¢22.70 per MW per month
against coal's ¢13.30, so **coal pays its premium back in about sixteen
months**. That is the first real decision the power system has offered: capacity
you can afford now, or capacity you can afford to keep.

**The combined-cycle station is the workhorse.** It is the same fuel as the gas
turbine burned twice, which in the real plant nearly doubles the efficiency;
here that shows as four times the coal plant's output for a third of its smoke
per MW. It is cheaper per MW to build than coal and no dearer to run, so it does
not compete with the coal plant — it **supersedes** it. That is the correct
relationship and the plan says so rather than hiding it: the decision is when
the player can afford to stop burning coal, not whether coal is still worth
building.

**The nuclear station is the ceiling, and it is a project.** A Grand City of
20,000 residents and about 9,000 jobs grosses roughly ¢31,000 a month in tax, so
¢535,000 is some seventeen months of gross income — saved for or borrowed
against, the only object in the game that has to be planned. In return it runs a
city of 25,000, emits nothing, and costs less per MW per month than anything
else on the list.

### Siting

The nuclear station is the first generator that cannot go just anywhere: **its
footprint must touch water.** A 1,100 MW unit rejects about twice its electrical
output as heat, and every station of that class sits on a river, a lake or a
coast for the condenser cooling that requires. In the game that means the
shoreline, which is also the best land the player has — so the reactor costs
ground as well as treasury, and the power line is how its output gets inland.
Nothing else gains a constraint.

Each plant is read by its **plant**, not its offices, per
[../../art/civic-massing.md](../../art/civic-massing.md) — the gas turbine by its
inlet house and stack, the combined-cycle station by its boiler casing, the
reactor by its containment dome — and all three join the detail kits in
[../../art/props-and-vehicles.md](../../art/props-and-vehicles.md).

## What it interacts with

**Brownouts, which are not brownouts.** When demand exceeds supply the
simulation does not dim the city. The grid gives out from its far end — the
buildings furthest along the network from a generator are cut first — and only
on their footprint tiles, so the streets stay lit while buildings go dark, and a
building three growth passes without power abandons. Nothing new moves in while
the grid is full, and the Advisor says how far short it is. Outgrowing
generation still costs the player the edge of the city. This epic does not
change that rule; it is the reason the epic exists.

**The power line.** Supply is city-wide, not per-network, so any generator feeds
any consumer the sealed roads or a strung line can reach. The nuclear station's
shoreline siting makes the line load-bearing rather than a convenience — see
[../../world-sim/utilities-model.md](../../world-sim/utilities-model.md).

**Pollution and land value.** The pollution field condemns residential growth
above 170, and the coal plant's 140 sits just under it, so one plant does not
blight its neighbours and two overlapping do. The new values keep that property:
five gas turbines or three combined-cycle stations must overlap before housing
beside them stops growing.

**Service capacity.** Power is a utility rather than a service field, so it
consumes nothing [service-capacity.md](service-capacity.md) builds.

## Tuning

Every figure above is derived; the arithmetic lives here, and the settled numbers
belong in [../balancing.md](../balancing.md) once they stop moving.

**Per-capita demand.** A developed economy consumes about 12,000 kWh of
electricity per person per year, all sectors, which over 8,760 hours is an
average draw of **1.37 kW**. The catalog now draws that: the building-types
work put every zoned entry on a surveyed average, and
[the re-derivation below](#the-generators-re-derived) put every ploppable on
one too. Supply is an average as well, a plant's nameplate times its capacity
factor, so the grid compares like with like and a plant here serves the people
its real counterpart does. The old convention — one catalog megawatt as the
peak draw of twenty-three residents, kept because dividing demand by twenty
would have deleted the problem — is gone, and the problem is smaller than the
first draft said: see the table above.

**Capacities** are nameplate × capacity factor. An industrial gas turbine
package runs 20–40 MW; we take **30**. A single-shaft combined-cycle block on
an F-class machine runs 250–450 MW; we take the low end, **250**, so it does
not swallow the ladder. A modern single-unit pressurised water reactor is the
1,100 MWe class. The wind turbine is the average onshore machine installed in
2023, **3.4 MW**, and the coal plant a **60 MW** unit at the small end of what
is built and retired: the units retired in 2015 averaged 133 MW
([EIA](https://www.eia.gov/todayinEnergy/detail.php?id=25272)), a 99 MW lignite
unit opened in 2014
([Great River Energy](https://greatriverenergy.com/electricity-sources/combined-heat-power/)),
and the Department of Energy's small-modular coal band runs 50–350 MW
([DOE](https://www.energy.gov/hgeo/articles/small-scale-modular-coal-fired-plants-future)).

**Footprints** come from the plant's built plate at grade, not from floor area.
[../../art/civic-massing.md](../../art/civic-massing.md) sizes a building by
occupant load, but a boiler hall is one volume with nobody in it, and the same
page says a process utility is read by its plant. Its formula bears that out: the
coal plant's 4×4 at 22 m is 16 × 185 × (22 ÷ 3.2) = **20,350 m² of notional
floor** against roughly **2,900 m² of real plate**, seven times over. So we
divide plate area by the 185 m² a tile of body carries:

| Plant          | Real built plate                       | ÷ 185 | Footprint | Plate we get |
| -------------- | -------------------------------------- | ----- | --------- | ------------ |
| Gas turbine    | 40 × 18 m = 720 m²                     | 3.9   | 2×2       | 740 m²       |
| Coal plant     | boiler house + turbine hall ≈ 2,900 m² | 15.7  | 4×4 ✓     | 2,960 m²     |
| Combined-cycle | hall + boiler casing ≈ 4,300 m²        | 23.2  | 5×5       | 4,625 m²     |
| Nuclear        | single-unit power block ≈ 11,700 m²    | 63.2  | 8×8       | 11,840 m²    |

The existing coal plant's 4×4 is **right**, the best evidence the method is
sound. Its 22 m is short — a 60 MW boiler house stands nearer 40 m — but the
kit's stacks reach 26 m above it, so the silhouette reads and changing a shipped
entry for no simulation reason is not this epic's business.

**Heights** are the tallest enclosed volume, stack and dome left to the kit: the
gas turbine's inlet house at **14 m**, the combined-cycle casing at **28 m**, the
nuclear turbine hall at **40 m** under a dome the kit takes to about 65 m. The
reactor's 8×8 **breaks the six-tile rule deliberately**: that rule protects the
siting of services a growing city needs everywhere, and a reactor is the one
building meant to demand cleared ground.

**The wind turbine's 1×1 is right, and it is now drawn at the size of its
machine.** A modern turbine's spread footing is 18–22 m across, which is one
tile exactly — the one catalog entry whose footprint is the tile rather than the
13.6 m body. The first draft kept a 34 m mast with 8.5 m blades, a rotor
sweeping 266 m² that at modern power densities is a 110 kW machine, because one
prop three times the height of the tallest building would break the art bible's
scale read. The decision went the other way on 2026-10-02: a real turbine
towers over a town three times over, that is what it looks like, and a player
should see the thing their figure describes. The kit now builds the 2023
average — a 103 m hub, a 134 m rotor sweeping three tiles either side — and the
art bible notes it as the one placeable drawn above the skyline on purpose.

**Pollution** is derived from local air-pollutant intensity — nitrogen oxides,
sulphur dioxide and fine particulates per MWh, with the controls a modern plant
carries — multiplied by capacity, then scaled so the existing coal plant lands
on its existing 140:

| Plant          | NOx + SO₂ + PM (kg/MWh)     | Relative to coal | × MW  | Pollution    |
| -------------- | --------------------------- | ---------------- | ----- | ------------ |
| Coal           | 0.75 + 0.90 + 0.06 = 1.71   | 1.00             | 102.6 | 140 (anchor) |
| Gas turbine    | 0.40 + 0.003 + 0.01 = 0.41  | 0.24             | 12.3  | **17**       |
| Combined-cycle | 0.11 + 0.002 + 0.005 = 0.12 | 0.07             | 30.0  | **41**       |
| Nuclear        | 0 at the stack              | 0                | 0     | **none**     |

The coal plant's own 140 is an anchor, not a derivation — it was chosen to sit
under the 170 growth threshold, and we keep it as the anchor rather than pretend
it fell out of a standard.

**Milestones** follow demand: the gas turbine at Small Town (18 MW wanted, so it
is the first upgrade rather than the opening move), the combined-cycle station at
Small City (352 MW), the reactor at Grand City (880 MW, one station covering it).

**Costs** come from published overnight capital cost per kilowatt, scaled so the
coal plant keeps its ¢12,000: ¢200 per MW stands for its $4,507/kW
([EIA, AEO2023 cost and performance](https://www.eia.gov/outlooks/aeo/assumptions/pdf/elec_cost_perf.pdf)),
¢1 for about $22,500. The draft's figures for the new rungs ($1,000/kW for a
combustion turbine, $1,300/kW combined-cycle, $9,000/kW nuclear, the middle of
a $7,000–15,000 range because the low end makes the reactor strictly dominant
and the high end makes it unbuyable) are to be redone from the same table when
they are built.

**Upkeep** is fixed operations and maintenance plus fuel at the output a plant
actually delivers. Coal's $8.65 million a year — $45.68 per kW-year fixed,
$5.06 per MWh variable, and 8,638 Btu per kWh of coal at $2.47 per million Btu
([EIA, Electric Power Annual 7.4](https://www.eia.gov/electricity/annual/html/epa_07_04.html))
over the 224,000 MWh a 60 MW unit makes at 42.6% — anchors its ¢800 a month, ¢1
a month for about $900 a year. The draft's gas, combined-cycle and nuclear
figures assumed full output and will be redone with their factors.

The wind turbine is now the same method, honestly: $2,098/kW gives **¢320**,
and $29.64 per kW-year of fixed cost with nothing to burn gives **¢9 a month**,
for 1.1 MW delivered. It is the cheapest electricity on the list per megawatt,
as onshore wind is, and it is no longer a free lunch on one tile because it
delivers a third of the nameplate the first draft paid it for.

## The generators, re-derived

Built 2026-10-05, ahead of the ladder, as the last of the three
water-and-sewage changes: once every zoned draw and every water figure was a
surveyed average, the two generators were the last catalog numbers nobody
could point at a source for. Each figure below is in `catalog.json` and
checked by the catalog contract test.

**Supply is nameplate × capacity factor.** `UtilitySpec.capacityFactor` is
the published share of the year a plant of its kind runs at rating; the grid
sums `powerMW × capacityFactor` and the inspector shows both. Coal's fleet ran
at **42.6%** in 2024
([EIA, Electric Power Monthly 6.07.A](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_6_07_a)),
so the 60 MW plant delivers **25.6 MW**. Wind's whole fleet, old small
machines included, ran at 25%
([6.07.B](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_6_07_b));
the modern fleet the catalog's turbine belongs to ran at **33.5%** in 2023,
and the newest projects at 38%
([LBNL, Land-Based Wind Market Report, 2024 edition](https://www.energy.gov/eere/wind/land-based-wind-market-report-2024-edition)).
We take the modern fleet's figure, so the turbine delivers **1.14 MW**.

**The turbine is the average new machine.** Turbines installed in the United
States in 2023 averaged **3.4 MW**, a **103 m** hub and a **134 m** rotor
(LBNL, above). A representative machine of that class has a 12.8 × 4.2 ×
6.9 m nacelle, 66.7 m blades and a 4.2–4.3 m tower base
([Vestas V136-3.45](https://www.vestas.ca/en-ca/onshore-wind-turbines/4-mw-platform/V136-3-45-MW)),
which is what the kit draws. Its cost and upkeep are derived in Tuning above.

**What a turbine costs in land is not modelled, and the design says so.** A
wind project spreads 34 ha per megawatt, with turbines 5 to 10 rotor diameters
apart, though only 0.3 ha per megawatt is pad and road
([NREL, Denholm 2009](https://docs.nlr.gov/docs/fy09osti/45834.pdf)). One
state's siting code keeps a turbine 1.1 tip heights from a property line and
3.1 tip heights, or 1,250 ft, from a neighbour's house, for a night limit of
45 dBA
([Wisconsin PSC 128.13–14](https://docs.legis.wisconsin.gov/document/administrativecode/PSC%20128.14)).
The catalog's turbine stays a one-tile placeable with no spacing rule: at the
game's noise anchor distance its 104–106 dB(A) of sound power
([Vestas V136-4.2](https://www.vestas.com/en/energy-solutions/onshore-wind-turbines/4-mw-platform/V136-4-2-MW))
arrives from a hub 103 m up at about 54 dBA, below the noise field's floor,
so it carries no `noise`; and a project-area rule would make a one-tile card
absurd. A spacing rule is the honest next step if sixty turbines on sixty
tiles turns out to be the dominant strategy.

**The coal plant keeps its anchors.** Its ¢12,000, ¢800 and pollution of 140
were chosen before any of this and everything else is scaled to them; the
pollution anchor is itself tied to the Toxics Release Inventory (an electric
utility released about half a million pounds in 2023, 388 facilities
([EPA TRI](https://www.epa.gov/trinationalanalysis/electric-utilities-waste-management-trend))),
which is where the zoned plants' figures hang. What it drinks is its staff's
water: a plant of this size runs on about fifty people, and its cooling water
is raw water from its own intake, not the city's, so `waterUse` is 5 kL a
day, not the thousand a cooling tower evaporates. The incinerator's 120 stays
a dial: municipal waste-to-energy plants do not report to the Inventory, so
there is no like-for-like figure to derive it from.

## What it is not

- **Not intermittency, and therefore not a solar farm.** The technical document
  rules solar out on land area alone, and the cut rule above is why a supply
  that varies would abandon districts rather than dim them.
- **Not a demand rebalance.** `powerUse` is untouched; the convention is
  documented, not fixed.
- **Not hydroelectricity.** The map's water is a flat mask with no flow or head,
  so a dam's output could only be picked, which the tuning rule forbids.
- **Not a new utility network, and not a rework of the coal plant.** Supply stays
  city-wide, coverage stays the road-and-line walk it is, the cut rule does not
  change, and the coal plant keeps its size, price and smoke.
- Programme context: [municipal-services.md](municipal-services.md). Technical
  plan: [../../engineering/features/power-generation.md](../../engineering/features/power-generation.md).
  Anything that should never be built belongs in [../../DESIGN.md](../../DESIGN.md).
