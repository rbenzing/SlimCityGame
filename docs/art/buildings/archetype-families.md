# Archetype families

An archetype is a recipe over one shared kit of low-poly parts — a loading
dock, a monitor roof, a roof array, a canopy, a signage band — not a bespoke
model per building. Parts are shared across archetypes, each part is a single
box, and a whole assembly stays inside its tier in
[modeling-standards.md](../modeling-standards.md#geometry-budget), which is what
keeps the kit reading consistently across a whole city. A part that hangs on
the road-facing wall (a dock, a canopy, a sign) is skipped entirely when a
building fronts no street; roof parts need no frontage and always appear.

**Residential.** A residential building's kind — the catalog's `kind`,
drawn when the lot grows (see
[../../specs/building-types.md](../../specs/building-types.md))
— decides which of two languages it speaks. The house-scale kinds (a
detached house, a duplex, a fourplex, a townhouse row) carry the house kit
below; the block kinds (a multiplex, courtyard apartments, mid-rise flats, a
tower) carry [the apartment kit](residential-kinds/the-apartment-kits-parts.md): the two
house-scale blocks under a hip roof on a car park, the two tall ones flat
on a podium. Mixed housing tints a
commercial base with a residential tint above it, because the building
carries both a shopfront and apartments. What each kind looks like is under
[Residential kinds](residential-kinds/README.md). Every house-scale home carries the
procedural house kit:

- A **pitched roof** (gable or hip) sized to the body footprint, seeded per
  building for gable-vs-hip, orientation and roof colour. Denser residential
  (apartments) and every non-residential archetype keep a flat roof instead.
- **A lot laid out from its street**: the house at the front, a drive, and a
  yard behind — see [Residential lots](residential-lots.md).
- **Massing variety**: footprint fill, eaves height, roof pitch/type, and
  wall/roof colour are all seeded per building id from a bounded variant set,
  so a residential street reads as individual homes, not clones.
- A detached home stands on the lot the land warrants — 1×1, 1×2, 2×2, 2×3
  or 3×3 — and keeps it through its three levels, which change its height and
  not its ground
  ([../specs/lots-and-land.md](../../specs/lots-and-land.md));
  a duplex and a fourplex take a half (1×1) or a normal (1×2, or 2×1 turned)
  lot and keep it at every level; a townhouse row takes one normal lot (1×2,
  or 2×1 turned) at every level and holds three homes on it, and a long
  terrace is neighbouring parcels in a run, each a run of three with side
  yards between runs.

**Commercial.** A commercial building's kind decides its archetype. A shop,
a shopping strip, a supermarket and a restaurant are **storefronts**: a canopy
over the frontage plus a signage band above it, on top of the stage-1
ground-floor storefront treatment shared by every archetype, standing in the
car park its code asks for (see [Lots and paved ground](lots-and-paved-ground.md)).
A **filling station** is a kiosk behind a **fuel canopy**: a tall flat canopy
on four posts standing off the kiosk's frontage over the forecourt, with two
pump islands under it; the forecourt is kept clear and the kiosk's parking is
beside it. An **office** is a glass block with no shopfront parts at all. A
**hotel** is a block with a canopy at its entrance and a sign band — the
storefront parts on a tall body. Offices and hotels are downtown: centred on
their lots, they draw no car park and their cars stand at the kerb. What each kind measures is under
[Commercial kinds](commercial-kinds/README.md). A commercial entry with no kind keeps
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
  [Industrial kinds](industrial-kinds/README.md)): a **workshop** is a low shed with
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
  see [lighting.md](../../visual-render/lighting.md)) stands on every plant of
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

