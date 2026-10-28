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
sector's tax rate, and city-wide happiness, with no randomness:

- **Industrial** = (workforce ÷ 1.81 − industrial jobs, open or going up) ÷
  max(16, workforce ÷ 1.81) − (indTax − 9%) × 4. The basic jobs a workforce calls for are the ones
  that, with the local jobs they support, would employ all of it. A town
  short of them wants industry; one with more than its people can fill does
  not. The 16 is one small factory's jobs (`ind-1`), so a town a whole
  factory short reads full demand.
- **Commercial** = (0.81 × open industrial jobs − commercial jobs, open or
  going up) ÷ max(8, 0.81 × open industrial jobs) − (comTax − 9%) × 4. Shops follow the basic economy: a town
  with no industry supports no shops however many people live in it, and
  shops beyond what its industry supports stand empty. The 8 is one corner
  shop's jobs (`com-low-1`, the first low-commercial entry in the catalog).
- **Residential** = 0.3 + (jobs − workforce) ÷ max(200, population × 0.5) +
  (happiness − 50) ÷ 150 − (resTax − 9%) × 4. People follow work: empty jobs
  pull residents in, and a workforce with no work for it turns them away. The
  0.3 lets a town's first households — its founders — arrive before there is
  any work at all. A happier city draws people; a residential tax above the
  9% default repels them.

Jobs in buildings still under construction count as supply on both sides —
industrial ones against the basic jobs wanted, commercial ones against the
local jobs supported — because a developer sees the building going up next
door. Only open industry supports shops: its wages start when it opens. The
two gaps — the local jobs supported less those open or going up, and the
basic jobs wanted less those open or going up — are the **room** the economy
has for each sector's jobs, and the spawner reads them: a business opens
only where its jobs fit the room, so a sector may overshoot what it supports
by at most the smallest building that fits a lot, the one that fills its
last gap.

Every result is clamped to -1..1. So a new town grows the way a farming or
mill town does: its first households arrive, the industry they need follows,
and the shops come once there are wages to spend in them. A town of 84 with
46 shop jobs and no industry, say, has a workforce of 42 that calls for 23
basic jobs: industrial demand is full, commercial demand is at its floor
because nothing supports those shops, and it grows industry, not more shops.
A town with people and no industry stops growing until it gets some.

