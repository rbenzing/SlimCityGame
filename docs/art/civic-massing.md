# Civic and utility massing

How big a ploppable service or utility building is, and why. Zoned buildings
grow to a size the simulation picks; a civic building is placed by the player
at a size **we** pick, so that size has to come from somewhere other than
taste.

[buildings.md](buildings.md) owns the facade and archetype language, and
[props-and-vehicles.md](props-and-vehicles.md) owns the silhouettes of the
few ploppables that get their own detail kit. This page owns the one thing
neither of them states: the arithmetic from a building's _purpose_ to its
`footprint` and `height` in the catalog.

## The conversion

A catalog `footprint` is in tiles and a catalog `height` is in metres, and the
renderer turns both into real floor area:

- A body fills `DEFAULT_BODY_M_PER_TILE = 13.6 m` of each 20 m tile it stands
  on, so **one tile of footprint is a 185 m² floor plate** (13.6²).
- A storey is 3.2 m, so **storeys = height ÷ 3.2**.

Which gives the only formula on this page:

```
gross floor area (m²) = footprint.w × footprint.d × 185 × (height ÷ 3.2)
```

A 2×2 lot 12 m tall would be 740 m² per floor over 3.75 storeys — about
2,800 m² gross; the stations were once that tall and are 6.4 m now. That is the
number a code figure has to be checked against, not the tile count, and it is
why a "small" civic building at this scale is still a substantial building.

Where a lot is set by its site, not its floor — bays and an apron, a car park —
the catalog's formula over-reads the floor, and the building's stated floor is
what its power and water are drawn from. The stations below are the case.

## Deriving a size from the code

Generic building code sizes a building by **occupant load**: a floor area per
person for each occupancy type, and life-safety requirements that follow from
the resulting head count. Sizing a civic building runs that backwards.

1. **Pick the head count from the service's own capacity.** The people a
   facility serves is a design number that each epic derives from a municipal
   standard; the people _inside_ it is a fraction of that — staff for most
   services, staff plus attendees for schools and assembly.
2. **Multiply by the occupancy factor.** The common ones, converted from the
   code's imperial figures:

   | Occupancy                             | Area per occupant |
   | ------------------------------------- | ----------------- |
   | Assembly, tables and chairs           | 1.4 m² net        |
   | Classroom                             | 1.9 m² net        |
   | Shop, laboratory, vocational room     | 4.6 m² net        |
   | Industrial                            | 9.3 m² gross      |
   | Business (offices, clinics, stations) | 13.9 m² gross     |
   | Institutional, inpatient treatment    | 22.3 m² gross     |
   | Storage, warehouse, depot             | 46.5 m² gross     |

3. **Convert net to gross where the factor is net.** Corridors, stairs,
   plant and walls are not in a net figure. Civic buildings run about 65%
   efficient, so gross ≈ net ÷ 0.65.
4. **Choose storeys, then solve for tiles.** Storeys come from what the
   building type actually does: anything with vehicle bays or a public hall is
   low, offices and inpatient wards go up. Then

   ```
   footprint tiles = gross floor area ÷ 185 ÷ storeys
   ```

   rounded **up** to a whole rectangle, because a fraction of a tile is not a
   thing the grid can hold.

5. **Add the site, not just the building.** Several services need ground the
   floor-area sum does not cover, and that ground is part of the footprint:

   | Requirement                       | Size                             |
   | --------------------------------- | -------------------------------- |
   | Fire apparatus bay, drive-through | 4.9 m wide × 18.3 m deep per bay |
   | Fire apparatus bay, back-in       | 4.9 m wide × 14.0 m deep per bay |
   | Fire access road, unobstructed    | 6.1 m wide, 4.1 m clear overhead |
   | Parking stall, 90°                | 2.7 m × 5.5 m                    |
   | Two-way parking aisle             | 7.3 m                            |
   | Ambulance canopy bay              | 3.7 m × 9.0 m                    |

