# Structured parking

- **Status:** Agreed

**Owns:** how the dense kinds park (office, hotel, mixed-use, mid-rise, tower): a surface car park at level 1, a garage inside the building's own lot from level 2, and the garage kit both use. The suburban shop's and works' car park stays with [parking-to-code.md](parking-to-code.md).

**Rules:**

- Park every building where it shows: on its lot, at the kerb it is credited, or in its garage. No kind stands on a bare pad. `[R-services-040]`
- Give a level-1 office, hotel, mixed-use block and mid-rise a surface car park to code, from the lot layout a shop uses, on the smallest catalog lot that holds it. `[R-services-040]`
- From level 2, park those kinds and every tower in a garage on the lot they already have: tiers in the podium where the kind has one, a deck behind the body otherwise. `[R-services-040]`
- Never cut a floor for parking: the body keeps its plate and its height, and slides to the street to free the rear. `[R-services-040]`
- Size a garage from the stall module: tiers times the stalls a tier's rows hold, never an area count.
- Hold on site at levels 2 and 3 the downtown share of the code; the kerb and the city carry the rest.
- Draw a garage to be read as one: open tiers between spandrels, a street entry under a clearance bar, a ramp, a stair tower, cars on the roof tier.
- Keep the shopfront or lobby on a podium's street face; the tiers show on the other faces.
- Count garage stalls by the lot table, and park one car a stall by the hour, as a lot does. `[R-services-032]`
- Never test a standing building against this, and add no step to a town below the milestones these kinds unlock at.

