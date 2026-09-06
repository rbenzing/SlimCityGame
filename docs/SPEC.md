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
  2nd tile ≈ 32 m, alternating sides, deterministic from tile coords), with a
  hot-emissive luminaire head whose glow is carried by the bloom pass and a
  light pool on the pavement below it (§22) — the dominant night cue —
  pooled/instanced, no real point lights (perf budget §ROADMAP 8). Lamps run on their own clock schedule (§22), not the raw dusk
  ramp. Vehicle headlight/taillight quads are a stretch inside this ticket.
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
- **Nothing curbside seats on a tile with road on both axes** — a turn, a T, or
  a crossroads. Such a tile has no curb: the lateral offset that clears one
  carriageway lands inside the other, which is precisely how a lamp ends up
  standing in the middle of an intersection. Lamps and parking meters skip
  those tiles (`hasCrossingRoad`) and the junction is lit and served from its
  approaches instead. Manholes are the deliberate exception — they belong in
  the carriageway, so a junction is a fine place for one.
- **Curb width is what the tile has room for, not a footway by assumption.**
  A two-lane leaves plenty of tile beyond its carriageway and draws a full
  footway; an avenue or a motorway is 15m of road in a 16m tile and draws half a
  metre of kerb, because its shoulders are already inside the paved width. The
  road mesh has always clamped it that way; `curbWidthMeters` makes it the one
  number everything standing beside a road measures from — lamps, signage, and
  the deck of a bridge. Assuming a full footway instead sizes a motorway span
  nearly two metres wider than its road on each side and strands the lamp
  columns out in the blank strip between traffic and parapet.
- **One prop per curbside slot.** A sign and a utility cabinet both stand at the
  tile centre, on a side of the road, the same distance out from the
  carriageway — the same piece of ground. A tile that earns a board therefore
  seats no cabinet: the board is what the road needs to be driven, the cabinet
  is scenery and there is always another tile for it. Meters escape the clash
  by sitting ±3m along the run rather than at the centre, which is also what
  keeps them clear of a lamp.
- **Junction control follows the tier.** A junction approach on a multi-lane
  street (avenue, four-lane, bus lane) earns a **traffic signal** — a mast with
  a short arm reaching out over the carriageway and a three-lens head hung off
  it. Smaller tiers keep the boards: **stop** at a crossroads, **give way** at a
  T. Cosmetic, like the rest of the kit — the sim models no signal phase, so the
  head shows its three lenses and does not cycle.
- **A motorway is signed like a motorway, not like a street.** The highway tier
  takes none of the street furniture — no curb, so no utility boxes, no parking
  meters, no stop/give-way/bend/speed boards, and never a signal: you do not
  halt traffic on a motorway, you give it an exit. It gets its own two:
  - **Exit** where something leaves it — a cantilever: one post at the shoulder,
    a lattice truss arm over the carriageway, and a green panel hung off it with
    its exit-number tab riding above the top edge, a diagonal exit arrow, and a
    yellow advisory-speed plaque beneath.
  - **Gantry** periodically along a straight run — legs outside both shoulders,
    a truss carrying right across, and two panels beneath it with lane-assignment
    down-arrows. This is the one sign type that straddles the centreline instead
    of standing at a curb, so it takes no lateral offset.
  Both are authored reaching along +X and yawed by `signalYaw`, which every
  cantilevered type shares: a flat board reads from either side, but an arm
  pointed the wrong way hangs over the grass.
- **Direction arrows during placement.** Dragging a road whose direction is real
  — a one-way street or a highway — draws translucent arrows along the ghost
  path pointing the way the drag ran, so the player can see which way traffic
  will run *before* committing. They live in the preview layer and vanish with
  the rest of the ghost when placement ends. `arrowYaw` turns each one down the
  path, following an L-path around its corner rather than holding the first
  heading.

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
- **Dirtying a tile dirties its neighbours' chunks.** A rendered corner averages
  the four tiles around it, so the vertices along a chunk boundary are drawn by
  BOTH chunks. `markDirty` therefore expands its rectangle by a tile before
  picking chunks: rebuild only the edited chunk and its neighbour keeps the old
  height for their shared edge, parting the two meshes into a crack that shows
  the water plane straight through the ground.

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
- **UI.** `StartMenu`/`OptionsPanel`/`SaveBrowser`/`BrandLogo` are pure presentational components; `MenuScreen` composes them + wires the store/session. It renders on the `menu` screen and as a paused in-game overlay (opened via a ☰ corner button). Disable rules: Save + Quit need an active game; Load needs ≥1 save.
- **Resume Game (user request 2026-08-10).** Opening the overlay pauses the city, but closing it used to leave the clock at 0 with no hint that Space restarts it — and there was no button that simply meant "back to my game". `StartMenu` now takes an optional `onResume` and shows **Resume Game** at the top of the stack whenever `hasActiveGame`, so it is absent on the start screen where there is nothing to resume. `MenuScreen` remembers the speed the player was running at when the overlay opened and restores exactly that — including still-paused, if that is how they opened it, rather than starting a city they had deliberately stopped. Escape routes through the same `resumeGame()`, so the key and the button can never drift apart.
- **Not built: save file export/import.** ROADMAP M7 lists it, but save/load + autosave already meet the milestone's exit criteria ("ship a save, reload it, keep playing"), and a browser city builder is not a file-management app — per user call (2026-08-10), saves stay in IndexedDB.
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

## 22. Street-lamp night glow — bloom head instead of a light cone (user request 2026-08-07)

Emissive house windows read beautifully after dark because they push the bloom
pass hard (`WINDOW_EMISSIVE_STRENGTH = 2.2`); street lamps did not, because
their glow was carried by an additive translucent **light cone** whose faint
head barely crossed the bloom luminance threshold. The cone is removed and the
lamp becomes a genuine light source for the post pass.

- **No light cone.** `render/lamps.ts` drops the cone geometry/material/mesh
  layer entirely. Nothing replaces it as a beam volume over the road — the
  glow is the bloomed lamp head plus a flat pool on the pavement.
- **A hot luminaire instead.** Two emitters, both fading on the lamp schedule
  below: the **housing** (cap + cowl) ramps its emissive to
  `HOUSING_EMISSIVE_STRENGTH` (3.2 — past lit-window strength, so the fixture
  itself blooms), and a new **lens** layer — a warm sphere seated in the cowl
  mouth, offset along the housing's own tilted down axis so it stays seated
  whatever way the lamp faces — ramps to `LENS_EMISSIVE_STRENGTH` (14). The
  lens is the over-threshold core the bloom pass smears into the halo; the
  fixture is the supporting glow. Bloom is a blur of the thresholded frame, so
  emitter **area** matters as much as intensity: the lens is sized to roughly
  the cowl's own width (`LENS_RADIUS` 0.26 m) — at a pinprick size the halo
  stayed invisible at play zoom no matter how hot it burned. Near-black by day
  (a dark lens in the cowl). One instanced draw call each, no real point
  lights, no shadow casting from the lens.
- **A ground pool lights the road.** Bloom bleeds around bright pixels, so a
  halo at head height cannot brighten pavement that has none of its own — a
  wider bloom radius alone left the road dark. Each lamp therefore lays warm
  light on the pavement under its luminaire (additive, no depth write,
  `POOL_MAX_OPACITY` 0.55, sodium-warm `POOL_COLOR`, fading on the same lamp
  schedule). Three properties make it read as light on a street rather than a
  painted shape:
  - **Elliptical, aligned down the roadway** (`POOL_RADIUS` 4.5 m ×
    `POOL_ALONG_SCALE` 3 along the road, × `POOL_ACROSS_SCALE` 1 across it).
    A real cantilever luminaire aims down the road and throws a long oval;
    equal-radius circles read as isolated puddles with dark road between them.
    `axis` on a placement is the _lateral_ axis, so the pool stretches along
    the other one.
  - **Brightness from per-vertex color on concentric rings** (`POOL_RINGS`):
    a hot point decaying steeply and trailing off to zero at the rim. A broad
    flat core reads as a shape with an edge; the zero-brightness rim also means
    ground the pool can't quite match never shows a hard line.
  - **Terrain-conforming** — every vertex samples `heightAt`, because one flat
    disc at a single Y slices through a road running across a slope. That bakes
    terrain heights into the geometry, so unlike the other four layers the pool
    is **not instanced**: one merged `Mesh` rebuilt with the lamp set and
    disposed on each rebuild. It is also the lamp's largest bright area, hence
    its widest bloom source.
- **`LAMP_SPACING_TILES` 3 → 2.** A pole every 48 m was well outside real
  street-lighting practice (~25-45 m) and left long dark gaps no pool size
  could close. At 32 m, with pools stretched down the roadway, successive
  lamps light a continuous corridor — which is what a lit street looks like.
  Poles still alternate sides, so the arrangement is staggered.
- **Bloom pass:** `BLOOM_RADIUS` 0.4 → 0.9 for a wider, softer spread on every
  night light. `BLOOM_NIGHT_STRENGTH` stays 0.25 — lamp glow is bought with
  brighter/larger lamp emitters, not a stronger pass, which would blow out the
  windows that already look right. (Strength scales with `nightFactor`, so the
  radius change cannot affect daylight: at noon the pass contributes nothing.)
- **Lamp schedule (own clock, not `nightFactor`).** `nightFactor` never
  reaches 0 until noon, so lamps used to stay faintly lit all morning. Lamps
  now run on a pure `lampGlowFactor(dayT)` ramp keyed to the status-strip clock
  (`hour = dayT × 24`; sunrise 06:00, sunset 18:00): full on from **19:30**
  through **06:00**, ramping up from sunset (18:00 → 19:30), and fading out
  over the hour after sunrise to **fully off at 07:00** — one hour past
  sunrise, per the request — then off through the day. `LampRenderer` exposes
  `setTimeOfDay(dayT)` (replacing `setNightFactor`); `main.ts` passes the same
  `dayT` it feeds the lighting rig.

**Owners:** `src/render/lamps.ts` (cone removal, lens + pool layers, schedule),
`src/render/bloom.ts` (radius), `src/main.ts` (call site),
`src/render/roadsmesh.ts` (night-dim comments only — the road still dims, the
bright spots are now the lamp pools and their halos).
**Validation:** `tools/lampglow-shots.mjs` pins the clock at 22:00 / 03:00 /
06:00 / 06:30 / 07:00 / 12:00 / 18:30 over a grown residential street, with
bloom left ON (unlike the other harnesses, the glow is what is under test).

## 23. Audio — city soundscape, UI feedback, and a user-supplied music player (M6, user request 2026-08-10)

The last unbuilt slice of M6. §19 shipped Master Volume and Mute controls
"for when audio lands", so until now the Options panel carried the only **dead
controls** in the app — §10's acceptance bar forbids exactly that. Audio is an
**app-layer** concern (`src/app/`, beside `session.ts`): it reads snapshots and
settings, and is never imported by `src/sim` or `src/render`, so it cannot
touch determinism.

### 23.1 Engine & routing

- **One `AudioContext`, three buses.** `src/app/audio.ts` owns the context and a
  master `GainNode` feeding **ambient** / **ui** / **music** sub-gains, so each
  layer mixes independently under one master. Nothing is created at import
  time — a context constructed outside a user gesture starts `suspended` and,
  in some browsers, logs warnings.
- **Unlock on first gesture.** Browsers block audio until the user interacts.
  `unlock()` runs on the first `pointerdown`/`keydown` and resumes the context;
  every play call before that is a no-op rather than an error. Starting a game
  from the menu is itself a click, so the game world is never silent by the
  time it is on screen.
- **Settings drive gain, live.** Master gain = `muted ? 0 : masterVolume`,
  applied through the existing `bindActions` `onSettings` path that already
  applies bloom/sandbox live. `GameSettings` gains `musicVolume`, `musicShuffle`
  and `musicRepeat` (all persisted to localStorage with the rest).

