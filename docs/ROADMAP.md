# SlimCity — Design & Technical Roadmap

**SlimCity** is a small-form-factor **city builder** for the browser: a
familiar city-builder play grammar and UI layout at reduced scale, built on
**Three.js** as a deliberate engine showcase — proof that a web engine can
deliver a living, data-rich city sim. Maps and texture sets are
**AI-generated raster assets** (terrain heightmaps + satellite-style
colormaps, facade/ground atlases).

Two identities, one build:

- **The game**: paint zones, grow a city, read it through infoviews — the
  genre's feel, browser-sized.
- **The demo**: instancing at scale, day/night, GPU-friendly sim fields,
  buttery RTS camera — Three.js flexing.

_Design rationale and scope guards (deferred / rejected directions) live in
[DESIGN.md](DESIGN.md). The specs themselves are organised by discipline —
start at the [documentation map](README.md); the player-facing how-to-play is
[USERGUIDE.md](USERGUIDE.md). This roadmap
is the single place delivery status and dates live — the specs and DESIGN describe
current behavior only and carry no dates of their own._

---

## Status (2026-09-29)

**Test suite:** 7,319 tests passing across 207 test files, run 2026-10-28.
This is the only test count in the documentation set. When the suite changes
again, update the figure here and nowhere else.

**Shipped:** the M0–M7 milestone spine; bus transit, service dispatch,
districts & policies, stats charts and photo mode; eight playtest-feedback
rounds (2026-07-22 through 2026-07-25); the landfill/garbage sanitation
epic; city audio, UI sound and the user-supplied music player; the advisor
panel; bridges and elevated roads; road signage; rail transit; tram
transit, with tramways crossing other streets at grade; six-lane roads whose
median opens where a street crosses them; building lots and archetypes; dynamic world lighting
([`render/sky.ts`](../src/render/sky.ts)) and the cantilever streetlight
([`render/lamps.ts`](../src/render/lamps.ts)); power-conducting roads and the
power line ([`sim/network.ts`](../src/sim/network.ts)); free-form roads — a
network of nodes and segments, curves, roads meeting at any angle; overpasses;
snapping between grid and free roads; homes that face their street, with
drives, garages and yards; and brownouts that cut from the far end of the grid,
with the Advisor naming a shortage and the jobs a workforce is short of;
motorways and ramps driven only the way they flow; demand as economic base
theory, a small town growing its industry before its shops; and farms — an
Agriculture zone off dirt roads on soil the ground itself grades, growing row
crops, orchards and pasture with their barns, silos, bins and herds.
Versioning and deploy are automated (release-please + Conventional Commits →
GitHub Pages; see the README).

**Road composition is shipped.** A road is a class, a
cross-section profile and per-junction control; the fixed-tier model is gone.
Waves 5 and 6 — the ramp with its merge, diverge and terminal junctions, and a
section too wide for a tile laid as two carriageways — are built
([`shared/corridor.ts`](../src/shared/corridor.ts)), as are the pieces that
finished it: a transit lane is a variant of a size rather than a road type, a
road's tier is its size with the reserved lane priced on top, the placement
ghost is drawn at the road's own width, an interchange — a diamond, a
partial cloverleaf or a cloverleaf — is laid on a motorway in one click
([`shared/interchange.ts`](../src/shared/interchange.ts)), and so is a 2×2
compact roundabout on a street junction
([`shared/roundabout.ts`](../src/shared/roundabout.ts)), and a motorway or a
slip road carries a sound wall that cuts the noise behind it
([`shared/soundwall.ts`](../src/shared/soundwall.ts)). Full detail in
[history/](history/README.md), §10 below.

**Building types** are complete: a zoned lot draws a kind of building by lot
fit and real-world share, and keeps it for life
([building-types.md](game-design/features/building-types.md)). Homes come
in nine kinds, businesses in seven, and industry in eight across two zones,
the new **Heavy Industrial** zone holding the plants that pollute; a
business opens only where the town has room for its jobs, and industry
levels up on demand rather than land value.

