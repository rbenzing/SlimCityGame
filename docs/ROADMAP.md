# SlimCity — Design & Technical Roadmap

**SlimCity** is a small-form-factor **city builder** for the browser: a familiar city-builder play grammar and UI layout at reduced scale, built on **Three.js** as a deliberate engine showcase — proof that a web engine can deliver a living, data-rich city sim. Maps and texture sets are **AI-generated raster assets** (terrain heightmaps + satellite-style colormaps, facade/ground atlases).

Two identities, one build:

- **The game**: paint zones, grow a city, read it through infoviews — the genre's feel, browser-sized.
- **The demo**: instancing at scale, day/night, GPU-friendly sim fields, buttery RTS camera — Three.js flexing.

_Design rationale and scope guards (deferred / rejected directions) live in [DESIGN.md](DESIGN.md). The living visual/systems spec is [SPEC.md](SPEC.md); the player-facing how-to-play is [USERGUIDE.md](USERGUIDE.md)._

> **Delivery status (2026-08-06):** the M0–M7 core spine plus bus transit, service
> dispatch, districts & policies, stats charts + photo mode, and eight playtest-feedback
> rounds are shipped and gate-green (2,208 tests / 90 files). Delivered on top of the
> original milestones: the city-builder UI shell + night cycle, full building/street/vehicle/tree
> visual language, full terraforming + animated water + sky, the airport landmark,
> code-split bundle, plus the playtest refinements captured in SPEC.md (utility
> silhouettes, placement outline, terrain skirt + camera guards, tree/water v2, roads
> v2/v3 with road-carried utilities, traffic lanes + rounded corners, grade-preserving
> road-on-slope, contained dead-end caps, terrain-conforming zoning grid, tone-mapped
> night with pooled lamp lighting, the genre-standard zoning-types expansion, and the
> **landfill/garbage sanitation epic** — paintable landfills, an incinerator facility,
> cosmetic garbage trucks, and a trash lens, per SPEC §21). Versioning + deploy are
> automated (release-please + Conventional Commits → GitHub Pages; see the repo README).
> Deferred/optional next: AI raster map packs, facade-atlas stage 2, screen-space
> AO/reflections, and the [DESIGN.md](DESIGN.md) deferred backlog (weather, deeper
> industry, more transit modes).

---

## 1. Current state audit (what exists today)

| Area                   | State                                                                                                                                                               | Verdict                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `main.js` (~300 lines) | Click places colored boxes; `buildings[]` array of meshes; no grid data model                                                                                       | Rebuild                            |
| "Simulation"           | `simulateTick()` runs only when you place something; stats are arithmetic on building count                                                                         | Rebuild                            |
| Camera                 | Right-drag orbit around fixed point; no pan, no zoom                                                                                                                | Rebuild                            |
| Terrain                | `PlaneGeometry` + `Math.random()` per vertex (incoherent noise); trees float above ground                                                                           | Rebuild                            |
| Roads                  | A single dark box per click; no network, no connectivity                                                                                                            | Rebuild                            |
| UI                     | 10 `<button onclick>` in a corner div                                                                                                                               | Rebuild                            |
| Tooling                | Three.js **r134 (2021)** via CDN `<script>`; `package.json` has **zero dependencies**; `node_modules` contains orphaned **linux-x64** binaries on a Windows machine | Delete `node_modules`, start fresh |

**Conclusion: keep the idea, rebuild the foundation.** Nothing in the current code is worth migrating.

---

## 2. Design pillars (what "feels like a city builder" actually means)

1. **You paint zones, you don't place houses.** RCI demand drives growth; the city surprises you.
2. **Roads are the skeleton.** Everything needs road access; the network is the circulatory system and traffic is its visible pulse.
3. **The city is legible through data lenses.** Land value, pollution, traffic, coverage — heatmap overlays turn the sim into information.
4. **The city looks alive.** Vehicles moving, buildings constructing/upgrading/abandoning, day/night, ambient sound.
5. **City-builder UI grammar.** Bottom toolbar with category tabs + asset-card panel, top-left city info with milestone XP bar, top-right time/weather controls, infoview lenses, demand bars docked at the zoning tools.
6. **Engine showcase.** Every system doubles as a Three.js demo: 10k+ instanced buildings, animated vehicle fleets, heatmap overlays, day/night — smooth in a browser tab. If a feature can't run pretty at 60 fps, it's designed down until it can.

