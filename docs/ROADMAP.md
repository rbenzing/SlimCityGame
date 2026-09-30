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

**Test suite:** 4,281 tests passing across 147 test files, run 2026-09-30.
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

**Road composition is shipped but for two pieces.** A road is a class, a
cross-section profile and per-junction control; the fixed-tier model is gone.
Waves 5 and 6 — the ramp with its merge, diverge and terminal junctions, and a
section too wide for a tile laid as two carriageways — are built
([`shared/corridor.ts`](../src/shared/corridor.ts)), as are the pieces that
finished it: a transit lane is a variant of a size rather than a road type, a
road's tier is its size with the reserved lane priced on top, the placement
ghost is drawn at the road's own width, and an interchange — a diamond, a
partial cloverleaf or a cloverleaf — is laid on a motorway in one click
([`shared/interchange.ts`](../src/shared/interchange.ts)). Not built: the 2×2
compact roundabout, and sound barriers. Full detail in History, §10 below.

**Open:**

- Road composition: the two pieces above.
- Lane drops on a two-way road: road-model.md says the outermost lane on
  each side closes, but `taperedCrossSection` closes one side's kerbside lane
  completely before the other's starts. The centre line jogs sideways partway
  down every taper. The spec and the code disagree, and it needs a decision.
- Two check scripts no longer build what they check. `tools/taper-shots.mjs`
  runs a motorway into a two-lane street, and `tools/aux-shots.mjs` lays a ramp
  head-on into a motorway, and the world now refuses both.
- Corridor furniture: the furniture placers count a corridor's other half as
  a crossing road. So no corridor tile, divided or not, gets a lamp, a
  kerbside board, or a signal head on its own approach. The street arms of
  its junctions are signed as usual.
- A T onto an undivided corridor: only the half the street joins is a
  junction. Traffic on the far half is not held, and the crossing spans one
  half. Holding both would mean the far half joining the side street across
  the centre line in the road graph.
- A bulldoze over one row of a corridor takes that half and leaves the other,
  half a road with nothing beside it. A build that would do the same is
  refused.
- A batch is not atomic: when the world refuses one command, the ones before
  it stay laid, and the failed batch has no undo. The road tool refuses a
  corridor before sending it, so play does not reach this through the tool.

Before writing "not built" anywhere in this document, check the code.

