# Deriving a size from the code

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

