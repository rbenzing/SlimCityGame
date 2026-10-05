# Water and sewage — design

- **Status:** Agreed 2026-10-02; pipes, the pumping station, the drain pipe and sewerage built 2026-10-02; the fouled water, the intake that drinks it and the sewage treatment works agreed and built 2026-10-02
- **Date:** 2026-09-18, rewritten 2026-10-02

## What the player gets

Water becomes a loop instead of a tap. The city draws it from a **pumping
station** on a shore or from a **water tower** on its borehole, carries it
along its streets and, where no street goes, along **pipes** the player lays;
and what the city has drunk comes back out as sewage, along the same mains
and pipes, to a **drain pipe** on a shore. A small town is on septic tanks
and needs none of this: a street with power and water grows, as it always
did. From **Big Town** (3,500 people) the town has outgrown its tanks: a lot
grows only where a drain reaches it, a building nothing drains stinks, and
nothing new grows beside it until the player gives the town a sewer. The
drain unlocks one rung before, and the Advisor says what is coming.

And the water remembers. Where a drain empties, the water goes brown for
hundreds of metres along the shore, and a pumping station drinking from
that stretch delivers less of its rating the browner the water is. A player
who puts the outfall beside the intake poisons their own supply and can see
it happen on the water itself, before any lens. The way out is siting, or
the **sewage treatment works**: five times the price of a drain for the same
sewage, and what comes out of it fouls the water at a seventh of the rate.

Epic 1 of the programme in [municipal-services.md](municipal-services.md),
started where the player asked for it: an intake, an outfall and the pipe
that joins them to the town.

## Why it earns its place

The city produced water and distributed it, and there the system stopped.
There was no consequence to drawing water and none to using it, so the only
question the player ever answered about water was "have I built enough
towers?" — one dial with one right answer. Closing the loop turns that into
a siting problem with a visible cost: sewage has to go somewhere, somewhere
is always water, and water is where the city's own intake is. The pipe makes
both reachable, since the shore is rarely where the streets are.

Serves pillar 3, **the city is legible through data lenses**, in
[../gdd.md](../gdd.md): a Water lens and a Sewer lens, and the pipes drawn on
the ground whenever the player is working on the water.

## How it works, for the player

### Pipes

A **water pipe** is painted like a power line, dragged along a run of tiles
for a few coins a tile, and it does for water what the line does for power:
it carries water, and the sewage coming back, between its own tiles and into
any street or building it touches. One pipe carries both flows; on the
ground, while a water tool is in hand or a water lens is on, it shows as a
blue run beside a brown one. Streets keep their mains, so a town that has
never laid a pipe loses nothing; pipe is for reaching a shore, crossing a
motorway or a railway that carries no main, or serving a lot down a lane no
main runs along. A pipe may not cross open water and will not stand on a
building; the bulldozer pulls it up with a refund, and undo lays it back.

### Water in

- **Water Tower.** A 100,000-gallon elevated tank on its borehole, the
  standard small-town size, stands anywhere and supplies 378.5 kL a day, the
  one day's average demand a tank is sized to hold: about 1,100 people.
- **Water Pumping Station.** A surface-water intake of the smallest class,
  one million gallons a day, 3,785 kL, that must stand on a shore, its
  footprint touching the water it draws from. From Small Town.

### Sewage out

Every building that draws city water makes sewage: **88% of what it draws**,
the share public supply does not consume. A house on a well is on a septic
tank and makes none for the town; a farm makes none.

- **Water Drain Pipe.** An outfall of the same one-million-gallon class that
  must stand on a shore, taking 3,785 kL of sewage a day and emptying it, raw,
  into the water. Available from the first day: a town's first civic works.
  It fouls the ground around it as any dirty plant does, 176 on the pollution
  scale, so nobody wants to live beside it.
- **Sewage Treatment Works.** A secondary treatment plant of the same
  one-million-gallon class, 3,785 kL of sewage a day, that must also stand on
  a shore, since what it has treated still goes back to the water. It takes
  the same sewage as a drain at five times the price and real upkeep, draws
  power for its aeration, and what it discharges carries 15% of the raw
  load: it fouls the ground at 26 and the water at a seventh of a drain's
  rate. From Busy Township.

The two are deliberately the same size. The choice between them is entirely
about what comes out the far end, and the drain is always the cheaper answer
to the question the player is actually asked, which is why real cities built
outfalls for a century.

