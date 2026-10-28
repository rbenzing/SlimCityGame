# Levels, construction, and abandonment

A newly spawned or newly leveled-up building spends `CONSTRUCTION_TICKS` =
100 ticks Constructing before it becomes Active.

Every growth pass, an Active building below level 3 is checked for a
level-up. A home or a shop needs the land value over its tile to exceed 140
(to reach level 2) or 190 (to reach level 3). Reaching level 3 additionally
needs schooling, by zone, each field over 60: detached and row housing the
elementary field; medium and high-density housing, mixed use and local
commercial the middle **and** the high school fields; high-density commercial
the college field; industry, heavy industry and farms nothing. Level 2 is never
gated by schooling. Each rung is its own field, so no rung stands in for another
([education-ladder.md](../../specs/education-ladder.md)). A building that clears the
land value for level 3 and fails only its schooling carries `NeedsSchool`.
Land value is
earned, not waited for: bare clean ground settles at 119, under the first
line, a river bank at 181, over it, and only a park, trees or the shore
together with a quiet clean street carry a tile past the second
([../world-sim/environmental-simulation.md](../../world-sim/environmental-simulation.md#landvalue-fieldidlandvalue--0)). **Industry
grows on its order book, not its neighbourhood:** a works levels up while
industrial demand is above zero, and land value, which pushes real industry
out of town, plays no part, for a plant as for a farm. A catalog entry of the
same kind at the next level must also exist and be unlocked at or below the
current milestone: a level-up keeps the building's kind, so a duplex levels
up into a better duplex and never into a house or a block. A commercial or
industrial building also needs the town to have room for the jobs the bigger
building adds. The building's old footprint is cleared to test the new,
possibly larger one in its place, every tile of it zoned the same; a
suburban commercial or industrial building must also meet its parking code
at the new level, and tries the next level's lots smallest first, never one
smaller than the lot it stands on. If no new footprint fits, the
level-up is abandoned and the old building is restored exactly as it
stood. A building whose lot no longer meets its code — its street's kerb
parking removed — keeps trading as it stands and is never abandoned for it. A level-up must also find spare supply for what the bigger building
draws beyond the smaller one; one that cannot is restored the same way and
waits for supply like a lot does. A successful level-up replaces the
building in place and re-enters Constructing.

A house on prime land is torn down for a plex. Every growth pass, an Active
detached house on a half or a normal lot whose tile's land value is at the
estate band (224 or over), and which did not level up that pass, converts
with a chance that makes 2% a year (a year is 72,000 ticks, so 7,200
passes): it is replaced, on the same footprint, by a level-1 duplex or
fourplex of its zone and lot, drawn by share, unlocked at the current
milestone, given spare supply for what it adds, and it enters Constructing.
Any level converts; the lot never changes
([specs/lots-and-land.md](../../specs/lots-and-land.md#a-small-house-on-prime-land-becomes-a-plex)).

A farm levels up by taking more land:

- The next level is the same kind of farm on a larger lot at the same corner
  (5×6, then 6×7).
- Every tile of the larger lot must be Agriculture on farmable soil, and the
  lot's grade must be at least what its kind needs. A crop farm grows only
  onto very fertile land, an orchard onto fertile land or better, and pasture
  onto anything farmable.
- Industrial demand must be above zero, and a random draw against it decides
  the pass, since a bigger farm is the town adding basic jobs.

Every pass also recomputes each Active or Abandoned building's problems: no
power, no piped water or no drain reaching its footprint (water and drain
only for a building that draws city water, and a drain only from Big Town),
no street within Manhattan
distance 3 (for a farm, no dirt road within 3 of its lot), crime over 170,
pollution over 170 (residential lots only), and sector demand under -0.5. An
Active building carrying a power, water, or road blocker for 3 consecutive
passes becomes Abandoned; a missing drain is never a blocker, since the
consequence of no sewer is no growth and a fouled ground, not a dead
building. An Abandoned
building returns to Active as soon as its blocker is gone; otherwise, after
10 consecutive still-blocked passes, it is removed and its footprint freed.
Abandoning never removes a shortage: an abandoned building keeps its place
in the utility line, so a home past the end of the supply stays dark until
the grid grows or the home is removed.

