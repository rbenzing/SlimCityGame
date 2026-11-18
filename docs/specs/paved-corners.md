# Paved corners

- **Status:** Built

**Owns:** the radius of every corner of paving that is not a street's own kerb return: car parks and their islands, drives and roads inside a plot, alleys and other kerbless roads, and an airport's roads and taxiways.

**Rules:**

- Turn a paved edge on an arc wherever it turns against open ground or a kerb. Never draw such a corner square. `[R-render-045]`
- Keep a corner square only against a building's wall or a walk, against paving of the same plot that continues past it, or at the street's edge.
- Round a kerbless road's bend and the corners where two of them meet by its class's corner radius. `[R-roads-092]`
- Never let rounding change a stall count, a lot's size or a road's tiles. A parked car's body stays on the paving.
- Draw an arc in 4 segments a quarter turn up to 2 m of radius, and 8 above.
- Leave a street's kerb returns, its bends and its end caps to the rules that own them `[R-roads-065]` `[R-roads-081]`.

**Numbers:** sources in [parking to code](../sources/parking-to-code.md#corner-radii).

| Constant                    | Value | Unit | Where                                              | Source                                  |
| --------------------------- | ----- | ---- | -------------------------------------------------- | --------------------------------------- |
| `CAR_PARK_CORNER_RADIUS_M`  | 1.5   | m    | a car park's outer kerb line                       | York, Pennsylvania: 5 ft on every kerb  |
| `ISLAND_NOSE_RADIUS_M`      | 0.762 | m    | an island's end: half its 1.524 m width            | a full round nose; over Sedona's 2 ft   |
| `AISLE_TURN_RADIUS_M`       | 4.6   | m    | the inside of a turn between aisles or onto a drive | Sedona, Silverton: 15 ft                |
| `SERVICE_TURN_RADIUS_M`     | 7.6   | m    | the inside of a turn a bus or a lorry makes        | Silverton: 25 ft on an emergency lane   |
| `ALLEY_CORNER_RADIUS_M`     | 6.1   | m    | an alley's bend and where two alleys meet          | Jerome, Idaho: 20 ft                    |
| `TAXIWAY_FILLET_RADIUS_M`   | 9.1   | m    | where two straight taxiway edges meet              | AC 150/5300-13B 4.7: up to 30 ft        |

**Code:** `src/shared/roundedoutline.ts` (a rectangle or a polygon with each corner turned on its radius); `src/shared/carparkshape.ts` (which corners of a lot's car park turn, and its islands' noses), `src/render/lots.ts`, `src/render/parked.ts`, `src/render/groundquad.ts` `pushConformingPolygon` (drawing them); `src/shared/roadprofile.ts` `cornerRadiusOf`, `src/render/roadsmesh.ts`, `src/render/freeroadmesh.ts` (kerbless bends and corners); `src/render/airportkit.ts` (an airport's paving).

**Tests:** `src/shared/roundedoutline.test.ts` (the arc's radius, its tangency and its segment count); `src/render/carparkcorners.test.ts` (a lot's corners and noses from the mesh, every kind's stall count and layout unchanged, each car and each painted line on paving); `src/render/roadsmesh.test.ts`, `src/render/freeroadmesh.test.ts` (alley bends, tees and crossings); `src/render/airportfacilities.test.ts` (an airport's corners).

**Open:**

- An alley's mouth on a street stays square: the footway runs unbroken across it `[R-roads-074]`, and the dropped kerb that belongs there is not designed.
- A home's drive and a civic plot's drive keep their square ends at the street for the same reason.
- A building's slab and a yard's hardstanding stay square where they meet a wall or a fence.

## Why the rules are what they are

### Why corners are round

A kerb is laid round a corner on a radius, because a wheel cannot follow a point and a square kerb breaks. Car parks, alleys and plot roads drawn as plain rectangles read as blocks. The player asked for them rounded.

### Which corners

The rule covers a paved edge that turns against grass, gravel or a kerb. A corner against a wall is the wall's. A corner where paving carries on, as a car park meeting its own drive, is no corner at all.

A corner on a lot's side or rear boundary is rounded like any other. Where the next lot paves to the same line, the two cuts leave a small planted notch, as two real car parks do. A stall in a corner keeps its place and its count; only the paving outside the largest parked car's body is cut, and its line ends at the arc. A lorry's berth and a trailer bay stay square.

From far above a lot still reads as a rectangle, because its boundary and its building are straight, as a real lot's are. The arcs show at street level.

An inside turn is filled on 4.6 m only where the planted ground beside it is that deep. Most lots have a strip of 1.5 to 2 m there, so the turn stays as it is.

### Which radius

Parking codes give a small least radius for any kerb line, about 1.5 m, and a larger one for the inside of a turn a car makes, about 4.6 m. Where a fire engine, a bus or a lorry turns, they ask for 7.6 m. An island's end is a full round nose, half the island's width.

Alley standards round the corner where two alleys meet with 6.1 m. The same radius turns an alley's bend off the grid, which is that corner with one arm missing. A dirt road has no kerb either and takes the alley's radius: no figure of its own was found.

On the grid an alley's turn fills its tile as a quarter ring, so its inner edge turns on 8.1 m. Where alleys meet on the grid, each corner is the 6.1 m fillet, cut to what the tile holds. An alley's end is a round cap, as a street's is.

A kerbless road meeting a street keeps the street's corner: the rule applies only where both roads have no kerb.

The design circular rounds the corner where two straight taxiway edges meet with up to 9.1 m. An airport's loop and service roads turn on 7.6 m, and a car park inside the loop takes the loop's arc at its corners.

Most of these figures come from one city's code each and were read from search results, not the codes' own pages.

### What rounding may not change

Rounding is drawing. The simulation counts a lot's stalls from the shared layout, and a 1.5 m corner takes half a square metre from the corner stall, outside any car's body. A test holds each count and each car on the paving.

## Decided

- One rule and one helper for every paved corner over a fix a kit: the next kit gets round corners without being asked.
- Square against walls and continuing paving: an arc there would open a gap.
- The alley mouth left square: rounding it would cut the footway, and the dropped kerb is its own design.
