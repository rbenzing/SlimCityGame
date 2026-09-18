# Water and sewage — design

- **Status:** Draft
- **Date:** 2026-09-18

## What the player gets

Water becomes a loop instead of a tap. The city draws it out of a river, and
what it has drunk comes back out the other end — either through a cheap pipe
that spoils the water, or through a works that costs five times as much and does
not. A player who puts the outfall beside the intake poisons their own drinking
water and can see it happen, in the colour of the river, before anything
abandons. Epic 1 of the programme in
[municipal-services.md](municipal-services.md).

## Why it earns its place

The city produces water and distributes it, and there the system stops. There is
no consequence to drawing water and none to using it, so the only question the
player ever answers about water is "have I built enough towers?" — one dial with
one right answer. Closing the loop turns that into a siting problem with a
visible cost: sewage has to go somewhere, somewhere is always water, and water
is where the city's own intake is. That is the whole feature — two facilities
that both want the riverbank, for opposite reasons.

Serves pillar 3, **the city is legible through data lenses**, in
[../gdd.md](../gdd.md) — and serves it without a lens, which is the point: a
river that has gone bad is visible on the water itself, and the lens is only for
measuring what the player has already noticed. It is first among the content
epics because it is a pure system, adding no new UI idiom — everything the
player does is place a building on a shore.

## How it works, for the player

**Every building that uses water now makes sewage.** Not a new number to learn —
it is 80% of the water the building drinks, the published return-to-sewer
fraction for municipal supply (design range 70–85%; we take 80% because a
compact city loses little to irrigation).

**Sewage arrives by sewer, and a sewer follows the road.** A drainage facility
collects from every building it can reach over the road network, exactly the way
a garbage facility already collects trash. A district on a road the works cannot
reach is not drained, however close it looks on the map.

**Sewage that nothing collects does not kill the city — it stinks.** Unserviced
sewage raises ordinary Pollution around the buildings producing it, in
proportion to the volume. A village with no outfall has cesspits and foul
ditches, land value falls, and the player gets a legible problem rather than a
dead city — which is also what makes the epic safe to drop into a city built
before it existed.

**There are two ways to get rid of it**, and they cost very differently:

|                | Sewage Outfall | Sewage Treatment Works (small) |
| -------------- | -------------- | ------------------------------ |
| Volume handled | 640 kL         | 700 kL                         |
| Cost           | ¢1,800         | ¢9,000                         |
| What comes out | all of it, raw | one tenth of it                |

The volumes are deliberately near-identical. The choice is entirely about what
comes out the far end, and the outfall is always the cheaper answer to the
question the player is actually asked, which is why real cities built them for a
century.

**Contaminated water spreads along the water, and only along the water.** A
discharge fouls the connected waterbody out to about 500 m — the distance a
consent normally has to meet its standard within — fading to nothing at the
edge. It does not cross land: a lake on the far side of a ridge is unaffected
however close it is in a straight line.

**A contaminated intake delivers less.** A pumping station's output is scaled by
how bad the water is where it draws — a station five tiles below a raw outfall
delivers a fifth of its rating — and that punishment is self-inflicted, because
the player chose both sites. **A water treatment plant buys the mistake back, up
to a point**: it restores contaminated supply to full, up to its own rated
throughput and no further. It does not clean the river; it cleans what the city
drinks out of it.

### The ladder

**Supply.** The water tower stays what it is — the cheapest source in the game,
and the one a village starts with. Above it sit two intakes that must stand on a
shore.

| Building                 | Serves | Capacity         | Cost / upkeep  | Unlocks at   |
| ------------------------ | ------ | ---------------- | -------------- | ------------ |
| Water Tower _(existing)_ | 5,000  | 400 kL           | ¢2,500 / ¢120  | Tiny Village |
| Water Pumping Station    | 8,000  | 640 kL           | ¢3,600 / ¢180  | Small Town   |
| Water Pumping Works      | 32,000 | 2,560 kL         | ¢11,000 / ¢560 | Big Town     |
| Water Treatment Plant    | 40,000 | 3,200 kL treated | ¢18,000 / ¢900 | Big Town     |

**Drainage.** Three rungs, because the first one is not a treatment facility at
all — it is the thing every city has before it has a conscience.

| Building                 | Serves | Capacity   | Reach    | Cost / upkeep    | Unlocks at    |
| ------------------------ | ------ | ---------- | -------- | ---------------- | ------------- |
| Sewage Outfall           | 10,000 | 640 kL raw | 24 tiles | ¢1,800 / ¢90     | Tiny Village  |
| Sewage Treatment Works   | 11,000 | 700 kL     | 36 tiles | ¢9,000 / ¢520    | Busy Township |
| Regional Treatment Works | 36,000 | 2,300 kL   | 56 tiles | ¢24,000 / ¢1,300 | Small City    |

