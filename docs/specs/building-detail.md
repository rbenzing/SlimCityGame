# Building detail

- **Status:** Built

**Owns:** how every zoned building and ploppable is drawn as the real US type it is: the part system, the recipes, the triangle tiers and the frame measurement. It changes no sim figure, lot or save byte. The reference library and per-kit records are [the sources](../sources/building-detail.md).

**Rules:**

- Draw every kind as the thing it is: the four to six parts that identify it at about 40 m, at measured size, nothing at doorknob scale. `[R-render-014]` `[R-render-015]`
- Make a variant a part in a slot on one body, never a new body; seed it from the building id. `[R-render-007]`
- Draw parts as instances in shared buckets with growing pools; ground paving is one merged mesh per chunk. `[R-render-001]` `[R-render-004]` `[R-render-008]`
- Use boxes, lathes and merged low-poly geometry on stock materials: no textures, no imported models, no custom shaders, no LOD. `[R-render-005]` `[R-render-006]` `[R-render-011]`
- Keep the lot inside its tier, counting everything on it: house 3,000, block 1,500, ploppable 30,000 triangles. `[R-render-004]`
- Place window-framing parts on `windowGrid`, so geometry and the facade material never disagree. `[R-render-013]`
- Light only window panes and a kit's lit parts, and only while Active; a porch, garage door, roof or wall never glows. `[R-render-019]` `[R-render-021]`
- Run `tools/frame-budget.mjs` before and after every slice and look at the screenshots. `[R-render-032]`

