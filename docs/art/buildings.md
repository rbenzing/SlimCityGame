# Buildings

Massing, facades, roofs, archetypes and the lot a building stands on. The
proportions here all read against the [scale bible](README.md). Emissive
window behaviour at night is described in full in [lighting.md](../visual-render/lighting.md);
this file covers the window geometry and the day-side facade only.

## Facade shader

One procedural material drives both the day and the night look of every
building, so windows are guaranteed to align between the two:

- **Window grid**: floor count is height ÷ 3.2 m; bays come from the
  footprint. The grid is drawn in-shader as mullion lines with inset window
  cells. By day the cells tint glass-blue with a slight per-window
  reflectance variation (see [lighting.md](../visual-render/lighting.md) for the hash that
  drives it and the night emissive treatment).
- **Wall palette by archetype family** (from the catalog colour as a base):
  glass curtain-wall (blue, window cells dominate), masonry (brick red/brown,
  punched windows, visible spandrel bands every floor), concrete panel (grey,
  narrow windows), beige plaster (low-density residential). A deterministic
  per-instance hue jitter of ±4%, seeded from the building id, keeps a block
  from reading as clones.
- **Ground floor**: the first 3.2 m band gets storefront treatment — taller
  glazing, a darker frame, and an entrance rectangle centred on the
  road-facing side.
- **Parapet**: the top 0.4 m is a darker band; the flat roof itself tints
  slightly darker than the walls.
- **Silhouette variety**: buildings grown to level 2–3 render as 2–3 stacked
  boxes with 10–20% setbacks (deterministic from the building id) — one extra
  instance per tier, same instancer.
- **Palette preset**: the base city reads deliberately desaturated —
  off-white/bone/grey walls with beige/tan accents and rare dark accents
  (industrial) — so that saturation stays reserved for zone tints, overlays,
  the selection outline and night glow. Family hues from the wall palette
  above stay but clamp to low saturation (masonry reads dusty tan rather than
  fire-red), which is what keeps data lenses and highlights legible on top of
  the city.
- **Roofs, on every building**: every flat roof gets a roof plate tinted
  distinctly from the walls (white/grey/tan rotation by id hash) and a
  parapet lip. Rooftop props (AC units, antennas) appear on MOST roofs, not
  only towers — the current rule is any building of 2 floors or more, and the
  count scales with roof area, from a single vent on a 1×1 house up to 4–6 AC
  units on a large slab; a single-floor shed still gets one vent.

## Archetype families

An archetype is a recipe over one shared kit of low-poly parts — a loading
dock, a monitor roof, a roof array, a canopy, a signage band — not a bespoke
model per building. Parts are shared across archetypes, each part is a single
box, and a whole assembly stays under a hundred triangles, which is what
keeps the kit reading consistently across a whole city. A part that hangs on
the road-facing wall (a dock, a canopy, a sign) is skipped entirely when a
building fronts no street; roof parts need no frontage and always appear.

**Residential.** Row houses render narrow, low and attached; medium-density
zones render as mid-rise blocks; high-density zones render as tall towers;
Mixed housing tints a commercial base with a residential tint above it,
because the building carries both a shopfront and apartments. Every
detached and row home additionally carries the procedural house kit:

- A **pitched roof** (gable or hip) sized to the body footprint, seeded per
  building for gable-vs-hip, orientation and roof colour. Denser residential
  (apartments) and every non-residential archetype keep a flat roof instead.
