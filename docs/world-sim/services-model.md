# Services model

Police, fire, health, education, parks, and the collection of rubbish. All of
them work by walking the road network outward from a building, which is why
road access is the thing every service silently depends on.

## Coverage and funding

Police, fire, health, education and parks share one mechanism. Each active
service building first finds the nearest road tile within 2 orthogonal steps of
its footprint, then walks outward from it by road-network hop count (not
straight-line distance), following only the links where the road network
joins one road to the next ([road-network.md](road-network.md)), capped at a
range scaled by that service's funding.
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

A trash unit is **0.25 kg**, 4,000 to the tonne, and every figure in the chain
is in it. Every active residential, commercial and industrial building
generates trash every 10 ticks (20 passes a game day) for the people in it:
**1.32 kg a resident a day and 1.86 kg a job a day**, 5.28 and 7.44 units. A
person in the United States throws away 2.2 kg (4.9 lb) of municipal waste a
day ([EPA](https://www.epa.gov/facts-and-figures-about-materials-waste-and-recycling/national-overview-facts-and-figures-materials)),
55–65% of it from homes and the rest from businesses and institutions
([EPA](https://archive.epa.gov/epawaste/nonhaz/municipal/web/pdf/msw_2010_rev_factsheet.pdf));
60% of 2.2 kg is the resident's share, and the other 40% spread over the
country's 160 million jobs for its 335 million people is the job's. A
works' process waste is not municipal waste and is not collected. A pass
emits the whole units its rate has reached since the last, so a house of
three puts out a unit some passes and none on others and exactly its share
over a day; they are spread across the footprint's tiles, the remainder on the
first, and clamped at 255 per tile — the ceiling the trash lens reads.

**Landfill** is a painted area, not a ploppable: a brush stamps the tile layer,
gated to the same road-frontage buildable grid the R/C/I zone brushes use, with
no cost gate beyond that. A connected area must reach 4 tiles to operate — a
paint stroke that would leave a smaller disconnected fragment is rejected,
though growing an existing area past the minimum is always allowed. Painting
costs ¢40/tile and ¢3/tile/month upkeep. Capacity is the painted tile count ×
6,835,200 units: the tile's 6 m pile, 2,400 m³, at the 1,200 lb a cubic yard
(0.712 t/m³) a compacted municipal landfill holds, which landfills measure at
1,200–1,500 ([Sioux Falls](https://www.waste360.com/landfill/sioux-falls-s-d-improves-airspace-utilization-for-regional-landfill),
[Chattanooga](https://register.chattanooga.gov/sites/default/files/resources/Audit1508Landfill_Sustainability.pdf)),
about 1,700 t. A city of 100,000 fills some 47 tiles a game year. The pile is
rendered up to 6 m tall at a full tile, one lift where a real landfill rises
40–150 m; once the whole
area is full its service radius stops being collected until more area is
painted or an incinerator takes the load. A connected area derives one office
tile (its street-adjacent member nearest the start of the search) and a dump
path from the office to its farthest member; every other tile in the area piles
trash. See [../art/buildings.md](../art/buildings.md) for the gatehouse and
pile models.

The **incinerator** is a catalog ploppable (4×4, unlocks at milestone 3,
¢40,000 to build, ¢1,500/month) with its own 9,000,000-unit buffer, five days
of burn in its pit. It collects within a 40-tile road-BFS radius and burns
what it holds up to 90,000 units a pass, its ceiling: 450 t a day, the middle
of the 300–600 t a day a mass-burn plant its 4×4, 20 m size is, so one plant
takes the waste of about 200,000 people. It is permanent as long as that
keeps pace with inflow. It draws 1.18 MW, 63 kWh a tonne burned.
Its smoke follows the burn: the catalog's 120 pollution is what it emits at
the ceiling, through the ordinary per-building emission pass scaled by the
share of the ceiling the last pass used (`incineratorEmission`), so an idle
plant makes none and a town that outgrows one plant's ceiling sees its trash
back up until it builds another. A full buffer stops that facility's own
collection until it drains.

The **kerbside recycling depot** is a catalog ploppable (2×3, unlocks at Busy
Township, ¢3,200 to build, ¢260/month): a fleet yard of four recycling trucks
that serves up to 38,000 homes within a 32-tile road-BFS reach, homes in
buildings of four or fewer (the house, the duplex, the fourplex, the
townhouse row), never a block, a shop or a works. A served building's
residents put 0.131 kg a day each in the recycling cart, of their 1.32 kg, so
it never reaches the trash tiles. Depots take buildings in id order up to
their homes, and a building reached by two is served once. The carts go to a
Materials Recovery Facility in town when one its streets connect to has room,
or else to a regional plant off the map. Either sorts 87% of them to market, and each recovered unit
earns ¢0.00016, the landfill's own whole-life cost of a unit, booked as income
at the month boundary; the regional plant buries its 13% residue out of town.
Its trucks wear the recycling livery. The figures and sources are in
[../game-design/features/garbage-recovery.md](../game-design/features/garbage-recovery.md#the-kerbside-recycling-depot-built-2026-10-08).

The **Materials Recovery Facility** is a catalog ploppable (5×6, 11 m, unlocks
at Grand City, ¢24,000 to build, ¢1,750/month) that never collects rubbish. It
sorts up to 50 short tons a day, 9,072 units a pass
(`MRF_SORT_UNITS_PER_PASS`): first the carts of the depots its streets
connect to, at any distance, depot by depot in id order, then its own round. The round serves, within a 48-tile road-BFS reach
and in building id order, the buildings kerbside does not: a block of more than
four homes at 0.30 kg a home a day, and every job at 0.30 kg a day in commerce
(a mixed-use block's shops included) and 0.25 kg in industry. A building is
served once, by the first plant with room for its recycling that pass, and its
recycling never reaches the trash tiles. Of what a plant sorts, 87% is
recovered and credited and 13% is residue, split on the day's running total so
a day's credit is exactly 87% of its sorting, floored. The residue goes to the
nearest landfill or incinerator the plant's streets connect to, at any
distance (a landfill first on a tie), into its pile or pit; with none that has
room it fills the plant's own store, a week of residue (165,110 units), and a
full store stops the plant: its round serves no one and the depots' carts go
regional again. It draws 0.0378 MW, 20 kWh a tonne over the day, and its four
trucks wear the recycling livery. The figures and sources are in
[../game-design/features/garbage-recovery.md](../game-design/features/garbage-recovery.md#the-materials-recovery-facility-built-2026-10-08).

**Collection** reuses the same road-BFS mechanism a service building uses
([Coverage and funding](#coverage-and-funding)) and shares the load the way a
service's capacity does. Buildings go in id order for determinism. The
incinerators collect first, since they process what they take where a
landfill only keeps it (the waste hierarchy's order), and a building reached
by several incinerators with room gives each an equal share, a unit at a
time round the group, so two plants over one town carry the same load and a
full one's share goes to the others; the landfill then takes what they left.
A full facility collects nothing and trash
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
The landfill's total stored pile, each incinerator's buffer and each recovery
facility's residue store, however, do round-trip through the save's meta
block; a save written before one existed loads it empty. The landfill's painted _extent_ is separately part of the
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
