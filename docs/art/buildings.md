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
- **Silhouette variety**: a flat-roofed building grown to level 2–3 renders
  as 2–3 stacked boxes with 10–20% setbacks (deterministic from the building
  id) — one instance per tier in the body instancer's own bucket, so each
  tier carries the building's windows and a terrace roof, with the
  storefront band, the entrance and any loading doors on the base tier only.
  A house keeps one body whatever its level, since its pitched roof has
  nowhere to step; so does a farm.
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

**Residential.** A residential building's kind — the catalog's `kind`,
drawn when the lot grows (see
[../game-design/features/building-types.md](../game-design/features/building-types.md))
— decides which of two languages it speaks. The house-scale kinds (a
detached house, a duplex, a fourplex, a townhouse row) carry the house kit
below; the block kinds (a multiplex, courtyard apartments, mid-rise flats, a
tower) are flat-roofed and lotted like any block. Mixed housing tints a
commercial base with a residential tint above it, because the building
carries both a shopfront and apartments. What each kind looks like is under
[Residential kinds](#residential-kinds). Every house-scale home carries the
procedural house kit:

- A **pitched roof** (gable or hip) sized to the body footprint, seeded per
  building for gable-vs-hip, orientation and roof colour. Denser residential
  (apartments) and every non-residential archetype keep a flat roof instead.
- **A lot laid out from its street**: the house at the front, a drive, and a
  yard behind — see [Residential lots](#residential-lots).
- **Massing variety**: footprint fill, eaves height, roof pitch/type, and
  wall/roof colour are all seeded per building id from a bounded variant set,
  so a residential street reads as individual homes, not clones.
- A detached home stands on the lot the land warrants — 1×1, 1×2, 2×2, 2×3
  or 3×3 — and keeps it through its three levels, which change its height and
  not its ground
  ([../game-design/features/lots-and-land.md](../game-design/features/lots-and-land.md));
  a duplex and a fourplex take a half (1×1) or a normal (1×2, or 2×1 turned)
  lot and keep it at every level; a townhouse row takes one normal lot (1×2,
  or 2×1 turned) at every level and holds three homes on it, and a long
  terrace is neighbouring parcels in a run, each a run of three with side
  yards between runs.

**Commercial.** A commercial building's kind decides its archetype. A shop,
a shopping strip, a supermarket and a restaurant are **storefronts**: a canopy
over the frontage plus a signage band above it, on top of the stage-1
ground-floor storefront treatment shared by every archetype, standing in the
car park its code asks for (see [Lots and paved ground](#lots-and-paved-ground)).
A **filling station** is a kiosk behind a **fuel canopy**: a tall flat canopy
on four posts standing off the kiosk's frontage over the forecourt, with two
pump islands under it; the forecourt is kept clear and the kiosk's parking is
beside it. An **office** is a glass block with no shopfront parts at all. A
**hotel** is a block with a canopy at its entrance and a sign band — the
storefront parts on a tall body. Offices and hotels are downtown: centred on
their lots, they draw no car park and their cars stand at the kerb. What each kind measures is under
[Commercial kinds](#commercial-kinds). A commercial entry with no kind keeps
the old ladder: a storefront at its first level, a **retail block** — the
signage band alone — above it.

**Industrial.** Its own facade language, distinct from the general wall
palette above:

- **Sheds** render as long, low volumes with a roof cap band (a bevelled
  illusion of a curved roof), fine vertical corrugated-wall striping in the
  facade shader, and a single accent stripe band — red or blue by id hash —
  at two-thirds height, which is the kit's signature.
- **Palette**: steel blue, light grey or off-white walls (the same
  desaturation rule applies), grey roof plates.
- An industrial building's archetype is its **kind** (see
  [Industrial kinds](#industrial-kinds)): a **workshop** is a low shed with
  roller doors at grade; a **warehouse** a loading dock with a bank of wide
  roll-up doors above it, which override the ground-floor windows there; a
  **factory** a monitor roof over the shed; a **flex** building a roof array
  and no stack. The heavy kinds are plants: a **food plant** is a warehouse
  with silos; a **chemical plant** a block with a tank farm in its yard; a
  **steelworks** a long, tall monitor-roofed shed; a **paper mill** a tall
  monitor-roofed hall with tanks behind it. An industrial entry with no
  kind keeps the old ladder: a warehouse at its first level, a factory
  above it, a roof array where it emits nothing.
- A **smokestack** (a tall cylinder with a warning-light emissive at night —
  see [lighting.md](../visual-render/lighting.md)) stands on every plant of
  the Heavy Industrial zone, twice the height of the old one, and on a
  kindless industrial building that pollutes from level 2 up. The light
  kinds release a few units and raise none. A food plant, and a kindless
  industrial footprint 3×3 or bigger, gets a 3–4-silo cluster at one
  footprint corner, deterministic from the building id. Rooftop vents
  follow the general roofs-everywhere rule above.
- **A stack is read from what the building emits, never from its name or
  level.** It is gated on the building's own pollution figure, so a stack on
  the skyline always means pollution in the air and the silhouette can never
  disagree with the simulation. The flex building is the clean kind: its
  pollution figure is zero and it gets a roof array.

**Farms.** A farm counts as industry and never looks like it. Every renderer
that dresses industry — the lot pad, the setback tiers, roof props and
stacks, parking bays and kerb cars, the facade — asks `isFarmEntry` first and
leaves a farm to its own plan (`src/render/farmlot.ts`) and kit
(`src/render/farms.ts`).

- **The farmstead** takes a 30 m strip along the lot's dirt-road edge,
  where its gate is. Moving along that edge from the gate:
  - a farmhouse, 9 × 8 m, with its walls to 4.8 m and a gable roof to 8 m;
  - a gravel drive, one vehicle wide, from the lot line in;
  - the barn, 11 m across (12 m on a large farm) and 14–36 m long by kind and
    level, the dairy barn longest. Its walls are the farm's pickable body,
    drawn by the building instancer, and they stand to 55% of the catalog
    height under a gambrel roof: steep to 60% of its rise, shallow above.
    The gable ends are the barn's own paint, and the pitches are metal;
  - tower silos, 6 m across and 16 m high under a dome, beyond the barn: one
    on a crop or pasture farm, two on a large one;
  - grain bins behind the barn, 5.5 m across with a 4 m eave under a shallow
    cone, joining a crop farm's silo at levels 2 and 3.

  Round the buildings the yard is grass, with rolled gravel where the
  machinery stands.

- **Barn paint** comes from measured swatches, and the town's wall
  desaturation does not apply to it:
  - the saturated red for a crop farm;
  - white plaster for a dairy;
  - weathered wood for an orchard's packing barn.
- **The field** is the rest of the lot, running away from the road:
  - **Row crops** are drawn in bands of three 30-inch (0.76 m) rows of crop
    and one of bare furrow, running into the field, so the rows hold still
    at a distance. By farm id, half the crop farms stand in a growing green
    crop and half in ripe grain.
  - **An orchard** is mown grass with round-headed trees in rows at
    semi-dwarf spacing, 4.9 m apart in the row and rows 6.1 m apart.
  - **A paddock** is grazed pasture inside a post-and-rail fence: a post every
    4 m and two rails following the ground from post to post. It carries one
    head of cattle for every four tiles, never none. The cattle are black,
    white or brown and 2.4 m nose to tail, and they drift across the paddock
    at a grazing walk, clear of the fence. Their movement is a pure function
    of the farm id and the frame clock.
- **Construction and abandonment.** A farm going up shows its barn frame on
  bare tilled soil and nothing else. An abandoned farm keeps its buildings,
  darkened like any derelict building, while its field goes back to rough
  grass and its herd is gone. The ground is land, not a building, so it is
  never darkened; its colour alone says what state it is in.

## Lots and paved ground

**The lot is the unit, not the building.** A lot pad claims a building's
whole tile footprint; the body sits on that pad, set back from the street.
The footprint shrink that makes room for windows and setbacks is a body-only
rule — a body that filled its tile would share a wall with its neighbour —
and the pad is what claims and paves the rest. Adjacent buildings' pads meet
edge to edge with no grass seam, so a zoned block reads as continuous
developed land; each pad stops short of the road at the verge, except a
home's lawn, which runs across the verge to the sidewalk (see
[Residential lots](#residential-lots)), and a car park's drive and walk,
which cross it.

**A suburban commercial or industrial lot is a car park laid to code**
([parking-to-code.md](../game-design/features/parking-to-code.md)). Its pad
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
[props-and-vehicles.md](props-and-vehicles.md) for the cars.

Pads, aprons, driveways and bay markings all go through one shared,
terrain-conforming builder: it subdivides the ground quad into cells too
small to hold a curve, samples the real terrain height at every corner, and
splits each cell on the same diagonal the terrain mesh itself uses, so
nothing laid on the ground clips through a slope or floats over a dip. (Roads
and buildings level their own footprint on placement for the same reason —
see [terrain.md](../visual-render/terrain.md#levelling-under-structures) for
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

## Residential kinds

Each kind is identifiable at the default camera pitch without its label, by
its body and by what stands on its lot. A body's size is set per kind, in
metres, and the lot takes the rest:

| Kind                 | Body                                                        | Roof    | On the lot                                                       |
| -------------------- | ----------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| Detached house       | 4.75 m per lot tile each way, never under 9.5 m (9.5 × 9.5 m on a 1×1, 1×2 or 2×2 lot, 9.5 × 14.25 m on a 2×3, 14.25 × 14.25 m on a 3×3) | pitched | lawn, one drive and its cover, a yard                            |
| Duplex               | 60% of each lot axis, capped at 16 m (12 × 12 m on 1×1, 12 × 16 m on 1×2) | pitched | two front doors, one drive per home                              |
| Fourplex             | 70% of each lot axis, capped at 18 m (14 × 14 m on 1×1, 14 × 18 m on 1×2) | pitched | two front doors, one drive per door                              |
| Townhouse row        | 90% of each lot axis, capped at 18 m (18 × 18 m on its 1×2); three homes per 20 m of frontage, 6 m each | pitched | a door, a front pad and by seed a garage door per home           |
| Multiplex            | 13.6 m per tile, capped at 24 m each way (24 × 24 m on its 2×2) | flat    | a lot pad; cars at the kerb                                      |
| Courtyard apartments | 13.6 m per tile (27.2 × 27.2 m on its 2×2 at every level)   | flat    | a lot pad; cars at the kerb                                      |
| Mid-rise flats       | 13.6 m per tile                                             | flat    | a lot pad; cars at the kerb                                      |
| Tower                | 13.6 m per tile, rising from a two-storey podium at 85%     | flat    | the podium fills the lot to the 85% ceiling; cars at the kerb    |

The body sizes are the missing-middle types' own: a duplex is 28–55 ft by
28–60 ft, a fourplex 34–56 by 32–60, a multiplex 50–80 by 35–75, and a
townhouse 18–25 ft wide; a block fills its plate as the office and the
civic buildings do. No body exceeds 85% of its lot on either axis, so
neighbours never touch. A home whose body is drawn from a fill rather than a
per-tile rule stands centred across its frontage and at the house-kit setback
from the street like any other home.

Two homes share a duplex or a fourplex body: each has its own door, its
front pad and its drive across the verge, as the homes of a row do, whether
the body's long side or its 12 m end faces the street. Only a body too narrow
for a pad and a door per home — none in the catalog — falls back to one home
with a side drive. A fourplex's two upper homes are reached from inside, so
it shows the same two doors as a duplex and reads taller.

A tower's podium is a massing tier two storeys tall at the lot's full fill,
drawn under the slab by the massing renderer, the one thing it still draws
now that the setback tiers are the body instancer's; it carries the body's
wall colour and lifecycle tint, so the tower reads as one building standing
on its base.

## Commercial kinds

| Kind            | Body                                              | Storeys    | Parts                                     | On the lot                            |
| --------------- | ------------------------------------------------- | ---------- | ----------------------------------------- | ------------------------------------- |
| Shop            | 13.6 m per tile (1×1, 1×2, 2×2)                   | 1          | canopy, sign band                         | car park to code, short of it (the 1×1 draws none) |
| Shopping strip  | 13.6 m per tile, long and shallow (3×2 to 5×2)    | 1          | canopy, sign band                         | car park to code, short of it         |
| Supermarket     | 13.6 m per tile (3×3 to 5×4), 4.7 m tall          | 1          | canopy, sign band                         | car park to code, short of it         |
| Restaurant      | 13.6 m per tile capped at 24 m a side             | 1 / 1 / 2  | canopy, sign band                         | car park to code, short of it         |
| Filling station | 35% of the lot each way, capped at 16 m           | 1          | fuel canopy on four posts, two pump islands | forecourt; car park to code beside it |
| Office          | 13.6 m per tile                                   | 5 / 8 / 16 | none                                      | none: downtown, cars at the kerb      |
| Hotel           | 13.6 m per tile                                   | 4 / 6 / 8  | canopy, sign band                         | none: downtown, cars at the kerb      |

The fuel canopy stands 2 m off the kiosk's frontage wall and runs 10 m out
over the forecourt and 90% of the way across it, 5.2 m up on four 0.4 m posts
inset at its corners; the two pump islands, 1 × 3 m and 1.4 m tall, stand
under it a quarter of its span either side of centre.
Every part is a box from the shared kit, in the chart's colours: the canopy
and its posts in white brick, the pumps in the red accent.

## Industrial kinds

| Kind           | Zone  | Body                                           | Height (m)        | Parts                             | Props                                  |
| -------------- | ----- | ---------------------------------------------- | ----------------- | --------------------------------- | -------------------------------------- |
| Workshop       | light | 13.6 m per tile (2×2, 3×2, 3×3)                | 6.1               | roller doors at grade             | none                                   |
| Warehouse      | light | 13.6 m per tile (3×3, 4×3, 5×4)                | 7.3 / 9.8 / 12.2  | loading dock, roll-up doors       | none                                   |
| Factory        | light | 13.6 m per tile (2×3, 3×3, 4×3)                | 6.1 / 7.3 / 7.3   | monitor roof                      | none                                   |
| Flex / R&D     | light | 55% of the lot each way (2×2, 3×2, 3×4)        | 6.4 / 6.4 / 9.6   | roof array                        | none                                   |
| Food plant     | heavy | 13.6 m per tile (3×3, 4×3, 5×4)                | 8 / 9 / 10        | loading dock, roll-up doors       | tall stack, silo cluster               |
| Chemical plant | heavy | 50% of the lot each way (3×3, 4×4, 5×4)        | 10 / 12 / 15      | tank farm behind the body         | tall stack                             |
| Steelworks     | heavy | 13.6 m per tile, long and shallow (3×3 to 5×3) | 12 / 15 / 18      | monitor roof                      | tall stack                             |
| Paper mill     | heavy | 13.6 m per tile (3×3, 4×4, 5×4)                | 10 / 13 / 15      | monitor roof, tank farm           | tall stack                             |

A warehouse's heights are the clear heights of its generation — 24, 32 and
40 ft — and the flex building's are two and three storeys; the rest are the
ceiling heights of the type (ULI: light manufacturing 14–24 ft clear, heavy
16–60 ft). A tank farm is three cylinders 6 m across and 5 m tall standing
2 m off the wall opposite the street, in the yard the body leaves behind
it; the roller doors of a workshop stand on the ground, where a warehouse's
stand on its dock. The tall stack is 12 m to the kindless works' 6. Every
other part is the shared kit's box, in the chart's colours: tanks in white
plaster like the silos.

## Residential lots

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
