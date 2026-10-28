# The depots

Three vehicle-service kits, read by their **bay doors and the fleet on the
apron** as the fire stations are, from the sizes derived in
[transport-depots.md](../../../specs/transport-depots.md):
every stall, aisle and bay there is a figure here. Each turns at the four
rotations, stands on the highest ground under its lot, keeps its parts
inside the lot and takes local +Z as the street side; the tram depot and the
rail yard read their track edge as the station does. The vehicles parked on
the apron are **what the depot holds less what is in service**, read from
the sim as the cemetery reads its interments, so a player can count the
buses at home against the line panel. None lights but the shop's door
panes, on the stations' material.

- **Bus Depot (2×2, 5.5 m) and Central Bus Garage (3×4, 6.4 m)**, one kit at
  two sizes. A paved yard over the lot with a 7.2 m **drive** from the street
  through a gate in a 2.1 m chain-link fence. **Stalls** 11.5 × 3.6 m in
  facing rows about a 12.2 m aisle, painted as the car parks paint theirs:
  two rows of five on the depot, four rows of nine on the garage; a 10 m bus
  (the vehicle kit's own) nose-in on each stall the fleet has at home.
  The **shop**, a flat-roofed hall with **drive-through bays** 4.9 m wide
  under 4.1 m clear doors framed as the fire station's, one bay on the
  depot and four on the garage, a **fuelling island** beside it (a 1.2 ×
  4 m canopy on two posts over a dispenser, as the filling station's at
  bus scale; two on the garage) and a **wash lane** the bay's size with a
  gantry arch at its mouth; the depot's shop 4.1 m clear plus 1.4 m of roof
  gives its 5.5 m, and the garage's **two-storey office** on the shop's
  street end, 125 m² a floor, gives its 6.4 m. On the 2×2 depot two rows
  of stalls and the drive leave the bay 12.7 m long, not the garage's
  18.3, so a bus is driven in and backed out. Bay doors on the yard side,
  the office door on the street; the stations' lit panes on both.
- **Tram Depot (2×3, 6.0 m).** The lot's long side on the tram street; the
  **turnout lead**, 16.7 m of track from the street edge (the 20 m the
  design asks is what eight 22.4 m roads behind a 45° ladder leave of a
  60 m lot), fans into eight
  **stabling roads** at 3.5 m centres, 22.4 m long, each a pair of rails
  on the road kit's rail geometry over a concrete apron, under **catenary
  poles** 6 m tall every 10 m along the roads' centre line with a crossarm
  (the wire is not drawn: the model draws no wires anywhere); a tram set
  (two of the transit renderer's 11 m cars) on each road the fleet has at
  home. The **shop** beside the roads, a hall over one **maintenance road**
  and one **wash road** 4.9 m wide and 28.4 m long with doors at 4.6 m
  clear under 0.95 m of roof, 6.0 m, its 97 m² office at the hall's far
  end with a lit door onto the yard, since the hall runs along the tram
  street and has no street-facing wall free.
- **Rail Yard (3×4, 6.0 m).** The lot's long side on the railway; the
  **turnout lead**, 20 m, fans into five **stabling roads** at 4.5 m centres,
  45.6 m long, on the rail geometry over ballast (the rail kit's own
  colour); a three-car train set (the transit renderer's 14 m cars) on each
  road the fleet has at home. The **shop** over one **maintenance road** and
  one **wash road** 6 m wide and 51.6 m long with 4.6 m clear doors, 6.0 m
  to the roof, a **fuelling stand** (a diesel set has one, a tram none) at
  the lead, and the 125 m² office at the street end with its lit door. A
  2.1 m fence closes the yard but for the lead and the drive.

**What it costs.** The three stay in the 30,000 kit tier with their fleets
parked; a bus is the vehicle kit's 60-odd triangles and a train set three
cars of the same order, so a full garage of 36 is under 3,000 on vehicles
alone. The tracks are one merged geometry per yard, not a pool of sleepers.

Scale discipline is what makes those reads work, and it comes back to the
anchors in [README.md](../../README.md): a 1.75 m person, a 4.0 m car, a 3.2 m
storey. A fire station whose bay door is shorter than the engine that lives
in it reads as a shed no matter what colour it is.

