# Bridges and elevated roads

Water is otherwise an absolute wall — a road tile may not sit on one — so a
bridge or an elevated stretch is the same mechanism: an ordinary road tile
that happens to sit higher than the terrain beneath it. `GridState` carries
one additive layer for it, the deck height in metres above the tile's own
terrain (0 = at grade), continuous rather than quantised to whole metres —
a level span crossing a dished riverbed has to cancel the ground's own
unevenness, or it bows by up to half a metre. Anything under a centimetre
of it reads as at grade. The road graph, the auto-tiling mask, road-carried
utilities and traffic all read the deck the same way they read any other
road tile, which is the entire point of modelling it this way rather than
as a second network.

An elevated tile skips the ground rules a normal road tile enforces — the
water rejection (that is the reason to elevate) and the slope ceiling (a
deck is level regardless of the ground under it) — while bounds and the
no-building-here check still apply, and the terrain underneath is never
flattened. A tile the grade solver lifted less than 0.5 m
(`GROUND_HUGGING_LIFT_M`) to close a step against its neighbour is not
elevated in that sense: it lies on the ground and is levelled with the rest
of the run, which is what keeps an arm drawn over a dead end's run-out from
leaving a step beside it. Dragging a road across water elevates the crossing tiles
automatically, at the higher bank's height plus 5 m of clearance over the
water surface (`BRIDGE_CLEARANCE_M`); the approach on each bank ramps down
to grade at no more than 2 m of deck height per tile (`BRIDGE_MAX_GRADE`),
and a placement that cannot fit that ramp on the land available fails
outright rather than building half a span. A player raises or lowers a
span deliberately with the road tool's own height control (Page Up / Page
Down while a drag is in flight), in steps of 2 m
(`ROAD_ELEVATION_STEP_M`), up to a ceiling of 40 m (`BRIDGE_MAX_ELEVATION`);
elevation always resets to ground level when the road tool is put down, so a
height set for one viaduct never becomes a stray hump under the next
unrelated drag.

Every tier bridges under its own rules, in one of four structural families
by class — a plank deck on light posts for gravel, alley and bike-lane
roads; a concrete beam on round columns for every ordinary street; a deep
box girder on heavy squared piers for an avenue, a highway or a ramp (a
ramp flies over on the same structure the highway it serves does); a
steel through-truss, with no parapet, for a rail line. Piers drop to the
ground every 3 tiles (`PIER_SPACING_TILES`). The deck's height is sampled
along the direction the road runs and held constant across it, so a span
has no camber; girder and parapets are merged geometry sampled off the same
smooth height function the road surface uses, so two neighbouring tiles
agree at their shared edge and the whole span reads as one continuous road
rather than a row of slabs.

Elevation adds `BRIDGE_COST_PER_METER_TILE` (6) currency per metre of deck
height per tile, on top of the class's own per-tile cost, and the same
premium proportionally on upkeep. An elevated tile grants no zoning
frontage — nothing zones off a bridge — and the ground beneath a deck
remains exactly as occupied as it is under any road tile. Bulldozing a span
clears its elevation along with the road.

A road crossing over another road or a railway is an overpass: an elevated
road like any other, holding a second road on the one tile where the two
overlap. See [overpasses.md](../overpasses.md).

Two road tiles join only at one level: both on the ground, or with decks
within one grade step of each other. A deck up in the air passes beside a road
on the ground without meeting it — which is also what keeps an overpass's
approach, left standing when its crossing is bulldozed, from joining the road
it used to cross.

Deferred, deliberately: tunnels, a third deck level, styled piers, and
suspension or arch spans; a bridge here is a slab on piers. See
[../DESIGN.md](../../DESIGN.md).
