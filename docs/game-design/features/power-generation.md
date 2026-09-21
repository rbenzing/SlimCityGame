# Power generation — design

- **Status:** Draft
- **Date:** 2026-09-18

## What the player gets

Three generators between the two the city starts with, and the ceiling it has
never had: a gas turbine a young town can afford, a combined-cycle station that
carries a district, and a nuclear station that carries half a city and has to be
sited on the water. The question stops being "how many more coal plants" and
becomes "what can I afford to run, where will it go, and how much smoke am I
willing to sit downwind of".

## Why it earns its place

The city has two generators and nothing between them: a 6 MW wind turbine and a
60 MW coal plant, both available at the first milestone, both placeable for ever.
There is no rung above coal, so growth is answered by repetition.

The arithmetic says how badly. Every zoned building carries a `powerUse` in MW,
working out at 0.020 MW per resident across every residential entry above level
1, plus roughly 0.035 MW per commercial job and 0.072 MW per industrial job. At
the mix the growth rules produce — about 0.45 jobs per resident, split 60/40
between commercial and industrial — a city draws about **0.044 MW per resident,
all sectors**. So:

| Milestone  | Residents | Peak demand | Coal plants | Tiles of coal plant |
| ---------- | --------- | ----------- | ----------- | ------------------- |
| Small Town | 400       | 18 MW       | 1           | 16                  |
| Small City | 8,000     | 352 MW      | 6           | 96                  |
| Grand City | 20,000    | 880 MW      | 15          | 240                 |
| Metropolis | 50,000    | 2,200 MW    | 37          | 592                 |

Thirty-seven coal plants is 592 tiles of boiler hall and 37 × 140 pollution laid
over the map — not a decision the player makes but a chore the map absorbs. The
ladder replaces it: a Metropolis on two nuclear stations is 128 tiles and no
smoke at all, and the whole game is what it costs to get there.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md). A player who
chose cheap-and-dirty over expensive-and-clean can trace the haze over their east
side back to the month they took the cheaper option.

## How it works, for the player

The demand side does not change; buildings draw what they already draw. What
changes is what the player can build to answer it.

### The ladder

| Plant                      | Output       | Footprint | Height   | Pollution | Cost         | Upkeep      | Unlocks at     |
| -------------------------- | ------------ | --------- | -------- | --------- | ------------ | ----------- | -------------- |
| Wind Turbine               | 6 MW         | 1×1       | 40 m     | —         | ¢3,000       | ¢100        | Tiny Village   |
| **Gas Turbine**            | **30 MW**    | **2×2**   | **14 m** | **17**    | **¢1,600**   | **¢680**    | **Small Town** |
| Coal Power Plant           | 60 MW        | 4×4       | 22 m     | 140       | ¢12,000      | ¢800        | Tiny Village   |
| **Combined-Cycle Station** | **250 MW**   | **5×5**   | **28 m** | **41**    | **¢17,500**  | **¢3,500**  | **Small City** |
| **Nuclear Station**        | **1,100 MW** | **8×8**   | **40 m** | **—**     | **¢535,000** | **¢11,600** | **Grand City** |

Bold rows are new. The three existing entries are untouched.

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
simulation does not dim the city. It cuts consumers in ascending building-id
order — oldest protected, newest cut — and only on their footprint tiles, so the
streets stay lit while buildings go dark, and a building three growth passes
without power abandons. Outgrowing generation kills the district the player just
built, quietly, under working street lamps. This epic does not change that rule;
it is the reason the epic exists.

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
average draw of **1.37 kW**. National grids run an annual load factor of 0.55 to
0.65, so peak is 1.5 to 1.8 times average; taking 1.6 gives a **peak of 2.2 kW,
or 0.0022 MW, per person**. The catalog charges 0.044 MW per resident — **twenty
times** that. A Small House at 0.1 MW is drawing 100 kW against a real
household's 1.2 kW average and roughly 5 kW peak. The existing numbers are not
realistic.

**We keep them, and state the convention instead.** One catalog megawatt is the
peak draw of about **23 residents and their share of the city's jobs**. Three
reasons. Dividing demand by twenty would make a single existing coal plant carry
a city of 27,000 and delete the problem this epic exists to solve. `powerUse`
sits on more than thirty catalog entries and is read directly by the cut rule
above, so rescaling it is a whole-economy rebalance wearing a power epic's
clothes. And the inflation is at least _consistent_ — every residential entry
above level 1 lands on exactly 0.020 MW per resident, a convention rather than an
accident. Water, by contrast, is honest: the tower's 400 kL serves 4,000
residents at 0.1 each against a real 150 litres per person per day. Power is the
one inflated dial.

**Capacities** stay at real nameplate, which is where the gap shows up as
gameplay: a plant here serves a twentieth of the people its real counterpart
does, and that is what makes generation something a city can outgrow. An
industrial gas turbine package runs 20–40 MW; we take **30**. A single-shaft
combined-cycle block on an F-class machine runs 250–450 MW; we take the low end,
**250**, so it does not swallow the ladder. A modern single-unit pressurised
water reactor is the 1,100 MWe class. The existing 6 MW turbine is a real modern
onshore machine and the existing 60 MW coal plant a real single subcritical unit,
so both stay.

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

**The wind turbine's 1×1 is right and its 40 m is a period piece.** A modern
turbine's spread footing is 18–22 m across, which is one tile exactly — the one
catalog entry whose footprint is the tile rather than the 13.6 m body. But the
kit builds a 34 m mast with 8.5 m blades, a rotor sweeping 266 m², and at the
400–450 W per swept m² modern machines achieve that is a **110 kW turbine
carrying a 6 MW nameplate**. An honest 6 MW rotor is 134 m across — **6.7
tiles** — on a 110 m hub, more than twice the height of the tallest building in
the catalog. We do not build that: the art bible's scale read is anchored on a
46–52 m skyline, and one prop four times taller would break every proportion
under it. The turbine stays a small machine with a large number on it.

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
coal plant keeps its ¢12,000: ¢200 per MW stands for its $3,700/kW. A combustion
turbine at $1,000/kW is 0.27 of that, a combined-cycle block at $1,300/kW is
0.35, a reactor at $9,000/kW is 2.43. Published nuclear figures span $7,000/kW
for an nth-of-a-kind estimate to $15,000/kW for recent Western first-of-a-kind
actuals; we take the middle, because the low end makes the reactor strictly
dominant and the high end makes it unbuyable.

**Upkeep** is fixed operations and maintenance plus fuel at full output, since
the simulation runs every plant at nameplate continuously. Coal's $228 per kW per
year anchors its ¢800 a month. A combustion turbine at a 10,500 Btu/kWh heat rate
comes to $388 — the dearest on the list to run, a peaking plant's character
exactly; a combined-cycle block at 6,400 Btu/kWh to $238, and a reactor to $181.

The wind turbine's ¢3,000 and ¢100 are **wrong on purpose**: the same method
gives it ¢550 and ¢15, and a turbine delivering 6 MW every hour of every year for
¢550 would dominate the ladder from one tile. Those figures are the correction
for a capacity factor the simulation does not model, and they stay.

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
