# Compact roundabouts

- **Status:** Built

**Owns:** the compact single-lane roundabout: a Roundabout tool stamping a 2×2 block on a street junction, its refusals, ring geometry, routing, entry capacity and look. The one-tile mini roundabout stays a junction control.

**Rules:**

- A compact roundabout is the `roundabout` control on all four tiles of an intact 2×2 block, and nothing else is stored. `[R-roads-071]`
- One predicate, `roundaboutBlockOf` with `blockIntact`, decides it for worker, graph and mirror; four coded tiles no longer joined read as no override. `[R-roads-071]`
- Treat the ring as one thing: refuse `setJunctionControl`, `setJunctionTurns` and `setJunctionLaneTurns` on a ring tile. Bulldozing any tile removes the roundabout, and undo restores it. `[R-roads-071]`
- Drive the ring anticlockwise only, on the circle, never across the island. Only a driver arriving on a leg pays the entry delay. `[R-roads-071]`
- An entry, mini or compact, carries `1,380 · e^(−0.00102 · v_c)` veh/h against the traffic circulating in front of it. `[R-roads-072]`
- Paint a yield line of white triangles on every entry, a give-way board on every approach, and no stop bar, crosswalk or centre line. `[R-roads-070]`
- Refuse a block with a road above one lane each way, a motorway, corridor or tramway, fewer than three or two on a side, a junction on a leg's first tile, or grade over 4%.
- The tool sends a `buildRoad` per tile to lay, then `buildRoundabout`; it sends nothing the world would refuse partway, since batches are not atomic.

**Numbers:**