### 23.2 Sound is synthesized, never shipped

There is no audio asset pipeline (§5 covers raster only) and binary blobs do
not belong in the repo, so **every built-in sound is generated with WebAudio
primitives** — oscillators, envelopes, and filtered noise buffers. Zero bytes
of assets, zero load time, and each sound is a pure function of its parameters.

- **Ambient bed**, remixed once per snapshot from `ambientMix({hour,
population, nightFactor})` (pure, exported, unit-tested): a **traffic** layer
  (lowpassed noise, gain scaling with population and the commute curve — loud at
  rush hour, near-silent at 3am) and a constant quiet **wind** floor. Both are
  broadband noise with no periodic feature, which is the only kind of sound that
  survives being looped forever. The curve is computed in `audio.ts` from the
  hour rather than imported from `sim/traffic.ts`, keeping the app layer free of
  sim imports.
- **Wildlife is scheduled, not looped.** The same pure mix reports a
  `wildlife` RATE and how `nocturnal` the hour is; the engine then commits
  individual calls a couple of seconds ahead on the audio clock, at gaps drawn
  fresh each time — birdsong by day (a short phrase of swept notes, loudest at
  the dawn chorus), dry cricket ticks after dark. Anything looped at a fixed
  period stops sounding like an animal within about two cycles of hearing it,
  which is exactly what a steadily-pulsed noise layer did. Wildlife thins as the
  city fills in: it belongs to the quiet edges, not downtown.
- **UI sounds**, one short synthesized cue each: `click` (tool/dock selection),
  `build` (a successful `CommandAck`), `denied` (a rejected ack or a
  `warn`/`error` notification), `notify` (an `info` notification).

### 23.3 Music — a `public/songs/` folder the player owns

The player supplies the music; the game ships none. Drop `.mp3`/`.wav` files
into **`public/songs/`** and they become the in-game playlist.

- **Discovery via a generated manifest.** A small Vite plugin
  (`tools/vite-songs-manifest.ts`) scans the folder and serves
  `/songs/manifest.json`, regenerating on add/remove while the dev server runs
  and emitting it once at build. Vite already serves `public/` verbatim in both
  modes, so the audio files themselves need no bundling. The UI also offers an
  explicit **Rescan**.
- **Idempotent.** A track's identity is its manifest path (dropped files: name +
  size + lastModified). Rescanning, re-dropping the same file, or re-running
  `initMusic()` converges on the same playlist — no duplicate entries, no
  stacked `<audio>` elements or listeners, and a rescan **keeps the current
  track playing** if it still exists rather than restarting the queue.
- **Ephemeral.** Nothing about the music is persisted or copied: tracks stream
  from disk through `HTMLAudioElement` → `MediaElementAudioSourceNode` (so a
  long album never sits decoded in memory, and seeking is free), files dropped
  onto the window live only as object URLs that are **revoked** when replaced or
  on unload, and the repo `.gitignore`s the audio formats so no one's music can
  be committed. Only _preferences_ persist (volume, shuffle, repeat) — never
  audio data.
- **Two ways in.** The folder is the documented path; **drag-and-drop onto the
  window** adds tracks to the session playlist for players who just want to try
  a file. Both funnel into the same idempotent playlist.
- **User control.** A `MusicPlayer` panel (in the Options Audio section, and a
  compact now-playing chip with prev/play/next): play/pause, prev/next, seek,
  track list with the current track marked, shuffle, repeat (off/all/one),
  music volume independent of SFX, rescan, and clear-dropped. Empty state
  explains where to put files. Shuffle takes an injected `rng` (defaulting to
  `Math.random`) so the ordering is deterministic under test — and it is app
  layer, so the §3.5 no-RNG-in-sim rule is untouched.

### 23.4 Testing

`jsdom` has no WebAudio and no `HTMLMediaElement` playback, so the engine takes
an **injected context factory** and the music player an **injected element
factory**; unit tests drive fakes that record calls. The mixing math
(`ambientMix`), the playlist logic (dedupe, advance, shuffle, repeat modes,
rescan-preserves-current), and the manifest parser are pure and tested
directly. A Playwright pass confirms the real context unlocks on gesture and a
dropped file plays.

**Owners:** NEW `src/app/audio.ts`, `src/app/music.ts`, `src/ui/MusicPlayer.tsx`,
`tools/vite-songs-manifest.ts`, `public/songs/` (+ README/.gitignore);
edits to `src/app/session.ts` (settings), `src/ui/OptionsPanel.tsx` (real audio
section), `src/main.ts` (engine lifecycle + snapshot/ack hooks), `vite.config.ts`
(plugin).
**Acceptance:** volume/mute move real sound; the city hums at rush hour and
goes quiet at 3am; tool clicks, builds and rejections are audible; dropping
MP3s into `public/songs/` makes them playable with full transport control;
rescanning twice never duplicates a track; no audio file is ever committed.

**Validation:** `tools/audio-check.mjs` drives the real browser, where the unit
fakes cannot reach: it generates a throwaway WAV into `public/songs/`, then
asserts the plugin's manifest lists it, a click gesture moves the context to
`running`, the player discovers and actually plays the file with its clock
advancing, two further rescans do not duplicate it, and mute zeroes the master
gain (restoring on unmute). It deletes the probe file on the way out.

**Status (2026-08-10):** DONE — 8/8 browser checks pass, 58 unit tests across
`audio.test.ts`, `music.test.ts`, `MusicPanel.test.tsx` and
`songsmanifest.test.ts`. Two things surfaced only in the real browser and are
worth keeping in mind: playback started from the **start menu** has no gameplay
gesture listeners behind it, so `MusicPlayer.play()` unlocks the engine itself
(otherwise menu music would bypass master volume and mute); and the runtime
scans the folder on creation rather than at game start, so the playlist is
populated in the menu too.

## 24. Advisor — what is actually wrong with the city (M6, 2026-08-10)

M6's last item. The pieces were already there and unused: every building
carries `Problem` bit-flags (`NoPower`/`NoWater`/`NoRoad`/`HighCrime`/
`HighPollution`/`LowDemand`) in the snapshot, and `CityStats` carries the
supply/demand and budget numbers. What was missing is the step that turns
thousands of individual flags into the two or three sentences a player can act
on. Toasts already report **events** ("that failed"); the advisor reports
**state** — what is wrong right now, worst first.

- **Pure aggregation (NEW `src/ui/advisor.ts`).** `cityIssues(buildings, stats)`
  returns a ranked `CityIssue[]`. No three.js, no store, no worker — a function
  of the mirrored building list plus the stats block, so the whole ranking is
  unit-testable. Two families feed it:
  - **Building problems**, one issue per flag with the count of buildings
    carrying it, and a **focus tile** taken from the lowest-id affected
    building so the same city always points at the same place.
  - **City-level checks** from `CityStats`: power and water demand outrunning
    supply, expenses outrunning income, funds gone, and jobs — both "nobody is
    hiring" and "nobody to hire".
- **Severity, then weight.** `critical` (buildings cut off from road/power/
  water, a utility grid in deficit, insolvency) ranks above `warning` (budget
  deficit, crime, pollution, unemployment) above `info` (soft demand). Within a
  severity, more affected buildings ranks higher; ties break on a stable id so
  the list never reshuffles under a player's cursor.
- **Click to see it.** Each issue with a focus tile jumps the camera there —
  `BoundActions.focusTile`, the same bridge Save/Photo use, moving the
  `CameraRig` target without touching the sim.
- **Recomputed on a slow cadence.** Snapshots arrive ~10×/s; the advisor
  aggregates every `ADVISOR_REFRESH_SNAPSHOTS`th one instead. Iterating the
  building mirror is cheap, but a list that re-ranks ten times a second is
  unreadable, and this is a panel a player reads rather than watches.
- **UI (`AdvisorPanel.tsx`).** Opened from a corner button that badges the
  number of critical issues, so an unopened panel still says "something is
  wrong". Empty state is a plain "nothing needs attention" — an advisor that
  invents problems to look busy trains players to ignore it.

**Owners:** NEW `src/ui/advisor.ts` + `src/ui/AdvisorPanel.tsx`; edits to
`src/ui/store.ts` (issues state + `focusTile`), `src/ui/App.tsx` +
`CornerButtons.tsx` (surface), `src/main.ts` (aggregate on snapshot, focus the
rig).
**Acceptance:** cut a district's power and it appears at the top within a
second, with the right count; click it and the camera lands on an affected
building; fix it and the issue disappears; a healthy city shows an empty
advisor.

## 25. Bridges & elevated roads (user request 2026-08-10)

Water is currently an absolute wall. `buildableWithSlope` rejects any tile with
`g.water[i]` set, so a river cuts the map into pieces no road will ever join,
and the procedural maps all have rivers. Every other system is ready for the
crossing — the road graph, road-carried power and water, traffic, the zoning
frontage rule — and none of them can be reached across the bank. Bridges are
the missing tile type, and elevated road is the same mechanism pointed at dry
land.

- **Elevation is one additive layer.** `GridState.roadElevation: Float32Array` —
  the deck height in metres above that tile's terrain, `0` meaning at grade. It
  rides alongside `roadTier`, so a bridge tile is an ordinary road tile that
  happens to sit higher: the road graph, the mask/auto-tiling, the utility
  propagation, and the traffic model all keep working untouched, which is the
  whole reason to model it this way rather than as a parallel network.
  Serialized last, `SAVE_VERSION` 3 → 4 → 5, following the district and landfill
  precedent — a v3 save loads with the layer zeroed and every existing road stays
  exactly where it was, and a v4 save's whole-metre bytes widen into it.
- **The offset is continuous, and it has to be.** Every consumer reconstructs
  the deck as terrain + offset, so the offset carries the fraction that cancels
  the ground underneath. Quantized to whole metres it cannot, and a level span
  inherits the shape of whatever it crosses — a dished riverbed bows a flat deck
  by up to half a metre. The solver therefore stores the exact lift, and treats
  anything under a centimetre of it as at grade so arithmetic slack on a
  genuinely grounded tile cannot bill for a bridge or deny it its frontage.
- **Elevated tiles skip the ground rules.** A deck rests on piers, so
  `isBridgeBuildable` drops both gates `isRoadBuildable` enforces: the water
  rejection (that is the point) and the slope ceiling (the deck is level
  regardless of what the ground does underneath). Bounds and the
  no-building-here check still apply. Terrain is never flattened under an
  elevated tile — the valley stays a valley.
- **Crossing water needs no new gesture.** Drag a road across a river and the
  water tiles come out elevated on their own, at the higher bank's height plus
  `BRIDGE_CLEARANCE_M` over the water surface. The approach tiles on each bank
  ramp down to grade at no more than `BRIDGE_MAX_GRADE` metres per tile; if
  there is not enough road on the bank to land the ramp, the whole placement
  fails with a `grade` reason rather than building half a bridge.
- **Raise and lower are how a bridge gets built deliberately.** The roads
  drawer's own header carries the control (`RoadToolOptions`, beside Path and
  Snap — it is that panel's state, not a floating panel of its own), and
  Page Up / Page Down drive it live while a drag is in flight, so a span can be
  raised or dropped as it is drawn. **Ground is the floor** and
  `BRIDGE_MAX_ELEVATION` the ceiling; below-ground waits on the underground
  epic. At Ground a drag still auto-bridges water. Elevation drops back to
  Ground whenever the road tool is put down: left sticky it is invisible state,
  and a height set for one viaduct silently turns the next short drag into a
  stray hump with a bridge under it.
- **What a deck looks like.** A road surface at deck height rather than terrain
  height, a girder under it so the span reads as a structure rather than a
  floating ribbon of tarmac, parapets where an at-grade tile draws curbs and
  sidewalk, and piers dropped to the terrain or seabed every
  `PIER_SPACING_TILES`. The structure oversails the carriageway by the tier's
  own curb plus the style's overhang, so the road never overhangs its own
  bridge and the deck never fans out into blank tarmac either side of it.
  Vehicles and pedestrians read the deck surface in place of `heightAt`, so
  traffic rides the bridge instead of swimming under it.
