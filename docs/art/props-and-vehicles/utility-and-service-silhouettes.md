# Utility and service silhouettes

A ploppable whose real-world silhouette IS its identity gets its own detail
kit — merged low-poly geometry, deterministic from the instance id — instead
of the generic building facade box:

- **Wind turbine**: a tapered mast, a nacelle, and a 3-blade rotor that spins
  slowly (a deterministic phase per instance), in pale bone-white, at the
  size of the machine it is: a distributed-wind machine, the hub 69 m up on
  a 3.3 m base and the rotor 61 m across. It is the one placeable drawn above
  the skyline on purpose; a real turbine stands over a town twice, and the
  blades sweep a tile and a half either side of the tile it stands on, which
  is why two turbines keep three clear tiles between them.
- **Water tower**: a multi-leg elevated tank at the size of the 100,000
  gallons it holds, on one tile. The tank is 9.1 m (30 ft) across, the
  four-column size for 100,000 gallons
  ([Caldwell Tanks](https://caldwelltanks.com/tank_types/multi-column-elevated-storage-tank-leg)),
  with an ellipsoidal bottom 2.3 m deep, a cylindrical shell 4.25 m tall and a
  matching ellipsoidal roof with a vent at its crown — 379 m³, the tank's own
  capacity. A balcony 1 m wide with a 1.07 m handrail rings the tank where its
  bottom meets its shell. Four legs run from that ring down and out to the
  corners of a circle 6 m in radius at the ground, braced in three panels by
  horizontal struts and crossed tie rods on every face, and a 1.2 m wet riser
  rises from the ground into the tank's centre. The shell's top, the overflow,
  stands 33.5 m up and the crown 36 m, as on a 110 ft trestle of the type
  ([NPS, Cuyuna Range towers](https://npgallery.nps.gov/GetAsset/051bc717-784c-4d0e-b4e9-3b6e9d64082a));
  the overall height, the leg circle, the leg and riser sizes and the balcony
  are dials, since no maker publishes them. The tank and roof are white, the
  legs, bracing, riser and balcony silver-grey.
- **Water pumping station**: a masonry pump house under a gable, a screen
  house at the water line with its travelling screens and the steel intake
  pipe 6 m out over the water, a wet well, a surge tank and the discharge
  main. The kit turns to face whichever side of its footprint the water
  lies on, never the rotation it was placed at.
- **Water drain pipe**: a concrete headwall with flared wingwalls at the
  water's edge, the outfall pipe through it 4 m out over the water on a
  riprap apron, turned the same way.
- **Sewage treatment works**: a screen house, three clarifiers with their
  bridges, an aeration basin, a digester under its dome, a contact tank and
  a control house, in pale concrete, with the drain's outfall pipe out of
  the water-facing edge, turned the same way.
- **Coal plant**: a boiler house and turbine hall, a precipitator and two
  striped smokestacks in the industrial chimney language from
  [buildings/README.md](../buildings/README.md), the coal stockpile with its conveyor
  gallery, a cooling tower, an ash silo and a switchyard.
- **Incinerator, recycling depot, MRF and transfer station**: a tipping
  hall, boiler hall and stack; a roll-off drop-off; a baling hall with its
  docks; a tipping floor with push walls over a load-out bay. See
  [civic-massing.md](../civic-massing/reading-a-civic-building-at-a-glance/the-earliest-kits-redone.md) for all
  eight.
- **Solar farm, gas turbine, combined-cycle station, nuclear station**: rows of
  tilted panels facing the sun at every rotation; a turbine package and one slim
  stack; a heat-recovery boiler, a taller stack and a cooling tower; a domeless
  reactor building, a switchyard and a shore intake. See
  [civic-massing.md](../civic-massing/reading-a-civic-building-at-a-glance/the-generators-solar-gas-combined-cycle-and-the-reactor.md).
- **The parks** are five rungs that read apart at the default pitch without
  a label, each the real size of its type
  ([parks-and-recreation.md](../../specs/parks-and-recreation.md)).
  Every rung's ground is one merged plate: a draped rung's is a lattice at a
  vertex every 4 m (every 10 m on the district park, whose 400 m of lawn
  would otherwise cost more triangles than its trees) whose heights are read
  from the terrain, so it lies on its hillside as a lot's lawn does, and a
  levelled rung's is flat; the path cross
  and every marking are vertex-colour strips in the same plate. Trees stand
  along the edge and the paths at one every 24 m of perimeter, benches along
  the paths at one every 50 m, floored at two; the middle stays open. Trees
  and benches are one instanced pool each across every rung.
  - **Pocket Park** (1×1): the lawn, a cross path, 2–3 trees, 2 benches — as
    it has always been, a square with a cross.
  - **Civic Plaza** (5×5): pale paving the whole footprint with a darker
    band pattern every 10 m, a central feature square of 12 m, 17 trees in
    raised planters 2 m square along two edges, 8 benches around the centre;
    no grass. It must read as a public square between towers, not an
    unzoned lot.
  - **Neighbourhood Park** (9×9): a lawn with a path cross and a path ring
    6 m in from the edge, 30 trees along the ring, 7 benches on it, and a
    play zone of 30 × 30 m of tan safety surface off-centre with two bright
    play frames (box-and-post) in it.
  - **District Park** (20×20): open ground ringed with 67 trees at the edge
    and 8 specimen trees at 1.3 scale inside, a path ring and two crossing
    paths, 16 benches, a pond 40 × 30 m of the water colour sunk 0.3 m where
    the ground is lowest within the footprint, and a 12 × 8 m pavilion block
    of 3.2 m on the path ring.
  - **Sports Ground** (6×4): one FIFA pitch, 105 × 68 m of a slightly
    darker green than the lawn with the 3 m run-off left plain, white
    vertex-colour lines 0.12 m wide (touchlines, halfway, centre circle
    9.15 m, penalty areas 16.5 m, goal areas 5.5 m), two goals 7.32 × 2.44 m
    of white posts, 17 trees along the long sides, 2 benches, and a 40 × 6 m
    changing pavilion 3.2 m tall along the site's road edge, never mid-pitch
    (the pitch and its run-off leave 6 m of the 80 m width, so the block is
    long and shallow, as a changing-room range is), with a fenced apron of
    0.9 m posts and rails on the pitch's long side toward it.
  - **Wear.** Past a catchment load of 1.0 a park's lawn is tinted toward
    scuffed earth by a per-instance colour on the ground plate, linearly to
    bare at load 3; a plaza and a pitch wear nothing. A player sees a full
    park before they read it in a panel.
- **Hospital**: a six-storey block of about 2,800 m² a floor in light
  cladding, 27 m to its parapet, with a dark window band on every floor at
  its 4.5 m storey; a glazed main entrance under a canopy and, beside it, an
  ambulance canopy over the emergency drop-off with an ambulance parked
  under it. Next to the block stands the 3×2 parking deck: an open two-level
  deck, 3.35 m floor to floor, its roof edged by a precast spandrel band,
  with a ramp up its far side, two stair-and-lift cores at its street corners
  and cars in its painted stalls on both levels. Between the entrance and the
  deck lie the five accessible spaces, each painted with the accessibility
  symbol the kerbside stalls use, the van space wider, every access aisle
  hatched. The kit paves its whole lot.
- **The four fire and police stations** are kits on a paved lot: framed bay
  doors, an apron and the parked engine for fire; an entrance with a canopy, a
  sally port and the car park for police; windows and door panes that light at
  night. See [civic-massing.md](../civic-massing/reading-a-civic-building-at-a-glance/the-fire-and-police-stations.md).
- **The four schools and the library** are kits: classroom wings at their stated
  floor, a gym, and grounds — playground, bus pull-in with a parked school bus,
  tennis courts, a college quad, a library's raised reading room. See
  [civic-massing.md](../civic-massing/reading-a-civic-building-at-a-glance/the-schools-the-college-and-the-library.md).
- **The clinic, the rail station and the bus stop** are kits: a drop-off
  under a porte-cochère, a platform and a combination depot on the track
  edge, an agency shelter on a lawn tile. See
  [civic-massing.md](../civic-massing/reading-a-civic-building-at-a-glance/the-clinic-the-depot-and-the-bus-stop.md).
- **The three depots** are kits read by their bay doors and the fleet on the
  apron: the bus depot and the central bus garage share one recipe (stall
  rows about their aisles, a shop with framed drive-through bays, a wash
  gantry, fuelling islands and an office, the buses nose-in on the stalls);
  the tram depot and the rail yard run a turnout lead off the track edge
  into a ladder of stabling roads with the sets stabled on them, under
  catenary poles at the tram depot and over ballast at the yard, the shop
  hall along the track side. The vehicles parked are what the depot holds
  less what is out on the lines. See
  [civic-massing.md](../civic-massing/reading-a-civic-building-at-a-glance/the-depots.md).
- Every zoned-growth building keeps the standard facade system with its
  own kit's parts, because those genuinely are buildings; the airport
  stays a box until it has an epic of its own.

For a kit-owned catalog entry, the building instancer draws a low plinth
(about 8% of the catalog height, a plain desaturated slab with no window
shader) beneath the kit instead of a full facade box, so the kit carries the
visual identity while selection and outline still land on the right
footprint. Kit parts stay unlit at night, except a small red beacon on the
wind turbine's nacelle and the windows and door panes of the stations, the
schools, the library, the clinic and the depot.

**The landfill** renders as an operated facility rather than a tint. Its
office tile — the area's street-adjacent entrance — carries a gatehouse kit:
a terrain-conforming concrete yard pad, a small office box with a roof cap
and a street-facing door, a two-bay striped nose-in parking row, and a yard
light with a glowing head, laid out in a road-facing frame so it fits its
tile at any orientation. Every other tile in the area is dumping ground: a
tint plus a pile that scales with how full it is. The renderer is always
visible — a facility, not a data lens the player has to switch on.

