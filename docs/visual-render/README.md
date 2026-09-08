# Rendering

How SlimCity draws the world: the Three.js pipeline that turns simulation
state into pixels. This folder is about the RENDER PIPELINE — instancing,
chunking, draw calls, picking, the day/night lighting rig, terrain, water,
vegetation, materials, and level of detail. It is not about what things look
like as design decisions (massing, facades, road paint, the vehicle kit) —
that visual language lives in [art/](../art/README.md) — and it is not the
whole application (the sim worker, the command protocol, the React overlay)
— that map is [engineering/architecture.md](../engineering/architecture.md).
Where a fact would overlap one of those, this folder links out rather than
repeats it.

## What's in this folder

| File                                                   | Covers                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [rendering-architecture.md](rendering-architecture.md) | Instancing, chunking, draw-call discipline, and picking — the render thread's own pipeline.      |
| [lighting.md](lighting.md)                             | The day/night ramp, emissive windows, street lamps, bloom, and the clock that drives them.       |
| [terrain.md](terrain.md)                               | Ground shaping, the map-edge cross-section, and the sky dome/sun/moon/clouds above it.           |
| [water.md](water.md)                                   | Seabed shading, shoreline foam, surface animation, sky reflection, sun glint.                    |
| [vegetation.md](vegetation.md)                         | Tree species, placement and colour, and the vertex-coloured ground cover under them.             |
| [materials.md](materials.md)                           | The palette-calibration standard every building, vehicle and paved surface passes through.       |
| [lod.md](lod.md)                                       | What level-of-detail and culling actually exist, and why a bespoke LOD system isn't one of them. |

Delivery status and the deferred backlog are not this folder's job: see
[ROADMAP.md](../ROADMAP.md) and [DESIGN.md](../DESIGN.md). What the simulation
does, as opposed to how it is drawn, is in [SPEC.md](../README.md) and
[world-sim/](../world-sim/README.md).
