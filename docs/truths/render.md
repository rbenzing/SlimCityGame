# Truths — Rendering and art

Back to [the index](../GROUND-TRUTHS.md).


- [R-render-001] Every repeated placeable (building, tree, prop, lamp, shelter, vehicle,
  pedestrian) is drawn through one `InstancedMesh` bucket per kind, never a
  per-object `THREE.Mesh`. Plain merged meshes are only for ground surfaces
  rebuilt whole per chunk (terrain, roads, water, lots). —
  [ADR-0006](../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md),
  [asset-guidelines.md](../art/asset-guidelines.md),
  [rendering-architecture.md](../visual-render/rendering-architecture.md)
- [R-render-002] A building turned a quarter (rotation 1 or 3) stands on its catalog
  footprint with width and depth swapped. Whatever places it on the map —
  its centre, its pad, its bays, its road-facing edge — uses that turned
  footprint (`footprintForRotation`, shared by the sim and the renderer);
  only the body's own box, sized before the rotation is applied, keeps the
  catalog's axes. — `src/shared/footprint.ts`, `src/render/buildings.ts`
- [R-render-003] Picking is a CPU raycast against the instanced mesh cross-checked against a
  24-bit RGB id colour per instance, never a per-object mesh. —
  [ADR-0006](../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md);
  `src/render/picking.ts`
