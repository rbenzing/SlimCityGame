# Material specification

What every surface in the world is made of, and the rules a new material must
follow to sit alongside the existing ones.

## Everything is a stock three.js material

There are no custom shaders — no `ShaderMaterial`, no GLSL, no
`onBeforeCompile` anywhere in `src/`. Every surface uses a standard three.js
material, and the variety in the world comes from three things layered on top
of it:

- **Per-vertex colour**, which does most of the work. Terrain, ground cover,
  the map-edge strata, road paint and building facades are all vertex-coloured
  at build time rather than textured. See [terrain.md](terrain.md) and
  [vegetation.md](vegetation.md).
- **Per-instance colour**, which is how one archetype's geometry produces a
  street of buildings that are not identical. See
  [../art/buildings.md](../art/buildings.md).
- **Emissive**, driven by the day/night ramp — the one material property that
  changes at runtime on almost everything. See [lighting.md](lighting.md).

The consequence worth stating: a material's appearance is decided by the
geometry that carries it, not by the material itself. Two buildings sharing a
material differ because their vertex and instance colours differ. This is what
lets the whole city draw in a handful of batches — see
[rendering-architecture.md](rendering-architecture.md).

## The rules a material must follow

- **Share, do not multiply.** A new material means a new draw batch. Reach for
  vertex or instance colour on an existing material before creating one.
- **Respond to the ramp.** Every material the sun lights must read correctly at
  every hour, not just at noon. A material tuned only in daylight will look
  wrong for half of every game day.
- **Emissive means "lit from within".** It is reserved for surfaces that are
  actually a light source — windows at night, lamp luminaires, vehicle lights —
  because the bloom pass picks up everything emissive and a stray emissive
  surface glows for no reason.
- **No transparency without a reason.** Sorting transparent surfaces costs
  more than the effect is usually worth. Water is the deliberate exception.

## Palette

Colour values are calibrated per family rather than chosen per asset — the
figures live with the assets that use them, in
[../art/texture-standards.md](../art/texture-standards.md) and the individual
art documents. The DOM overlay has its own separate palette, owned by
`src/ui/styles.css` and documented in
[../art/ui-style-guide.md](../art/ui-style-guide.md); the two are deliberately
independent, since one is lit by a simulated sun and the other is not.
