# Shader specification

What a surface may use to get an effect, and what it may not `[R-render-005]`.

## No shader source, node graphs allowed

`src/` contains no `ShaderMaterial`, no `onBeforeCompile` and no GLSL or WGSL
source. Every surface is a stock three.js material or a
`MeshStandardNodeMaterial` whose inputs are TSL node graphs: arithmetic on
position, vertex colour, instance colour, time and a few uniforms.

Where a node graph does the work a shader usually would:

- **Water** — the swell that moves the surface, the waves that tilt its
  light, foam, sky reflection, the bent and dimmed bed and the sun glint are
  one node graph with no image texture. See [water.md](water.md) and
  [the water surface](../specs/water-surface.md).
- **Night** — surfaces take one night tint through a shared uniform node
  (`nightTintNode`). See [lighting.md](lighting.md).
- **Terrain** — the blend between grass, rock and sand, the bed's sand and
  silt, and the earth cross-section at the map edge are per-vertex colours
  baked at chunk build time. See [terrain.md](terrain.md).

## What a node graph keeps to

- It reads no image texture on a world surface `[R-render-006]`.
- The water's graph mirrors pure TypeScript functions (`src/shared/waves.ts`,
  `src/render/waterlook.ts`) term for term, and tests pin those functions; a
  value another system needs is read from the function, never from the GPU.

## Screen-space effects

Bloom is the only effect over the finished frame; with it off the frame is
drawn through a pass of the scene alone. The water reads the frame behind
it once, colour and depth, to show the bed. Screen-space reflections and
occlusion culling are rejected outright rather than merely unbuilt; see
[../DESIGN.md](../DESIGN.md).
