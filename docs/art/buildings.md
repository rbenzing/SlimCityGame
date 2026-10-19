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
box, and a whole assembly stays inside its tier in
[modeling-standards.md](modeling-standards.md#geometry-budget), which is what
keeps the kit reading consistently across a whole city. A part that hangs on
the road-facing wall (a dock, a canopy, a sign) is skipped entirely when a
building fronts no street; roof parts need no frontage and always appear.

**Residential.** A residential building's kind — the catalog's `kind`,
drawn when the lot grows (see
[../game-design/features/building-types.md](../game-design/features/building-types.md))
— decides which of two languages it speaks. The house-scale kinds (a
detached house, a duplex, a fourplex, a townhouse row) carry the house kit
below; the block kinds (a multiplex, courtyard apartments, mid-rise flats, a
tower) carry [the apartment kit](#the-apartment-kits-parts): the two
house-scale blocks under a hip roof on a car park, the two tall ones flat
on a podium. Mixed housing tints a
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

| Kind                 | Body                                                                                                                                     | Roof    | On the lot                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| Detached house       | 4.75 m per lot tile each way, never under 9.5 m (9.5 × 9.5 m on a 1×1, 1×2 or 2×2 lot, 9.5 × 14.25 m on a 2×3, 14.25 × 14.25 m on a 3×3) | pitched | lawn, one drive and its cover, a yard                                                                                     |
| Duplex               | 60% of each lot axis, capped at 16 m (12 × 12 m on 1×1, 12 × 16 m on 1×2)                                                                | pitched | two front doors, one drive per home                                                                                       |
| Fourplex             | 70% of each lot axis, capped at 18 m (14 × 14 m on 1×1, 14 × 18 m on 1×2)                                                                | pitched | two front doors, one drive per door                                                                                       |
| Townhouse row        | 90% of each lot axis, capped at 18 m (18 × 18 m on its 1×2); three homes per 20 m of frontage, 6 m each                                  | pitched | a door, a front pad and by seed a garage door per home                                                                    |
| Multiplex            | 13.6 m per tile, capped at 24 m each way (24 × 24 m on its 2×2); one body at every level                                                 | hip     | a car park laid to code, 1.4 spaces a home                                                                                |
| Courtyard apartments | 13.6 m per tile (27.2 × 27.2 m on its 2×2 at every level); one body at every level                                                       | hip     | lawn; a car park laid to code only where the lot has room beside the body, which its 2×2 has not, so it parks at the kerb |
| Mid-rise flats       | 13.6 m per tile, rising from a one-storey podium at 85%; one body at every level                                                         | flat    | the podium fills the lot to the 85% ceiling; cars at the kerb                                                             |
| Tower                | 13.6 m per tile, rising from a two-storey podium at 85%; one body at every level                                                         | flat    | the podium fills the lot to the 85% ceiling; cars at the kerb                                                             |

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
and a mid-rise's one storey tall (4.6 m, the 15 ft floor-to-floor a mixed-use
ground floor is zoned to, [Buena Park](https://gocodebook.com/library/us/ca/buena-park-zoning/title-19-zoning/division-7-mixed-use-zones/chapter-19.716-development-standards-building-form)),
drawn under the slab by the massing renderer, the one thing it still draws
now that the setback tiers are the body instancer's; it carries the body's
wall colour and lifecycle tint, so the tower reads as one building standing
on its base. None of the four block kinds steps: a walk-up under a hip roof
has nowhere to step, a 5-over-1 is one plate of wood storeys over its podium
and a tower is one slab, so each is one body at every level as a house is,
and its level reads in its height and its parts.

### The house kit's parts

A house-scale home is read from the street by the parts the house kit
stands on and beside its body, each a pool of its own like the roof and the
garage, placed from the lot plan in absolute metres and chosen by the
building's seed. The body and its punched windows stay the facade's; the
parts land on the grid the facade draws. The references and their sources
are in
[../game-design/features/building-detail.md](../game-design/features/building-detail.md#the-reference-library);
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
[modeling-standards.md](modeling-standards.md#geometry-budget) rise to those
from 900 and 1,500, because the parts are the point of the tier, and the
test holds them. Shutters are the dear part — ten triangles each, two a
window — and are drawn only on the street face for that reason.

### The apartment kit's parts

The four block kinds are the four US multi-family types, drawn from the
reference library in
[building-detail.md](../game-design/features/building-detail.md#the-reference-library):
the missing-middle **multiplex**, the **garden walk-up** with its breezeways,
the **5-over-1** on its podium and the **residential tower** with its
balconies. Every part is laid from the body, the lot, the level and the seed,
in metres; a part that hangs on the street face is skipped where the block
fronts no street, and every block keeps the facade shader's windows. The
facade's bays are its window columns, two to the tile (6.8 m on a 13.6 m
face), and the parts that go by the bay go by those.

**The two walk-ups**, the multiplex and the courtyard apartments, are
house-scale and share the house kit's language:

- A **hip roof** at 5:12 with 0.45 m eaves, the ridge along the frontage.
  Multi-family ordinances ask a hip or gable of 3:12–4:12 at least with
  eaves of 12–18 in ([Gwinnett County](https://www.zoneomics.com/code/gwinnett-county-unincorporated-GA/chapter_38),
  [Duluth](https://duluthmn.gov/media/urpgvlsf/50-30-design-standards.pdf));
  the 5:12 is the game's own, between the minimum and the 6:12–12:12 of the
  1980s stock. The roof's rise is capped at 4.5 m as the house kit's is.
- A **brick base**, 0.9 m, round every face: a band 0.05 m proud in the
  kit's brick. The height is the game's own.
- A **mail kiosk** beside the walk at the street: a USPS cluster box unit,
  0.77 × 0.45 m and 1.93 m to its top on its pedestal
  ([Florence CBU-16](https://www.florencemailboxes.com/products/cluster-box-units/vital-cbu-1570-series/vital-cbu-1570-16/)).
- **The car park.** The lot is a car park laid to code as a commercial lot
  is ([Lots and paved ground](#lots-and-paved-ground)), at 1.4 spaces a home
  (the 1.41 the [Rutgers 2023 study](https://realestate.business.rutgers.edu/sites/default/files/media/documents/Rutgers%20Center%20for%20Real%20Estate%20Parking%20White%20Paper%20September%202023.pdf)
  measured garden apartments using), the drive on the street face, laid
  only where the body keeps 0.45 m off the side lot lines with the car park
  beside it: the multiplex's 24 m body on its 40 m lot does, and takes
  twelve to seventeen spaces; the courtyard apartments' 27.2 m body with one
  12.8 m parking module would fill the lot to its line, so it lays none and
  parks at the kerb as the mid-rise does. A lot with room for neither every
  space nor none paints what fits. Lawn covers the rest of the pad, as a
  house's does, and a walk-up keeps a rear yard, 1.85 m behind the courtyard
  apartments for their rear breezeway and balconies and 0.45 m behind the
  multiplex, that is never paved.

**A multiplex** adds one shared street entry: a **stoop** 2.4 m wide and
1.5 m deep, 0.45 m up on two risers, under a **gabled entry hood** 2.4 ×
1.2 m on two 0.15 m posts, centred on the street face. It is the
fourplex's door at a larger scale, and reads as the one way in that its
eight to twelve homes share.

**A garden walk-up** is the stock 3-storey breezeway plan, 87 × 73 ft with
four homes a floor around one open stair
([plan 83141DC](https://www.architecturaldesigns.com/house-plans/12-unit-3-story-apartment-building-with-1300-to-1370-sq-ft-2-bedroom-units-83141dc)),
the body here 27.2 m square, so it carries two:

- A **breezeway** centred on the street face and one on the rear face,
  each serving the four homes a floor around it. Each is an open slot the
  body's full height to the eave, 1.8 m wide and 0.05 m proud in a dark
  colour, the open stair of the type (an egress balcony is a corridor's 44 in
  at least and half open on its long side, IBC 1021,
  [egress balconies](https://gocodebook.com/library/us/ca/ca-building-code/chapter-10-means-of-egress/section-1021-egress-balconies);
  the 1.8 m is the game's own); at each upper floor a **landing** 1.8 m wide
  and 1.2 m deep, 0.15 m thick, standing out of the slot with a **guard**
  1.07 m tall (42 in, IBC 1015.3,
  [guards](https://www.corada.com/documents/2025CBCPG/1015-3-height)) across
  its front; and from the ground to the first landing a **stair flight**
  1.0 m wide beside the slot, a slab pitched at 32° (the 7 in rise over 11 in
  run of IBC 1011.5).
- A **balcony** for every home above the ground floor and a **patio** for
  every home on it, on the street and rear faces, one per bay whose span is
  clear of the breezeway: a slab 1.8 m deep (6 ft, the private open space
  minimum of [Berkeley](https://berkeley.municipal.codes/BMC/23.304.090) and
  [Palmdale](https://www.codepublishing.com/CA/Palmdale/html/Palmdale17/Palmdale1738.html))
  and the bay's width less 1.0 m, 0.15 m thick, with a 1.07 m guard across
  its front and along its sides; the patio is the same slab on the ground
  with no guard, because the type's ground homes open onto the lawn.
- The **hip roof**, **brick base**, **mail kiosk** and **car park** above.

**A 5-over-1**, the mid-rise, is wood storeys over a concrete podium
([5-over-1](https://en.wikipedia.org/wiki/5-over-1),
[Structure](https://structuremag.org/?p=10934)); at level 1 (16 m, five
storeys) it is the type itself, and at levels 2 and 3 (25.6 and 32 m) the
concrete mid-rise slab that takes over above five wood storeys, in the same
dress:

- The **podium**, one storey of 4.6 m at the lot's 85% fill (above), with a
  **storefront band** across its street face: glazing 3.0 m tall from a
  0.6 m bulkhead, 0.05 m proud, on the kit's lit material between **brick
  piers** 0.6 m wide at each end and every bay. The retail ground floor is
  the type's; the band's figures are the storefront kit's.
- **Box bays**, 0.6 m proud (the 2 ft projection IBC 705.2 allows at the
  nearest fire separation,
  [projections](https://gocodebook.com/library/us/ca/ca-building-code/chapter-7-fire-and-smoke-protection-features/section-705-exterior-walls)),
  the bay's width less 1.0 m, standing from the podium's top to the parapet
  on every other bay of the street and rear faces, each in the alternate
  panel colour — the wall's own colour darkened by 0.78, the fibre-cement
  panel in the other tone that the type alternates by bay.
- **Balconies** in the bays between the box bays, one per storey above the
  podium: a slab 1.8 m deep and the bay's width less 1.0 m, 0.2 m thick,
  with a 1.07 m guard across its front and sides (the 6 ft and 42 in above).
- A **parapet band** 0.76 m tall (30 in, IBC 705.12.1) and 0.1 m proud
  round the roof's edge.
- An **elevator bulkhead** on the roof, 3 × 4 m in plan and 4.1 m tall (the
  13 ft 4 in to 13 ft 8 in of overhead a machine-room-less car needs above
  its top landing, [KONE MonoSpace 500](https://www.kone.us/Images/KONE-MonoSpace-500-DX-Configurations-and-Dimensions_tcm25-115250.pdf),
  [Otis Gen3](https://www.otis.com/documents/d/otis-2/gen3-elevator-hoistway-dimensional-data)),
  set 3 m back from the street face (the 10 ft New York holds a bulkhead
  back from the street wall,
  [NYC zoning resolution](https://zr.planning.nyc.gov/print/pdf/node/17757)), and the
  commercial kit's **rooftop units** by floor area.

**A tower** is the post-2000 residential point tower: a slab of window wall
with balconies on its long faces, on a base
([SAH point tower](https://sah-archipedia.org/buildings/IL-01-031-0051)):

- The **podium**, two storeys at the lot's 85% fill (above), with the
  commercial kit's **lobby portal** centred on its street face and the
  5-over-1's **storefront band** on the rest of it, both lit.
- A **continuous balcony** on each long face at every floor above the
  podium: a slab the face's width less 1.0 m at each end, 1.8 m deep (under
  the 7 ft New York caps a balcony at,
  [ZR 23-62](https://zoningresolution.planning.nyc.gov/article-ii/chapter-3/23-62)),
  0.2 m thick, with a **glass guard** 1.07 m tall along its front, a 0.05 m
  slab in the kit's glazing blue. The floors are the body's height at 3.2 m
  a floor, the facade shader's own; the type's 9 ft 4 in
  ([the Odyssey, Arlington](https://engr.psu.edu/ae/thesis/portfolios/2007/JJM413/techassignment2.pdf))
  is not drawn, because the windows are cut to 3.2 m.
- A **parapet band** 0.76 m, as the 5-over-1's.
- A **mechanical penthouse** on the roof, 4.1 m tall, covering 30% of the
  plate in a rectangle the plate's proportion, set 3 m back from the street
  face (New York's rooftop bulkheads cover at most 30% of the roof and stand
  10 ft from the street wall, [NYC zoning resolution](https://zr.planning.nyc.gov/print/pdf/node/17757));
  the elevator overrun is inside it.

**What it costs.** The two walk-ups stay in the block tier of 1,500 with
their car parks and cars. The mid-rise and the tower take the **tall block
tier of 4,000** in
[modeling-standards.md](modeling-standards.md#geometry-budget): a balcony at
every floor is the type's read and a 25-storey tower's is 1,200 triangles on
its own, and the two kinds are the rarest in the catalog, 0.11% and 0.07% of
what grows, ten mid-rises and six towers in a Metropolis of 8,759 buildings.
The test holds every kind at every level, and the parts are as cheap as they
read: every balcony is one slab and one guard, a box bay one box, the
breezeway one slot and its landings.

## Commercial kinds

| Kind            | Body                                           | Storeys    | Parts                                                                              | On the lot                                         |
| --------------- | ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Shop            | 13.6 m per tile (1×1, 1×2, 2×2)                | 1          | bulkhead, awnings, lit sign band, cornice                                          | car park to code, short of it (the 1×1 draws none) |
| Shopping strip  | 13.6 m per tile, long and shallow (3×2 to 5×2) | 1          | continuous canopy, tenant sign bands, anchor, pylon sign, rooftop units            | car park to code, short of it                      |
| Supermarket     | 13.6 m per tile (3×3 to 5×4), 4.7 m tall       | 1          | entry tower, brick base, cart corrals, lit sign band, rooftop units                | car park to code, short of it                      |
| Restaurant      | 13.6 m per tile capped at 24 m a side          | 1 / 1 / 2  | drive-through, dumpster enclosure, awnings, lit sign band, rooftop units           | car park to code, short of it                      |
| Filling station | 35% of the lot each way, capped at 16 m        | 1          | fuel canopy with its fascia on four posts, two islands with dispensers, price sign | forecourt; car park to code beside it              |
| Office          | 13.6 m per tile                                | 5 / 8 / 16 | lobby portal; rooftop units, or a screen and cooling tower on the tower            | none: downtown, cars at the kerb                   |
| Hotel           | 13.6 m per tile                                | 4 / 6 / 8  | porte-cochère, lit sign band, rooftop units                                        | none: downtown, cars at the kerb                   |

The parts are specified under [the storefront kit's parts](#the-storefront-kits-parts).

The fuel canopy stands 2 m off the kiosk's frontage wall and runs 10 m out
over the forecourt and 90% of the way across it, on four 0.4 m posts inset
at its corners; the two pump islands stand under it a quarter of its span
either side of centre. Every part is from the shared kit, in the chart's
colours.

### The storefront kit's parts

A commercial building is read from its car park by the parts the shared
kit stands against its street face and on its roof, chosen by kind and
level, placed in absolute metres against the road-facing wall the kit
already finds, and skipped where a building fronts no street. The body and
its glazing stay the facade's. The references and sources are in
[../game-design/features/building-detail.md](../game-design/features/building-detail.md#the-reference-library);
the figures below are the ones the kit uses, and a figure the sources did
not settle is marked as the game's own.

**On every flat commercial roof: rooftop units.** A packaged 3–5 ton unit
is 77 × 48 × 42 in on a 14 in curb (Trane Precedent; Rheem and Carrier
curbs), so each is a 1.95 × 1.22 × 1.07 m box on a 0.36 m curb, pale grey,
set back 2 m from the parapet. Retail cools at about 400 sq ft a ton
(contractors' rules of thumb, disputed 321–550), so one such unit serves
about 1,600 sq ft; the kit draws **one unit per 2,500 sq ft (232 m²) of top
floor, at most eight**, spaced along the roof's long axis, the rest of the
floor's load taken as larger units the player cannot tell apart at 40 m.
With a roof hatch, 36 × 30 in (0.9 × 0.76 m, 0.3 m tall), by the back
parapet. No screen: a unit 1.07 m tall is under the 6 ft above which codes
ask for one (NYC). A unit and its curb are one box in a pale galvanised
grey, so the top face reads light from the default pitch.

**Lit parts by day.** A cabinet sign is white in daylight whichever side the
sun is on, so the kit's lit material carries a daytime emissive floor and
rises to full at night; it is never dark grey.

**Sign bands light at night.** The kit's sign band, 0.9 m tall at 3.6 m,
becomes an internally lit cabinet: a part on the kit's own emissive
material, the stations' pattern, white by day and glowing at night on an
Active building and dark otherwise, as a window is. Letters are not drawn;
the band's length is 60% of the tenant's frontage (Brentwood CA's cap, and
the one Tempe's sign programs centre on the band), so a strip reads as a row
of tenants.

| Kind            | Parts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shop            | a **bulkhead** 0.6 m (24 in; Knoxville 18–30, NYC 12–24) dark base band along the street face; **fabric awnings** one a bay, 1.5 m out, underside 2.45 m (8 ft, Glenview, Titusville), in the accent colour, in place of the flat canopy; the lit sign band; a **cornice** 0.5 m deep (IBC 705.2 allows 24 in at 2–5 ft) and 0.45 m tall at the parapet across the street face                                                                                                                                                                                                                                                                                                                                                                |
| Shopping strip  | a **continuous canopy** 2.1 m deep (under Walnut Creek's 7 ft), underside 2.75 m (9 ft to the framing, Knoxville), 0.3 m fascia, on 0.3 m columns every 6 m (the game's own; no source), the full frontage; **tenants**: the frontage cut into bays of about 8 m, one lit sign band each, and an **anchor** at one end two bays wide with its parapet stepped up 1.2 m; a **pylon sign** at the drive mouth, 6.1 m tall (Fort Worth's 20 ft cap), cabinet 3.66 × 1.8 m (12 ft wide), on a 0.4 m pole, 1.5 m (5 ft, Chula Vista) in from the street edge, lit; rooftop units                                                                                                                                                                   |
| Supermarket     | the **entry tower**: a 6 × 4 m block at the entrance rising to 1.28 × the body height, with the parapet stepped up to 1.17 × either side of it for 12 m (the Quick Chek drawings' 23 ft 6 in main, 27 ft 6 in entry and 30 ft tower, scaled to the catalog's 4.7 m); storefront glazing on the tower's face only, on the emissive material; a **brick veneer base** 1.2 m tall, 0.1 m proud, brick red, across the street face; two **cart corrals** in the first stall row by the entrance, 3.66 × 1.52 m with 1.0 m rails and a 2.3 m sign post (DeCA, VersaCart); rooftop units by the dock side; the lit sign band                                                                                                                        |
| Restaurant      | a **drive-through**: a 3.66 m (12 ft) lane of darker paving from the lot's drive along the far side of the body to a **pickup window** with a canopy 1.8 × 2.7 m at 3.0 m (the game's own depth; Ocean View's 10 ft cap), a **menu board** 1.8 m wide × 2.1 m tall (7 ft, Santa Ana) on two posts at the head of a six-car stack (Lynnwood), a **clearance bar** at 2.74 m (9 ft) over the lane's entry, a 2.7 m (9 ft) bypass beside it (Tyler TX); a **dumpster enclosure** at the rear, 3.66 × 3.05 m (12 × 10 ft, Grand Junction, Temple) in 1.83 m (6 ft) masonry walls; awnings and the lit sign band; rooftop units. Drawn where the lot leaves the lane room; a restaurant on a lot too small for it keeps the storefront parts alone |
| Filling station | the canopy's **fascia** 0.91 m (36 in, the state bid spec) in the accent colour, its underside at 4.27 m (14 ft clearance; Medford caps 17), posts 0.4 m; **two islands** 1.2 × 3.66 m (4 × 12 ft), 0.15 m tall, 7.6 m (25 ft, Lakehurst) apart, each with two **dispensers** 0.5 × 1.0 × 1.9 m and a bollard at each end; a **price sign** at the street, a 2.4 × 1.5 m panel on a 0.3 m pole to 6.1 m (20 ft; Paramus allows 30), lit; the kiosk's awning over its door                                                                                                                                                                                                                                                                     |
| Office          | a **lobby portal** at the entrance: a glazed frame 4 m wide × 4.5 m tall projecting 1.5 m, on the emissive material, lit at night; rooftop units at levels 1 and 2; at level 3, the tower, a **mechanical screen** 3 m tall inset 2 m on the top tier (a unit taller than 6 ft is screened, NYC) with a **cooling tower** 6 × 3 × 3 m behind it, and no units                                                                                                                                                                                                                                                                                                                                                                                 |
| Hotel           | a **porte-cochère** in place of the canopy: a 0.6 m slab 6.1 m wide and 6 m deep (20 × 20 ft, Naples FL) on four 0.4 m columns, its underside at 4.27 m (14 ft clear); the lit sign band; rooftop units                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

- **Awnings and canopies.** An awning's lowest point clears 8 ft and
  projects at most 7 ft; a continuous canopy's framing clears 9 ft. A shop's
  awnings are its accent colour and a strip's canopy the white the kit's
  canopy already is.
- **Signs.** A wall sign is at most one square foot a foot of frontage,
  capped at 150 (Chula Vista, Anacortes), and the sign band's letters run 24
  in on one line; the band's 0.9 m is the two-line 30 in with its margins. A
  pylon is at most 20 ft tall and 12 ft wide with a pole at least 30% of the
  sign's width (Durham), and stands 5 ft inside the lot line.
- **The drive-through** is read as a lane with a board, a bar and a window
  canopy; a stacking space is 20 × 10 ft and a lane holds six (Lynnwood), so
  a full lane runs 37 m from the board to the window along the far side of
  the body. The lane is the lot's paving, laid by the lot layout after the
  car park in the ground it leaves, so the stalls the code asks for are
  never traded for it, and it sits in the lot's own mesh. A lot that leaves
  room for three cars (18 m) gets a short lane with the board at its head;
  one that leaves less gets no lane, no board, no bar and no window canopy,
  and the smallest restaurant never does. The dumpster enclosure stands on
  whatever rear or side ground the lot leaves, nearest the back wall.
- **The supermarket's tower** stands before the street face, so the sign
  band and the brick base run in two wings either side of it.
- **The menu board** is a 1.2 m panel on two 0.9 m posts, 2.1 m overall.
- **The supermarket's heights** are the drawings' ratios, not their feet: the
  catalog's 4.7 m body is the sim's, so the entry parapet and the tower step
  up from it by the same proportions the real store's do.
- **Colour.** Canopies, columns, corrals, the dumpster enclosure and the
  rooftop units take the kit's chart colours; the accent is the kit's red;
  the brick base is the chimney's brick; the emissive parts are white.

**What it costs.** Every commercial block stood under 400 triangles before
this; the parts add at most a few hundred (eight rooftop units are 96, a
cart corral 40, the drive-through about 120), and every kind stays under
the 1,500 block tier, held by the geometry test.

## Industrial kinds

| Kind           | Zone  | Body                                           | Height (m)       | Parts                       | Props                    |
| -------------- | ----- | ---------------------------------------------- | ---------------- | --------------------------- | ------------------------ |
| Workshop       | light | 13.6 m per tile (2×2, 3×2, 3×3)                | 6.1              | roller doors at grade       | none                     |
| Warehouse      | light | 13.6 m per tile (3×3, 4×3, 5×4)                | 7.3 / 9.8 / 12.2 | loading dock, roll-up doors | none                     |
| Factory        | light | 13.6 m per tile (2×3, 3×3, 4×3)                | 6.1 / 7.3 / 7.3  | monitor roof                | none                     |
| Flex / R&D     | light | 55% of the lot each way (2×2, 3×2, 3×4)        | 6.4 / 6.4 / 9.6  | roof array                  | none                     |
| Food plant     | heavy | 13.6 m per tile (3×3, 4×3, 5×4)                | 8 / 9 / 10       | loading dock, roll-up doors | tall stack, silo cluster |
| Chemical plant | heavy | 50% of the lot each way (3×3, 4×4, 5×4)        | 10 / 12 / 15     | tank farm behind the body   | tall stack               |
| Steelworks     | heavy | 13.6 m per tile, long and shallow (3×3 to 5×3) | 12 / 15 / 18     | monitor roof                | tall stack               |
| Paper mill     | heavy | 13.6 m per tile (3×3, 4×4, 5×4)                | 10 / 13 / 15     | monitor roof, tank farm     | tall stack               |

A warehouse's heights are the clear heights of its generation — 24, 32 and
40 ft — and the flex building's are two and three storeys; the rest are the
ceiling heights of the type (ULI: light manufacturing 14–24 ft clear, heavy
16–60 ft). A tank farm is three cylinders 6 m across and 5 m tall standing
2 m off the wall opposite the street, in the yard the body leaves behind
it; the roller doors of a workshop stand on the ground, where a warehouse's
stand on its dock. The tall stack is 12 m to the kindless works' 6. Every
other part is the shared kit's box, in the chart's colours: tanks in white
plaster like the silos.

### The industrial kit's parts

An industrial building is read from the road by the parts that do its
work: the dock it loads at, the doors it rolls up, the plant that stands
outside it. The shared kit stands them against the lot's loading side or
its street face as the kind asks, placed in absolute metres and skipped
where a building fronts no street. The body, its corrugation and its
accent stripe stay the facade's; the stack and the silo cluster stay the
props they are. The references and sources are in
[../game-design/features/building-detail.md](../game-design/features/building-detail.md#the-reference-library);
a figure the sources did not settle is marked as the game's own.

| Kind           | Parts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workshop       | the metal building: a **wainscot** 1.0 m (3–3.5 ft) in the roof's colour round every face; the roll-up doors at grade, 3.05 × 3.05 m (10 × 10 ft) for a service bay; a **walk door** 0.9 × 2.1 m (3070) beside them; a **gutter** 0.2 m (8 in box) along both eaves with a 0.13 m (5 in) **downspout** at each corner and every 6 m; a **ridge vent** 0.23 m (9 in throat) the length of the ridge                                                                                                                                                                                                                                                                                                                                                                               |
| Warehouse      | the distribution centre: the **dock bank** on the lot's loading side, doors 2.74 × 3.05 m (9 × 10 ft) at 4.3 m (14 ft) centres along the dock, each with a dark **shelter frame** 0.3 m proud (23–30 in, Serco), two **bumpers** 0.3 × 0.25 × 0.11 m and a **dock light**; the dock 1.2 m (48 in) as it is; **trailer stalls** 3.66 × 16.8 m (12 × 55 ft, Carson) striped in the truck court by the lot layout; an **office corner** at the street end: a two-storey glazed block 8 × 8 m on the lit material with a canopy at its door (a spec building's office is a glazed corner of 1–6% of its floor); **panel reveals**, a 0.1 m dark strip every 7.6 m (25 ft panels) on every face; a **parapet band** 1.0 m (3 ft, the 42 in OSHA guard rounded down) darker at the top |
| Factory        | the monitor roof's **clerestory**, a lit band 0.6 m tall along both sides of the monitor on the lit material; two **roll-up doors** 3.66 × 3.66 m (12 × 12 ft) at grade on the street face with a walk door; the wainscot and gutters of the workshop; the stack the props already raise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Flex / R&D     | an **entry canopy** 3 × 1.5 m at 3.0 m over the door; the wainscot; the roof array as it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Food plant     | the warehouse's dock bank and office corner; two **evaporative condensers** on the roof, 6 × 3.6 × 3 m (a 700-ton unit, 20 × 12 × 10 ft) by the dock side; the silo cluster as it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Chemical plant | the tank farm as it is inside a **bund wall** 1.0 m tall (the game's own height) 2 m outside the tanks; a **bullet** 3 × 15 m (a 30,000 gal LPG tank, 10 ft × 51–65 ft) on two saddles beside it; a **pipe rack** 6 m wide, two tiers, bents every 6 m at 5.5 m clear, from the tank farm to the body; a **process column** 3 m across and 1.6 × the body tall beside the body (a column runs to 150 ft; ours keeps the skyline); the stack as it is                                                                                                                                                                                                                                                                                                                             |
| Steelworks     | a **furnace** at one end of the hall: a cylinder 8 m across to 1.8 × the body (a blast furnace is 85–100 ft, two to three times a 40 ft hall) with three **stoves** 5 m across to 1.4 × the body in a row beside it and a **skip bridge**, a 1.5 m square box inclined from the yard to the furnace's top; a **duct** 1.5 m across from the furnace to the stack; the monitor roof as it is                                                                                                                                                                                                                                                                                                                                                                                      |
| Paper mill     | a **chip pile**, a cone 25 m across and 8 m tall in the rear yard where the lot has room, brown, with a **stacker**, a 1.2 m square box inclined from the yard to its crown; the monitor roof and tanks as they are                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

- **The dock moves to the loading side.** The lot layout already berths
  trucks at the side or rear; the warehouse's and food plant's dock bank
  stands on that side, and the street face carries the office corner, which
  is how a distribution centre reads from the road. A warehouse whose lot
  gives it no loading side keeps the dock on the street face as before.
- **Doors by centres, not by count.** A dock bank holds as many 9 ft doors
  as fit at 14 ft centres along its dock, a workshop one 10 ft door per 6 m
  of frontage, at most four, and a factory two.
- **Colour.** Reveals, shelter frames, bumpers and the bund are the kit's
  dark; the wainscot is the roof plate's grey; the bullet and the column are
  white plaster like the tanks; the furnace and stoves are a dark rust; the
  chip pile is bark brown; the lit parts are white on the kit's lit material
  as the storefronts' are, Active buildings only.

**What it costs.** Every industrial block stood under 400 triangles; the
heaviest kinds rise to about a thousand with their plant, inside the 1,500
block tier, held by the geometry test.

### The farmstead's parts

The farm kit above already draws the barn, the house, the silos, the bins,
the orchard and the paddock; the building-detail programme adds what each
is known by from the road, at sourced sizes:

- **The barn** is a **gambrel** of the historic dairy proportion: a 36 ft
  barn stands 29 ft, 10 ft of wall under 19 ft of loft (the San Juan Islands
  survey), so the roof's rise is 1.9 × the wall under it; a **loft door**
  1.8 × 2.1 m (6 × 7 ft, with a transom) centred in the yard-facing gable; a
  **cupola** on the ridge, two on a ridge over 32 ft, each with a tiny hipped
  cap and a louvre band and a base 1 in per foot of the ridge it serves (two
  on an 18 m ridge are 0.75 m each); **sliding doors**, two leaves
  1.8 × 3.6 m on a rail 0.2 m above them, on the yard face; white trim at
  the corners and the doors.
- **The silos** carry their **hoops**, a band every 0.76 m (the game's own
  spacing: stave silos band tighter toward the base, and the figure is not
  published) in vertex colour, so they cost no triangles; an **unloader
  chute**, a 0.6 m square shaft down the yard side with a cap 1 m tall at the
  dome's foot; the dome as it is.
- **The grain bins** take a 30° cone roof with a 0.4 m peak cap (Sukup,
  SCAFCO), and their rings read in vertex colour every 1.1 m (44 in sheets).
- **The farmhouse** is an **American foursquare** (Dallas pattern book):
  two storeys on a near-square plan, a hipped roof at 6:12 with a **front
  dormer** one bay wide, and a **full-width one-storey porch** 2.4 m (8 ft)
  deep on 0.2 m posts at 2.4 m, floor 0.45 m up on two risers. It keeps the
  house kit's trim rule, white on a dark wall.
- **An equipment shed** on a crop farm: a three-sided pole barn 12 × 6 m,
  eave 3.7 m (12 ft), posts every 3.7 m along the open side, a Galvalume
  roof, in the yard where the machinery stands.
- **The paddock fence** is 1.22 m (48 in) to its top rail, the USDA cattle
  fence, posts every 4 m as they are (12–20 ft).

**What it costs.** A farm counts everything on its lot, orchard trees
included: an orchard at 4.9 × 6.1 m spacing on a 6×7 lot holds about 370
trees at 92 triangles, so the farm tier is **40,000**, held by the geometry
test, and a crop or pasture farm stays far inside it.

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
leaves on both axes. The street is the one drawn: beside a turn bay, whose
kerb and sidewalk stand further out, the drive, the path and the lawn meet
the widened kerb, and they are laid again when a junction gains or loses its
bay. The resident's car stands on the drive, nose to the
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

**What the yard costs.** Six thousand of these stand in a Metropolis, so the
yard's parts are drawn for 40 m: the pool a twelve-sided drum (under 60
triangles), the trampoline a twelve-sided mat on six legs (under 110), the
trees and bushes at the species ceilings in
[vegetation.md](../visual-render/vegetation.md#trees). With its roof, its
cover, its car, its yard and [the kit's parts](#the-house-kits-parts), a
home on a normal lot stays under 1,300 triangles and on an acre under 1,800,
inside the house tier of
[modeling-standards.md](modeling-standards.md#geometry-budget), and the test
there holds it.

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