- **A deck carries lamps and right-of-way signage, and nothing else.** The
  kerbside rules invert up there: a deck has no verge to stand things on and no
  ground beneath it, so parking meters, utility cabinets, manhole covers, verge
  grass and street trees all drop out. What survives is what the road still
  needs to be driven: lamps, and the boards that govern right of way — stop,
  give-way and signals where a junction lands on the deck, plus the exit boards
  and gantries of an elevated motorway, whose signage is overhead precisely
  because nobody is walking beside it. The verge boards (bend, one-way, speed,
  no-through) go with the verge.
- **Every tier bridges, under its own rules.** Elevation is a property of a road
  tile, not a privilege of the big roads: all eleven tiers route through the
  same `buildRoad` command with the same solver, and each gets the span its tier
  earns via `bridgeStyleFor`. Their existing tier restrictions carry onto the
  deck unchanged — a motorway still takes no meters or street signs, gravel and
  alley still take no signage, and a rail line takes none of it plus no lamps,
  because a track is not a street.
- **A span is built in the family its road deserves** (`bridgeStyleFor`), so a
  player reads what a bridge carries from across the map. Four clearly
  different silhouettes rather than one per tier:
  - **plank** (gravel, alley, bike lane) — timber decking on light posts and a
    thin rail; a farm track over a creek, not an engineering work.
  - **beam** (every ordinary street) — the concrete beam on round columns.
  - **box** (avenue, highway) — a deep box girder on heavy squared piers. The
    depth *is* the silhouette; it is what a big road crossing looks like from a
    distance.
  - **truss** (rail) — a shallow deck carried inside steel lattice sides that
    rise above it with overhead bracing, the through-truss every railway bridge
    is. It carries no parapet: the truss is the edge.
  Piers, footings and truss members are instanced per family, so a city with a
  footbridge and a motorway viaduct pays per family rather than per span.
- **A deck is a ribbon, so its height is sampled along the run only.** The road
  surface interpolates the deck profile in the direction the road runs and is
  constant across it — a bridge has no camber. Interpolating in both axes drags
  the edges of the deck toward whatever the span passes over: a tile centre is
  half a tile away and the structure oversails the carriageway far enough to
  pick up a third of the riverbed, which crowns the road into a ridge and splays
  the girder into wedges hanging beneath it. A sample landing just off the
  ribbon — a wide span's structure reaches past its own tile — resolves back
  onto the deck it hangs off rather than onto the water underneath.
- **The structure conforms to the deck, it does not tile it.** Girder and
  parapets are MERGED geometry whose corner heights come from the same smooth
  sampler the road surface uses, so two neighbouring tiles evaluate their shared
  edge identically and a span runs as one continuous paved road. Giving each
  tile one flat box instead is what makes a bridge read as a row of slabs
  stacked next to each other, with a step at every tile boundary and a ramp that
  climbs in stairs.
- **The grid mirror updates before anything meshes against it.** The road
  surface sampler reads deck heights out of `ClientGridMirror`, so applying a
  snapshot's road deltas has to precede `RoadMeshRenderer.apply` — mesh first
  and the carriageway bakes at terrain height while the structure, lamps and
  furniture stand at deck height, leaving the road threaded under its own
  bridge. `applyRoadDeltas` returns the tiles whose height moved so their
  neighbours, which carry no delta of their own but do sample the ramp blend,
  can be rebuilt too.
- **What the deck costs and what it denies.** Elevated tiles add
  `BRIDGE_COST_PER_METER_TILE` per metre of height on top of the tier's own
  per-tile cost, and the same premium proportionally on upkeep — height is the
  expensive thing, not the span. A deck grants no frontage: `zonable.ts` skips
  elevated road tiles, so nothing zones off a bridge, and the ground beneath a
  deck stays occupied exactly as it is under any road tile today. Bulldozing
  clears the elevation with the tier.
- **Deferred, deliberately.** One tile carries one road tier, so a road
  crossing over another road is not representable and is not attempted here —
  overpasses need a second road layer, which is the refactor this epic exists
  to avoid. Tunnels, pier styling, and suspension/arch spans are likewise out;
  a bridge here is a slab on piers.

**Owners:** `src/world/grid.ts` (layer + serialize/deserialize + migration),
`src/world/roads.ts` (elevation in `applyRoad`/`removeRoad` + `RoadTileDelta`),
`src/shared/constants.ts` (the five bridge constants) + `src/shared/types.ts`
(`SAVE_VERSION` 5), `src/sim/worker.entry.ts` (auto-bridge + ramp solve +
costing in `cmdBuildRoad`, no flatten when elevated), `src/world/zonable.ts`
(no frontage off a deck), NEW `src/render/bridges.ts` (deck, piers, parapets)
+ edits to `src/render/roadsmesh.ts`, `vehicles.ts`, `pedestrians.ts`,
`lamps.ts`, `roadfurniture.ts` (deck height), `src/ui/ToolOptionsPanel.tsx`
(height stepper).
**Acceptance:** a road dragged bank to bank across a river lands as a deck on
piers with ramped approaches; cars and pedestrians cross on the deck; power and
water propagate over it and a zone on the far bank grows; nothing zones off the
bridge itself; the carriageway sits on the girder rather than under it, and a
span crossing a dished riverbed reads level rather than bowed; a v3 save loads
with every road at grade and a v4 save keeps its bridges; bulldozing the span
returns the river.

**Verification:** every bridge fault found so far — the road threaded under its
own girder, a crowned deck, a motorway span two metres too wide — passed the
unit suite and was caught by eye, because each was a disagreement between
numbers that were individually correct. `tools/bridge-shots.mjs` builds one span
of every structural family across a real crossing on the deterministic seed and
shoots each edge-on, along the run, and from overhead; `tools/bridge-probe.mjs`
reports the same spans as numbers — deck flatness, clearance, and where each
pier lands — so a picture that looks wrong can be checked before it is believed.
Both need the dev-only `__slimcity` hook, which takes an optional camera
yaw/pitch for the low angles these faults show at.


---

## 26. Rail transit — stations, trains, and lines on the track already laid (user request 2026-08-11)

**Why:** the rail tier ships and does nothing. A player can lay track, watch it
bridge a river on a steel truss, and never see a train — `buildGraph` filters on
`isStreetTier`, so rail is deliberately absent from the vehicle graph, and
transit is bus-only. Rail is the one built feature in the game with no behaviour
behind it. This epic gives it the behaviour, and it is mostly composition: the
transit module was written network-agnostic and has been waiting for a second
network.

- **The hinge is that transit never knew what a road was.** `routeLine` and
  `estimateRidership` take an injected `RoadNetworkApi` and call `findPath` /
  `nearestNode` on it; they contain nothing road-specific. `RoadNetwork` builds
  its graph by filtering tiles through `isStreetTier`. A rail network is the
  same class under a different tier predicate, and rail lines then route through
  the existing code unchanged. No second pathfinder, no second ridership model —
  if this epic grows one, something has been designed wrong.
- **Two networks, one graph implementation.** The tier predicate becomes a
  constructor parameter (`isStreetTier` for the road network, rail-only for the
  rail one). `computeDrivableMask` generalises the same way. The road network's
  behaviour must not change: on a rail-free grid the two are identical today,
  and the existing traffic/dispatch/bus tests are the guard.
- **A line knows its mode.** `TransitLine` gains `mode: 'bus' | 'rail'`,
  defaulting to bus so every existing line and command keeps working. The mode
  picks which network routes it and which vehicle draws it; everything else
  about a line — stops, colour, id — is shared.
- **A station is a ploppable that wants track, not road.** Bigger than a bus
  stop, at a later milestone, and gated on adjacency to rail rather than to a
  street — the first ploppable whose access rule is not "next to a road", so the
  placement check takes the tier it requires instead of assuming a street.
  Stations are where rail meets the city: a station with no road near it is
  reachable by train and by nobody else, and that is the player's problem to
  solve, not the game's to prevent.
- **Ridership is the bus model with rail's numbers.** Same statistical estimate —
  population and jobs near each stop, times a per-demand rate, times a capped
  route-length bonus — with a wider catchment and a higher rate, because people
  walk further for a train and a train carries more of them. No per-agent
  simulation here either.
- **Relief lands on the roads, not on the rails.** A bus relieves the road edges
  it drives over, which is exactly right for a bus. A train drives over no road
  edge at all, so the same rule would relieve nothing. Rail ridership instead
  relieves road volume around its STATIONS — the trips it took off the street
  are the ones that would have started or ended there. This is the one formula
  in the epic that is genuinely new rather than reused, and it is the one to
  check against the traffic lens.
- **A train is cosmetic, like a bus.** `VehicleKind` gains a rail entry and
  trains ride the existing vehicle buffer along their line's route. A train is
  several cars long rather than one box — that length is the whole silhouette,
  the way a box girder is a motorway bridge's — and it rides the deck sampler on
  an elevated stretch like everything else that follows a road.
- **Lines must survive a save.** `load()` currently replaces the transit system
  outright, so bus lines are lost on load today — a pre-existing gap this epic
  inherits rather than causes, and one that is worse for rail, since a rail line
  represents far more money than a bus route. Lines join the save payload's meta
  alongside the building registry. Bus lines get this for free.
- **Deferred, deliberately.** No timetables, no per-train capacity or bunching,
  no signal-block simulation, no freight (that belongs with the deeper-industry
  epic, not here), and no level crossings that stop traffic — rail and road
  cross visually today and continue to.

**Owners:** `src/world/roads.ts` (tier predicate on the graph builder + a rail
network instance), `src/sim/transit.ts` (mode-aware routing, rail ridership
rates, station-radius relief), `src/shared/types.ts` (`TransitLine.mode`,
`VehicleKind` rail entry, save meta gains lines), `src/sim/worker.entry.ts`
(second network, station placement rule, save/load of lines), `src/data/catalog.json`
(the station), `src/ui/categories.ts` + `TransitLinesPanel.tsx` (a rail line tool
beside the bus one), `src/render/transit.ts` + `vehicles.ts` (trains).

**Acceptance:** a rail line drawn between two stations routes over track and not
over roads; trains run it; ridership responds to population near the stations and
shows in the transit panel; road volume near a busy station measurably drops on
the traffic lens; a bus line still routes over roads exactly as before; lines
survive save and load; and a station refuses to sit where no track reaches it.

**Verification:** the road network's own behaviour is the risk — every traffic,
dispatch and bus test must stay green while the graph builder becomes
parameterised, and a rail-free city must produce a byte-identical road graph.
`tools/bridge-shots.mjs` already frames a rail truss; a train on it is the visual
check that the deck sampler carries rail vehicles too.

---

## 27. Tram transit — street-running lines on the track already laid (2026-08-13)

**Why:** the tram tier is now the only built road tier that carries nothing. A
player pays ¢70/tile for embedded rails and sleepers and gets a two-lane street
with a nicer texture — precisely the complaint that opened §26, one tier over.
The machinery §26 built (a tier predicate on the graph, a mode on a line, a
per-slot vehicle size) was built to take a third mode, and this is it. If this
epic needs a new pathfinder, a new ridership model, or a second relief formula,
something has been designed wrong.

**What a tram is, and it is not a small train.** Rail is a separate world: its
own corridor, a graph disjoint from the streets by construction, and a station
that is a building on land somebody had to clear. A tram shares the street with
the cars. That single difference is the whole epic — it changes three things,
and deliberately nothing else.

- **The tram network is a SUBSET of the road network, not disjoint from it.**
  `isStreetTier` already accepts the tram tier, so a tram tile sits in the road
  graph and the tram graph at once: cars keep driving over tram track exactly as
  they do today, and that is correct — it is a street. Trams, though, route on
  the tram graph *only*. A tram that could route down any street would make the
  track a decoration, which is the defect this epic exists to fix. The two rail
  predicates stay disjoint from each other; only tram overlaps the streets.
