# SlimCity — Living Product Spec

The authoritative, living specification for how SlimCity looks and behaves: the
city-builder UI shell, in-world feedback, the night cycle, and the visual/systems
detail for roads, zoning, utilities, services, transit, districts, terraforming,
and landmarks. It began as the UI visual-parity spec (derived from three
city-builder reference screenshots supplied 2026-07-21 — building info panel; road
tool + asset drawer; zone painting) and now absorbs the systems detail as the
single source of truth for the product's intended form. Keep it current as
features land.

Rule zero applies: **every control rendered must be wired to real behavior** —
anything not yet backed by a working system is listed under Deferred, never
rendered as a dead button.

Companion docs: [ROADMAP.md](ROADMAP.md) (milestones + delivery status),
[DESIGN.md](DESIGN.md) (rationale + scope guards), [USERGUIDE.md](USERGUIDE.md)
(how to play).

---

## 1. Layout (bottom-heavy, city-builder grammar)

Top corners carry only small circular utility buttons. Everything load-bearing
lives in two stacked bottom bars.

```
┌─(ⓘ)────────────────────────────────────────────────(?)─(⚙)─┐
│                                                              │
│                       3D VIEWPORT                            │
│  ┌ Building info panel (floating, left) ┐                    │
│  └──────────────────────────────────────┘        (right-edge │
│                                                   button rail)│
│            [tool options]  [asset drawer]                    │
├──────────────────────────────────────────────────────────────┤
│ ◲ RCI▬▬▬  (408)🏆 MEGALOPOLIS │ ▩ ▦ ▤ 🛣 ⚡ 💧 🚒 👮 🎓 🌳 💥 │ ◐ 🗺 📊 │  ← main dock
├──────────────────────────────────────────────────────────────┤
│ ▶ ⏩⏩⏩ │ 08:56 Sept 2025 │ ☀ Fall │   Tompsonia   │ 👥11,619▲ │ ¢50,000 ▲ │ 🙂 │  ← status strip
└──────────────────────────────────────────────────────────────┘
```

## 2. Main dock (bottom bar #1)

- **Left cluster**: small city glyph; three **horizontal** RCI demand bars
  stacked vertically (green R / blue C / orange I, fill % from demand −1..1
  mapped to 0..100); milestone badge — circular XP chip showing progress ring +
  trophy icon + milestone name in caps ("SMALL TOWN"). Clicking the badge opens
  the milestone toast history.
- **Center**: one row of category icon buttons (~40px, icon-only, tooltip on
  hover): Zoning, Roads, Electricity, Water, Health, Fire, Police, Education,
  Parks, Bulldoze. Active category = filled accent-blue circular highlight
  (the genre-standard active-tool treatment). Clicking toggles the asset drawer.
- **Right cluster**: Infoviews toggle (◐ — opens the lens grid, replaces the
  current standalone InfoviewPicker placement), overlay-off shortcut, stats
  panel toggle (line charts, wave 3), photo mode (wave 3 — omit until real).

## 3. Status strip (bottom bar #2)

Left → right, single 28px row, separated by subtle dividers:

- **Sim controls**: ▶/⏸ toggle; speed as chevron count (▶ =1×, ▶▶ =2×, ▶▶▶ =4×),
  active speed highlighted. Space = pause, +/- = speed (already bound).
- **Clock + date**: `HH:MM` from time-of-day (tick within TICKS_PER_DAY mapped
  to 24h) + `MMM YYYY` from tickToDate (year offset display: 2025 + year-1).
- **Season chip**: sun/leaf glyph + season derived from month (Dec–Feb Winter …)
  — display-only flavor computed from real game date. No temperature (no
  weather system yet — deferred).
- **City name**: centered, from map name ("Riverton" wave 1).
- **Population**: 👥 + formatted count + trend arrow (▲/▼ vs previous month
  snapshot, tracked in store).
- **Funds**: ¢ formatted + monthly delta chip (green +/red −, from
  monthlyIncome − monthlyExpenses; labeled `/mo` — we do not fake an hourly
  rate).
- **Happiness face**: single emoji-style face stepped from stats.happiness
  (😞<35, 😐<55, 🙂<75, 😄≥75). Clicking opens infoview Happiness.

## 4. Asset drawer (opens above the dock when a category is active)

- Container: dark translucent panel, rounded top corners, close ✕ right.
- **Sub-tab row** (top of drawer, small icons): e.g. Roads → [small roads,
  large roads, maintenance]; Zoning → [residential, commercial, industrial,
  de-zone]. Only render sub-tabs that have ≥1 real item.
- **Card grid**: thumbnail cards ~96×72 — flat-shaded CSS/SVG pictogram of the
  item (road cross-section stripes by tier; zone = colored cell block; building
  = simple elevation silhouette tinted by catalog color), name beneath, cost
  chip bottom-right (¢ for ploppables/roads, blank for zones). Selected card =
  accent-blue border + fill (genre-standard treatment). Locked (unlockMilestone > current)
  = 40% opacity + 🔒 + tooltip "Unlocks at {milestone name}".
- Drawer and tool options close on ESC (first ESC cancels drag, second closes
  drawer, third deselects category — the genre-standard escape stack).

## 5. Tool options panel (floating left of the drawer, only when relevant)

Rows in the genre-standard order, but only rows whose toggles do something real:

- **Tool Mode** (road tools): `Straight` (direct segment: single-axis lock) |
  `L-path` (current two-leg mode) | `Grid` (drag rect → perimeter+internal
  grid streets, wave-2 stretch). Zone tools: `Brush` | `Rect` (current).
  Bulldoze: `Rect` only → row hidden.
- **Snapping**: toggle chips — `Grid snap` (tile snap; always-on in engine →
  rendered pressed+disabled tooltip "always on"— omit if that reads as dead:
  instead only render toggles that flip real ToolManager flags): `90° lock`
  (restrict L-path to single leg), `Road guide` (extend-from-existing-road
  guideline, wave-2 stretch).
- **Elevation / Parallel Mode**: NOT rendered (no bridges/parallel system) —
  deferred §9.

## 6. In-world tool feedback (render-side, not DOM)