The large works costs 2.7× the small one and handles 3.3× the sewage, so it is
cheaper per person and only pays back once there are people to put through it —
the ladder rule the programme sets for every service.

### What goes wrong, and when the player sees it

In this order, over many minutes, so none of it is a surprise:

1. **The water changes colour.** Contaminated tiles tint toward brown-green and
   lose their sparkle, strongest at the discharge and fading along the water.
   Nothing has to be opened to see it.
2. **The intake gauge falls.** A pumping station's inspector reads rated against
   delivered — `2,560 kL rated / 510 kL delivered` — so the cause is one click
   from the symptom.
3. **A warning fires** below 75% of rating, a critical notification below 40%.
4. **Only then does the city suffer.** Delivered water falls below demand and
   the existing shortage rule does what it already does: consumers cut in
   building-id order, and after three growth passes without water, abandonment.

On land the outfall has its own smell: it emits ordinary Pollution on its own
footprint like any other dirty building, so land value falls around it and
nobody wants to live there — a second siting problem, needing no new machinery.

## What it interacts with

**The existing water network.** Supply, road-borne propagation and the shortage
cut order in [../../world-sim/utilities-model.md](../../world-sim/utilities-model.md)
are unchanged. A pumping station is an ordinary water source whose output
happens to vary; nothing downstream of it needs to know why.

**The water model.** Water is derived from terrain height and has no flow —
[../../world-sim/world-model.md](../../world-sim/world-model.md) excludes a flow
simulation deliberately, for performance. So the simulator has no _downstream_:
contamination spreads by connectivity in every direction, and this document says
so rather than pretending to a current. It has no fresh/salt distinction either,
so a coastal city may drink the sea. Known simplifications, not oversights.

**Pollution.** The existing Pollution field carries what an outfall does to the
air and the land around it, through the ordinary per-building emission pass.
What it does to the river is a separate quantity travelling a different way; see
[../../engineering/features/water-and-sewage.md](../../engineering/features/water-and-sewage.md).

**Epic 0, service capacity.** The drainage half consumes it directly: a works
collects along the road network from the buildings within its reach, the walk
[service-capacity.md](service-capacity.md) exists to make cheap. The supply half
does not — water already has a supply-against-demand budget and a cut order,
which is the same idea one layer down, and duplicating it as a coverage field
would be a second source of truth for one fact.

**The funding sliders.** Water and sewage get none, and that is a decision
rather than an omission. A slider scales a service's reach and, after epic 0,
its throughput; a treatment works that runs at half flow because the budget says
so is not a thing that happens to a treatment works. The money here is the
plant's capital cost and monthly upkeep, booked through the existing expense
pass in [../economy.md](../economy.md). No new `ServiceKind`, therefore, and no
new coverage field.

**Growth.** Unserviced sewage reaches growth only through Pollution, which
already gates residential lots at 170 — so no city is strangled by a rule it was
never taught.

## Tuning

Every figure below is derived from a published municipal standard and our own
20 m tile. The settled values belong in [../balancing.md](../balancing.md).

**Per-capita water.** Domestic consumption for an urban household with full
plumbing is a published planning figure of **150 L per person per day**; total
municipal supply adds commercial, industrial and public use plus unaccounted-for
water, conventionally **1.6–1.8× domestic**. At 1.7 that is 255, taken as
**250 L per person per day**.

**Sewage.** **80%** of water supplied returns to the sewer (range 70–85%),
giving **200 L per person per day**. A collection system is designed with a
further **10% infiltration** allowance, so a works is _rated_ at 220 L/p/d —
which is why every plant rating below is above the city's own return.

**Reconciling with the catalog — the figures disagree, and by how much.** Every
zoned building already carries a `waterUse` in kL. Divided by residents, every
residential entry but the smallest house sits between 0.053 and 0.063 kL per
resident; the settled figure is **0.060**. Commercial and industrial entries run
about 0.043 kL per job, and a balanced city employs about half its population,
adding 0.021. So the catalog's implied demand is **0.080 kL per head of
population per day — 80 litres** — against the standard's 250, light by a factor
of **3.1**, stated here rather than rounded away.

We do **not** propose changing it: multiplying every `waterUse` by 3.1 would put
every existing city into an instant water deficit and abandon buildings on load,
the opposite of the programme's rule that a save loads after an epic as it did
before. Instead the factor is written down once, as `WATER_DEMAND_SCALE = 3.1`,
and every capacity here is derived at the real standard and converted through
it — so a retune is one constant, not thirty-eight numbers.