- **Relief is the bus's rule, not the station's — but it cannot be taken from
  the tram route directly.** A tram's riders would otherwise have driven the
  very streets it runs down, so route relief is right where a train needed
  station relief. The trap: the route comes off the tram graph, whose edge ids
  are its own numbering, and the same integer means a different edge in the road
  graph. Feeding tram edge ids to the road network would silently relieve
  unrelated streets somewhere else in the city — traffic would improve in the
  wrong place, and nothing would look broken. The relief route is therefore
  recomputed against the road network, which can carry the line because tram
  tiles are streets. That is one extra A\* per tram line per tick, for a handful
  of lines, against the thousands traffic already runs each tick.
- **A stop is a shelter, not a building.** No ploppable, no milestone gate
  beyond the track's own, no land taken — which is a tram's entire economic
  argument against a railway, and it should be the thing the player feels.
- **Ridership sits between the two.** A 10-tile catchment at 0.20 per demand
  unit: people walk further to a fixed, visible, permanent route than to a bus
  stop, and not as far as they will walk to a train.
- **A tram is two cars and keeps right.** It rides the per-slot size/speed/
  keeps-right fields §26 added for train cars, so the renderer takes no new
  concepts — a train is three cars down the middle of its own track, a tram is
  two that hold their lane like every other street vehicle.
- **Deferred, deliberately.** No overhead wires or catenary poles, no tram
  priority at junctions, no depots, and no line that mixes tram and rail track.

**Two faults this epic surfaced in the machinery under it**, both found by
running the game rather than by any unit test, and both older than the tram:

- **A stop standing mid-run was off the network.** Endpoints resolve to a graph
  node by proximity within 8 tiles, and a long junction-free run has nodes only
  at its two ends — which is precisely the shape of a dedicated transit
  corridor. A stop in the middle of one snapped to nothing, so the line silently
  carried nobody: rail had been shipping with this, and only escaped notice
  because its harness happened to place stations near the ends of the track.
  Snapping now falls back to the nearer end of the run a point stands ON, via a
  tile→edge index built lazily so routing that finds a node by proximity — all
  of traffic — never pays for it. A point genuinely off the network still
  reports as off it, and the fallback cannot bridge two networks, because the
  index only ever holds the edges of its own graph.
- **A vehicle set tore itself apart every lap.** Each car wrapped its own
  distance modulo the route length, so on an OPEN polyline the lead car
  restarted while its trailing cars were still at the far end — one tram at both
  ends of the city at once. A set now carries one shared lead distance and each
  car a fixed trail behind it, clamped rather than wrapped, so the cars queue
  briefly at the terminus instead of scattering.

**Owners:** `src/shared/types.ts` (`isTramTier`, the `'tram'` mode, the tool
id), `src/world/roads.ts` (a third network instance — no new code, just a third
predicate), `src/sim/transit.ts` (tram rates, the tram's relief route),
`src/sim/worker.entry.ts` (the tram network, rebuilt and invalidated with the
others), `src/tools/tools.ts` + `src/ui/categories.ts` (a tram line tool beside
the bus and rail ones), `src/render/transit.ts` (the tram car, and the set that
holds together), `src/world/roads.ts` + `src/world/pathfind.ts` (the mid-run
snap), `src/ui/TransitLinesPanel.tsx` (which had only ever opened for the bus
tool, and names a line by its mode now that there are three).

**Acceptance:** a tram line drawn along tram track routes over that track and
not over the ordinary streets beside it; trams run it and keep right; ridership
responds to population near the stops; a busy tram line measurably drops road
volume on the streets it runs down, and specifically not on unrelated streets
that happen to share an edge id; shelters stand at tram stops as they do at bus
stops; bus and rail lines behave exactly as they did; and a tram line survives a
save.

**Verification:** the edge-id trap is the one that would ship silently, so the
relief test asserts on the road edges under the tram's own tiles and on an
untouched decoy street built to hold the colliding id. Everything else is
covered by making a tram line do, on tram track, what the bus tests already
assert on streets.

`tools/tram-shots.mjs` grows a real district before it draws anything, because
ridership is demand-driven and an empty sandbox carries nobody — the harness
that only builds track can prove a line exists but never that it works. It reads
the transit renderer's own counts rather than reading a screenshot, since a tram
and a traffic-spawned bus are the same silhouette on the same street.

---

## 28. Building lots and archetypes — paved lots, filled grids, and models that say what they are (user request 2026-08-13)

**Why:** a building today is a shrunken box standing in grass it does not own.
`MASSING_FOOTPRINT_SHRINK` leaves 15% of every footprint edge empty (55% for a
detached home) and nothing occupies the gap, so a dense block reads as scattered
boxes rather than a street of lots. The footprint the sim reserves and the mass
the player sees disagree, and the space between them is nobody's. Meanwhile a
warehouse, a factory and an office differ only in height and wall colour: the
silhouette never says what the building does.

**The lot is the unit, not the building.** This is the hinge, and everything
below follows from it. A lot pad claims the building's WHOLE tile footprint; the
body sits on that pad, set back from the street; the remainder is paved yard,
parking or planting according to what the building is. "Fill the grid space" is
the lot's job and never the body's — a body that filled its tiles would share a
wall with its neighbour, which is why the shrink exists and why it stays. What
changes is that the leftover is now claimed, surfaced and used.

- **Lot pads tile the block.** Adjacent buildings' pads meet edge to edge with
  no grass seam, so a zoned block reads as continuous developed land. The pad
  stops short of the road at the verge the parking apron already respects, so
  the sidewalk, verge and curb-cut geometry keep working unchanged.
- **A car stands on its own lot, or at the kerb, never both** (user 2026-08-13).
  Two rules, and they compose. The ROAD decides whether its kerb may be parked
  on at all: a through-route, a reserved bus or bike lane, tram rails and a
  railway all have better uses for their edge, so a tier earns kerbside parking
  by declaring it in `roads.json` rather than by omission — today the two-lane,
  gravel, alley and one-way tiers, and nothing else. The BUILDING decides
  whether it needs the kerb: a shop or works with a bay row on its own frontage
  does not use it, and neither does a house with a garage and drive, because
  somewhere to put the car is somewhere to put the car. What is left — a small
  home, a row house, a lot too tight for bays — is exactly who the kerb is for,
  which is what makes it read as a residential street rather than as spillover.
  Utilities, parks and civic plinths never park: they have nobody to park.
  Kerbside cars sit PARALLEL, past the verge and the sidewalk and half a car
  into the carriageway, because that is what fits between a moving lane and a
  kerb; they get no apron and no painted bays, since the road is already paved.
- **Kerb furniture is vetted against the tile it stands in, not the thing that
  placed it.** A frontage is a straight line of tiles but the street it faces
  need not be: measure a row of cars from the building alone and the row marches
  off a bend onto the verge, because the building has no idea the road left.
  Every kerbside object — a parked car, a lamp, a sign — is therefore checked
  against the tile it would occupy: a road is there, that tier allows it, and
  the tile is not a junction. A junction is the general case of the bend, and it
  is excluded for a reason that is not tidiness: where two carriageways cross
  there is no kerb, so the lateral offset that clears one lane lands inside the
  other. Candidates are dropped one at a time rather than by the row, so a lot
  whose frontage runs half onto a corner still parks the half that works.
- **A driveway is a hole in the lamp line.** Lamps are placed from road tiles
  and a road tile knows nothing about the lot across the kerb, so a lamp lands
  in the curb cut and the cars drive through the post. The driveway tiles are an
  input to lamp placement and are skipped. They belong to BUILDINGS, not roads,
  so the lamp line is rebuilt when the building set changes and not only when
  the road set does — guarded by comparing the sets, so an unchanged city pays
  nothing.
- **A walker walks along the pavement, not around the house.** A cosmetic walker
  is anchored on its building's frontage sidewalk and then traces a closed loop,
  and a loop with equal radii is a circle: correctly anchored people orbiting a
  point still read as broken. The loop is stretched hard along the street and
  kept narrow across it, so it covers pavement instead of orbiting. Which way
  "along" points is read from the ROAD tile's own neighbours rather than from
  the building's facing, so a corner lot resolves to the street the walker is
  actually standing on. It stays a loop deliberately — the loop replaced an
  earlier ping-pong that snapped 180° at each end — and heading follows the
  tangent, so the turns stay smooth at both extremes.
- **An archetype is an assembly of parts, not a box with a different colour.**
  A category and level pick the parts: a **warehouse** gets a loading dock and a
  bank of roll-up doors; a **factory** gets a monitor roof over its stacks and
  silos; a **green works** gets a roof array and NO stack, which is the whole
  point of it; a **storefront** gets a canopy and a signage band, a **retail
  block** the band alone; a **house** keeps its pitched roof and an
  **apartment** stays flat-topped. Parts are shared, so an archetype is a recipe
  over one kit, and a part is one box — a whole assembly is under a hundred
  triangles.
- **Clean industry is read from what it emits, not from its name or level.** The
  green works is the industrial building whose pollution figure is zero, and the
  smokestack is gated on the same figure. The silhouette and the simulation
  therefore cannot disagree: a stack on the skyline always means pollution in
  the air, and a player can read the difference from a distance. `ind-3 Green
  Works` is the top of the ladder — more jobs than the factory, none of the
  smoke — so it is something to grow into rather than a reskin.
- **Frontage parts need a frontage.** A dock, a canopy and a sign hang on the
  road-facing wall and are skipped entirely when a building fronts no street;
  roof parts need no frontage and appear regardless.
- **The palette is calibrated and we are outside it.** The reference caps albedo
  brightness so lighting has headroom; the brightest material in the chart is
  snow at 140/142/144. Several of ours are far past it — a silo at 216/212/200,
  an AC unit at 206/210/213, a garage wall at 207/199/182, an airport structure
  at 202/197/184 — which is why lit roofs blow out. Colour also lives in five
  modules that each keep their own palette, and the duplicates have already
  drifted: two different `CAR_PALETTE`s and two different `APRON_COLOR`s. One
  module becomes the source of truth, with a test that no material channel
  exceeds 144 and nothing but snow exceeds 140. Colours are RESCALED into range,
  never clipped per channel, so hue survives the correction.
- **The budget binds the merged mesh, not the part.** The reference caps a mesh
  at 65,536 vertices. A procedural part is tens of triangles and a whole
  building assembly is in the low hundreds, so no single building can approach
  it; what can is merged ground geometry. A pad is one mesh per building — the
  pattern the frontage apron already uses — and the cap is asserted against the
  largest pad actually built rather than assumed. Merging pads per CHUNK to cut
  draw calls is deferred until measured: it would halve nothing today, since the
  apron layer already costs one mesh per building, and the right time to change
  both is together.
- **Nothing laid on the ground may clip it.** A ground surface drawn as one
  four-corner quad is a plane through its corners, so any slope between them
  pushes through it and any dip leaves it floating. Pads, aprons, driveways and
  bay markings all go through one builder that subdivides to cells small enough
  to hold no curve, samples the real surface at every corner, and splits each
  cell on the SAME diagonal the terrain mesh uses — a quad split the other way
  crosses the terrain's own triangles and clips along the seam even when all
  four of its corners are right. There were two hand-rolled copies of this
  before, which is two chances to get the diagonal wrong.
- **Deferred, deliberately.** No authored FBX/OBJ assets or importer (the
  procedural kit is the decision, per the user 2026-08-13), no per-archetype
  bespoke textures, no interior geometry, no LOD meshes — the parts are already
  cheap enough that distance culling is the whole LOD story.

**Owners:** `src/render/palette.ts` (new — the calibrated material palette and
its rescale), `src/render/groundquad.ts` (new — the one terrain-conforming
ground surface builder), `src/render/lots.ts` (new — lot pads and their
surfaces), `src/render/parked.ts` (the kerb rules and kerbside cars; it also
owns `hasGarage`, since "does this building park on its own land" is one
question whichever building asks it, and the kerb-tile vetting every piece of
furniture shares), `src/data/roads.json` (which tiers allow
kerbside parking), `src/render/lamps.ts` (the driveway exclusion),
`src/render/pedestrians.ts` (the along-the-pavement walk path),
`src/render/massing.ts` (the archetype recipe over the
setback tiers), `src/render/props.ts` (the shared part kit), `src/render/
facade.ts` + `src/render/houses.ts` + `src/render/landmarks.ts` (colour moves
out to the palette module).

**Acceptance:** every Active building stands on a paved lot filling its
footprint; neighbouring lots meet with no grass seam; commercial and industrial
lots carry parking that scales with lot depth; a warehouse, a factory and a
green works are distinguishable by silhouette alone at overhead camera distance;
no material colour exceeds the calibration; the per-chunk merged lot mesh
stays under the vertex cap with the cap asserted in a test; no kerbside object
stands off the carriageway, on a tier that forbids it, or in a junction; no lamp
stands in a curb cut; and a walker's path runs down the street it fronts rather
than around its building.

**Verification:** the palette rule is a test over the palette module, not a
review. Lot tiling is checked by measuring adjacent pads for a gap. Archetype
silhouettes are a screenshot check — they are a claim about what the eye can
tell apart, which no unit test can make. The kerb rules are checked in the
RUNNING game rather than only in unit tests: `tools/kerb-audit.mjs` grows a real
district on a staircase street that turns every other tile, then re-derives from
the live grid the tile every kerbside car and every lamp actually stands in, and
the street axis every walker actually walks. A fixture proves the rule; only the
real city proves the inputs the rule is fed, and only a street that BENDS can
fail the way these did. The audit asserts it found cars, driveways and walkers
at all, so a city that grew nothing reports nothing proven rather than green.


## 29. Road composition — lanes, junction control, ramps and furniture the player chooses (user request 2026-09-05)

**Why:** a road today is a TIER — one of eleven named things picked from a
drawer, each with its lane count, its markings, its lamps and its kerb rules
baked in. That is the right shape for a first road network and the wrong shape
for the one the user is asking for. A player who wants a four-lane street with
a turn lane at the junction, no kerb parking, and a stop sign instead of a
signal cannot get there by choosing harder: every one of those is a different
axis, and a tier collapses them into one. Meanwhile the sim's capacity is a
per-tier scalar, its junctions have no control at all (a signal head is a prop;
traffic never waits), a one-way's direction is inferred from its geometry
rather than stored, and a motorway "ramp" is whatever the two-lane tile beside
the highway happens to be. The reference city simulator ships roughly forty
road assets across the same axes and STILL never let its players pick a turn
lane or place a yield sign — those stayed automatic and unpredictable for two
years, and the community's most-installed mods are the ones that add them. That
is the gap this section builds into, and it is why the design below puts lane
arrangement and junction control in the player's hands from the start rather
than treating them as polish.

**A road is a class, a cross-section, and a set of junctions — not a tier.**
This is the hinge. Everything a player can choose lives on one of three
objects, and nothing is decided by which drawer card they clicked:

1. The **class** says what the road is FOR — dirt, rural, local street, urban
   street, collector, arterial, one-way, divided, highway, ramp, alley — and
   fixes the things a class really does fix: speed, whether it is zonable,
   whether it carries utilities, which lane pieces it may hold, what its
   default markings and control look like, what it unlocks at.
2. The **profile** is the cross-section: an ordered list of LANE PIECES from
   one kerb to the other — travel lanes with a direction, a centre turn lane, a
   median, a parking lane, a bike lane, a bus lane, a tram lane, a shoulder, a
   sidewalk, a verge — each with a width. Every tier that exists today is a
   preset profile, so nothing the player has built changes shape.
3. The **junction** is where two or more profiles meet: it owns the traffic
   control (none, yield, stop, all-way stop, signal, roundabout), the turn
   restrictions per approach, the crosswalks per approach, and the APPROACH
   LANES — how the last stretch of each incoming profile is split into
   through/left/right/shared lanes.

Markings, furniture and sim capacity are all DERIVED from those three; none is
authored separately. A dashed centre line means "two-way, passing allowed" and
nothing else; a turn arrow means an approach lane exists with that movement;
capacity is lanes × a per-class per-lane figure. The section that follows is
organised by what the player touches, and each bullet says which of the three
objects it lives on.

**Units and formulas — the sim already speaks real units, so the numbers are
real.** This is worth stating once because every figure below depends on it.
A tile is 16 m. A road's `speed` is metres per second: the existing values are
posted speeds divided by 3.6 (two-lane 14 = 50 km/h, avenue 18 = 65 km/h,
highway 28 = 100 km/h). An edge's path cost is `length / speed`, which is
therefore SECONDS, scaled by `1 + 2·(v/c)` for congestion. So a junction delay
expressed in seconds adds to the cost directly, and a capacity expressed in
vehicles per hour converts by one constant. That constant is the only
calibration in the section: **k = 3/7 game-capacity units per veh/h**, chosen
so the two-lane preset keeps its 600 (2 lanes × 700 veh/h × 3/7). Everything
else is derived:

- **Per-lane capacity** `cap = S · (g/C) · k`, with S = 1,900 veh/h/lane, the
  Highway Capacity Manual's base saturation flow for an urban lane, and g/C the
  share of time a lane actually moves, which is what separates a signalised
  arterial from a free-flowing motorway. A motorway lane has no g/C and uses
  the HCM basic-freeway figure of 2,350 veh/h/lane (free-flow 65 mph, the
  nearest to 100 km/h) instead. Unpaved and alley
  lanes use observed rural figures rather than S. Transit and bike pieces carry
  PEOPLE, so their figure is a car-equivalent of their passenger throughput at
  the sim's trip granularity. The table below gives g/C per class and the game
  figure that falls out; the eleven presets reproduce their current capacities
  exactly (see Acceptance).
- **Control delay** in seconds, from the HCM's forms simplified to the two
  inputs the sim has (volume-to-capacity x on the approach, and cycle length):
  `none` 0; `yield` 3 + 4·x²; `stop` (minor approaches only) 9 + 12·x²;
  `allWayStop` 10 + 15·x² on every approach; `signal` Webster's uniform delay
  `0.5·C·(1 − g/C)² / (1 − x·g/C)` with C = 60 s for a two-phase junction and
  90 s once any approach has a dedicated left (a third phase), g/C = the
  approach's share; `roundabout` 4 + 10·x³, the entry-delay curve of a
  single-lane roundabout, which is why a roundabout is quick until it is
  suddenly not. Delay is per movement and is added to the edge cost of the
  approach edge, so a slow junction reroutes traffic the way it does in life.
- **Warrants** are stated as v/c rather than vehicles per hour, because the
  MUTCD's absolute thresholds (major 500 vph + minor 150 vph for a signal;
  300 + 200 for an all-way stop; 2,000 vpd combined for a yield or stop
  between two minors) are each roughly a fixed fraction of the approach
  lanes' capacity, and a fraction survives any change to the sim's trip
  volume. Default control steps up when, sustained over one game month: two
  minors' combined v/c ≥ 0.15 → yield; a minor onto a wider road with the
  major at v/c ≥ 0.3 → stop; major ≥ 0.4 and minor ≥ 0.3 → all-way stop;
  major ≥ 0.4 and minor ≥ 0.25 with the major having ≥ 2 lanes per direction
  → signal. A player's override is never stepped.