6. **State the arithmetic in the epic's design document.** A catalog entry
   whose size has no shown derivation is a guess, and a guess is what this
   page exists to stop.

## Where a derived size is overridden

Two rules beat the arithmetic, and when either applies the epic's document
says so rather than quietly rounding:

- **The smallest facility of a ladder must fit a neighbourhood.** A derived
  size that makes the small version of a service as big as the large one has
  collapsed the ladder, which is the whole design. Drop its head count until
  the two are visibly different buildings.
- **Nothing exceeds what the grid can place sensibly.** A footprint wider
  than about 6 tiles is 120 m of frontage — a whole block — and the player
  cannot site it anywhere a growing city has room for. Go up instead of out.

## Reading a civic building at a glance

A service building has to be identifiable from the default camera pitch
without its label, because the player's question is "where is my fire
station", not "what is that grey box". Each one is recognised by the part of
it that does the work, and that part is the one modelled:

- **Vehicle services** — fire, ambulance, garbage, road maintenance, transit
  depots — are read by their **bay doors**: a wide, tall opening row facing
  the street, apron in front, and the vehicles parked on it. The bays are the
  silhouette; the office behind them is a box.
- **Public-counter services** — police, libraries, town offices — are read by
  an **entrance**: a marked door on the street face, steps or a ramp, and a
  mast. They are otherwise ordinary buildings and keep the standard facade.
- **Process utilities** — power, water, sewage, recycling — are read by their
  **plant**: stacks, tanks, cooling, clarifier rings, conveyor. The process
  vessel is bigger than the building and sits outside it.
- **Campus services** — schools, hospitals — are read by their **grounds**: a
  long low block with an open field or a parking apron beside it, not a
  single mass filling the lot.
- **Burial grounds** — the cemetery — are read as **grounds, not a building**:
  a lawn of grave rows, a drive from the street, a fence and a small gatehouse.
  The crematorium is a small building with a chapel and a flue. See below.

### The cemetery

The 3×3 lot at 3.2 m is one lawn plate on the highest ground under the lot (as
the paved kits stand), with:

- **One gatehouse tile**, on the street side beside the drive: one storey, 12 ×
  10.67 m (128 m², the design figure), gabled to 3.2 m, with a small paved
  forecourt before its door.
- **Eight burial sections** of 14 × 7 = 98 graves each, 784 spaces; the first 780
  are used. Each space is 1.07 × 2.44 m, the 42 × 96 in minimum of Florida
  Statutes 497.274, with 0.08 m between neighbours and a 0.3 m aisle between rows,
  drawn as a darker turf patch so the rows read from the default pitch.
- **An interior drive** 20 ft (6.1 m) wide, two-way, along the line between the
  last two columns of tiles from the street edge to the back fence (Montgomery
  County MD private interior road standard). It crosses sections and so takes
  their margin; each still holds 98 graves.
