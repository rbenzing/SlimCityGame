# The generators: solar, gas, combined cycle and the reactor

Four process utilities, each read by its plant. Each turns at the four
rotations, stands on the highest ground under the lot, keeps its parts inside
the lot, and takes local +Z as the street side; layout is a pure function of the
footprint. None lights at night. Dimensions are the units' own where published,
and stated as assumptions where not; the figures behind them are in
[../game-design/features/power-generation.md](../../../game-design/features/power-generation.md).

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