**Numbers:** the figures of each reference type are in [the library](../sources/building-detail.md#the-reference-library).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| House tier (detached, duplex, fourplex, townhouse row), the whole lot | 3,000 | triangles | dial, `geometrybudget.test.ts` |
| Block tier (every other zoned kind) | 1,500 | triangles | dial |
| `TALL_TIER` (midrise, tower) | 4,000 | triangles | dial |
| Ploppable `KIT_TIER` | 30,000 | triangles | dial |
| Farm tier | 40,000 | triangles | dial |
| `BUS_STOP_CEILING` | 500 | triangles | dial |
| House ceilings, normal lot / acre | 1,300 / 1,800 (built 894 / 1,370) | triangles | dial |
| Home on a normal lot / acre, yard ceilings | under 900 / under 1,500 | triangles | dial |
| Species ceilings | broadleaf 100, pine 40, poplar 50, shrub 30 | triangles | [vegetation](../visual-render/vegetation.md#trees) |
| Pool / trampoline ceilings | under 60 / under 110 | triangles | [buildings](../art/buildings/residential-lots.md) |
| Solar farm | under 2,000 (built 1,944; a row 84) | triangles | dial |
| Water tower, the bar | about 2,500 | triangles | measured |
| Fence panel cut / post spacing on the solar lot | 5 / 10 | m | dial |
| Solar row posts | every 6 m | m | dial |
| Frame before any detail, laptop GPU | 23–38 | ms | measured |
| Overview calls at the measurement / after the performance slice | 4,118 / 1,125 against the oblique's 389 | calls | measured |
| City triangles over the empty map's 8.4 M | 19–26 | M | measured |
| Performance slice result | calls down by half to two-thirds, 10 M fewer triangles, 2–3 ms | — | measured |
| Synthetic Metropolis | about 9,000 zoned buildings, ~10,000 with kits, built in about 80 | s | dial |
| Frame statistic | 95th percentile of eight-frame averages | frames | dial |
| Night body band | 30–50% of noon, at 03:00 and midnight | % | `tools/nightlook-shots.mjs` |
| Roof pitch, level 1 / levels 2 and 3 | 5:12 (0.42) / 8:12, rise under 4.5 | m | [house parts](../art/buildings/residential-kinds/the-house-kits-parts.md) |
| Window grid | two columns a tile, a row a storey; 9.5 m face = three bays of 3.17 m | m | `windowGrid` |
| Porch | 1.8 m deep, floor 0.6 m up on three risers | m | `houselot.ts` |
| Colonial chimney over ridge | 0.6 | m | `houselot.ts` |
| House body / block body | 4.75 m a lot tile / 13.6 m | m | sim sizes, never moved |
| Awning underside / canopy underside | 2.45 / 2.75 | m | [storefront parts](../art/buildings/commercial-kinds/the-storefront-kits-parts.md) |
| Pylon height / inside the lot line | 6.1 / 1.5 | m | same |
| Supermarket tower | 1.28 × the body | ratio | same |
| Rooftop unit | one per 232 m² of the top plate, at most 8, 2 m inside the parapet | m² | dial |
| Drive-through lane room | 3.66 | m | [Wasco, Elk Grove](../sources/building-detail.md#commercial) |
| Strip tenant bay | about 8 | m | dial |
| Trailer stall / dock door centres | 3.66 × 16.8 / 4.3 | m | [industrial parts](../art/buildings/industrial-kinds/the-industrial-kits-parts.md) |
| Farm fence rail | 1.22 | m | [farmstead parts](../art/buildings/industrial-kinds/the-farmsteads-parts.md) |
| Midrise podium / tower podium | 4.6 m / two storeys | m | dial (15 ft retail floor) |
| Hip roof pitch, rise cap | 5:12, 4.5 | m | dial |
| Box bay colour | wall colour × 0.78 | factor | dial |
| Bulkhead and penthouse setback / penthouse share | 3 m / 30% of the plate | m | dial |
| Multiplex and garden car park | 1.4 per `units` | spaces | dial |
| Registry of utility kit ids | 30 | ids | `UTILITY_KIT_CATALOG_IDS` |
| Detached-house level heights | level 2 is the 5 m half storey | m | catalog |
| Storey | 3.2 | m | `FLOOR_HEIGHT_METERS` `[R-render-013]` |
| Scale anchors | car 4 m, person 1.75 m, box truck 7 m | m | `[R-render-014]` |
| Level-1 door / plate height | 6 ft 8 in / 8 ft (game's own) | ft | library |

**Code:**

- `src/render/buildings.ts` — the body instancer on the facade node material.
- `src/render/facade.ts` `windowGrid` — the window grid the material and the parts share.
- `src/render/houses.ts` `HousePart`, `trimColor`; `src/render/houselot.ts` `HouseLotPlan` — the house part pool and its plan.
- `src/render/buildingkit.ts` `PART`, `computePartPlacements`, `findRoadFacingEdge`, `kitPlanFor`, `kitLightMaterial`, `STOREFRONT_PARTS`, `APARTMENT_PARTS`, `LIT_PARTS`, `partsFor` — storefront, industrial and apartment parts.
- `src/render/massing.ts` `computeSetbacks`, `tierCountOf`, `PODIUM_STOREYS` — body tiers and podium.
- `src/render/farms.ts`, `src/render/farmlot.ts` `planFarm` — farmstead parts and plan.
- `src/render/utilitykits.ts` `UTILITY_KIT_CATALOG_IDS`, `UtilityKitPartKind`, `stationLightMaterial`, `waterSideOf` — civic kits and the six earliest kits.
- `src/render/busshelter.ts` `buildBusShelterGeometry`; `src/render/transit.ts` `TransitRenderer.apply` — the shared shelter.
- `src/render/lots.ts`, `src/shared/lotlayout.ts` — merged lot mesh, drive-through, trailer stalls, car parks.
- `src/render/terrain.ts`, `src/render/roadsmesh.ts` — the chunk-mesh shape lots follow.
- `src/render/geometrybudget.test.ts` — the tiers; `tools/frame-budget.mjs` and `window.__slimcity.renderInfo()` — the frame measurement.
- `tools/house-shots.mjs`, `storefront-shots.mjs`, `industry-shots.mjs`, `apartment-shots.mjs`, `ploppable-shots.mjs`, `earliest-kits-shots.mjs`, `nightlook-shots.mjs` — the shots.
- `src/main.ts` — builds `hasStopBuilding` from the snapshot.
- `UtilityKitRenderer` in `src/render/utilitykits.ts` — one `InstancedMesh` per part kind, the civic pattern.
- `src/data/catalog.json`, `src/sim/`, `src/world/` — untouched; the catalog's `kind` already names the recipe, and the save holds no geometry.
- `src/render/buildingparts.ts` — never built; its part pool is `houses.ts` and `buildingkit.ts`.

**Tests:**

- `src/render/geometrybudget.test.ts` — every kit and zoned entry under its tier; a row per species.
- `src/render/houses.test.ts`, `src/render/houselot.test.ts` — the three houses' parts, porch, chimney, shutters on bays, row parapets, part lifecycle.
- `src/render/archetypes.test.ts`, `src/render/buildingkit.test.ts` — each kind's parts inside the lot at four rotations, lit parts only on the lit material.
- Lot renderer test — many lots in one chunk hold one mesh; removal rebuilds one chunk.

**Open:**

- The Metropolis is triangle-bound on the measured laptop GPU: the next gain is triangles in the roads' and lots' merged geometry and the wild trees, not calls.
- The frame tool reads animation-loop deltas, so fewer calls show alternating frames; a GPU timestamp query would read the frame itself.
- The airport stays a box until it has its own design.

## Why the rules are what they are

### The standard

The city reads as a toy where buildings are boxes, however exact the roads and lots beneath. The detached house, 61% of homes and the first thing a player grows, was the plainest object in the game. The water tower is the bar.

Look at a real building, find what identifies it from across the street (roof form, porch, canopy, dock doors, rooftop units) and build that at measured size. A house gets a porch and a garage door; it does not get a doorknob.

Each kind is drawn against a real US type from the [library](../sources/building-detail.md#the-reference-library). A figure with no source is marked as the game's own; single-source and vendor figures stay so until a slice finds a better one, in that slice's art document, not silently in code.

Nothing in the simulation changes. A lot grows the kind it grows, on the lot it has, and the render hangs a recipe of parts on it. The programme is render-only: no catalog figure, lot, capacity, draw or save byte moves, and a village grows as before and looks like a village sooner. A city saved earlier draws with every part after it.

### How a building gets its parts

The civic kits are the pattern. One `InstancedMesh` per part kind and an `InstancedSlotPool` give each building a slot in each bucket it uses. A pure layout function turns footprint and rotation into part rects and heights; variation is a transform and a colour, never topology. Picking uses the body or plinth, so a part needs no id colour. Every kit since the hospital works so.

A zoned body stays one instance on the facade node material, which gives walls, window grid and night. What the facade cannot draw (porch, garage door, dock bank, cornice, rooftop unit, dormer) is a part with a recipe per kind, level, lot and seed. Recipes read the lot layout, so a porch stands at the door the lot put there and a garage door at the head of the drive.

Decided: variants are parts, never bodies. A porch and no porch are one body with and without a slot. Bespoke body meshes per variant lose, because buckets stay few and the sim's body sizes stay untouched. A recipe draws from a bounded set: porch or none, garage left, right or none, a chimney, zero to two dormers, shutters, a bay window.

Bucket count is the number of distinct part geometries, a few dozen. Slot count is buildings times parts; the pool grows by doubling.

Decided: richer facade material with no geometry loses. A porch, a dock and a canopy are silhouette, and no surface detail makes a box read as a ranch. The material keeps glazing and night.

Parts that frame a window use `windowGrid`, the function the material's own grid size comes from. Shutters, lintels and sills land on the bays, never a hand's width off. Parts that are windows in their own right (a storefront's display glass, a tower's glazing) use the emissive material and light with the rest.

The roof stays the house's own. `houses.ts` seeds gable or hip, pitch and colour; it gains eaves with a fascia, a ridge cap, dormers on the street slope and a chimney, placed on the roof it already computes.

Two systems draw one building, so the body instancer and the part pool agree on position, rotation, construction scale and lifecycle tint. A part hidden at the construction scale, kept when abandoned and freed on removal never floats off its house.

Where the plan named a new `buildingparts.ts`, the houses and the storefronts each found the existing pool (`houses.ts`, `buildingkit.ts`) was the right place. Extend the kit that is there.

### The budget and its measurement

The art bible said under a hundred triangles an assembly, and the standard said a kit part is a 12-triangle box. Neither held: the water tower is about 2,500. The player chose a tiered, measured budget.

A tier counts everything on the lot: body, roof, parts, paving, yard, trees, cars and interments. Yards cost more than houses, so counting only the body hid the real cost. The tiers sit where the shipped buildings were found, and `geometrybudget.test.ts` holds each, so a recipe cannot grow past its tier without the test being edited.

| Tier | Buildings | Held by |
| ---- | --------- | ------- |
| House | detached, duplex, fourplex, townhouse row | a geometry test per recipe |
| Block | every other zoned kind; midrise and tower take the tall tier | a geometry test per recipe |
| Ploppable | every kit; farms take 40,000 | a geometry test per kit |
| The city | a Metropolis of about 10,000 buildings | `tools/frame-budget.mjs` |

No save-sized city existed and growth is tick-driven, so `tools/frame-budget.mjs` builds a synthetic Metropolis by command. Sandbox mode lets the place command take any catalog entry; streets go over dry ground, about nine thousand zoned buildings in the catalog's real mix plus one of every kit, with the sim paused, because a running sim clears a city with no power or zones.

It reads frame time with the browser's frame cap off, and draw calls and triangles from `window.__slimcity.renderInfo()`, over four fixed views by day and night, against the empty map. A cheaper CPU side lets the browser queue frames, so it reports the 95th percentile of eight-frame averages, not single frames.

A slice that moves the frame past the standard's figure shrinks its parts, not the budget. If the house tier fails at the Metropolis, the recipe loses its smallest parts first (shutters, sills) and keeps roof, porch and garage. Ten thousand bodies with six parts is sixty thousand slots across a few dozen buckets, inside the stated ~300 calls.

Decided: water-tower detail on everything, or a flat 300 triangles, was declined for the tiered, measured budget. Decided: no LOD; one geometry serves every distance, and if the measurement says otherwise LOD is its own epic.

### The performance slice

The measurement found the frame already past the target on a laptop GPU, so detail is paid for by what this slice saves.

- **Lots.** The overview's draw calls were the lots: a `THREE.Mesh` per building paved the overview with thousands. The lot renderer takes the road renderer's shape, one merged mesh per chunk on one material, rebuilt when a lot in it changes. `[R-render-004]`
- **Yard.** Species, pools, trampolines, fence panels and grill legs take ceilings, so a home on a normal lot lands under 900 triangles and on an acre under 1,500.
- **Solar farm.** A row becomes a slab with panel and seam quads on posts every 6 m, 84 triangles, and the fence takes a post every 10 m.

Result: draw calls fell by half to two-thirds and every view shed 10 M triangles. The frame fell 2–3 ms at the street and held on the overview, which is triangle-bound. The shots were looked at: trees, bushes, pools and trampolines read at the street.

### Houses

The detached house is a ranch at level 1, a Cape at level 2 and a colonial at level 3, which is what its three catalog heights are. Duplex, fourplex and townhouse row follow. `HousePart` is the part pool; `houselot.ts` plans it in metres, pure and seeded.

Parts are chimney, stoop, portico, porch, porchRoof, dormer, shutter, garageLeaf and parapet, each one low-poly geometry on the roof's day and night tint. Pitch is fixed by level as a share of the half-span, and the ridge runs along the frontage. A ranch has no shutters, a Cape has two dormers, a colonial's chimney stands at a gable end.

Wall colours stay the facade's, so the survey's wall weights are not applied. `trimColor(seed, wall)` picks the one trim colour a house, white when the wall is dark, for shutters, fascia, garage leaf and door. The farmhouse follows it.

Ceilings rise to 1,300 and 1,800 to hold the parts; the house tier stays 3,000. Row parapets mark party walls at a run's boundaries.

### Storefronts

The commercial kit places parts against the road-facing wall `findRoadFacingEdge` finds, skips a building with no frontage, and draws only while Active. Each part is one low-poly geometry at the art document's dimensions; the unit-box pools stay.

`kitLightMaterial` follows `stationLightMaterial`: emissive white driven by the night factor on sign bands, pylon and price-sign faces, the supermarket tower's glazing and the office lobby portal. A dark building has no lit sign, as windows do not light when abandoned.

Rooftop units come from the top tier's rect, one per 232 m² of plate, at most eight, spaced on the long axis, plus a hatch. The office tower takes a screen and a cooling tower instead.

The drive-through lane is paving, so it belongs to the lot layout: `driveThrough` runs where the lot leaves a 3.66 m lane along the far side of the body from the drive to the pickup wall. The kit places board, bar, canopy and enclosure on it, and nothing where there is no path.

The strip's tenant bays are the frontage cut into about 8 m bays, the anchor two bays at the end away from the drive; the pylon stands at the drive mouth 1.5 m inside the street edge.

### Industry and farms

The dock bank reads the lot plan's loading berths and stands on that side; the office corner takes the street face. Trailer stalls are striped in the truck court where the berths are. Without berths the dock keeps the street face. The office corner's glazing and the factory's clerestory are lit.

Farms extend their own kit from `planFarm`: loft door, cupola, sliding doors, silo chute, bin cone and cap, the foursquare's porch and dormer, the equipment shed. Silo and bin take vertex-colour bands. The farmhouse is never dressed as industry. `[R-render-016]`

### Apartment blocks and towers

The multiplex, garden apartments, midrise and tower get one body at every level in place of stepped tiers, and an `APARTMENT_PARTS` table per kind. The tower and midrise keep a podium; the midrise's is a metre constant, not a storey count, because the 15 ft retail floor is taller than a storey.

The hip roof reuses the house kit's geometry as a kit part, so the body stays the instancer's box. Box bays, balconies and patios go by the window columns. The alternate bay colour is the instance colour.

The glass guard is a solid thin slab on the kit's own material. A third, transparent material would cost a draw call per pool for a guard nobody sees through at the default pitch. `storefrontBand` and `lobbyPortal` are lit.

The multiplex and garden kinds take the commercial car-park path at 1.4 spaces a unit, lawn on the rest of the pad; the midrise and tower keep the downtown pad. Their lot layout is the site the building is drawn onto, never redrawn: a dock stands where [parking-to-code.md](parking-to-code.md) puts the truck court, and a porch where [lots-and-land.md](lots-and-land.md) puts the door.

### The kitless ploppables and the earliest kits

The clinic, rail station and bus stop join `UTILITY_KIT_CATALOG_IDS`, so their pad replaces the box and they count against `KIT_TIER`. The bus stop's pad is a lawn plate. The clinic is one pure recipe from the footprint.

The station reads its track edge as the sewage works reads its water edge: the edge with the most rail tiles, ties broken north, east, south, west. Platform, tactile strip, canopy and bay go to it, car park and drop-off opposite. With no rail the platform takes the back of the lot.

One shelter builder serves the line's stop and the bus-stop kit. `TransitRenderer.apply` takes a `hasStopBuilding(x, z)` predicate and draws no shelter where a stop building stands. The bus stop has its own 500-triangle row.

The six earliest kits get a layout and builders each, pure from the footprint; shore kits keep `waterSideOf`. Merged geometries serve the heap, riprap, gallery, bridges and dome; nothing animates. Scale houses and switchyards are reused across kits, and the kit registry and coexistence tests change by addition only.

### Night

Windows keep lighting from the facade material, and new window geometry lights on the stations' emissive material, so a street at night keeps its character. `tools/nightlook-shots.mjs` pins one camera at noon, 03:00 and midnight and reads a wall, a shutter and a roof pixel back, failing outside the body band or on a pane that clips or is not warm.

## Decided

- Variants are slots on one body, not bespoke meshes: few buckets, sim body sizes untouched.
- Textures and imported models are rejected; boxes, lathes and a torus build the water tower.
- Tiers cover everything on the lot, chosen after the measurement counted.
- The performance slice ran before the houses, because the frame was already over target.
- The airport, a LOD system and street furniture, vehicles and people are out of scope.
- Each slice goes: art document first with every dimension sourced, then the recipe, tests, shots by day and night, then the frame test.