| Constant               | Value                              | Unit  | Source                                                                                                                      |
| ---------------------- | ---------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| `RING_OUTER_RADIUS_M`  | 18 (inscribed circle 36 m, 118 ft) | m     | [WisDOT FDM 11-26](https://wisconsindot.gov/rdwy/fdm/fd-11-26.pdf) Table 2.2: 80–120 ft (24–37 m) compact; [FHWA-RD-00-067](https://www.fhwa.dot.gov/publications/research/safety/00067/000676.pdf) Exhibit 6-19: 30–40 m |
| Block                  | 2×2 tiles, 40 m                    | m     | dial: the 20 m tile                                                                                                         |
| Posted speed           | favoured at 40 mph or less         | mph   | WisDOT FDM 11-26                                                                                                            |
| `RING_ROADWAY_WIDTH_M` | 5.5 (18 ft)                        | m     | FHWA-RD-00-067 §6.3.3: 120% of entry width; NCHRP 672: 16–20 ft                                                             |
| `RING_APRON_WIDTH_M`   | 3.7 (12 ft)                        | m     | FHWA §6.3.4: 1–4 m; WisDOT at least 12 ft                                                                                   |
| Island                 | 17.6                               | m     | dial: what remains inside the apron                                                                                         |
| Entry width            | 4.65                               | m     | FHWA §6.3.2: 4.3–4.9 m single-lane entry                                                                                    |
| `SPLITTER_WIDTH_M`     | 1.8 (6 ft)                         | m     | FHWA §6.3.8 narrowest refuge                                                                                                |
| Splitter length        | 15 (50 ft) asked, about 5 held     | m     | FHWA §6.3.8; the tile holds about 5 m, the rest lies on the undrawn road                                                    |
| Far kerb radius        | 15 (50 ft)                         | m     | FHWA §6.3.6.1 least exit radius                                                                                             |
| Near kerb return       | up to 3                            | m     | dial: FHWA §6.3.5.1 wants an entry radius of 10–30 m                                                                        |
| Leg offset             | 10 (half a tile)                   | m     | dial: roads run down tile centres                                                                                           |
| `RING_MAX_GRADE`       | 4                                  | %     | FHWA §6.3.11.3                                                                                                              |
| Legs                   | 3 or 4, one a side; 4 equally 90° apart | legs | FHWA §6.2.4                                                                                                         |
| Capacity               | about 15,000                       | veh/day | WisDOT Table 8.1 (NCHRP 1043 Exhibit 8.2)                                                                                 |
| Entry capacity, empty ring | 1,380                          | veh/h | HCM 7th edition Eq. 22-1 (NCHRP 1043)                                                                                       |
| Entry capacity, 1,000 circulating | about 500                   | veh/h | same equation, worked                                                                                                       |
| Decay                  | 0.00102 per veh/h of `v_c`         | —     | HCM 7th edition Eq. 22-1                                                                                                    |
| Ring edge capacity     | 600 game units = 1,400 veh/h, vs 1,380 pc/h | — | k = 3/7 `[R-roads-034]`; HCM single-lane entry capacity                                                          |
| Turns round the ring   | left three-quarters, straight half, right a quarter | — | geometry of the ring                                                                                          |
| Roads laid             | at the hovered junction's road price; roundabout free | — | dial                                                                                                        |
| Compact-vs-mini island | mini island drivable, compact not  | —     | dial                                                                                                                        |

**Code:**

- `src/shared/roundabout.ts` `roundaboutBlockOf`, `blockIntact`, `compactRoundaboutAt`, `effectiveControlCode`, `roundaboutPlan`, `roundaboutAtJunction`, `RING_MAX_GRADE`, ring size constants: block, legs, refusal, geometry, commands.
- `src/shared/types.ts` `buildRoundabout`, `removeRoundabout`, `SimSnapshot.roundabouts`, `ToolId`: the two commands and the snapshot channel.
- `src/shared/junction.ts` `roundaboutEntryCapacity`: the HCM entry capacity.
- `src/sim/worker.entry.ts`: the two commands; bulldoze and junction commands on a ring tile; the snapshot channel.
- `src/world/roundabouts.ts`: rules read off a grid or the mirror; `miniRoundaboutConflicting`; the graph shaped round each ring.
- `src/world/roadgraph.ts`, `pathfind.ts`: one-way ring edges on an arc; `junctionDelay` on entry only.
- `src/render/roadsmesh.ts` `roundaboutQuarterVertices`: a ring tile's quarter of the ring and its legs' entries.
- `src/render/roadfurniture.ts`, `lamps.ts`: nothing stands on a ring tile.
- `src/app/clientgrid.ts`, `src/main.ts`: the mirror keeps the roundabouts; the tool's reader; the inspector.
- `src/tools/tools.ts`: the `roundabout` tool, hover preview and click to lay.
- `src/ui/categories.ts`, `AssetDrawer.tsx`, `JunctionPanel.tsx`: the card; the inspector on a ring tile.

**Tests:**

- `src/shared/roundabout.test.ts` — block and legs, intact and broken, every refusal, tiles to lay and the batch, ring points and arcs.
- `tests/interaction/roundabouts.test.ts` — on a crossroads and a T through real commands: every leg-to-leg movement routes and none runs against the ring; left costs more than right; one undo restores the grid; bulldoze and its undo; a control on a ring tile is refused.
- Graph tests — ring edges one-way, arc routes, entry-only delay, the leg-to-leg turn at a two-legged ring tile.
- Render tests — a ring tile draws island and yield lines, no stop bar, no crossing; furniture places nothing on it.
- Tool and UI tests — the preview's quarter, refusal, cost and label; commit sends nothing when refused; the inspector on a ring tile.
- Browser check — a ring on a crossroads and on a T, from above and at an angle, laid through the drawer's card with traffic round it; cars stay off the island (69 sampled car positions near a ring in a small town, none inside the apron).

**Open:** none. Not built, by choice: a two-lane roundabout, crossings set back from the yield line, lamps round the ring, a roundabout-ahead sign, a tramway through one.

## Why the rules are what they are

### What the player gets

A proper roundabout in one click: the Roundabout card in the Small tab of the road drawer, no options. Hover a street junction and the ring previews, 36 m across round a planted island, on a block of two tiles by two. One click lays it, one undo removes it.

The ring takes the quarter of the junction's tile nearest the pointer. The block is the junction's tile and the three beside it on that side, centred on the corner the four share. Any of the three with no road is laid with the junction's own road, tier and profile; that is how a crossroads becomes a square. Nothing else about the roads changes.

A mini roundabout on a 20 m tile reads as a dot in a crossroads, and the roundabout most towns build is bigger than a tile. The one-tile mini roundabout, chosen in the junction inspector, stays as it is. The guides treat them differently: a mini island is small enough to drive over, a compact one is not. It serves the pillar that the road network is the city's skeleton ([gdd](../game-design/gdd.md)): a roundabout moves traffic without stopping it.

The roundabout costs only the road it lays, at that road's price; a control is free. The click commits the batch under the label "Compact roundabout", and the roundabout and the road it laid are one undo.

### What is stored

Nothing new. The `roundabout` control sits on each of the four tiles in the `junctionControl` layer, and the block's origin is its north-west tile. Save format is unchanged; the worker protocol gains two commands and one snapshot channel, all additive.

`roundaboutBlockOf(x, z, codeAt)` answers the 2×2 block containing a tile whose four tiles all carry the code. Where two blocks contain it, the lowest origin, by row then column, wins; the tool never makes two. A block is intact when its four tiles are street road tiles on the ground, joined round the square.

- An intact block is a compact roundabout.
- A coded block that is not intact, because a replace drag laid rail over a corner say, is no roundabout. Its tiles read as no override and their junctions fall back to their warrants.
- A coded tile outside any such block is a mini roundabout, as before.

`effectiveControlCode` is how the warrant and the snapshot read a tile's stored code. `SimSnapshot.roundabouts` lists every intact roundabout by origin; like `junctions`, the whole list travels when it changes.

### The block and its legs

The ring is centred on the shared corner. A leg is a street road tile outside the block, next to one of its tiles and joined to it. Every road runs down a tile centre, so every leg reaches the ring 10 m, half a tile, off its centre.

The preview turns red with the reason, and the worker refuses with the same reason, unless:

- the pointer is on a street junction;
- every tile is a street road tile or ground a road can be laid on: dry, not too steep, no building;
- no tile is already a ring corner, elevated, under a road passing over, or holds a road off the grid;
- every road on it and every leg is a street of at most one lane each way: a single-lane roundabout has single-lane entries and exits, and a wider road needs a two-lane one, which is not built. A ramp may be a leg; a motorway, a corridor half and a tramway may not;
- two of its tiles already side by side are joined;
- it has three or four legs, at most one on each side. FHWA sizes roundabouts for four legs or fewer and spaces them equally;
- each leg's tile runs straight away from the ring with no junction on it. The guides give no figure; WisDOT advises against driveways cut into the ring (§10.11.5), and a tile of plain road before the next junction is the game's own rule;
- its ground rises or falls no more than 4% along either road across it, between the two tiles of each row and each column. FHWA: "generally not desirable to locate roundabouts ... where grades through the intersection are greater than four percent" (§6.3.11.3).

`roundaboutPlan(block, ground)` gives the first reason or null, with the tiles still to lay (`toLay`) and the legs it would have. A tile to be laid joins every road it touches at its own level, as any tile laid with snapping on does, so its outside neighbours become legs. `roundaboutAtJunction` first refuses a non-junction and then picks the pointer's quarter. The worker asks `roundaboutPlan` of a block already laid in full and refuses one with tiles still to lay.

Legs are off centre. Offset to the entering driver's left is acceptable; offset to the right FHWA's first guide calls "almost never acceptable" (§6.2.4), and NCHRP 672 "not a fatal flaw" where speeds are kept down (as reproduced by [SCDOT](https://www.scdot.org/business/pdf/I26Widening/AttachB/Roadway/Roundabout_Criteria.pdf)). On a straight crossroads two legs come in each way. A player who wants all four offset left jogs each road a tile before the ring, the pinwheel, and the tool accepts it.

### The commands

- `buildRoundabout { x, z }`, the block's origin, is refused with the plan's reason unless the block is laid in full on a valid site. It writes the code to the four tiles and clears their turn and lane restrictions, since a restriction set on the crossing before would ban the one turn onto the ring. Its inverse is `removeRoundabout` carrying the four tiles' previous junction state.
- `removeRoundabout { x, z, junctions? }` is refused unless an intact roundabout stands at `(x, z)`. It writes `junctions`, one per tile in the order north-west, north-east, south-west, south-east, each a control override or null, turns and lane turns; absent, it clears all four. Its inverse is `buildRoundabout`.
- Each is the exact inverse of the other, because a ring tile never carries a turn restriction.
- A control set on one ring corner would dissolve it into three mini roundabouts and a signal, hence the refusal of the junction commands there.
- Bulldozing a ring tile removes the roundabout first, then the road. Its inverse lays the road back and sends `buildRoundabout`, in place of the per-tile `setJunctionControl` that a two-armed ring tile would refuse.

Afterwards its roads are ordinary roads. The junction inspector on a ring tile names the roundabout and offers one action, **Take out the roundabout**, which sends `removeRoundabout` and leaves four junctions under their warrants. The control ladder, turns and lanes are not offered there.

### Traffic

`RoadNetwork` shapes every intact block after `buildGraph`.

- **Ring edges** are edges whose tiles all lie in one block. Each is one-way anticlockwise seen from above, the way right-hand traffic goes round (WisDOT Table 2.1): `lanesAtoB` or `lanesBtoA` is 1 and the other 0, so `edgeTraversable` refuses the other way. Each is marked `circulating`.
- **The line driven.** A ring node's point is on the circulating lane's centre, on the diagonal from the ring's centre through the tile's centre. A ring edge's `route` is the arc between two such points and its `length` the arc in tiles. Every other edge meeting a ring node ends at that point, so a car bends onto the ring instead of crossing the island.
- **Delay.** `junctionDelay` charges the entry delay, the curve the mini roundabout uses, only to a driver arriving on a leg: quick until the ring fills, then suddenly not. A ring edge costs nothing, since circulating traffic is what an entering driver gives way to.
- **Turns.** A ring tile with two legs meets both at one node. A driver may turn from one leg onto the other only to the right, the short way round; the left turn is the long way, so the router takes it round the ring. A left costs the three-quarters of a circle, straight on halfway, a right a quarter. Nobody turns across oncoming traffic and nobody stops for a signal. Every other movement is left to the one-way ring and the U-turn rule.
- **Ring capacity.** A stretch of the ring carries what its tile's road carries both ways, all one way round. For a two-lane street that is 600 game units, 1,400 veh/h, about the HCM single-lane entry capacity with nothing circulating.

### Entry capacity

An entry is as good as the gaps in the ring. A roundabout whose ring is busy queues at the quiet legs too. `junctionDelay` gives an entry, on either kind, its own v/c before the delay curve reads it: the leg's share of the edge's volume by the lanes running in, over `roundaboutEntryCapacity(v_c)`. Both are in veh/h, through k = 3/7.

- At a ring corner `v_c` is the smaller of the volumes on the circulating edge arriving there and the one leaving.
- At a mini roundabout's node, one tile, it is `miniRoundaboutConflicting`, from the other legs' arrivals in the order the ring runs.

Compact roundabouts carry up to about 15,000 vehicles a day.

### The ring on screen

`RoadsMesh` keeps the roundabouts from the snapshot. A ring tile skips `roadTileVertices` and draws by `roundaboutQuarterVertices`, its quarter of the ring centred on the block's shared corner:

- the circulatory roadway, an annulus of asphalt;
- the truck apron inside it, in concrete, raised a little; a long vehicle's rear wheels track over it;
- the central island, kerbed and grassed;
- a footway round the outside, cut off where it leaves the block, leaving room for it inside the block's 40 m;
- each leg, carried from the tile's edge until it meets the ring, with its kerbs;
- a yield line across each leg's entry lanes, at the edge of the circulatory roadway (FHWA Exhibit 6-1; MUTCD 3D.04).

Nothing else is painted: a single-lane roundabout carries no lane lines, and no crossings or stop bars, as on the mini roundabout. Real crossings stand a car length back from the yield line (FHWA §6.3.7); neither roundabout paints them.

Each leg is flared by half the splitter's width on each side over the part of the ring tile outside the ring. The splitter island, only where a road runs both ways, narrows to a point at the tile's edge. Its 15 m of splitter does not fit the tile: that is the grid's compression, stated rather than hidden. The leg tile beyond is plain road.

A leg's kerbs never meet the ring at a step. Each curves in on an arc tangent to the kerb and the ring's edge, its footway following into the footway about the ring.

- The kerb away from the ring's centre meets the ring at a shallow angle and takes the 15 m exit radius where the tile holds it.
- The kerb toward the centre meets it almost square, half a tile off, with room for a return of up to 3 m. The grid leaves no room for FHWA's entry radius.
- On a corner tile with two legs, kerbs facing each other stop where they meet; the road fills the corner and a 3 m return turns it, leaving each kerb where it really is, flared or not.

The footway about the ring opens between each leg's two curves and between two legs on one tile. A browser check found two faults, since fixed and pinned by the render tests: a far kerb that ran straight on to the ring with a jog in its footway, and a corner return off a straight kerb that left grass slivers beside a flared one.

### Furniture, lamps and parking

- A leg tile keeps the give-way board an approach to a roundabout already gets.
- A ring tile carries no board, signal, bend sign or kerbside furniture; counted as an approach to its neighbours, it would stand boards in the ring.
- Lamps skip ring tiles; nothing stands on the ring.
- Parking already skips a tile with roads across and along it, which every ring tile is.

## Tuning

Every figure in the Numbers table above is sourced and scaled to the 20 m tile the way the rest of the road model is.

## Decided

- Stamp on a laid junction, quarter nearest the pointer, over laying a square and converting it with the inspector: a laid square reads as four junctions until converted.
- Store nothing new, over a roundabout layer: it would need a save version for what the control layer already records.
- A 2×2 block, over 3×3 with radial legs: 60 m is a two-lane roundabout's diameter, not a compact one's.
- Legs stay where the roads are, over having the stamp move them; a pinwheel the player lays is accepted.
- The ring is the four tiles' own roads read as a roundabout through the control, not a new kind of road.
- Not built: a two-lane roundabout (a two-lane road or two-tile corridor would need one), lamps round the ring, a roundabout-ahead sign, a tramway crossing.
- A save already holding a coded 2×2 block would read as a compact roundabout, or as broken and inert; it could only come from four mini roundabouts round a square, which needs eight legs, and none is known.
