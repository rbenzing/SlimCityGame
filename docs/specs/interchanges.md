# Interchanges

- **Status:** Built

**Owns:** the Interchange tool: the diamond, partial cloverleaf and full cloverleaf laid on a motorway already there in one click and one undo, and the layout, refusal and cost rules behind them.

**Rules:**

- Store nothing: an interchange is the ordinary roads it lays, sent as one batch of `buildRoad` commands whose inverse is one undo. [R-roads-062]
- Lay every ramp at ground level with its heights given exactly, and lay the street out above sea level, never left to a solver. [R-roads-062]
- Obey the ramp rules: an exit joins the motorway at its start, an entrance at its end, alongside it and running its way. [R-roads-061]
- Carry the street over the motorway on the second road layer, clearing it as any overpass does.
- Meet a ramp to the street only at the ramp's end, where the street is on the ground.
- Refuse in the preview and again at commit, with the first reason, and send nothing if refused. [R-roads-062]
- Read the site from the carriageways already there: one group, or two running opposite ways with each driver's right facing away from the other.

**Numbers:**

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `RAMP_REACH_TILES` (R) | 8 | tiles (160 m) | the auxiliary lane length the road model already gives one |
| loop block | 4 tiles square | tiles | dial |
| loop radius | about 40 (130) | m (ft) | 25 mph design speed needs 134 ft; minor movements 100–170 ft, [MoDOT 234.5](https://epg.modot.org/index.php/234.5_Cloverleaf_Interchanges), [INDOT ch. 48](https://www.in.gov/dot/div/contracts/design/Part%203/Chapter%2048%20-%20Interchanges.pdf) |
| diamond terminal from ramp column | 2 | tiles | dial |
| nearest junction to the bridge | under 200 ft (61 m) | ft | compressed diamond, [MoDOT 234.2](https://epg.modot.org/index.php/234.2_Diamond_Interchanges) |
| nearest junction to the motorway edge | 50 (164 ft) | m | dial |
| diamond's two junctions apart | 140 (460 ft) | m | dial; a conventional diamond is 800–1,200 ft |
| street deck, `interchangeDeck(tier)` | 6 | m | `overpassRise(tier, Highway)` rounded up to `ROAD_ELEVATION_STEP_M` (2 m) |
| `BRIDGE_MAX_GRADE` | 2 | m a tile | the street comes down this fast |
| first ground column `g` (flat) | `deck / BRIDGE_MAX_GRADE − 1` = 2 | columns | derived |
| `FALLING_GROUND_TILES` | 4 | tiles | the most a falling side moves out |
| street run-on beyond outermost junction | 2 | tiles | dial |
| straight reach checked each side | `R + 1` | tiles | derived |
| bridge join tolerance | 1 | mm | float rounding |
| cloverleaf weave needing a collector-distributor | about 1,000 | vehicles an hour | [WisDOT FDM 11-30](https://wisconsindot.gov/rdwy/fdm/fd-11-30.pdf) |
| form definitions | n/a | n/a | [TxDOT, types of interchanges](https://www.txdot.gov/manuals/des/tsp/chapter-11-interchange-analysis/11-2-interchange-configuration-evaluation--ice----/11-2-1-types-of-interchanges.html) |

**Code:**

- `src/shared/interchange.ts` `readInterchangeSite` — the site read from the carriageways on the hovered row.
- `src/shared/interchange.ts` `interchangeDeck`, layout — the street's deck and the ramps' corners.
- `src/shared/interchange.ts` `interchangeRefusal` — the first reason, or null.
- `src/shared/interchange.ts` `interchangeCommands` — the one batch: street first, then ramps.
- `src/tools/tools.ts` — the `interchange` tool: hover preview, label, cost, click to lay.
- `src/shared/types.ts` — `ToolId` gains `interchange`.
- `src/ui/categories.ts`, `src/ui/AssetDrawer.tsx` (`AssetDrawer.tsx`) — the Interchange card in the Highway tab.
- `src/ui/InterchangeToolOptions.tsx`, `src/ui/store.ts` (`store.ts`) — the options row: form and crossing road.
- `src/main.ts` — the env reader over the client grid and the options wiring.
- `src/world/grid.ts` `isRoadBuildable` — reads only size, height and water.

**Tests:**

- `src/shared/interchange.test.ts` — site, exact diamond tiles and heights, the four layout rules per form, single carriageway, slope, every refusal.
- `tests/interaction/interchanges.test.ts` — every form through the real commands: all eight movements route, straight stays straight, one undo restores the grid.
- Tool tests — the preview's refusal, label and cost; commit sends nothing when refused.
- A browser look at each form on uneven ground, laid through the drawer's card and options.

**Open:** none.

## Why the rules are what they are

### Why a stamp

- **The need.** An interchange is the one layout a player cannot draw without the rules by heart. Every ramp must run beside the motorway the way it flows, turn away, and meet the street where the street is back on the ground.
- **The cost of hand drawing.** One wrong tile and the ramp is refused or joins the bridge. A diamond's four ramps took a dozen drags.
- **The pillar.** The road network is the city's skeleton ([gdd.md](../game-design/gdd.md)); a motorway nobody can get on or off is decoration.
- **Afterwards** it is ordinary road. Junctions take controls by warrant, and every piece can be bulldozed or rebuilt on its own.
- **Nothing is stored.** The grid cannot tell a stamped diamond from one drawn by hand.

### The player's tool

- **Pick.** The Interchange card sits in the Highway tab beside the motorway and the ramp.
- **Options.** The form (Diamond, Partial cloverleaf, Cloverleaf) and the crossing road (Two-lane or Four-lane). The store holds both and hands them to the tool. The drawer's drawing mode and elevation do not apply and are not shown.
- **Preview.** Hovering a motorway tile previews the interchange centred on it, the street crossing on that row, at its deck heights.
- **Label and cost.** The chip names the form and quotes the total before the click: the street's tiles at its tier's price, its bridge at `BRIDGE_COST_PER_METER_TILE` per metre of lift, each ramp's tiles at the ramp's price.
- **Laying.** A click commits the batch under "Diamond interchange", "Partial cloverleaf" or "Cloverleaf". Refused tiles are red, with the reason.

### The site and the frame

- **Site.** `readInterchangeSite(at, ground)` reads the run of motorway tiles on the hovered row whose flow runs along one axis, grouped by direction. A six-lane carriageway laid across two tiles is one group.
- **Two carriageways side by side** get ramps on each one's outer side: the driver's right, where every exit and entrance is.
- **A single carriageway** gets ramps for its own direction only.
- **Left-hand pairs.** Two carriageways running on each other's left are refused, since their outer sides face each other.
- **The frame.** Each carriageway has its own frame: `u` counts columns outward on the driver's right, 0 beside the carriageway; `v` runs along it, positive downstream, 0 at the street's row.
- **Half a turn.** A two-carriageway motorway's second half is the first read in its own frame, turned half round. The right-hand rule and the frame put each exit and entrance on the outer side.

### The street

- **Height.** Clearance plus its girder, rounded up to the elevation control's 2 m step: 6 m for a two-lane or four-lane road.
- **Coming down.** Over the carriageways the surface stands the deck above the highest of their tiles. Out from each side it comes down `BRIDGE_MAX_GRADE` a tile until it meets the ground.
- **Above sea level.** Each tile's lift is that surface less its own ground. Laid as lifts above each tile, the bridge broke on uneven ground: a lift step of 2 m plus the ground's fall exceeds a grade step, and the decks do not join.
- **Meeting the ground.** On flat ground the first ground column is `g = deck / BRIDGE_MAX_GRADE − 1`, 2 for a 6 m deck.
- **Falling ground.** Where the ground falls away, that side's `g` is the first column at or past it where the surface has met the ground, up to `FALLING_GROUND_TILES` further out. That side's ramps and junctions move out with it.
- **Run-on.** It runs two tiles beyond the outermost junction, so every junction is a crossing and not a dead end.
- **Exact.** The street's heights go to the worker as exact elevations; they are given, not solved.
- **Crossing.** The street crosses on the over layer as any overpass does ([overpasses.md](../world-sim/overpasses.md)).

### The ramps and the three forms

Corners in `(u, v)` for one carriageway, `R = RAMP_REACH_TILES = 8`:

| Ramp        | Corners                         | Joins the motorway | Meets the street |
| ----------- | ------------------------------- | ------------------ | ---------------- |
| diamond off | (0,−R) (0,−2) (g,−2) (g,−1)     | its start, at v=−R | at u=g           |
| diamond on  | (g,1) (g,2) (0,2) (0,R)         | its end, at v=R    | at u=g           |
| loop on     | (g+1,−1) (g+1,−4) (0,−4) (0,−1) | its end, at v=−1   | at u=g+1         |
| outer off   | (0,−R) (0,−6) (g+3,−6) (g+3,−1) | its start, at v=−R | at u=g+3         |
| loop off    | (0,1) (0,4) (g+1,4) (g+1,1)     | its start, at v=1  | at u=g+1         |
| outer on    | (g+3,1) (g+3,6) (0,6) (0,R)     | its end, at v=R    | at u=g+3         |

- **Diamond:** diamond off and diamond on. An off-ramp leaves the motorway before the bridge and meets the street at a junction. An on-ramp leaves the same junction and joins after the bridge. The simplest, cheapest and commonest form.
- **Partial cloverleaf:** outer off and loop on upstream, diamond on downstream. The loops take the two left turns onto the motorway off the street's junctions, a three-quarter turn to the right before the bridge; the off-ramp runs round the loop.
- **Full cloverleaf:** outer off, loop on, loop off and outer on. Every left turn is a loop and nothing turning left crosses oncoming traffic. The price is land and the weave on the motorway between one loop joining and the next leaving.
- **Every form** serves every movement between the street and the motorway.
- **Reach.** An exit leaves the motorway eight tiles (160 m) before the bridge; an entrance joins eight tiles after. The auxiliary lane beside each is the eight the road model already gives one ([road-model](../world-sim/road-model/ramps-and-interchanges.md)).
- **Loops.** A loop runs round a block four tiles square, about 40 m radius, the loop a 25 mph design speed needs, inside the range for minor movements.
- **Terminals.** The street's junctions are two tiles beyond the ramp column, a compressed diamond used where land is tight. The 20 m grid compresses everything around a road, so the game's two junctions are 140 m apart rather than a conventional 800–1,200 ft.
- **Ground level, exactly.** Every ramp is laid at lift 0. A ramp left to solve its own profile climbs to meet the street's approach beside its end, which joins the bridge instead of the motorway.
- **Traffic.** Nothing new. A left turn at a diamond's junction is costed as a left turn; on a cloverleaf it is a longer drive round a loop and no turn across traffic.
- **Auxiliary lanes.** The motorway grows them beside each ramp as for any ramp. On a cloverleaf the loop joining before the bridge and the loop leaving after it are two tiles apart, so their lanes overlap; the drawing takes the nearer junction's lane on each tile.

### The layout rules, each a test

1. Every ramp is one line of neighbouring tiles, on no tile twice.
2. No ramp stands on the motorway or the street, and no two ramps touch; ramps side by side would join.
3. A ramp meets the street only at its end, where the street is on the ground. Anywhere else the street is more than a grade step up and passes by.
4. An exit joins the motorway at its start and an entrance at its end, on the column beside it, running its way.

### The refusal

`interchangeRefusal(site, layout, ground)` returns the first reason, or null:

- the pointer is not on a motorway;
- the motorway does not run straight, with the flow the site read, for `R + 1` tiles either side;
- it has a ramp, a junction or a bridge inside that reach;
- a tile the interchange takes holds a road;
- a tile holds a building or water, or is too steep for a road (`isRoadBuildable`);
- a road outside the interchange touches a ramp, or the street anywhere but its two ends;
- the ground falls so steeply that the street has not met it where a ramp meets the street;
- two neighbouring tiles of the bridge are more than a grade step apart;
- the ground brings a ramp within a grade step of the street beside it, anywhere but the ramp's end.

- **Fix.** Levelling the ground first clears the uneven-ground reasons.
- **Asked twice.** The tool asks it in the preview and again at commit. Batches were not atomic, so half an interchange is prevented by not sending one that would fail.
- **Ends only.** Only the street's two ends may meet a road already there; one further in is refused rather than laid through.
- **Levelling.** The worker levels the ground under the ramps and the street's at-grade tiles as it lays them, which moves a tile's ground after the layout read it. The bridge joins keep a millimetre of tolerance and nothing more.

### The commands

`interchangeCommands(layout, tier)` is one batch: the street first so the ramps find it to meet, then every ramp as a `Ramp` `buildRoad`. The worker lays each by its existing rules and refuses what they refuse. The batch's inverse is every command's inverse, so one undo takes the interchange away. No save version changes, and the worker protocol is unchanged. Signals at the terminals are not default: they take controls by warrant as any junction does.

## Decided

- No collector-distributor road: the cloverleaf weaves on the motorway itself, though a real one with about 1,000 vehicles an hour between loops would have one.
- No motorway-to-motorway interchange: a stack or turbine is a system interchange; this is a service interchange, a street meeting a motorway.
- No free placement: it goes on a motorway already laid, on the grid, at right angles.
- Not a new kind of road: everything it lays is a street, a bridge or a ramp the player could have drawn.
- A stored interchange object was rejected: it would need a save version and a second truth beside the roads, and bulldozing one ramp would have to decide what happens to it.
- Ramps solving their own heights was rejected, for the reason under Ground level.
- Free-form curved loops were rejected: a free road does not yet join a grid ramp alongside a motorway, and the square loop encloses the 40 m radius the design speed needs.
- The preview and the commit both refuse, so the world never lays half an interchange.