**Sewage is the third utility.** A drain reaches the buildings along the
streets and pipes connected to it, as a tower reaches theirs; the buildings
it reaches line up by distance; when they make more sewage than the drains
take, the far end of the line is cut, exactly as water is. The City Info
popover reads the sewage drained against the sewage made, the inspector
reads what a drain takes, and the Sewer lens paints what the drains reach.

### What the water carries

**Fouling spreads along the water, and only along the water.** Each drain
and works empties the sewage it actually takes into the water tile beside
it, and the fouling spreads from there across connected water, strongest at
the mouth and fading to nothing 25 tiles away, 500 m. It never crosses land:
a lake over a ridge is untouched however close it looks, and two fouled
stretches that meet simply take the worse of the two. The water shows it
without a lens, the surface going from its blue toward a murky brown with
the fouling, so a spoiled shore reads from the air the way a smoking plant
does.

A drain that takes nothing fouls nothing: the stain grows with the town's
sewage, so a village's first outfall is a smudge and a city's is a brown
reach, and treating the sewage shrinks it the day the works opens. There is
no current and no downstream. Real flow is a heightfield simulation the
world model rejects on cost, so the fouling spreads the same way in every
direction, and the player's lever is distance, or treatment.

**A fouled intake delivers less.** A pumping station draws from the water
beside it, and delivers its rating scaled by how clean that water is: a
station five tiles from a drain emptying a full million gallons of raw
sewage delivers a fifth of its 3,785 kL, and one 25 tiles away delivers all
of it. The water tower, on its borehole, is untouched. The inspector reads
what the station delivers against its rating, the City Info popover's water
line counts what the fouling cost, and the Advisor says a station is
drinking fouled water and names the two remedies: move the outfall, or
treat the sewage. Nothing is abandoned for it directly; a city short of
water from a fouled intake is short of water, and the ordinary far-end cut
and its advice apply.

### Septic tanks until Big Town

A town of a few hundred or a couple of thousand people is on septic tanks,
as about one American household in five still is and most communities
under the Census' old urban line of 2,500 people are. Below **Big Town**
(3,500, `SEWER_MILESTONE`) nothing in the city makes sewage: there is no
drain to want, nothing is flagged, nothing stinks, and a street with power
and water grows. The drain pipe and the treatment works unlock the rung
before, at Busy Township, and a Busy Township with no drain hears from the
Advisor that it is outgrowing its septic tanks and where to build one. The
tick the city becomes a Big Town, every building on the mains is on the
sewer at once: a town that listened is ready, and one that did not stops
growing until it builds a drain. A city loaded past that line without a
drain does the same.

### What happens without a drain, from Big Town

- **Nothing new grows there.** A lot grows and a building levels up only
  where a drain reaches it with room for its sewage, as they already need
  power and water. The Advisor counts the zoned land and the growth a missing
  or full drain holds back, like a short grid.
- **What already stands, stinks.** A building no drain reaches is flagged
  **No Sewer** and fouls the ground around it in proportion to its sewage:
  cesspits and foul ditches. Land value falls, the lens shows it, and the
  building is never abandoned for it. A Big Town saved before this change
  loads standing, a little dirtier, and stops growing until it builds a
  drain.

## What it interacts with

- **The existing water network.** Supply, road-borne propagation and the
  far-end cut in [../../world-sim/utilities-model.md](../../world-sim/utilities-model.md)
  are unchanged; pipes join the walk as a second conductor, and the sewer is
  the same walk from the drains.
- **Wells.** A low-density house on a dirt road with no main beside its lot
  is on a well; a pipe beside the lot is a main, and puts the house on the
  mains and the sewer both.
- **Pollution.** An undrained building, an outfall and a works emit into the
  ordinary Pollution field through the per-building emission pass, so land
  value and happiness respond with no new machinery. The water's fouling is
  its own layer, read by the intakes and the water surface and by nothing
  else: there is no illness system, and a fouled shore costs the city its
  water, not its health.
- **Growth.** From Big Town, sewer coverage and spare drain capacity join
  power and water as conditions for a spawn and a level-up; a lot held back
  only by a drain is waiting for supply like one held back by a tower. Below
  it growth asks for power and water alone, as the first-town guard in
  `tests/interaction/firsttown.test.ts` holds it to. A fouled intake lowers
  the water supply the spawner has to hand out, and nothing else.
