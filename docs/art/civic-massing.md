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

A 2×2 station 12 m tall is 740 m² per floor over 3.75 storeys — about
2,800 m² gross. That is the number a code figure has to be checked against,
not the tile count, and it is why a "small" civic building at this scale is
still a substantial building.

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