**Next:** nothing else is queued, so the next item is whatever is asked for
next. The [DESIGN.md](DESIGN.md) deferred backlog (weather, deeper industry,
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

## 10. History (newest first)

### Interchanges, in one click (asked for and built 2026-09-30)

The first of the road-composition pieces left unbuilt. The player chose all
three forms and to place them on a motorway already laid
([design](game-design/features/interchanges.md),
[technical](engineering/features/interchanges.md)). An Interchange card in the
Highway tab previews the whole interchange centred on the motorway tile under
the cursor and lays it with one click, as one undo:

- **Diamond:** a ramp in each quadrant, meeting the street at two junctions.
- **Partial cloverleaf:** loops for the two left turns onto the motorway, the
  off-ramp round each loop, and diamond on-ramps.
- **Full cloverleaf:** a loop for every left turn and an outer ramp round
  each.

The street crosses on a bridge at its clearance, 6 m, and comes down a grade
step a tile. Every ramp is on the ground, joining the motorway alongside it
and meeting the street where the street is at ground level. Loops run round a
block four tiles square, about the 130 ft radius a 25 mph loop needs. It is
all ordinary road: no record of the interchange is kept, and neither the save
nor the worker protocol changes.

Two things were found by laying one before writing it:

- A ramp left to solve its own heights climbed to meet the street's approach
  beside its end, and joined the bridge instead of the motorway. Every piece
  is now sent with exact heights.
- Heights given as lifts above each tile broke the bridge into pieces on
  uneven ground. The deck is now laid out above sea level, and where the
  ground falls away the street comes down further out, and that side's ramps
  with it.

Checked in the browser: all three forms on ground rising and falling 11 m
across the site, from above and at an angle, laid through the drawer's card
and its options.

### Farm polish: the farmhouse at night, and the farm truck (2026-09-30)

The two farm follow-ups from the Open list
([farms](engineering/features/farms.md)).

- **The farmhouse lights up at night.** It had no windows at all: the barn is
  the farm's pickable body, on a material with no window grid, and the
  farmhouse is part of the farm kit. It now has eight windows of the
  commonest double-hung size, 36 × 60 inches: two in front facing the road,
  two behind, and one at ground level and one up in the gable at each end.
  By day they are dark glass. At night each one lights by the town's own rule,
  `isWindowLit` keyed by the farm's id, warm or occasionally cool, more of
  them as the night deepens. An abandoned farmhouse stays dark.
- **A pickup works the yard.** Each working farm has one, at a full-size
  regular-cab pickup's 5.31 × 2.03 × 1.91 m. It drives a round of its yard at
  15 km/h: out along the drive, behind the barn and its bins, past the
  silos, and back along the barn's front. It stops by the silos for 15 s. It
  works sunrise to sunset on the game's clock and parks on the drive by the
  house overnight. A round under way at sunset is finished before it parks,
  so it never jumps. It is drawn, not simulated, and carries nothing.

Checked in the browser with the farm district script, which now shoots a
farmhouse close up by night and by day and reads back lit windows and
trucks: 16 farms, 16 trucks, 72 windows lit at night.

### Two kerb steps: a short stub's taper, and a ramp node (2026-09-30)

Both were Open items, and both were a road's edge stepping where its width
changes ([road-model.md](world-sim/road-model.md)).

- **A stub shorter than its taper.** A four-lane stub of three tiles between
  a junction and a two-lane street started its six-tile taper part-closed. The
  junction drew its arm at the stub's narrowed width, and the kerb stepped
  in 2.5 m a side at the junction's mouth. A taper begins on the back edge of
  the plain tile before its first, which narrows toward it. On a stub the
  run's first tile is now that tile, and the lanes close over the rest. The
  kerb leaves the junction at full width and runs straight to the street,
  steeper than the class ratio because the stub has no more room.
- **The merge arrow** at the head of a taper stood at the tile's front, where
  the lane has already narrowed by another tile's closing; on a steep taper
  that was less than the arrow's width. It now stands at the tile's back edge,
  in the lane as wide as it is there.
- **A ramp node with its auxiliary lane.** The motorway tile a ramp meets was
  drawn as a square junction box at its own width, auxiliary lane included,
  while the motorway past it was only as wide as the tiles beside it. It
  stepped out at both ends, on the side away from the ramp too, and the lane
  ended in a step past a diverge and began with one before a merge. The node
  now lays its motorway the way a straight run changes width: full over the
  half the ramp joins over, bending to the plain motorway over the other half.

Checked in the browser by scanning the pavement's edge across the road, tile
by tile, and in pictures: the stub from a signalised T, a long taper for its
arrow, and an on-ramp and an off-ramp joining alongside.

Found and not fixed (see Open): the centre line jogs down a two-way taper, where
the spec and the code disagree on how the lanes close. Two check scripts
build what the world now refuses.

### The corridor ghost, and a corridor laid one row off (reported and fixed 2026-09-30)

The placement ghost still drew a six-lane motorway as two carriageways, each
centred on its tile with grass between, after the road itself had become one
([road-model.md](world-sim/road-model.md)). Each half of a corridor with
nothing dividing it is now ghosted where it will be laid, pushed against the
edge the two share. Its dashes and arrows move with it. The arrow at the end
of the first run had pointed at the start of the second, a row away; it now
points along its own run.

The same drag showed a worse fault. A six-lane road drawn one row off one
already there was laid. The row the two share became half of the new road,
and the old road's other row was left as half a road with nothing beside it.
A road laid over a corridor half now has to take that half's partner with
it, as its partner, or it is refused ("That would split a corridor"). The
road tool and the world ask the same predicate, `corridorSplitRefusal`.
Re-laying the same corridor, turning it round, and crossing both its halves
are unchanged.

Found and not fixed (see Open): a bulldoze can still take one half, and a
batch the world refuses partway keeps what its earlier commands laid.

### An undivided arterial drawn as one road (2026-09-30)

A six-lane arterial built without a median was drawn as two three-lane roads,
each centred on its tile, with grass between and no centre line. Each half
also had a kerb and a footway along the middle of the road. It is now drawn
the way a six-lane motorway has been since its own entry below
([road-model.md](world-sim/road-model.md)). Any corridor with no median or
barrier at its middle has its halves pushed against the edge they share.
The line there is whatever the whole road paints between those two lanes:
here the double yellow centre line, painted once.

The motorway never needed junctions; this road does, and they are built from
the shared edge. A street crossing it makes one junction across both halves:

- kerb returns at the outer corners only;
- the street's plate centred on the street;
- crossings on the outer arms, measured from the real tile edge;
- nothing painted or kerbed on the shared edge.

A road this wide now ends square, kerbed across its whole width, instead of
with a turning bulb on each half. The motorway's halves get the same end,
where each had its own bulb before. The verge a lot fronts is measured from
where the kerb now is, and so are the cabinets beside it.

Looking at it turned up faults that were not about the drawing:

- **Arrows, stop lines and turn bays at the wrong end.** A half carrying
  the road's `back` lanes was treated as a one-way running the way it was
  drawn. Its lanes run the other way, so its arrows pointed the wrong way at
  the wrong end, its bay opened there, and the end its traffic arrives at
  had no arrows. Divided corridors had this too. It is now decided by
  `runsAgainstDrawing`.
- **Stop lines across departing lanes.** A stop line across an arm where no
  lane arrives was painted across the whole road, because "nothing arrives
  here" and "not known" were the same null. They are now told apart, so the
  bar crosses only the arriving half. This also fixes a one-way street
  leaving a signalised junction.
- **Median trees in the lanes.** They were planted on every avenue-sized
  tile, median or not. An undivided arterial got a tree in its running lanes.
  A tree now needs a median to stand in.

The ROADMAP's other example, a five-lane one-way street, does not exist: a
one-way street fits its widest road on one tile, so it is never a corridor.

Checked in the browser:

- a straight run, a crossing and a T, from above and at an angle;
- the dead end;
- a divided road with its median, and a six-lane motorway, for regressions.

Found and not fixed: corridor furniture, and a T holding only one half (see
Open).

### Overpasses: the ghost at its deck, and a road under a bridge (2026-09-30)

Two gaps left open when overpasses shipped are closed
([overpasses.md](world-sim/overpasses.md)).

- **The ghost stands at the deck.** The preview lay flat on the ground even
  for a road that would be built on a viaduct, so an overpass's ramps and
  height showed only once it was laid. The tool now solves the deck with the
  worker's own solver, run against the render thread's copy of the grid, and
  the ghost's band, frame and markings stand on it: an overpass is seen
  climbing over the road it crosses before it is built. Doing this turned up
  one more defect. The frame straddles the run's edge, and its outer half was
  sampling the ground, which hung white walls off the deck, so a point just
  outside the run now takes the height of the run tile beside it.
- **A road can be drawn under a bridge.** A drag at ground level across a
  road already raised above it was refused, so the lower road had to be built
  first. Now, where the road above runs straight across and clears the drag
  by what an overpass would need, it moves onto the tile's over layer exactly
  as it stands and the drag is laid beneath it. That includes a street under
  a motorway viaduct, which a street may never meet. The ground under it is
  not levelled, because that would move the deck above. Undo puts the bridge
  back on the ground layer. The preview names the drag as passing under, and
  refuses one that is too low to clear or not straight across.

Checked in the browser: the ghost of a street drawn across a motorway stood
6 m over it, and a street drawn under an 8 m viaduct left the viaduct on the
over layer at 8 m, with the street at grade and no pier on the crossing tile.

### A six-lane motorway drawn as one road (reported and fixed 2026-09-30)

The user saw a six-lane motorway draw as two roads with grass between, both
running the same way, and pointed at the distinction between a single and a
dual carriageway. The rule was already right — a motorway is one carriageway
running the way it was drawn, and the other direction is a second motorway laid
beside it — and the user confirmed it stays. What was wrong was the drawing. A
five- or six-lane motorway is too wide for a tile, so it is laid across two, and
each tile drew its half centred on itself, the way a divided road's two
carriageways are drawn.

Now each half is pushed against the edge the two tiles share
([road-model.md](world-sim/road-model.md)): one unbroken carriageway, one pair
of shoulders, the yellow edge line on the driver's left and the white on the
right, and lane lines between every pair of lanes. The shared edge has no edge
line, kerb or furniture. The same offset reaches everything drawn beside the
road: one gantry spans all six lanes, standing over the shared edge, where each
half used to raise its own with its legs in the lanes; exit boards stand at the
real edge; a viaduct is one deck with parapets only at its outer edges. A
gantry's span is now its road's own, which also fixes a composed four-lane
motorway's gantry standing its legs on the shoulders. Where the motorway grows
its auxiliary lane beside a slip road, the lane opens on the outer edge only.

Found and not fixed: undivided corridors of other classes are still drawn as
two carriageways (see Open), and where an auxiliary lane ends just past a ramp's
junction tile its edge steps rather than closing.

### Turn-bay drawing and arrow sizes (reported and fixed 2026-09-30)

The user spotted two things at a junction: one arm's turn bay opened with a
notch in the kerb while the other arm's opened smoothly, and the turn-lane
markings looked too big. Checked against the markings spec and the MUTCD,
both were real, and the check found three more.

- **The notch.** A turn bay only exists while the junction's control holds
  that arm, so a signal the warrant adds later opens it. The road mesh redrew
  only the chunks a tile away from the junction, and a bay, a lane-drop taper
  or a short block's turn lane reaches much further. A bay crossing a chunk
  seam was drawn open on one side and at its old width on the other. A road or
  control change now redraws every chunk within `SECTION_REACH_TILES` along
  both axes ([rendering-architecture.md](visual-render/rendering-architecture.md)).
- **The arrows.** They were about twice the size the MUTCD calls for. It sends
  the sizes to FHWA's _Standard Highway Signs_, which draws a through arrow
  2.90 m long, a turn arrow 2.44 m and a turn-and-through arrow 3.89 m; they
  were 6 m, 4.8 m and 6 m. Every arrow is now those sizes
  ([road-model.md](world-sim/road-model.md#markings)). The lines themselves
  were already right: 0.15 m, and a 0.4 m stop line.
- **The bay's lane line** was a broken lane line. MUTCD §3B.06 ¶07 wants a
  solid line between a through lane and a turn lane, so it is solid now.
  Where the bay closes, the line runs into the centre line, not across the
  through lane to the kerb.
- **A double yellow that crossed itself.** Lines were paired across a seam by
  nearness alone, so a centre pair pushed sideways by more than the gap
  between its lines swapped partners and crossed. Lines now keep their order
  across a seam.

Found and not fixed: a wide road shorter than its own lane-drop taper — a
four-lane stub of three tiles between a junction and a two-lane street —
starts the taper part-closed, so its kerb steps at the junction's mouth.

### Median openings (found while extending tram crossings, decided and built 2026-09-30)

Letting a tramway cross a road laid as two carriageways turned up a bigger
gap. The two halves of a six-lane road never join each other along the road,
because that is what stops it reading as a junction its whole length. So a
street drawn across one ended in a T against each half, facing the median, and
nothing could cross a divided road at grade — not a car, a bus or a tram. Only
an overpass got over.

Four options were weighed:

- a median opening at every crossing;
- trams only, with the median shut to traffic;
- leave it and warn;
- move on to the farm follow-ups.

The user chose the median opening.

The rule ([road-model.md](world-sim/road-model.md)): on a row where a road that
is not a corridor half joins each half from outside, the median opens. The two
halves join across that row as a pair of junctions side by side.

- **Derived, not stored:** the opening is read off the tiles, so it opens when
  the second street arrives and shuts when either street goes.
- **One predicate:** the mask and the approach walk ask the same one,
  `medianOpens` in `shared/corridor.ts`.
- **One-sided streets:** a street meeting one half only still turns in and out
  with the traffic.
- **Mask refresh:** a mask can now depend on a tile two steps away (the road
  beyond the far half), so the refresh after a command reaches two tiles.
  The network guard in the interaction tests caught the one-tile version at
  once.
- **Trams:** a tram crossing may now be two tiles long, so a tramway goes over
  both halves.
- **Existing saves:** a crossing a save already holds stays shut until its
  street is laid again, because a save keeps what its network linked.

The small town now carries main street across a six-lane road. The user
guide's two stale lines, which said six- and eight-lane roads were still to
come, were corrected in the same change.

### Tram crossings (found by the small town, decided and built 2026-09-29)

The small town's regression found that a tramway drawn across another street
carried nobody. A tramway never takes a tile from a road it does not outrank,
so the crossing tile stayed the street's. The tram graph is built from tram
tiles alone, so it broke there, with nothing on screen to say why. Three fixes
were weighed:

- let the crossing be a shared junction;
- let the tram take the tile, which breaks the rank rule and strips the
  crossed street's layout;
- refuse the drag.

The user chose the shared crossing, which is how real trams cross at grade.

A street tile joined to tram track on two opposite sides is now a tram
crossing ([transit-model.md](world-sim/transit-model.md#tram-crossings)). It
is worked out from the tiles each time and never stored, so the save format
does not change. The tram graph counts the tile as track along that axis and
links it only to the track on that axis, so a tram goes straight over and
never turns there. The street keeps its own lanes, class and junction, and the
road mesh runs the rails across the junction box. The graph builder now takes
a network shape rather than a bare tier predicate. The road and rail networks
are unchanged, and the tram network adds the crossings.

The small town's tramway now crosses the avenue, and its line only runs
because it does. A crossing is one tile: a tramway across a road laid as two
carriageways still stops, which is left open in Status above.

### Interaction tests, and a small town that regresses everything (asked for and built 2026-09-29)

Asked for after farms shipped: regress the game by setting up a farm and
growing a small town with every road type, every building and garbage, a
railway with stations and a bus line from stop to stop, and gather every
test of that kind in one tests folder.

The tests that drive the whole sim through its commands moved out of the
3,000-line `src/sim/worker.entry.test.ts` into `tests/interaction/`, one file
per thing a player does, sharing a harness in `tests/support/`. Only the unit
tests of `worker.entry.ts`'s pure exports stayed behind, and the mirror and
undo-stack tests that booted a worker sim moved too. No test was dropped: the
131 that moved still pass.
[testing.md](engineering/standards/testing.md#where-a-test-lives) says which
kind of test goes where, and the ground truth that every test sits beside its
module now covers unit tests only.

`tests/interaction/town.test.ts` builds the small town from
`tests/support/town.ts` and grows it. Among what it checks is the end-to-end
determinism test ADR-0002 asked for: two towns from the same steps and seed
save identically, byte for byte. It also checks that undoing every step gives
back the untouched map. Everything the town exercised held. Building it found
one gap, left open in Status above: a tramway drawn across another street is
broken at the crossing. The town's tramway ends at the avenue instead.
`tools/town-shots.mjs` photographs the same town in a browser, loaded as a
saved game.

### Farms, and the soil they grow on (asked for and built 2026-09-29)

The player asked for agriculture painted like residential land, growing under
industrial demand, drawn with barns, silos, penned animals, furrowed fields and
orchards, built off dirt roads, and allowed only on land fertile enough to
farm. They chose four things:

- farms need power and no city water;
- the soil decides the kind of farm;
- farm jobs stay at published figures;
- farms grow larger by soil, not land value.

**Soil.** Every tile has a soil grade worked out from the ground itself:

- beach sand, the water's edge, rock and slopes over 20% are unfit;
- the other bands are the land-judging slope classes;
- stony patches are pasture at best.

It is derived and never saved, one function for worker and render alike, and
the Soil lens shows it.

**Farmland.** It is painted only where a dirt road's frontage reaches, 8 tiles
deep. The lot's soil picks row crops, an orchard or pasture. A farm's jobs are
industrial jobs, one to five by kind and level, from labour hours per acre and
per cow. Its family of four counts as population.

**What it looks like.** A farm is drawn from one plan:

- the barn's walls are its pickable body;
- a kit adds the gambrel roof, farmhouse, silos, bins, orchard trees, and the
  paddock fence and grazing cattle;
- the ground gives the field bands, the gravel yard and a fallow field once
  abandoned.

No industrial parking, stack or asphalt ever lands on a farm. See
[the design](game-design/features/farms.md) and
[the plan](engineering/features/farms.md) for sources and figures, and
[Soil](world-sim/world-model.md#soil) and
[Frontage and zonability](game-design/simulation-rules.md#frontage-and-zonability)
for the rules. `tools/farm-shots.mjs` grows a farming district and
photographs every kind of farm, the Soil lens, the zoning grid, night and an
abandoned farm.

### One-way carriageways, and the small-town economy (decided and built 2026-09-29)

Asked whether a ramp is strictly one-way, the player chose realism, and the
same held for the motorway: the spec had always called each motorway line one
carriageway flowing one way, but the router drove every road type but the
one-way street both ways, so a ramp or a motorway could be taken against its
flow at a price. A direction a road's cross-section has no travel lane for is
now never driven, whatever the road type — one-way street, motorway, ramp,
corridor half or a composed one-way profile — and a road laid before flow was
stored is gated by its type's `oneWay` as the one-way street always was. A
city built with a single motorway line now carries traffic one way on it, as
a real carriageway does. See
[Stored direction and one-way roads](world-sim/road-model.md#stored-direction-and-one-way-roads).

Asked to rebalance demand, the player wanted a small town to behave like a
real farming or mill town, which needs its agriculture or industry to
flourish. Demand is now economic base theory, built on published figures:
industry is the basic sector, each industrial job supports 0.81 local ones
(the 1.81 multiplier measured across nearly 200 small US communities,
Mulligan 2008), people follow work both ways, and the workforce is half the
population (the US labour force, BLS 2025) rather than 55%. Jobs still under
construction count as supply, so a spurt of building does not overshoot.
A town of homes with no industry now stops growing; a town whose shops
outrun its industry grows industry, not shops. Farms themselves were built
the same day; see the entry above. See
[Demand: the RCI model](game-design/simulation-rules.md#demand-the-rci-model).

### The workforce, and a docs sweep (requested and built 2026-09-29)

The player noticed industry was not growing, with the Advisor reporting 45%
of residents out of work. Industry was right not to grow: only 55% of
residents work (`EMPLOYMENT_RATE`), the town's jobs already outnumbered that
workforce, and industrial demand falls as the workforce is absorbed. The
Advisor was wrong: it measured unemployment against every resident, so any
city with work read at least 45% out of work and was told to zone more
industry, while its "employers cannot find workers" check could never fire.
The workforce is now one constant in `src/shared/constants.ts`
(`workforceOf`), and employment, industrial demand and the Advisor all
measure against it: unemployment is a share of the workforce, and empty jobs
past a quarter of the workforce say "zone more housing". Whether commercial
demand should leave industry more room in a small town is a design question,
left open in Status above.

The same change swept the documentation against the code. Status above was
eleven days behind; four History headings still called shipped work unbuilt,
and road composition claimed interchange stamps, the 2×2 roundabout and sound
barriers that were never built. Street markings and signs were described per
tier from before the class model, a rail track as a level crossing, lamps and
buses at a 16 m tile's figures, the determinism exception as one file where
it is three `src/app/` files, and feature plans each claimed the same save
version and vehicle kind. Every figure changed was read off the code first.
The ramp question was decided the next day; see the entry above.

### Brownouts from the far end of the grid (requested, specified and built 2026-09-28)

The player reported houses turning dark and back at random, and confirmed the
city was short on power: a second wind turbine stopped it. The cut had left
abandoned buildings out of the count, so an abandoned home got its own supply
back, came back to life, tipped the grid over again and was cut again — every
four growth passes, for ever, with the Advisor's shortage alert blinking off
on every fourth. Asked what a short city should do, the player chose realism:
the homes furthest from the power source are cut first, building stays as it
is, and zoning more land does not add demand, because people want power.

Built (2026-09-28): the cut lines up every building the network reaches by
network steps from the nearest generator and cuts from the far end, abandoned
buildings keeping their place; growth builds and levels up only into spare
supply; and the Advisor names a shortage as one (`PowerShortage`,
`WaterShortage`, and a warning while growth waits) instead of blaming a gap in
the network. See [Brownouts](world-sim/utilities-model.md#brownouts).

### Homes that face their street (requested, specified and built 2026-09-28)

The player reported five things about houses: a roof piece hanging off the
side of a house, houses standing apart from the sidewalk, garages with no way
through to the road, homes that read as boxes on a dark rectangle rather than
as houses with yards, and cars parked in the street at night where it shows
no parking. Asked, they chose a short front yard (the lawn to the sidewalk,
the house about 5 m back), a kerb that takes cars at any hour only beside a
painted parking lane and short daytime stays where the street allows parking
but paints none, and drives and yards for row houses as well as detached
homes. The layout is [Residential lots](art/buildings.md#residential-lots)
and the kerb rule
[Parked cars and lot life](art/props-and-vehicles.md#parked-cars-and-lot-life).

The roof is fixed (2026-09-28): it was the previous level's roof, left
standing when a home that had just finished building levelled up before the
next snapshot, because the delta named it both updated and removed. The
worker now settles each snapshot's building delta so an id is in one list
only.

The rest is built (2026-09-28). One pure planner (`planHouseLot`) lays a
home's lot out from its street, and the lot renderer and the house kit both
stand on it: the house 5.5 m behind the sidewalk, its lawn across the verge,
a drive through a curb cut to a spot, a carport or a garage, a car on it, a
front door and path, and a yard of fence, patio, grill, pool, trampoline,
bushes and trees; a row along its street is one home per frontage tile. The
lawn is a lighter, measured green (`mownLawn`), since the chart's foliage
green read as the dark rectangle the player described. The kerb reads the
street's parking lane for overnight parking and its tier for short daytime
stays, and no home parks there any more. Checked in the browser on placed
and grown homes and on a street with and without a painted parking lane.

### Snapping to roads (requested, specified and built 2026-09-28)

The player asked for snapping between curved and grid roads both ways, a
toggle for it on every road type, roads that never connect when it is off,
and a drag from a road's end that carries on from it in the selected path
mode. Asked, they chose: off means never joined and kept that way through a
save, while a real crossing still becomes a junction; a grid drag from a
curve's end moves the curve's end onto the tile centre in the same undo step;
and a continuation lays the road card selected. The behaviour is
[interaction.md](ux/interaction.md#snapping-to-roads) and the world rule
[road-model.md](world-sim/road-model.md#how-roads-meet-rank-replacement-and-transitions).
Four stages: the preview refusing a grid drag into a curve; roads laid apart
in the world; the toggle with end snapping and carrying on; moving a curve's
end.

Stage 1 is built (2026-09-28): a grid drag into ground a road off the grid
holds is refused in the preview with the world's own sentence
(`gridRunRefusal`, shared by the world's `buildRoad` and the tool's preview
against the mirror), where before the ghost read valid and the world refused
it after release. The world's refusal had no test until now. Checked in the
browser: a street dragged across a curve draws red with the reason, lays
nothing, and one stopping short lays.

Stage 2 is built (2026-09-28): `buildRoad` takes `join: false`, which keeps a
road apart from the roads it only lies beside or ends against and still joins
the one it crosses. What is held apart is the absence of a link in the
network, so it survives a save and a load, and a derived layer
(`roadSeparate`) carries it to the masks, the graph, the utility and service
spreads, the approach walk and the road furniture. An undo puts it back
exactly. Nothing in the road tool sends `join: false` yet; that is stage 3.

Stage 3 is built (2026-09-28): a `Roads` chip in the road tool's Snap row, on
by default. On, a road end within half a tile of the cursor — a node at most
one road leaves (`nearestRoadEnd`) — takes the drag ahead of every other snap:
a grid drag starts and stops on the end's tile, a road off the grid on the end
itself, and `Curve` mode marks where its first click would land. Off, nothing
snaps and every grid road is sent with `join: false`. A grid drag started on
a curve's end off a tile centre is still shown refused; moving that end is
stage 4.

Stage 4 is built (2026-09-28): a grid drag started or stopped on a curve's
end off its tile centre sends `moveSegmentEnd` ahead of the grid road, which
lays the curve again with that end on the tile centre, free, undone by the
move back. The world plans the moved road with its old self taken away
(`moveRoadEnd`), and the preview judges the grid run against the world as the
moves leave it (`gridRunRefusalAfter`), so a move a rule forbids is refused
before release with that rule's reason.

### Free-form roads (requested 2026-09-23, specified and built 2026-09-24)

Every turn was a grid corner, a quarter circle inside one 20 m tile, which is
wrong for a motorway at 100 km/h, and two roads could only meet at right
angles. The player asked for a three-click curve tool with a ghost, used by
motorways in place of the grid drag and offered to every road. Offered a curve
limited to right-angle bends between grid ends, they chose fully free-form
roads meeting at any angle. That moves the road store from per-tile layers to
a network of nodes and segments, with the tile layers derived
([ADR-0016](engineering/adr/0016-roads-are-a-network-of-nodes-and-segments.md),
superseding ADR-0005). Specified in
[world-sim/road-network.md](world-sim/road-network.md), which lists the eight
stages it is built in, and
[ux/interaction.md](ux/interaction.md#curve-and-free-road-modes).

Stage 1 is built (2026-09-24): the network is the road store
(`src/world/roadnet.ts`), saved in place of the road tile layers
(SAVE_VERSION 13), with older saves converting on load. The grid commands keep
planning on tiles; after each command batch the network takes up the plan and
the layers are derived again, and every worker test fails if one tile ever
derives differently. The sync costs about 20 ms per command batch on a full
map of streets.

Stage 2 is built (2026-09-24): the routing graph (`src/world/roadgraph.ts`),
the utility spread and the service spread walk the network's cells instead of
tile masks and tile adjacency. The graph was checked identical to the old
tile-built one over 150 random grids in all three networks before the old
builder was removed. The spreads changed on purpose: they used to step onto
any adjacent street tile, so power and coverage leaked onto a deck running
beside a street and between roads the rules never join; now they go only
where roads join. Vehicles following segment centre lines moved to stage 4,
where there are curves for them to follow.

Stage 3a is built (2026-09-24): the world holds roads off the grid. The shared
geometry (`src/shared/roadgeom.ts`) samples a straight or curved centre line
and measures its length, tangents, tightest radius and footprint without any
trigonometry, so every machine decides the same. `buildSegment` and
`removeSegment` lay and take away one free road through `planSegment`
(`src/world/freeroads.ts`), which checks every geometry rule; a free road
writes no road tile, holds its footprint in the derived `roadFootprint`
layer, meets a grid road only at a tile centre, and survives every grid
command. Designing it turned up one rule that needed changing: kerbs near a
junction may overlap for longer the narrower the angle between the roads, or
no ramp could ever merge.

Stage 3b is built (2026-09-24): the road cells gain a cell for each tile a
free road's centre line crosses, carrying its share of the length, and one
for each free node. The graph walks neighbour lists instead of compass bits
(checked identical to the old builder on grid-only worlds before the old one
was dropped), so a route runs across a free road and its run is as long as
its centre line; a one-way free road routes only the way it was drawn. The
utility and service spreads walk the same cells, a power line feeds a free
road beside it, and a facility beside a free road finds it.

Stage 3c is built (2026-09-24): a free road fronts lots square to its centre
line from its kerb, out to the zoning depth, in the one zonability predicate;
zones and buildings are kept off its footprint; and a lot beside a free road
counts as having a road for growth. Not yet: the render thread has no copy of
the network, so the zoning grid visual cannot show a free road's frontage
while `paintZone` honours it — a disagreement the rules forbid, closed in
stage 4 when the render thread takes up the network to draw it, and before
the tool (stage 5) lets a player lay one. Cosmetic vehicles stop where a route
leaves the grid until they follow a centre line (stage 4), and nothing draws
free roads yet (stage 4).

Stage 4a is built (2026-09-24): the worker sends the road network to the
render thread whenever it changes, and the render thread derives the free
roads' footprint from it the way the worker does, so the zoning grid visual
now shows a free road's frontage exactly where `paintZone` accepts it — the
disagreement left by 3c is closed, checked by a test that drives a real
worker and compares the two masks. Free roads are drawn
(`src/render/freeroadmesh.ts`): the cross-section swept along the centre
line with kerbs, footways, medians and the markings plan, and a junction
meshed at each node from the roads meeting there, with rounded kerb returns.
Checked in the browser on a curve leaving a grid street, a free three-way
junction and a curved one-way street. Where a free road meets a grid road,
the free-road junction draws that grid tile whole (2026-09-25): each grid
road meeting it is carried to the tile's edge in its own section and paint,
the edge lines turn round every kerb return, the junction meets a curve
where the curve actually is, and the tile renderer draws nothing of the tile
and stands no furniture or lamp on it. Before, the tile's old corner or
straight drew underneath, its kerb across the new road's mouth and its sign
in the carriageway. Checked in the browser on a curve leaving a grid corner
and on one leaving a straight grid street at an angle.

Stage 4b is built (2026-09-24): street lamps stand along free roads between
their junctions, at the grid's lamp spacing, on alternate kerbs, reaching
square across the road, and only where the road has power. Every lamp is now
placed as a stand in world space — where the pole is and which way the arm
reaches — so grid lamps and free-road lamps are one instanced set; the grid's
lamps came out unchanged (all 45 lamp tests pass as they were). Checked in
the browser by day and at night, with a free junction that has no power left
dark beside a lit curve. Signs and kerbside furniture along free roads moved
to stage 6: the grid places them by each tile's role at its junction, and
junction behaviour off the grid is what stage 6 builds.

Stage 4c is built (2026-09-24): cosmetic vehicles follow free roads. Every
graph edge carries the line a vehicle drives along it — grid tile centres and
a free road's centre line about every 5 m, run the way the edge is driven —
and a path joins them, so cars, service vehicles and garbage trucks all
drive round a curve instead of stopping where a route left the grid. The
tile-adjacency cut stays only for an injected network that gives no line.
Checked in the browser on a small town grown along a free curve: 14 of the
17 vehicles within 25 m of the curve were on its centre line, the rest on the
grid street at its mouth. Stage 4 is complete.

Stage 5a is built (2026-09-24): the road tool's `Curve` mode. Three clicks —
the start, the bend, the end — with the start and end snapped onto a road
node within 4 m or to the centre of the grid road tile under them; a ghost at
the road's real width, red when refused; and a chip with the cost, the length
along the centre line and the tightest radius, or the reason it is refused.
The preview runs the world's own `planSegment` against the render thread's
mirror, so it refuses exactly what `buildSegment` would. Backspace takes back
a click, Escape drops the curve, and a right-drag turns the camera without
losing it. A one-way road runs from the first click to the last. Motorways no
longer offer `Grid`, and with `Grid` selected they run straight. Checked in
the browser: a curve laid off a grid street (charged the ¢302 its chip
quoted), a too-tight curve refused with the 40 m radius it needs, Backspace,
Escape, and the motorway's options.

Stage 5b is built (2026-09-24). `Straight` with the 90° lock off lays a road
at any angle once the drag leaves its row or column; along one it is still a
grid street. A road end landing within 4 m of a free road's centre line lands
on it, and the road is split there by the new `splitSegment` command — sent
in the same batch as the new road, so one undo takes both back; its inverse,
`joinSegments`, puts the road back exactly as it was, and neither costs
anything, where undoing by removing and rebuilding would have refunded and
charged. The preview plans on a copy of the network with the split made, so
it still refuses exactly what the command would. A bend placed within 8 m of
the line of the road a curve starts from is pulled onto it, so a road carries
on round a bend without a kink. Checked in the browser: a diagonal laid off
the grid, a straight drag ending on it splitting it into a T-junction, and a
curve continuing the first one smoothly from its end.

Stage 5c is built (2026-09-24): with guide snapping on, a free road's end
that lands on nothing is pulled onto the centre line of the nearest row or
column a grid road runs along, within the same reach a grid drag's end has,
so a road off the grid can be started or ended in line with a street. It
finds its guides with the grid drag's own rule, shared rather than copied.
Stage 5 is complete.

Fixed (2026-09-25): a bridge could be drawn cut off from its own road, its
deck capped as a dead end and a stretch of ramp standing alone between two
caps. The bridge solver lays ramps at exactly the steepest grade, 2 m a tile,
but a deck is read back as ground plus lift in single-precision floats, and a
step could come back a few millionths of a metre over 2 m — failing the
one-level test by which roads join. The test now allows a millimetre, and the
three places that judged it (the masks, the bridge solver, the tool) share
one predicate. Every road type that bridges was checked across the same river
in the browser, with every tile joined.

### Overpasses (requested 2026-09-23, built 2026-09-24)

A road could not cross another road or a railway without meeting it, because a
tile held one road. So a street could not get past a motorway at all, and two
motorways could only cross as a flat crossroads. The player asked for real
road-over-road overpasses with height rules, and chose a true second road
layer ([ADR-0015](engineering/adr/0015-a-crossing-tile-may-carry-a-second-road-passing-over.md)).
The second road is stored only on the tiles where it crosses; the ramps up and
down are ordinary bridge approaches. Specified in
[world-sim/overpasses.md](world-sim/overpasses.md) and built in four stages:
the world holding the second road (SAVE_VERSION 12) with its build, refusal and
bulldoze rules; the graph, masks and utility and service spreads keeping the
two roads apart, with the rule that roads join only at one level; the renderer
drawing the overpass, its girder and piers, and cars riding it; and the road
tool offering an overpass where a street meets a motorway or a railway, raised
to the clearance. Checked in the browser by dragging the real tool across a
motorway.

Two pieces followed on 2026-09-30: the ghost standing at the deck, and a road
drawn under a bridge already there (see that entry above).

### A road's tier is its size (2026-09-15)

A profile carrying a bus piece derived the bus tier whatever road it was, a
tram piece the tram tier, a bike piece the bike tier — and the tier is where
cost, upkeep, unlock and the road's own name come from. So a ¢20 street given
a bus lane was charged ¢55, the price of an arterial it had nothing to do
with, and called a Bus Lane. A two-lane street and a four-lane street with the
same lane added were the same road.

The tier is the size now. Rail stays a tier, being a class rather than a lane
of a street. What the reserved lane adds rides on the profile: a price per
tile, an upkeep per tile, and its own unlock milestone.

**The surcharges are derived, not chosen.** Each is the gap between the road
that used to stand alone and the ordinary road of its own class, over the
reserved lanes it carried — the bike road was a local street with a bike lane
each side, the bus road an arterial with one each side, the tram road an urban
street running rails in both lanes. Composing what one of those roads was
therefore costs exactly what that road cost, which is checked against all
three; a figure picked by feel fails it. Presets are still priced as
themselves, so a city built before is worth what it was.

Upkeep had to move too: it was summed from the stored tier byte, which is the
size and cannot tell a street with a bus lane from one without. Speed and
capacity were never tier-driven — the pathfinder reads them off the
cross-section — and rank is the class plus whether a reserved lane is present,
so both were already right. Checked through the worker, which is what takes
the money: ¢20 a tile plain, ¢25 with one kerbside bus lane.

### The ghost shows the road, not the tile (2026-09-15)

Every road previewed as a full tile, so every road previewed the same width —
and the width is the thing the player is choosing. Replacing a street with
something nearly twice its size said nothing until it was laid. The ghost's
base layer now draws a band at the composed section's own width: 11.25 m for a
two-lane street, 19.95 m for an avenue over the top of it, and 33.27 m across
a six-lane corridor's two rows, which is one row of spacing plus one
carriageway. A `ghostBounds()` dev hook reports the ghost's extent in world
metres so this is measured rather than judged by eye
([`tools/ghost-shots.mjs`](../tools/ghost-shots.mjs)).

**A premise checked and dropped.** The work began on the assumption that a
wider road would overhang its tile and that seeing the overhang was the point.
It does not: no layable road exceeds a tile, because a section too wide
becomes a corridor whose carriageways each fit one. The value is the size
contrast, and the corridor's second ROW of tiles is the case that really
claims new ground.

Two defects fell out of it. The axis a band runs along was inferred from the
neighbouring entries in the tile list, but a corridor arrives as two parallel
runs in one list — where the first ends and the second begins, the neighbours
are a row apart and evidence of nothing; read as neighbours they turned every
carriageway sideways. Only adjacent tiles count now, and the stripe layer
shared the fault. Separately, the preview said "Locked" on roads the worker
would have built: the sandbox unlock reached the drawer and the worker but not
the judgement between them.

### A transit lane is a variant of a size (2026-09-15)

A bus lane, a bike lane and a tramway stopped being road types of their own.
The road tool's Profile row offers Bus and Tram wherever the class carries
them, the three standalone cards are gone, and the Roads tabs read Small /
Medium / Highway / Rail — rail being the one transit mode that really is its
own network. The retired tiers stay in the catalog because a saved grid stores
a raw tier byte per tile.

**The composer and the class table disagreed.** A bus lane on a two-lane
street composed cleanly and fit the tile at 16.85 m, but `layRefusal` rejected
it: the model had learned bus and tram and the class table never had. Parking
on an arterial was the same defect. Every piece choice is clamped to what the
class admits now, in the one place the tool reads to decide what to offer, so
the variants a size is offered are exactly the variants it can be laid as.

That leaves the lane range deciding what a small street carries, which is the
realistic answer arrived at rather than asserted: a local street is built for
two or three lanes, so it takes one bus lane and is refused two, and it runs
its tram mixed because a twin-track reservation is two more lanes.

**The rails were drawn per tier, down the tile centreline**, so a twin-track
reservation drew one track in the middle of it. A tramway's rails follow the
lanes that carry them now — a reservation gets one on each of its two lanes,
mixed running one in each lane it shares. A railway has no lane pieces to read
and keeps its single centred track.

### Road geometry audit (2026-09-08, closed 2026-09-17)

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

**Junction geometry, four defects found by inspection (2026-09-08; each since
fixed or retracted).** An avenue crossing a two-lane road, photographed straight down at
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
4. ~~**A crossing is painted straight over a divided road's median.**~~
   **Retracted 2026-09-12.** Built an avenue crossing an avenue with a
   signal forced on so every arm carries a crossing, and photographed it:
   the median ENDS at the crossing and the bars cross clear asphalt. The
   claim came from misreading an earlier avenue × two-lane shot.

   **The signal's mast arm did not reach the lanes it holds (fixed
   2026-09-14).** The other half of the same finding, carried unclaimed for
   three days because a mast arm is foreshortened to nothing in an overhead
   shot and there was no read-back for a head's position. `readSignals()`
   re-derives mast and head in world metres through the same transform the
   renderer writes into the instance matrix, and settled it: the head hung
   **0.03 m** inside an avenue's kerb. The arm is a short 1.9 m and the mast
   stood where a flat BOARD stands, at the back of the footway, so the arm
   was spent crossing the paving. The mast stands at the kerb face now — a
   distinction the file already drew for parking meters — and the head hangs
   1.4 m over the carriageway on both an avenue and a two-lane street.
   Nothing about the arm or the head changed; only which side of the footway
   the post is on.

### The corner a junction actually turns (2026-09-14)

A player report that markings were off at intersections, that small roads
meeting large ones looked wrong, that footways did not connect, and that the
rounding was on the wrong part of the corner. Measured, not eyeballed — and
the last three turned out to be one defect.

**The instrument first.** `readPaint` only sees bands running a tile's whole
length, and a kerb return is a couple of metres of corner reaching no tile
edge. So the one piece of geometry most often reported wrong was the one piece
no read-back could see, leaving a screenshot at a shallow angle, which had
been misread five times. `readSurface` samples the mesh point by point and
reports the topmost surface over each, which draws a corner as a map.
`tools/roadconformity-shots.mjs` prints that map for a set of mixed-class
junctions beside the bands, the section and the resolved control.

**The kerb return was anchored on the wrong corner (fixed).** It assumed both
arms were as wide as the junction itself, so at every junction of unequal
widths it rounded a corner that is not there: it cut an arc out of the footway
at the tile's OUTSIDE corner, where nobody drives, and left the two kerbs
meeting at a square right angle where they actually meet. Equal widths were
correct throughout, which is why it survived — every test covering it used
arms of one class. The corner is now the one the two ARMS make, tangent to
each arm's own kerb, capped by the smaller of the two depths; an arm without a
kerb of its own does not move it. The footway that carries a person round to
the next crossing stops at the return rather than paving over it. Confirmed
in the corner map before and after and in pixels: the footway now sweeps round
into the side street instead of stopping square, and the verge rounds with it.

**The motorway is limited access (built).** It met any street except a dirt
track or an alley, so a two-lane road could take a crossroads straight through
four lanes of motorway traffic. The rule that a motorway reaches the surface
network only through a ramp had been deferred in the code "until ramps exist
as something the player can draw" — they do, and at the same milestone, so the
deferral's own precondition was met. A motorway now meets a motorway or a
ramp and nothing else, stated as what it accepts so a class added later stays
off it, and the refusal names the ramp instead of only saying no.

### An alley is an access, not a leg (2026-09-14)

A player screenshot of two alleys meeting a two-lane street, with three
complaints. All three were real, and they turned out to be one idea: **an alley
is a service access, not a leg of the traffic network.** Everything else about
the junction was already treating it as an ordinary arm.

- **The street grew a third lane for it.** Measured: the two-lane widened
  7.50 → 9.03 → 10.55 m over two tiles and carried a left-turn arrow, because
  the alley stopping at it warranted a `stop` control and a pocket was
  warranted by "the control is not `none`". But a minor-road stop holds the
  ALLEY, not the street; the street runs through unheld, with no queue to take
  a turning driver out of. A pocket now needs the junction to hold that arm —
  `controlHoldsArm`, off the same give-way answer the delay model already
  computed, so the sim and the geometry cannot drift apart. Verified the
  mechanic survives where it belongs: the side street still earns its bay
  approaching a signal and approaching a four-lane road.
- **And the alley took one of its own, which is what made its mouth flare.**
  Flagged as an 81% widening (3.75 → 6.80 m) and assumed to be a junction
  bellmouth; measured, it was `pocket: true` on the alley arm. Nothing in the
  movement set prevents it — the default says every arm goes through and turns
  left, so an alley earned a storage lane at a tee it cannot even go through.
  A service access now takes no pocket at all. The alley holds its own 3.75 m
  into the junction at both a two-lane tee and an avenue tee.
- **The footway swept 4.5 m round into the alley mouth.** It runs straight
  past now and the alley crosses it. A kerb return is between two kerbs and an
  alley brings none.
- **A road ending at an alley bent itself 90° to become the alley.** The tile's
  SHAPE is now read off its legs: a service arm still takes asphalt and still
  connects, but it does not turn the road and does not stop it being a dead
  end. The road runs straight to its own turning head with the alley as a leg
  off the side. A street-to-street corner still curves.

**The crossing was three times too deep, same inversion as the kerb return.**
Found looking for the third complaint ("the crosswalks seem stretched"). Its
depth was `armDepth` — the tile left over beside the carriageway, which runs
opposite to the road: 6.25 m beside a two-lane street, 1.90 m beside an avenue.
So the quiet street got a crossing 20 ft deep and the busy one a normal 6 ft. It
is the footway's width now, floored at the 1.8 m minimum (MUTCD 3B.18).

Shortening it exposed a second half to the same bug, caught by measuring the
result rather than trusting the fix: the crossing is anchored at the TILE EDGE,
the outer end of that strip, so a shorter one floated there with 4.4 m of road
between it and the kerb it is meant to meet. It sits against the kerb line now.
And the alley's own crossing then landed underneath the footway that had just
been made to run across its mouth — so no crossing is painted over a service
access at all: the pavement is the way across.

The whole 84-case road matrix was re-run against this session's geometry
changes — corner fills, flank footways, end caps, the turn gate, crossing
depth — and reports `road matrix uniform`.

**Checked and NOT defects.** A four-lane road crossing a two-lane street
carries no crossing or stop bar on its own arms, which reads as missing paint
and is the give-way rule working: an arm that gives way is painted, an arm
running through is not, a signal holds every arm, and an uncontrolled
crossroads is painted not at all. The harness prints the resolved control
beside the map so this is read against the rule rather than called a defect
on sight.

**The approach flare reads back now (closed 2026-09-17).** It was the
read-backs that were blind, not the flare that was wrong: `readApproach` and
`readDrawn` reported the plain section on a tile that had visibly flared, and
the matrix logged 17 findings on one-way, tram, ramp and mixed-class
crossroads runs because of it. Both now report what the tile carries — a
street approaching a four-lane road reads `pocket: true`, three lanes and
10.55 m against the plain 7.5 m, and the openness steps 1 → 0.5 down the zone.
The matrix run on 2026-09-17 reports uniform across all 72 scenarios with no
findings.

Two smaller notes from the original run are still unchased, and neither has
been shown to be a defect: a dead end stops all its paint at the junction-box
boundary, leaving an unpainted apron before the rounded bulb (consistent
across marking types, so likely a design consequence), and a fresh map with no
roads on it already submits six empty draw calls (an empty map submits them
too, so they are not the roads').

### Road composition (2026-09-05 – 2026-09-17, shipped but for three pieces)

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
  compact roundabout. (The other
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
- **Waves 5–6 — ramps; two-tile corridors (built by 2026-09-17, but for three
  pieces).** The ramp class with its merge, diverge and terminal junctions
  (wave 5) and a section too wide for one tile laid as two carriageways
  (wave 6, [`shared/corridor.ts`](../src/shared/corridor.ts)) are built, as
  specified in [world-sim/road-model.md](world-sim/road-model.md). Interchange
  stamps followed on 2026-09-30 (see their entry above). Not built: the 2×2
  compact roundabout, and sound barriers.

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
`src/tools/tools.ts`, `src/ui/RoadToolOptions.tsx`, `src/ui/JunctionPanel.tsx`,
`src/ui/categories.ts`, `src/ui/advisor.ts`.

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

### Power-conducting roads (requested 2026-09-06, built by 2026-09-17)

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
with an unreachable lot mid-rollout. Specified, including acceptance and
verification criteria, in [world-sim/utilities-model.md](world-sim/utilities-model.md),
and built: a lamp stands only on a powered road tile, the power
line is placeable, and only a sealed road conducts
([`sim/network.ts`](../src/sim/network.ts)).

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
