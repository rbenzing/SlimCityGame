# Paved corners

- **Status:** Agreed

**Owns:** the radius of every corner of paving that is not a street's own kerb return: car parks and their islands, drives and roads inside a plot, alleys and other kerbless roads, and an airport's roads and taxiways.

**Rules:**

- Turn a paved edge on an arc wherever it turns against open ground or a kerb. Never draw such a corner square. `[R-render-045]`
- Keep a corner square only against a building's wall, against paving that continues past it, or on a plot's boundary where the paving runs to the boundary on both sides.
- Round a kerbless road's bend and the corners where two of them meet by its class's corner radius. `[R-roads-092]`
- Never let rounding change a stall count, a lot's size or a road's tiles. A parked car's body stays on the paving.
- Draw an arc in 4 segments a quarter turn up to 2 m of radius, and 8 above.
- Leave a street's kerb returns, its bends and its end caps to the rules that own them `[R-roads-065]` `[R-roads-081]`.

**Numbers:** sources in [parking to code](../sources/parking-to-code.md#corner-radii).

| Constant                    | Value | Unit | Where                                              | Source                                  |
| --------------------------- | ----- | ---- | -------------------------------------------------- | --------------------------------------- |
| `CAR_PARK_CORNER_RADIUS_M`  | 1.5   | m    | a car park's outer kerb line                       | York, Pennsylvania: 5 ft on every kerb  |
| `ISLAND_NOSE_RADIUS_M`      | 0.76  | m    | an island's end: half its 1.52 m width             | a full round nose; over Sedona's 2 ft   |
| `AISLE_TURN_RADIUS_M`       | 4.6   | m    | the inside of a turn between aisles or onto a drive | Sedona, Silverton: 15 ft                |
| `SERVICE_TURN_RADIUS_M`     | 7.6   | m    | the inside of a turn a bus or a lorry makes        | Silverton: 25 ft on an emergency lane   |
| `ALLEY_CORNER_RADIUS_M`     | 6.1   | m    | an alley's bend and where two alleys meet          | Jerome, Idaho: 20 ft                    |
| `TAXIWAY_FILLET_RADIUS_M`   | 9.1   | m    | where two straight taxiway edges meet              | AC 150/5300-13B 4.7: up to 30 ft        |

**Code:** `src/shared/roundedoutline.ts` (a rectangle or a polygon with each corner turned on its radius); `src/shared/lotlayout.ts`, `src/render/lots.ts` (a lot's car park); `src/render/roadsmesh.ts`, `src/render/freeroadmesh.ts` (kerbless bends); `src/render/airportkit.ts` (an airport's paving).

**Tests:** `src/shared/roundedoutline.test.ts` (the arc's radius, its tangency and its segment count); the car park, alley and airport tests each measure a drawn corner's radius from the geometry and hold the stall counts unchanged.

**Open:**

- An alley's mouth on a street stays square: the footway runs unbroken across it `[R-roads-074]`, and the dropped kerb that belongs there is not designed.
- A home's drive and a civic plot's drive keep their square ends at the street for the same reason.
- A building's slab and a yard's hardstanding stay square where they meet a wall or a fence.

## Why the rules are what they are

### Why corners are round

A kerb is laid round a corner on a radius, because a wheel cannot follow a point and a square kerb breaks. Car parks, alleys and plot roads drawn as plain rectangles read as blocks. The player asked for them rounded.

### Which corners

The rule covers a paved edge that turns against grass, gravel or a kerb. A corner against a wall is the wall's. A corner where paving carries on, as a car park meeting its own drive, is no corner at all. A car park that fills its lot to the boundary on both sides meets the next lot's paving, so that corner stays square too.

### Which radius

Parking codes give a small least radius for any kerb line, about 1.5 m, and a larger one for the inside of a turn a car makes, about 4.6 m. Where a fire engine, a bus or a lorry turns, they ask for 7.6 m. An island's end is a full round nose, half the island's width.

Alley standards round the corner where two alleys meet with 6.1 m. The same radius turns an alley's bend, which is that corner with one arm missing. A gravel or dirt road has no kerb either and takes its class's radius the same way.

The design circular rounds the corner where two straight taxiway edges meet with up to 9.1 m.

Most of these figures come from one city's code each and were read from search results, not the codes' own pages.

### What rounding may not change

Rounding is drawing. The simulation counts a lot's stalls from the shared layout, and a 1.5 m corner takes half a square metre from the corner stall, outside any car's body. A test holds each count and each car on the paving.

## Decided

- One rule and one helper for every paved corner over a fix a kit: the next kit gets round corners without being asked.
- Square against walls and continuing paving: an arc there would open a gap.
- The alley mouth left square: rounding it would cut the footway, and the dropped kerb is its own design.
