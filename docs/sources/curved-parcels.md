# Parcels follow the street: sources

The subdivision standards behind [the curved-parcels spec](../specs/curved-parcels.md).
Subdivision regulations have settled how a lot sits on a curve for a century, and
the rules are short.

- **Side lot lines run square to the street**, "at right angles or radial to
  street lines" ([Corry PA](https://codelibrary.amlegal.com/codes/corry/latest/corry_pa/0-0-0-14152),
  [Dunes City OR](https://codelibrary.amlegal.com/codes/dunescityor/latest/dunescity_or/0-0-0-5023)).
  On a straight street that is perpendicular; on a curve it is radial, so a parcel
  on an outer bend is a wedge that widens away from the road and one on an inner
  bend narrows.
- **Lot width is measured at the building line**, the front setback, not at the
  kerb, which is how a wedge on a cul-de-sac bulb meets a 50 ft minimum with far
  less at the street ([Fowler MI](https://codelibrary.amlegal.com/codes/fowler/latest/fowler_mi/0-0-0-6014),
  [Salina KS](https://salina-ks.gov/media/Construction%20Documents/Residential_Driveway_Design_Standards.pdf)).
- **The frontage at the kerb has a floor**: 35 ft on an outer curve or a bulb
  ([Provo UT](https://provo.municipal.codes/Code/14.17.050),
  [Midvale UT](https://midvale.municipal.codes/Code/Table17-7-4.4)), 40 ft in
  Fowler and Corry. The game takes 35 ft, 10.7 m.
- **One drive per dwelling**, at least 20 ft from the end of a corner's curb radius
  ([Minneapolis](https://minneapolismn.gov/business-services/licenses-permits-inspections/construction-permits/building-requirements/curb-cuts/)),
  which on a curve means the drive runs square to the kerb from the garage and
  meets it where the parcel's own frontage is.

## Geometry derivations

- The kerb's own curve departs from a parcel's front edge by at most the chord's
  sagitta: 1.25 m at a 40 m radius for a 20 m frontage. The drive's last metres are
  drawn to the kerb sample nearest its foot so the join reads flush, within 1.3 m
  of the kerb line.
- A 20×40 m rectangle at 30° holds one to three tile centres, so the tiles a framed
  parcel claims stick out of its rectangle or fall short of it.
- A run of parcels may bend by 8° end to end: at that bend a 60 m frontage leaves
  its parcels by one metre at most, the width of a verge strip.
- A free-form road at an angle fronts grid lots, which is less tidy than lots
  aligned to the road; aligned lots were a later choice
  ([ADR-0016](../engineering/adr/0016-roads-are-a-network-of-nodes-and-segments.md)).
