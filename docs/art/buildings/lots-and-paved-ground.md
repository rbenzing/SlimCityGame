# Lots and paved ground

**The lot is the unit, not the building.** A lot pad claims a building's
whole tile footprint; the body sits on that pad, set back from the street.
The footprint shrink that makes room for windows and setbacks is a body-only
rule — a body that filled its tile would share a wall with its neighbour —
and the pad is what claims and paves the rest. Adjacent buildings' pads meet
edge to edge with no grass seam, so a zoned block reads as continuous
developed land; each pad stops short of the road at the verge, except a
home's lawn, which runs across the verge to the sidewalk (see
[Residential lots](residential-lots.md)), and a car park's drive and walk,
which cross it.

**A suburban commercial or industrial lot is a car park laid to code**
([parking-to-code.md](../../specs/parking-to-code.md)). Its pad
is mown lawn, and only what its layout uses is paved over it: asphalt (dark
for industry) under the drive, its throat and aisles, the spaces and access
aisles, the berths, the forecourt and the tank farm; concrete under the
body and its two 8 ft walks, along the street face and in from the street to
the door. The body keeps its whole plate and stands where the layout leaves
it room: centred, held 5 ft off a lot line, or on it, slid back and to the
side away from the drive only as far as the code needs. Around it, on that
paving and conforming to it like every other lot paint:

- **Stalls** 9 × 18 ft at 90°, in rows on 24 ft aisles, white lines 0.12 m
  wide down both long sides of each; a car stands in each, nose in.
- **Accessible spaces** nearest the entrance, each with the accessibility
  symbol (the road's own `accessibilitySymbolPaint`) upright to a driver
  pulling in, and its 5 ft access aisle outlined and hatched at 45°, a bar
  every 0.6 m.
- **Loading berths**, 12 × 50 ft, outlined, at the rear along the drive.
- **Planted islands** at every row end and after every ten spaces: a 6 in
  concrete kerb round grass, a broadleaf at 0.8 of a mature tree's scale in
  as many as the tree rule asks, spread over them.
- **The drive's curb cut**, 24 ft, across the sidewalk where the drive meets
  the street, with the drive and the walk paved across the verge; the rest
  of the verge stays grass.

A filling station keeps 12 m clear in front of its kiosk for its canopy and
pumps; a chemical plant or paper mill keeps 8 m behind its body for its tank
farm. Downtown kinds stand centred and paint nothing. See
[props-and-vehicles.md](../props-and-vehicles/README.md) for the cars.

Pads, aprons, driveways and bay markings all go through one shared,
terrain-conforming builder: it subdivides the ground quad into cells too
small to hold a curve, samples the real terrain height at every corner, and
splits each cell on the same diagonal the terrain mesh itself uses, so
nothing laid on the ground clips through a slope or floats over a dip. (Roads
and buildings level their own footprint on placement for the same reason —
see [terrain.md](../../visual-render/terrain.md#levelling-under-structures) for
that terrain-side half of the rule.)

**A body stands on the ground under the body.** Every renderer that seats a
building — the body stack, its podium, its roof props, its kit and a home's
own parts — samples the highest terrain under the base tier's own rectangle,
set back inside the footprint as it is drawn, through one helper
(`maxHeightUnderBody`). Sampling the whole footprint instead let a higher far
corner the body never touched — a street climbing past the lot, a
neighbour's plateau — lift the house, and every dock and bollard with it, off
the pad it stands on; that is what a hillside house hanging over its downhill
side, and a works' loading dock floating over its car park, were.

**Material palette calibration.** One module (`render/palette.ts`) is the
single source of truth for every material colour in the world — buildings,
vehicles and paved surfaces alike. The reference caps albedo brightness so
lighting keeps headroom: the brightest material, snow, sits at 140/142/144,
and no other material channel may exceed 144. Colours are rescaled into
range rather than clipped per channel, so hue survives the correction —
several existing materials had drifted well past the cap (a silo at
216/212/200, an AC unit at 206/210/213, a garage wall at 207/199/182, an
airport structure at 202/197/184), which is why lit roofs used to blow out.

