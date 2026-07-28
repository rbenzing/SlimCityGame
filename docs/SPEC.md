# SlimCity — Living Product Spec

The authoritative, living specification for how SlimCity looks and behaves: the
CS2-grammar UI shell, in-world feedback, the night cycle, and the visual/systems
detail for roads, zoning, utilities, services, transit, districts, terraforming,
and landmarks. It began as the UI visual-parity spec (derived from three Cities:
Skylines 2 reference screenshots supplied 2026-07-21 — building info panel; road
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

## 1. Layout (bottom-heavy, CS2 grammar)

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
  (exactly CS2's active-tool treatment). Clicking toggles the asset drawer.
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
  accent-blue border + fill (CS2 treatment). Locked (unlockMilestone > current)
  = 40% opacity + 🔒 + tooltip "Unlocks at {milestone name}".
- Drawer and tool options close on ESC (first ESC cancels drag, second closes
  drawer, third deselects category — CS2's escape stack).

## 5. Tool options panel (floating left of the drawer, only when relevant)

Rows exactly in CS2 order, but only rows whose toggles do something real:
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
  translucent grid squares (CS2's zoning grid) — green-tinted where hovered
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
  *desaturated* — off-white/bone/grey walls with beige/tan accents and rare
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

**Roads v2 (playtest round 2, 2026-07-23 — CS street reference: median
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
  so turn paths stay clear (the CS reference's tree-lined boulevard read).
- **Highway divider**: straight highway runs get a low ~0.6m concrete
  barrier band instead of a painted median.

**Roads v3 — catalog expansion + road-carried utilities (user request
2026-07-23, source: cs2.paradoxwikis.com/Roads):**
- **Road-carried utilities (the realism core)**: CS2 rule — every road except
  highways implicitly carries water/sewage pipes and a 40 MW low-voltage
  power line. SlimCity adopts it: power and water no longer radiate from
  utility buildings as plain radius coverage — they propagate along the ROAD
  GRAPH from any road tile adjacent to a supplying utility building, and a
  building/zone tile is powered/watered when within 1 tile of a *supplied*
  road. Highways conduct power only (street lighting), never water. The §6
  power/water lenses keep working unchanged (they read the same coverage
  bytes); disconnected road islands correctly read unsupplied.
- **Catalog v3 new specs** (roads.json + RoadSpec additive fields
  `noiseMult`, `oneWay?`, `carriesWater`):
  - **Gravel Road** — ¢8/tile, slow (speed 8), capacity 200, unlock M0:
    dusty tan unpaved look, no paint, no curbs, 2× noise (CS2 numbers).
  - **Alley** — ¢14/tile, narrow (~6m), no sidewalks, unlock M1.
  - **One-Way Road** (two-lane footprint, both directions' capacity one
    way) — unlock M1: pavement direction arrows every ~3rd tile; RoadNetwork
    gains directed edges; A* and cosmetic vehicles respect direction (CS2:
    service vehicles must detour — ours simply route with the graph).
  - **Four-Lane Road** — between avenue and two-lane (¢32/tile, unlock M1),
    dashed lane dividers, no median.
- **Road noise**: roads emit into the Noise field by tier — gravel 2×,
  standard 1×, highway 3× (CS2 multipliers) — scaled by assigned traffic
  volume so busy arterials read loud on the noise lens.
- **Explicitly deferred (§9)**: roundabouts + curved geometry (no curved
  roads v1 — ROADMAP §9), parking-lane roads, quays, bridges/elevation,
  asymmetric lane counts, pedestrian streets, decorative sidewalk-tree
  upgrades beyond the §6.7 avenue median.
- **Sidewalks**: a lighter raised curb strip (0.08m) along every road edge
  that borders a non-road tile — one extra quad pair per edge tile, vertex
  colored near-white.

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
  red taillights rear, switched by nightFactor threshold — headlight *cones*
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
  + tileHash; zero Math.random.

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
  road), the CS default; angled (~60°) is an acceptable alternative but
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
  curved *centerlines*; ROADMAP §9 still bans true curved roads — this is
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
  interactive sim), so we will NOT claim RT. Instead deliver the *perceptual*
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
  are EXCLUDED from the kernel (CS-style "can't terraform under structures";
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
- **Dimensional water v2 (playtest fix, 2026-07-22 — reference: CS2 dam
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
- **Explicit non-goal**: dynamic fluid flow (CS2's flowing rivers/flood sim)
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
whose real-world silhouette *is* their identity get a **detail kit** (the
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
  *outer perimeter* of the previewed tile set — inner edges between two
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

### 6.19 Zoning grid v2 — CS frontage model (playtest round 5, 2026-07-24)

The zonable area is wrong in four ways; all trace to there being no single
"is this tile zonable" rule. Fix by making ONE shared pure predicate
(new `src/world/zonable.ts`) drive BOTH the visual grid (render/zonegrid.ts)
AND zone painting (world/grid.ts setZones) — today setZones lets you paint
any buildable tile regardless of roads, while the grid draws a Chebyshev-3
box; they must be the same rule, and it must be CS-style frontage zoning:

- **Perpendicular frontage depth, default 4 (ref: CS road-zoning screenshot)**:
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
- **Corner rounding v2 (wave)**: 90° turns still read square. Round the turn
  properly: the outer corner arcs (already a small fillet — widen it to a
  believable turn radius), the inner curb/sidewalk follows the same radius,
  and the lane markings CURVE through the turn (an arc of dashes) instead of
  stopping square at the tile edge. Cosmetic only — centerlines stay
  grid-aligned between tiles (ROADMAP §9), this is corner geometry.
- **Road-on-slope placement (wave)**: roads currently can't be placed up an
  embankment — `isBuildable`'s single `MAX_BUILD_SLOPE` (4 m) gate rejects
  the tiles. Roads should be placeable on MODERATE slopes (auto-flatten
  §6.18 #6 already levels/banks the footprint on placement), rejecting only
  when the grade exceeds a steeper `ROAD_MAX_SLOPE` (≈ 10 m/tile) — "bank it
  but flatten to allow, unless too extreme." Add the road-specific slope
  gate (buildings keep MAX_BUILD_SLOPE); the existing footprint auto-flatten
  then makes the placed road sit clean on the re-leveled ground.

### 6.21 Zoning types expansion — CS zone set (user request 2026-07-24)

Grow the 5-zone model (ResLow/ResHigh/ComLow/ComHigh/Industrial) into the
fuller CS set, milestone-gated to city size, each with its own low-poly
building look. ADDITIVE + save-safe: existing ZoneType numbers 1–5 keep their
values; new zones take new numbers.

**New ZoneType values** (append; do not renumber 1–5):
`ResMediumRow = 6`, `ResMedium = 7`, `Mixed = 8`.

**Zone set + milestone progression** (our MILESTONES 0–6; CS's 0/1/2/5/8/9
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
  - `LEVEL` — pips: filled rounded segments level/3 (green), CS2-style.
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
- **Bus-stop shelter (render/transit.ts):** replace the bare stop post with a real modeled shelter — roof canopy on 2 posts + a bench + a stop sign/pole, low-poly, instanced, deterministic per stop. Reads like the CS reference. Keep the existing stop position/data contract.
- **Pedestrians (NEW render/pedestrians.ts):** cosmetic low-poly people — a few idling at each bus stop and a sparse scatter walking sidewalks near Active buildings. Instanced, deterministic (seeded/hashed, NO Math.random, NO agent sim — pure decoration; ROADMAP §9). Fed stop positions (transit snapshot) + building positions (building deltas) via apply(); a slow deterministic walk-cycle offset from an update(tMs) frame hook is fine.
- **Shadows on small elements:** ensure lamps, bus stops, shelters, pedestrians, vehicles (cosmetic + service), trees, and buildings all `castShadow`/`receiveShadow` appropriately so small props read as grounded. Tune the sun shadow-camera (scene.ts) coverage/resolution to include them within the §8 budget (no per-frame cost blowup — instanced meshes cast as one).
- **Street-lamp model detail (render/lamps.ts):** upgrade the §6.20 cantilever lamp to a properly modeled luminaire — tapered pole, arm bracket, a real lamp housing (not a bare box), still instanced + night-emissive + light cone. More detail, same deterministic placement.
- **Road-end cap v2 (render/roadsmesh.ts + terrain ground-cover):** the wave-10 dead-end cap rounds the ASPHALT but leaves the sidewalk square and skips the ground transition. (1) The curb/sidewalk arcs around the cap at the cap radius (curb-follows-cap, like §6.20 corner curb-follows-fillet). (2) A sidewalk→dirt→grass transition ring conforms to the rounded cap perimeter (extend the §6.13 road-adjacent dirt band to the arc, not just square tiles).
- **Acceptance:** stops read as shelters with a few people; lamps look modeled; small props cast shadows; a dead-end road shows a rounded sidewalk + dirt→grass ring. Determinism preserved; all gates green; per-item screenshot review.