- **A lot laid out from its street**: the house at the front, a drive, and a
  yard behind — see [Residential lots](#residential-lots).
- **Massing variety**: footprint fill, eaves height, roof pitch/type, and
  wall/roof colour are all seeded per building id from a bounded variant set,
  so a residential street reads as individual homes, not clones.
- Detached homes have a hard **2×2 minimum footprint** — nothing smaller ever
  builds. The low-density levels are a 2×2, a 2×3 and a 3×3; rows are 1×2,
  1×4 and 1×6.

**Commercial.** The first commercial level is a **storefront**: a canopy over
the frontage plus a signage band above it, on top of the stage-1 ground-floor
storefront treatment shared by every archetype. The second level and up is a
**retail block**: the signage band alone, no canopy.

**Industrial.** Its own facade language, distinct from the general wall
palette above:

- **Sheds** render as long, low volumes with a roof cap band (a bevelled
  illusion of a curved roof), fine vertical corrugated-wall striping in the
  facade shader, and a single accent stripe band — red or blue by id hash —
  at two-thirds height, which is the kit's signature.
- **Palette**: steel blue, light grey or off-white walls (the same
  desaturation rule applies), grey roof plates.
- The first industrial level is a **warehouse**: a loading dock and a bank of
  wide roll-up/sectional loading doors repeating across every face, which
  override the ground-floor windows there — the loading-dock read. The
  second level and up is a **factory**: a monitor roof over the same
  smokestack-and-silo massing below.
- Any industrial building at level 2 or higher gets a **smokestack** (a tall
  cylinder with a warning-light emissive at night — see
  [lighting.md](../visual-render/lighting.md)); a large industrial footprint (3×3 or bigger)
  may additionally get a 3–4-silo cluster at one footprint corner,
  deterministic from the building id. Rooftop vents follow the general
  roofs-everywhere rule above.
- **Clean industry is read from what it emits, not from its name or level.**
  The top industrial archetype, Green Works, is simply the industrial
  building whose pollution figure is zero — and its smokestack is gated on
  that same figure, so a stack on the skyline always means pollution in the
  air and the silhouette can never disagree with the simulation. It gets a
  roof array instead of a stack, and pointedly no stack at all, and it sits
  above the factory in jobs offered — something to grow into, not a reskin.

## Lots and paved ground

**The lot is the unit, not the building.** A lot pad claims a building's
whole tile footprint; the body sits on that pad, set back from the street.
The footprint shrink that makes room for windows and setbacks is a body-only
rule — a body that filled its tile would share a wall with its neighbour —
and the pad is what claims and paves the rest. Adjacent buildings' pads meet
edge to edge with no grass seam, so a zoned block reads as continuous
developed land; each pad stops short of the road at the verge the parking
apron already respects, except a home's lawn, which runs across the verge to
the sidewalk (see [Residential lots](#residential-lots)).

A building's body is additionally pulled back from its own road-facing edge
by exactly the parking bay row's depth (minus the shrink margin), so the
road-side face lands flush where the bay row ends: lot in front, building
behind, with no overlap and no gap. The other three faces of the body do not
move. See [props-and-vehicles.md](props-and-vehicles.md) for the bay row
itself.

Pads, aprons, driveways and bay markings all go through one shared,
terrain-conforming builder: it subdivides the ground quad into cells too
small to hold a curve, samples the real terrain height at every corner, and
splits each cell on the same diagonal the terrain mesh itself uses, so
nothing laid on the ground clips through a slope or floats over a dip. (Roads
and buildings level their own footprint on placement for the same reason —
see [vegetation.md](../visual-render/vegetation.md) for that terrain-side half of the rule.)

**Material palette calibration.** One module (`render/palette.ts`) is the
single source of truth for every material colour in the world — buildings,
vehicles and paved surfaces alike. The reference caps albedo brightness so
lighting keeps headroom: the brightest material, snow, sits at 140/142/144,
and no other material channel may exceed 144. Colours are rescaled into
range rather than clipped per channel, so hue survives the correction —
several existing materials had drifted well past the cap (a silo at
216/212/200, an AC unit at 206/210/213, a garage wall at 207/199/182, an
airport structure at 202/197/184), which is why lit roofs used to blow out.

## Residential lots

A detached home or a row of homes is laid out on its lot from the street it
fronts: the first street — any road but a railway — found along the lot's
edges, tie-broken north, east, south, west. Everything is placed in that
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
leaves on both axes. The resident's car stands on the drive, nose to the
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
- **A row facing the street along its length** is one home per lot tile of
  frontage, each a share of the row's body. Each home gets its own short
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
  [vegetation.md](../visual-render/vegetation.md#where-a-tree-may-stand) for
  why they are the home's own, not wild ones).
- **Bushes** along the front wall — two to four for a house, two per home
  in a row — clear of the door paths and the drives.

The pool, the trampoline and the trees each take the first free spot the seed
offers in the back yard, clear of the drive, its cover and the patio, and a
part with no free spot is left out. A row's yards are about 5 m deep, which
holds a patio and a grill but not a pool or a trampoline.

**Through the lifecycle.** The roof, garage and carport share the body's
day/night tint and its construction grey; the fence, the yard parts, the
trees and the car are lit like any other prop. A home under construction has
its lawn, drive and cover but no yard; an Abandoned home keeps its fence,
bushes and trees but not its pool, trampoline or grill; only an Active home
has its car.

## Construction and abandonment

A building under construction renders scaled down and grey, growing to its
full size and true colour as it completes. An Abandoned building is boarded:
its window cells go dark and its walls desaturate, and — unlike an Active
building — it stays fully dark at night, because a lit window is the one
signal that a building is Active (see [lighting.md](../visual-render/lighting.md)). Both
Constructing and Abandoned buildings park zero cars, so an idle lot is
legible on sight (see [props-and-vehicles.md](props-and-vehicles.md)).

## Deferred

Two asset-upgrade paths are designed for but not built: AI-generated facade
trim-sheet atlases replacing the procedural wall/window pattern via a
per-archetype UV map (same instancer, a texture swap), and real GLTF building
kits per archetype, which would need baked window-emissive masks to keep the
night rule above. Neither touches simulation or protocol code when it lands.
No authored FBX/OBJ assets or importer, no per-archetype bespoke textures, no
interior geometry, and no LOD meshes are planned — the procedural kit is cheap
enough that distance culling is the whole LOD story. See
[DESIGN.md](../DESIGN.md) for the backlog these belong to.
