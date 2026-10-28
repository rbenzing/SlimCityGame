# Deferred

Two asset-upgrade paths are designed for but not built: AI-generated facade
trim-sheet atlases replacing the procedural wall/window pattern via a
per-archetype UV map (same instancer, a texture swap), and real GLTF building
kits per archetype, which would need baked window-emissive masks to keep the
night rule above. Neither touches simulation or protocol code when it lands.
No authored FBX/OBJ assets or importer, no per-archetype bespoke textures, no
interior geometry, and no LOD meshes are planned — the procedural kit is cheap
enough that distance culling is the whole LOD story. See
[DESIGN.md](../../DESIGN.md) for the backlog these belong to.
