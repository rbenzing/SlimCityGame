# Airport facilities

- **Status:** Built

**Owns:** what stands on an airport's plot beside its runway, apron and terminal: the fence, the control tower, fuel, maintenance and cargo buildings, the garages, the terminal's roads, signs and boarding bridges.

**Rules:**

- Fit every part inside the plot [airports.md](airports.md) gives its rung. A plot never grows `[R-saves-013]`, and no part enters the two clear areas `[R-world-052]`.
- Fence the airside on every side. Buildings on the fence's line close it; a gate stands wherever a road crosses it. `[R-world-053]`
- Give a rung only the parts an airport of its size has: no tower, garage or cargo on the airfield.
- Stand the tower where its cab sees every point of runway and taxiway pavement, at 0.80° or more below level, past every building.
- Keep every building but the tower under the 7 to 1 surface that rises from the runway's primary surface.
- Lay the support buildings in the building strip either side of the terminal, between the runway's thresholds, each on an apron or a road of its own.
- Round every paved corner as [paved-corners.md](paved-corners.md) rules. `[R-render-045]`
- Draw each part from the shared pools: no new mesh a part, no texture, no lettering.

**Numbers:** metres; "dial" is the game's own figure. Sources: [airports](../sources/airports.md#facilities).

| Part                                | Airfield         | Regional          | International       | Source                                   |
| ----------------------------------- | ---------------- | ----------------- | ------------------- | ---------------------------------------- |
| Fence height                        | 1.2              | 2.4               | 2.4                 | AC 150/5300-13B E.6.3, 6.8               |
| Barbed wire outrigger               | none             | 0.3 at 45°        | 0.3 at 45°          | 13B 6.8: 2.1 fabric, three strands       |
| Fence posts apart                   | 3.05             | 3.05              | 3.05                | dial                                     |
| Control tower, height               | none             | 26.5              | 60.4                | Gulf Shores; Birmingham-Shuttlesworth    |
| Tower cab across; shaft across      | none             | 7.6; 6.0          | 7.6; 9.0            | Gulf Shores' cab; shafts are dials       |
| Least sight angle from the cab      | none             | 0.80°             | 0.80°               | 13B 6.11.7                               |
| Primary surface width               | 76.2             | 152.4             | 304.8               | 14 CFR 77.19, by approach                |
| Fuel tanks                          | 1 lying          | 2 upright         | 3 upright           | dial                                     |
| Tank, across × long or high         | 3.0 × 6.4        | 9.1 × 6.1         | 16.3 × 6.5          | 12,000 gal; dial; Miami's shape, a dial  |
| Tank to any building, least         | 15.2             | 15.2              | 15.2                | NFPA 407, as quoted                      |
| Dike wall round upright tanks       | none             | 1.0               | 1.0                 | dial                                     |
| Maintenance hangar, wide × deep × high | 18.3 × 24.4 × 6 | 45 × 62 × 20     | 75 × 95 × 26.5      | hangar makers' guides                    |
| Hangar apron depth                  | 12               | 40                | 72                  | the aircraft's length and clearance      |
| Cargo buildings, wide × deep × high | none             | 1 of 60 × 30 × 9  | 2 of 120 × 36 × 10  | dial                                     |
| Cargo stands                        | none             | 1 narrow          | 2 wide              | dial                                     |
| Truck court depth                   | none             | 36.6              | 36.6                | a loading dock guide                     |
| Garages                             | none             | none              | 2 of 5 tiers        | dial                                     |
| Garage, long × wide; stalls a tier  | none             | none              | 135 × 73.2; 400     | the stall module, eight rows of 50       |
| Garage ramp drum, across            | none             | none              | 18                  | dial                                     |
| Surface car park                    | 20 stalls        | 10 rows of 120    | none                | [airports.md](airports.md)'s spaces      |
| Terminal kerb lanes                 | the 7.32 road    | 2.4 + 2 of 3.6    | 2.4 + 3 of 3.6      | AC 150/5360-13, as quoted; ACRP RR 266   |
| Loop road elsewhere                 | none             | 2 of 3.6, one way | 2 of 3.6, one way   | same                                     |
| Kerb walk                           | none             | 3.4               | 3.4                 | AC 150/5360-9, as quoted: 2.4 and a door |
| Service road                        | none             | 7.32              | 7.32                | the 24 ft aisle                          |
| Entrance sign, wide × high; top     | 2.4 × 1.2; 1.8   | same              | same                | one airport's sign guide                 |
| Guide sign gantries over the loop   | none             | 1                 | 2                   | dial; the street gantry's sizes          |
| Triangles a plot, at most           | 15,240           | 26,270            | 41,050              | measured, and a tenth over               |
| Boarding bridges                    | none             | 4                 | 6                   | one a terminal stand; size a dial        |

