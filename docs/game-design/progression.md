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
Representative examples: townhouses and the second industrial tier unlock at
Small Town; medium apartments at Busy Township; mixed-use, the third
industrial tier, the incinerator and the rail station at Big Town; high-rise
residential and commercial at Small City; the airport at Grand City.
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
See [../ui/README.md](../ux/README.md) for the paint tool and the
per-district policy panel.

## The Advisor: detecting and ranking problems

The Advisor turns the per-building problem flags and the city-wide stats
into a short, ranked list of what needs attention, worst first — an event
log reports failures as they happen; this reports the city's _current
state_. It recomputes roughly once a second (every 10th snapshot; snapshots
otherwise arrive ~10×/s), because a list re-ranking faster than a player can
read it is unreadable, not because the underlying numbers change that
slowly.

Two families of issue feed the ranking. Per-building problems are the six
flags a building can carry — `NoRoad`, `NoPower`, `NoWater` (critical),
`HighCrime`, `HighPollution` (warning), `LowDemand` (info) — each rolled up
into one issue per flag: a count of every affected building (buildings still
under construction are exempt; every Active or Abandoned building with the
flag counts) and a focus tile taken from the lowest-id affected building, so
the same city always points at the same place. City-wide checks read
`CityStats` directly: power or water demand outrunning supply (critical);
funds below zero (critical, "the city is in the red") or, short of that,
monthly expenses outrunning income (warning); and, once population is
above zero, no jobs at all (warning), unemployment above 25% of population
(warning), or every job filled with residual industrial demand — "employers
cannot find workers" (info).

Issues sort by severity first (critical, then warning, then info), then by
how many buildings are affected within a severity tier, with ties broken by
a fixed priority order so the list never reshuffles under a player's
cursor. An issue with a focus tile can move the camera to it. A healthy city
returns an empty list — the Advisor does not invent problems to look busy.
See [../ui/README.md](../ux/README.md) for the panel itself.
