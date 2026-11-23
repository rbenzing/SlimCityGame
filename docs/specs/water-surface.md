# The water surface

- **Status:** Agreed

**Owns:** how water moves and looks: which water is ocean, lake or river, the waves each carries, a river's current, the light in the water, and the height a floating thing reads.

**Rules:**

- Derive a water's kind from its shape, never store it: open water on the map edge is ocean, enclosed open water a lake, water under `CHANNEL_MAX_WIDTH_M` wide a river. `[R-render-051]`
- Rebuild depth, kind, fetch and current whenever terrain changes water; never bake them once. `[R-render-051]`
- Size every wind wave from the fetch upwind of it at the design wind. Only an ocean carries swell, and only where its open edge is in a straight line of sight. `[R-render-052]`
- Keep one wave table. It draws the surface and it answers `surfaceHeightAt`, the height anything afloat reads; never a second set of wave numbers. `[R-render-052]`
- A river's surface drifts toward its outlet, fastest mid-channel and still at the banks. It is drawn, not simulated: nothing in the sim flows. `[R-render-053]`
- Move the mesh only for a wave at least four vertex spacings long. A shorter wave tilts the shading; one under four pixels wide widens the glint instead.
- Cap the waves' height at `BREAKING_RATIO` of the depth, so the surface never rises through a beach, and draw surf where the cap bites a swell.
- Build waves, current, foam and light from arithmetic in a TSL node graph: no image texture and no per-frame upload. `[R-render-053]`
- Bend the bed seen through the surface with one read of the frame behind the water, and keep it only inside `REFRACTION_BUDGET_MS`.

**Numbers:**