---

## 3. Load-bearing architecture decisions

### 3.1 Tooling

- **Vite + TypeScript + three (latest, npm)**. ES modules, strict TS. Kill the CDN script tag.
- TS is non-negotiable for this project's history: it's the antidote to one-giant-file AI slop. Enforced module boundaries below.
- **Renderer: `WebGPURenderer` with automatic WebGL2 fallback** (three's node/TSL material system). This _is_ the showcase: WebGPU where available, identical code path falling back everywhere else. Stretch: move scalar-field diffusion to GPU compute (TSL compute) and benchmark it on-screen.
- **UI shell stack: React + Zustand + TailwindCSS — for the HTML overlay only.** The 3D world stays imperative three.js; **no React Three Fiber** in the render path (the engine showcase must not pay reconciliation overhead per frame). UI reads sim state via a Zustand store fed by worker snapshots.
- **Quality tooling: Vitest** (unit tests for every sim system), **ESLint + Prettier** (strict, from M0), **Playwright** smoke tests from M2 (boot app, build a small city via the command queue, assert no errors + fps floor). A determinism regression test — same seed + same command log ⇒ same state hash — guards the sim from M0 on.
- Other deps: `three`, `simplex-noise` (procedural fallback terrain).

### 3.2 Simulation/render split

- **Fixed-timestep deterministic sim in a Web Worker** (e.g., 20 ticks/sec; 1 game day = N ticks). Render thread interpolates.
- Game speed pause/1×/2×/4× (8× stretch) = ticks-per-frame multiplier; render FPS never couples to sim rate.
- State lives in **typed arrays (SoA)**; worker posts compact dirty-region diffs to the render thread.
- Determinism (seeded RNG, integer math where possible) → small saves, replayability, debuggability.

### 3.3 World data model — layered tile grid

Default map 256×256 tiles (16 m/tile ≈ 4×4 km). All layers are flat typed arrays:

| Layer                                                                                                 | Type          | Notes                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| `height`                                                                                              | Float32       | Sampled from AI heightmap; water below sea level                 |
| `zone`                                                                                                | Uint8         | none / R / C / I × density (low/high)                            |
| `roadId`, `buildingId`                                                                                | Uint16/Uint32 | Occupancy indices                                                |
| `landValue`, `pollution`, `noise`, `traffic`, `crime`, `fireRisk`, `education`, `health`, `happiness` | Uint8 each    | Classic city-sim scalar fields: emit → diffuse → decay each tick |
| `power`, `water`                                                                                      | Uint8         | Coverage flags from network propagation                          |

Scalar-field diffusion (blur + decay per tick) is the classic diffusing-field trick — cheap, emergent, and it makes overlays free.

### 3.4 Road network

- **Grid-aligned roads first** (classic city-builder feel), drag-to-draw with live preview + cost. Curves/freeform are a v2 stretch goal — they are a geometry tar pit (intersection meshing).
- Auto-tiling road meshes: straight / corner / T / cross / end-cap picked by neighbor bitmask.
- Graph layer on top: **nodes at intersections, edges with length/speed/capacity**. Built incrementally on edit.
- Road hierarchy: dirt → 2-lane → 4-lane avenue → highway (speed/capacity/cost tiers, unlocked by milestones).

### 3.5 Traffic — the critical scope decision

- **Statistical assignment, not per-agent simulation.** Each commuter/freight trip = A* over the graph with congestion-aware edge costs; accumulate volume per edge; congestion feeds back into pathfinding and land value/pollution.
- **Cosmetic agents**: instanced vehicles animated along _real computed routes_, count proportional to edge volume. Looks like a modern city builder, costs like a classic city simulator.
- Full agent simulation is the #1 way this project dies. Do not build it.

### 3.6 Growth system (the heart)

- **Demand model**: R demand ← jobs available, tax rate, happiness; C ← population, goods; I ← workforce, freight access. Three coupled scalar values, displayed as the RCI meter.
- **Spawner**: every few ticks, pick zoned+powered+watered+road-adjacent lots weighted by demand & desirability → spawn building from **catalog** (footprint 1×1…4×4, level 1–5, capacity, style tags).
- **Level up/down**: land value + services push levels up; pollution/crime/no-power push abandonment. Construction/abandoned visual states.
- **Desirability** per zone type is a weighted read of the scalar fields (R hates pollution, I doesn't care, C wants traffic _nearby_ but not _on_ its tile — classic tuning knobs).

### 3.7 Utilities & services

- **Power**: plants (coal/wind/solar tiers) produce MW; distribution propagates through road-adjacent tiles + power lines for remote spans; brownouts stop growth.
- **Water**: towers/pumps, same propagation model. Pipes/wires are implicit along roads — which is how modern city builders do it (roads carry power + water), so the simplification _is_ the authentic mechanic. Standalone lines/pipes only to bridge gaps to remote installations.
- **Services**: police / fire / health / education / parks. Coverage = **BFS along the road network** from the building (radius-by-road, the classic city-sim way — cheap and feels correct). Funding sliders scale radius/effect.
- Each service writes into its scalar field (crime ↓, fireRisk ↓, education ↑ …).

### 3.8 Economy & progression

- Monthly cycle: tax income (rate × occupancy × land value, per RCI) − service upkeep − road maintenance. Loans with interest. Bankruptcy = game over state.
- **Milestones by population** (genre-standard): unlock road tiers, services, high density, landmarks. Gives the sandbox a spine.
- Advisors/notifications: "demand for workers", "power shortage" — a ticker keeps the player informed (chirper-flavored, optional).

### 3.9 Rendering (Three.js specifics)

- **InstancedMesh everything**: buildings by archetype (box + facade-atlas first, GLTF kits later), trees, props, vehicles. Target: 10k+ buildings @ 60 fps.
- Terrain: **chunked** (16×16-tile chunks), heightmap-displaced, splatmap material blending AI-generated albedo + grass/rock/sand tiles; chunk-level dirty rebuilds on terraform.
- Water: flat translucent plane with animated normals at sea level.
- Lighting: one directional (sun) w/ cascaded or camera-fitted shadow map, hemisphere ambient, **day/night cycle** (sun angle + color ramp + emissive windows at night).
- Effects budget: fog, optional SSAO/bloom via postprocessing, LOD/imposters if needed later.
- Picking: **GPU ID-buffer picking** — render instance ids to a small offscreen target, read one pixel; O(1) at any city size, no per-mesh raycasts. **Selection outlines** on the picked building/road via a stencil/outline pass.
- Memory discipline: pre-allocated instance buffers, pooled vehicles/effects, no per-frame allocations in loop or worker tick; dirty-flag updates only. Enforced by a heap-growth check in the perf benchmark.

### 3.10 Camera & input

- Proper **RTS camera rig**: pan (edge-scroll + MMB/WASD), zoom-to-cursor (wheel, exponential), rotate (RMB drag), tilt clamp, smooth inertia, terrain-height following. This alone is 50% of "feel".
- Tool system: every tool = state machine (hover preview → drag → commit/cancel) with ghost meshes, red/green validity tint, cost readout at cursor. ESC cancels, right-click cancels/back.
- **Undo/redo**: every tool commit is a reversible command (build/bulldoze/zone/de-zone) on a bounded history stack — refunds on undo, Ctrl+Z/Ctrl+Y. Sim-grown changes (building spawns) are not undoable; only player edits are.

### 3.11 Persistence

- Save = typed arrays + entity tables, serialized to **IndexedDB** (+ export/import as file). Autosave. Deterministic sim keeps saves compact.
- **Schema version field from day one + per-version migration functions** — cheap now, impossible to retrofit. Saves gzip-compressed via `CompressionStream`.

---

## 4. UI layout spec (the city-builder shell, browser-sized)

> **Authoritative visual spec: [SPEC.md](SPEC.md)** — derived from three city-builder
> reference screenshots (2026-07-21): bottom dock + status strip layout, asset drawer with
> pictogram cards, tool-options panel, in-world cost/length chips + zoning-grid visualization,
> building info panel anatomy, and style tokens. The wireframe below is the original sketch;
> where they disagree, SPEC.md wins.

HTML/CSS overlay above the canvas (not in-canvas UI). Region-for-region mapping of a modern city-builder layout:

```
┌────────────────────────────────────────────────────────────────────┐
│ SlimCity ▸ [milestone XP ▓▓▓░░]        ⛅ 12:41      📅 ⏸ 1× 2× 4× │
│ 👥 12,480   💰 84,200 (+1,120)                                     │
│ ┌─┐                                                                │
│ │≡│ left dock: progression /                                       │
│ │$│ economy / city info /                3D VIEWPORT               │
│ │📊│ statistics / transport                                        │
│ └─┘                                                                │
│ ⓘ infoviews                                        📷 photo mode  │
├────────────────────────────────────────────────────────────────────┤
│ [asset card panel: thumbnails + cost of tools in active category]  │
│ RCI▂▅▃ | zoning | roads | electricity | water | health | police |  │
│          fire | education | parks | landscaping | 💥 bulldoze      │
└────────────────────────────────────────────────────────────────────┘
```

- **Top-left**: city name, milestone/XP progress bar, population, funds + monthly delta — the genre's signature corner.
- **Top-right**: clock/weather, date, pause + 1×/2×/4× speed.
- **Bottom toolbar**: category tabs; selecting one opens the **asset card panel** above it — thumbnail cards with name + cost (the classic card drawer), not text flyouts. **RCI demand bars dock beside the zoning tab**, exactly where the genre puts them.
- **Left dock**: slide-out panels — progression/milestones, economy (budget/taxes/loans), city information, statistics (line charts), transportation overview.
- **Infoviews button** (bottom-left of viewport): opens the lens grid — electricity, water, air pollution, ground pollution, noise, land value, traffic, crime, fire safety, health, education, happiness. Selecting one tints the world into that heatmap and shows a legend.
- **Info panels**: click building → occupancy, level, problem icons (no power, high rent, crime…); click road → volume/condition; click service → funding slider + coverage preview.
- **Road tool options** (genre-standard floating widget when a road tool is active): mode toggle **straight / grid** now, **curved / parallel** in v2; snapping toggles; elevation stepper as a stretch goal.
- **Photo mode** (📷): hides UI, free cinematic camera, optional slow sun-cycle — the demo-reel button; cheap to build and sells the showcase.
- **Notifications**: toast stack top-center (milestone unlocked, power shortage, bankruptcy warning) + advisor messages in the left dock.
- Keyboard: 1–9 categories, space pause, +/- speed, R rotate/mode-cycle in road tool, PgUp/PgDn density variant, Esc cancel tool, Tab cycles infoviews, **Ctrl+Z / Ctrl+Y undo/redo**.

---

## 5. AI raster asset pipeline

Two distinct uses of AI-generated raster images:

### 5.1 Playable maps (terrain)

Each map = a folder in `public/maps/<name>/`:

- `height.png` — 1024² 16-bit greyscale heightmap (AI-generated or AI-then-touched-up)
- `color.png` — matching satellite-style albedo (generated _from_ the heightmap via img2img/ControlNet so rivers/ridges align)
- `map.json` — sea level, height scale, spawn camera, name, tree-mask threshold rules

Loader: sample `height.png` → `height` layer; tiles below sea level become water; slope > threshold unbuildable; tree mask derived from color (green bands) or a third `trees.png`. The albedo drapes the terrain and blends with detail tiles up close (splat by slope/height/moisture).

Generation workflow (offline, curated — not runtime): prompt for "top-down satellite terrain, river valley / coastal bay / alpine foothills…", generate height+color pairs, normalize levels, fix seams, commit the good ones. Ship 4–6 curated maps for the map-select screen.

### 5.2 Texture sets

- **Ground detail tiles**: grass, dirt, rock, sand, asphalt — AI-generated, made tileable (offset+patch or "seamless" generation), 512², compressed (KTX2/basis eventually).
- **Building facades**: trim-sheet style atlases per style×era (residential low/high, commercial, industrial) applied to procedural box-buildings with window grids — the biggest visual bang-for-buck before real 3D kits.
- **Roofs, roads** (asphalt with lane markings per road tier), **props**.
- **UI icons**: AI-generated icon set with one consistent style prompt, exported monochrome + accent.

### 5.3 Consistency rules

One style bible: fixed palette, fixed prompt suffix, same model/settings; regenerate outliers rather than mixing styles. All generated sources and prompts recorded in `assets/PROMPTS.md` for reproducibility.

---

## 6. Module structure

```
src/
  core/      loop (fixed timestep), events, input, rng, save
  sim/       worker entry, tick pipeline, fields (diffusion), demand,
             growth, economy, services, traffic (graph + A*), network (power/water)
  world/     grid layers, road graph model, building catalog + registry, map loader
  render/    scene, camera rig, terrain chunks, road mesher, building instancer,
             vehicles, trees, overlays (heatmap), day-night, effects
  tools/     tool state machine, road tool, zone brush, service placer,
             bulldozer, terraform (stretch)
  ui/        top bar, toolbar, flyouts, info panels, overlay picker,
             notifications, map select, budget window
  data/      building catalog JSON, road specs, balance constants
public/
  maps/      AI-generated map packs
  textures/  AI-generated texture sets
```

Hard rule: `sim/` never imports `render/` or `ui/`. UI talks to sim via a command queue; sim publishes state snapshots/diffs.

---

## 7. Milestones (each ends playable)

| #      | Name                  | Scope                                                                                                                                                                                                         | Exit criteria                                                                    |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **M0** | Foundation            | Vite+TS+three; fixed-step loop; worker skeleton; grid data model; RTS camera rig; input/tool framework; dev HUD (fps, tick); Vitest+ESLint+Prettier wired; determinism hash test                              | Fly around an empty grid at 60 fps; pause/speed works; gates green               |
| **M1** | Terrain & maps        | AI heightmap+colormap loader; chunked terrain; water plane; tree scatter; buildability (slope/water); map-select screen                                                                                       | Load 2+ AI maps, terrain looks like the colormap, water reads                    |
| **M2** | Roads & networks      | Drag road tool w/ ghost+cost; auto-tiling meshes; bulldoze; **undo/redo**; road graph; power plants + propagation; water towers; coverage overlays; Playwright smoke test                                     | Draw a road grid, power it, see coverage lens; Ctrl+Z refunds a build            |
| **M3** | Zoning & growth       | Zone brush; demand model; building catalog (boxes+facade atlas); spawner; levels; population/jobs; RCI meter; top bar                                                                                         | Zone along roads → city grows and levels on its own                              |
| **M4** | Economy & services    | Budget/taxes/loans; monthly cycle; police/fire/health/edu/parks w/ road-BFS coverage; land value & happiness loops; milestones; info panels                                                                   | You can go broke; services visibly change where the city thrives                 |
| **M5** | Traffic               | Commute/freight A*; edge volumes + congestion feedback; instanced vehicles on routes; traffic overlay; road tiers matter                                                                                      | Congestion emerges, avenues fix it, vehicles flow believably                     |
| **M6** | Life & showcase       | Day/night; emissive windows; ambient audio + UI sound; notifications/advisor; construction/abandon states; full infoview set; **photo mode**; (stretch: weather, GPU-compute fields with on-screen benchmark) | 10-minute session "feels alive" untouched; photo mode produces demo-reel footage |
| **M7** | Persistence & content | IndexedDB save/load + autosave + file export; 4–6 curated AI maps; building variety pass; balance pass; (stretch: disasters, curved roads, terraform)                                                         | Ship a save, reload it, keep playing                                             |

Suggested order of implementation inside every milestone: data model → sim → tool → render → UI.

**Quality gates (every milestone exits through all of them):** unit + determinism tests green; lint/format clean; Playwright smoke passes (M2+); fps / tick-time / heap-growth measured against §8 budgets; short gap analysis; refactor debt paid **before** the next milestone starts. A milestone that fails a gate isn't done.

---

## 8. Performance budgets

- 60 fps render @ 256×256 map, 10k buildings, 1k visible vehicles → InstancedMesh + frustum-culled chunks, ≤ ~300 draw calls.
- Sim tick ≤ 10 ms at 20 Hz in worker (fields diffusion is the big cost — run staggered: not every field every tick).
- Initial load ≤ 5 s: compressed textures, lazy map assets.
- Memory: all grid layers for 256² ≈ a few MB — trivial; instance buffers dominate.

## 9. Risks & scope guards

1. **Per-agent traffic sim** — banned (see 3.5). Statistical + cosmetic agents.
2. **Curved/freeform roads** — v2 stretch. Grid roads deliver the classic city-builder feel at 10% of the geometry cost.
3. **One-giant-file regression** — module boundaries + TS strict + `sim`/`render` firewall.
4. **AI asset inconsistency** — style bible + curation (5.3); never generate at runtime.
5. **Three.js churn** — pin version; r134→r17x had breaking changes (color management, lighting units); the rewrite sidesteps migration.
6. **Scope creep before M3** — nothing "feels like a city builder" until zones grow on their own; M0–M3 is the shortest path to the magic moment. Defer everything that doesn't serve it.