- **Ghost preview**: translucent accent-blue ribbon/cells (replaces plain
  tiles): valid = blue 55% with white dashed centerline for roads; invalid =
  orange-red tint. Zone painting = bright green cell fill with darker cell
  borders (screenshot 3's look), de-zone = grey.
- **Cursor chips** (DOM, follow pointer, offset 24px): cost `¢202` (live from
  preview), plus for roads a length chip `137 m` (tiles × TILE_METERS). Invalid
  reason line in orange beneath cost ("Overlapping items", "Insufficient
  funds", "Locked"). One chip stack, right of cursor.
- **Zoning grid visualization**: while any zone tool is active, render the
  zonable cells along roads (within 3 tiles of a road, buildable) as faint
  translucent grid squares (the classic zoning grid) — green-tinted where hovered
  brush will paint. Implemented as an instanced quad layer fed from grid data;
  hidden when tool inactive.
- **Selection highlight**: selected building gets a green edge outline
  (screenshot 1) — emissive edge shell or outline pass around its instance,
  plus a floating map-pin sprite above the roof while the panel is open.

## 6.5 Night cycle & emissive city (reference screenshot 4, night scene)

The night look is three layers, all deterministic (patterns seeded by building/
instance id — zero per-frame randomness, no Math.random):

- **Sky & light ramp**: `setTimeOfDay(t)` keyframes — day (warm sun, light-blue
  sky) → golden hour (low warm sun, orange horizon) → dusk (violet) → night
  (deep navy `#0a1224`, star points via a static shader/point layer, dim
  blue moon-directional at ~8% intensity, fog color follows sky). Hemisphere
  and shadow intensity lerp on the same ramp.
- **Building windows**: per-archetype procedural window-grid emissive
  (rows/cols derived from footprint × height) on the instanced material; a
  hash(buildingId, windowIndex) decides each window's lit threshold so ~40–70%
  light up, warm `#ffd9a0` with occasional cool `#cfe4ff`; windows switch on
  progressively across dusk (threshold sweeps with nightFactor, so the city
  "wakes up" over ~20s rather than popping); building base color multiplies
  toward dark blue-grey at night (the daytime tint "swap"). Abandoned
  buildings stay dark — lit windows are an Active-state signal. Implemented
  with three TSL node material + instanceIndex hash; one material per
  archetype, zero extra draw calls.
- **Street lamps**: instanced lamp posts auto-placed along road tiles (every
  3rd tile, alternating sides, deterministic from tile coords), emissive head +
  additive glow sprite + a warm **ground light-pool quad** — the screenshot's
  dominant night cue — pooled/instanced, no real point lights (perf budget
  §ROADMAP 8). Lamps fade in on the same dusk ramp. Vehicle headlight/taillight
  quads are a stretch inside this ticket.
- **Clock coupling**: visual time-of-day runs on `VISUAL_DAY_TICKS` (own
  constant, ~2 min real time per full cycle at 1×), decoupled from the
  calendar day (TICKS_PER_DAY=200 would strobe day/night every 10s — the
  classic city-builder clock/visual decoupling). Status-strip clock shows
  visual time; date advances on sim days.
- **Boot at morning, not midnight (playtest fix, 2026-07-22)**: tick 0 must
  read as **09:00**, not 00:00 — a fresh city that boots into `nightFactor=1`
  is a near-black screen and made every placed model invisible in playtest.
  One shared constant `CLOCK_START_OFFSET_TICKS = round(VISUAL_DAY_TICKS *
9/24)` is added to the tick in BOTH places that derive visual time (the
  main-thread `dayT` computation and `ui/format`'s status-strip clock) so the
  displayed clock and the lighting always agree. Pure display shift: sim
  ticks, saves, and the calendar are untouched.

## 6.6 Building visual language (reference screenshot 5, low-poly city models)

The reference look is box-geometry buildings whose identity comes from facades:
crisp repeating window grids, a distinct ground floor, a parapet band, stacked-
box setbacks on towers, rooftop clutter. We get there in two stages:

**Stage 1 — procedural facade shader (wave 3).** Extends the night-window grid
(§6.5) into a full day/night facade on the instanced material — one system,
both looks, windows guaranteed to align:

- **Window grid**: floors = height/3.2m, bays from footprint; grid drawn in
  shader (mullion lines + inset window cells). Day: window cells tinted
  glass-blue with slight per-window reflectance variation from the §6.5 hash;
  night: same cells emissive per the lit-threshold sweep.
- **Wall palette by archetype family** (from catalog color as base): glass
  curtain-wall (blue, window cells dominate), masonry (brick red/brown,
  punched windows, visible spandrel bands every floor), concrete panel (grey,
  narrow windows), beige plaster (res low). Deterministic per-instance hue
  jitter ±4% from building id.
- **Ground floor**: first 3.2m band gets storefront treatment (taller glazing,
  darker frame, entrance rectangle centered on the road-facing side).
- **Parapet**: top 0.4m darker band; flat roof tint slightly darker than walls.
- **Silhouette variety**: level-2/3 grown buildings render as 2–3 stacked
  boxes with 10–20% setbacks (deterministic from id) — one extra instance per
  tier, same instancer; rooftop props (AC box, antenna) as a small instanced
  prop set on buildings taller than 20m.
- Construction state keeps the §6.5 treatment (scaled + grey); Abandoned gets
  boarded (dark window cells, desaturated walls).
- **Palette preset (reference screenshot 6)**: the base city reads
  _desaturated_ — off-white/bone/grey walls with beige/tan accents and rare
  dark accents (industrial), saturation reserved for zone tints, overlays,
  selection green, and night glow. Family hues from §6.6 stay but clamp
  saturation low (masonry ≈ dusty tan rather than fire-red). This keeps data
  lenses and highlights legible on top of the city.
- **Roofs (screenshot 6)**: every flat roof gets the treatment, not just
  towers — roof plate tinted distinctly from walls (white/grey/tan rotation by
  id hash), parapet lip, and rooftop props on MOST roofs: count scales with
  roof area (1 vent on a 1×1 house … 4–6 AC units on big slabs), threshold
  dropped from 20m to any building ≥ 2 floors; single-floor sheds get a vent.

### 6.7 Streets & ground detail (reference screenshot 6)

Roads graduate from tinted quads to readable streets — all vertex-color/
geometry work on the existing per-chunk road mesh, no textures required:

- **Asphalt**: light-grey per §6.6 palette (darker than sidewalk, lighter than
  the old near-black), slight tier darkening (highway darkest).
- **Lane markings** as thin geometry strips: two-lane = dashed white
  centerline; avenue = solid double center + dashed lane lines; highway =
  existing center stripe upgraded to double-solid + edge lines. Dash phase
  deterministic from tile coords so segments align across chunks.
- **Intersections**: marking strips stop at any tile whose mask has ≥3
  connections (the junction box stays clean asphalt) — reads as a real
  crossing exactly like the render; crosswalk bars at junction edges are a
  stretch item.

**Roads v2 (playtest round 2, 2026-07-23 — city-builder street reference: median
avenue + proper intersections + true-ratio paint):**

- **True-ratio paint**: line strips drop from tile-scaled to real-world
  proportions — paint width ~0.15m; centerline dashes ~3m painted / ~4.5m
  gap (metric dash phase still derived from GLOBAL world coords so the
  pattern is continuous across tile and chunk seams); avenue center = double
  solid pair; highway = solid edge lines just inside the pavement edge.
- **Carriageway ratios**: two-lane carriageway narrows toward ~9–10m of the
  16m tile (sidewalk bands widen to fill), avenue ~13–14m, highway near
  full-width with shoulder bands instead of sidewalks. Vehicle/parked-car
  lateral offsets must stay consistent with whatever widths ship (adjust
  their constants in the same change if they derive from tier specs).
- **Proper intersections** (any tile with mask popcount ≥3, plus 2-way
  90° corners keep plain suppression): each connecting approach arm gets a
  **stop line** (~0.4m bar across the approach half, ~1m before the junction
  box) and a **zebra crosswalk** (bars ~0.45m wide × ~2.4m long at ~0.6m
  spacing, spanning the carriageway, sitting between stop line and box).
  Junction interior stays clean asphalt. Turn arrows on approach lanes are
  the stretch item (straight/left glyphs as 2–3 quads each).
- **Avenue median**: straight avenue runs (popcount ≤2, collinear) carry a
  raised ~1.8m center median — concrete edge tint, grass-green top — with a
  deterministic low tree (simple trunk+canopy, ~every 2nd tile, from tile
  hash) planted on it; median and trees break at intersections and corners
  so turn paths stay clear (the genre-standard tree-lined boulevard read).
- **Highway divider**: straight highway runs get a low ~0.6m concrete
  barrier band instead of a painted median.

**Roads v3 — catalog expansion + road-carried utilities (user request
2026-07-23, source: city-builder road-design reference):**

- **Road-carried utilities (the realism core)**: the genre rule — every road except
  highways implicitly carries water/sewage pipes and a 40 MW low-voltage
  power line. SlimCity adopts it: power and water no longer radiate from
  utility buildings as plain radius coverage — they propagate along the ROAD
  GRAPH from any road tile adjacent to a supplying utility building, and a
  building/zone tile is powered/watered when within 1 tile of a _supplied_
  road. Highways conduct power only (street lighting), never water. The §6
  power/water lenses keep working unchanged (they read the same coverage
  bytes); disconnected road islands correctly read unsupplied.
- **Catalog v3 new specs** (roads.json + RoadSpec additive fields
  `noiseMult`, `oneWay?`, `carriesWater`):
  - **Gravel Road** — ¢8/tile, slow (speed 8), capacity 200, unlock M0:
    dusty tan unpaved look, no paint, no curbs, 2× noise (genre-standard numbers).
  - **Alley** — ¢14/tile, narrow (~6m), no sidewalks, unlock M1.
  - **One-Way Road** (two-lane footprint, both directions' capacity one
    way) — unlock M1: pavement direction arrows every ~3rd tile; RoadNetwork
    gains directed edges; A* and cosmetic vehicles respect direction (in the
    genre, service vehicles must detour — ours simply route with the graph).
  - **Four-Lane Road** — between avenue and two-lane (¢32/tile, unlock M1),
    dashed lane dividers, no median.
- **Road noise**: roads emit into the Noise field by tier — gravel 2×,
  standard 1×, highway 3× (genre-standard multipliers) — scaled by assigned traffic
  volume so busy arterials read loud on the noise lens.
- **Explicitly deferred (§9)**: roundabouts + curved geometry (no curved
  roads v1 — ROADMAP §9), parking-lane roads, quays, bridges/elevation,
  asymmetric lane counts, pedestrian streets, decorative sidewalk-tree
  upgrades beyond the §6.7 avenue median.
- **Sidewalks**: a lighter raised curb strip (0.08m) along every road edge
  that borders a non-road tile — one extra quad pair per edge tile, vertex
  colored near-white.

**Roads epic R2 — transit lane variants (user request 2026-08-06):** additive
cosmetic road types on the existing 1-tile model, NOT a refactor. Two new
tiers (roads.json + RoadTier append at 8/9), each differentiated by a colored
lane band painted on the carriageway plus a periodic white glyph, with the
white lane markings reused from an existing tier:

- **Bus Lane** (tier 8) — ¢55/tile, unlock M2, capacity 2200: four-lane-width
  carriageway with the four-lane white marking set; the outer curbside lane
  each side is painted terracotta (the universal transit-lane tint) with a
  periodic white transit **diamond** centered in it. The dashed lane divider
  falls exactly at the band's inner edge, reading as the bus-lane separator.
- **Bike Lane** (tier 9) — ¢28/tile, unlock M1, capacity 750: three-lane-width
  carriageway with the two-lane dashed centerline; a green edge strip each
  side carries a periodic white **bicycle** pictogram (two wheel rings + frame
  - handlebar/seat bars, viewed top-down).
- Colored bands + glyphs are painted on STRAIGHT runs only (like the avenue
  median / one-way arrows); junctions and turns break the band, matching how
  real lane paint stops at crossings. `emitColoredLaneBands` sits just above
  the asphalt plate and below the white paint so markings/glyphs read on top.
  Both variants are paved, bidirectional, curbed — carriageway half-widths
  flow through `carriagewayHalfWidthMeters`, so lamps/furniture/vehicles place
  correctly with no per-tier edits. UI: a new **Transit Lanes** roads sub-tab.
  **Roads epic R3 — tram track (user "start R3" 2026-08-06):**

- **Tram Track** (tier 10) — ¢70/tile, unlock M3, capacity 1900: a two-lane-
  width shared street with two embedded steel rails at a 1.5m gauge plus
  periodic cross-tie sleepers down the centre (`emitTramTrack`), and NO painted
  centerline (the rails are the centre). Sleeper phase is anchored at global
  world-meter 0 so ties line up across tile/chunk seams. Track paints on
  straight runs only and breaks at junctions/turns, like the R2 bands.

**Roads epic R4 — dedicated rail line (user "start R4" 2026-08-06):**

- **Rail Track** (tier 11) — ¢40/tile, unlock M4: a dedicated heavy-rail line —
  a dark ballast bed (`paved: false`, no curbs/markings/crosswalks) carrying
  the same `emitTramTrack` rails + sleepers on a narrower (gravel-class)
  corridor. Emitted outside the `spec.paved` gate so it fires on the unpaved
  bed.
- Rail is present on the grid (blocks building) but is NOT a street. A shared
  `isStreetTier(tier)` helper (`src/shared/types.ts`, excludes None + RailTrack)
  gates it out of every functional road system: the drivable vehicle graph
  (`buildGraph` via a street-only `computeDrivableMask`, so cosmetic cars,
  service vehicles, garbage trucks, and the traffic field never route onto
  rail), pathfinding (`edgeTraversable` backstop), road-carried utilities
  (power/water conduction), and zoning frontage / growth road-access / service
  coverage. The render mask is unchanged, so rail still abuts roads as a level
  crossing. UI: joins the **Transit Lanes** sub-tab.
- Roads epic complete: R1 furniture kit → R2 bus/bike lanes → R3 tram → R4 rail.

### 6.8 Vehicle kit (reference screenshot 7, low-poly vehicle set)

Vehicles graduate from single boxes to the toy-kit look — multi-part merged
geometry, still one InstancedMesh per kind (no draw-call growth):

- **Construction**: per-kind merged BufferGeometry of 3 parts — body slab,
  darker inset cabin/window mass (`#1a1f26`), wheel cylinders. A region mask
  vertex attribute lets `instanceColor` tint ONLY body vertices; windows/
  wheels keep their fixed colors.
- **Kind mapping** (existing VehicleKind protocol, no sim change): Car →
  sedan / wagon / hatch silhouette variants picked by slot-index hash; Truck →
  box-truck / pickup variants; Bus → long body with window band. Variants are
  geometry offsets inside the merged kind mesh (scale/section tweaks), chosen
  deterministically — the buffer protocol is untouched.
- **Palette**: curated ~10-color saturated list (red, blue, teal, green,
  magenta, pink, yellow, orange, white, charcoal) by slot hash — deliberate
  saturation contrast against the §6.6 desaturated city; yellow reads as taxi
  without needing a livery system.
- **Night** (fulfills the §6.5 stretch): warm headlight emissive quads front,
  red taillights rear, switched by nightFactor threshold — headlight _cones_
  and ground pools stay deferred.
- **No wheel spin** — imperceptible at RTS zoom; skipped deliberately.
- **Service liveries** (police lightbar, ambulance, fire ladder, roof-sign
  taxi) are deferred to the cosmetic service-dispatch feature (ROADMAP §10
  backlog) — they land WITH dispatch behavior, not as decoration.

### 6.9 Parked cars & lot life (reference screenshot 8, airport parking rows)

Static parked cars as an occupancy signal — not decoration:

- **Placement**: along each Active building's road-facing edge (the footprint
  side nearest a road tile), inset 0.3 tile, spaced ~0.45 tile. Count =
  min(level + 1, edge capacity); **Constructing/Abandoned buildings park
  zero cars** — an empty lot is legible sim state, matching the §6.5 rule
  that dark windows mean abandonment.
- **Look**: simple two-box cars (body + cabin) with the §6.8 saturated
  palette by deterministic hash of (buildingId, stallIndex); a near-white
  stall-line strip quad under each row (the reference's parking-lot read).
- **Perf**: one InstancedMesh, slots recycled on building remove; zero per
  frame work (rebuilt only on BuildingDelta).

### 6.10 Landmark ploppables — Airport (wave 4, reference screenshot 8)

The airport arrives as a **landmark ploppable**, not a transit system
(functional air transit stays in the ROADMAP §10 backlog): a large-footprint
(≈8×6) catalog entry, high cost, late milestone unlock, whose sim effects run
entirely through EXISTING systems — strong landValue emission (prestige),
meaningful noise + traffic emission (realism), power/water draw, upkeep. Its
visual identity is a special-case landmark mesh set: terminal slab with
rooftop monitors, control tower, apron ground plate with taxiway striping,
2–3 static parked planes at jet bridges (props, like trees — no flight sim),
and §6.9 parking rows at the entrance. Requires one new render path (landmark
mesh builder keyed by catalog id) and a catalog/data addition — queued wave 4;
more landmarks (stadium, observatory) reuse the same path later.

### 6.12 Tree kit (reference screenshot 9, varied species set)

Trees graduate from cone+cylinder to a four-species low-poly kit — merged
geometry per species, one InstancedMesh each, no textures (stage 1):

- **Species silhouettes**: broadleaf (2–3 offset canopy blobs on a trunk,
  broad — the default), pine (3 stacked narrowing cones, tall), poplar
  (single tall ellipsoid, columnar), shrub (low single blob, near-groundcover).
- **Species from map data, deterministically** (not random decoration): pine
  above 18 m elevation, poplar within 2 tiles of water, shrub where tree
  density < 128 (forest edges), broadleaf otherwise — plus a hash tiebreak so
  bands mix naturally. Density ≥ 200 tiles may place up to 3 trees (forest
  read), else the existing 1–2.
- **Color**: species base greens (deep green / olive) with ±6% per-instance
  hue/value jitter, plus a **seasonal tint uniform** keyed to the game month
  (spring fresh → summer deep → autumn olive-brown on broadleaf/shrub only,
  pines stay green → winter desaturated). Leaf-drop geometry is deferred —
  winter is a tint, stated honestly.
- **Variation**: scale 0.75–1.4, slight lean/rotation jitter, all seeded.
- API: existing build(map, seed)/clearAt stay; add setSeason(month). Stage 2:
  AI-generated billboard impostor sprites per the ROADMAP §5.2 pipeline.

**Natural scatter v2 (playtest fix, 2026-07-22 — "trees are getting placed
per grid square")**: v1's count-per-tile + ±32%-of-tile jitter leaves the
16 m tile lattice visible from the air; forests read as a dot grid. v2 keeps
the per-tile bookkeeping (clearAt must keep working tile-keyed) but breaks
the lattice — individual-tree ("sitree-style") stand variation:

- **Cluster-noise density modulation**: a smooth seeded value-noise field
  over tile coords multiplies each tile's tree count (0.0–1.6×) so equal-
  density map regions produce clearings, thickets, and lone trees instead of
  a uniform per-tile count. Counts clamp 0–4 per tile.
- **Full-tile jitter**: offset range widens to ±0.46 of a tile (edge margin
  only, no cross-tile bleed — ownership/clearing stays per-tile) with a
  minimum same-tile separation so multi-tree tiles don't self-overlap.
- **Stand-correlated size**: per-tile "stand maturity" draw (0–1) shifts the
  scale range — mature stands 1.0–1.6 with the odd sapling, young stands
  0.45–0.9 — so clumps read as stands of different ages, not clones.
- Same PRNG discipline: everything from the existing mulberry32(seed) stream
  - tileHash; zero Math.random.

### 6.13 Ground cover — grass variation (reference screenshot 10; per user: no

blade geometry, color variation with brown patches)

All vertex-color work on the existing terrain chunks — zero new geometry:

- **Grass tint variants**: 3 hues (fresh green / olive / yellow-green) blended
  by low-frequency value noise over world coords (seeded, deterministic) — the
  "different grass types" read.
- **Brown dry patches**: a second higher-frequency splotch noise drives
  patches toward dry brown; bias patchiness up where tree density is low
  (open plains) and at higher elevation, down in lush low areas.
- **Manicured vs wild**: tiles under park footprints and within 1 tile of
  roads render the uniform fresh-green variant (the "mown lawn" read from the
  cut-grass reference); wild ground gets the full variation + patches.
- Subtle darkening under dense tree clusters (canopy shadow read).

### 6.6b Industrial family details (reference screenshot 11, warehouse kit)

The industrial facade family gets its own language, matching the kit:

- **Sheds**: large-footprint industrial renders as long low volumes with a
  roof cap band (bevel illusion of the curved roof), corrugated wall striping
  (fine vertical stripe modulation in the facade shader), and a single
  **accent stripe band** (red or blue by id hash) at 2/3 height — the kit's
  signature.
- **Palette**: steel blue / light grey / off-white walls (§6.6 desaturated
  rules apply), grey roof plates.
- **Props (massing ticket)**: industrial level 2+ gets a smokestack (tall
  cylinder, warning-light emissive at night); large industrial (≥3×3) may get
  a 3–4 silo cluster at a footprint corner (deterministic); rooftop vents per
  §6.6 roofs-everywhere.
- **Overhang loading doors (2026-07-29):** the industrial ground floor shows a
  repeating row of wide roll-up/sectional loading doors on every face
  (`INDUSTRIAL_DOOR_BAYS`), overriding the ground-floor windows — the
  loading-dock read.
- **Truck parking (2026-07-29):** industrial lots park box **trucks** (the
  shared parked-vehicle silhouette scaled to a ~2.4×2.4×7 m box truck), where
  commercial lots park cars. Homes never street-park (garage/driveway; §17).
  Deferred: a true multi-row/side parking lot needs sim lot-reservation — the
  current road-facing stall strip (apron + stripes) reads as a small lot.

### 6.14 Sky, sun & clouds (reference screenshot 12, cumulus photo — wave 4)

Three layers on top of the existing §6.5 time-of-day ramp:

- **Sky dome**: gradient dome replacing the flat background color — deep blue
  at zenith falling to pale haze at the horizon (the photo's read), colors
  driven by the same keyframe ramp (warm horizon at golden hour/dusk, deep
  navy at night behind the stars). One inverted-sphere shader, no textures.
- **Sun disc + glow**: visible sun billboard (bright core + soft glow sprite)
  placed along the directional light's direction — warm and enlarged near the
  horizon, white at noon; swaps to a dim pale moon disc at night. The light
  itself is unchanged; this is the visible body it was missing.
- **Cumulus clouds, "sometimes"**: an instanced pool of 20–40 cloud
  billboards using 2–3 procedural puff sprites baked once at boot (canvas
  noise — no external assets), vertically squashed with a grey underside
  gradient for the flat-bottomed cumulus look; slow uniform drift; tinted by
  the time-of-day ramp (white noon → orange dusk → near-invisible night).
  **Coverage varies deterministically over time**: a slow seeded noise on the
  tick (≈10-game-day period) sweeps between clear skies and scattered cover —
  "sometimes clouds" without simulating weather (real weather stays §9
  deferred; this parameter becomes its input later).
- Stretch: soft cloud-shadow blobs drifting with the clouds; deferred if the
  frame budget objects.

### 6.18 Render-polish round (playtest round 3, 2026-07-24 — night-town screenshot)

Seven items from a night-town screenshot. Each is scoped to keep file
ownership clean for parallel work.

- **Traffic orientation (#1, bug)**: moving vehicles render 90° sideways.
  Root cause: traffic.ts writes vehicle heading as `atan2(dz, dx)` (angle
  from +X), but the vehicle mesh's nose is +Z (front wheels at +Z), so its
  Y-yaw must be `atan2(dx, dz)`. Fix the stored heading convention (and its
  test) so a car's long axis aligns with its travel direction.
- **Parked-car orientation (#3, bug)**: stalls face the car outward from the
  building edge → perpendicular to the street ("vertical on the road").
  Rotate stalls 90° to **parallel street parking** (car long axis along the
  road), the genre default; angled (~60°) is an acceptable alternative but
  parallel is the target. Keep the deterministic stall spacing.
- **Building night darkness (#7)**: `NIGHT_BODY_TINT` multiplies day color to
  ~13% → buildings read as flat black. Lift it so night facades are a
  clearly **shaded (dimmed, cool-tinted) version of their true daytime
  color**, not black — windows keep their existing emissive glow. Target the
  perceptual "lit dusk city" look, walls still color-legible.
- **Camera scroll smoothness (#4)**: panning "jumps the map." Investigate
  CameraRig — the edge-scroll + WASD velocity path and the `clampState`
  snap. Add critically-damped smoothing on the pan target (and confirm the
  pointer-leave guard from §6.17 isn't causing a snap), so pan/zoom feel
  continuous with no discrete jumps. Pure math in cameramath.ts, tested.
- **Rounded roads (#5)**: carriageway reads boxy. Round the visible road
  geometry — chamfered/filleted corners at turns and rounded end caps on
  dangling road ends — within the existing per-chunk vertex-mesh model (no
  curved _centerlines_; ROADMAP §9 still bans true curved roads — this is
  cosmetic corner/edge rounding only, a fan of triangles at convex corners).
- **Auto-flatten under footprints (#6)**: placing a road or building on
  sloped/varied ground leaves terrain "diamonds" poking through the tiles.
  On placement, the worker **levels the footprint tiles** (and a 1-tile
  apron for roads) to a single height — the mean of the covered tiles —
  emitting the existing §6.11 heightPatches so the terrain mesh + zonegrid
  conform flat under the structure. Undo restores the prior heights (reuse
  the terraformSet inverse pattern). This is the real fix for the residual
  zonegrid clipping. Water tiles and out-of-slope-budget placements still
  reject as today.
- **Night lighting look (#2) — honest reframe of "ray tracing"**: real-time
  ray/path tracing of a full city is not feasible in a browser Three.js
  renderer (WebGPU path tracers target static scenes, not a 60fps
  interactive sim), so we will NOT claim RT. Instead deliver the _perceptual_
  goals the request is really about: (a) **light cones** — additive
  translucent cone/quad geometry under each street lamp + a warm ground
  light-pool (extends the §6.5 lamp system), fading in on the night ramp;
  (b) a **bloom/glow post-process pass** on emissive windows, lamps, and
  vehicle lights so lit sources bleed softly at night; (c) keep the existing
  shadow-mapped sun/moon (already dynamic) — tune contact darkness. All
  cheap, instanced/post-FX, no per-pixel tracing. Documented as an
  approximation in §9.

**Toolbar**: new Landscaping category (shovel) with four real tools — **Raise,
Lower, Level** (flatten to a height sampled at drag start), **Smooth**
(box-blur toward neighbors); Slope is a stretch goal. Tool options panel (§5)
gains two live rows for terrain tools: **Brush radius** (2–16 tiles) and
**Strength** (1–5); Level shows the sampled target height readout chip.

**Simulation side (this is a sim feature, not a shader)**:

- New command `terraform { mode, center, radius, strength, targetHeight? }` —
  smoothstep falloff kernel over the brush; tiles carrying roads or buildings
  are EXCLUDED from the kernel (genre-standard "can't terraform under structures";
  cursor chip shows the warning when the brush covers only excluded tiles).
- Cost per edited volume (≈¢0.5 × |Δheight| per tile), funds-gated like every
  edit; ack inverse is a `terraformSet {x,z,w,h,heights}` patch restore, so
  undo/redo is exact to the float.
- Worker re-derives per region: water mask (height < SEA_LEVEL), tree
  clearing on submerged tiles, buildability (existing checks read height).
  **Digging below sea level floods the hole** — lakes and canals are
  creatable today with zero new physics; snapshot gains a height-patch
  channel consumed by TerrainRenderer.markDirty.

**Water rendering (the §6.5-grade visual pass)**:

- **Seabed**: terrain continues visibly under water — underwater vertex
  colors ramp blue-green with depth, fully tinted at MAX_WATER_DEPTH_VIS
  (12 m), so the land-to-water line reads under the surface exactly as asked.
- **Shoreline**: foam band where |height − SEA_LEVEL| < 0.4 m (water-edge
  vertex band), giving every coast a drawn waterline.
- **Surface animation**: two scrolling normal/wave layers + a gentle
  sine-sum vertex swell, depth-keyed color (shallow teal → deep navy),
  glancing-angle opacity, and sun glint tied to the §6.5 time-of-day ramp.
- **Dimensional water v2 (playtest fix, 2026-07-22 — reference: city-builder dam
  reservoir screenshot)**: the v1 surface reads as a flat slate sheet from
  RTS camera distance (~600 m) because every animated detail lives at 7–11 m
  wavelengths and 0.15 m amplitude. v2 keeps the v1 formula family and adds
  **readability at distance**: (a) a third, long-wavelength chop layer
  (~35–60 m wavelength) in both the normal tilt and the swell so the surface
  visibly moves from the default camera; swell amplitude budget raised to
  ≤0.35 m total; (b) **analytic sky reflection** — fresnel-weighted blend of
  the §6.14 sky zenith/horizon colors into the surface color (fed per-frame
  via a `setSkyColors(zenith, horizon)` hook from the §6.5 ramp; no render
  pass, no cubemap); (c) **animated shoreline foam** — where baked depth <
  ~0.8 m, a scrolling band of foam brightening that pulses against the §6.11
  static waterline; (d) broader two-lobe sun glint so the glitter track
  survives the wide shot. All four mirrored as pure tested functions, same
  as v1. Planar reflections (a true mirror render pass) stay deferred — §9.
- **Explicit non-goal**: dynamic fluid flow (a genre-standard flowing rivers/flood sim)
  stays in the backlog with rationale — heightfield flow is a perf tar pit,
  and the derived sea-level model covers seas, lakes, and dug canals.

**Stage 2 — asset upgrade paths (later, either/both):** (a) AI-generated
facade trim-sheet atlases (ROADMAP §5.2) replacing the procedural wall/window
patterns via per-archetype UV mapping — same instancer, texture swap; (b) real
GLTF building kits per archetype — InstancedMesh accepts any geometry, so
BuildingInstancer's contract (apply deltas, id maps, picking, night factor)
is unchanged; kits must ship with baked window-emissive masks to keep §6.5.
Both paths slot in without touching sim or protocol code.

### 6.15 Utility & service silhouettes (playtest fix, 2026-07-22)

Playtest verdict on v1: "I don't actually see any models when attempting to
drop power plant / roads / parks" — root causes were the midnight boot
(§6.5 fix) **and** that utility ploppables render as generic §6.6 facade
boxes: a wind turbine was a 40 m office tower with glowing windows. Ploppables
whose real-world silhouette _is_ their identity get a **detail kit** (the
§6.10 LandmarkRenderer pattern — a kit renderer beside BuildingInstancer fed
the same BuildingDelta stream, merged low-poly geometry, deterministic from
instance id):

- **wind-turbine**: tapered mast, nacelle, 3-blade rotor **spinning slowly**
  (frame-loop `update(tMs)`, deterministic phase from instance id), pale
  §6.6 bone white.
- **water-tower**: 4 splayed legs + banded cylindrical tank + domed cap.
- **coal-plant**: dark boiler hall + 2 striped smokestacks (§6.6b chimney
  language) + coal heap wedge.
- **small-park**: the 2 m slab is replaced by a flat lawn plate (§6.13 lush
  green), a walking path cross, 2–3 §6.12 trees, and benches.
- Everything else (police/fire/clinic/school, zoned growth) keeps the §6.6
  facade system — those genuinely are buildings.

For kit-owned catalog ids, BuildingInstancer renders a **low plinth**
(≈8% of catalog height, plain desaturated slab — no window shader) instead
of the full facade box: selection picking, the §7 outline, and bulldoze
raycasts keep working through the existing instancer path while the kit
carries the visual identity. Kit parts follow §6.5 night rules (kits stay
unlit except a small red turbine nacelle beacon at night).

### 6.16 Placement footprint feedback (playtest fix #1, 2026-07-22)

"It's hard to see how big the thing you are placing is." The §6 translucent
ghost cells stay, but every preview adds a **crisp border frame**:

- **Combined outer border**: a bright 2-px-feel border quad strip around the
  _outer perimeter_ of the previewed tile set — inner edges between two
  previewed tiles are skipped, so a 4×4 power plant reads as ONE bordered
  square, a road drag as one bordered ribbon, any brush shape as its true
  outline. White at 90% when valid, §8 danger red when invalid.
- **Inner grid lines**: faint (25%) per-tile division lines inside
  multi-tile footprints so the tile count is still readable.
- **Plop volume ghost**: ploppables additionally show a translucent
  extruded box of the entry's true footprint × height (accent blue 25%,
  red-tinted when invalid) so height/mass is judged before committing —
  additive `setPreview` argument; road/zone/bulldoze/terraform previews are
  unchanged flat frames.

### 6.17 Map-edge earth cross-section + camera guards (playtest fixes #2/#3)

- **Terrain skirt**: the map currently ends in floating layer silhouettes at
  the edges. TerrainRenderer adds a **perimeter skirt wall**: for every edge
  vertex of the boundary chunks, a vertical quad strip drops from the surface
  down to a fixed base (−18 m), vertex-colored as an earth cross-section —
  thin topsoil band matching the local ground color, then dirt brown, then
  darker rock at the base. Follows terrain height (and §6.11 terraform edits
  touching edge rows rebuild the affected skirt segment); below the §6.11
  waterline the strata read through the translucent water, closing the
  "floating layers" view from outside the map.
- **Edge-scroll stop on pointer exit (#2)**: leaving the browser window kills
  `pointermove` delivery, so the last cursor position stays parked in the
  edge band and the camera flies to the map edge. CameraRig must cancel all
  edge-scroll contribution on `pointerleave` of its element, `window` blur,
  and `document` mouseleave (park the tracked pointer at viewport center),
  resuming only on the next real pointermove inside the viewport.
- **Boot framing**: initial camera distance drops to ~380 m (from 600) so a
  fresh city fills the frame with land at 09:00 light (§6.5 fix) rather than
  a horizon-dominated wide shot.

### 6.19 Zoning grid v2 — genre-standard frontage model (playtest round 5, 2026-07-24)

The zonable area is wrong in four ways; all trace to there being no single
"is this tile zonable" rule. Fix by making ONE shared pure predicate
(new `src/world/zonable.ts`) drive BOTH the visual grid (render/zonegrid.ts)
AND zone painting (world/grid.ts setZones) — today setZones lets you paint
any buildable tile regardless of roads, while the grid draws a Chebyshev-3
box; they must be the same rule, and it must be genre-standard frontage zoning:

- **Perpendicular frontage depth, default 4 (ref: city-builder road-zoning screenshot)**:
  a cell is zonable only if it sits within `ZONE_DEPTH` (=4) cells measured
  PERPENDICULAR to a road's travel axis, off a road's SIDE frontage — not the
  old king-move box. Frontage = the two sides parallel to the road's run; the
  march steps straight out from each road-adjacent frontage cell, 1..4 deep.
- **Direct access**: the outward march STOPS at the first blocking cell
  (water, another road, a building, or out-of-slope-budget) — cells "behind"
  an obstacle with no clear straight run from the frontage are NOT zonable.
- **No zoning off road ends (fixes screenshot 2: a building on a road end)**:
  a dangling end tile's frontage is only its two parallel sides, never the
  open end, so the end-cap tile and the cells straight off it are never
  zonable → nothing grows on/across a road end. (Ploppable service/utility
  buildings remain user-directed and are out of scope here.)
- **Hide when not placing**: the grid (all layers) is visible ONLY while a
  zone tool is in hand; audit main.ts so switching to select/camera/road/
  bulldoze/terraform hides it, and rebuilds never silently re-show it.
- **Residual clipping (screenshot 1)**: with the frontage rule the grid now
  hugs near-road cells (flattened by §6.18 #6 auto-flatten), but also raise
  the conform offsets and bump CELL_SUBDIV so no terrain pokes through the
  fill on the remaining sloped cells. Every grid/tint vertex must sit a small
  positive band above its own (x,z) terrain height.

### 6.20 Playtest round 6 (2026-07-24) — speed pacing, drawer exit, traffic, corners, road-on-slope

Two shipped already (solo, gate-green), documented for the record; three are
wave work.

- **Speed pacing (done)**: the 1×/2×/4× buttons now map through
  `SPEED_MULTIPLIERS` (shared/constants) to real-time factors 0.5 / 2 / 8 —
  a calm 1× (a visual day ≈ 4 real min, half the old pace) with exponential
  ×4 steps. FixedTimestep stays a pure multiplier driver; the worker maps the
  button before advancing. Determinism unchanged (tick logic identical).
- **Drawer ✕ exits placement (done)**: the asset drawer's close button now
  drops the active tool back to `select` (in addition to closing the drawer),
  so placement mode ends and the zoning grid hides. Distinct from the staged
  Escape stack, which keeps its one-stage-per-press behavior.
- **Traffic realism v2 (wave)**: cosmetic vehicles currently ride the road
  CENTERLINE (tile centers) with no lane offset, so both directions overlap
  into a chaotic bumper-to-bumper clump (playtest "crazy busy", cars appearing
  to leave the road). Fix: (a) offset each vehicle perpendicular to travel to
  its right-hand lane (drive-on-right) by a tier-derived half-lane, so
  opposing flows separate and cars sit on the carriageway, not the paint; (b)
  cap concurrent cosmetic vehicles relative to the live road-tile count (a
  tiny town must not spawn a 1000-car jam) while keeping the statistical
  volume model intact; (c) confirm paths never traverse non-adjacent tiles
  (no cross-grass shortcuts — they shouldn't today, assert it); (d) the
  visible car speed must scale with the playback multiplier (it rides the
  tick rate — verify it reads right at 1×/2×/4×).
- **Corner rounding v3 (done, 2026-07-29)**: earlier fillet/corner-fill
  attempts still read as a squared L with a hard corner. Replaced entirely: a
  turn tile (exactly 2 adjacent connections) is now a true **quarter-annulus
  curved road** (`emitCurvedTurn`) — a constant-width carriageway swept 90°
  around the tile corner shared by the two connected sides (inner radius
  `armDepth`, outer `TILE_HALF + coreHalf`), meeting each edge opening at
  ±`coreHalf` so it is seamless with the straight neighbor tiles. Curved
  sidewalks fill the rest of the tile to its edges (inner fan sector + outer
  band). Cosmetic only — the road graph stays grid-aligned (ROADMAP §9).
  - **Curved centerline (done, 2026-08-05):** plain-centerline turn tiles
    now carry **curved lane markings** (`emitCurvedMarkings`), the arc analog
    of `emitAxisMarkings`. The curved carriageway is a constant-width annulus
    (`armDepth = TILE_HALF - coreHalf`), so its centerline radius is exactly
    rMid = TILE_HALF and radial half-width coreHalf; a straight-tile marking at
    perpendicular offset `o` maps to an arc at radius `rMid + o`. Each line is
    a thin ribbon `[r-PAINT, r+PAINT]` swept over the 90°, dashed (same
    DASH_PAINT/DASH_GAP metric as the straight arms) or solid. Per-tier set
    mirrors the straight run: two-lane / one-way single dashed centerline;
    avenue / four-lane double-solid center + dashed lane lines; highway solid
    edge lines; gravel / alley none. Reuses `emitCurvedTurn`'s pivot +
    `at(r,θ)` math verbatim so the paint tracks the carriageway exactly, and
    forces up-facing tris (single-sided material). Dash phase is anchored at
    the arc start — a small offset from the straight arms at the junction,
    fine on a curve. Verified with a before/after Playwright render on a
    seeded two-lane L-road (the app renders under GPU in the Playwright browser
    here); avenue/highway are milestone-locked so unreachable from the dev
    command path — those are covered by the roadsmesh winding + per-tier
    marking unit tests (identical arc primitive, different radii).
- **Road-on-slope placement (wave)**: roads currently can't be placed up an
  embankment — `isBuildable`'s single `MAX_BUILD_SLOPE` (4 m) gate rejects
  the tiles. Roads should be placeable on MODERATE slopes (auto-flatten
  §6.18 #6 already levels/banks the footprint on placement), rejecting only
  when the grade exceeds a steeper `ROAD_MAX_SLOPE` (≈ 10 m/tile) — "bank it
  but flatten to allow, unless too extreme." Add the road-specific slope
  gate (buildings keep MAX_BUILD_SLOPE); the existing footprint auto-flatten
  then makes the placed road sit clean on the re-leveled ground.

### 6.21 Zoning types expansion — genre-standard zone set (user request 2026-07-24)

Grow the 5-zone model (ResLow/ResHigh/ComLow/ComHigh/Industrial) into the
fuller genre-standard set, milestone-gated to city size, each with its own low-poly
building look. ADDITIVE + save-safe: existing ZoneType numbers 1–5 keep their
values; new zones take new numbers.

**New ZoneType values** (append; do not renumber 1–5):
`ResMediumRow = 6`, `ResMedium = 7`, `Mixed = 8`.

**Zone set + milestone progression** (our MILESTONES 0–6; the genre's 0/1/2/5/8/9
remapped to our city-size tiers):

- **Low Density Housing** = ResLow (single/semi-detached houses) — M0 (have).
- **Medium Density Row Housing** = ResMediumRow (row houses, narrow attached
  1×2..1×6 footprints) — M1. NEW.
- **Medium Density Housing** = ResMedium (small apartment blocks) — M2. NEW.
- **Mixed Housing** = Mixed (commercial ground floor + apartments above;
  building carries BOTH residents and jobs) — M3. NEW.
- **High Density Housing** = ResHigh (large apartment towers) — bump to M4.
- **Low Density Business** = ComLow (stores/shops) — M0.
- **High Density Business** = ComHigh (malls/offices/hotels) — bump to M4.
- **Industrial** = Industrial — M0/M1 (unchanged).

**Growth/demand**: `zoneSector()` (growth.ts) maps every new residential zone
(ResMediumRow/ResMedium/ResHigh) and Mixed to the `res` sector; Mixed's
building simply carries jobs too (no demand-model change — com demand already
reads jobs). Growth already selects catalog entries by `entry.zone` + level +
`unlockMilestone`, so new zones work once their catalog entries exist. Each
new zone gets **3 levels** of catalog buildings (like the existing zones),
with distinct footprint / height / residents/jobs / color so the instancer's
§6.6 facade system renders them visibly different (row houses = narrow, low,
attached rows; medium = mid-rise blocks; mixed = com-tinted base + res tint
above; high = tall towers). Row-house massing may get a light massing tweak
in render/buildings.ts if the generic box reads wrong.

**UI**: tools.ts (ZONE_TOOL_TO_TYPE/LABEL) + ui/categories.ts drawer cards
gain the new zone tools under the Residential sub-tab (Low / Medium Row /
Medium / High) plus a Mixed sub-tab, each card showing its unlock milestone;
locked cards behave like every other milestone-gated card. zonegrid.ts
`zoneTintColor` gains RCI tints for the new zones (residential greens; Mixed a
distinct teal between res-green and com-blue). No dead controls — every new
card zones end-to-end and grows real buildings.

## 7. Building info panel (screenshot 1 anatomy, floating left)

- Header: icon + display name (`{catalog name} · #{id}` until street addresses
  exist), close ✕.
- Status line: happiness-face glyph + state word (Content/Constructing/
  Abandoned — from BuildingState + tile happiness field, requested with the
  selection).
- Rows (label caps-grey left, value right):
  - `ZONE` — zone/category display name ("Low Density Residential").
  - `LEVEL` — pips: filled rounded segments level/3 (green), genre-standard.
  - Res: `HOUSEHOLDS n/cap` (cap = residents/4 rounded up, occupied portion
    from population share) and `RESIDENTS n`; Com/Ind: `JOBS n`; Service:
    `COVERAGE kind + range`; Utility: `OUTPUT MW/kL`.
  - `UPKEEP ¢n /mo` (catalog), and for grown: `TAX ¢n /mo` (real: occupants ×
    rate × land-value factor — same formula economy uses).
- Problems as orange chips with icons (No Power, No Water, No Road, High
  Crime, High Pollution, Low Demand).
- No household-name lists, wealth tiers, rent, or color customization — §9.

## 8. Visual style tokens (Tailwind theme)

- Panels: `bg-[#0d1621]/85 backdrop-blur-md`, border `1px #ffffff14`, radius
  10px (drawer/panels) / 6px (cards/chips); shadow `0 4px 24px #0008`.
- Accent (active/selected/links): `#38b6e3`; positive `#5dd06b`; warning
  `#f0a13c`; danger `#e5533f`; RCI: R `#63c96a` C `#4a9fe3` I `#e3a44a`.
- Text: white 92%, labels uppercase 10px tracking-wide grey 60%.
- Icons: single set, line style, 20px (lucide-react or inline SVGs — one
  style, no emoji in final chrome; emoji placeholders acceptable only behind a
  `data-placeholder` marker inventoried for replacement).
- Level pips: 6×14px rounded-sm, filled `#5dd06b`, empty `#ffffff1f`.

## 9. Deferred (visible in screenshots, intentionally NOT built yet)

Household name lists & citizen wealth (needs cohorts), rent/income economics
per household, building color customization picker, street names + road
labels, elevation stepper & bridges, parallel road mode, curved/complex curve
tool modes, weather/temperature, XP numeric progression (we show milestone
progress only), photo mode & stats charts (wave 3), right-edge journal rail,
planar water reflections (a true mirror render pass — §6.11 v2 ships analytic
sky reflection instead), real-time ray/path tracing (§6.18 ships light cones +
bloom + shadow-mapped sun/moon as the feasible approximation — a browser city
sim cannot path-trace at interactive framerates).
Each lands only with its backing system — never as chrome.

## 10. Wave-2 ticket map

1. `ui-restyle` — rebuild App layout to §1–§3 (dock + status strip + corner
   buttons), style tokens §8, migrate existing components into the dock.
2. `asset-drawer` — sub-tabs + pictogram cards + lock states (§4), tool
   options panel with real flags only (§5).
3. `world-feedback` — ribbon/cell ghost previews, cursor chip stack, zoning
   grid layer (§6) in src/render + src/tools preview plumbing.
4. `selection-info` — outline/pin highlight + building info panel data
   enrichment (§7): selection payload from worker (state/problems/occupancy/
   tax/happiness-at-tile).
5. `status-strip-data` — clock/season/trends/happiness face store wiring (§3).
6. `night-cycle` — sky/light ramp keyframes + stars, deterministic emissive
   window system with dusk sweep + night tint swap, instanced street lamps
   with glow pools (§6.5); VISUAL_DAY_TICKS decoupling.
   Acceptance for every ticket: TDD per project rules, no dead controls, side-by-
   side eyeball against the four reference screenshots.

## 10b. Wave-6 ticket map (playtest feedback round 1, 2026-07-22)

1. `ghost-outline` — §6.16 border frame + inner grid + plop volume ghost
   (owns render/ghosts.ts).
2. `camera-leave` — §6.17 edge-scroll stop on pointer exit (owns
   render/camera.ts).
3. `terrain-skirt` — §6.17 perimeter earth cross-section (owns
   render/terrain.ts).
4. `tree-scatter` — §6.12 natural scatter v2 (owns render/trees.ts).
5. `water-v2` — §6.11 dimensional water v2 (owns render/water.ts).
6. `utility-kits` — §6.15 silhouette kits + instancer plinth mode (owns NEW
   render/utilitykits.ts + additive buildings.ts change).
   Integration: §6.5 CLOCK_START_OFFSET_TICKS (constants + ui/format + main),
   §6.17 boot framing, all wiring, gates, AND the visual smoke harness
   (tools/visual-smoke.mjs — screenshots must be looked at; 1375 green unit
   tests shipped an invisible game once already).

---

## 11. Bus transit (epic — v2 backlog, ROADMAP §10)

Player-built bus lines over the existing road graph; statistical ridership; cosmetic buses.

- **Contracts (added by the contracts phase):** `TransitLine { id, stops: TilePoint[], color }`; Commands `createTransitLine`/`updateTransitLine`/`deleteTransitLine` (worker owns the authoritative line list); SimSnapshot additive `transit?: { lines: TransitLine[]; ridership: number[] }`; `LensId += 'transit'`; a `bus-stop` ploppable in catalog.json (small, road-adjacent); VehicleKind.Bus already exists (2).
- **Sim (NEW src/sim/transit.ts, pure + injected RoadNetwork/pathfind):** a line is an ordered stop list; route = A* concatenation of stop→stop paths over roads (reuse world/pathfind). Ridership is statistical: a line's ridership scales with the population/jobs within N tiles of its stops and the line's road-length (no per-agent sim). Ridership relieves road volume proportionally (a modest congestion feedback) — keep it simple + tested.
- **Render (NEW src/render/transit.ts):** instanced bus-stop posts at stops, a colored route ribbon along the line's road path (transit overlay), and cosmetic buses (VehicleKind.Bus) spawned along the route at a density from ridership — reuse the VehicleRenderer buffer conventions/lane offset.
- **Tools/UI (wired by integrate):** a new `transit.line` tool (click stops in sequence, commit line), a Transit dock category with the bus-stop card + line tool, and the transit overlay lens.
- **Acceptance:** place stops, draw a line, buses appear running it; ridership reads on the transit lens; determinism preserved (no Math.random/Date.now); all existing traffic tests green.

## 12. Service dispatch (epic — cosmetic, ROADMAP §10 / M6 "feels alive")

Fire/police/ambulance vehicles actually drive from stations to incidents. Cosmetic — coverage/economy unchanged.

- **Contracts:** `Incident { kind: 'fire'|'crime'|'medical'; x; z; severity; }`; SimSnapshot additive `incidents?: Incident[]` + a service-vehicle channel (reuse the vehicle buffer with new `VehicleKind.Fire=3/Police=4/Ambulance=5`, or a parallel buffer — contracts picks one); no player command (automatic).
- **Sim (NEW src/sim/dispatch.ts, pure + injected RoadNetwork/pathfind + registry):** deterministically spawn incidents (seeded, rate scaled by pollution/crime/coverage gaps — reuse existing fields), pick the nearest covering station, A* a route station→incident→back, resolve the incident after a travel+service time. No effect on the existing service-coverage sim beyond consuming it as input.
- **Render:** service-vehicle liveries (red fire truck / blue police / white ambulance) on the route — extend the vehicle kit deterministically; an incident marker pin at active incidents.
- **Acceptance:** start a fire (or let one spawn) → a fire truck routes from the station to it and back → incident clears; deterministic; existing service/traffic tests green.

## 13. Districts & policies (epic — ROADMAP §10)

Paint named districts; apply per-district policies.

- **Contracts:** `District { id, name, color }` + a per-tile district id layer (additive GridState `district: Uint8Array` OR a render-thread-only mask fed by patches — contracts decides; prefer a worker-owned layer for policy application); `Policy` set (e.g. `lowTax`, `highTax`, `noHeavyTraffic`, `greenEnergy`); Commands `paintDistrict { districtId, tiles }` + `setDistrictPolicy { districtId, policy, on }`; SimSnapshot additive `districts?` patches; `LensId += 'districts'`.
- **Sim (NEW src/world/districts.ts + src/sim/policy.ts, pure):** district paint = a flood/brush layer; policy application modifies the relevant per-tile/economy inputs for tiles in that district (e.g. tax multiplier feeding economy, a traffic-weight bump feeding pathfind cost). Keep policy effects small, explicit, tested.
- **Render (NEW src/render/districts.ts):** a colored district overlay (like the zone tint) + boundary lines; a districts lens.
- **Tools/UI (integrate):** a `district.paint` tool, a Districts dock category, and a per-district policy panel (toggle policies for the selected district).
- **Acceptance:** paint a district, toggle a policy, see its effect (e.g. lower tax → that district's tax row changes / growth responds); overlay reads; determinism preserved.

## 14. Stats charts + photo mode (epic — M6 unfinished)

Data-viz infoview + a demo-reel camera.

- **Contracts:** none in the sim protocol — stats history is recorded render-side from the existing `SimSnapshot.stats` stream; photo mode is UI/render only.
- **Stats (NEW src/ui/statshistory.ts + src/ui/StatsPanel.tsx):** a ring-buffer recorder sampling population/funds/demand/happiness from each snapshot; a panel drawing simple line charts (SVG, no external chart lib) with a couple of series toggles. Opens from a dock/corner button.
- **Photo mode (NEW src/render/photomode.ts helper + a small UI toggle):** hides all DOM chrome, unlocks the CameraRig to a free-fly (or just wider pitch/zoom + hidden UI), optional day-time scrub; ESC exits. Deterministic; no sim coupling.
- **Acceptance:** charts plot live history and update as the city runs; photo mode hides the UI and lets you frame a clean shot, ESC restores; existing UI/camera tests green.

### Epic wave ownership (playtest → epics, 2026-07-25)

Contracts phase (one agent) owns src/shared/types.ts + constants.ts + src/data/*.json — ALL additive protocol/type/data for §11–§14. Each epic agent owns ONLY its NEW modules + tests and must use dependency injection (never import another epic's or a chokepoint file; export a clean API + list required wiring). The integrate agent (lifted ownership) wires everything into the chokepoints — worker.entry.ts (commands + tick systems + snapshot channels), main.ts (renderers + tool routing + photo toggle), tools.ts, ui/categories.ts, ui/store.ts, ui/App.tsx, render/overlays.ts, ui/icons — then runs gates + the visual smoke harness per epic.

---

## 15. Transit & props visual polish (playtest, 2026-07-25)

Render-only refinement round (no sim/protocol changes) from reference images.

- **Bus-stop shelter (render/transit.ts):** replace the bare stop post with a real modeled shelter — roof canopy on 2 posts + a bench + a stop sign/pole, low-poly, instanced, deterministic per stop. Reads like the genre-standard reference. Keep the existing stop position/data contract.
- **Pedestrians (NEW render/pedestrians.ts):** cosmetic low-poly people — a few idling at each bus stop and a sparse scatter walking sidewalks near Active buildings. Instanced, deterministic (seeded/hashed, NO Math.random, NO agent sim — pure decoration; ROADMAP §9). Fed stop positions (transit snapshot) + building positions (building deltas) via apply(); a slow deterministic walk-cycle offset from an update(tMs) frame hook is fine.
- **Shadows on small elements:** ensure lamps, bus stops, shelters, pedestrians, vehicles (cosmetic + service), trees, and buildings all `castShadow`/`receiveShadow` appropriately so small props read as grounded. Tune the sun shadow-camera (scene.ts) coverage/resolution to include them within the §8 budget (no per-frame cost blowup — instanced meshes cast as one).
- **Street-lamp model detail (render/lamps.ts):** upgrade the §6.20 cantilever lamp to a properly modeled luminaire — tapered pole, arm bracket, a real lamp housing (not a bare box), still instanced + night-emissive + light cone. More detail, same deterministic placement.
- **Road-end cap v2 (render/roadsmesh.ts + terrain ground-cover):** the wave-10 dead-end cap rounds the ASPHALT but leaves the sidewalk square and skips the ground transition. (1) The curb/sidewalk arcs around the cap at the cap radius (curb-follows-cap, like §6.20 corner curb-follows-fillet). (2) A sidewalk→dirt→grass transition ring conforms to the rounded cap perimeter (extend the §6.13 road-adjacent dirt band to the arc, not just square tiles).
- **Acceptance:** stops read as shelters with a few people; lamps look modeled; small props cast shadows; a dead-end road shows a rounded sidewalk + dirt→grass ring. Determinism preserved; all gates green; per-item screenshot review.
- **Status (2026-07-29):** road-end cap v2 DONE — curb/sidewalk arc wraps the cap (`emitEndCapCurb`) and a worn-earth dirt→grass apron ring (`emitEndCapApron`) feathers it into the lawn, conforming to the rounded perimeter. Bus-stop/pedestrian/lamp/shadow items still open.
- **Status (2026-08-05, shelter/lamp/pedestrian visual review):** all four models were already implemented across prior waves (shelter = roof + 2 posts + bench + sign; idlers + sidewalk walkers; full cantilever luminaire; shadows). A Playwright close-up review of a grown city surfaced two genuine readability gaps, both now fixed. (1) **Lamp pole read as a flat black wire** in daylight — the old `POLE_COLOR 0x2a2e33` sat below the Lambert shading range, so a slim pole disappeared into a 1 px dark line; lightened to a mid charcoal `0x50555d` (lamps.ts) that takes visible sun shading and reads as painted metal. (2) **Idle pedestrians stood in the carriageway** — they scattered 0.8–2.2 m in a full circle around the stop's road-tile _center_, while the shelter sits 4.8 m off to `shelterSide`; idlers now cluster around the shelter's ground anchor on the sidewalk. main.ts enriches each transit stop with its shelter anchor (via the exported `computeStopHeading`/`shelterSide`/`computeShelterLayout`) and pedestrians.ts scatters idlers around that anchor (falling back to the tile center when absent, so the pure idle-placement unit tests are unchanged). Verified with a daylight before/after Playwright render of a grown town; full suite green (2146), tsc + eslint clean.
- **Status (2026-08-05):** shadow/grounding DONE. Casters were already set on lamps, bus-stop shelters, pedestrians, cosmetic + service vehicles, trees, buildings, and every `InstancedSlotPool` (house/utility/park kits, props); terrain + water receive. The remaining gap was the _receivers on the ground plane_: roads and parking aprons used an unlit `MeshBasicMaterial`, which ignores lights and so could never show a cast shadow. Switched the road material (roadsmesh.ts) and the parking-apron material (parked.ts) to `MeshLambertMaterial` (both still `FrontSide`, so the §6.20 winding rules hold; `computeVertexNormals()` added since the pavement geometry carried none). Road faces are flat +Y, so daylight reads nearly as uniform as the old fill while now taking car/lamp/building shadows and shading with the sun; `setNightFactor` stays as an extra night dim on top of the lighting. Also set parked cars + median trees to cast. The sun shadow-camera was already a focused 360 m span that follows the camera target (~0.35 m/texel — resolves poles/props). Verified with a before/after Playwright render on a seeded two-lane L (shadow lands on the pavement in the lit build, absent in the unlit one) plus roadsmesh/parked/scene unit tests.

## 16. Scale bible — one human-scaled proportion for the whole city (user request 2026-07-29)

The world reads as one consistent scale, anchored on the **cosmetic car = 4.0 m long × 1.8 m wide** as the human-scale unit. `TILE_METERS = 16` is fixed (load-bearing: grid, fields, pathfinding, saves) — so "narrower roads + smaller homes" turns the leftover tile area into **yards and grass verges**, which is the intended suburban look, not wasted space. All dimensional constants across roads, vehicles, buildings, and props conform to the table below; where a file's own numbers disagree, this section wins.

**Roads** — the paved _carriageway_ is lanes only; the rest of the tile is sidewalk + grass verge. Standard lane ≈ 3.25 m. Half-width fraction = carriageway ÷ (2 × 16):

| Tier     | Lanes         | Carriageway | Half-width fraction | (was) |
| -------- | ------------- | ----------- | ------------------- | ----- |
| Alley    | 1             | 3.5 m       | 0.109               | 0.188 |
| Gravel   | ~1.5          | 5.0 m       | 0.156               | 0.219 |
| TwoLane  | 2             | 6.5 m       | 0.203               | 0.300 |
| OneWay   | 2             | 6.5 m       | 0.203               | 0.300 |
| FourLane | 4             | 13.0 m      | 0.406               | 0.425 |
| Avenue   | 4 + median    | 15.0 m      | 0.469               | 0.425 |
| Highway  | 4 + shoulders | 14.5 m      | 0.453               | 0.460 |

Local streets get visibly narrower (TwoLane 9.6→6.5 m); arterials stay wide — the contrast is the point. Cosmetic-vehicle lane centers re-derive from the new carriageway (lane center = ±carriageway/4), so cars still track their lanes.

**Vehicles** (already realistic — the anchor; unchanged): car 1.8 × 1.5 × 4.0 m, truck 2.2 × 2.6 × 7.0 m, bus 2.5 × 3.0 × 10.0 m, service ≈ fire 2.4 × 2.8 × 8.2 m.

**Buildings** — standard storey 3.2 m. Footprint _fill_ is zone-aware (not one global 0.85): detached homes leave a yard; dense/commercial fill more of the tile.

| Zone                     | Storeys      | Eaves height | Roof              | Footprint fill           | Notes                         |
| ------------------------ | ------------ | ------------ | ----------------- | ------------------------ | ----------------------------- |
| ResLow (detached)        | 1–2          | 3.2–6.5 m    | pitched 2.0–3.5 m | ~0.55 (8–9 m in tile)    | yard + driveway + garage      |
| ResMediumRow (townhouse) | 2–3          | 6.5–9.5 m    | shallow pitch     | ~0.75 wide, narrow units | attached, per-unit 5–6 m bays |
| ResMedium (small apts)   | 3–4          | 10–13 m      | low/flat          | ~0.8                     | small pitched or flat cap     |
| ResHigh                  | 5–14         | 16–45 m      | flat              | ~0.85                    | keep tall (unchanged)         |
| ComLow / ComHigh         | 1–2 / 4–10   | as catalog   | flat + parapet    | ~0.85                    | re-checked vs. car anchor     |
| Industrial               | 1 (tall bay) | 6–10 m       | flat/sawtooth     | ~0.9                     | low & wide sheds              |

**Props:** street lamp pole ~5.5 m; bus-stop shelter ~2.6 m; residential fence ~1.2 m; trees 4–12 m (unchanged).

## 17. Residential home models — procedural houses (user request 2026-07-29, ref: suburban detached-homes screenshot)

Residential buildings currently render as the same tinted `BoxGeometry` box as commercial/industrial — only color + window density differ — so a "house" reads as a small office block. Give the residential zones real **procedural house geometry**, still fully instanced, layered over the existing facade-shader body as separate instanced **kits**:

- **Pitched roof kit:** an instanced roof prism (gable/hip variants) capping ResLow/ResMediumRow/ResMedium bodies, sized to the body footprint, seeded per building for gable-vs-hip + orientation + roof-color palette. ResHigh/Com/Ind keep a flat roof.
- **Garage + driveway (ResLow):** a small attached garage box offset to one side + a driveway strip decal running to the road frontage. Seeded presence/side per building.
- **Fenced yard (ResLow/ResMediumRow):** a low instanced fence/hedge ring around the yard margin inside the tile (the gap between the shrunk body and the tile edge), broken at the driveway. Reads as a private lot.
- **Massing variety:** body footprint fill + eaves height + roof pitch/type + wall & roof palette all seeded per building id (deterministic hash, no Math.random), so a residential block reads as a varied street of individual homes, not clones. Bounded variant set for instancing.
- **Re-proportion:** apply the §16 residential heights + zone-aware footprint fill so homes sit at 1–2 storeys with visible yards, human-scaled against the §16 narrower local streets and the 4 m car.
- **Constraints:** all kits instanced + deterministic; night cycle still works (bodies keep the emissive-window shader; roofs/garages/fences are unlit geometry that takes the same day/night body tint); lifecycle tint (constructing/abandoned) still applies to bodies; picking still resolves to the building body. Determinism hash-test + per-archetype vertex/kit tests; screenshot review (daylight top-down + angled street).
- **Owners:** render/buildings.ts (kits + instance feed), a possible render/housekits.ts helper for kit geometry, src/data/catalog.json + shared/types.ts BuildingCatalogEntry (roof/garage/fill/variant fields), render/roadsmesh.ts + vehicles.ts (§16 road width + lane offsets).
- **Status (2026-07-29):** shipped as render/houses.ts `HouseRoofRenderer` (full house kit) + catalog. Detached homes have a hard **2×2 minimum footprint** (nothing smaller ever builds): res-low-1 = 2×2 (no garage), res-low-2 = 2×3 and res-low-3 = 3×3 (both garage). Each detached/row home gets a per-seeded **pitched gable roof**; every 2×3+ detached lot that faces a street also gets an **attached garage**, a **driveway** strip to the road, and the resident's **car parked on the driveway**. Homes never street-park — render/parked.ts skips `category==='res'` (that lot-parking feature is commercial/industrial only). Roof/garage/driveway share the body's night tint; the car is lit naturally. All kits instanced + deterministic; picking still resolves to the body.

## 18. Terrain conformance — heightAt matches the rendered surface + footprint-max seating (user request 2026-07-30, "fix terrain clipping for good across all types")

Terrain still poked through roads and buildings on any varied ground. Root cause was a mismatch between how the terrain is _rendered_ and how everything else _samples_ it — not something the §6.18 #6 auto-flatten or the §6.19 conform-offset band could fully cure, because both only mask the symptom. Fixed at the source:

- **heightAt now reproduces the triangulated mesh (render/terrain.ts):** the terrain chunks are `PlaneGeometry`, i.e. a piecewise-linear surface split along each quad's `u+v=1` diagonal into two triangles, but `heightAt()` returned a **bilinear** blend that only agrees with that surface at the four corners. Every road/driveway/apron/prop sampling `heightAt` mid-quad therefore sat below a terrain bulge and let it poke through. `heightAt` now interpolates within whichever triangle the point falls in, so it returns the exact height the GPU draws. A factored-out `cornerHeight(ix,iz)` (the bilinear-of-4-cells average) is provably equal to the old value at every corner, so the **mesh geometry is byte-for-byte unchanged** — only the between-corner interpolation switched from bilinear to triangulated. Every consumer of the injected `heightAt` callback (roads, driveways, parking aprons, ground props, vehicles, pedestrians, lamps) is corrected by this one change.
- **Footprint-max base seating (render/footprint.ts `maxHeightOverFootprint`):** buildings/roofs/setback tiers/roof-props seated their base at the footprint **centre** height, so on a slope the uphill footprint corner rose above the base and terrain spiked through the body. They now seat at the **maximum** terrain height over the footprint's `(w+1)×(d+1)` tile-corner grid. Because footprint corners land exactly on terrain vertices and the surface is piecewise-linear between them, that max is exact (not sampled/approximate) — no terrain can rise through the body. All four seat points (render/buildings.ts, massing.ts, houses.ts, props.ts) call the one helper with the same formula, so body, roof, tiers and roof-props stay mutually flush; on a slope the lot floats by at most the corner-to-corner terrain delta rather than embedding.
- **Relationship to earlier mitigations:** this supersedes the offset-band workaround (§6.19 "raise conform offsets") as the primary fix; the §6.18 #6 placement auto-flatten still runs and now mostly makes lots flat anyway, so the seating delta on real lots is small. `ROAD_QUAD_FLAT_EPSILON`/subdivision were left as-is — with a mesh-accurate `heightAt`, the existing road Y-offset covers the tiny residual between road sample points.
- **Verification:** GPU rendering is unavailable in the build environment (headless WebGPU → WebGL2), so no Playwright screenshots. Guarded instead by a **mesh-oracle** unit test — build a real chunk, read its actual triangles, and assert `heightAt` equals barycentric interpolation over them at ~1,000 interior points (also proves the diagonal and blocks any regression to bilinear) — plus corner/flat/clamp cases and `footprint.test.ts`. Full suite green; final visual confirmation is the user's eyeball on hilly ground.
- **Owners:** render/terrain.ts (`cornerHeight`, triangulated `heightAt`), render/footprint.ts (`maxHeightOverFootprint`), render/buildings.ts + massing.ts + houses.ts + props.ts (seat points).

## 19. Start / main menu + game lifecycle (user request 2026-08-05)

A start screen shown on first load, with a self-generated **SlimCity** logo (no commercial-game references) and **New Game / Save Game / Load Game / Options / Quit**; buttons disable when unavailable. Built as four parallel modules on disjoint files + a sequential integrate pass.

- **Lifecycle via reload (true teardown).** `boot()` became `startGame(session)` and only runs in the `playing` screen; the app-level intent lives in `sessionStorage` (`src/app/session.ts` — `AppSession = 'menu' | {playing, seed, mode, saveId}`). New Game / Load / Quit write intent and `location.reload()`, so the worker + WebGL context + listeners are torn down by the browser (zero leak risk) and the fresh boot re-reads the intent. Save + Options act live in-game. `main()` gates: `playing → startGame`, else mount a menu-only UI (no world/worker).
- **New Game = random seed.** `randomSeed()` (crypto, app-layer — never in the sim tick) seeds a fresh procedural map. The seed is stored in the save header (it already was, from the worker's `init`), so **Load reconstructs the exact terrain** by reading `header.seed` before generating the map, then posting `loadSave`.
- **Multi-slot save browser.** `persist.ts` gained `listSaves()`/`getSaveById()`/`deleteSave()`/`loadSaveById()` over the existing up-to-10 IndexedDB store; `SaveBrowser` lists name + formatted timestamp with Load/Delete.
- **Options** (persisted to localStorage, `GameSettings`): **Bloom** (default on — gates the bloom pass live each frame), **Sandbox: unlock all build items** (sends the `{kind:'setSandbox'}` worker command that bypasses the milestone gate, and flips the AssetDrawer lock), and minimal **audio** (master volume + mute, settings-backed for when audio lands).
- **UI.** `StartMenu`/`OptionsPanel`/`SaveBrowser`/`BrandLogo` are pure presentational components; `MenuScreen` composes them + wires the store/session. It renders on the `menu` screen and as a paused in-game overlay (opened via a ☰ corner button; Escape closes it). Disable rules: Save + Quit need an active game; Load needs ≥1 save.
- **Verification.** Unit: persist helpers, sandbox-bypass worker test, component RTL tests (full suite green, 2145). The dev environment **does** render under GPU in the Playwright browser (contrary to the §18 note written before that was known), so the whole loop was validated live: first-load menu with correct disabled states → New Game (random-seed world) → in-game overlay → Save (verified persisted to IndexedDB) → Load list → Options → Quit (verified full teardown, save survives).

## 20. Traffic realism — on-road cars, tied to people, rush-hour rhythm (user request 2026-08-05)

Two complaints about the cosmetic traffic: (1) cars appeared to **drive off the road**, streaking straight across grass to the far end of a street; (2) traffic **"just existed"** — a constant ambient stream unrelated to the city's people or the time of day. SPEC §3.5 stands (statistical assignment + cosmetic agents on _real_ routes); this makes the cosmetics read correctly.

- **Off-road streak = a pooled-slot handoff, not a route (render/vehicles.ts).** Cosmetic vehicles live in a fixed slot pool; `TrafficSystem` frees an arrived car's slot and can reallocate it to a brand-new car elsewhere on the map **in the same tick** (the free list is LIFO, and `advanceVehicles` runs before `sampleTrips`). Snapshots are posted every `SNAPSHOT_TICKS` (=2) ticks, so a slot's two consecutive snapshots could be an old route's end and a new route's start, and `lerpVehicle` interpolated straight between them — the mesh slid across the terrain. Fixed with a **teleport guard**: a real vehicle covers under ~0.4 tiles/tick (TICK_RATE 20), so any prev→curr jump beyond 2 tiles is a handoff, not motion — `lerpVehicle` snaps to `curr` instead of lerping. (The pre-existing inactive-marker snap already handled clean despawns; this covers same-window reuse.) The two renderer tests that interpolated an impossible 100 m/snapshot step were retuned to a realistic ~12 m step.
- **Tied to people (already the model, now enforced by the gate).** Every sampled trip is a resident→job commute: the worker builds the origin list from Active **residential** buildings and the destination list from Active **commercial/industrial** buildings, and `sampleTrips` no-ops when either list is empty — so no car exists without a home and a workplace behind it.
- **Rush-hour rhythm + population scale (src/sim/traffic.ts).** The trips generated per tick were a constant `TRIPS_PER_TICK`; they now come from `tripsForTick(population, tickNo)` = `round( rushHourActivity(hour) × (BASE_TRIPS_PER_TICK + POP_TRIPS_SPAN × min(1, population/POP_FULL_TRAFFIC)) )`. `rushHourActivity` (pure) peaks at the morning (~08:00) and evening (~17:30) commutes over a daytime plateau and drops to a small overnight floor between ~21:00 and ~06:00, using the same visual-day phase the render clock shows (`dayHourFromTick` off `VISUAL_DAY_TICKS`/`CLOCK_START_OFFSET_TICKS`). So roads fill toward the `vehicleDensityCap` at rush hour and empty out at 3am, and a bigger city carries more cars (both from the population term and because the density cap scales with road-network size). Population only _adds_ on top of a baseline, so a small-but-active town still shows daytime traffic. `tick` keeps a `population`-less fallback to `TRIPS_PER_TICK` for the pure test doubles.
- **Verification.** Unit: `rushHourActivity` peaks/overnight-floor, `dayHourFromTick` phase, `tripsForTick` (baseline at pop 0, population bonus, overnight → 0, deterministic), an integration tick showing far more trips at a rush-hour tick than an overnight tick, and the `lerpVehicle` teleport-snap vs. normal-step guard. Full suite green (2153); tsc + eslint clean. Visual: a Playwright capture of one grown city screenshotted at a rush-hour sim tick vs. an overnight sim tick (render pinned to daylight both times so only car density differs).
- **Owners:** render/vehicles.ts (`lerpVehicle` teleport guard), src/sim/traffic.ts (`rushHourActivity`/`dayHourFromTick`/`tripsForTick`, `sampleTrips` trip budget), src/sim/worker.entry.ts (passes `population` to `traffic.tick`).
- **Not done here (possible follow-ups):** cars physically pulling _into_ a parking lot / driveway at trip ends (currently they despawn at the destination road tile); per-vehicle home↔work identity (still aggregate-statistical per §3.5).

## 21. Garbage & waste management — landfill (painted) + incinerator (user request 2026-08-06)

Active buildings in **all three sectors (R/C/I)** generate trash over time (rate ∝ level/occupancy). Uncollected trash accumulates as a per-tile pressure that reads on a **trash lens** and nags land value/happiness nearby. Two facilities remove it; both service a **road-based radius** so a small/medium city needs one and a large city needs several placed around it to cover every zone.

- **Landfill — a painted AREA, not a ploppable.** A landscaping-style brush paints/erases landfill tiles (mirrors the district paint pattern: a `paintLandfill` command + a `GridState.landfill` Uint8 layer, no buildability gate beyond land/not-water/not-road/not-building). Collected trash **piles up** on the painted tiles to a max height; total capacity = `landfillTileCount × MAX_FILL_PER_TILE`. Render raises a trash-pile mesh per tile ∝ fill. When the whole area is full its service radius **stops being collected** → the player paints more area (adds capacity) or builds an incinerator. Available at a low milestone. Monthly upkeep ∝ painted-tile count.
- **Incinerator — a large ploppable, higher milestone.** A `garbage` catalog descriptor: a **400 000-unit buffer** that **burns** stored trash at a fixed rate (a permanent solution while burn rate ≥ the city's trash inflow) and **emits air pollution** (into the existing Pollution field) as the trade-off; ships with **4 cosmetic garbage trucks**. If inflow outpaces the burn long enough the buffer fills and its radius stops being collected until another facility is added. Flat monthly upkeep.
- **Collection (statistical, road-BFS).** Each tick's collection cadence: active R/C/I buildings add trash to a per-tile trash layer; each facility with remaining capacity **collects** the trash of buildings within its road-BFS radius (reusing the `services.ts` `roadBfsDistances`/radiate pattern) into its store; a full facility collects nothing. Buildings reached by no facility (or only full ones) keep their trash → the lens reddens and a happiness/land-value nudge applies. Cosmetic garbage trucks (`VehicleKind.Garbage`) animate facility↔serviced-building on the shared vehicle buffer, exactly like the §12 service vehicles — routing is cosmetic-only per §3.5.

**Contracts (shared/types.ts):** `Command += { kind: 'paintLandfill'; tiles; on: boolean }`; `GridState += landfill: Uint8Array` (persisted, trailing, **SAVE_VERSION 3**, defaulting to 0 for v1/v2 saves); `VehicleKind += Garbage: 6`; `LensId += 'trash'`; `SimSnapshot` gains a `landfill?: { tiles patches; fill: 0..1 }` channel (pile heights + area) and a `trash?` coverage channel (lens); `BuildingCatalogEntry += garbage?: { collectionRange; bufferCapacity; burnRate; trucks }`. Trash itself is **runtime sim state, not a scalar FieldId and not saved** — it rebuilds within a few ticks of load (like traffic volume), so the field-count/save surface is untouched.

**Stage plan (each stage ends green + Playwright-checked):** A = landfill core (trash generation + `paintLandfill` + collection + fill + full-stops-collection + render pile/tint + `'trash'` lens + upkeep + paint tool + drawer card). B = incinerator ploppable (catalog + garbage descriptor + burn + pollution + buffer + milestone gate + kit render). C = cosmetic garbage trucks (`VehicleKind.Garbage` + dispatch + servicevehicles livery). Follow-up: persist facility fill/buffer state in the save meta (Stage A ships with landfill _area_ persisted but fill resetting to 0 on load).

**Status (2026-08-06):** Stage A ✅ (committed 35abba1) and Stage B ✅ (incinerator: catalog entry `incinerator`, per-facility 400k buffer + fixed burn + full-buffer-stops-collection in `garbage.ts`, catalog `pollution` emitted while active via the normal per-building pass, milestone-3 gate + funds gate via the standard plop flow, `utilitykits.ts` incinerator kit = concrete hall + single thick flue + tipping bay, and a new **Garbage** dock category grouping the Landfill brush + Incinerator). Stage C ✅ (cosmetic garbage trucks: `src/sim/garbagetrucks.ts` `GarbageTruckSystem` dispatches each active incinerator's `garbage.trucks` count on depot→serviced-building→depot routed trips over the road graph, own 16-slot buffer overlaid before the service-vehicle tail, deterministic/no-RNG; green hopper livery in `servicevehicles.ts`). Save-persistence follow-up ✅: the landfill pile total + per-incinerator buffers now round-trip through `SaveMeta.garbage` (`GarbageSystem.serializeState`/`restoreState`), restored on load; the per-tile trash layer and cosmetic trucks stay runtime-only (rebuilt within a few ticks). Pre-Stage-A saves (no `garbage` meta) load fine — fill starts at 0.

**Determinism:** no `Math.random`/`Date.now` in the sim; trash rates, collection order, and burn are integer/tick-driven. **Owners:** shared/types.ts + src/shared/constants.ts (contracts), world/grid.ts (landfill layer + save v3) + world/landfill.ts (paint fn), src/sim/garbage.ts (NEW — generation/collection/fill/burn) + worker.entry.ts (tick + snapshot) + economy.ts (upkeep) + dispatch.ts (trucks), src/render/landfill.ts (NEW — piles/tint) + overlays.ts (lens) + servicevehicles.ts (truck livery) + a facility kit, src/tools/ (landfill brush) + src/ui/ (drawer card + lens entry), src/data/catalog.json (incinerator).

### 21.1 Landfill v2 — operated facility, not a paint stain (user request 2026-08-07)

The landfill brush behaves like the **zone brushes**, and a painted area renders as a real operated site rather than a field of trash boxes.

- **Placement follows the zoning rule.** `paintLandfill` is gated by `landfillPlacementMask` = `world/zonable.ts` `computeZonableMask` — the same "available road grid" (empty buildable land within perpendicular frontage reach of a street) the R/C/I brushes paint into; rail gives no frontage. Selecting the brush shows that grid: `main.ts` extends the `ZoneGridRenderer` visibility gate from `zone.*` to include `landfill.paint`.
- **Minimum operable area.** A connected area must reach `LANDFILL_MIN_AREA_TILES` (4) — room for the gatehouse plus a truck run in and out. A paint batch that would leave a _new_ undersized fragment is rolled back and rejected (`hasUndersizedArea`); expanding an existing area past the minimum is always fine.
- **Areas, offices, dump routes.** `landfillAreas(size, landfill, isStreet)` splits membership into 4-connected areas and derives each one's **office tile** (smallest-index street-adjacent member), its **street tile**, and a **dump path** (BFS from the office to the deepest member). Sim and render both call it, so the entrance the trucks use is the entrance that gets the building.
- **Render (`render/landfill.ts`).** The office tile is excluded from tint and piles and instead carries the **gatehouse kit**: a terrain-conforming concrete yard pad, a small office box with roof cap and street-facing door, a two-bay striped nose-in parking row, and a yard light with a glowing head — all laid out in a road-facing frame (u across the frontage, v inward from the street edge) so it stays inside its tile on any orientation. Every other member tile is **dumping grounds** (tint + pile ∝ `landfillFill`). Areas that are undersized or have no street contact get no office. The renderer is always visible (a facility, not a lens).
- **Trucks drive in and dump.** Each qualifying area is its own truck depot (negative depot ids, so they never collide with building instance ids), budget `clamp(1 + tiles/16, ≤ 4)`, skipped once the landfill is full. `garbagetrucks.ts` gains an optional `TruckDepot.dumpPath` and the phases **toDump → dumping → leavingDump** after the normal depot return: the truck drives the in-area polyline, dwells on the grounds, retraces, and despawns. Depots without a `dumpPath` (incinerators) are unchanged.
- **Frontage setback (same request).** Grown com/ind bodies were drawn over their own parking bays. `massing.ts` `frontageSetbackFor` (pure) pulls the body back from the road-facing footprint edge by exactly the bay-row depth minus the shrink margin, so the road-side face lands **flush where the bay row ends** — lot in front, building behind, no overlap and no gap; the other three faces don't move. `buildings.ts` (body/facade), `massing.ts` (base tier) and `props.ts` (roof area) all apply it, sharing `parked.ts`'s `findRoadFacingEdge`/`frontageInsetTiles` so the setback and the bays can never disagree. `roadAt` is optional on all three renderers (default "no road"), so existing call sites are unaffected.
