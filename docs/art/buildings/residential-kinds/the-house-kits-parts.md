# The house kit's parts

A house-scale home is read from the street by the parts the house kit
stands on and beside its body, each a pool of its own like the roof and the
garage, placed from the lot plan in absolute metres and chosen by the
building's seed. The body and its punched windows stay the facade's; the
parts land on the grid the facade draws. The references and their sources
are in
[../../../specs/building-detail.md](../../../specs/building-detail.md);
the figures below are the ones the kit uses.

**A detached house is three houses, one per level**, because its three
catalog heights are three real storeys: 4 m is a one-storey **ranch**, 5 m a
one-and-a-half-storey **Cape**, 6.5 m a two-storey **colonial**.

| Level | House    | Roof               | Eaves                                         | Chimney                                                                        | Entry                                                                                                                                                                                                  | Windows                                         |
| ----- | -------- | ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1     | Ranch    | side gable at 5:12 | wide: 0.46 m (18 in) all round, exposed       | interior, 0.53 m square through the ridge, 0.9 m (3 ft) above it               | a stoop under the eave: a 1.2 × 1.5 m landing 0.2 m up, one step                                                                                                                                       | none added                                      |
| 2     | Cape     | side gable at 8:12 | 0.2 m (8 in) at the eave and the rake         | central, 0.53 m square, 0.9 m above the ridge                                  | a portico: two 0.25 m posts under a 1.8 × 1.2 m gable hood, a 3-riser stoop 0.6 m up                                                                                                                   | two gable dormers on the street slope, shutters |
| 3     | Colonial | side gable at 8:12 | boxed: 0.46 m (18 in) at the eave, 0.2 m rake | at one or both gable ends by seed, 0.53 × 0.97 m, 0.6 m (2 ft) above the ridge | the portico and stoop above, or by seed a **front porch**: 1.8 m (6 ft) deep across the frontage less 1 m each side, 0.6 m up on three risers, 0.2 m posts at 2.4 m, a shed roof off the wall at 2.9 m | shutters on every street-face window            |

- **Pitch.** A ranch is "always low-pitched, 4:12 to 5:12"; the Cape and the
  colonial take 8:12, the low end of the Cape's 8–12 and a middle reading of
  the colonial's disputed "shallow" and "medium". A pitch is rise over half
  the span, so 5:12 is 0.417 and 8:12 is 0.667 of the half-span; the kit's
  old 0.42 of the full span was about 10:12, steeper than any of the three,
  and the pitch is now fixed by level with no per-house jitter. The ridge
  runs along the frontage, so the dormers and the gable ends face the way
  the real houses' do. The rise cap of 4.5 m holds a detached body at 8:12;
  a duplex's or a fourplex's 16 m body meets the cap and takes about 6¾:12.
  A row keeps 5:12.
- **Eaves.** The ranch's 18 in is Glendora's minimum for a prominent ranch
  eave; the colonial's 18 in boxed eave is Dallas's pattern book, and the
  rake stays under 8 in. The roof prism overhangs the walls by those figures
  and its edge face is the fascia, 0.18 m (1 × 8) deep, in the trim colour.
- **Chimneys.** IRC: 3 ft above where it leaves the roof and 2 ft above
  anything within 10 ft. A single 13 × 13 in flue in 4 in walls is 21 in
  (0.53 m) square; two flues with a wythe between are 21 × 38 in (0.53 ×
  0.97 m), the gable-end chimney's plan. A chimney is brick red whatever the
  wall.
- **Stoops and steps.** A riser is at most 7¾ in and a tread at least 10 in
  (IRC R311.7.5), so a 24 in porch floor is three risers of 0.2 m on treads
  of 0.25 m, and a landing is at least 36 in (0.9 m) in the direction of
  travel. A floor 24 in up needs no guard (the guard starts at 30 in), so no
  porch here carries a rail. The front wall stands 5.5 m behind the sidewalk
  and only about 1.1 m inside the lot line, so a stoop or a porch runs out
  over the verge lawn the home already mows, never onto the sidewalk; a
  shutter on the ground row is left off where a door, a stoop or a garage
  leaf stands before its window.
- **Porch.** Six feet is the least depth a porch is usable at (Franklin TN,
  Knoxville; Memphis asks 8). Posts are 8–12 in; the kit's are 0.25 m.
- **Dormers.** A gable dormer's width follows the window and its trim below
  (Fine Homebuilding), so each is one bay wide, 1.4 m, its own gable at the
  main pitch, set 0.3 m up from the eave and 0.75 m (30 in) in from the end
  walls; the Cape has two, evenly spaced, the ranch and the colonial none.
- **Windows and shutters.** The facade cuts each face into the columns and
  storey rows the material draws (two columns a tile of footprint, a row a
  storey; a 9.5 m face has three bays of 3.17 m); `facade.ts` exports that
  grid as `windowGrid`, and every part that frames a window reads it. A
  window is half its bay. A shutter is half the window's width and its full height
  (Montgomery County; the preservation rule that shutters cover the opening
  when closed), a 0.06 m slab either side of the window on the street face,
  in the trim colour. The ranch's windows stay bare; the picture window and
  sidelights are deferred.
- **Garage door.** A single door is 9 × 7 ft (Amarr: 8–10 wide, 7 or 8
  high), so the leaf is 2.74 × 2.13 m on the kit's 2.6 m-wide garage opening,
  in the trim colour, standing 0.05 m proud of the garage face; its four
  panels are the colour's own, not seams.
- **Front door.** The kit's 1 × 2.1 m door is the 36 × 80 in slab that yields
  the IRC's 32 in clear width; it stays, in the trim colour.
- **Colour.** Walls keep the facade's desaturated plaster palette, weighted
  by the share of US exteriors painted each colour (Houzz 2026: beige 24%,
  white 14%, grey 12%, green 9%, black 8%, brown 7%). Trim, shutters, the
  garage leaf, the door and the fascia are one trim colour a house: black
  (39%) or white (19%) by seed at those weights, the rest a dark green or the
  roof's colour — except that a dark wall always takes white trim, because
  black shutters on a dark wall are not there. The fascia runs along the two
  eaves only; the sloped rake boards keep the roof's colour.

**A duplex and a fourplex** are the colonial's parts on their two-door
bodies: a stoop at each door, shutters on the street-face windows, the
gable-end chimney, the 8:12 roof with the colonial's eaves, and no porch.

**A townhouse row** is three homes in one body, read as three: a **party-wall
parapet** at each boundary, a 0.3 m slab in the wall colour whose top
follows the roof's own gable section 0.76 m (30 in, IRC R302.2) above the
slope, so it reads as a stepped fin standing that much proud of the roof
and never as a blade to the ridge; a stoop of three risers at every door; the 8 ft
(2.44 m) single garage leaf where the seed gave the home a garage door; and
shutters. Its roof keeps the kit's pitch with the colonial's rake.

**What it costs.** With its roof, cover, car, yard and these parts a home on
a normal lot stays under 1,300 triangles and on an acre under 1,800, inside
the house tier; the ceilings in
[modeling-standards.md](../../modeling-standards.md#geometry-budget) rise to those
from 900 and 1,500, because the parts are the point of the tier, and the
test holds them. Shutters are the dear part — ten triangles each, two a
window — and are drawn only on the street face for that reason.

