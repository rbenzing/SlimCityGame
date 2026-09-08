# Prefab standards

How reusable composed objects are structured, versioned and reused.

## There are no prefabs

A prefab is an editor concept — a saved object graph an artist assembles and
drops into a scene. This project has no editor and no scene graph an artist
touches. Every object in the world is **generated procedurally in TypeScript**
at load time, from a catalogue entry plus a seed. See
[asset-guidelines.md](asset-guidelines.md).

The nearest equivalents, and what each actually is:

- **Catalogue entries** (`src/data/catalog.json`) — data, not objects. A row
  says what a building is worth, what it costs, its footprint and its unlock
  milestone. It carries no geometry. See
  [../engineering/data-model.md](../engineering/data-model.md).
- **Archetypes** (`src/render/archetypes.ts`) — the code that turns a catalogue
  entry plus a seed into geometry. The closest thing to a prefab, except it is
  a function rather than a saved asset, and two buildings of the same archetype
  differ because their seeds differ.
- **Kits** (`src/render/buildingkit.ts`, `houses.ts`) — the shared parts an
  archetype composes from: masses, roofs, canopies, signage bands. These are
  the reusable units, and they are functions returning geometry.

So the reuse this document would govern is real, but it lives in code and is
reviewed as code. The conventions that apply to it are in
[asset-guidelines.md](asset-guidelines.md) and
[modeling-standards.md](modeling-standards.md).

## When this document gets written

If the project ever gains an authored-asset pipeline — imported meshes with
attached metadata, or a data-driven composition format an artist edits without
writing TypeScript. [../ROADMAP.md](../ROADMAP.md) records GLTF building kits
as a possible later path; that would be the moment this file has something to
say.