- **A perimeter fence** 1.5 m high (cemetery fences run 4-6 ft; Roslyn WA caps
  them at 6 ft; 1.5 m is the game's choice), posts, rails and pickets, with a
  gap as wide as the drive and a stone pier either side.
- **Trees**, the park's tree, in the lane between sections and beside the
  gatehouse.
- **Headstones**, one instanced mesh for every cemetery: an upright 0.61 × 0.20 ×
  0.76 m (24 × 8 × 30 in, inside the common US single-upright range of 24-36 in
  tall, 20-30 in wide and 6-8 in thick) on a 0.1 m wider, 0.1 m high base, grey
  granite, standing at the head (back) end of its space. A cemetery shows exactly
  as many as its interments, in fill order: the front section first, each from
  its front row, never more than 780. The count follows the snapshot's
  `deathCare.facilities`, not the building delta.

The lot's local +Z is the street side; the player turns the lot to face the road
like the other kits. Layout is a pure function of the footprint, at all four
rotations. The grave colours, fence and gatehouse colours are the game's own.

### The crematorium

A 2×2 lot on the same lawn plate, one tall storey counted as two floors, 6.4 m
at the chapel's ridge, read as a **process utility with a chapel**: a flue and
its duct, not a grave. Four rooms, from the design figures: the **chapel**, 15 ×
14.33 m (215 m²) under a gable along X, 3.6 m to the eaves; the **cremator hall**,
16 × 15 m (240 m², plant and body store included) under a flat roof at 4.5 m (15
ft, the game's own height, unsourced: enough to clear a retort and its breeching
duct) with a
dark cap (the hall's 240 m² is likewise the one area with no published source);
the **foyer**, 8 × 7.5
m (60 m²), 3.6 m, with the door and two windows on the street side; and the
**office**, 12 × 9.25 m (111 m²), 3.2 m, three windows. The hall and the chapel
share a back line and a front line; the foyer joins them and the office stands
before the hall. A 9 m paved forecourt runs from the foyer door to the street
edge.

The **flue** is one 8-sided steel stack about 0.9 m (36 in) across, the game's
own diameter, **7.6 m (25 ft)** above grade with a dark rim at the mouth. It
stands on the hall's street-side roof edge, 3.1 m clear of the 4.5 m roof deck
(2.8 m over its cap, past the Michigan general permit's 3 ft), with a 5 m
exhaust duct along the roof to its foot. It
is the silhouette that says what the building does. Three InstancedMeshes:
grounds, building, flue. Layout is a pure function of the footprint, at all four
rotations, local +Z on the street side.

### The fire and police stations

Four stations, one kit: a paved lot with the building on its back and left, the
lot's local +Z the street side, the player turning it to face the road. All four
turn at the four rotations and stand on the highest ground under the lot.

| Station                 | Lot | Height | Stated floor         | Plate × storeys          | Doors and ground                                                                  |
| ----------------------- | --- | ------ | -------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Fire station            | 2×2 | 6.4 m  | ~500 m²              | 18 × 14 m = 252, × 2     | 2 bays, 23 m of apron (18.3 m asked), 5 staff stalls                              |
| District fire station   | 3×2 | 6.4 m  | 15,733 sf = 1,462 m² | 36.6 × 20 m = 732, × 2   | 3 bays, 17 m of apron (50 ft asked), 18 staff stalls, a 4 × 4 × 12.8 m hose tower |
| Police station          | 2×2 | 6.4 m  | 1,420 m²             | 34 × 21 m = 714, × 2     | entrance, sally port, a radio pole, 6 stalls                                      |
| Police district station | 3×3 | 9.6 m  | 38,000 sf = 3,530 m² | 54 × 21.8 m = 1,177, × 3 | entrance and canopy, sally port, 26 stalls, a radio pole                          |

- **Bays.** 18 ft (5.49 m) from door to door, preferred and never under 14 ft;
  each opened by a door 16 ft wide and **15 ft (4.57 m) high**, over the 14 × 14
  ft least (Fire Apparatus Magazine, apparatus floor tips) and 1.27 m over the
  3.3 m engine. A single-deep bay is 40 ft (12.2 m), the apron 50 ft (15.2 m)
  (Fire Engineering, the modern firehouse); the first rung keeps the 14.0 m
  back-in bay and 18.3 m apron of the table above. Door and frame: a dark frame
  0.35 m wider than the leaf all round, the leaf lighter than the wall with five
  panel seams and a row of four panes at the head. The engine, 10 m, stands on
  the concrete apron 1.5 m before its door, one per bay up to the number of
  appliances.
- **The fire stations' floors.** The first rung is two back-in bays at 137 m²,
  quarters, offices and 40% circulation, about 500 m² over two storeys, a 252 m²
  plate. The district rung is Indianapolis Fire Station 20's 15,733 sf, three
  bays, an engine, a ladder and a chief: 1,462 m² over two storeys is a 731 m²
  plate, which the massing rule alone would put on 4 tiles. It does not fit a
  2×2: the plate is 36.6 m wide and a 2×2 lot leaves 34 m inside its margins,
  and the apron and the 18 stalls want the ground besides. So the lot is 3×2,
  60 m of frontage.
- **The police floors.** The first rung is the derived 1,420 m² in two storeys, a
  714 m² plate. The district rung is Concord NH's new 38,000 sf: three storeys is
  a 1,177 m² plate, which a 3×3 holds (1,665 m²); two storeys is 1,765 m², which
  it does not. A 3×3 at three storeys is the least that fits.
- **Parking.** `parkingcode.ts` has no rate for a station: its office rate of 3
  per 1,000 sf is for the downtown kind that parks at the kerb, and is reference
  only. The fire stations are sized on staff, not floor: 5 on-duty positions for
  the first rung, and two shifts of the 9 seats for the district one (the
  shift-change overlap, an assumption), 18 stalls. The police stations take the
  stalls the lot fits before the building's front: the district rung's 26 against
  the office reference's 114 for its floor, no lot of 3,600 m² holding the 2,860 m²
  of stalls and the 1,177 m² plate; the rest is the street's kerb. Stalls are 9 ×
  18 ft with a 24 ft aisle.
- **Police.** The entrance is a marked 2.4 m door on the street face with a
  canopy and two posts, a glazed pair of panes, a blue band across the head of the
  wall and a belt course at every floor. The sally port is a vehicle door 14 ft
  wide and 12 ft high (3.66 m, over the 1.6 m patrol car) with a concrete drive to
  the street and a patrol car before it.
- **Night.** The windows and the door panes are one merged mesh on an emissive
  material that follows the night factor, the one lit part of a station.

### The schools, the college and the library

Five kits, one language: every building made of **double-loaded wings** drawn
to the floor the design states, and the lot read by its **grounds**. Each turns
at the four rotations, stands on the highest ground under the lot, keeps 2 m
clear of the lot edge, and takes local +Z as the street side. Layout is a pure
function of the footprint.

| Building   | Lot × height | Stated floor | Wings, 3 storeys                                  | Gym, counted as 2 floors | Floor as drawn |
| ---------- | ------------ | ------------ | ------------------------------------------------- | ------------------------ | -------------- |
| Elementary | 3×3 × 10 m   | 5,203 m²     | back 56 × 20.7, side 20.7 × 16 = 1,490 m²         | 16 × 23 = 368 m²         | 5,206 m²       |
| Middle     | 4×4 × 9.6 m  | 8,904 m²     | back 76 × 20.7, side 20.7 × 42.6 = 2,455 m²       | 24 × 32 = 768 m²         | 8,901 m²       |
| High       | 5×4 × 9.6 m  | 11,911 m²    | back 96 × 20.7, side 20.7 × 54.6 = 3,117 m²       | 32 × 40 = 1,280 m²       | 11,911 m²      |
| College    | 6×5 × 9.6 m  | 16,230 m²    | back 116 × 20.7, two sides 20.7 × 72.7 = 5,410 m² | none                     | 16,230 m²      |
| Library    | 3×2 × 3.2 m  | 1,143 m²     | one storey, 42 × 27.2 = 1,142 m²                  | none                     | 1,142 m²       |

- **Wings.** A classroom wing is 20.7 m (68 ft) deep: two 30 ft classroom bays
  (Chicago Public Schools' 25 × 30 ft planning module) either side of an 8 ft
  corridor (the IBC asks 6 ft for a school corridor; a college standard 8 ft).
  Three storeys of 3.2 m, the elementary's parapet taking it to its catalog 10 m.
  Every plan is a back wing across the lot and side wings forward from it; the
  ground they enclose opens to the street. A ribbon of windows on every storey of
  both long faces.
- **Gyms.** One tall storey of 7.3 m (24 ft: 22 ft clear, the Rhode Island
  minimum, plus the roof), counted as two floors like the crematorium's hall,
  with a band of high windows and no ribbon. Sized from Maine's court-plus-
  sidelines (48 × 70, 64 × 88 and 70 × 104 ft) with seating for a third, a half
  and all of the roll; the elementary's 3,960 sf clears Texas's 3,000 sf least, the
  middle's 8,270 and the high's 13,780 its 4,800 and 7,500. Each stands at the
  front of the back wing on the side away from the side wing.
- **Elementary grounds.** Between the side wing and the gym, a courtyard with the
  entrance canopy on the back wing and a walk to the street. The front strip, about
  19 m deep, is the playground: an asphalt blacktop and a mulch patch carrying a
  play structure (a 4 × 3 m deck 1.5 m up on four posts, with a slide) in primary
  colours. A 55 × 110 ft paved play area (Montgomery County MD) is the scale it
  echoes; Clark County's 45,000 sf of asphalt for 600–900 pupils is what a real
  site asks.
- **Middle and high grounds.** The courtyard between the side wing and the gym
  carries, from the street, a **bus pull-in** 9.1 m (30 ft, California's least
  bus driveway) deep along the frontage with one parked school bus, then a plaza
  with the flagpole and the entrance canopy. Behind the plaza the middle school has
  a lawn play field and the high school **two paired tennis courts**, 36.6 ×
  32.9 m (each 78 × 36 ft with the run-back), green, white-lined, netted. Before
  the gym, a staff car park of 90° stalls on a 7.3 m aisle: 16 at the middle
  school, 11 at the high school.
- **College grounds.** The U of wings holds a **quad** about 75 × 73 m, within the
  sizes of real ones (the University of Georgia's 260 × 300 ft), as a lawn with
  paths corner to corner and across, trees along the paths, and an entrance
  portico on the back wing's quad face. Limestone-coloured, against the schools'
  brick.
- **Library.** One storey on a 42 × 27.2 m plate at the back of the lot. Its
  reading room, 24 m of the plate's length, rises under a raised roof with a
  clerestory band to 6.0 m (a branch shell asks 18 ft 6 in clear); the rest is
  flat at 3.2 m. A marked door with a canopy and an outside book drop on the street
  face, and beside the building a car park of 12 stalls on one aisle, one of them
  accessible: the single accessible space is a van space (132 in) beside its 60 in
  access aisle, which leaves the 36 m beside the plate room for eleven more stalls
  and not twelve. The raised roof stands above the catalog height, as the
  crematorium's flue does.
- **The school bus** is a Type C, 11.0 × 2.44 × 3.2 m (a 36 ft conventional), in
  school-bus yellow with black rub rails and a hood before the windscreen.
- **The flagpole** is 9.1 m (30 ft, inside the 25–35 ft common to schools), on the
  four schools and the library.
- **Parking falls short, and the grid wins.** ITE's averages are 0.13 vehicles a
  pupil for an elementary school, 0.26 for secondary and 0.2 per head at a junior
  college, and a library 4–5 stalls per 1,000 sf. The lots hold what the table
  says, and the rest is the street's kerb, as at the police stations.
- **Night.** The windows, the gym bands, the clerestory and the door panes are
  one merged mesh on the stations' emissive material. Nothing else lights.

### The generators: solar, gas, combined cycle and the reactor

Four process utilities, each read by its plant. Each turns at the four
rotations, stands on the highest ground under the lot, keeps its parts inside
the lot, and takes local +Z as the street side; layout is a pure function of the
footprint. None lights at night. Dimensions are the units' own where published,
and stated as assumptions where not; the figures behind them are in
[../game-design/features/power-generation.md](../game-design/features/power-generation.md).

- **Solar farm (6×6).** East–west rows of fixed-tilt panels, each row two 2.28 ×
  1.13 m modules high in portrait (4.56 m of panel), tilted 20° (the game's own),
  its low edge 0.6 m above grade (a low fixed-tilt rack's 24 in), so its top edge
  stands at 2.16 m. Rows are pitched for a 45% ground coverage ratio, the middle of
  LBNL's 40–50% for fixed tilt: 4.29 m of plan over 9.5 m. **Every row faces the
  sun's noon side of the scene at every rotation of the lot**, as a real array
  faces south; on a square lot the rows always fit. Panels are near-black blue
  with a lighter frame edge, on slim posts at 6 m (the game's own spacing);
  the module seams are the frame's colour, not geometry, so a row is under
  100 triangles and the farm, which a solar city builds by the hundred, under
  2,000. A 4 m gravel track runs in from the
  street to the inverter skid, an SMA medium-voltage station on a 20 ft skid
  (6.06 × 2.44 × 2.9 m), and a 7 ft (2.1 m) chain-link fence closes the lot, with a
  gate on the track. One instance per row, so a farm is a dozen.
- **Gas turbine (2×2).** The LM6000's 20 × 5 m package on a 40 × 18 m paved plate,
  enclosed to 5 m (an assumption), with the inlet filter house over its intake end
  rising to the catalog's 14 m, a generator enclosure at the other, a catalyst
  housing beside it, and one **30.5 m** stack (Wallingford's 100 ft minimum), 3 m
  across, with a dark rim. A transformer on its pad and a 2.1 m fence.
- **Combined-cycle station (4×3).** The same gas-turbine package and inlet house,
  its exhaust into a heat-recovery boiler casing 25 × 10 m to **24 m**, the
  catalog height, and from it one **40 m** stack, 5 m across. Beside the boiler, a
  steam-turbine hall 30 × 20 × 15 m; behind them, a three-cell mechanical-draft
  cooling tower 36 × 12 × 12 m with a fan stack on each cell, as Roseville Energy
  Park cools its SGT-800s; along the street side, a row of three transformers. All
  hall and casing sizes are assumptions on the plant's proportions.
- **Nuclear station (6×5).** A flat-roofed reactor building 40 × 30 m, its main
  roof at about 19 m, in light concrete, the lightest mass on the site, over the
  pool the module stands in below grade — **no dome**, which is a different
  reactor — with a narrower crane hall along its long axis rising to **24 m**; a
  turbine-generator building 40 × 20 × 15 m beside it in blue-grey metal cladding
  under a darker horizontal band, so the two buildings never read alike; a switchyard strip of gantries and
  transformers on the street side; and a double security fence, 2.4 m high, with a
  clear isolation zone between its two lines. Building sizes are assumptions:
  NuScale publishes the module, not the building. On the edge that touches the
  water, the way the sewage works finds its outfall's, a low concrete
  cooling-water intake house with its screens at the water line, since the
  station stands on the shore for its condenser.

### The clinic, the depot and the bus stop

The last three ploppables without a kit, each read by the part that does its
work: the clinic by its covered drop-off, the rail station by its platform,
the bus stop by its shelter. Each turns at the four rotations, stands on the
highest ground under its lot, keeps its parts inside the lot and takes local
+Z as the street side; layout is a pure function of the footprint and, for
the station, of which lot edge the track runs along. Figures are the codes'
and the agencies' where published, and stated as the game's own where not.

- **Clinic (1×2, 6.4 m).** A community clinic is one storey, and the catalog's
  6.4 m is its roof line: a flat-roofed block 17 × 20 m on the back half of
  the lot, its wall 5.5 m to the top of a **parapet** 1.07 m tall (18 ft to
  the parapet, [a Scottsdale medical office](https://eservices.scottsdaleaz.gov/planning/projectsummary/applicant_submittals/ProjInfo_119_SA_2023.pdf);
  a parapet of 42 in at least, so the roof units stand screened behind it,
  [BJC's ambulatory standard](https://legacy.bjc.org/Portals/0/303.202.pdf)),
  a **brick base** 1.0 m round every face under a lighter panel wall (the
  type's brick, stone and EIFS,
  [Chesterfield MO urgent care](https://chesterfield.mo.us/webcontent/Agendas/PlanAgendaDocs/2021-05-13%20ARB%20IV.B.pdf);
  the 1.0 m is the game's own). On the street face, centred, the **entry**:
  storefront glazing 3.0 m to its head and 6 m wide on the stations' lit
  material (the head height is a rule of thumb), under a **porte-cochère**
  4.0 × 6.1 m at 2.9 m clear on two 0.3 m columns, over the drop-off (ADA
  503: a passenger loading zone is 20 ft long with a 60 in aisle beside its
  96 in space and 114 in of headroom,
  [Access Board ch. 5](https://www.access-board.gov/ada/chapter/ch05/)). In
  front of it a **drop-off loop**, a 6.1 m one-way lane (the 20 ft fire lane
  of [IFC 503.2.1](https://codes.baltimorecity.gov/us/md/cities/baltimore/code/building-codes/VIII/503))
  in from the street along one lot line, under the canopy and back out
  along the other, with **five stalls** 2.74 × 5.5 m along it (the 20 m lot
  holds the two legs and one column of stalls between them, not six): at
  the head of the island under the canopy an accessible van space 3.35 m
  wide with its 1.52 m hatched aisle (ADA 502) and a car beside it, and
  three along the way in. The front half of the lot is that paving; the
  body stands on the back half with lawn beside it. Two **rooftop units**
  on their curbs behind the parapet, as the storefront kit draws them, and
  a **monument sign** on the island's planted strip beside the way out, a
  2.4 × 0.4 m masonry block 1.83 m tall (the 6 ft most business codes cap
  it at, [Columbia IL](https://columbiail.gov/municode/Title_17/54/250.html))
  with a lit face on each side, read from the drive.
- **Rail station (2×3, 9 m).** A small-town combination depot and its
  platform. The lot stands against the track, and the kit reads which edge
  touches a rail tile the way the sewage works finds its outfall edge; the
  **platform** runs along that edge, the depot behind it and the car park
  on the edge opposite the track, whichever way the player turned the lot
  (as the shore kits take their water edge); with no rail beside it the
  platform takes the back of the lot as placed. The **depot** is the Great
  Northern standard combination depot at 30 × 64 ft, 9.1 × 19.5 m
  ([GNRHS](https://store.gnrhs.org/products/standard-combination-depot-24-x-48-1899-left-handed-ho-scale)),
  one storey with a 3.66 m wall plate (12 ft, [Fairlee VT](https://crjc.org/heritage/V14-51.htm))
  under a 9:12 gable ([Ely VT](https://crjc.org/heritage/V14-5.htm)), so its
  ridge is 7.1 m, under the catalog's 9; **eaves** 1.2 m deep on **knee
  braces** every 2.4 m (the 3–6 ft the depots carry, unmeasured; the figures
  are the game's own); walls **board-and-batten**, 0.05 m battens every
  0.3 m as merged geometry, over a 1.0 m plank wainscot; a three-sided
  **operator's bay** on the track face, 3.66 m wide (12 ft,
  [Parsons WV](https://en.wikipedia.org/wiki/Parsons_station)) and 1.0 m
  proud (3 ft, Fairlee), under its own shallow hip; a door and a window band
  on each face on the stations' lit material; a chimney. The depot stands
  2.3 m back from the platform on a concrete apron at platform height, so
  the canopy clears its eave (a 1.2 m eave off a 3.66 m plate at 9:12 comes
  down to 2.76 m, under the canopy's 3.05 m), and the bay stands in that
  apron. The **platform** is
  low-level: 0.2 m above the rail (8 in, ADA 810.5.3,
  [Access Board ch. 8](https://www.access-board.gov/ada/chapter/ch08/)),
  3.66 m wide (the 12 ft side platform the MBTA selects,
  [Massachusetts](https://www.mass.gov/doc/chapter-5/download)), the full
  length of the track edge less 2 m at each end, its edge at the lot line
  (a real edge stands 5 ft 1 in from the track's centreline; the track
  tile's own centre is 10 m off, so the lot line is as near as the kit can
  stand), with a **tactile strip** 0.61 m wide (24 in) along the edge in
  the paint's yellow, as paint. A **canopy** 3.66 m wide at 3.05 m clear
  (10 ft, [Bellevue WA 23.85.344](https://bellevue.municipal.codes/BCC/23.85.344))
  on posts every 4.6 m covers the platform for the depot's length and
  13.7 m beyond it each way (45 ft, the sheltered length
  [521 CMR 18](https://www.mass.gov/doc/521-cmr-1800-transportation-terminals/download)
  asks of an altered station), capped by the platform. On the street side,
  a **car park** of twenty stalls, as the police stations have, on one aisle
  where the lot is deep and on two where the track runs along its long
  edge, with a **drop-off** at the depot's street door. The depot's windows light
  at night on the stations' material; nothing else does.
- **Bus stop (1×1, 3 m).** A lawn plate, not a plinth: the tile is the kerb
  tile beside the street, and the kit stands at its street edge behind the
  road's own footway. A **shelter** 1.52 × 3.66 m (5 × 12 ft, the top of
  Metro Transit's 2 × 8 to 6 × 12 ft range and at least the 5 ft of depth
  NACTO asks for an accessible path inside,
  [Minneapolis](https://sdg.minneapolismn.gov/design-guidance/transit-stops/local-bus-stops),
  [NACTO](https://nacto.org/publication/transit-street-design-guide/station-stop-elements/small-transit-shelter/)),
  its roof 2.29 m clear (7 ft 6 in, the game's own in the 7–8 ft rule of
  thumb) with 0.3 m overhangs, on four posts 0.12 m across, with a **glazed back
  and two end panels** as 0.02 m slabs in the glazing blue; a **bench**
  1.83 m long (6 ft, [Omnitrans](https://omnitrans.org/busstops/)) at 0.45 m;
  a **receptacle** 0.61 m across and 1.0 m tall (the 32 gal can, 24 × 40 in,
  a rule of thumb) at one end; a **flag sign** on its own pole, 0.46 ×
  0.61 m (18 × 24 in, a rule of thumb) with its bottom 2.13 m up (7 ft,
  [MUTCD](https://dot.ca.gov/-/media/dot-media/programs/safety-programs/documents/ca-mutcd/2026/2026-camutcd-2026-6f-a11y.pdf));
  and a concrete **boarding pad** 2.44 m out from the street edge and 1.52 m
  along it (96 × 60 in, ADA 810.2.2) at the shelter's front, with a walk to
  the shelter. The shelter is the one the transit renderer draws at a line's
  stop, from one builder, so a stop the player plopped and a stop a line
  drew read alike; where a line's stop stands on a plopped bus stop's tile
  the line draws none, and the kit's is the shelter. A city builds these by
  the dozen, so the stop stays under **500 triangles**, held by the budget
  test as the solar farm is.

Scale discipline is what makes those reads work, and it comes back to the
anchors in [README.md](README.md): a 1.75 m person, a 4.0 m car, a 3.2 m
storey. A fire station whose bay door is shorter than the engine that lives
in it reads as a shed no matter what colour it is.

## What this document does not cover

Geometry budgets and topology are in
[modeling-standards.md](modeling-standards.md); which ploppables get a detail
kit at all, and what each kit contains, is in
[props-and-vehicles.md](props-and-vehicles.md). The settled per-building
numbers are game data and live with the rest of the dials in
[../game-design/balancing.md](../game-design/balancing.md).
