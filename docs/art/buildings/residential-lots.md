# Residential lots

A detached home or a row of homes is laid out on its lot from the street it
fronts: the street — any road but a railway — that borders the most of the
lot's edge, so on a bend or beside the end of a cul-de-sac a home faces the
street it runs along for the longest stretch; sides tied on road tiles are
broken north, east, south, west. Everything is placed in that
edge's frame, across the frontage and in from it, in absolute metres, and
seeded from the building id, so the same lot always comes out the same. A
home that fronts no street keeps its body centred on its lot and has a lawn
and a yard but no drive, no garage and no car.

**Where the house stands.** The lawn runs from the back of the lot across the
road's grass verge to the sidewalk — to the carriageway, on a road with no
sidewalk — so no strip of wild grass separates a home from its street. The
house's front wall stands 5.5 m behind the sidewalk: a front yard deep enough
for the longest car (4.6 m) to stand in front of the house without blocking
the footway. Where the verge alone is wider than that, the house stands at
its lot's edge; it never leaves its lot. Across the frontage the house keeps
its place, centred. Its front door faces the street — the facade's own
entrance, on every building's north face, reads on a home that faces
another way as a back or side door. A small path, 1.2 m of concrete, runs
from the door to the sidewalk.

**The drive.** Every home that fronts a street has a drive, dirt or concrete
by seed, 3 m wide, running from the carriageway across the sidewalk — a curb
cut, laid over the paving — and the verge onto the lot. A drive only crosses
a straight stretch of street: never a junction tile, never a tile the street
leaves on both axes. The street is the one drawn: beside a turn bay, whose
kerb and sidewalk stand further out, the drive, the path and the lawn meet
the widened kerb, and they are laid again when a junction gains or loses its
bay, or when a road edit beside them redraws the street. The resident's car stands on the drive, nose to the
house, while the home is Active. Where the drive and its cover go depends on
the home:

- **A detached home**, and a row whose narrow end faces the street, runs its
  drive down one side of the house, the side seeded, 1 m of lawn between them
  (less where the lot is narrow; with under 3.2 m beside the house the home
  takes a front pad instead, below). The drive ends at one of four covers, by
  seed: an open **parking spot** beside the house; a **carport** there — a
  flat roof 2.4 m up on four posts, 3.4 × 6 m; an **attached garage** filling
  the lawn strip and the drive's width, 6 m deep and 2.6 m tall, set 1 m back
  from the house front with its door to the street; or a **detached garage**
  3 m behind the house's back wall, 4 × 6 m, its door facing down the drive.
  The car stands just in front of the garage door, under the carport, or on
  the spot. A cover the lot has no depth for is not chosen.
- **A row facing the street along its length** is three homes to the 20 m of
  frontage, each a share of the row's body; a duplex or a fourplex is two
  homes across its frontage the same way. Each home gets its own short
  drive to its front wall — a front pad, the car on it — and some of them, by
  seed, an integral garage door in the facade behind the pad.

**The yard.** Behind the house, each part present or not by seed:

- A **fence**, 1.6 m tall, in wood or white: from the house's back corners
  out to the side lot lines, then along the side and back lot lines, open
  where a drive passes. Between the homes of a row it also runs from the back
  wall to the back lot line.
- A **patio** slab against the back wall, concrete or brick, 4 m deep and up
  to 5 m wide, and on some patios a **grill** (0.6 × 0.5 × 1.0 m).
- An **above-ground pool**, 4.6 m across and 1.2 m tall, water at its rim.
- A **trampoline**, 4.3 m across, its mat 0.9 m up on six legs.
- **Yard trees**: none, one or two by seed, and one more for every 800 m² of
  back yard, so a big lot is not a bare lawn (see
  [vegetation.md](../../visual-render/vegetation.md#where-a-tree-may-stand) for
  why they are the home's own, not wild ones).
- **Bushes** along the front wall — two to four for a house, two per home
  in a row — clear of the door paths and the drives.

The pool, the trampoline and the trees each take the first free spot the seed
offers in the back yard, clear of the drive, its cover and the patio, and a
part with no free spot is left out. A row's yards are about 5 m deep, which
holds a patio and a grill but not a pool or a trampoline.

**What the yard costs.** Six thousand of these stand in a Metropolis, so the
yard's parts are drawn for 40 m: the pool a twelve-sided drum (under 60
triangles), the trampoline a twelve-sided mat on six legs (under 110), the
trees and bushes at the species ceilings in
[vegetation.md](../../visual-render/vegetation.md#trees). With its roof, its
cover, its car, its yard and [the kit's parts](residential-kinds/the-house-kits-parts.md), a
home on a normal lot stays under 1,300 triangles and on an acre under 1,800,
inside the house tier of
[modeling-standards.md](../modeling-standards.md#geometry-budget), and the test
there holds it.

**Through the lifecycle.** The roof, garage and carport share the body's
day/night tint and its construction grey; the fence, the yard parts, the
trees and the car are lit like any other prop. A home under construction has
its lawn, drive and cover but no yard; an Abandoned home keeps its fence,
bushes and trees but not its pool, trampoline or grill; only an Active home
has its car.