**Code:** `src/shared/airportlayout.ts` `airportLayout` (the parts as fields of `AirportLayout`, every figure a named constant); `src/render/airportfacilities.ts` (the plate's polygons, the solid parts, the fence); `src/render/airportkit.ts` (the plate and the buildings); `src/render/landmarks.ts` (the pools, one of them a cylinder); `src/shared/roundedoutline.ts` (the arcs); `tools/airport-shots.mjs` (landside, support, parking and gantry frames a rung).

**Tests:** `src/shared/airportlayout.test.ts` (every figure here; every part inside the plot, off the clear areas, off each other and off every road; the fence closed; the tower's sight lines; heights under the 7 to 1 surface); `src/render/airportfacilities.test.ts` (each part drawn at its size; pools shared; nothing off the plot; corner radii from the plate; the triangle ceilings).

**Open:**

- The car park and the garages' roofs hold no cars, and the loop has no trees: the car and tree pools belong to other renderers.
- The terminal, the cargo buildings and the tanks are plain bodies.

- A rotating beacon, a wind cone and apron floodlights are not drawn: their standard (AC 150/5340-30) is not held.
- A perimeter road inside the fence is not drawn: the standard asks for one only where a security assessment does.
- A fire station on the airfield side is not drawn, though a certificated airport keeps one.
- Cargo building sizes, tank counts and the boarding bridge are dials: the cargo planning guide (ACRP Report 143) was not read.
- Signs carry no lettering.

## Why the rules are what they are

### Why the plot stays as it is

A save holds a building by its id and corner, so a footprint cannot grow. Each plot already has room. The terminal, its apron and its car park fill the middle of the near side. The building strip and the car park's strip run the whole length of the runway, and outside the middle they were grass.

### Where each part stands

The near side keeps its strips. Along the runway it has three zones: cargo on one side of the terminal, maintenance and fuel on the other, and the terminal's own roads and parking in the middle.

A hangar or a cargo building stands behind an apron of its own. That apron lies in the apron strip and reaches the taxiway as the terminal's apron does. A cargo building's other face has dock doors on a truck court. Fuel stands at the end of an apron, where a fuel truck reaches aircraft without crossing a taxiway (13B E.5.1.1).

The building line is the building strip's street face. The terminal, the tower, the cargo buildings and the airfield's hangars stand flush on it. A tall hangar stands back from the runway for the 7 to 1 surface, so it straddles the line, and the fence meets its side walls.

Maintenance and fuel stand on one side of the terminal and cargo and the tower on the other, each 15.2 m from the next. The game's own gaps are named constants in the layout: 3.0 m between tanks, 1.5 m from tank to dike, 7.2 m between the garages, a 1.8 m verge at the drive.

Support buildings stay between the runway's thresholds. Beyond a threshold the approach surface begins, and the sides are the simpler rule to test.

### The fence

The standard for an airport with airline service is 2.4 m: 2.1 m of chain link under a 0.3 m outrigger of three barbed strands leaning out at 45°. For a small general aviation airfield in a town it advises 1.2 m of chain link and no wire.

The fence stands at the plot's edge round the far side and both ends. At the ends the plot runs past the object free area, so the fence is outside it. On the far side the plot's edge is that area's edge: the posts stand with their outer faces on it, one post's width (0.18 m) inside the area. It is the one thing above ground there `[R-world-052]`. Its barbed wire leans out 0.12 m past the plot's edge. On the near side it follows the building line. The terminal, hangars and cargo buildings stand on that line with one face each side, as real ones do, and the fence runs between them. The car park, the garages and the loop road are outside it.

A gate is as wide as the road through it.

### The tower

The airfield has none: the design circular gives its own rules for airports without a tower, and a small field is one. The regional's is 26.5 m, a recent tower at a small airport (Gulf Shores, 87 ft). The international's is 60.4 m, the tower at Birmingham-Shuttlesworth (198 ft), an airport near its four million passengers.

It stands on the building line beside the terminal, at the runway's middle. The circular asks for a clear line of sight to every movement area at 0.80° or more. A test casts that line from the cab to the corners of the runway and the taxiways and holds it clear of every building.

### How high a building may stand

Federal airspace rules draw a surface that rises 1 m for every 7 m from the edge of the runway's primary surface. That surface is 76.2, 152.4 or 304.8 m wide by the approach the runway supports. A building's height is at most a seventh of its distance past that edge.

This is why a tall hangar stands back behind its apron. The regional's 20 m hangar must be 216 m from the runway's centreline, and the international's 26.5 m hangar 338 m.

A tower stands above that surface, as real ones do: the rules ask for a study of whatever exceeds it, and do not forbid it (13B 5.4 says the same of parked aircraft).

### Fuel

The airfield has one lying tank of 12,000 gallons, the large end of the self-service range, 3.0 m across. The international's three upright tanks keep the proportions of Miami International's three, 36.6 m across and 14.6 m high, at under half the size: a dial, since that airport is many times busier. The regional's two are a dial.

No tank is nearer than 15.2 m to a building. That is the distance the fuelling standard gives a parked fuel truck, used here for tanks because the tank table was not read.

### Garages and the loop road

The international's 4,000 spaces move from one field of asphalt into two garages of five tiers. Each tier is eight rows of 50 stalls on the shared stall module, so each garage holds 2,000. Each has open tiers, painted stalls on its roof, a round ramp drum at one end and a spur from the loop to its entry. The regional keeps a surface car park of ten rows of 120 stalls inside its loop, with a round-nosed island at each end of every pair of rows.

A terminal's road is a one-way loop: in from the drive, past the terminal's kerb, round the parking and out by the same drive. At the kerb it has a 2.4 m stopping lane beside its through lanes. The international has four lanes there, the count the curbside research finds enough. Lane lines are white, since every lane runs one way; the two-way drive has a yellow centre line.

A service road leaves the loop along the landside of the building line to the cargo court, the hangar and the fuel gate.

### The terminal's kerb and bridges

A terminal's street face has a door 3.6 m wide every 30 m, two at least, and the airfield's pilots' building one of 1.0 m, reached by a 1.8 m walk from its car park. The pilots' building stands flush on the building line, so it closes the fence there. All three sizes are dials.

A canopy covers the kerb walk. Each terminal stand has a boarding bridge from the terminal's face to the aircraft's forward left door. Both are dials: no standard for either is held.

### Signs

An entrance sign stands at the drive, a low panel 2.4 m wide whose top is 1.8 m up, the limit in one airport's sign guide. The loop carries the street's own guide sign gantry. Neither has lettering: the game draws no text in the world.

## Decided

- Parts inside the shipped plots over larger plots: a footprint cannot grow, and the room was there.
- Buildings on the fence line over a fence round each building: it is how a real terminal divides landside from airside.
- No perimeter road: the standard asks for one only on a security finding, and the plot's ends leave 1.2 m.
- Garages on the international only: a regional airport of 1.2 million passengers parks on the surface.
- One loop through one drive over a second entrance: a plot declares one drive.
- Prices unchanged: a rung was priced from its terminal, and no cost for the other parts was found.
