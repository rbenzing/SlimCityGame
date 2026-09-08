# Asset technical requirements

The contract a piece of world geometry must satisfy to be rendered. This is the
technical half; how an asset is authored is
[../art/asset-guidelines.md](../art/asset-guidelines.md), and what it should
look like is [../art/README.md](../art/README.md).

## There is no import pipeline

Nothing is imported. There is no GLTF, FBX or OBJ loader in the project, and no
mesh files under `public/`. Every piece of world geometry is **generated
procedurally in TypeScript** at load time, from a catalogue entry plus a seed.

So "asset requirements" here means requirements on the code that builds the
geometry, not on a file an artist exports. That difference matters: a
requirement below is enforced by review and by the renderer failing visibly,
never by an importer rejecting a file.

## The instancing contract

Everything in the world is drawn through `InstancedMesh`, which imposes the
requirements that matter most:

- **One geometry per archetype, reused for every instance.** Geometry is built
  once and shared; per-instance variation comes from the instance matrix and
  per-instance colour, never from a different mesh. An asset that cannot be
  expressed that way cannot be instanced, and instancing is what the frame
  budget rests on — see
  [../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md](../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md).
- **Merge into a single geometry per archetype.** A building made of five parts
  is merged before instancing, not drawn as five children.
- **Pre-allocate.** Instance buffers are sized up front and reused. Nothing
  allocates per frame, in the render loop or the worker tick — see
  [../engineering/performance-budget.md](../engineering/performance-budget.md).

## Required vertex data

- **Vertex colour** on anything whose appearance varies across its own surface
  — terrain strata, facade banding, road paint. There are no textures doing
  this work; see [materials.md](materials.md).
- **A window-emissive mask** on any building geometry, so the night pass can
  light windows without lighting walls. A building kit that ships without one
  will look dead after dusk, and this is the requirement most easily forgotten
  because it is invisible until the first night. See [lighting.md](lighting.md).
- **An id colour** where the object must be pickable, encoded as a 24-bit RGB
  triple. See
  [../engineering/interfaces.md](../engineering/interfaces.md).

## Budgets

Geometry is low-poly by design and there is **no LOD system**, so an asset
draws its full detail at every distance — the budget is therefore a hard one
rather than something a distant tier recovers. See [lod.md](lod.md), and
[../art/modeling-standards.md](../art/modeling-standards.md) for the per-family
figures.

## Scale

Every asset obeys the scale bible at the front of
[../art/README.md](../art/README.md). A tile is 20 metres, and heights are
absolute metres rather than a fraction of the tile — an asset authored against
the tile instead of against the metre will be subtly wrong at every size.
