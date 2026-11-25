# The water surface

- **Status:** Built

**Owns:** how water moves and looks: which water is ocean, lake or river, the waves each carries, a river's current, the foam and the light in the water, and the height a floating thing reads.

**Rules:**

- Derive a water's kind from its shape, never store it: open water on the map edge is ocean, enclosed open water a lake, water under `CHANNEL_MAX_WIDTH_M` wide a river. `[R-render-051]`
- Rebuild depth, kind, fetch, swell and current when terrain changes water, and only then; never bake them once. `[R-render-051]`
- Size every wind wave from the fetch upwind of it at the design wind. `[R-render-052]`
- Only an ocean carries swell. It travels from the open edge at the speed its depth allows, so it slows, closes up, grows and turns to face the shore, and reaches the lee of land late and small. `[R-render-052]`
- Keep one wave table. It draws the surface and it answers `surfaceHeightAt`, the height anything afloat reads; never a second set of wave numbers. `[R-render-052]`
- A river's surface drifts toward its outlet, fastest mid-channel and still at the banks. It is drawn, not simulated: nothing in the sim flows. `[R-render-053]`
- Move the mesh for the swell only. A wind wave tilts the shading; one under four pixels wide widens the glint instead.
- Cap the waves' height at `BREAKING_RATIO` of the depth, and draw surf where the cap bites a swell. A lake has no surf.
- The bed keeps the ground's own colour. Depth colour and every foam are the water's; the terrain paints neither. `[R-render-054]`
- Build waves, current, foam and light from arithmetic in a TSL node graph: no image texture and no per-frame upload. `[R-render-053]`
- Read the frame behind the water once, colour and depth, for the bent and dimmed bed. It is no reflection pass.
- Where the frame is not drawn through a pipeline, draw the water as a blended sheet with no read: a frame already toned for the screen must not be toned again.

**Numbers:**

