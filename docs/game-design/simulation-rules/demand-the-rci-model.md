# Demand: the RCI model

The city's economy runs the way a real town's does, by economic base theory.
Its **industry** is the basic sector — the farms, mills and factories that
sell beyond the town and are the reason it exists — and its **commerce** is
the local sector, the shops and services its own people keep in business.
Basic jobs bring workers, workers bring households, and what they earn keeps
the local jobs going. Measured across nearly 200 small US communities, total
employment runs **1.81** times basic employment (Mulligan, _Regional Science
Policy & Practice_ 1(1), 2008; Bartik & Sotherland, Upjohn Institute 2019,
put local multipliers "closer to 1.5 than to 2.0" and find them no larger in
larger places), so each industrial job supports 0.81 commercial ones
(`BASE_MULTIPLIER`). The workforce is half the population: the US labour
force is 50.0% of residents (BLS Current Population Survey, 2025 annual
average; `EMPLOYMENT_RATE`).

Three coupled demand values — residential, commercial, industrial — sit in
-1..1: positive means the city wants more of that zone, negative means it is
oversupplied. Each is a pure function of population, jobs by sector, each
sector's tax rate, and city-wide happiness, with no randomness. Each is a
**shortfall** against a **target**, read on the scale below:

- **Industrial** shortfall = workforce ÷ 1.81 − industrial jobs, open or
  going up. The target, workforce ÷ 1.81, is the basic jobs that, with the
  local jobs they support, would employ all of the workforce. A town short
  of them wants industry; one with more than its people can fill does not.
  The floor is 16, one small factory's jobs (`ind-1`).
- **Commercial** shortfall = 0.81 × open industrial jobs − commercial jobs,
  open or going up. Shops follow the basic economy: a town with no industry
  supports no shops however many people live in it, and shops beyond what
  its industry supports stand empty. The floor is 8, one corner shop's jobs
  (`com-low-1`).
- **Residential** shortfall = jobs + 60 − workforce, housed or going up, +
  ((happiness − 50) ÷ 150) × max(200, workforce). The target is the
  workforce and the floor 200 workers. People follow work: empty jobs pull
  residents in, and a workforce with no work for it turns them away. The 60
  are a town's founders, the workers who arrive before there is any work at
  all (`FOUNDER_WORKERS`, a dial): a fixed number, never a share of the town
  `[R-world-067]`. A happier city draws people ahead of the work.

| Read | Value | Constant |
| --- | --- | --- |
| The scale | shortfall ÷ max(floor, a tenth of the target) | `DEMAND_FULL_SHARE` 0.1, a dial |
| A tax point over the 9% default | moves the zero by 4% of max(floor, target) | `DEFAULT_TAX_RATE` |

A sector a tenth short of its target reads full, and a tenth over reads
empty `[R-world-068]`. Read against the whole target, a town near balance
showed 0.01 to 0.05 on every bar, and a lot's chance to build, which
follows the value, was about 2% a pass. A town small enough that a floor
rules reads as it always did.

Jobs in buildings still under construction count as supply on both sides —
industrial ones against the basic jobs wanted, commercial ones against the
local jobs supported — because a developer sees the building going up next
door. Only open industry supports shops: its wages start when it opens. The
two gaps — the local jobs supported less those open or going up, and the
basic jobs wanted less those open or going up — are the **room** the economy
has for each sector's jobs, and the spawner reads them: a business opens
only where its jobs fit the room, so a sector may overshoot what it supports
by at most the smallest building that fits a lot, the one that fills its
last gap. A level-up reads the same room; in commerce one small step a
pass is allowed past it while demand is up `[R-world-061]`. A mixed-use block is
homes over shops, so it answers to both: demand for homes, and commerce's
room for its shop jobs `[R-world-062]`. Left unchecked, a town of 8,000
held 2,060 commercial jobs where its industry supported 1,530, most of
them under mixed blocks, and no shop or office opened after Big Town.

Homes have a room too `[R-world-066]`: the people residential demand still
calls for, with the people of homes going up counted as housed already. A
home, a mixed block, a level-up or a conversion that adds people goes ahead
only where they fit, and each one built takes its people from the room at
once. Growth never stalls at a gap smaller than any home: while some room is
left a lot's smallest kind may open, and a house that gains a level with the
same family in it is not counted at all. Unheld, the milestone that
unlocks towers housed 10,000 people in 200 ticks on ground already zoned,
and the share of the workforce in work fell from 86% to 67%. Held, the
largest rise is 1,331 people in 200 ticks and 91% to 97% are in work at
every milestone. The real benchmark is 95.6%: the US noncyclical rate of
unemployment was 4.40% in 2025 (CBO, series NROU at FRED).

Every result is clamped to -1..1. So a new town grows the way a farming or
mill town does: its first households arrive, the industry they need follows,
and the shops come once there are wages to spend in them. A town of 84 with
46 shop jobs and no industry, say, has a workforce of 42 that calls for 23
basic jobs: industrial demand is full, commercial demand is at its floor
because nothing supports those shops, and it grows industry, not more shops.
A town with people and no industry stops growing until it gets some.

