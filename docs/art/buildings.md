# Buildings

Massing, facades, roofs, archetypes and the lot a building stands on. The
proportions here all read against the [scale bible](README.md). Emissive
window behaviour at night is described in full in [lighting.md](lighting.md);
this file covers the window geometry and the day-side facade only.

## Facade shader

One procedural material drives both the day and the night look of every
building, so windows are guaranteed to align between the two:

- **Window grid**: floor count is height ÷ 3.2 m; bays come from the
  footprint. The grid is drawn in-shader as mullion lines with inset window
  cells. By day the cells tint glass-blue with a slight per-window
  reflectance variation (see [lighting.md](lighting.md) for the hash that
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
- A **garage and driveway** on low-density homes: a small attached garage box
  offset to one side, plus a driveway strip running to the road frontage,
  with presence and side seeded per building.
- A **fenced yard** on low-density and row homes: a low fence/hedge ring
  around the yard margin — the gap between the shrunk body and the tile
  edge — broken at the driveway, reading as a private lot.
- **Massing variety**: footprint fill, eaves height, roof pitch/type, and
  wall/roof colour are all seeded per building id from a bounded variant set,
  so a residential street reads as individual homes, not clones.
- Detached homes have a hard **2×2 minimum footprint** — nothing smaller ever
  builds. The first low-density level is a 2×2 with no garage; the second is
  2×3 and the third is 3×3, both with a garage. Every 2×3-or-larger detached
  lot that fronts a street gets an attached garage, a driveway strip to the
  road, and the resident's car parked on the driveway (see
  [props-and-vehicles.md](props-and-vehicles.md) — homes never park at the
  kerb or in a lot). Roof, garage and driveway all share the body's day/night
  tint; the parked car is lit like any other vehicle.

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
  [lighting.md](lighting.md)); a large industrial footprint (3×3 or bigger)
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
apron already respects.

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
see [nature.md](nature.md) for that terrain-side half of the rule.)

**Material palette calibration.** One module (`render/palette.ts`) is the
single source of truth for every material colour in the world — buildings,
vehicles and paved surfaces alike. The reference caps albedo brightness so
lighting keeps headroom: the brightest material, snow, sits at 140/142/144,
and no other material channel may exceed 144. Colours are rescaled into
range rather than clipped per channel, so hue survives the correction —
several existing materials had drifted well past the cap (a silo at
216/212/200, an AC unit at 206/210/213, a garage wall at 207/199/182, an
airport structure at 202/197/184), which is why lit roofs used to blow out.

## Construction and abandonment

A building under construction renders scaled down and grey, growing to its
full size and true colour as it completes. An Abandoned building is boarded:
its window cells go dark and its walls desaturate, and — unlike an Active
building — it stays fully dark at night, because a lit window is the one
signal that a building is Active (see [lighting.md](lighting.md)). Both
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