**Numbers:** derivations and every source are in [the sources](../sources/structured-parking.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Office, level 1 | 3 | per 1,000 sq ft | the reference rate in [parking-to-code.md](parking-to-code.md), now applied |
| Apartments, level 1 | 1.4 | per home | the walk-up rate, [building-detail.md](building-detail.md) |
| Hotel, level 1 | 1 | per room | [codes](../sources/structured-parking.md#what-a-building-needs) |
| Hotel room | 45 | m² of floor | dial, until the catalog counts rooms |
| Office, levels 2–3 | 1 | per 1,000 sq ft | [downtown](../sources/structured-parking.md#downtown) |
| Apartments, levels 2–3 | 0.71 | per home | [downtown](../sources/structured-parking.md#downtown) |
| Hotel, levels 2–3 | 0.5 | per room | [downtown](../sources/structured-parking.md#downtown) |
| Tier height | 3.35 (`DECK_STOREY_M`) | m | the hospital deck's; 10.5–11.5 ft, [the garage](../sources/structured-parking.md#the-garage) |
| Stall, aisle, module | 9 × 18, 24, 60 (42 single row) | ft | `src/shared/parkingcode.ts` |
| Structural bay | 36 × 60 | ft | [the garage](../sources/structured-parking.md#the-garage) |
| Deck on a 2 × 2 lot | the margin behind the body, 40 long: one row, 12 to 14 stalls a tier | m | the lot's rear margin |
| Deck on a 3 × 3 lot | the margin behind the body, 60 long: two rows, 38 stalls a tier (21 behind a hotel) | m | the lot's rear margin |
| Body back from the street line | what its street face reaches: 1.5 a lobby portal, 1.8 balconies, 6 a porte-cochère | m | `GARAGE_FRONT_PROJECTION_M`; every part stays on its lot |
| Deck aisle | 7.32 (24 ft); 5.4 one-way where the margin is short | m | `GARAGE_MIN_AISLE_M`, a dial |
| Podium tiers | 1 to 2 | tiers | [built in](../sources/structured-parking.md#built-into-a-building) |
| Deck tiers, most | 6 | tiers | dial |
| Parked ramp | 5, never over 6.67 | % | [the garage](../sources/structured-parking.md#the-garage) |
| Express ramp | 15, at most | % | same |
| Clear height | 2.13; 2.49 on a van's route | m | same |
| Open tier | openings 20 % of each tier's wall, along 40 % of its perimeter | share | same |
| Vehicle barrier | 0.84 | m | same |
| Street face lined | 70 % at least, 4.6 m deep | share, m | [built in](../sources/structured-parking.md#built-into-a-building) |

**Code:** `src/shared/garage.ts` which kinds take a garage, what each needs, the deck's plan and tiers; `src/render/garagekit.ts`, `src/render/garages.ts` the deck drawn and laid; `src/shared/parkingcode.ts` `drawsLotParking`, `stallsInRow`, the rates; `src/render/lotplan.ts` `garagePlanAt`; `src/render/massing.ts` the body's slide and `PODIUM_STOREYS`; `src/render/parked.ts` the garage's cars and counts; `src/render/lots.ts` the lot's ground; `src/shared/lotparking.ts`, `src/shared/lotlayout.ts` the surface lot; `src/render/utilitykits.ts` the hospital's deck, which shares the tier height and the row count. Not yet: `src/data/catalog.json` the larger level-1 lots.

**Tests:** `src/render/parkedstalls.test.ts`, `civicstalls.test.ts` hold one car a stall, none in an aisle, and a reported count equal to the stalls drawn. `src/shared/garage.test.ts`, `src/render/garages.test.ts` hold, for every garaged kind at four turns and every street side: plate and height unchanged, the deck inside the lot behind the body, a tier's stalls equal to its rows', tiers the requirement over a tier's stalls and six at most, each tier open to the rule, one car a stall and none on a ramp, and the level-1 kinds unchanged.

**Open:** the level-1 surface car parks and their larger lots are not built. A podium's faces are not opened as tiers: the deck behind carries every stall. A level-2 hotel on a 2 × 2 lot has no garage, its porte-cochère leaving no room behind. A garage's tiers carry no lights at night; the kerb's cars are not cut to a garage's shortfall; a garage on a turned parcel is wired and not yet tested. A level-1 kind on a larger lot levelling up onto a smaller footprint (growth skips a lot smaller on either axis). The audit of stall sizes found the walk-up, the hospital deck, the station and the library on the shared module; the clinic (2.74 × 5.5 m) and the recycling yard (2.7 × 5.5 m, 7.3 m aisle) round it; a row house parks on a 3 m drive; the rail station's car park was not measured.

## Why the rules are what they are

### What the player gets

A small city's first office is a low block in a car park, as a suburban office is. Land value lifts it a level and the car park becomes building: the cars go into a deck behind it, and the lot that was asphalt is floor. A tower stands on tiers of parking behind its shopfronts. Density reads at a glance, and it reads true: cheap land pays for parking in ground, dear land in structure.

Today these kinds stand on a bare paved pad with no stalls, where every shop and works beside them parks to code. The pad is what this retires.

### Level decides the form

Level already follows land value: level 2 above 140, level 3 above 190. So level is the switch, and nothing new is stored. A level-1 kind is the suburban form of its type and parks on the ground at the code's rate, on a larger catalog lot where its own will not hold the stalls, as a strip or a supermarket does. From level 2 the kind is a downtown building and parks in structure on the lot it has.

The dense kinds unlock at Big Town and Small City, so a first town never meets any of this.

### Where the garage stands

The body fills 13.6 m of each lot tile, which leaves 12.8 m across a 2 × 2 lot and 19.2 m across a 3 × 3. Slid to the street line, the body frees that whole margin at the rear: one single-loaded row on the small lot, one double-loaded module on the large. The deck stands there, against the body's rear wall, entered from the street by a drive down the lot's side.

A mid-rise and a tower already stand on a podium that holds no homes. Its street face keeps the shopfront band; its other faces open as parking tiers, and a deck behind carries what the podium does not.

No floor is cut and no height changes, so homes, jobs, demand and every figure the catalog gives stay as they are.

### How many stalls

A tier holds what its rows hold, counted by the function that counts a lot's row. The requirement is the kind's rate over its floor or its homes; tiers are the requirement over a tier's stalls, rounded up, to the most the kit allows. A level-3 office tower asks 287 spaces at the downtown rate and holds 216 in six tiers; the shortfall is the kerb's, as downtown.

The downtown share is not a code figure. Downtown codes commonly ask for nothing; what downtown buildings provide is known from one broker's figure for offices, one set of hotel comparables and one apartment study. The three rates are dials, named as dials, until a better source is read.

### What makes it read as a garage

- **Open tiers.** Each tier is a slab edge and a spandrel 0.84 m high with an open band above it, on at least two sides. Through the band the columns, the tier above and the cars show.
- **The ramp.** On the large lot the floor of one bay slopes between tiers, seen through the open band as the one line that is not level. The small lot's single row has no bay to slope, so a steeper express ramp climbs at the deck's end.
- **The entry.** One opening on the drive, a clearance bar hung before it, a gate arm, a blue sign with a white P.
- **The stair tower.** A closed shaft at one corner, a tier taller than the deck, glazed down one side.
- **The roof tier.** Stalls painted, cars standing, a lamp pole a bay.
- **The cars.** One a stall on the roof tier and behind the open bands, from the pool the lots draw, by the hour a lot fills.

The hospital's deck already draws tiers, stalls and cars; its builder becomes the one kit, and the hospital reads the same after.

## Decided

- Level picks the form, over land value read again or a city milestone: level is land value already.
- The garage stands on the lot the building has, over a larger lot or a taller body: nothing in the catalog's floor changes.
- Levels 2 and 3 hold the downtown share, over the suburban code: a tower would otherwise stand on a garage as tall as itself.
- Not built here: a public garage the player places, a price for parking, cars that search for a space, tiers below ground.
- Slices: the stall faults in the [defects list](../roadmap/open-visual-defects.md) first; then the kit, decks and podiums at levels 2 and 3; then the level-1 lots and their larger catalog lots.
