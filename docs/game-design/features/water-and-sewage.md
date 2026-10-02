# Water and sewage — design

- **Status:** Agreed 2026-10-02; pipes, the pumping station, the drain pipe and sewerage built 2026-10-02; the river's contamination and the treatment plant follow in their own change
- **Date:** 2026-09-18, rewritten 2026-10-02

## What the player gets

Water becomes a loop instead of a tap. The city draws it from a **pumping
station** on a shore or from a **water tower** on its borehole, carries it
along its streets and, where no street goes, along **pipes** the player lays;
and what the city has drunk comes back out as sewage, along the same mains
and pipes, to a **drain pipe** on a shore. A lot grows only where a drain
reaches it. A building nothing drains stinks, and nothing new grows beside
it until the player gives the town a sewer.

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

**Sewage is the third utility.** A drain reaches the buildings along the
streets and pipes connected to it, as a tower reaches theirs; the buildings
it reaches line up by distance; when they make more sewage than the drains
take, the far end of the line is cut, exactly as water is. The City Info
popover reads the sewage drained against the sewage made, the inspector
reads what a drain takes, and the Sewer lens paints what the drains reach.

### What happens without a drain

- **Nothing new grows there.** A lot grows and a building levels up only
  where a drain reaches it with room for its sewage, as they already need
  power and water. The Advisor counts the zoned land and the growth a missing
  or full drain holds back, like a short grid.
- **What already stands, stinks.** A building no drain reaches is flagged
  **No Sewer** and fouls the ground around it in proportion to its sewage:
  cesspits and foul ditches. Land value falls, the lens shows it, and the
  building is never abandoned for it. A city saved before this change loads
  standing, a little dirtier, and stops growing until it builds a drain.

## What it interacts with

- **The existing water network.** Supply, road-borne propagation and the
  far-end cut in [../../world-sim/utilities-model.md](../../world-sim/utilities-model.md)
  are unchanged; pipes join the walk as a second conductor, and the sewer is
  the same walk from the drains.
- **Wells.** A low-density house on a dirt road with no main beside its lot
  is on a well; a pipe beside the lot is a main, and puts the house on the
  mains and the sewer both.
- **Pollution.** An undrained building and an outfall emit into the ordinary
  Pollution field through the per-building emission pass, so land value and
  happiness respond with no new machinery. What an outfall does to the river
  is the next change.
- **Growth.** Sewer coverage and spare drain capacity join power and water
  as conditions for a spawn and a level-up; a lot held back only by a drain
  is waiting for supply like one held back by a tower.
- **Saves.** The pipe layer is appended to the tile record (save version 14);
  an older save loads with no pipes. The drained coverage is derived every
  utility pass and never saved.

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
undrained building its own sewage's share, never less than one unit. The
secondary-treatment limit a works meets is 30 mg/L
([40 CFR 133.102](https://www.law.cornell.edu/cfr/text/40/133.102)), which is
what the treatment plant will buy in the next change.

**Pipe.** A pipe costs and keeps what a power line does, ¢12 a tile and
¢0.5 a month, for the same reason: it has to be the cheapest thing that
reaches a shore, or a street gets laid to the water instead. Real mains run
about $410 a foot for water and $350 for sewer
([Phoenix unit cost study, 2024](https://www.phoenix.gov/content/dam/phoenix/pddsite/documents/impact-fees/2025-if-update/Water%20and%20Wastewater%20Unit%20Cost%20Study_08142024_v2.pdf)),
and water main and sanitary sewer share the street corridor in separate
trenches ten feet apart
([Recommended Standards for Wastewater Facilities §38.31](https://www.health.state.mn.us/communities/environment/water/docs/tenstates/tenstatestan2014.pdf)),
which is why a street's main is also its sewer here.

**Costs and upkeep** of the station (¢3,600 / ¢180) and the drain (¢1,800 /
¢90) are the programme's ladder dials, kept from the first draft: the
cheapest answer to "where does it go" is the outfall, which is why real
cities built them for a century.

## What it is not

- **Not a flow model.** No current, no direction, no downstream; real flow
  is a heightfield simulation the world model rejects on cost.
- **Not the river's contamination, and not treatment** — yet. What an
  outfall does to the water, an intake drinking it, and the treatment plant
  that buys the mistake back are the next change; the first draft's design
  for them stands.
- **Not pipes instead of streets.** A street carries its main as it always
  did; the pipe reaches where the street does not. Re-piping every street
  would have put every existing city dry.
- **Not abandonment for a missing sewer.** The consequence is no growth and a
  dirtier town, so a city from before this change loads whole.
- **Not drinking-water illness.** There is no illness system; health is
  epic 2.
