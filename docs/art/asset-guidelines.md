# Asset guidelines

**Everything in SlimCity is procedural geometry built in code.** There is
no imported-mesh pipeline: no GLTF, no FBX, no OBJ, and no
`GLTFLoader`/`FBXLoader`/`OBJLoader` anywhere in `src/`. An asset is a
TypeScript function that returns geometry from a catalogue entry plus a
seed, not a file an artist exports from a modelling tool. This is the one
fact to internalise before anything else here makes sense — see
[prefab-standards.md](prefab-standards.md) for what stands in for a prefab
under this model, and [../ROADMAP.md](../ROADMAP.md) for GLTF building
kits as a possible later path, not a current one.

## How a building is actually authored

Three layers, each a plain function:

1. **`archetypeFor(entry)`** (`src/render/archetypes.ts`) reads a
   `BuildingCatalogEntry` — category, zone, level, whether it actually
   pollutes — and returns one of eight `BuildingArchetype`s (`warehouse`,
   `factory`, `greenWorks`, `storefront`, `retailBlock`, `house`,
   `apartment`, `plain`). It is pure: the same entry always yields the
   same archetype, with no scene, no seed, and no randomness involved, so
   archetype choice is unit-tested without rendering anything.
   `isCleanIndustry` is the deciding case worth calling out: whether an
   industrial building gets the "clean" silhouette (a roof array, no
   stack) is read from whether it actually emits pollution, not from its
   name or its level — the silhouette is tied to the simulated property it
   represents, so a building with no stack is a building the sim treats as
   emitting nothing.
2. **`partsFor(entry)`** maps an archetype to the kit parts it hangs
   (`loadingDock`, `rollUpDoors`, `monitorRoof`, `roofArray`, `canopy`,
   `signageBand`) — also pure, also just a table lookup.
3. **`computePartPlacements`** (`src/render/buildingkit.ts`) turns that
   part list into actual box placements in world metres, against the
   building's own setback boxes and its road-facing side. Residential
   buildings get a parallel kit in `src/render/houses.ts` — a pitched
   gable roof on every detached/row home, plus a garage and driveway on
   larger detached lots — computed the same way: pure functions of
   `(entry, buildingId[, roadAt])`, no `Math.random`, no `Date.now`, so a
   house's roof pitch and colour are the same on every reload of the same
   save.

Every dimension is a named constant in metres (`DOCK_DEPTH_M = 2.6`,
`GARAGE_WIDTH_METERS = 4.2`, and so on) rather than a tile-relative
fraction picked by eye — see [modeling-standards.md](modeling-standards.md)
for the budget these compose into and [README.md](README.md) for the
scale they are measured against.

## The InstancedMesh contract every asset has to satisfy

Per ADR-0006 (rendering is `InstancedMesh` everywhere), a renderer never
creates one mesh per object. The shared pattern (`InstancedSlotPool` in
`src/render/massing.ts`, reused by `buildingkit.ts`, `houses.ts`, and
`props.ts`; `BuildingInstancer` in `buildings.ts` implements the same idea
directly) is:

- One `InstancedMesh` **bucket** per shape family (one per catalog entry
  for building bodies; one per kit part type for kit geometry), built at a
  starting capacity and grown by doubling when it fills.
- **`allocate()`** hands back a slot index — a recycled one from a
  `freeSlots` pool if one exists, otherwise the next unused index (growing
  the mesh first if necessary) — ready to receive `setMatrixAt`/
  `setColorAt`.
- **Removal is swap-with-last**: freeing a slot returns its index to
  `freeSlots` rather than compacting the array, so every live id keeps
  resolving to a stable, contiguous slot without a renumbering pass.
- **Picking rides the same instance**: each instance's id is encoded as a
  24-bit RGB colour (`encodeId`/`buildIdColorArray`, `src/render/
picking.ts`) alongside its transform, so a click resolves to a building
  by raycasting the instanced mesh and decoding the colour it hit — no
  per-object mesh to raycast separately. See
  [../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md](../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md)
  for the target architecture and what has actually shipped of it.

Any new asset has to fit into an existing bucket or justify a new one —
there is no path to a one-off mesh that skips this contract.

## Constraints that follow from being procedural

- **No custom shaders.** No `ShaderMaterial`, no raw GLSL, no
  `onBeforeCompile` anywhere in `src/`. Effects use standard three.js
  materials (`MeshStandardNodeMaterial` with TSL node graphs for things
  like per-instance night-tinting) plus per-vertex colour — see
  [../visual-render/shaders.md](../visual-render/shaders.md).
- **No LOD system.** Every instance renders at full detail regardless of
  distance — see [../visual-render/lod.md](../visual-render/lod.md).
- **No animation system.** No `AnimationMixer`, no `AnimationClip`, no
  `SkinnedMesh`. Anything that appears to move is a transform written per
  frame by the renderer itself (a vehicle advancing along its route, the
  sun's position, the water surface), not authored motion played back —
  see [prefab-standards.md](prefab-standards.md) and
  [../visual-render/animation.md](../visual-render/animation.md).
- **Deterministic, seeded variation only.** Where a building needs
  per-instance variety (roof colour, hue jitter, roof-pitch angle), the
  code hashes the building's own id through a small local `avalanche`
  function (`hash1`, deliberately re-declared in every `render/*.ts` file
  that needs it rather than imported from one shared module — see
  [naming-conventions.md](naming-conventions.md)) rather than calling
  `Math.random()`. The same building always looks the same way on every
  reload of the same save.
- **The calibrated material palette is the only colour source for
  surfaces.** `src/render/palette.ts`'s `MATERIALS` table is measured sRGB
  values, not artist-picked hex; see
  [texture-standards.md](texture-standards.md) for the calibration rule
  itself and why the ceiling matters for lighting headroom.

Anywhere this document would normally hand off to a mesh-import checklist
or a rig-export step, there is nothing to say instead — see
[../DESIGN.md](../DESIGN.md) for what is deliberately not built.
