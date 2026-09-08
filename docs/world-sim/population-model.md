# Population model

**Population is a number, not a fleet of agents.** There is no citizen
object anywhere in `src/sim/` — no home address, no commute, no age, no
name. `CityStats.population` is a pure aggregate, re-derived from scratch
every tick, and every building that contributes to it is either fully
counted or not counted at all. This document describes how that number
arises and how it moves; the demand formula and the spawn/growth/abandon
mechanics that make buildings appear and disappear in the first place are
the ruleset in
[../game-design/simulation-rules.md](../game-design/simulation-rules.md) and
are not repeated here beyond what is needed to explain the number itself.

## The number is an aggregate, not a running total

Every tick, `EconomySystem.tick` (`src/sim/economy.ts`) walks every
`BuildingInstance` and, for each one whose `state === BuildingState.Active`,
adds its catalog `residents` to population and its catalog `jobs` to the
commercial or industrial total (or, for a category-`res` entry that also
carries a `jobs` figure — a Mixed-zone building — to commercial jobs too,
since a mixed building's ground floor is commercial regardless of what sits
above it). Population is never incremented or decremented as an event; it is
**re-summed wholesale** every tick, so it is always exactly the sum of every
Active building's catalog figure at that instant — nothing about it can
drift out of sync with the building set.

Employed population is `min(floor(population × 0.55), jobs)`
(`EMPLOYMENT_RATE = 0.55`) — a fixed employment rate applied to the current
population, capped by however many jobs actually exist. It is not tracked
per resident; it is a single derived number computed the same way every
tick.

## Occupancy is all-or-nothing per building

A building's contribution to population is binary, gated by
`BuildingState`: `Constructing` and `Abandoned` buildings contribute
nothing at all; only `Active` buildings count, in full. There is no partial
occupancy, no lease-up curve, and no vacancy rate within a single building —
`selectionOccupancy` (`src/sim/worker.entry.ts`), which drives the building
inspector's occupancy readout, makes this explicit: a residential building
reports `residents` and a derived `households` capacity
(`ceil(catalogResidents / 4)`, occupied count equal to that same capacity
while Active, zero while not) purely as a display convenience — the
simulation itself never tracks anything at finer grain than "this building
is Active or it isn't."

This has a direct consequence for how the population number actually moves:
**it moves in discrete jumps, not smoothly**, even though averaging many
buildings across a city makes the jumps individually small enough to read
as smooth growth on the stats panel. The three events that move it:

- A building finishes its `CONSTRUCTION_TICKS = 100`-tick countdown and
  transitions `Constructing → Active` — its full `residents`/`jobs` figure
  is added in that instant, not phased in.
- An Active building goes three consecutive growth passes
  (`ABANDON_BLOCKER_STREAK = 3`, each pass `GROWTH_INTERVAL = 10` ticks
  apart) with no power, no water, or no road, and becomes `Abandoned` — its
  full figure is removed in that instant.
- An Abandoned building is removed outright after
  `DESPAWN_ABANDONED_PASSES = 10` further still-blocked passes, or returns
  to `Active` (re-adding its figure) the moment its blocker clears. See
  [../game-design/simulation-rules.md](../game-design/simulation-rules.md)
  for the level-up path, which replaces a building in place with a bigger
  one and passes through `Constructing` again exactly the same way.

## Demand: what decides whether a building appears at all

`computeDemand` (`src/sim/demand.ts`) is a pure function of five inputs —
population, jobs, employed, each sector's tax rate, and city-wide
happiness — with no randomness of its own, returning three values in
`-1..1` per sector (residential, commercial, industrial). The exact formula,
and the spawn-probability roll that turns positive demand into an actual new
building on a zoned tile, are documented in
[../game-design/simulation-rules.md](../game-design/simulation-rules.md#demand-the-rci-model)
and are not restated here; the salient point for the population number is
that demand only ever influences _whether a new Active building appears_
(or an existing one's blocker tips it toward `LowDemand`, one of six
problem flags growth tracks) — it has no direct effect on population
itself. Population only ever changes through the state transitions above.

## Milestones ride on population, not on the monthly cycle

`EconomySystem.tick` also checks milestones every tick, independent of the
monthly settlement: the instant population crosses the next threshold in
`MILESTONES` (`src/shared/constants.ts`), the city's `milestoneLevel`
advances and a one-time fund reward is granted immediately. See
[../game-design/progression.md](../game-design/progression.md) for the
threshold table and what each milestone unlocks.

## What the monthly cycle does and does not touch

Tax income, upkeep, and the funds balance settle only once a month
(`TICKS_PER_MONTH = 6,000` ticks — `TICKS_PER_DAY × DAYS_PER_MONTH`); see
[../game-design/economy.md](../game-design/economy.md) for that formula in
full. Population, jobs, employed and milestones are computed every tick
regardless of that boundary — the monthly gate in `EconomySystem.tick` wraps
only the income/expense settlement, not the aggregation this document
describes.

## What does not exist

There are no individual residents, no households as simulated entities (only
as a display-only capacity number, above), no demographics, no age
structure, and no per-citizen preference of any kind. A city's population
figure and its demand curve are the entire model. See
[agent-behavior.md](agent-behavior.md) for the same honesty applied to
traffic, and
[ADR-0001](../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
for why the game commits to this rather than a per-agent simulation.
