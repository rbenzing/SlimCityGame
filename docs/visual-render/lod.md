# Level-of-detail specification

How rendered detail changes with distance from the camera.

## There is no LOD system

`src/` contains no LOD implementation — no `THREE.LOD`, no distance-switched
geometry, no imposters. Every building, tree, vehicle and prop draws its full
geometry at every distance, from the closest zoom to the widest shot.

This is deliberate for now rather than an oversight. The render budget is met
by **instancing and frustum-culled chunks**, not by reducing detail: the world
is low-poly enough that a distant building costs little, and the draw-call
count — which is what actually constrains the frame — depends on the number of
instanced batches rather than on the triangles inside them. See
[../engineering/performance-budget.md](../engineering/performance-budget.md)
and [rendering-architecture.md](rendering-architecture.md).

Occlusion culling and screen-space reflections are rejected outright, with
reasoning, in [../DESIGN.md](../DESIGN.md). LOD is not rejected — it is simply
not needed yet, and [../ROADMAP.md](../ROADMAP.md) records it as something to
add if profiling ever demands it.

Simulation detail does not vary with distance either; the simulation has no
notion of the camera at all. See
[../world-sim/lod-strategy.md](../world-sim/lod-strategy.md).

## When this document gets written

When a profile shows geometry, rather than draw calls, is the constraint —
most likely at a larger map size or a denser downtown than anything built so
far. The decisions to record then: which archetypes get reduced meshes, the
switch distances, whether an imposter billboard replaces the far tier, and how
a switch avoids popping under the RTS camera's continuous zoom.
