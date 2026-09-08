# Economy

How the city pays for itself: the monthly settlement, tax income, upkeep,
the budget, and loans. Milestones, districts and the Advisor — the other
half of what used to be one "Economy and progression" section — are in
[progression.md](progression.md); the constants named below are gathered
with their code locations in [balancing.md](balancing.md).

## Population, jobs, and the monthly cycle

Every tick, population and jobs are re-summed from Active buildings: a
residential building contributes its `residents` to population (and, for a
mixed-use entry, its ground-floor `jobs` to commercial jobs too); a
commercial or industrial building contributes its `jobs` to that sector.
Employed is `min(population × 0.55, jobs)`.

Income and expenses settle once every game month — every 6,000 ticks (200
ticks/day × 30 days) — against the funds balance; population, jobs and
milestones are otherwise live every tick, independent of that boundary.

## Tax income, upkeep, and the budget

Monthly income is
`(population × resRate + jobsCom × comRate + jobsInd × indRate) × 12 × landValueFactor`,
where `landValueFactor = 0.75 + (averageLandValue / 255) × 0.5` over every
occupied tile — so a city's income runs from 75% to 125% of the raw rate
depending on how desirable its occupied land is. The default tax rate is
0.09, capped at 0.3 per sector.

Monthly expenses sum: every Active building's catalog `upkeep` (a service
building's upkeep is further multiplied by that service's own funding
level); every road tier's `upkeepPerTile` × its tile count; ¢3/tile/month
for painted landfill and ¢0.5/tile/month for power line; and 1% of the
outstanding loan balance. Funds below zero raise a critical "budget
critical" notification; funds below ¢2,000 raise a "budget low" warning.
Neither halts the game outright, but every priced command already refuses
to run once its cost exceeds current funds — so a city in the red can still
zone, bulldoze, or paint a district (all free) but cannot afford anything
priced until income recovers. There is no separate bankruptcy mechanic
beyond that lockout: a city with negative funds keeps running, unable to
build or plop anything priced, until income outpaces expenses again.

## Loans

A loan tops up funds against a ¢100,000 outstanding-balance ceiling; a
request larger than the remaining headroom is clamped to what's left.
Repayment is clamped to whichever is smallest of the amount requested, the
funds on hand, and the balance owed. Interest accrues at 1% of the balance
into every month's expenses whether or not the player borrows further that
month.