- [R-render-004] Nothing on the ground is a mesh per building. Terrain, roads and lot paving
  are each batched one mesh per 16-tile chunk and a chunk is rebuilt when
  something in it changes; a renderer that adds a `THREE.Mesh` per lot or per
  building puts thousands of draw calls into the overview, which is how the
  first frame measurement found the lots. Every building, part and prop is
  an instance in a shared bucket, and every piece of geometry has a triangle
  ceiling the geometry test holds. —
  [modeling-standards.md](../art/modeling-standards.md#geometry-budget);
  `src/render/geometrybudget.test.ts`, `tools/frame-budget.mjs`
- [R-render-005] No custom shaders: no `ShaderMaterial`, GLSL or `onBeforeCompile`. Effects
  come from stock materials, TSL node graphs on `MeshStandardNodeMaterial`,
  vertex colour and instance colour. — [shaders.md](../visual-render/shaders.md),
  [asset-guidelines.md](../art/asset-guidelines.md)
- [R-render-006] Nothing is textured or imported: no image textures on world surfaces beyond
  the sun/moon disc, the cloud puff and the map pin, and no GLTF, FBX or OBJ
  loader. Every asset is a TypeScript function of (catalog entry, seed). —
  [texture-standards.md](../art/texture-standards.md),
  [asset-guidelines.md](../art/asset-guidelines.md)
- [R-render-007] Per-instance variation is only a transform and a colour (`setMatrixAt`,
  `setColorAt`), never new topology. One merged geometry per archetype; a
  multi-colour shape uses a region-mask vertex attribute inside one geometry,
  not child meshes. A new material is a new draw batch, so reach for vertex or
  instance colour on an existing one first. —
  [modeling-standards.md](../art/modeling-standards.md),
  [materials.md](../visual-render/materials.md)
- [R-render-008] Slot pools grow by doubling and recycle free slots; live slots are never
  compacted or renumbered, and nothing allocates per frame. —
  [asset-guidelines.md](../art/asset-guidelines.md); `src/render/massing.ts`
- [R-render-009] `frustumCulled = false` only on meshes whose instances move every frame
  (vehicles, clouds, sky, stars); default culling stays on everywhere else. —
  [rendering-architecture.md](../visual-render/rendering-architecture.md)
- [R-render-010] `CHUNK_TILES` is 16, and a tile edit dirties every chunk sharing the edited
  corner vertex, never just its own. A road tile's drawn cross-section reads
  its run out to `SECTION_REACH_TILES`, so a road or junction-control change
  rebuilds every road chunk within that reach along both axes, plus the tile
  that bends to meet it; rebuilt alone, a turn bay opened by a new signal
  drew a notch at the chunk seam. —
  [rendering-architecture.md](../visual-render/rendering-architecture.md),
  [terrain.md](../visual-render/terrain.md); `SECTION_REACH_TILES` in
  `src/shared/approachzone.ts`, `chunksReading` in `src/render/roadsmesh.ts`
- [R-render-011] There is no LOD, no particle or VFX system and no animation system; anything
  that moves is a transform written per frame. — [lod.md](../visual-render/lod.md),
  [vfx.md](../visual-render/vfx.md), [animation.md](../visual-render/animation.md)
- [R-render-012] A render file needing a hash copies the local `hash1` function byte for byte
  and never imports it from a shared module; all variation hashes an id, a tile
  coordinate or a caller-owned deterministic clock. —
  [naming-conventions.md](../art/naming-conventions.md),
  [asset-guidelines.md](../art/asset-guidelines.md)
- [R-render-013] A storey is `FLOOR_HEIGHT_METERS` (3.2 m); floor count is height ÷ storey and
  a taller catalog height reads as more storeys, never a stretched box. The
  ground-floor band is the first storey. A kit whose plan states its own
  floor to floor draws its floors at that and says so: the hospital's six
  storeys are 4.5 m, the low end of the 14 ft 8 in–16 ft inpatient floors run
  in a project record ([City of Naples](https://www.naplesgov.com/media/98066),
  a single source), and its parking deck's two 3.35 m (11 ft). —
  [buildings.md](../art/buildings.md),
  [modeling-standards.md](../art/modeling-standards.md),
  [props-and-vehicles.md](../art/props-and-vehicles.md)
- [R-render-014] Scale anchors are absolute metres: cosmetic car 4.0 × 1.8 m, pedestrian
  1.75 m, fire appliance 10 m, garbage truck 9 m, standard lane 3.75 m, footway
  1.875 m. A person beside a car reaches just above its roof. —
  [art/README.md](../art/README.md), [civic-massing.md](../art/civic-massing.md),
  [props-and-vehicles.md](../art/props-and-vehicles.md)
- [R-render-015] A civic building's footprint and height derive from occupant-load arithmetic
  shown in its plan, never guessed; it goes up rather than out beyond about six
  tiles, and it is identifiable at the default camera pitch without its label by
  the part that does its work (bay doors, entrance, plant, grounds). —
  [civic-massing.md](../art/civic-massing.md)
- [R-render-016] A farm counts as industry and is never drawn as industry. Every renderer
  that dresses industry — lot pad, setback tiers, roof props and stacks,
  parking bays and kerb cars, the facade — asks `isFarmEntry` first. A farm's
  pickable body is its barn walls, placed by the one farm plan (`planFarm`)
  that the ground, the instancer and the kit all read, so the roof sits on the
  barn and the silo stands in its yard. — [buildings.md](../art/buildings.md);
  `src/render/archetypes.ts`, `src/render/farmlot.ts`
- [R-render-017] A utility kit that paves its whole lot (`pavesLot`: the recycling depot, the
  recovery facility, the transfer station, the hospital) stands on the highest ground under
  the lot, never its centre, and its yard carries a footing down to the low
  side. The
  instancer's plinth, seated on the highest ground under the smaller body, then
  always lies under the yard; a kit seated at its centre on a slope lets the
  plinth show through. — `src/render/utilitykits.ts`
- [R-render-018] Every surface colour resolves through `src/render/palette.ts`; no channel
  exceeds `MAX_MATERIAL_CHANNEL` (140) except snow (144), saturated accents stay
  at or below 102, and vehicle paint is the sole exemption. —
  [texture-standards.md](../art/texture-standards.md)
- [R-render-019] Emissive appears only on a real light source (night windows, luminaires,
  vehicle lights, beacons) because the bloom pass picks up everything emissive.
  Only an `Active` building lights its windows; an `Abandoned` one stays dark at
  every hour. — [materials.md](../visual-render/materials.md),
  [lighting.md](../visual-render/lighting.md)
- [R-render-020] Every sunlit material reads correctly at every hour of the single day/night
  ramp; night tinting rides the ramp, never a second dark material. No
  transparency without a reason; water and the additive lamp pool are the
  exceptions. — [materials.md](../visual-render/materials.md),
  [lighting.md](../visual-render/lighting.md)
- [R-render-021] A building stays legible at night and the night stays night: a body at
  full night reads at 18 to 30% of its noon brightness and the ground at 12
  to 25%, every sunlit surface — bodies, kit parts, terrain, roads, lots,
  trees — carrying the one shared night tint, and the sky's night light and
  the tint tuned as one, never each dimming the scene on its own. Only
  window panes and a kit's lit parts glow, and a lit pane keeps its colour
  rather than clipping to white; a garage door, porch, roof or wall never
  glows. — [lighting.md](../visual-render/lighting.md); `NIGHT_TINT` in
  `src/render/nightlook.ts`, measured by `tools/nightlook-shots.mjs`
- [R-render-022] Anything laid on the ground (pad, apron, driveway, bay, lamp pool, grid)
  samples real terrain height per vertex and splits on the terrain's own
  diagonal. — [buildings.md](../art/buildings.md),
  [lighting.md](../visual-render/lighting.md), [streets.md](../art/streets.md)
- [R-render-023] Every building levels its footprint when it is placed, grown or plopped,
  spawn or level-up: the footprint's own vertices and the far-edge vertices
  open ground owns, never one a road, another building or water owns. A body
  and everything that stands with it (podium, roof props, kit, a home's
  parts) is seated on the highest ground under the body's own rectangle
  through `maxHeightUnderBody`, never under the whole footprint. A grown
  house on a hillside hung over its downhill side, and a works' dock floated
  over its car park, until both held. —
  [terrain.md](../visual-render/terrain.md#levelling-under-structures),
  [buildings.md](../art/buildings.md#lots-and-paved-ground);
  `computeFlattenPatch` in `src/sim/worker.entry.ts`, `src/render/footprint.ts`
- [R-render-024] A data lens paints tile (x, z) over tile (x, z): the lens texture's column x
  and row z are that tile, so the quad's u runs with world x and its v with
  world z, set from its own positions. Built on a rotated plane's stock UVs,
  every lens drew its data mirrored north to south, and the power lens showed
  a powered street as dark ground. —
  [architecture.md](../engineering/architecture.md); `OverlayRenderer` in
  `src/render/overlays.ts`
- [R-render-025] No wild tree stands on a tile holding a grid road, a road off the grid's
  footprint, or a building. It is read from the mirror whenever roads, the
  network or buildings change, never from the commands that laid them:
  trimmed by command, a curve kept every tree it was laid through and a
  loaded city regrew a tree on every road. A home's yard trees are its own
  kit, planted clear of its house, drive and furniture. —
  [vegetation.md](../visual-render/vegetation.md); `occupiedTiles` in
  `src/app/clientgrid.ts`
- [R-render-026] A home faces the street it fronts: its lawn runs across the verge to the
  sidewalk, its front wall stands 5.5 m behind the sidewalk (never outside its
  lot), its door faces the street, and a drive — dirt or concrete — crosses
  the sidewalk and verge to the carriageway. Its car stands on that drive,
  never at the kerb. A home that fronts no street has no drive and no car.
  The street it fronts is the one bordering the most of its edge, so a home
  on a bend or beside a cul-de-sac faces the street it runs along; ties go
  north, east, south, west. —
  [buildings.md](../art/buildings.md#residential-lots); `findRoadFacingEdge` in
  `src/shared/roadedge.ts`
- [R-render-027] A kerb takes cars at any hour only where the street paints a parking lane on
  that side; a street whose tier allows parking but paints no lane takes short
  daytime stays and nothing overnight; every other road takes none. No car
  stands inside a junction's no-parking setback. —
  [props-and-vehicles.md](../art/props-and-vehicles.md#parked-cars-and-lot-life),
  [road-model.md](../world-sim/road-model/furniture-and-what-gates-it.md)
- [R-render-028] Nothing kerbside stands on a tile with road on both axes (manholes excepted);
  one prop per kerbside slot; everything beside a road measures from
  `curbWidthMeters`. A road-facing kit part is skipped when a building fronts
  no street. — [streets.md](../art/streets.md),
  [props-and-vehicles.md](../art/props-and-vehicles.md),
  [buildings.md](../art/buildings.md)
- [R-render-029] A vehicle mesh's nose is at +Z, yaw is `atan2(dx, dz)`, and cars sit in their
  right-hand lane by a tier-derived half-lane offset. —
  [props-and-vehicles.md](../art/props-and-vehicles.md)
- [R-render-030] Road paint is true-world scale, and dash and sleeper phase are taken from
  global world coordinates, never the tile or the chunk; the line figures are
  in the roads section above. — [streets.md](../art/streets.md),
  [road-model.md](../world-sim/road-model/README.md)
- [R-render-031] Wherever visual time is derived, add `CLOCK_START_OFFSET_TICKS` (tick 0 is
  09:00) and run on `VISUAL_DAY_TICKS`, never the calendar day. —
  [lighting.md](../visual-render/lighting.md)
- [R-render-032] Render work is done only when a screenshot from a real browser has been looked
  at; passing tests and read-backs are necessary, never sufficient. —
  [testing.md](../engineering/standards/testing.md),
  [debugging.md](../engineering/standards/debugging.md)
- [R-render-033] UI colours come only from the `@theme` tokens in `src/ui/styles.css`, never a
  hardcoded hex; every icon is the `Icon` component (viewBox 24, 1.8 stroke,
  `currentColor`, `aria-hidden`); no emoji in finished chrome. —
  [ui-style-guide.md](../art/ui-style-guide.md),
  [iconography.md](../art/iconography.md)

