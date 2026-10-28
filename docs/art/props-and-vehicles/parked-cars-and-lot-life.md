# Parked cars and lot life

Static parked cars are an occupancy signal, not decoration:

- **Placement**: on a suburban commercial or industrial lot, one car to each
  stall of the car park laid to code
  ([parking-to-code.md](../../specs/parking-to-code.md)), nose
  in, centred in its 9 × 18 ft stall; a vehicle longer than the stall stands
  with its nose 0.2 m short of the stall's head and its tail over the aisle.
  Constructing and Abandoned buildings park zero cars — an empty lot is
  legible sim state, matching the dark-window rule for abandonment in
  [buildings/README.md](../buildings/README.md).
- **Look**: simple two-box cars (body plus cabin) in the vehicle kit's
  saturated palette, picked by a hash of the building id and stall index,
  standing between the lot's white stall lines — the parking-lot read.
  Industrial lots mix box trucks (7 m) and pickups in with their workers'
  cars, using the lorry silhouette; commercial lots park cars. Homes never street-park: a home that fronts a street parks on
  its own drive — see [Residential lots](../buildings/residential-lots.md).
  A farm keeps a pickup in its yard, the lorry silhouette at a full-size
  pickup's 5.31 × 2.03 × 1.91 m, which does the rounds of the yard by day and
  parks by the farmhouse at night — see
  [the farms spec](../../specs/farms.md).
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
  [streets.md](../streets/README.md), never stand on a tile with road on both axes,
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

