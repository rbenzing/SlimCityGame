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

## Status (2026-09-11)

**Test suite:** 3,299 tests passing across 117 test files, run 2026-09-11.
This is the only test count in the documentation set. When the suite changes
again, update the figure here and nowhere else.

**Shipped:** the M0–M7 milestone spine; bus transit, service dispatch,
districts & policies, stats charts and photo mode; eight playtest-feedback
rounds (2026-07-22 through 2026-07-25); the landfill/garbage sanitation
epic; city audio, UI sound and the user-supplied music player; the advisor
panel; bridges and elevated roads; road signage; rail transit; tram
transit; and building lots and archetypes. Versioning and deploy are
automated (release-please + Conventional Commits → GitHub Pages; see the
README).

**In progress:** road composition — a road as a class, a
cross-section profile and per-junction control, replacing the fixed-tier
model. Waves 1–4 of 6 are shipped (one open gap inside wave 3); waves 5–6
(ramps/interchange stamps, two-tile corridors) are fully specified but not
built. Full detail in History, §10 below.

**Next, in request order:** dynamic world lighting (requested 2026-09-06,
design not yet finalized); the roadway light pole, properly modelled
(requested 2026-09-06, specified, not built); and power-conducting roads
(requested 2026-09-06, fully specified, not built — see History).

Deferred/optional beyond that: AI raster map packs, facade-atlas stage 2,
screen-space AO/reflections, and the [DESIGN.md](DESIGN.md) deferred
backlog (weather, deeper industry, more transit modes).

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

## 10. History (newest first)

### Road geometry audit (2026-09-08, one open question)

A player report that the bike lanes looked uneven, answered by measuring
rather than by looking harder. Every read-back we had asked a road what its
cross-section IS; none could say how wide the triangles emitted for it
actually came out, so a band that steps in and out along a run answers all of
them correctly. `readPaint` asks the second question off the vertex buffer,
and `tools/roadmatrix-shots.mjs` puts it to every laying tier in every
topology a road goes down in — 84 cases. See
[engineering/standards/debugging.md](engineering/standards/debugging.md).

What it found and what was fixed: the edge line was placed a fixed inset from
the kerb, which lands half a metre INSIDE a reserved kerbside lane — so a bike
lane had a white line splitting its own green paint and nothing between it and
the traffic, and a kerbside bus lane had the same stray line plus only a dashed
boundary. The edge line now goes at the inside edge of a reserved lane, where
general traffic actually ends.

**Junction geometry, four defects found by inspection (2026-09-08, not yet
fixed).** An avenue crossing a two-lane road, photographed straight down at
the closest the rig allows, then measured. None of these is caught by any
check we have, which is the reason they survived:

1. **The kerb return had no radius behind it (fixed 2026-09-09).** First
   read as an inverted arc; it was not. Centring the sweep on the tile
   corner with radius `armDepth` is, by coincidence of those two being the
   same distance, a correctly tangent fillet — so the shape was right and
   the figure was wrong. The radius WAS `TILE_HALF - coreHalf`: the tile
   left over beside the carriageway, which runs exactly opposite to need.
   An alley turned through 8.13 m and an avenue through 1.90 m, when the
   vehicles are the other way round. It is now a per-class figure from the
   design vehicle each class serves (3.0 m for an alley up to 12.0 m for a
   highway — see
   [world-sim/road-model.md](world-sim/road-model.md)), the arc is
   centred a radius in from each kerb rather than on the tile corner, and
   the straight kerb either side of it keeps the footway flush with the
   road it runs into. Pinned by a tangency test rather than a vertex count,
   so the centre cannot drift back.

   **Still capped by the tile.** A return needs its radius clear of the
   carriageway on both roads, and 20 m leaves only 1.90 m beside an avenue.
   Classes asking for more get the cap, so the widest junctions are still
   tighter than they should be and an avenue's box is nearly square. Going
   further means drawing one corner across three tiles, which the
   one-tile-owns-its-geometry model does not do — that is the next piece of
   work here, and it is what the original screenshot was really showing.