- **Progression.** The one place a milestone changes a rule rather than an
  unlock ([progression.md](../progression.md#milestones)).
- **Saves.** The pipe layer is appended to the tile record (save version 14);
  an older save loads with no pipes. The drained coverage and the water's
  fouling are derived every utility pass from what stands, and never saved:
  a loaded city's water is as fouled as its drains make it the moment it
  loads.

## Tuning

Every figure below is derived from a published source and our own 20 m tile;
the settled values are in [../balancing.md](../balancing.md#water-and-sewer).

**Return to sewer.** Public supply consumes 12% of what it withdraws, 0.08
to 0.23 by region, the rest returning as wastewater
([USGS, water years 2010–20](https://pubs.usgs.gov/publication/pp1894D/full));
the engineering range is 60–90%
([WEF MOP 8, as applied by a facilities plan](https://portal.ct.gov/-/media/DEEP/water/municipal_wastewater/Bridgeport-FP-Section-05-112430.pdf)).
We take the national figure: **0.88**.

**The tower.** Elevated tanks come in standard sizes from 50,000 to
2,000,000 gallons, 100,000 among them
([Caldwell Tanks](https://www.caldwelltanks.com/tank_types/multi-column-elevated-storage-tank-leg),
[Phoenix Fabricators](https://phoenixtank.com/elevated-water-storage-tanks/standards-specifications/)),
and the water-works standard sizes storage at one day's average consumption
([Recommended Standards for Water Works §7.0.1](https://www.mass.gov/doc/guidelines-for-public-water-systems-chapter-8-finished-water-storage-0/download)).
A 100,000-gallon tank turned over once a day is **378.5 kL**: at 0.34 kL a
person, about 1,100 people. Its borehole pumps draw a groundwater system's
1,800 kWh per million gallons
([EPA, energy at public water systems](https://www.epa.gov/sites/default/files/2015-04/documents/epa816f13004.pdf)):
180 kWh a day, **7.5 kW**.

**The pumping station.** Small surface-water plants are built in the
1 MGD class, serving 2,000–2,750 people each in one state's register
([NH DES, surface water systems](https://www.des.nh.gov/sites/g/files/ehbemt341/files/documents/2020-01/dwgb-13-2.pdf));
we take 1 MGD, **3,785 kL a day**, delivered as the design capacity it is. A
surface-water system draws 1,500 kWh per million gallons (EPA, above): **62.5
kW**.

**The drain.** Lift stations and outfalls are classed from 1 MGD up
([Aurora lift-station guidelines](https://cdnsm5-hosted.civiclive.com/UserFiles/Servers/Server_1881137/File/Business%20Services/Development%20Center/Water%20&%20Other%20Utilities/2022/LS%20Guidelines%20Oct%202022-%20FINAL.pdf),
[Cedar Rapids](https://www.cedar-rapids.org/local_government/departments_g_-_v/public_works/lift_stations.php));
the smallest, **3,785 kL a day**, takes the sewage of 12,600 people at 0.3 kL
each. A gravity outfall pumps nothing.

**What raw sewage fouls.** Medium-strength domestic sewage carries about
200 mg/L of five-day oxygen demand (100–300:
[OSU Extension](https://ohioline.osu.edu/factsheet/aex-768); 110–190 in the
standard text) — 0.2 kg a kL, **161 lb a year per kL a day**. On the scale
the coal plant sets, 140 for an electric utility's 484,000 lb a year, that
is 0.0466 a kL a day: an outfall at its rated 3,785 kL emits **176**, and an
undrained building its own sewage's share, never less than one unit.

**The works.** Secondary treatment must leave no more than 30 mg/L of
five-day oxygen demand in its effluent and remove at least 85% of what came
in ([40 CFR 133.102](https://www.law.cornell.edu/cfr/text/40/133.102));
against raw sewage at 200 mg/L that is **15% of the load** reaching the
water, so the works' `effluent` is 0.15 and it fouls the ground at 176 ×
0.15 = **26**. It takes the same 3,785 kL a day as the drain, so the choice
between them is only what comes out. An activated-sludge plant of the
one-million-gallon class draws **2,236 kWh per million gallons**, against
about 1,000 at a hundred times the size
([EPRI, via ACEEE](https://www.aceee.org/files/proceedings/2009/data/papers/6_83.pdf)):
at 1 MGD, 2,236 kWh a day, **93 kW**. Its land is the vessel sum of the
first draft, a 2×2, and not the 2–5 acres a planner reserves per million
gallons, which is buffer and perimeter rather than plant. It unlocks at Busy
Township: a town builds a drain first and a conscience second.

**What the water carries, and how far.** The fouling layer runs 0..255 and
saturates where a full raw outfall empties: `WATER_FOUL_PER_KL` is
255 / 3,785, so a works at its rating emits 38 and a village's first drain a
unit or two. It fades to nothing **25 tiles**, 500 m, along the water.
Real rivers recover over days of travel (oxygen demand decays at
0.05–0.5 a day
([Streeter–Phelps](https://en.wikipedia.org/wiki/Streeter%E2%80%93Phelps_equation)),
with the oxygen sag worst two to three days downstream), which is tens of
kilometres and off any map we have; and what the statutes actually regulate
is the siting. One state keeps an intake **500 ft** from a treatment plant
([30 Tex. Admin. Code §290.41](https://www.law.cornell.edu/regulations/texas/30-Tex-Admin-Code-SS-290-41)),
another five miles below one
([401 KAR 8:100](https://www.law.cornell.edu/regulations/kentucky/401-KAR-8-100)).
Our 500 m sits between them on purpose: at the Texas setback, eight tiles,
a station below a works keeps 90% of its yield, and one below a raw outfall
keeps a third, which is the difference the setback was written for. The
fading is linear because nothing flows: there is no current to carry the
load away or dilute it, so the stain is the same in every direction and the
only lever is distance.

**A fouled intake.** Utilities shut or derate a surface intake when the raw
water turns: one city closed its river intakes for 38 hours during a spill
upstream and ran on its groundwater plant
([Cincinnati, 2014](https://www.cincinnati-oh.gov/water/news/west-virginia-chemical-spill/)),
another switches its whole supply to wells for a week or more whenever
turbidity rises
([Portland Water Bureau](https://www.portland.gov/water/about-portlands-water-system/groundwater-use)).
The station's yield falls in a straight line with the fouling beside it,
`waterKL × (1 − foul / 255)`, and the tower on its borehole is the
groundwater plant those cities fall back on, never scaled.

**Pipe.** A pipe costs and keeps what a power line does, ¢12 a tile and
¢0.5 a month, for the same reason: it has to be the cheapest thing that
reaches a shore, or a street gets laid to the water instead. Real mains run
about $410 a foot for water and $350 for sewer
([Phoenix unit cost study, 2024](https://www.phoenix.gov/content/dam/phoenix/pddsite/documents/impact-fees/2025-if-update/Water%20and%20Wastewater%20Unit%20Cost%20Study_08142024_v2.pdf)),
and water main and sanitary sewer share the street corridor in separate
trenches ten feet apart
([Recommended Standards for Wastewater Facilities §38.31](https://www.health.state.mn.us/communities/environment/water/docs/tenstates/tenstatestan2014.pdf)),
which is why a street's main is also its sewer here.

**Costs and upkeep** of the station (¢3,600 / ¢180), the drain (¢1,800 /
¢90) and the works (¢9,000 / ¢520) are the programme's ladder dials, kept
from the first draft: the cheapest answer to "where does it go" is the
outfall, which is why real cities built them for a century. The works at
five times the drain understates the real gap, if anything: a secondary
plant of this class costs $12–21 million per million gallons a day to build
([a 1.2 MGD plant, 2024](https://fbmud142.com/posts/2024-12-02/wastewater-treatment-plant-expansion-to-12-million-gallon-per-day-mgd/),
[an engineering rule of thumb](https://www.fehrgraham.com/about-us/blog/calculating-wastewater-treatment-plant-construction-costs-fg))
and $700–2,000 per million gallons to run, where an outfall is a pipe and a
headwall.

## What it is not

- **Not a flow model.** No current, no direction, no downstream; real flow
  is a heightfield simulation the world model rejects on cost. The fouling
  spreads evenly along the water and the player's lever is distance.
- **Not a drinking-water treatment plant.** The works treats sewage before
  it goes back; nothing cleans fouled water on its way in. An intake
  drinking fouled water is a siting mistake, bought back by moving one end
  or treating the other, not by a third building. A larger, cleaner supply
  rung belongs to the water ladder with the power ladder's re-derivation.
- **Not pipes instead of streets.** A street carries its main as it always
  did; the pipe reaches where the street does not. Re-piping every street
  would have put every existing city dry.
- **Not abandonment for a missing sewer.** The consequence is no growth and a
  dirtier town, so a city from before this change loads whole.
- **Not a sewer from the first day.** The first cut of this feature asked
  every town for a drain from its first house, and both drains want a shore,
  so a new town inland could never grow and nothing on screen said why;
  1.31.0 shipped that way. A town is on septic tanks until Big Town instead,
  and the first-town guard keeps the opening free of any such prerequisite.
- **Not drinking-water illness.** There is no illness system; health is
  epic 2.
