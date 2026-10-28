# 0. What is shipped

The status narrative of [the roadmap](../ROADMAP.md), moved here so the
roadmap itself holds the test count, the Open list and what is next.

**Shipped:** the M0–M7 milestone spine; bus transit, service dispatch,
districts & policies, stats charts and photo mode; eight playtest-feedback
rounds (2026-07-22 through 2026-07-25); the landfill/garbage sanitation
epic; city audio, UI sound and the user-supplied music player; the advisor
panel; bridges and elevated roads; road signage; rail transit; tram
transit, with tramways crossing other streets at grade; six-lane roads whose
median opens where a street crosses them; building lots and archetypes; dynamic world lighting
([`render/sky.ts`](../../src/render/sky.ts)) and the cantilever streetlight
([`render/lamps.ts`](../../src/render/lamps.ts)); power-conducting roads and the
power line ([`sim/network.ts`](../../src/sim/network.ts)); free-form roads — a
network of nodes and segments, curves, roads meeting at any angle; overpasses;
snapping between grid and free roads; homes that face their street, with
drives, garages and yards; and brownouts that cut from the far end of the grid,
with the Advisor naming a shortage and the jobs a workforce is short of;
motorways and ramps driven only the way they flow; demand as economic base
theory, a small town growing its industry before its shops; and farms — an
Agriculture zone off dirt roads on soil the ground itself grades, growing row
crops, orchards and pasture with their barns, silos, bins and herds.
Versioning and deploy are automated (release-please + Conventional Commits →
GitHub Pages; see the README).

**Road composition is shipped.** A road is a class, a
cross-section profile and per-junction control; the fixed-tier model is gone.
Waves 5 and 6 — the ramp with its merge, diverge and terminal junctions, and a
section too wide for a tile laid as two carriageways — are built
([`shared/corridor.ts`](../../src/shared/corridor.ts)), as are the pieces that
finished it: a transit lane is a variant of a size rather than a road type, a
road's tier is its size with the reserved lane priced on top, the placement
ghost is drawn at the road's own width, an interchange — a diamond, a
partial cloverleaf or a cloverleaf — is laid on a motorway in one click
([`shared/interchange.ts`](../../src/shared/interchange.ts)), and so is a 2×2
compact roundabout on a street junction
([`shared/roundabout.ts`](../../src/shared/roundabout.ts)), and a motorway or a
slip road carries a sound wall that cuts the noise behind it
([`shared/soundwall.ts`](../../src/shared/soundwall.ts)). Full detail in
[history/](../history/README.md), §10 below.

**Building types** are complete: a zoned lot draws a kind of building by lot
fit and real-world share, and keeps it for life
([building-types.md](../specs/building-types.md)). Homes come
in nine kinds, businesses in seven, and industry in eight across two zones,
the new **Heavy Industrial** zone holding the plants that pollute; a
business opens only where the town has room for its jobs, and industry
levels up on demand rather than land value.

**Water goes in and comes out.** A **water pumping station** on a shore
draws a million gallons a day from the water beside it, a **water drain
pipe** on a shore takes the city's sewage back out, and a **water pipe**
painted on open ground carries water and sewage together between them and
the streets, the way a power line carries power. Every zoned building sends
88% of its water back as sewage, a lot with no drain to take it never
grows, and a building left without one stinks. The water tower is
re-derived from a standard 100,000-gallon tank. **And the water remembers:**
where a drain empties, the water goes brown for 500 m along the shore, on
the surface itself, and a pumping station drinking from that stretch
delivers less the browner it is. The **sewage treatment works** takes the
same sewage at five times the price and fouls the water at a seventh of
the rate. The figures and their sources are in
[water-and-sewage.md](../specs/water-and-sewage.md).

**Power is honest on both sides.** A generator counts for its nameplate times
the published share of the year its kind runs: the wind turbine is the
average new onshore machine, 3.4 MW at 33.5%, drawn at its 103 m hub and
134 m rotor and priced from published $/kW at ¢320 and ¢9 a month; the coal
plant keeps its 60 MW nameplate and its anchors and delivers 25.6 MW. Every
civic ploppable's draw is now a surveyed figure too, floor area times the
national building survey's intensity, so a police station draws 47 kW where
it drew 600, and the airport 0.4 MW where it drew 8. The derivations are in
[power-generation.md](../specs/power-generation.md)
and [municipal-services.md](../specs/municipal-services.md).

**A new town grows again.** Release 1.31.0 made the sewer a hard gate on
growth from the first house, and both drains want a shore, so a new town on
power and water grew nothing and nothing on screen said why. A town is on
septic tanks until Big Town (3,500 people) instead; from there the sewer
gates growth as designed, with the drain unlocked and the Advisor's warning
one rung before. The first-town scenario is now a frozen guard
(`tests/interaction/firsttown.test.ts`), and the ground truths say that a
test which needs a new setup step to keep passing has found a rule change,
not a test to fix.

**Pipes are underground.** Nothing at the surface shows a pipe; pick up the
pipe tool, a water building or the Water or Sewer lens and the city goes
underground — the surface to glass, the whole system beneath it: the mains
under the streets, the laid pipes, a lead into every served lot, a riser on
each water building and its run out to the pipe that joins it, blue and
brown where the water and the drains reach, grey where they do not — and a
pipe drag snaps onto the system and says what it joins
([underground-view.md](../specs/underground-view.md)).

**Lots and land is complete**
([lots-and-land.md](../specs/lots-and-land.md)): the detached
house on the lot the land warrants, from a half lot to a 3×3 acre; the plat
cut from the street and drawn on the zone lens; the duplex, fourplex, rows
and medium density on their parcels; commercial and dense land cut into
frontage lots, its blocks starting on one lot and assembling their
neighbours; the dense homes re-derived from the floor each block is drawn
with; and a small house on prime land torn down for a plex.