2. **The turn pocket does NOT step — that reading was wrong (measured
   2026-09-09).** It looked like it did: the cross-section goes 7.50 → 9.03
   → 10.55 m over two tiles and `readApproach` reports `taper: null`
   throughout, so the conclusion was a width squared off at each tile edge.
   The geometry says otherwise. `readPaint` only reports a width covered
   over 98% of a tile's LENGTH, so a bending plate reports its narrow end
   and a stepped one its full width — and each flare tile reports its
   UPSTREAM neighbour's width plus about 2%: 7.65 where the section is 9.03,
   9.18 where it is 10.55. That is a bend, not a step. `seamHalfAt`
   (`roadsmesh.ts`) was already interpolating the half-width across these
   tiles. The kerb bends with it, tracking asphalt + 3.75 m exactly at every
   tile (7.65 + 3.75 = 11.40, 9.18 + 3.75 = 12.93). Nothing needed a taper
   drawing; `taper: null` is a read-back that does not describe a flare, not
   a flare that is not drawn.

   What is left of the complaint splits in two, both confirmed:

   - ~~**The painted centreline jumps.**~~ **Retracted 2026-09-11, and the
     third finding lost to the same misreading.** The centreline does sit at
     ∓1.25 m on the two approach tiles and does flip sign across the
     junction, and both of those are correct: the carriageway widens
     symmetrically (±3.75 → ±3.83 → ±4.59, centred on 0 throughout, so the
     road itself never moves), each approach gains its turn lane on its own
     left, and a real junction with left-turn lanes on both approaches does
     shift its centreline in opposite directions either side. Photographed,
     the line eases across the flare as a smooth diagonal with the kerbs
     splaying either side of it. Nothing jumps.

     The "jump" was `readPaint` being read as a position when it reports an
     extent. Three findings were now raised and retracted on that one
     mistake, so the read-back itself was changed rather than the record
     corrected a third time: every band now reports where it sits at each
     END of its tile, so a diagonal is visible as one. The matrix harness
     compares the ends that MEET at a seam and no longer excuses tiles
     carrying a taper, a pocket or an auxiliary lane — that exemption was
     what would have hidden a flare that really did step.

   - **An unkerbed road stepped into its flare (fixed 2026-09-11).** Found
     by the tightened check on its first run, which is what it was for. The
     bend into a width change was gated on `spec.paved && spec.hasCurbs`,
     and paired with a filter that skipped any gravel neighbour — between
     them they excluded every road that is not paved and kerbed. So a
     gravel track running into its own junction flare, both tiles gravel
     and no surface changing anywhere, put 1.38 m of shoulder out in a
     single square seam; an alley did 1.52 m and a ramp 0.90 m. The bend now
     applies whatever the road is made of, and what is excluded instead is a
     change of SURFACE, where the paved-to-dirt band is already that join's
     own treatment. Confirmed in pixels both ways: a square shoulder before,
     a smooth taper after.

   - **On a slope the surface reads as slabs.** Photographed straight down
     on a 26 m drop the widths are uniform to the millimetre (asphalt
     ±3.75 m, kerb ±5.63 m, identical over six tiles) while the shading is
     not: the terrain-conforming lattice is flat-shaded per face, so
     adjacent cells at slightly different slopes meet at a visible seam and
     a straight road reads as a stack. That is normals, not geometry —
     `computeVertexNormals` on a non-indexed soup can only give per-face
     normals. Smoothing them across the near-planar carriageway while
     keeping the kerb's own upstand sharp would fix it, and would change how
     every road in the game is lit, so it wants a decision rather than a
     patch.

3. ~~**The stop line is painted across the departing lanes.**~~ **Fixed
   2026-09-08.** It spanned `[-coreHalf, +coreHalf]`, the whole carriageway,
   so it barred the lanes leaving the junction too. It now covers the
   arriving lanes and stops at the centreline (MUTCD 3B.16), sharing
   `approachingLanes` with the lane-use arrows that already worked the same
   question out — including the case where a turn pocket has moved the
   boundary off the centreline. The arm's arriving extent reaches the
   junction tile through `NeighborHalves.approaches`. The line's own figures
   were already right (0.4 m thick, 1.2 m in advance of the crossing) and
   the crossing does honour the 1.8 m minimum depth, so neither was touched.
4. **Smaller, same run.** A crossing is painted straight over a divided
   road's median rather than breaking at it for a refuge; and a signal's
   mast arm at the corner reaches outward over the verge instead of over
   the approach lanes it governs.

**Still open — the approach flare is drawn but not reported.** On the upstream
approach to a junction the geometry flares into turn pockets with arrows
(wave 4's work, and plausibly correct for a one-way, where only one side feeds
the junction), but both read-backs insist the section is unchanged there —
`readApproach` and `readDrawn` report the plain section, no pocket and no
taper. Either the flare is wrong or the read-backs are blind to it; until that
is settled the matrix reports 17 findings on one-way, tram, ramp and
mixed-class crossroads runs. Two smaller notes from the same run, neither
chased: a dead end stops all its paint at the junction-box boundary, leaving an
unpainted apron before the rounded bulb (consistent across marking types, so
likely a design consequence), and a fresh map with no roads on it already
submits six empty draw calls.