| Constant | Value | Unit | Source |
| --- | --- | --- | --- |
| `CHANNEL_MAX_WIDTH_M` | 200 (10 tiles) | m | dial: no source gives a width that parts a river from a lake ([sources](../sources/water-surface.md#telling-the-three-apart)) |
| `RIVER_MIN_LENGTH_M` | 400 | m | dial: a shorter neck is part of the water it joins |
| `DESIGN_WIND_MPS` | 7 | m/s | dial: a moderate breeze |
| Wind-wave height and period | `H = 0.283·U²/g·tanh(0.0125·X^0.42)`, `T = 7.54·U/g·tanh(0.077·X^0.25)`, `X = gF/U²` | m, s | SMB fetch-limited relation, [Shore Protection Manual form](https://coastalhydraulicslaboratoryfact.tpub.com/sect54eng/sect54eng0046.htm) |
| Wavelength, speed | `L = gT²/2π`, `c = L/T` | m, m/s | deep-water waves, [Wind wave](https://en.wikipedia.org/wiki/Wind_wave) |
| `OPEN_SEA_FETCH_M` | 20,000 | m | dial: the fetch an ocean tile has where the map edge is upwind |
| `SWELL_HEIGHT_M` | 1.0 | m | dial: no ordinary-day figure was found |
| Swell periods | 8, 9.5, 11 | s | [NDBC](https://www.ndbc.noaa.gov/faq/windsea.shtml): a dominant period of 8 s or more is usually swell |
| Swell trains | 12 either side of straight inland | degrees | dial |
| `SWELL_SHADOW_BLUR_M` | 200 | m | dial: softens the edge of a headland's shelter |
| `RIVER_SURFACE_SPEED_MPS` | 0.8 mid-channel | m/s | the Mississippi's surface runs 0.54 at its head and 1.34 at New Orleans ([NPS](https://www.nps.gov/miss/riverfacts.htm)) |
| Speed across a channel | `1 − (1 − s)²`, `s` = distance to the bank ÷ half the width | — | dial |
| `BREAKING_RATIO` | 0.8 of the depth | — | [Wind wave](https://en.wikipedia.org/wiki/Wind_wave) |
| Steepest wave | height 0.142 of length | — | [Miche criterion](https://en.wikipedia.org/wiki/Miche_criterion) |
| Loop-free sum | `Σ Q·k·a ≤ 1` | — | [GPU Gems, chapter 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models) |
| `WATER_VERTEX_SPACING_M` | 10 (half a tile) | m | dial: a 100 m swell spans ten vertices |
| Waves that move the mesh | 40 and longer | m | four vertex spacings |
| Shading fade | from four pixels a wave down to two | px | dial |
| `WATER_IOR`, facing reflectance | 1.33, 0.02 | — | [Optical properties of water](https://en.wikipedia.org/wiki/Optical_properties_of_water_and_ice); `((n−1)/(n+1))²` |
| Absorption, red, green, blue | 0.34, 0.0565, 0.0092 | 1/m | [Pope and Fry 1997](https://omlc.org/spectra/water/data/pope97.txt) at 650, 550, 450 nm |
| Bed lost to sight at | ocean 8, lake 4, river 1.5 | m | dials inside the Secchi depths [read](../sources/water-surface.md#light-in-the-water) |
| Light pattern on the bed | to 3 | m | dial |
| `REFRACTION_BUDGET_MS` | 1 a frame | ms | dial; `tools/probes/frame-budget.mjs` |

Wind waves, from the relation at 7 m/s. A band joins the surface as the fetch grows from the row above to its own; its amplitude is what the band adds.

| Band joins at a fetch of | Height by then | Period | Length | Speed | Amplitude |
| --- | --- | --- | --- | --- | --- |
| 100 m | 0.06 m | 0.87 s | 1.2 m | 1.4 m/s | 0.022 m |
| 500 m | 0.12 m | 1.29 s | 2.6 m | 2.0 m/s | 0.037 m |
| 2 km | 0.22 m | 1.78 s | 5.0 m | 2.8 m/s | 0.064 m |
| 5 km | 0.32 m | 2.19 s | 7.5 m | 3.4 m/s | 0.081 m |
| 20 km (open sea) | 0.55 m | 2.94 s | 13.5 m | 4.6 m/s | 0.157 m |

Swell: periods 8, 9.5 and 11 s run 100, 141 and 189 m long at 12.5, 14.8 and 17.2 m/s, with amplitudes 0.25, 0.20 and 0.15 m.

**Code:** not built; these are the homes.

- `src/shared/waterbodies.ts` — kind, fetch, swell exposure and current, each a pure function of the water mask and the heights.
- `src/shared/waves.ts` — the wave table, `surfaceHeightAt`, `currentAt`.
- `src/render/water.ts` `WaterRenderer` — the mesh over wet tiles, the node graph, the rebuild on a height patch.

**Tests:** `src/shared/waterbodies.test.ts` — each kind from a drawn mask, a river's direction, shelter behind a headland; `src/shared/waves.test.ts` — heights against the relation, the breaking cap, the loop-free sum; `src/render/water.test.ts` — the node graph and the table agree.

**Open:** all of it; the [roadmap](../ROADMAP.md) carries the line. A strait flows out of both its ends. The wind never turns.

## Why the rules are what they are

### Three kinds from one sea level

The world has one sea level, so a river is not higher than the lake it feeds. Shape is all there is to tell them apart.

Open water is water a circle `CHANNEL_MAX_WIDTH_M` across fits inside. The rest is channel. A channel `RIVER_MIN_LENGTH_M` long that reaches open water or the map edge is a river; any other is part of the still water it touches. A dug canal is a river by the same test.

A river flows to an ocean it reaches, else to the largest lake, else to the map edge whose banks stand lower. Its direction at a tile is the shortest way through water to that outlet.

### Waves come from the wind and the open sea

A wave grows with the distance the wind has blown over water. Measuring that fetch at every tile gives a calm lee shore, a rougher windward one, and a canal with nothing but ripples, with no rule naming them.

On this map's 5 km a lake's waves stay under 0.32 m high and 7.5 m long. That is true to size, and calmer than the surface drawn before it. What reads from the air is the swell on an ocean and the drift of a river.

Swell is made by storms beyond the map. It enters along an ocean's longest stretch of map edge and travels straight inland. A tile behind land, on that line, lies in its shelter.

### What moves and what only shades

A mesh can carry a wave only if several vertices span it. At 10 m a vertex, the swell moves the surface and the wind waves do not; they tilt the light, which is what a 0.3 m wave does to the eye.

A wave narrower than four pixels would flicker. Its tilt fades out and its roughness goes into the glint, so far water glitters and never crawls.

### One table for the picture and the hull

A boat must sit on the water that is drawn. The node graph and `surfaceHeightAt` read the same table, and a test holds them together.

### Light

The surface reflects the sky by the facing reflectance and lets the rest through. What comes back from below loses red first, then green; each kind adds its own murk.

The surf line, the lapping foam of still water and the fouling from a drain are drawn on the surface. The bed's light pattern is drawn by the water, so the terrain's material is untouched.

## Decided

- Waves summed in the node graph, not a spectrum solved on the processor each frame: the solver uploads textures every frame and is sized for open ocean.
- Kind derived from shape, not painted or saved: a canal the player digs becomes a river with no new tool and no save byte.
- Fetch at each tile, not one wave size a lake: shelter and exposure come free, and a pond needs no rule.
- A drawn current, not flowing water: flow simulation stays deferred in [DESIGN.md](../DESIGN.md).
- True wave sizes, not waves enlarged to read from the air: sizes are real metres everywhere else.
- The water's clock is the frame clock: it runs while the simulation is paused, as it did.
- One read of the frame for the bent bed, behind a budget: it is no reflection pass, which stays rejected.