**Water goes in and comes out.** A **water pumping station** on a shore
draws a million gallons a day from the water beside it, a **water drain
pipe** on a shore takes the city's sewage back out, and a **water pipe**
painted on open ground carries water and sewage together between them and
the streets, the way a power line carries power. Every zoned building sends
88% of its water back as sewage, a lot with no drain to take it never
grows, and a building left without one stinks. The water tower is
re-derived from a standard 100,000-gallon tank. **And the water remembers:**
where a drain empties, the water goes brown for 500 m along the shore, on
the surface itself, and a pumping station drinking from that stretch
delivers less the browner it is. The **sewage treatment works** takes the
same sewage at five times the price and fouls the water at a seventh of
the rate. The figures and their sources are in
[water-and-sewage.md](game-design/features/water-and-sewage.md).

**Power is honest on both sides.** A generator counts for its nameplate times
the published share of the year its kind runs: the wind turbine is the
average new onshore machine, 3.4 MW at 33.5%, drawn at its 103 m hub and
134 m rotor and priced from published $/kW at ¢320 and ¢9 a month; the coal
plant keeps its 60 MW nameplate and its anchors and delivers 25.6 MW. Every
civic ploppable's draw is now a surveyed figure too, floor area times the
national building survey's intensity, so a police station draws 47 kW where
it drew 600, and the airport 0.4 MW where it drew 8. The derivations are in
[power-generation.md](game-design/features/power-generation.md#the-generators-re-derived)
and [municipal-services.md](game-design/features/municipal-services.md#what-the-facilities-draw-derived-2026-10-05).

**A new town grows again.** Release 1.31.0 made the sewer a hard gate on
growth from the first house, and both drains want a shore, so a new town on
power and water grew nothing and nothing on screen said why. A town is on
septic tanks until Big Town (3,500 people) instead; from there the sewer
gates growth as designed, with the drain unlocked and the Advisor's warning
one rung before. The first-town scenario is now a frozen guard
(`tests/interaction/firsttown.test.ts`), and the ground truths say that a
test which needs a new setup step to keep passing has found a rule change,
not a test to fix.

**Open:**

- The shipped industrial lots are too shallow for the yard the second pass
  gives the heavy kinds: a body fills 13.6 m of each 20 m lot tile, so no
  warehouse lot has the 18.7 m a 16 m van needs behind a dock door, and no
  4×3 heavy lot has room for a 20 × 12 m scrap yard or a 24 m chip pile.
  The kit omits what does not fit and parks the vans in the lot's trailer
  stalls. The real fix is deeper lots for the heavy kinds in the lot layout
  (truck courts run 120–135 ft), a lots-and-land change.
- A civic kit stands on a raised plinth, so its apron or yard meets the
  crossing to the road with a step at the footprint's edge; the plinth is
  the kits' pre-existing pad, and a ramp or a lowered pad is a kit
  follow-up. A tram depot declares no crossing (its gate faces the track)
  and the college no drive (its kit has no car park).
- A bus stop stands on grid street tiles only: its furniture frame reads a
  grid road axis, so a free-form curve takes no stop yet. The lamp renderer
  already lays furniture along a curve and is the frame to reuse.
- Beside a curve an industrial box can still grow on verge tiles outside
  any framed parcel, since industry has no frontage rule on the grid; a
  framed building never levels up into a larger footprint; and a framed lot
  that lays no car park still reads its kerbside allowance from grid edges.
  All three are curved-parcels follow-ups.
- The split-level's two-storey block is a wall-colour box: the facade's
  window grid covers the house body only, so the block's upper storey has no
  panes and reads blank up close and dark at night. Panes drawn by the house
  kit on the block are the follow-up.
- The incinerator's pollution of 120, now what it emits at its burn ceiling,
  and its 2 kL of water are dials: municipal waste-to-energy plants do not
  report to the Toxics Release Inventory, so there is no like-for-like
  figure, and no water figure was found. The pocket park's 0.2 kL is a dial
  too.
- The kerb paints stalls across curb cuts and house drives, so a lot's kerb
  credit can count a stall a driveway would block.
- A corner apron tile beside a road on a slope can keep a stale run-out
  height up to 0.4 m above the deck beside it (seen on a synthetic slope
  while tracing the junction step, not in the clipping sweep); the apron
  cap would read edge-adjacent roads first to close it.
- A kerb-credited lot's customers are drawn parked on the lot, not in the
  kerb stalls its credit counts.
- The district fire station's second company rolls as a second engine: there
  is no ladder-truck vehicle kind yet (an aerial is 51 ft and up, 13 ft high,
  per one feasibility study). The engines parked on station aprons are
  decoration and stay put when the station dispatches.
- A fire's on-scene time of 10–30 ticks (1.2–3.6 game hours) is a dial: no
  US figure for an engine's time on scene was found (NIST's fireground
  experiments give crew-size ratios, NFPA 1710 gives arrival targets).
- After the performance slice (2026-10-15) the Metropolis is triangle-bound
  on the measured laptop GPU: the city still adds 19–26 M triangles over the
  empty map's 8.4 M, and the overview still draws three times the oblique's
  calls (1,125 against 389). The next performance gain is triangles, in the
  roads' and lots' merged geometry and the wild trees, not calls.
- The frame tool reads frame time from animation-loop deltas, so a build
  that submits fewer calls shows alternating fast and slow frames (the
  browser queueing ahead of the GPU); the tool reports an eight-frame
  windowed 95th percentile for that reason. A GPU timestamp query would read
  the frame itself.
- Placing a district-edge column of road across the street rows in
  `tools/frame-budget.mjs` logs about 27 "road network (command): tile(s)
  derived differently … roadMask" errors at the junctions; the city stands,
  but the conversion disagrees with itself there.
- A multiplex's stoop step stands 0.6 m into its car park's aisle and its
  mail kiosk on the front walk the aisle overlaps by 1.2 m; the lot layout
  should hold the aisle off the entrance walk. The courtyard apartments have
  no walk from the sidewalk to their street breezeway. The mid-rise and the
  tower now draw one body at the catalog height, which holds more floor than
  their `units` were counted on when they stepped; the unit counts were left
  as they were. `window.__slimcity.readKit()` reports only the kit's first
  six part kinds.
- A ground truth says `VISUAL_DAY_TICKS` never drives a sim rule, but the
  traffic system's rush hour reads the visual clock and the transit dead
  runs now follow it for their 05:00 and 23:00 crossings, since the
  renderer's hiding of the loop has to match the sim to the hour. Either the
  truth gains the exception or both systems move to the calendar day; the
  player decides.
- The crematorium's upkeep of ¢600 is the design's dial: no US operating
  cost for a crematory was found (gas is 12.5–28.5 therms a cremation by one
  maker's metering, staff unpublished).

Before writing "not built" anywhere in this document, check the code.

**Pipes are underground.** Nothing at the surface shows a pipe; pick up the
pipe tool, a water building or the Water or Sewer lens and the city goes
underground — the surface to glass, the whole system beneath it: the mains
under the streets, the laid pipes, a lead into every served lot, a riser on
each water building and its run out to the pipe that joins it, blue and
brown where the water and the drains reach, grey where they do not — and a
pipe drag snaps onto the system and says what it joins
([underground-view.md](game-design/features/underground-view.md)).

**Lots and land is complete**
([lots-and-land.md](game-design/features/lots-and-land.md)): the detached
house on the lot the land warrants, from a half lot to a 3×3 acre; the plat
cut from the street and drawn on the zone lens; the duplex, fourplex, rows
and medium density on their parcels; commercial and dense land cut into
frontage lots, its blocks starting on one lot and assembling their
neighbours; the dense homes re-derived from the floor each block is drawn
with; and a small house on prime land torn down for a plex.

**Next:** garbage recovery
([garbage-recovery.md](game-design/features/garbage-recovery.md)), the
municipal-services epic the player chose, is complete: the garbage chain on
one real unit, the kerbside recycling depot, the materials recovery facility
and the transfer station. So is healthcare and death care
([healthcare-and-death-care.md](game-design/features/healthcare-and-death-care.md)):
the clinic and hospital ladder, deaths that empty homes, a regional funeral
service until Big Town, the cemetery, the hearse and the crematorium. So is
emergency services
([emergency-services.md](game-design/features/emergency-services.md)): road
reach, crews, real call rates and a two-rung station ladder. So is the
education ladder
([education-ladder.md](game-design/features/education-ladder.md)): elementary,
middle and high schools, a college and a library, each gating level 3 for the
zones that need it and drawn as a campus. So is power generation
([power-generation.md](game-design/features/power-generation.md)): a solar
farm, a gas turbine, a combined-cycle station and a reactor, each a real small
unit sized to the game's cities. So is building detail, at the player's
request (2026-10-14, complete 2026-10-16;
[building-detail.md](game-design/features/building-detail.md)): every
zoned building and ploppable drawn as the US type it is, to the water tower's
standard, from a sourced reference library and inside a measured triangle
budget; eight slices, the budget measured first, then the performance
slice, houses, storefronts, industry and farms, blocks and towers, the
kitless ploppables, and the earliest kits redone. So is transport depots,
at the player's choice (complete 2026-10-16;
[transport-depots.md](game-design/features/transport-depots.md)): a depot
fields a line's vehicles over its own network, a mode with no depot runs
nothing, every vehicle in service is charged its operating cost, buses
pull out at dawn and home at night, and the fleet at home stands on the
apron. **In progress, at the player's request (2026-10-16): tramways**
([tramways.md](game-design/features/tramways.md)) — a street tramway drawn
as a street cars share, a tram reservation lifted onto an elevated guideway
in the Disney World monorail's form with raised stations, and every tram
lane routable; complete 2026-10-23 with the raised stations. **The
programme's last epic, parks and recreation, is complete (2026-10-23;
[parks-and-recreation.md](game-design/features/parks-and-recreation.md))** —
parks at the real sizes of the US park types, planned to a provision
standard, capped like every other service, drawn as five kits that read
apart and worn when full. **The municipal services programme is complete.**
Next, the [DESIGN.md](DESIGN.md) deferred backlog (weather, deeper industry,
more transit modes) and AI raster map packs, facade-atlas stage 2 and
screen-space AO/reflections are the shelf to pick from.

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