### Road composition (2026-09-05 – 2026-09-06, in progress)

A road becomes a **class** (what it's for — speed, zonability, what it may
carry), a **profile** (its cross-section: an ordered, width-budgeted list
of lane pieces), and a **junction** (control, turn restrictions, approach
lanes) — replacing the fixed road-tier model, in six independently
shippable waves.

- **Wave 1 — profiles and classes (shipped 2026-09-05).** Twelve classes
  and eleven preset profiles live in `roads.json`; a profile derives speed,
  capacity, carriageway width, kerbs and paving, reproducing every existing
  tier's numbers exactly, pinned by test. The grid stores the profile —
  not the tier — as a road's identity (saves bump to v6; older saves still
  load). The road tool gained a profile editor (parking and bike lanes,
  footways on/off), a class/lane-count/median/speed drawer, and a Replace
  mode. Roads now meet each other by rule instead of stepping in colour at
  the seam.
- **Wave 2 — stored direction (shipped 2026-09-05).** Flow direction is
  stored per tile (saves bump to v7) instead of inferred from geometry, so
  redrawing a one-way street the other way turns it round rather than
  requiring a rebuild. Profiles can now be asymmetric (e.g. two lanes one
  way, one the other); edge cost scales by the lane share serving the
  direction actually travelled.
- **Wave 3 — junction control (shipped 2026-09-06, one gap remains).**
  Every junction now carries a control (none / yield / stop / all-way stop
  / signal / roundabout) set by a warrant and overridable by the player
  (saves bump to v8); a signalised junction cycles on the shared traffic
  clock, and a one-tile mini roundabout is buildable. Still open: the 2×2
  compact roundabout, which needs wave 6's two-tile corridors. (The other
  gap this wave's status flagged at ship time — delay costed per approach
  rather than per movement — was closed the same day by wave 4, below.)
- **Wave 4 — approach lanes and tapers (shipped 2026-09-06).** Lanes carry
  movement sets (through/left/right); turn restrictions are stored per
  junction (saves bump to v9) and enforced by the router, which now
  searches node-plus-arriving-edge pairs so a turn's legality depends on
  which way the driver came in. Turn pockets and lane-drop tapers are
  carved from the width budget, with merge arrows and a capacity cap at the
  narrow point; a movement's delay now divides by the lanes actually
  serving it. Deferred on purpose: per-lane (rather than per-arm) movement
  sets, which only pay off once wave 6's multi-lane approaches exist, and
  the motorway gore chevron, moved into wave 5 because it needs the same
  neutral-area geometry a ramp nose needs.
- **Waves 5–6 — ramps/interchange stamps; two-tile corridors (specified,
  not built).** The ramp class, merge/diverge/terminal junctions and
  interchange stamps (wave 5), and six/eight-lane two-tile corridors with
  the compact roundabout and sound barriers (wave 6), are fully specified
  in [world-sim/road-model.md](world-sim/road-model.md). Neither wave has a ship date.

Design locked 2026-09-05 (research date): 3.5 m default travel lanes
(existing presets keep their original 3.75 m), six/eight lanes as two-tile
corridors sequenced last, signals as Webster delay plus a cosmetic cycle
rather than a phase simulation, and the centre-line colour theme chosen
once at city start. Every capacity, delay and taper figure in the section
is derived from HCM/AASHTO formulas scaled by one constant into the sim's
existing metres-and-seconds units.

**Owners:** `src/data/roads.json`, `src/shared/types.ts`,
`src/world/grid.ts`, `src/world/roads.ts`, `src/world/pathfind.ts`,
`src/sim/traffic.ts`, `src/sim/worker.entry.ts`, `src/render/roadsmesh.ts`,
`src/render/roadfurniture.ts`, `src/render/lamps.ts`, `src/render/parked.ts`,
`src/render/signage.ts`, `src/world/interchanges.ts`, `src/tools/tools.ts`,
`src/ui/RoadToolOptions.tsx`, `src/ui/JunctionPanel.tsx`,
`src/ui/categories.ts`, `src/sim/advisor.ts`.

**Acceptance:** every pre-existing tier loads from a v5 save and renders
byte-identically as its preset profile, reproducing its catalogue capacity
by the derivation formula; a player can compose a profile (add parking/bike
lanes, drop lamps) without redrawing and see it in the markings and
furniture; a collector meeting a local street defaults to a stop on the
local and can be changed to a signal or a roundabout, with the path cost
changing to match; a signalised approach can be given a dedicated left-turn
lane that the arrow, the stop line and the pathfinder all agree exists; a
highway ramp gains its acceleration lane and painted gore automatically; a
six-lane divided road claims two tiles with its kerb furniture, lots and
pedestrians all measuring from its real edge.

