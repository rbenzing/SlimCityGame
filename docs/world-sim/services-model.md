# Services model

Police, fire, health, education, parks, and the collection of rubbish. All of
them work by walking the road network outward from a building, which is why
road access is the thing every service silently depends on.

## Coverage and funding

Police, fire, health, education and parks share one mechanism. Each active
service building first finds the nearest road tile within 2 orthogonal steps of
its footprint, then walks outward from it by road-network hop count (not
straight-line distance), capped at a range scaled by that service's funding.
Every road tile reached, plus every tile within 2 further orthogonal steps of
one, receives coverage that fades linearly with hop distance:
`strength × (1 − hopDistance / range)`.

Coverage is blended into its field differently by kind: education and health
take the higher of the field's existing value and the new one (a ceiling, not a
stack); police and fire subtract half the coverage value from Crime and
FireRisk; a park adds a quarter of its coverage value to LandValue, on top of a
flat one-time `landValueBonus` applied to its own footprint tiles (40 for a
pocket park, 120 for an airport).

Crime grows passively every tick on any zoned tile whose land value is below
90, and fire risk grows on any tile carrying a building. A station's coverage
therefore offsets an ongoing rise rather than fixing something once — which is
why removing a station does not restore the situation that existed before it
was built.

Each of the five service kinds carries its own funding level, 0 to 1.5 (150%),
set independently and defaulting to 1 (100%). Funding scales both the service's
own range (floored) and the monthly upkeep every building of that kind costs
the city — underfunding shrinks reach and saves money in the same stroke;
overfunding costs more for a wider one. See [../ux/hud.md](../ux/hud.md)
for the funding sliders themselves.

## Garbage and waste management

Every active residential, commercial and industrial building generates trash
every 10 ticks: 2/4/8 units per pass by sector, multiplied by the building's
level (minimum 1×), spread evenly across its footprint tiles (rounded, at least
1 unit/tile) and clamped at 255 per tile — the ceiling the trash lens reads.

**Landfill** is a painted area, not a ploppable: a brush stamps the tile layer,
gated to the same road-frontage buildable grid the R/C/I zone brushes use, with
no cost gate beyond that. A connected area must reach 4 tiles to operate — a
paint stroke that would leave a smaller disconnected fragment is rejected,
though growing an existing area past the minimum is always allowed. Painting
costs ¢40/tile and ¢3/tile/month upkeep. Capacity is the painted tile count ×
600 units, rendered as a pile up to 6 m tall at a full tile; once the whole
area is full its service radius stops being collected until more area is
painted or an incinerator takes the load. A connected area derives one office
tile (its street-adjacent member nearest the start of the search) and a dump
path from the office to its farthest member; every other tile in the area piles
trash. See [../art/buildings.md](../art/buildings.md) for the gatehouse and
pile models.

The **incinerator** is a catalog ploppable (4×4, unlocks at milestone 3,
¢40,000 to build, ¢1,500/month) with its own 400,000-unit buffer. It collects
within a 40-tile road-BFS radius and burns 4,000 units per pass, permanent as
long as burn rate keeps pace with inflow; while active it emits 120 pollution
through the ordinary per-building emission pass, the trade-off for a fix that
never fills a field. A full buffer stops that facility's own collection until
it drains.

**Collection** reuses the same road-BFS mechanism a service building uses
([Coverage and funding](#coverage-and-funding)): a facility with remaining
capacity collects the trash of every building reachable within its radius, in
building-id order for determinism; a full facility collects nothing and trash
backs up on the source tiles. Buildings reached by no facility, or only full
ones, keep their trash and it shows on the `'trash'` lens — but as currently
implemented this uncollected trash does not itself feed LandValue or Happiness;
those fields are computed from education, health, land value, pollution, crime
and traffic only.

Cosmetic garbage trucks animate the collection: each qualifying landfill area
is its own depot, budgeted `clamp(1 + tiles/16, ≤ 4)` trucks and skipped once
its area is full; an incinerator uses its own catalog truck count (4 for the
base incinerator). Trucks route depot → serviced building → depot over the road
graph (a landfill truck also detours out to the dumping ground and back);
routing is cosmetic and does not affect collection. See
[../art/props-and-vehicles.md](../art/props-and-vehicles.md) for liveries.

The per-tile uncollected-trash layer is runtime state, not part of the grid
save, and rebuilds within a few ticks of a load — the same as traffic volume.
The landfill's total stored pile and each incinerator's buffer, however, do
round-trip through the save's meta block; a save written before that existed
loads with fill at 0. The landfill's painted _extent_ is separately part of the
grid itself and has been since the area was first paintable. See
[../engineering/data-model.md](../engineering/data-model.md).

## Cosmetic service dispatch

Fire, police and ambulance vehicles drive from a covering station to an
incident and back. Incidents spawn deterministically from the existing
coverage-gap fields (Crime, FireRisk and Pollution feed the spawn rate); a
vehicle routes station → incident → station over the road network and the
incident resolves after a travel-plus-service time.

The system only reads Crime, FireRisk and Pollution and the building registry —
it never writes back into service coverage or the economy. This is presentation
on top of [Coverage and funding](#coverage-and-funding)'s real numbers, not a
second copy of them. See
[../art/props-and-vehicles.md](../art/props-and-vehicles.md) for liveries and
the incident marker.