- **Speed-change lanes** from kinematics, `L = (v₁² − v₀²) / 2a`: an
  acceleration lane from a 60 km/h ramp (16.7 m/s) to a 100 km/h motorway
  (27.8 m/s) at a = 1.5 m/s² is 164 m ≈ **10 tiles**, matching the AASHTO
  Green Book's 170 m; a deceleration lane at a = 2.0 m/s² is 123 m ≈ **8
  tiles**, matching AASHTO's 110–130 m.
- **Tapers** from the standard taper ratios: a lane drop on a motorway tapers
  at 1:50, so a 3.5 m lane closes over 175 m ≈ **10 tiles**; on a street at
  1:10–1:15 it closes over 35–50 m ≈ **3 tiles**.
- **Turn-lane storage** from AASHTO's minimum of 15 m plus one vehicle per
  20 s of red at 7.5 m per queued car: a local approach stores 2 cars ≈ 30 m
  → an APPROACH ZONE of **2 tiles**; a collector 4–5 cars ≈ 50 m → **3
  tiles**; an arterial 7–9 cars ≈ 70 m → **4–5 tiles**.
- **Roundabout size** from inscribed circle diameter: one tile (16 m) is a
  MINI roundabout (real range 13–25 m, ≤ 15,000 vpd); a 2×2 block (32 m) is a
  COMPACT single-lane roundabout (real range 27–45 m, ≤ 25,000 vpd). Its
  capacity is a single lane at g/C 0.85 per entry, which is what the delay
  curve above sits on.