**Verification:** the preset zero-change claim, the width-budget table, and
the delay/warrant formulas are pinned by test against worked HCM figures;
ramps, tapers and interchanges are checked by reading back the live grid in
the running game, not only in unit tests; markings remain a screenshot
review.

### Power-conducting roads (requested 2026-09-06, not built)

Every road currently conducts electricity regardless of surface, so the
power network has no shape a player can see or plan. The specified fix: a
road conducts only if its class is sealed to carry a cable; a street lamp
needs a live supply, so lighting coverage reads off the night city and a
brownout takes the lights; and a placeable power line — timber poles, a
crossarm, three catenary wires — reaches what a road cannot, billed through
the same build-cost/monthly-upkeep path a road already uses. The change is
explicitly not grandfathered: once shipped, existing saves load with only
the supply they actually earned. Ship order is fixed — lamps first, the
power line second, roads losing conduction last — so the game is never left
with an unreachable lot mid-rollout. Fully specified, including acceptance
and verification criteria, in [world-sim/utilities-model.md](world-sim/utilities-model.md);
nothing in this section has
shipped.

### Audio — city soundscape and music player (shipped 2026-08-10)

WebAudio-synthesized ambient bed, wildlife and UI cues (no audio assets in
the repo), plus a player-supplied music player that reads `public/songs/`
with shuffle/repeat/rescan. Verification at ship time: 8/8 real-browser
checks and 58 unit tests across `audio.test.ts`, `music.test.ts`,
`MusicPanel.test.tsx` and `songsmanifest.test.ts`. Two behaviors surfaced
only in the real-browser check and were fixed the same day: playback
started from the start menu now unlocks the audio engine itself, and the
song folder is scanned on app creation rather than at game start, so the
menu's playlist is already populated.

### Roads epic R1–R4 — cosmetic transit-lane tiers (complete 2026-08-06)

Four additive road tiers on the existing one-tile model, not a refactor:
kerbside furniture (R1), painted bus- and bike-lane tiers (R2), tram track
(R3), and dedicated rail track excluded from the drivable vehicle graph
(R4). Later joined — not replaced — by the bus transit, rail transit and
tram transit epics, which run real lines and stops over these tiers.

### Playtest rounds — geometry and prop polish (2026-07-22 – 2026-08-05)

Six numbered playtest rounds ran 2026-07-22 to 2026-07-24: speed pacing and
the asset-drawer close button shipped the same day as reported; corner
rounding shipped 2026-07-29 as a true curved carriageway (replacing an
earlier fillet attempt that still read as a squared corner), with curved
lane markings following 2026-08-05. A follow-on prop-polish pass (modeled
bus shelters, a detailed lamp, pedestrian scatter, a rounded dead-end kerb
with a dirt-to-grass transition) closed 2026-08-05: a real-browser review
at that point caught and fixed two readability bugs — a lamp pole rendering
as a flat black line in daylight, and idle pedestrians standing in the
carriageway instead of by the shelter they belonged to. A related same-day
fix made roads and parking aprons receive shadows; they had been drawn with
an unlit material that ignored every light in the scene.

### Residential home models (shipped 2026-07-29)

A procedural house kit replaced the shared box mesh for residential zones:
pitched roofs, an attached garage and driveway on 2×3-or-larger detached
lots, a parked car on the driveway, and deterministic massing variety.
Homes never street-park — that stays commercial/industrial-only behavior.

### Roads v2/v3 — median avenue, real intersections, road-carried utilities (shipped 2026-07-23)

True-ratio lane paint, stop lines and zebra crossings at real
intersections, and a tree-lined median avenue with a concrete highway
divider (round 2); then gravel, alley, one-way and four-lane tiers, road
noise by tier, and the rule that every road except highways carries a
power line and a water main along the road graph rather than as radius
coverage from a utility building (round 3, catalog v3).

### Early ticket maps (shipped)

The wave-2 ticket map (UI restyle to the dock/status-strip layout, the
asset drawer, world-feedback previews, selection info, status-strip data,
the night cycle) and the wave-6 / playtest-round-1 ticket map (ghost
outline, camera edge-scroll stop, terrain skirt, tree scatter v2, water v2,
utility silhouette kits — 2026-07-22) both shipped and are folded into the
milestone spine and the visual-polish rounds above.
