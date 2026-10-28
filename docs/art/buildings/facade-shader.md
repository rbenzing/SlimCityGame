# Facade shader

One procedural material drives both the day and the night look of every
building, so windows are guaranteed to align between the two:

- **Window grid**: floor count is height ÷ 3.2 m; bays come from the
  footprint. The grid is drawn in-shader as mullion lines with inset window
  cells. By day the cells tint glass-blue with a slight per-window
  reflectance variation (see [lighting.md](../../visual-render/lighting.md) for the hash that
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

