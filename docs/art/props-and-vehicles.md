# Props and vehicles

The vehicle kit, parked cars, landmark ploppables, utility and service
silhouettes, and the street furniture and lamp kit. Night emissive and glow
treatments (headlights, taillights, the lamp's own light) are described fully
in [lighting.md](../visual-render/lighting.md); this file covers the models themselves.

## Vehicle kit

Vehicles are multi-part merged geometry, still one InstancedMesh per kind —
no draw-call growth:

- **Construction**: a merged BufferGeometry of 3 parts per kind — a body
  slab, a darker inset cabin/window mass (`#1a1f26`), and wheel cylinders. A
  region-mask vertex attribute lets the per-instance colour tint ONLY the
  body vertices; windows and wheels keep their fixed colours.
- **Kind mapping**: Car picks a sedan, wagon or hatchback silhouette by a
  slot-index hash; Truck picks a box-truck or pickup variant; Bus is a long
  body with a window band. Every variant is a geometry offset inside its
  kind's merged mesh, chosen deterministically.
- **Palette**: a curated ~10-colour saturated list (red, blue, teal, green,
  magenta, pink, yellow, orange, white, charcoal) picked by a slot hash — a
  deliberate saturation contrast against the desaturated city in
  [buildings.md](buildings.md). Yellow reads as a taxi without needing a
  separate livery.
- **Heading**: a vehicle's mesh has its nose at +Z, so its facing yaw is
  `atan2(dx, dz)` — a car's long axis always aligns with the direction it is
  actually travelling.
- **Lane position**: a cosmetic vehicle is offset perpendicular to its travel
  direction into its own right-hand lane, by a tier-derived half-lane, so
  opposing flows separate onto the carriageway instead of overlapping on the
  centre paint.
- **No wheel spin** — imperceptible at RTS zoom, skipped deliberately.

**Service liveries.** Fire, Police, Ambulance and Garbage vehicles carry a
fixed, baked livery per kind rather than the randomized civilian palette
above, built from the same body + cabin-band + wheel-box parts:

- **Fire** — red body, red roof light-bar, the largest of the four bodies.
- **Police** — blue body, blue roof light-bar, sedan-sized.
- **Ambulance** — white body, the same red light-bar as fire, plus a small
  red-cross accent on the roof in front of the bar; a US Type III box on a
  van chassis, 6.9 × 2.5 × 2.7 m (the figure is derived in
  [healthcare-and-death-care.md](../engineering/features/healthcare-and-death-care.md)).
- **Garbage** — municipal green body, no light-bar; instead a raised rear
  hopper/compactor box in a darker green over the back ~40% of the body, plus
  a small amber beacon.

All four share the dark cabin/window band and simple wheel boxes from the
civilian kit's construction above.

**The hearse** is a fifth service body with its own construction, **6.2 × 1.9 ×
1.9 m** at real size: a long hood, a short glazed cabin and a closed landau coach
behind it with a padded roof, tinted rear glass and chrome landau bars, chrome
bumpers and grille, a black body. No light bar and no cross. 6.2 m is the
simulation's own figure, between a Cadillac XTS-based US coach (6.32 m) and a UK
Coleman Milne coach. The **livery, black with chrome-grey trim, is the game's own
choice**; no source for a coach colour was found. It reads apart from the
ambulance (white, red light-bar, 2.7 m tall) by height and colour, and from a car
(4.0 m, 1.5 m tall) by length.

| Kind      | Size (w × h × l, m) | Livery                          |
| --------- | ------------------- | ------------------------------- |
| Car       | 1.8 × 1.5 × 4.0     | randomized palette              |
| Ambulance | 2.5 × 2.7 × 6.9     | white, red light-bar, red cross |
| Hearse    | 1.9 × 1.9 × 6.2     | black, chrome-grey trim, no bar |

Like every kind it is one InstancedMesh, in the service-vehicle renderer.

## Parked cars and lot life

Static parked cars are an occupancy signal, not decoration:

- **Placement**: on a suburban commercial or industrial lot, one car to each
  stall of the car park laid to code
  ([parking-to-code.md](../game-design/features/parking-to-code.md)), nose
  in, centred in its 9 × 18 ft stall; a vehicle longer than the stall stands
  with its nose 0.2 m short of the stall's head and its tail over the aisle.
  Constructing and Abandoned buildings park zero cars — an empty lot is
  legible sim state, matching the dark-window rule for abandonment in
  [buildings.md](buildings.md).
- **Look**: simple two-box cars (body plus cabin) in the vehicle kit's
  saturated palette, picked by a hash of the building id and stall index,
  standing between the lot's white stall lines — the parking-lot read.
  Industrial lots mix box trucks (7 m) and pickups in with their workers'
  cars, using the lorry silhouette; commercial lots park cars. Homes never street-park: a home that fronts a street parks on
  its own drive — see [Residential lots](buildings.md#residential-lots).
  A farm keeps a pickup in its yard, the lorry silhouette at a full-size
  pickup's 5.31 × 2.03 × 1.91 m, which does the rounds of the yard by day and
  parks by the farmhouse at night — see
  [the farms spec](../engineering/features/farms.md).
- **Orientation**: a stall is parallel street parking — the car's long axis
  runs along the road, not perpendicular to it — the standard read for a car
  actually parked at a kerb or in a row. Where the street paints an angled or
  head-in parking lane, a kerbside car stands at its stall's angle instead,
  centred in the stall across the lane's own depth: in an angled (60°) stall
  it has backed in, so its nose points out toward the travel lane and along
  the traffic; in a head-in (90°) stall its nose faces the kerb. Accessible
  stalls take cars by the same occupancy rule as any other stall.
- **A car stands on its own lot, or at the kerb, never both.** Where a
  building's own lot doesn't serve its parking (no car park, no garage),
  its cars park at the kerb instead: past the verge and the sidewalk,
  parallel, with no apron and no painted bay, since the road itself is
  already paved. Kerbside cars, like the lamps and signs in
  [streets.md](streets.md), never stand on a tile with road on both axes,
  and never inside a junction's no-parking zone: 9.1 m before a stop line,
  6.1 m from a crosswalk, or 6.1 m from the mouth of an arm with none, on
  either side of the junction — the same zone the parking lane's stall marks
  keep out of. Where the street paints a parking lane, a car stands one to a
  marked stall, centred in it, never across a stall mark; every marked stall
  is 6.1–7.9 m long, so a stall always holds exactly one car.
- **The street decides when a kerb may be parked at.** Where the street
  paints a parking lane on the kerb's side, cars stand in the middle of that
  lane at any hour, and the homes that use it keep theirs there overnight:
  about nine in ten spaces taken from 19:00 to 07:00, about four in ten by
  day. Where the street's tier allows parking but it paints no lane — every
  preset street that allows parking — a kerb takes only short daytime stays,
  half a car into the carriageway: none before 08:00 or after 19:00, and at
  most half the spaces between. Every other road takes no kerbside car at
  all. The kerb is for the buildings with nowhere of their own, which leaves
  apartments; a home fronting a street has its drive.

## Landmark ploppables

The **airport** is a large-footprint (~8×6 tile) landmark, not a functional
transit system: a terminal slab with rooftop monitor boxes, a control tower,
an apron ground plate with taxiway striping, 2–3 static parked planes at jet
bridges (props, exactly like the trees in [vegetation.md](../visual-render/vegetation.md) — no flight
simulation), and a row of parked cars at the entrance in the style above.
More landmarks (a stadium, an observatory) are planned to reuse the same
landmark-mesh path.

## Utility and service silhouettes

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
  [buildings.md](buildings.md), the coal stockpile with its conveyor
  gallery, a cooling tower, an ash silo and a switchyard.
- **Incinerator, recycling depot, MRF and transfer station**: a tipping
  hall, boiler hall and stack; a roll-off drop-off; a baling hall with its
  docks; a tipping floor with push walls over a load-out bay. See
  [civic-massing.md](civic-massing.md#the-earliest-kits-redone) for all
  eight.
- **Solar farm, gas turbine, combined-cycle station, nuclear station**: rows of
  tilted panels facing the sun at every rotation; a turbine package and one slim
  stack; a heat-recovery boiler, a taller stack and a cooling tower; a domeless
  reactor building, a switchyard and a shore intake. See
  [civic-massing.md](civic-massing.md#the-generators-solar-gas-combined-cycle-and-the-reactor).
- **The parks** are five rungs that read apart at the default pitch without
  a label, each the real size of its type
  ([parks-and-recreation.md](../game-design/features/parks-and-recreation.md)).
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
  night. See [civic-massing.md](civic-massing.md#the-fire-and-police-stations).
- **The four schools and the library** are kits: classroom wings at their stated
  floor, a gym, and grounds — playground, bus pull-in with a parked school bus,
  tennis courts, a college quad, a library's raised reading room. See
  [civic-massing.md](civic-massing.md#the-schools-the-college-and-the-library).
- **The clinic, the rail station and the bus stop** are kits: a drop-off
  under a porte-cochère, a platform and a combination depot on the track
  edge, an agency shelter on a lawn tile. See
  [civic-massing.md](civic-massing.md#the-clinic-the-depot-and-the-bus-stop).
- **The three depots** are kits read by their bay doors and the fleet on the
  apron: the bus depot and the central bus garage share one recipe (stall
  rows about their aisles, a shop with framed drive-through bays, a wash
  gantry, fuelling islands and an office, the buses nose-in on the stalls);
  the tram depot and the rail yard run a turnout lead off the track edge
  into a ladder of stabling roads with the sets stabled on them, under
  catenary poles at the tram depot and over ballast at the yard, the shop
  hall along the track side. The vehicles parked are what the depot holds
  less what is out on the lines. See
  [civic-massing.md](civic-massing.md#the-depots).
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

## Street furniture and lamp kit

- **Bus-stop shelter**: the transit-agency shelter the bus-stop ploppable
  carries, 1.52 × 3.66 m with a glazed back and ends, a 6 ft bench, a
  receptacle and a flag sign with its bottom 7 ft up, from one builder
  shared with the kit, so a line's stop and a plopped stop read alike —
  low-poly, instanced, deterministic per stop; the figures are in
  [civic-massing.md](civic-massing.md#the-clinic-the-depot-and-the-bus-stop).
  A line's stop on a plopped bus stop's tile draws no shelter of its own.
- **Incident pins**: a call's marker is a cone the selection pin's size,
  4.4 m tall and 1.6 m across at its base, point down, hovering 2.5 m above
  the roof of the building it marks (above the ground where there is none),
  grown to one and a half times that by severity. It is read against the
  art anchors — taller than a 1.75 m person, shorter than a two-storey
  house — and never covers what it marks; its colour is the call's kind,
  dimmed toward ash when nobody is coming.
- **Pedestrians**: cosmetic low-poly people, a few idling at each shelter and
  a sparse scatter walking the sidewalks near Active buildings — instanced,
  deterministic, with a slow walk-cycle offset. Idling people cluster around
  the shelter's own ground anchor on the sidewalk, matching how far the
  shelter itself sits from the carriageway, rather than around the stop's
  road-tile centre; under a raised station, where no shelter stands, they
  stand on the platforms. A walker walks the **footway**, which is on the road
  tile and not the lot: the street's own cross-section puts the pavement
  between its verge and its kerb, and the lot's first row is the house's
  lawn — or the house. Anchored a tile back from the road instead, a walker
  whose home touched the street walked through its living room. The stroll
  is a stretch of pavement walked out and back along the street, barely
  across it, with a smooth turn at each end; which way "along" points is read
  from the road tile itself, so a corner lot's walker still follows the
  street it is standing on. A walker from a home with a front door also goes
  in: each cycle leaves the pavement, walks the house kit's own straight path
  to the door and comes back, so the people and the lot plan agree about
  where the door is. Lamps skip any tile a driveway crosses, so a lamp never
  ends up standing in the kerb cut cars drive through.
- **Lamp model**: a tapered pole, an arm bracket, and a real modeled lamp
  housing, not a bare box. The pole itself renders a mid charcoal (`0x50555d`)
  rather than a near-black — a tone that dark sits below the point where
  Lambert shading reads at all, and a slim pole disappears into a flat dark
  line at that colour — so the lighter charcoal still takes visible sun
  shading and reads as painted metal. Poles alternate sides of the street.
  See [lighting.md](../visual-render/lighting.md) for the glow the housing itself carries at
  night, the spacing between poles, and the night schedule.

## Deferred

Headlight cones and their ground pools stay deferred (see
[lighting.md](../visual-render/lighting.md) for the lamp's own ground pool, which is
unrelated and already ships). A taxi still reads only from the plain yellow
civilian palette above — no separate roof sign has been built for it — and
no aerial ladder has been built for the fire truck. [DESIGN.md](../DESIGN.md)
owns this backlog and its reasoning.