**Reconciling with the existing water tower.** 400 kL ÷ 0.080 = **5,000
people**, who at the real standard need 1,250 kL a day — a 1.25 ML tank, which
is an entirely ordinary municipal elevated tank: published sizes run 0.5 to
4 ML, and a common rule sizes storage at about one day's average demand. So the
number is right and the _unit_ is wrong; 400 kL is a defensible tank volume
being used as a production rate, and a tank produces nothing. We keep it
producing anyway — reframing it as storage would leave every existing city with
no water source — and give it a reading that holds: a water tower is a borehole
with a tank on top, which is how small settlements really are supplied.

**Facility capacities.** Each is a real plant rating in megalitres per day,
converted to people and then to catalog kL at 0.080/head (supply) or 0.064
(sewage, 80% of supply).

| Facility        | Real rating | ÷ per-capita | People | × catalog rate | Catalog      |
| --------------- | ----------- | ------------ | ------ | -------------- | ------------ |
| Pumping Station | 2 ML/d      | 250 L/p/d    | 8,000  | 0.080          | **640 kL**   |
| Pumping Works   | 8 ML/d      | 250 L/p/d    | 32,000 | 0.080          | **2,560 kL** |
| Treatment Plant | 10 ML/d     | 250 L/p/d    | 40,000 | 0.080          | **3,200 kL** |
| Sewage Outfall  | 2.2 ML/d    | 220 L/p/d    | 10,000 | 0.064          | **640 kL**   |
| Treatment Works | 2.4 ML/d    | 220 L/p/d    | 11,000 | 0.064          | **700 kL**   |
| Regional Works  | 8 ML/d      | 220 L/p/d    | 36,000 | 0.064          | **2,300 kL** |

**How much cleaner a works is.** Raw municipal sewage carries a BOD₅ of about
**250 mg/L** (medium-strength domestic, range 110–400), and a secondary
discharge consent is commonly **25 mg/L**, so a conventional works removes about
**90%** of the organic load. That is the whole derivation behind "discharges far
less": **treated effluent fouls at one tenth the rate of raw, per kL.**

**How far it spreads.** A discharge consent normally has to meet its standard
within a mixing zone of about **500 m**. 500 ÷ 20 = **25 tiles** of connected
water, falling linearly from full strength at the discharge to nothing at the
edge.

**How fast it clears.** The classic first-order BOD decay coefficient is
**k₁ ≈ 0.23 per day** at 20 °C. A calendar day is 200 ticks, so on a period-4
pass (50 a day) the per-pass survival is e^(−0.23/50) = 0.9954 — 255/256 in the
fixed point the fields already use, and the slowest decay in the game. A river
recovers over days, which is why an outfall is a lasting decision.

**Sewer reach.** A foul sewer runs at a minimum self-cleansing gradient of about
**1 in 150**, bounded by the depth it may reach before a lift station is needed
— about 5 m, so 5 × 150 = **750 m ≈ 36 tiles** for the small works, and **24
tiles** for an outfall serving one district. With a lift station the large works
would reach 1,500 m, or 75 tiles: a third of the map, and no siting decision at
all, so it is **capped at 56 tiles**, the longest range already in the catalog.
The override is stated rather than hidden in a rounded number.

**Building sizes** are derived by the formula in
[../../art/civic-massing.md](../../art/civic-massing.md) against the anchors in
[../../art/README.md](../../art/README.md); the arithmetic, and the reason a
tank field is not sized by floor area, is in
[../../engineering/features/water-and-sewage.md](../../engineering/features/water-and-sewage.md).

## What it is not

- **Not a flow model.** No current, no direction, no floods. Real flow is a
  heightfield simulation the world model rejects on cost, and this epic is not
  the place to reopen that; contamination spreads by connectivity, plainly said.
- **Not a water-quality simulation.** One byte per water tile, one number the
  player can reason about. Nitrates, temperature, dissolved oxygen and salinity
  are all real and all invisible on a 20 m tile.
- **Not a pipe network**, and not a rework of the shortage rule. Water travels
  the road, as power does, and when supply falls short consumers are cut in the
  order they already are.
- **Not drinking-water illness.** Contaminated supply reduces what a station
  delivers; it makes nobody sick, there being no illness system to make them
  sick with. Health belongs to epic 2.
- **Not a retune of `waterUse`.** The 3.1× discrepancy is documented and left
  alone; fixing it is a separate, deliberate decision — see
  [../../DESIGN.md](../../DESIGN.md).
