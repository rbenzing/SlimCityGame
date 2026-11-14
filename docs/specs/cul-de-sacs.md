# Dead ends and cul-de-sacs

- **Status:** Built

**Owns:** how a street ends: the plain dead end's cap and what may front it, and the cul-de-sac, a turning circle on a 2×2 block that homes form round.

**Rules:**

- A plain dead end is frontage along its two sides only. The ground it faces is never zoned from it, and no drive or walk meets its cap. `[R-roads-085]`
- A plain dead end's kerbs run straight to the end tile's far edge; the rounded cap stands beyond it. Where that ground is taken the road ends square at the edge. `[R-roads-085]`
- A cul-de-sac is the cul-de-sac code on all four tiles of an intact 2×2 block laid beyond a dead end, and nothing else is stored. One predicate decides it for worker, graph and mirror. `[R-roads-086]`
- Treat the bulb as one thing: no junction control, turn restriction, crossing, stop line or lane paint on its tiles. Bulldozing any tile removes all four, and undo restores them. `[R-roads-086]`
- Every outer side of the block is frontage, so lots form round the bulb; a lot's lawn, drive and walk run to the back of the ring's footway along lines through the bulb's centre. `[R-roads-086]`
- Keep a drive 3 m from the street's mouth; a home with frontage left over moves its drive rather than lose it.
- Cars drive the bulb on a circle inside the ring, anticlockwise, never tile centre to tile centre.
- Refuse a cul-de-sac on anything but a dead end of a street with one lane each way; on ground a building, water or another road holds; on a deck; and off the map. Say which.
- The tool sends a `buildRoad` for the four tiles, then `buildCulDeSac`; it sends nothing the world would refuse partway.

**Numbers:**

| Constant | Value | Unit | Source |
| --- | --- | --- | --- |
| `CUL_DE_SAC_RADIUS_M` | 14.6 (96 ft across) | m | International Fire Code Appendix D, Table D103.4 and Figure D103.1 ([county copy](https://www.linncountyor.gov/sites/default/files/fileattachments/roads/page/2508/appendix_d_fire_apparatus_access_roads.pdf)); inside the 40–50 ft radius US street codes ask ([Pioneer OH](https://codelibrary.amlegal.com/codes/pioneer/latest/pioneer_oh/0-0-0-9377) 40, [Lynnwood WA](https://lynnwood.municipal.codes/LMC/19.35.020) 45, [Lordstown OH](https://codelibrary.amlegal.com/codes/lordstown/latest/lordstown_oh/0-0-0-14493) 50) |
| Block | 2×2 tiles, 40 | m | dial: the 20 m tile; the ring and its footway reach 16.5 m of the block's 20 |
| Bulb offset | 10 (half a tile) | m | dial: roads run down tile centres, so the circle sits to one side of the street, an offset bulb |
| Footway round the ring | the street's own | m | the street's profile |
| Kerb return at the mouth | 5 at most | m | dial |
| Cars' circle | 10.6 (4 m inside the kerb) | m | dial |
| Lot frontage on the bulb | 20 (one tile side) | m | above the 35 ft (10.7 m) codes ask on a turning circle ([Santa Clara CA](https://www.codepublishing.com/CA/SantaClara/html/SantaClara18/SantaClara1862.html), [Renton WA](https://www.codepublishing.com/WA/Renton/html/Renton04/Renton0407/Renton0407170.html)) |
| `DRIVE_END_CLEARANCE_M` | 3.0 (10 ft) | m | a drive keeps 10 ft from the end of a kerb return ([Pismo Beach CA](https://codelibrary.amlegal.com/codes/pismobeach/latest/pismo_ca/0-0-0-16700)) |
| Cul-de-sac code | 7 | byte | appended in the junction-control layer; never a junction control |
| Price | four tiles of its street | — | the tool lays four road tiles |

**Code:**

- `src/shared/culdesac.ts` `culDeSacBlockOf`, `culDeSacAtEnd`, `culDeSacPlan`, `CUL_DE_SAC_REFUSALS` — the one predicate, the tool's plan, the worker's check, the sentences.
- `src/sim/worker.entry.ts` `buildCulDeSac`, `removeCulDeSac` — each the other's inverse; the snapshot's `culDeSacs`.
- `src/world/roadgraph.ts`, `src/world/culdesacs.ts` — the loop a car drives.
- `src/render/culdesacmesh.ts`, `src/render/bulbfront.ts` — the block drawn whole; where a lot meets the ring.
- `src/render/roadsmesh.ts` `emitEndCap`, `setGroundOpen` — the plain end's cap.
- `src/world/zonable.ts` `frontageDirs` — what fronts an end.

**Tests:** `src/shared/culdesac.test.ts`, `tests/interaction/culdesacs.test.ts` — predicate, refusals, round trips, saves; `src/render/culdesaclots.test.ts` — lots on the ring; `src/world/zonable.test.ts` — a plain end fronts two sides, a bulb all round.

**Open:** a lamp on the ring; a centre island; a hammerhead for streets too tight for a bulb; a free (off-grid) street's end keeps its cap inside the road's length.

## Why the rules are what they are

### A plain end is not a place to live

A street that simply stops has nothing at its end: a real stub ends at its last lot's far line, and the lots beside it take their drives off straight kerb. Drawn with its rounded cap inside the last tile, the street put the last home's drive on the arc. The cap now stands past the tile's edge, on the ground the road already levels beyond its end, so the whole of the last tile is straight kerb. Where something stands on that ground the road ends square, as a stub against a fence does. A deck and a lone one-tile road keep their caps where they were.

### Homes round an end need a turning circle

Lots radiate round a street's end only where there is a circle to front: that is what a cul-de-sac is. So the ground a plain end faces is never frontage, and the player builds a cul-de-sac to open it. The circle is the fire code's 96 ft turnaround, which the common 40 to 50 ft street-code radii bracket.

### Why two tiles by two, and to one side

A circle 29 m across does not fit a 20 m tile, and homes stand a metre or so inside their own tile, so a circle spilling past its tile would cut through the lots beside it. On a 2×2 block the ring and its footway lie on the road's own ground, and every lot round it keeps its full depth. Roads run down tile centres, so the street enters the block half a tile off its middle: the circle bulges to one side, which is the offset bulb of real subdivisions. The player picks the side by where the cursor is.

### One thing, like a roundabout

Four road tiles in a square would otherwise read as junctions with boxes, corners and warrants. The bulb follows the compact roundabout's pattern instead: one code on four tiles, one predicate, drawn whole by one renderer, edited and removed whole. Frontage needed no new rule: a road tile already fronts each side no road leaves by.

### Lots meet a circle, not a line

The ring is nearer a lot at the middle of a block side than at its corner, so a drive laid square to the lot line would miss the circle near a corner. Lawn, walk and drive are laid as slanted strips toward the bulb's centre, ending at the back of the footway, which runs unbroken round the ring. The block draws no verge of its own: the ground between ring and lots is the terrain's.

## Decided

- The cul-de-sac is laid beyond the dead end, not over it: homes already beside the last tile keep their lots. Over the end tile it would need the side lot's ground.
- The player builds it; growth never does. The player's rule: homes form round an end only where a cul-de-sac was added.
- Real radius on a 2×2 block, over a one-tile circle of 8 m: 8 m is below every street code found and no fire engine turns in it.
- No length cap on a dead-end street and no rule that a long one must end in a turnaround: codes differ (150 ft, 600 ft), and the player's street is the player's choice.
- No paint in the bulb: a local street's lines run to the circle's edge and stop.
- The code shares the junction-control byte and is no control: no new grid layer, no save version, and an old save loads unchanged.