- **Classes and their ceilings (class).** Each class fixes a posted speed, a
  per-lane green ratio, a lane-count range, and which pieces it admits, taken
  from the functional hierarchy real road agencies use:

  | class | lanes | posted km/h → speed | g/C | per-lane cap | admits | zonable | utilities | default control | default centre line |
  |---|---|---|---|---|---|---|---|---|---|
  | dirt | 1–2 | 30 → 8 | (rural 250 veh/h) | 100 | travel only | yes | water+power | none | none |
  | alley | 1 shared | 35 → 10 | (rural 400 veh/h) | 175 per direction | travel, parking | yes | water+power | none | none |
  | rural | 2 | 60 → 17 | 0.50 | 400 | travel, shoulder | yes | water+power | none / yield | none under v/c 0.15, dashed above |
  | local street | 2–3 | 50 → 14 | 0.37 | 300 | travel, parking, bike, sidewalk, verge, centre-turn | yes | water+power | none / yield / stop | dashed |
  | urban street | 2–4 | 60 → 17 | 0.37 | 300 | + bus, tram, median | yes | water+power | stop / signal | dashed; double solid with median |
  | collector | 2–5 | 60 → 17 | 0.43 | 350 | + centre-turn | yes | water+power | signal | dashed or double solid |
  | arterial | 4–6 | 65 → 18 | 0.49 | 400 | + raised median, no parking | yes | water+power | signal | double solid |
  | divided | 4–8 | 80 → 22 | 0.55 | 450 | median mandatory, no parking | yes | water+power | signal | median, edge lines |
  | one-way | 1–5 | 58 → 16 | 0.67 | 550 | travel (one dir), parking, bike, bus | yes | water+power | as parent width | none (lane lines only) |
  | highway | 2–8 | 100 → 28 | (freeway 2,350) | 1000 | travel, shoulder, barrier | no | power only | never — grade-separated | double solid + edge lines; barrier when divided |
  | ramp | 1–2 | 60 → 17 | (ramp 2,000) | 850 | travel (one dir), shoulder | no | power only | merge / diverge / terminal | edge lines, gore chevrons |

  Per-lane figures round to the nearest 25 so they read as catalogue numbers.
  A class fixes a posted-speed RANGE and a default; a profile may post any
  speed within the range, as a real street does within its class (the tram
  preset posts 58 km/h on an urban street whose default is 60). Bus and tram
  lanes count as lanes for the class's lane range — they are lanes with a
  different occupant. Transit and bike pieces: a **bus lane** 700 (50 buses/h
  × 48 riders ÷ 1.5 riders per car-trip ≈ 1,600 car-equivalents/h), a **tram
  lane** 650 per
  track (30 trams/h × 150 riders), a **bike lane** 75 (a 1.6 m lane's share
  of commute trips at the sim's granularity, not its physical 1,500 bikes/h).
  Highway lanes are 700 veh/h/lane better than a local's because they never
  stop; that ratio (3.3 : 1) is the HCM's, and it is what makes a motorway
  worth its width against three streets.
- **Lane count is a width budget, and the tile is the budget (profile).** A
  tile is 16 m. Lane pieces carry their own widths, and the defaults are the
  real ones: a travel lane 3.5 m (urban design guidance is 3.0–3.6; the widest
  vehicle in the kit is a 2.5 m bus), a parking lane 2.25 m (2.1–2.6), a bike
  lane 1.6 m (1.5–1.8), a bus lane 3.5 m, a raised median 1.8 m (minimum 1.2;
  4.9 m to hold a turn lane, which a one-tile road cannot), a sidewalk 1.9 m
  (1.8–2.4), a shoulder 1.5 m, a concrete barrier 0.6 m. **The eleven presets
  keep the piece widths that reproduce their current carriageways** — 3.75 m
  lanes on most, 3.3 m on the avenue whose median sits inside its 15 m — so
  their geometry is unchanged byte for byte; only newly composed profiles
  default to 3.5. The
  profile editor shows the running total against the tile and refuses to
  exceed it; what is left is verge. Within one tile: 2 travel + 2 parking + 2
  sidewalk = 15.3 m (a local street); 4 travel + 2 sidewalk = 17.8 m does NOT
  fit, so a four-lane urban street gives up its footways to half-metre kerbs,
  exactly what the avenue does today; 3 travel + a centre turn lane + 2 bike
  + kerbs = 15.7 m fits. **Six and eight lanes do not fit a tile and are not
  made to.** They are TWO-TILE CORRIDORS: a road two tiles wide whose tiles
  each know which half they are, laid by one drag with the profile's width
  deciding how many tiles it claims — the way the reference's large roads
  span four and five cells. A six-lane divided (6 × 3.5 + 1.8 median + 2 × 1.9
  footway ≈ 26.6 m) and an eight-lane divided (8 × 3.5 + 1.8 + kerbs ≈ 30.8 m,
  no footways) both fit two tiles, and so does an honest motorway (6 × 3.5 +
  2 × 3.0 hard shoulder + 0.6 barrier ≈ 27.6 m) — the one-tile highway is a
  compressed one with no real shoulders, and stays so. This is the largest
  structural change in the section and is sequenced LAST (wave 6), because
  everything before it is worth having on one-tile roads and nothing before
  it depends on it.
- **Direction is stored, not guessed (profile).** Every road tile gains a flow
  direction (two bits: which of its mask arms is "forward"), set by the drag
  and flippable by the replace tool. One-way pathfinding stops inferring flow
  from tile geometry, and asymmetric profiles — three lanes as 2+1, five as
  3+2 — become possible, because "2+1" is meaningless until the tile knows
  which way is which. The graph edge carries lanes-per-direction rather than
  a single tier, and the edge cost uses the directional lane count for the
  direction actually travelled.
- **Junction control is a choice with a sensible default (junction).** Every
  graph node carries a control: `none`, `yield` (minor approaches give way),
  `stop` (minor approaches stop), `allWayStop`, `signal`, `roundabout`. The
  default is a WARRANT, not a constant, and it uses the two numbers the sim
  already has — the class of each approach and the v/c its edge has been
  carrying: two locals, or anything dirt/rural/alley, meet with no control; a
  local meeting a collector or wider gets a stop on the local; two collectors
  or anything arterial gets a signal; a highway never gets a node control
  because it never meets anything at grade (it meets ramps, below). The v/c
  warrants above nudge the default up one step when sustained, mirroring the
  stop-sign and signal warrants engineers actually apply, and the advisor
  says so. The player overrides any node from a junction inspector, and an
  override is sticky — the warrant never fights a choice. **Control has
  teeth**: the delay formulas above are per movement and added to the path
  cost, so a city of all-way stops on its arterials is measurably slower and
  the traffic lens shows it. The signal head, the stop and give-way boards
  that already exist in the furniture kit are PLACED BY the control rather
  than by the tier, and a cycling signal (red / green per approach on the
  60 s or 90 s cycle the delay formula assumes, cosmetic vehicles holding at
  the stop line) becomes the visible pulse of a `signal` node.
- **Roundabouts are a control, not a road (junction).** Choosing `roundabout`
  on a node with 3–4 approaches converts the node's tile (mini, 16 m) or a
  2×2 block (compact, 32 m) into a circulating carriageway with a planted or
  paved island, yield markings on every approach, and no signals. It is the
  one control that changes geometry, and it is bounded by what a tile can
  hold: a two-lane roundabout for a two-tile corridor is deferred with wave 6.
  DESIGN.md's "roundabouts deferred" guard is retired by this bullet.
- **Approach lanes are the player's, with an automatic starting point
  (junction).** For each approach of a node, the last N tiles of the profile
  (the storage lengths above: 2 local, 3 collector, 4–5 arterial) are the
  APPROACH ZONE, and each travel lane in it has a movement set: through, left,
  right, or any combination. The default is derived — a two-lane approach
  gets `left|through` and `through|right`; a three-lane gets a dedicated left;
  a four-lane gets dedicated left and right — and the player edits the set
  per lane from the junction inspector. A profile may also GAIN a lane inside
  its approach zone (a turn pocket carved out of the verge or the parking
  lane, where the width budget allows), which is how a two-lane street earns
  a left-turn lane at one junction without becoming a three-lane street. Turn
  arrows are painted from the movement set and nothing else; a lane with no
  movement toward a leg is not a legal path to that leg, and a movement's
  delay divides by the number of lanes serving it. Turn RESTRICTIONS (no left,
  no right, no straight, no U) are the degenerate case — a movement removed
  from every lane — and are exposed as the same control.
- **Every paved road is the same asphalt (profile).** A road type is told
  apart by its width and its markings, not by its shade. Tinting each type its
  own grey put a visible colour step wherever two of them met and turned every
  crossing into a patch of whichever road won the tile. Only a genuinely
  different surface differs: gravel is tan, ballast is grey stone.
- **Roads replace each other by rank, not by tier number (profile).** The
  hierarchy is the real one — surface first, then how much traffic the road is
  built to carry — so a farm track never cuts a motorway and a bike lane never
  wipes an arterial, whatever order the tiers happen to be numbered in. A road
  carrying a reserved bus or tram lane outranks the same road without one, so
  a stray drag cannot quietly wipe a transit line. A road may not be drawn
  THROUGH one it does not outrank: an avenue's raised median leaves nowhere to
  cross, so the drag is refused whole rather than laid as two stubs either
  side. Replace mode overrides all of it, because the player asked.
- **A junction reads like a junction (junction).** The road that ranks highest
  at a node runs THROUGH it: its markings carry across the box and its arms
  paint nothing. Every arm below that rank stops, with a stop bar and — where
  the road has footways — a ladder crosswalk. Where every arm ranks the same,
  they all stop, which is the all-way junction. The crossing markings are the
  real size, measured inward from the tile edge; scaling them into whatever
  depth was left between the box and the tile edge is what turned a wide
  road's crossing into a dashed ring hugging the box. A road with no footway
  paints no crossing, since there is nobody on foot to cross, and its corners
  still sweep round at the kerb-return radius with grass where the footway
  would be, rather than filling the corner square.
- **Lane widths and lane counts are US standards, and a road is picked rather
  than dialled (profile/tool).** A travel lane is built to the width its kind
  of road uses: 12 ft on an arterial, a divided road, a motorway and its
  ramps; 11 ft on a town street, a collector and a rural road; 10 ft on a
  local street, a one-way and an alley; 9 ft on a farm track. The player does
  not choose a lane at a time — a four-lane arterial is a kind of road, not a
  three-lane with one added — so each class offers the lane counts it is built
  in, total across both directions: a motorway 2/4/6/8, a town street 2/4/6, a
  neighbourhood street 2/4, a farm track 2 and only 2. **What a 16 m tile
  holds:** four 11 ft lanes are 13.4 m and fit with a kerb either side; six are
  20.1 m and do not. Six- and eight-lane roads, and a motorway with a 10 ft
  shoulder to pull over on, are therefore two-tile corridors — wave 6 — and
  until then the preview says the road is too wide rather than laying one that
  overhangs its neighbours.
- **Turn lanes are marked and arrowed (profile).** A two-way left-turn lane
  carries, on each side, a solid line toward the through lane and a broken one
  toward the turn lane: traffic may cross into it to turn but never travel
  along it. Both are yellow, since the lane faces opposing traffic on each
  side. White turn arrows are painted in it, one pointing each way, on the
  same periodic tiles as a one-way street's direction arrows. The lane counts
  toward the road's width and toward its class lane range, and carries no
  through capacity of its own, which is what a turn lane is.
- **Markings are painted the way a driver reads them (profile).** Yellow
  separates traffic going OPPOSITE ways: the dashed centre of a two-lane, the
  double solid of a multi-lane undivided road, and both edges of a two-way
  turn lane, which faces opposing traffic on each side. White does everything
  else: the lane lines between traffic going the same way, and the EDGE LINE
  down each side of the carriageway that says where the running surface ends
  and the shoulder, gutter or kerb begins. Every paved road carries edge lines;
  on a road with a shoulder the line sits at the shoulder's inside edge, which
  is what tells a driver where it is safe to pull over. An unpaved track, a
  service alley and a railway carry no paint at all.
- **Roads meet each other by rule, and a step in width is a transition
  (profile).** A city is built out of roads meeting other roads, so the
  default is that any two classes join and the join is DRAWN: where a kerbed
  paved run meets a narrower paved one, the wider tile bends its kerb in over
  the tile to the narrower road's edge, so the two flow together instead of
  stepping at the seam. A tile narrowing at BOTH ends splits the tile between
  the two wedges. A gravel neighbour keeps the paved→dirt band it already
  had, and a junction keeps its throat, since a wide arm meeting narrow ones
  at a node is a flare, not a taper. The refusals are only the joins that
  would be absurd on the ground: a motorway or a slip road running straight
  onto a farm track or a service alley, which could carry neither its speed
  nor its volume. The road tool is where the rule is enforced, because that is
  where the reason can be shown: a run that would touch a road its class may
  not meet is refused whole, with the reason on the cursor chip, and lays
  nothing. The stricter motorway rule — that a motorway reaches the surface
  network ONLY through a ramp — arrives with ramps in wave 5, since before
  ramps exist it would leave a motorway with no way into the city.
- **Lane changes happen along a segment, and are drawn (profile).** Where two
  profiles of different lane counts meet on a straight run, the graph puts a
  node there today and the render stops the markings dead. Instead the wider
  profile's extra lane ends in a TAPER of the lengths above — 3 tiles on a
  street, 10 on a motorway: the lane line bends to the kerb, a merge arrow
  points into the surviving lane, and on highways a chevron-hatched gore fills
  the wedge. Which side drops is a per-transition choice (left, right, or
  centre for a divided road) and defaults to the side the replace tool was
  dragged from, the way the reference decides expand-left/right by cursor
  side. The sim treats the taper as a short edge at the narrower capacity,
  which is what makes a hard 4→1 drop a visible chokepoint on the traffic lens
  rather than a free merge.
- **Highways meet the world through ramps, never at grade (junction).** A
  `ramp` is a class: one or two lanes, one-way, unzonable, with the motorway's
  rules and a lower speed. A ramp tile touching a highway run forms a
  **merge** node (ramp joins in the flow direction) or a **diverge** node
  (ramp leaves) — the two junction kinds a highway is allowed, and both are
  two-approach nodes with no control. A merge needs an ACCELERATION LANE: the
  highway carries one more lane for the 10 tiles downstream of the merge and
  then tapers over the next 10; a diverge mirrors it with an 8-tile
  deceleration lane upstream. Those are long because the physics says so, and
  the tool lays them automatically when a ramp is connected — the player
  draws the ramp, the highway grows the lane, the gore is painted — so the
  length costs the player land and nothing else. This is the one place the
  system does more than the reference, where the player had to swap in a
  wider highway by hand and guess the length. A ramp's other end is a
  **terminal**: an ordinary node on a surface road, which takes an ordinary
  control (a signal or a stop on the ramp, by warrant) and ordinary approach
  lanes. Elevation is the existing §25 layer: a ramp climbs or falls at the
  existing stepped grade, and a ramp crossing a highway is a bridge over it
  exactly as a road crossing water is.
- **Interchanges are stamps of the above, not assets (tool).** A diamond, a
  trumpet, a parclo, a roundabout interchange and a cloverleaf are each a
  TEMPLATE: a list of relative tiles, classes, profiles, elevations and ramp
  nodes that the tool lays as one placement with one cost, ghosted and
  rotatable like a landmark plop. Because they are made only of pieces the
  player could draw by hand, every part of a placed interchange is editable
  afterwards with the same tools, which is the property that makes them worth
  shipping as templates instead of as models. Footprints follow from the ramp
  lengths, not from taste: a diamond's ramps each need 8 tiles of
  deceleration and 10 of acceleration along the motorway, so it spans ~24
  tiles along the highway by 6 across; a trumpet and a parclo ~24 × 12; a
  roundabout interchange 24 × 8 with the compact roundabout under the
  bridge; a cloverleaf 28 × 28 with its four loops. Stack, turbine, SPUI and
  DDI are deferred: a stack needs three deck levels the elevation layer does
  not carry, and the other three are signal-phase designs whose value does
  not survive a cosmetic signal.
- **Furniture is a toggle on the profile, gated by class (profile).** Each
  profile carries: `lamps` (default on for local/urban/collector/arterial/
  divided/one-way, matching the real practice of continuous lighting on urban
  streets; off for dirt, rural, alley, highway and ramp, where real warrants
  light junctions only; togglable everywhere except dirt), `sidewalks` (a
  lane piece, so "none" is a real choice on rural and alley; mandatory on
  zonable urban classes), `kerbs` (implied by sidewalks or a raised median),
  `verge` (grass by default; a tree row where the profile has ≥ 2 m spare per
  side), `median` (a lane piece: painted / raised grass / raised with trees /
  concrete barrier — the barrier is the only median a highway admits),
  `parking` (a lane piece per side; SPEC §28's kerbside rule reads it instead
  of the tier — a profile with no parking lane parks nobody), `bike` (a
  painted lane piece per side; it displaces the parking lane, as the
  reference's does), `bus` and `tram` (a lane piece each; SPEC §27's tram
  tier becomes "a profile with a tram lane"), `soundBarrier` (highway/divided
  only), `crosswalks` (per approach, on the junction). Every existing
  furniture rule that keys off a tier — lamps skipping gravel and rail, the
  kerb-tile parking vet, the junction guard for signs — keys off the
  profile's pieces instead, with no change in behaviour for the eleven
  presets.
- **Markings say exactly what the profile and the junction say (render).** A
  marking is never authored; it is read: centre line from the class and the
  presence of a median (none / dashed / double solid), lane lines between
  same-direction travel lanes (dashed), edge lines on arterial and above and
  on every highway, turn arrows from approach-lane movement sets, merge
  arrows and gore chevrons from tapers, bus-lane and bike-lane fills from
  their pieces, parking-bay ticks from a parking lane, stop lines and yield
  triangles from the node control, zebra bars from the crosswalk toggle,
  roundabout yield markings from the roundabout control. Dirt has none; rural
  has none until its v/c earns a centre line (the MUTCD warrants a centre
  line by width and volume, and a quiet rural road has neither). Colour
  follows the calibrated palette (§28) — one white and one yellow, with a
  per-city theme choosing whether the centre line is yellow (North American
  convention) or white (European), set at city start and never changed.
- **The tool: draw a class, then refine what you drew.** The drawer's road
  category shows CLASSES, not tiers; picking one lays its default profile.
  The existing tool options panel (§5) grows a **profile editor** — lane
  pieces as a horizontal strip with the width budget under it, per-side
  toggles for parking/bike/lamps/sidewalk, a median picker — and its edits
  apply to the next drag. A **replace** mode drags a new profile over an
  existing run in place, keeping alignment, buildings and elevation; if the
  new profile is wider than the old one's tile allows, the drag refuses with
  the §6.16 red ghost rather than demolishing. Clicking a node opens the
  **junction inspector**: control picker, per-approach lane movement grid,
  crosswalk toggles, turn restrictions, and the delay the current control is
  costing. Clicking a ramp node shows its merge length. All of it is
  command-driven through the existing worker queue and undoable, and none of
  it needs a new panel type — the profile editor is tool options, the
  inspector is the existing info panel (§7) pointed at a node.
- **Progression mirrors the real ladder.** At start: dirt, rural, local
  street, alley. Milestone 1: urban street, one-way, parking/bike/lamp
  toggles, stop and yield control. Milestone 2: collector, signal control,
  approach-lane editing, median pieces, bus and tram lanes (with their
  transit epics). Milestone 3: arterial, divided, roundabout, highway, ramp,
  the diamond and trumpet stamps. Milestone 4: two-tile corridors (six and
  eight lanes), parclo/cloverleaf/roundabout-interchange stamps, sound
  barriers. The existing tier unlocks map onto this with no regression.
- **Save compatibility.** The grid's `roadTier` byte becomes a `roadProfile`
  index into a per-save profile table (the eleven presets pre-populate it, so
  a v5 save loads with every road looking as it did); a `roadFlow` byte (3
  bits direction — the four cardinals and "never recorded" — with the rest
  reserved for the corridor half and approach-zone marker) is added; nodes
  gain a control record keyed by tile. Serialization bumps one version per
  layer; older saves deserialize with presets, no stored direction, and
  warrant-derived control.
- **Deferred, deliberately.** Signal phase design (SPUI, DDI, protected
  lefts as a player setting) — a signal here is Webster's delay and a
  cosmetic cycle, not a phase plan. Three-level stacks and turbines — the
  elevation layer carries one deck. Reversible and contraflow lanes. Per-lane
  speed limits. Curved and free-form geometry — the road stays on the tile
  grid, which is the decision that keeps everything above tractable; a
  two-tile corridor is as wide as this design goes. Tunnels remain deferred
  per DESIGN.md. Authored road textures — markings stay geometry on the
  palette.

**Decisions (user 2026-09-05, "go with your recommendations, be realistic,
use the correct formulas"):** travel lanes default to **3.5 m** with presets
keeping 3.75 m; six and eight lanes are **two-tile corridors**, sequenced
last; signals are **Webster delay + a cosmetic cycle**, not a phase
simulation; the centre-line **theme is chosen at city start**. The formulas
above are the consequence of "realistic": they are the HCM's and AASHTO's,
scaled by one constant into the units the sim already uses.

**Waves (each shippable alone, in this order):**

1. **Profiles and classes** — the profile table, class specs, lane pieces,
   width budget, the eleven presets, replace-in-place, the profile editor;
   markings and furniture re-derived from pieces with a zero-behaviour-change
   test over every preset. Capacity becomes Σ pieces, reproducing today's
   numbers exactly.
   *Status (2026-09-05):* the data model is in — twelve classes and the
   eleven preset profiles live in `roads.json`, `src/shared/roadprofile.ts`
   derives speed, capacity, carriageway width, kerbs and paving from a
   profile, and a test proves every preset reproduces its catalogue speed,
   capacity and the carriageway the render already draws. The render reads
   its carriageway width, kerbs and paint from the preset profile, and
   pathfinding reads speed and saturation volume from it, each behind a test
   that pins the figures the tier always had. The grid now stores the PROFILE
   as the road's identity — a two-byte id per tile, presets equal to their
   tier, composed profiles from 12 up in a per-save table — and the tier is
   derived from it as the nearest preset, so every consumer that still reads
   a tier keeps working at preset fidelity. The worker accepts a
   `defineRoadProfile` command (validated against the class's width, piece
   and lane rules; idempotent for a same-shape redefinition; refused for a
   preset id or a taken id with a different shape) and a `buildRoad` that
   names a profile; a same-tier road is replaced only when the profile
   differs, and undo puts back the exact profile that was there. Saves bump
   to version 6; older saves load with every road as the preset its tier
   names, and the worker now accepts any older save rather than only the
   current version. The mirror resolves any tile to its cross-section, and
   the road mesh draws a tile carrying a composed profile at THAT profile's
   carriageway width, kerbs and paving — its markings, shade and decorations
   still come from the nearest preset tier until the markings are read from
   the pieces. The first cut of the profile editor is in the road tool's
   options row: a **Profile** group offering, for whatever pieces the road's
   class admits, a parking lane per kerb, a bike lane per kerb, and footways
   on or off, with the composed width read out against the 16 m tile and
   marked when it does not fit. The edits compose onto the selected road's
   preset — no edits IS the preset, byte for byte — and a drag lays a
   composed road as one batch of define-and-build, under an id the mirror
   reuses for an identical shape, so the same composition never gets two ids
   and undo removes the whole edit. A composition the tile cannot hold is
   refused at the preview with its reason and lays nothing. Edits reset when
   the player picks a different road. Every piece of kerb furniture — lamps,
   meters, boxes, signs, the manholes inside the carriageway, kerbside car
   rows and their aprons, and a bridge's deck — now measures from the tile's
   OWN cross-section, so a lamp beside a two-lane with parking lanes stands
   at the 6 m kerb and not in the parking lane where the preset's kerb was;
   `tools/profile-shots.mjs` lays a preset, a parked and a bare two-lane in
   the running game, reads back the profile id on every tile and the
   distance of every lamp from its centreline, and shoots them. Markings are
   now READ from the cross-section: `src/render/roadmarkings.ts` lays the
   carriageway pieces across the tile and reports the lines between them — a
   dashed centre between one lane a side, a double solid between two or more
   (the no-passing rule), dashed lane lines between same-way lanes and
   beside a bus lane, motorway edge lines half a metre in, a bus or bike band
   per reserved piece, and for a parking lane a solid line along its inner
   edge with a bay tick every 6 m pitched by world coordinate so bays run
   across tile seams. Per-class styles are a small table (dirt and alley
   paint nothing, a one-way paints lane lines and no centre, a motorway
   paints edges and carries the divider). Every preset paints exactly what it
   always did, pinned by test; the avenue preset's inner lanes are 2.85 m so
   its lane lines fall at ±3.75 beside its 1.8 m median, as drawn. Motorway
   lane lines wait for the two-tile motorway. Roads now MEET each other by rule and the meeting is drawn: any two classes
   join except a motorway or a slip road running onto a farm track or a
   service alley, which the road tool refuses for the whole run with the
   reason on the cursor chip; and where a kerbed paved run meets a narrower
   paved one, the wider tile bends its kerb in over the tile to the narrower
   road's edge, splitting the tile between two wedges when it narrows at both
   ends, while a gravel neighbour keeps its paved-to-dirt band and a junction
   keeps its throat. `tools/transition-shots.mjs` lays a four-lane
   continuing as a two-lane, an avenue continuing as a two-lane and a
   four-lane spliced into the middle of a two-lane in the running game, on
   ground it picks for being level, checks every run really is one connected
   street and shoots the seams. The road tool's options row now
   carries the class drawer as well: how many lanes the road runs each way
   (all one way where the class is one-way), what separates the directions —
   nothing, a median, or a two-way turn lane — and the speed it is posted at,
   in 5 km/h steps inside the class's own range. Each control offers only
   what the class allows, so a local street is never offered four lanes, a
   motorway is never offered a turn lane, and a control with one possible
   answer is not shown at all. Changing the lane count or the middle rebuilds
   the carriageway around them at the class-default 3.5 m lane, keeping a
   reserved bus lane at its kerb and a tram on the lanes it runs on, while
   leaving the preset's own lanes untouched for as long as the player leaves
   the count alone; a posted speed is carried only when it says something the
   class default does not, so setting it back gives the preset itself back. A
   centre turn lane counts as the third lane of a three-lane street, and is
   painted the way one is: a solid line each side, since traffic may enter it
   to turn but never travel along it. `tools/drawer-shots.mjs` lays a
   four-lane with a median, a street with a turn lane and a four-lane
   narrowed to one lane each way in the running game and shoots them.
   Finally, a **Replace** chip on the options row lets a drag lay its road
   over whatever is already there. Without it a road still refuses to become
   a smaller one, which is what stops a stray drag from flattening an avenue;
   with it, rebuilding an avenue as a quiet street is one drag, the cost is
   the road being laid, and undo puts back the exact road and deck that were
   there. A composition too wide for the tile is still refused at the
   preview, so replace never demolishes without building. That completes
   wave 1.
2. **Stored direction** — `roadFlow`, drag direction, asymmetric profiles,
   directional edge cost, one-way pathfinding off geometry inference.
   *Status (2026-09-05):* the direction is stored and read. Every road tile
   carries a `roadFlow` byte naming the cardinal its drag went in, saved at
   version 7; a save from before it loads with none, and every reader falls
   back to the geometry it used before. The worker reads the direction off
   the drag — each tile points at the next one along it, the tile the drag
   ended on keeps the heading it arrived with — so drawing a one-way street
   back the other way turns it round rather than rebuilding it, and undo puts
   back the directions that were there, the way it already put back the deck
   heights. The graph carries what its run recorded, so one-way routing no
   longer guesses from the shape of the tiles: a street drawn east to west
   routes east to west even though its tiles ascend in x. The arrows painted
   on a one-way street point the way it was drawn.
   `tools/oneway-shots.mjs` lays two identical one-way columns drawn opposite
   ways in the running game, reads back what each stored, turns one round and
   shoots them. On top of it, a profile may now be ASYMMETRIC: the road tool
   steps each direction on its own, so a three-lane road is two lanes one way
   and one the other, bounded so the two together stay inside the class's
   lane range, and a centre turn lane or median still sits between them. The
   graph reads how a run divides — the profile says back and forward relative
   to the drag, and the stored direction turns that into the two ends of the
   edge — and the edge cost scales the capacity it compares volume against by
   the share of lanes serving the direction being travelled. A road that is
   the same both ways scales by one, so every road that existed before costs
   exactly what it always cost; a two-and-one road congests on its short side
   first. Volume itself stays a whole-road figure, since that is what the
   traffic system assigns, so a per-direction volume waits for the traffic
   system to have one. That completes wave 2.
3. **Junction control** — node control records, the v/c warrant default, the
   inspector, per-movement delay cost, control-placed furniture, cycling
   signal heads, mini and compact roundabouts.
   *Status (2026-09-06) — the wave is complete but for the compact roundabout,
   which is a 2×2 block and waits for the corridors of wave 6, and the
   per-MOVEMENT delay, which waits for the movement sets of wave 4; the delay
   is per APPROACH today.* Every graph node now carries a control, and it is
   WARRANTED rather than authored. `src/shared/junction.ts` is the model: a
   ladder from no control through give-way, minor-road stop and all-way stop
   to a signal, climbed by two independent readings that resolve to the more
   restrictive of the two. The first reads the classes that meet — two locals,
   or anything unpaved or rural, meet on sight lines; a lesser road running
   onto a bigger one stops; two collectors, or any junction an arterial
   touches, is signalised; two equal town streets have no minor road to stop,
   so all of them do. The second reads what the arms have been carrying, as
   the share of their own capacity the MUTCD's vehicle-per-hour thresholds
   work out to. A junction of fewer than three arms is a bend, and nothing
   that touches a motorway, a slip road or a railway takes a control at all.
   The graph edge carries the class and lane count of its run so the warrant
   can read them, and `RoadNetwork` works the controls out afresh whenever the
   graph is rebuilt and once a game day when the volumes settle — so a control
   only a busy junction warrants appears as the city fills and goes away again
   when it empties. The delay has teeth: A* pays the control's delay on
   ARRIVAL, on the arm it enters by, from the Highway Capacity Manual's forms
   — the quadratic in v/c below a signal, Webster's uniform delay at one — so
   crossing a signalised avenue costs more than crossing a quiet street, the
   road that runs through pays nothing at a give-way or a minor-road stop, and
   a slow junction reroutes traffic the way it does in life.
   The signs then follow the control rather than the tier. The sim is the only
   thing that can know — the warrant reads traffic the render thread never sees
   — so the controlled junctions travel on the snapshot as their own channel,
   whole list whenever any of it changes, and the mirror hands each junction
   tile its answer. An approach draws the board its junction's control gives
   it: a head at a signal, a stop on every arm of an all-way stop, a stop or a
   give-way on the arms that give way and nothing on the road that runs
   through, a give-way at every entry to a roundabout, and nothing at all where
   the junction is uncontrolled — which is where two quiet streets crossing now
   correctly stand, with no board a highway authority never put up. The paint
   follows the same answer: a stop bar marks where to stop FOR something, so
   only a stop, an all-way stop or a signal paints one, a give-way gets its
   crossing without one, and an uncontrolled junction is an open box with no
   paint at all. Which arm gives way is one rule in one place, `armGivesWay`,
   read off the hierarchy ranks, so the boards and the bars cannot disagree.
   The warrant is a DEFAULT, and the player overrides it from a junction
   inspector: click a junction and the panel names who gives way there, offers
   the ladder least restrictive first, and says what handing it back to the
   warrant would mean. An override is sticky — the warrant is still worked out,
   so the panel can say what automatic would do, but it never argues with a
   choice — and it is stored per tile in the `junctionControl` layer at save
   version 8, so it survives a save, an undo, and a bulldoze-then-undo of the
   junction itself. Only a junction of three arms or more takes one: a dead
   end, a bend and a tile mid-run have nobody to give way to, and the command
   refuses them.
   A signalised junction then PULSES. The three lenses on a head are dark glass
   baked into it; the one that is lit is a separate instanced disc laid over
   its lens, so the thing that changes every few seconds is the only thing
   redrawn. The cycle is the two-phase one the delay formula already assumes —
   the north-south movement for the first half, the east-west for the second,
   each ending in a three-second amber — and it runs on the clock the TRAFFIC
   runs on, so a paused city holds its lights and a fast-forwarded one cycles
   them as fast as it moves the cars past them. Every signal in the city shares
   the clock, which is what a coordinated arterial does anyway.
   Choosing a roundabout is the one control that changes the geometry. One tile
   is 16 m, which by inscribed-circle diameter is a MINI roundabout — the real
   range is 13 to 25 m — so the island is small and ringed by a painted apron a
   long vehicle tracks over rather than a kerb it would ground out on. The
   crossings and stop bars go; a yield line of solid white triangles pointing
   at the approaching driver goes across every entry (MUTCD 3B.19 ¶10), a
   give-way board stands at each one, which is the single place a give-way may
   face every approach (2B.10 ¶06), and no centre line runs through, because
   there is an island where it would go and no road runs THROUGH a roundabout.
   The 2×2 compact roundabout and the two-lane one are still deferred; the
   two-lane one waits for the corridors of wave 6, and so does the white edge
   line round the outer circulatory roadway, which MUTCD 3D.03 puts in the
   arcs between the arms and never across an exit.
4. **Approach lanes and tapers** — movement sets, turn pockets, arrows, turn
   restrictions, lane-drop tapers with merge arrows and gore chevrons, taper
   edges in the sim.
5. **Ramps and interchange stamps** — the ramp class, merge/diverge/terminal
   nodes, automatic acceleration/deceleration lanes, diamond and trumpet,
   then parclo, cloverleaf and roundabout interchange.
6. **Two-tile corridors** — six- and eight-lane divided, the honest motorway,
   corridor halves in `roadFlow`, the two-lane roundabout, sound barriers.

**Owners:** `src/data/roads.json` (becomes classes + lane pieces + preset
profiles), `src/shared/types.ts` (`RoadClass`, `LanePiece`, `RoadProfile`,
`JunctionControl`, `ApproachLanes`; `roadProfile` + `roadFlow` layers;
commands `setProfile`, `replaceRoad`, `setJunctionControl`,
`setApproachLanes`, `setCrosswalk`, `placeInterchange`), `src/world/grid.ts`
(layers + save version), `src/world/roads.ts` + `src/world/pathfind.ts`
(directional lanes, node control cost, taper edges, merge/diverge nodes),
`src/sim/traffic.ts` (per-piece capacity, movement-aware node cost),
`src/sim/worker.entry.ts` (commands + undo inverses), `src/render/roadsmesh.ts`
(profile-driven geometry: pieces, medians, tapers, gores, roundabout
carriageway), `src/render/roadfurniture.ts` + `src/render/lamps.ts` +
`src/render/parked.ts` (read pieces and control, not tiers),
`src/render/signage.ts` (new — arrows, chevrons, yield triangles, cycling
heads split out of roadfurniture), `src/world/interchanges.ts` (new —
templates), `src/tools/tools.ts` (class tool, replace mode, stamp placement),
`src/ui/RoadToolOptions.tsx` (profile editor), `src/ui/JunctionPanel.tsx`
(new — the inspector), `src/ui/categories.ts` (classes in the drawer),
`src/sim/advisor.ts` (warrant nudges).

**Acceptance:** every one of the eleven existing tiers loads from a v5 save
and renders byte-identically as its preset profile, and its capacity is
reproduced by the formula — two-lane 2 × 300 = 600, avenue 4 × 400 = 1,600,
highway 4 × 1,000 = 4,000, gravel 2 × 100 = 200, alley 2 × 175 = 350, one-way
2 × 550 = 1,100, four-lane 4 × 300 = 1,200, bus lane 2 × 400 + 2 × 700 =
2,200 (an arterial with reserved kerb lanes), bike lane 2 × 300 + 2 × 75 =
750, tram 2 × 300 + 2 × 650 = 1,900; a
player can lay a two-lane local street, add a parking lane on one side and a
bike lane on the other, drop its lamps, and see each change in the markings
and furniture without redrawing; a four-lane collector meeting a local
defaults to a stop on the local and the player can make it a signal, a
roundabout, or nothing, and the path cost through it changes by the delay
formula; a signalised approach can be given a dedicated left-turn lane and
the arrow, the stop line and the pathfinder all agree it exists; a highway
with a ramp gains a 10-tile acceleration lane and a painted gore
automatically and the traffic lens shows the merge; a diamond interchange
places as one stamp and every piece of it is editable afterwards; a six-lane
divided claims two tiles and its kerb furniture, lots and pedestrians all
measure from its real edge; no marking ever disagrees with the profile or
control that produced it.

**Verification:** the preset zero-change claim is a test over every tier —
profile-derived geometry against the tier-derived geometry it replaces, vertex
for vertex, and Σ piece capacity against the tier's scalar. The width budget
is a table test over every class × piece combination the editor admits. The
delay and warrant formulas are table tests with the HCM's own worked figures
as fixtures (a 90 s three-phase signal at x = 0.5 and g/C = 0.45 costs
17.6 s; the 60 s two-phase one 11.7 s). The
speed-change and taper lengths are a test of the kinematic formula against
the AASHTO figures quoted above. Movement sets versus reachable paths is a
pathfinder test: a lane with no left movement yields no path that turns left
from it. Ramps, tapers and interchanges are checked in the RUNNING game the
way §28's kerb audit is — a harness lays a highway with a ramp and a diamond,
then reads back from the live grid the lane count on every tile downstream
of the merge and the control on every terminal node, because only the real
placement proves the tool laid what the spec says. Markings remain a
screenshot review, because "reads as a real road" is a claim about the eye.
