# Shader specification

What every custom shader in the project must do, and the conventions they share.

## There are no custom shaders

Not one. `src/` contains no `ShaderMaterial`, no `onBeforeCompile`, no GLSL
source, and no vertex or fragment shader of any kind. Every surface in the game
is a stock three.js material.

This is worth stating plainly, because the world does things that usually imply
a shader and does not use one to get them:

- **Water** — the moving surface, depth-keyed colour, shoreline foam and sun
  glint are built from layered normal maps, animated UV offsets and per-vertex
  displacement on a standard material. See [water.md](water.md).
- **Terrain** — the land-to-water ramp, the material blend between grass, rock
  and sand, and the earth cross-section at the map edge are all per-vertex
  colours baked at chunk build time. See [terrain.md](terrain.md).
- **Building windows at night** — the emissive grid is a texture and a material
  property driven per-instance, not a shader. See [lighting.md](lighting.md).

The consequence is that anything a shader would normally give you is not
available: no screen-space effects beyond the bloom pass, no per-pixel
procedural detail, no GPU-side displacement. Effects are bought with geometry
and vertex data instead, which is why the budgets in
[asset-technical-requirements.md](asset-technical-requirements.md) matter as
much as they do.

## When this document gets written

The first custom shader. At that point this file records what it does, which
uniforms it takes, how it degrades on the WebGL2 fallback path, and — the part
that actually bites — how it stays consistent with the day/night ramp that
every other material follows automatically.

Screen-space reflections and occlusion culling are rejected outright rather
than merely unbuilt; see [../DESIGN.md](../DESIGN.md).
