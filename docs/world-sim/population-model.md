# Population model

**Population is a number, not a fleet of agents.** There is no citizen
object anywhere in `src/sim/` — no home address, no commute, no age, no
name. `CityStats.population` is a pure aggregate, re-derived from scratch
every tick, and every building that contributes to it is either fully
counted or not counted at all — less the residents a building has lost to
death and not yet re-let. This document describes how that number
arises and how it moves; the demand formula and the spawn/growth/abandon
mechanics that make buildings appear and disappear in the first place are
the ruleset in
[../game-design/simulation-rules.md](../game-design/simulation-rules.md) and
are not repeated here beyond what is needed to explain the number itself.

## The number is an aggregate, not a running total

Every tick, `EconomySystem.tick` (`src/sim/economy.ts`) walks every
`BuildingInstance` and, for each one whose `state === BuildingState.Active`,
adds its occupied residents (`occupiedResidents`, below) to population and its catalog `jobs` to the
commercial or industrial total (or, for a category-`res` entry that also
carries a `jobs` figure — a Mixed-zone building — to commercial jobs too,
since a mixed building's ground floor is commercial regardless of what sits
above it). Residents count whatever the building's category: a farm is an
industrial workplace with its family living on it, so its three residents
join the population and its jobs the industrial total. Population is never incremented or decremented as an event; it is
**re-summed wholesale** every tick, so it is always exactly the sum of every
Active building's occupied residents at that instant — nothing about it can
drift out of sync with the building set.

Employed population is `min(floor(population × 0.5), jobs)`
(`EMPLOYMENT_RATE = 0.5`, the US labour force's share of residents, BLS CPS 2025) — a fixed employment rate applied to the current population, capped by
however many jobs actually exist. It is not tracked per resident; it is a
single derived number computed the same way every tick.

`floor(population × 0.5)` is the city's **workforce**: the residents who
work, the rest being children, retirees and carers. Everything that talks
about work measures against it and never against every resident — demand's
basic jobs and residential jobs-gap, and the Advisor's unemployment and
labour-shortage checks. So a city whose jobs outnumber its workforce is fully
employed, not half out of work.

## Occupancy: the state gate, and the vacancies a death leaves

One helper, `occupiedResidents(spec, inst)` (`src/shared/occupancy.ts`),
decides how many people live in a building, and nothing else reads the
catalog's `residents` to count them. It returns 0 unless the building is
`Active` — `Constructing` and `Abandoned` buildings contribute nothing at
all — and otherwise the catalog's `residents` less the building's
**vacancies**: `max(0, residents − vacancies)`. A new, finished or levelled
building has none, so it is full; there is no lease-up curve on arrival.

`BuildingInstance.vacancies` is an integer from 0 to the catalog's
`residents`, absent meaning 0. It is the one finer grain the model keeps: the
residents a building has lost to death and not yet had replaced. Population
(the economy's sum), rent, the capacity pooling of the services, transit
ridership, garbage generation and the building inspector's occupancy readout
(`selectionOccupancy` in `src/sim/worker.entry.ts`) all read it through the
helper. A residential building reports its occupied residents, and a
`households` figure that is the catalog's `units` scaled by the occupied
share, rounded up, as a display convenience: full is every home, empty none.

Deaths and re-lets live in `src/sim/deathcare.ts`, and neither is rolled:

- **Deaths accrue.** A city counter advances every tick by `population ×
  DEATH_RATE_PER_RESIDENT_PER_TICK` (9 per 1,000 a year, CDC/NCHS 2024). Each
  time it passes 1 a resident dies: the _n_-th death takes the occupied
  resident at position `(n × 7919) mod population`, walking the Active
  buildings in id order, and that building's vacancies rise by one.
- **Vacancies re-let while the town attracts residents.** While residential
  demand is above zero a second counter advances by `vacancies ÷ (41 ×
  TICKS_PER_DAY)` a tick, one vacancy re-let each time it passes 1, chosen by
  the same stride over the vacancies; at or below zero it does not advance.
  41 days is RentCafe's 2025 average to rent a vacant apartment, and the rate
  does not scale with how large the demand is.

So the number moves two ways. **Building events move it in jumps**, even
though averaging many buildings across a city makes the jumps individually
small enough to read as smooth growth on the stats panel:

- A building finishes its `CONSTRUCTION_TICKS = 100`-tick countdown and
  transitions `Constructing → Active` — its full `residents`/`jobs` figure
  is added in that instant, not phased in.
- An Active building goes three consecutive growth passes
  (`ABANDON_BLOCKER_STREAK = 3`, each pass `GROWTH_INTERVAL = 10` ticks
  apart) with no power, no water, or no road, and becomes `Abandoned` — its
  full figure is removed in that instant.
- An Abandoned building is removed outright after
  `DESPAWN_ABANDONED_PASSES = 10` further still-blocked passes, or returns
  to `Active` (re-adding its figure, vacancies intact) the moment its blocker
  clears. See
  [../game-design/simulation-rules.md](../game-design/simulation-rules.md)
  for the level-up path, which replaces a building with a bigger one that
  passes through `Constructing` again exactly the same way.

**Deaths and re-lets move it a resident at a time.** A city at positive
demand holds about one empty place in a thousand; one whose demand is at or
below zero shrinks by the death rate until it turns positive. Population can
fall, and the milestone level never does.

## Demand: what decides whether a building appears at all

`computeDemand` (`src/sim/demand.ts`) is a pure function of population,
jobs by sector (commercial and industrial, from the economy pass), each
sector's tax rate, and city-wide happiness — with no randomness of its own,
returning three values in
`-1..1` per sector (residential, commercial, industrial). The exact formula,
and the spawn-probability roll that turns positive demand into an actual new
building on a zoned tile, are documented in
[../game-design/simulation-rules.md](../game-design/simulation-rules.md#demand-the-rci-model)
and are not restated here; the salient point for the population number is
that demand only ever influences _whether a new Active building appears_
(or an existing one's blocker tips it toward `LowDemand`, one of eight
problem flags growth tracks, display-only and never a cause of abandonment).
Population itself changes through the building transitions above, and a
resident at a time through the deaths and re-lets above: demand above zero is
the only thing that lets a vacancy be re-let, and the only thing it does to
the people already living here.

## Milestones ride on population, not on the monthly cycle

`EconomySystem.tick` also checks milestones every tick, independent of the
monthly settlement: the instant population crosses the next threshold in
`MILESTONES` (`src/shared/constants.ts`), the city's `milestoneLevel`
advances and a one-time fund reward is granted immediately. The level is a
ratchet: it never falls, so a city that shrinks below a threshold keeps what
that milestone unlocked, and its progress toward the next one reads 0 until it
climbs back past the threshold it stands on. See
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
structure, and no per-citizen preference of any kind: a death is a rate
against an aggregate, not an event in someone's life. A city's population
figure, its vacancies and its demand curve are the entire model. See
[agent-behavior.md](agent-behavior.md) for the same honesty applied to
traffic, and
[ADR-0001](../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
for why the game commits to this rather than a per-agent simulation.