| Constant | Value | Unit | Source |
| --- | --- | --- | --- |
| `CHANNEL_MAX_WIDTH_M` | 200 (10 tiles) | m | dial: no source gives a width that parts a river from a lake ([sources](../sources/water-surface.md#telling-the-three-apart)) |
| `RIVER_MIN_LENGTH_M` | 400, end to end of its longest run | m | dial: a shorter neck or a bay is part of the water it joins |
| `DESIGN_WIND_MPS`, `WIND_TOWARD` | 7, toward (0.94, 0.34) | m/s | dial inside force 4, a moderate breeze of 5.5 to 7.9 m/s ([Beaufort scale](https://en.wikipedia.org/wiki/Beaufort_scale)); off the grid's axes |
| Wind-wave height and period | `H = 0.283·U²/g·tanh(0.0125·X^0.42)`, `T = 7.54·U/g·tanh(0.077·X^0.25)`, `X = gF/U²` | m, s | SMB fetch-limited relation, [Shore Protection Manual form](https://coastalhydraulicslaboratoryfact.tpub.com/sect54eng/sect54eng0046.htm) |
| Wavelength, speed in deep water | `L = gT²/2π`, `c = L/T` | m, m/s | [Wind wave](https://en.wikipedia.org/wiki/Wind_wave) |
| Fetch | mean of 7 directions within 45° of upwind | m | dial |
| `OPEN_SEA_FETCH_M` | 20,000 | m | dial: the fetch where an ocean's map edge is upwind |
| A wind band's trains | 4, at −32°, −11°, +9°, +27° off the wind; periods ×0.88, 0.97, 1.05, 1.13; energy 0.2, 0.3, 0.3, 0.2 | — | dial: two trains wove a lattice |
| Swell amplitudes, periods | 0.25, 0.20, 0.15 at 8, 9.5, 11 s (1.0 m significant) | m, s | height a dial; [NDBC](https://www.ndbc.noaa.gov/faq/windsea.shtml): 8 s or more is usually swell |
| Swell speed | `sqrt(g · max(d, SWELL_MIN_DEPTH_M))`, floor 0.5 m | m/s | shallow-water waves, `c = sqrt(g h)` ([Dispersion](https://en.wikipedia.org/wiki/Dispersion_(water_waves))) |
| Swell growth | `(SWELL_REF_DEPTH_M / d)^¼`, reference 8 m | — | [Green's law](https://en.wikipedia.org/wiki/Green%27s_law) |
| `SWELL_SHADOW_BLUR_M` | 200 | m | dial: softens the edge of a headland's shelter |
| `RIVER_SURFACE_SPEED_MPS` | 0.8 mid-channel | m/s | the Mississippi's surface runs 0.54 at its head and 1.34 at New Orleans ([NPS](https://www.nps.gov/miss/riverfacts.htm)) |
| Speed across a channel | `1 − (1 − s)²`, `s` = distance to the bank ÷ half the width | — | dial |
| `BREAKING_RATIO` | 0.8 of the depth | — | [Wind wave](https://en.wikipedia.org/wiki/Wind_wave) |
| `WATER_VERTEX_SPACING_M` | 10 (half a tile), over wet tiles and their neighbours | m | dial |
| `FADE_FULL_PX`, `FADE_GONE_PX` | 4, 2 pixels a wavelength | px | dial |
| `WATER_REBUILD_SETTLE_S` | 0.5 after the last patch that touched water | s | dial |
| `WATER_IOR`, `FRESNEL_F0` | 1.33, 0.02 | — | [Optical properties of water](https://en.wikipedia.org/wiki/Optical_properties_of_water_and_ice); [Schlick's approximation](https://en.wikipedia.org/wiki/Schlick%27s_approximation) |
| `ABSORPTION_PER_M` red, green, blue | 0.34, 0.0565, 0.0092 | 1/m | [Pope and Fry 1997](https://omlc.org/spectra/water/data/pope97.txt) at 650, 550, 450 nm |
| Bed lost to sight at | ocean 8, lake 4, river 1.5 | m | dials inside the Secchi depths [read](../sources/water-surface.md#light-in-the-water); lost = 2% left |
| `LOOK_BLUR_TILES` | 3 | tiles | dial: a river's colour runs out into the sea |
| `NET_DEPTH_M` | 3 | m | dial: the light net on the bed |
| `LAP_WIDTH_M` | 0.6 on the ground at any slope, breathing; fades where a pixel is wider | m | dial |
| Gust patches | 250 and 110 across, drifting downwind at the design wind, scaling wind slope 0.5 to 1.5 | m | dial |
| Glint | one lobe, exponent `2 ÷ (slope variance × gust²)`, 8 to 2,000, normalised by `(n + 8) / 8π` | — | dial |

Wind waves, from the relation at 7 m/s. A band joins the surface as the fetch grows from the row above to its own; its amplitude is what the band adds.

| Band joins at a fetch of | Height by then | Period | Length | Speed | Amplitude |
| --- | --- | --- | --- | --- | --- |
| 100 m | 0.06 m | 0.87 s | 1.2 m | 1.4 m/s | 0.022 m |
| 500 m | 0.12 m | 1.29 s | 2.6 m | 2.0 m/s | 0.037 m |
| 2 km | 0.22 m | 1.78 s | 5.0 m | 2.8 m/s | 0.064 m |
| 5 km | 0.32 m | 2.19 s | 7.5 m | 3.4 m/s | 0.081 m |
| 20 km (open sea) | 0.55 m | 2.94 s | 13.5 m | 4.6 m/s | 0.157 m |

Swell in 8 m of water runs 8.9 m/s and 71 to 97 m long; in 1 m, 3.1 m/s and 25 to 34 m.

**Code:**

- `src/shared/waterbodies.ts` `deriveWaterBodies`, `sampleWater`, `WaterKind` — kind, fetch, swell arrival and current from the water mask and the heights.
- `src/shared/waves.ts` `WAVE_TRAINS`, `surfaceHeightAt`, `swellHeightAt`, `waveSlopeAt` — the one table and its three readers.
- `src/render/waterlook.ts` — foam, reflection, absorption, gusts and the bed's net as pure functions, with every dial.
- `src/render/water.ts` `WaterRenderer`, `buildWaterGrid`, `markTerrainChanged`, `setScreenRead` — the mesh over wet tiles, the two node graphs, the rebuild; its per-vertex data packed into 6 vertex buffers `[R-render-055]`; `SEA_REACH_M`, `SEA_CALM_M`, `SEA_OVERLAP_M` — the plain sea past the map's edge.
- `src/render/bloom.ts` `createScenePipeline` — the pass the frame is drawn through when bloom is off, so the water's read is the same.
- `tools/shots/series/views/water.mjs` — the frames.

**Tests:** `src/shared/waterbodies.test.ts` — each kind from a drawn mask, a river's direction, fronts parallel to a beach and late behind a headland; `src/shared/waves.test.ts` — the band table, heights against the relation, the cap, slope against finite differences; `src/render/water.test.ts` — mesh, attributes, the graph's trains equal the table, rebuild after a dig, foam, glint.

**Open:** the [roadmap](../ROADMAP.md) carries the lines. A strait flows out of both its ends. The wind never turns. A wind wave never moves the mesh, so close water is flat between swells.

## Why the rules are what they are

### Three kinds from one sea level

The world has one sea level, so a river is not higher than the lake it feeds. Shape is all there is to tell them apart.

Open water is water a circle `CHANNEL_MAX_WIDTH_M` across fits inside. The rest is channel. A channel `RIVER_MIN_LENGTH_M` long that reaches open water or the map edge is a river; any other is part of the still water it touches. A dug canal is a river by the same test.

Length is measured end to end. Counted along its tiles, a fat bay 350 m across read as a 500 m river.

A river flows to an ocean it reaches, else to the largest lake, else to the map edge whose banks stand lower. Its direction at a tile is the shortest way through water to that outlet.

### Wind waves come from the fetch

A wave grows with the distance the wind has blown over water. Measuring that fetch at every tile gives a calm lee shore, a rougher windward one, and a canal with nothing but ripples, with no rule naming them.

On this map's 5 km a lake's waves stay under 0.32 m high and 7.5 m long. That is true to size, and too small to see from the air. What a lake shows from above is patches of ruffled and smooth water moving with the wind, so the gusts are drawn.

### Swell knows the depth

Swell is made by storms beyond the map and enters along an ocean's longest stretch of map edge. No water here is deeper than 8 m, far from deep for a wave 100 m long: the depth sets its speed.

So each tile holds the time a front takes to arrive, solved outward from the open edge. A front slows over a shelf, the next closes up behind it, and both turn to face the beach. Behind a headland the front arrives the long way round.

Drawn as a plane wave in deep water, the same swell had a slope of 0.03 and could not be seen.

### What moves and what only shades

A mesh can carry a wave only if several vertices span it. At 10 m a vertex the swell moves the surface and the wind waves tilt the light.

A wave narrower than four pixels would flicker. Its tilt fades out and its roughness widens the glint, so far water glitters and never crawls. The glint is one lobe round the sun's mirror direction, seen from the eye.

### One table for the picture and the hull

A boat must sit on the water that is drawn. The node graph and `surfaceHeightAt` read the same table, and a test holds them together. Trains are plain sines, so the height is a function of the place and a hull reads it directly.

### Foam and light

Surf is a line on a breaking swell's crest and a trail behind it. Still water has a thin lapping line; a river has faint streaks carried by its drift, and no lapping line: on a steep bank the line zig-zagged along the tile corners.

Where an ocean touches the map's edge the sea carries on to the horizon, 15 km out, as a second mesh with a material of its own. It is opaque and plain: the ocean's deep colour, the sky's reflection, the sun's glint and a swell that fades out over 400 m. It reads nothing from the frame, so in the view that is half far sea it costs under 0.5 ms a frame on WebGL2 and at most 0.8 on WebGPU, where the full surface run that far cost 2.7. The two meshes overlap by half a metre, and the far one writes no depth, so no line shows at the join.

The surface reflects the sky by Schlick's law and lets the rest through. What comes back from the bed is bent by the waves and loses red first, then green; each kind adds its own murk and its own colour, blurred where two kinds meet.

The streaks and ripples keep fixed axes. Turned with the flow, a small change of direction slid the pattern by metres and drew squares.

## Decided

- Waves summed in the node graph, not a spectrum solved on the processor each frame: the solver uploads textures every frame and is sized for open ocean.
- Kind derived from shape, not painted or saved: a canal the player digs becomes a river with no new tool and no save byte.
- Fetch at each tile, not one wave size a lake: shelter and exposure come free, and a pond needs no rule.
- A drawn current, not flowing water: flow simulation stays deferred in [DESIGN.md](../DESIGN.md).
- True wave sizes, not waves enlarged to read from the air: sizes are real metres everywhere else.
- Sines, not trochoids: at these slopes a sharper crest does not show, and a trochoid's height is not a function of the place.
- The water's clock is the frame clock: it runs while the simulation is paused, as it did.
- The bed's depth for light is read from the frame; the depth for waves is the mesh's own, since a wave is shaped before a pixel is.
