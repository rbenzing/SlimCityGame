# Progression

Milestones, districts and policies, and the Advisor: how the city paces
itself and how the player finds out what needs attention. The monthly
money cycle these milestones run alongside is in [economy.md](economy.md);
the population thresholds and policy multipliers below are named again,
with their code locations, in [balancing.md](balancing.md).

## Milestones

A milestone levels up mid-tick, independent of the monthly cycle, the
instant population crosses the next threshold, and pays a one-time reward on
top of whatever funds the city already has:

| Milestone     | Population |   Reward |
| ------------- | ---------: | -------: |
| Tiny Village  |          0 |       ¢0 |
| Small Town    |        400 |  ¢10,000 |
| Busy Township |      1,200 |  ¢15,000 |
| Big Town      |      3,500 |  ¢25,000 |
| Small City    |      8,000 |  ¢40,000 |
| Grand City    |     20,000 |  ¢75,000 |
| Metropolis    |     50,000 | ¢120,000 |

Every catalog entry, zone tier and tool carries its own `unlockMilestone`.
Representative examples: townhouses and factories unlock at Small Town;
medium apartments and the Heavy Industrial zone at Busy Township; mixed-use,
flex and R&D buildings, the incinerator and the rail station at Big Town;
high-rise residential and commercial at Small City; the airport at Grand
City.
Districts, power lines, terraforming and de-zoning are available from the
very first milestone. Nothing in the current catalog or road set is gated
specifically on Metropolis — it is the top of the population ladder rather
than an unlock tier of its own.

## Districts and policies

A district is a per-tile administrative id, 0 (unassigned) to 255, painted
onto any tile at all — water, road, building, zoned or not — since a
district is an administrative region rather than a construction rule and
carries no buildability or frontage gate. Painting one is free. The first
time an id is painted, a district definition is auto-created for it with a
default name (`District N`) and a colour drawn from a fixed palette by id.

Four policies toggle per district: `lowTax` (×0.7 on that district's tax
contribution), `highTax` (×1.3), `noHeavyTraffic` (×1.6 on the district's
road tiles as a pathfinding cost, routing through-traffic around it), and
`greenEnergy` (×0.5 on the pollution its buildings emit). Multiple policies
on one district compose — `lowTax` and `highTax` together multiply both.
A district with no policy enabled behaves exactly like an unassigned tile.
See [../ux/README.md](../ux/README.md) for the paint tool and the
per-district policy panel.

## The Advisor: detecting and ranking problems

The Advisor turns the per-building problem flags and the city-wide stats
into a short, ranked list of what needs attention, worst first — an event
log reports failures as they happen; this reports the city's _current
state_. It recomputes roughly once a second (every 10th snapshot; snapshots
otherwise arrive ~10×/s), because a list re-ranking faster than a player can
read it is unreadable, not because the underlying numbers change that
slowly.

Two families of issue feed the ranking. Per-building problems are the eight
flags a building can carry — `NoRoad`, `NoPower`, `NoWater`,
`PowerShortage`, `WaterShortage` (critical), `HighCrime`, `HighPollution`
(warning), `LowDemand` (info) — each rolled up into one issue per flag: a
count of every affected building (buildings still under construction are
exempt; every Active or Abandoned building with the flag counts) and a focus
tile taken from the lowest-id affected building, so the same city always
points at the same place.

A grid too small for its city is a shortage, not a gap, and the two read
differently. A building the shortage cut is counted under "at the far end of
the grid" with how much the city asks for against what it makes — build
another plant (or water tower) — and is left out of the "without power"
count, whose advice is to look for a gap in the network. When nothing is
dark but growth is waiting for supply (see
[the spawner](simulation-rules.md#the-spawner-how-a-lot-is-chosen)), a
warning counts the lots and buildings waiting, from the snapshot's
`growthWaiting`. Between them the shortage is on the list for as long as it
holds anything back.

Zoned land can also sit empty because its own road brings it nothing. A
gravel road carries no cable, and a street the mains never reach carries no
water, so the lots along them can never grow, and no building stands there
yet to carry a flag. A warning counts every empty zoned tile that stands
beside a road yet lacks a utility its zone needs (power for every zone;
water for every zone but farmland, and never where a house would stand on
[a well](simulation-rules.md#a-house-on-a-well)), from the snapshot's `zonedUnserved`, and
points at the first such tile. Ground zoned too deep to reach the road is not
counted: the road is not what fails it.

City-wide checks read `CityStats` directly: funds below zero (critical, "the
city is in the red") or, short of that, monthly expenses outrunning income
(warning); and, once population is above zero, the labour market. The labour
market is measured against the **workforce** — the share of residents who
work (see
[population-model.md](../world-sim/population-model.md)) — never against
every resident, since the rest are not looking for work. No jobs at all is a
warning ("nobody in the city is hiring"); failing that, more than a quarter of
the workforce out of work is a warning ("zone more commercial and
industrial"); failing that, empty jobs numbering more than a quarter of the
workforce is a warning too — "employers cannot find workers", zone more
housing — which is also why a city in that state grows no more industry.

Issues sort by severity first (critical, then warning, then info), then by
how many buildings are affected within a severity tier, with ties broken by
a fixed priority order so the list never reshuffles under a player's
cursor. An issue with a focus tile can move the camera to it. A healthy city
returns an empty list — the Advisor does not invent problems to look busy.
See [../ux/README.md](../ux/README.md) for the panel itself.
