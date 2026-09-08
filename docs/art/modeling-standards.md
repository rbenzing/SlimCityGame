# Modeling standards

Geometry budgets, topology, and scale for procedural assets — the
constraints an `archetypes.ts`/`buildingkit.ts`/`houses.ts`-style function
has to respect. See [asset-guidelines.md](asset-guidelines.md) for how
that code is structured; this page is what it has to stay within.

## Scale

[README.md](README.md) — the scale bible — is the authority on
proportion: the 4.0 m × 1.8 m cosmetic car as the human-scale anchor,
`TILE_METERS = 20`, and the road cross-section table. Nothing here
restates those numbers; two derived rules worth stating explicitly because
they govern every building kit:

- **Floor count is height ÷ 3.2 m.** A catalog entry's `height` is not a
  free-floating number — a taller entry is meant to read as more storeys,
  not one box stretched taller with the same window band. See
  [buildings.md](buildings.md) for the facade shader that draws this grid.
- **Footprints are in tiles; kit-part dimensions are in real metres.** A
  catalog entry's `footprint: { w, d }` is tile counts and scales with
  `TILE_METERS`; everything `buildingkit.ts`/`houses.ts` place on top of
  that footprint (a dock's depth, a garage's width, a canopy's thickness)
  is a named metre constant that does **not** rescale with the tile — see
  the scale bible's own reasoning for why lane and vehicle sizes are the
  same real-world rule.

## Geometry budget

A kit part is one box: 12 triangles. A full archetype assembly composes
at most a handful of parts (`partsFor` never returns more than two — see
`archetypes.ts`), so a whole building's kit dressing stays under a hundred
triangles. This is deliberately far under any commonly-cited per-mesh
vertex cap (a 65,536-vertex limit, for instance) — that number is never
the binding constraint here. The actual limiting factor is the **merged
ground geometry** each renderer batches per chunk (terrain, roads, lots),
not per-building instance count, since every building instance shares one
`InstancedMesh` bucket per shape regardless of how many exist (see
[asset-guidelines.md](asset-guidelines.md)).

## Topology

- **Boxes, not organic forms.** Every procedural part — a body mass, a
  dock platform, a monitor roof, a garage — is an axis-aligned box (or a
  small merge of a few), placed and rotated with the building's own
  footprint frame. Nothing in the kit sculpts curved or freeform geometry.
- **Merged multi-part geometry where a single shape needs internal colour
  variation.** The vehicle kit (`src/render/vehicles.ts`, covered in
  [props-and-vehicles.md](props-and-vehicles.md)) merges a body slab, a
  darker cabin/window mass, and wheel cylinders into one `BufferGeometry`
  per kind, carrying a region-mask vertex attribute so the per-instance
  tint colours only the body vertices while windows and wheels keep their
  own fixed colours. This is the pattern to follow whenever one instanced
  shape needs more than one material region without spending a second
  draw call on it.
- **Per-instance variation is a transform and a colour, never new
  topology.** A roof's pitch, a wall's hue jitter, a building's
  construction-height scale — all move or recolour the same fixed
  geometry (`setMatrixAt`/`setColorAt` on the shared `InstancedMesh`), so
  variety never costs an extra vertex.

## What this document does not cover

Archetype-specific proportions (how tall a monitor roof sits, how a
warehouse's dock is sized against its frontage) belong to
[buildings.md](buildings.md), [streets.md](streets.md), and
[props-and-vehicles.md](props-and-vehicles.md), not here — this page is
the budget and the topology rule those files' specifics have to satisfy,
kept apart so it does not repeat with every new archetype.
