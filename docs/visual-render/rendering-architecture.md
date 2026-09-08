# Rendering architecture

The render thread's own pipeline: how the Three.js scene is built, kept
cheap, and picked. For the whole application — the sim worker, the command
protocol, the React overlay, and how the three cooperate — see
[architecture.md](../engineering/architecture.md); this page only elaborates
the render-thread box in that diagram (`src/main.ts` plus `src/render/*`) and
does not repeat the parts of it that aren't about drawing.

## Renderer and scene

`createRenderer` (`src/render/scene.ts`) owns a `WebGPURenderer` that
auto-falls-back to WebGL2, sized to its container via `ResizeObserver` with
device pixel ratio capped at 2. Shadow mapping is enabled, and tone mapping is
`NeutralToneMapping` (Khronos PBR Neutral) at exposure 1.0 — chosen because
the night city's emissive values (windows, lamp heads) run past 1.0 in HDR
terms, and Neutral rolls that off into a soft glow without shifting the
daytime facade hues the way ACES would. `createWorldScene` builds the lit
`THREE.Scene` — hemisphere light, sun, fog, sky — and exposes `setTimeOfDay`;
the colour math behind it lives in the pure, GPU-free `timeOfDayColors`, kept
separate specifically so the day/night ramp is unit-testable without a
renderer. See [lighting.md](lighting.md) for what that ramp actually drives.

The render thread drives its own frame loop through
`renderer.setAnimationLoop`, independent of the sim's fixed 20 Hz tick rate —
see [architecture.md](../engineering/architecture.md#one-frame) for the full
per-frame sequence (camera, terrain/water/cloud updates, vehicle
interpolation, transit, signal phase, the bloom pass). Nothing here repeats
that ordering; this page is about what each renderer costs, not when it runs.

## Instancing: one draw call per kind, not per instance

Every repeated element in the world is one `InstancedMesh`, so placing more
of it never adds a draw call:

- **Buildings** (`BuildingInstancer`, `src/render/buildings.ts`): one
  `InstancedMesh` per catalog entry — a "bucket" — with capacity-doubling
  storage and swap-with-last removal so ids stay stable as a bucket resizes.
  A bucket with zero instances sets `mesh.visible = false` rather than
  drawing an empty instance set.
- **Vehicles, trees, props, lamps, pedestrians** each follow the same
  one-instancer-per-kind pattern in their own module (`vehicles.ts`,
  `trees.ts`, `props.ts`, `lamps.ts`, `pedestrians.ts`, and the rest of
  `src/render`).
- **Shadows are free per instance**: an `InstancedMesh` casts a shadow as a
  single draw call regardless of instance count, which is what makes it
  affordable for every small world object — lamps, shelters, pedestrians,
  vehicles, trees, buildings — to cast and receive one (see
  [lighting.md](lighting.md)).
- **The one deliberate exception** is the street-lamp ground pool: a single
  merged mesh rebuilt (and disposed) whole on each rebuild rather than
  instanced, because every vertex has to sample real terrain height — see
  [lighting.md](lighting.md) for why.
- **Frustum culling is deliberately disabled** on meshes whose instances move
  independently every frame — vehicles, service vehicles, the cloud layer,
  the sky dome and star field (`mesh.frustumCulled = false` in `vehicles.ts`,
  `servicevehicles.ts`, `clouds.ts`, `sky.ts`, `stars.ts`) — because a single
  bounding volume computed once cannot describe where a hundred independently
  moving instances actually are; three.js's default per-object culling stays
  on everywhere else. See [lod.md](lod.md) for the rest of this trade-off.

## Chunking: an edit rebuilds only its own region

Terrain and roads are split into fixed-size chunks so a single tile edit
never touches the whole map. `CHUNK_TILES = 16` tiles per chunk edge; the map
is `MAP_SIZE = 256` tiles per side, so `CHUNKS_PER_SIDE = 16` and the terrain
holds 16×16 = 256 chunks total, each a `PlaneGeometry` subdivided
`CHUNK_TILES × CHUNK_TILES`. Because a rendered corner vertex is shared by the
two chunks that meet there, editing one tile dirties both neighbouring
chunks' meshes, not just the one the tile sits in (see
[terrain.md](terrain.md) for why skipping the neighbour would show a seam).
The road mesh (`roadsmesh.ts`) follows the same per-chunk rebuild discipline,
so a drag across the map rebuilds only the chunks it actually crosses.

## Picking

Building selection is CPU-side, not a GPU id-buffer pass (that stays a
documented future option — the 24-bit RGB id codec it would need,
`encodeId`/`decodeId` in `src/render/picking.ts`, already exists and is
exercised today by the check below, not left as dead code). `IdPicker`
raycasts against every pickable `InstancedMesh` the instancer currently owns,
resolves the nearest hit's `instanceId` back to a building id via
`BuildingInstancer`'s own slot bookkeeping, then cross-checks that id against
an independently-written per-instance id-color attribute (decoded through the
same codec) before trusting the pick — two independently maintained
bookkeeping paths have to agree, or the pick is discarded as `null`.

## Bloom

The bloom pass (`src/render/bloom.ts`) wraps the plain
`renderer.render(scene, camera)` call so emissive windows, lamp heads, and
vehicle lights bleed softly at night. It is self-degrading: a failed
node-graph build or a failed first-frame render permanently falls back to a
direct scene render, and construction itself is guarded so a throw there can
never abort boot. See [lighting.md](lighting.md) for its tuning values
(radius, night-only strength) and why they're kept low.