## 3. Architecture decisions

Load-bearing architecture decisions — tooling choices, the sim/render split,
the world data model, traffic's statistical-assignment design, and the
rest — are recorded as numbered decision records, with their rationale, in
[engineering/adr/](engineering/adr/README.md). This roadmap does not duplicate
that list; the ADR index is the authoritative one.

---

## 4. Interface

The interface — layout regions, the asset drawer, tool-options panels,
in-world cost/length chips, info-panel anatomy and style tokens — is
documented in [ux/](ux/README.md), with its visual tokens in
[art/ui-style-guide.md](art/ui-style-guide.md).

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

The module map, the dependency rules between the layers, and the data flow of a
single tick are in [architecture.md](engineering/architecture.md), which is kept against the
real directory contents rather than restated here.

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

**M7 note (2026-08-10):** save file export/import, listed above, was
explicitly descoped by user call. IndexedDB save/load plus autosave already
meet the milestone's exit criteria ("ship a save, reload it, keep
playing"), and a browser city builder is not a file-management app. Saves
stay in IndexedDB only.

---

## 8. Performance budgets

The render, simulation, load and memory budgets — and, importantly, which of
them are actually measured by a test rather than merely stated — are in
[engineering/performance-budget.md](engineering/performance-budget.md). They
are numbers the implementation is held to, not a plan, which is why they live
with the engineering documentation rather than here.

---

## 9. Risks & scope guards

1. **One-giant-file regression** — module boundaries, TS strict, and the
   `sim`/`render` firewall guard against it.
2. **AI asset inconsistency** — a style bible and curation (§5.3); nothing
   is generated at runtime.
3. **Scope creep** — nothing "feels like a city builder" until the core
   loop works; the discipline that got M0–M3 to the magic moment (defer
   anything that doesn't serve the next milestone's exit criteria) applies
   to every epic since, including the one in progress now.

Three items that used to live here were decisions, not risks, and are now
ADRs: banning per-agent traffic simulation, deferring curved/freeform
roads, and pinning the Three.js version. See [adr/](engineering/adr/README.md).

---

## 10. History

Delivered work, newest first, one file a month, lives in
[history/README.md](history/README.md); this roadmap keeps only status and what is open.
