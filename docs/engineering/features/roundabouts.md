# Compact roundabouts — technical design

- **Status:** Draft
- **Date:** 2026-09-30
- **Author:** Claude, for the ROADMAP's road-composition pieces

## What we are building, and why now

A Roundabout tool that turns a street junction into a compact, single-lane
roundabout 36 m across, on a 2×2 block of tiles, in one click and one undo. It is the
second of the road-composition pieces the ROADMAP lists as not built. The
player chose to stamp it on a junction already laid, on the quarter nearest
the pointer ([design](../../game-design/features/roundabouts.md)).

The one-tile mini roundabout stays as it is: a control on one junction tile.

## What it touches

| Module                                                         | Change                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/shared/roundabout.ts`                                     | New. The block, its legs, the refusal, the ring's geometry and the commands, all pure.       |
| `src/shared/types.ts`                                          | Two commands, `buildRoundabout` and `removeRoundabout`; `SimSnapshot.roundabouts`; `ToolId`. |
| `src/sim/worker.entry.ts`                                      | The two commands; bulldoze and the junction commands on a ring tile; the snapshot channel.   |
| `src/world/roundabouts.ts`                                     | New. The rules read off a grid or the mirror; the graph shaped round each ring.              |
| `src/world/roadgraph.ts`, `pathfind.ts`                        | Ring edges one-way round the island, driven on an arc; delay paid on entry only.             |
| `src/render/roadsmesh.ts`                                      | A ring tile draws its quarter of the ring and its legs' entries.                             |
| `src/render/roadfurniture.ts`, `lamps.ts`                      | Nothing stands on a ring tile.                                                               |
| `src/app/clientgrid.ts`, `src/main.ts`                         | The mirror keeps the roundabouts; the tool's reader; the inspector.                          |
| `src/tools/tools.ts`                                           | The `roundabout` tool: hover preview, click to lay.                                          |
| `src/ui/categories.ts`, `AssetDrawer.tsx`, `JunctionPanel.tsx` | The card; the inspector on a ring tile.                                                      |

The **save format does not change**. The **worker protocol** gains two
commands and one snapshot channel, all additive.

## The design

### What is stored

Nothing new. A compact roundabout is the `roundabout` junction control, stored
on each of the four tiles of a 2×2 block, in the `junctionControl` layer that
already holds it. The block's origin is its north-west tile.

`roundaboutBlockOf(x, z, codeAt)` answers, for any tile, the block it belongs
to, if any: a 2×2 block containing the tile whose four tiles all carry the
roundabout code. Where two such blocks contain the tile, the one with the
lowest origin, by row then column, wins; the tool never makes two. The block is
**intact** (`blockIntact`) when its four tiles are street road tiles on the
ground, joined round the square, and `compactRoundaboutAt` is the two together.
The worker, the graph and the mirror all ask it; `effectiveControlCode` is
what the warrant and the snapshot read a tile's stored code as.

- An **intact** block is a compact roundabout.
- A block whose four tiles carry the code but is not intact, because a replace
  drag laid rail over a corner say, is no roundabout: its tiles' codes are
  read as no override, and their junctions fall back to their warrants.
- A tile carrying the code outside any such block is a mini roundabout, as
  today.

### The block and its legs

The ring is centred on the corner the block's four tiles share. A **leg** is a
street road tile outside the block, next to one of its tiles and joined to it.
Because every road runs down a tile centre, every leg arrives half a tile,
10 m, off the ring's centre.

The block is refused, with the reason, unless:

- every tile of it is a street road tile, or ground a road can be laid on:
  dry, not too steep, no building;
- no tile of it is elevated, has a road passing over it, is a corner of
  another compact roundabout, or holds a road off the grid;
- every road on it, and every leg, is a street of at most one lane each way.
  A ramp may be a leg; a motorway, a corridor half and a tramway may not be
  either;
- two of its tiles already side by side are joined;
- it has three or four legs, at most one on each side of the block;
- each leg's tile runs straight away from the ring, with no junction on it;
- its ground rises or falls no more than `RING_MAX_GRADE` (4%) along either
  road across it: between the two tiles of each row and each column.

Every figure is sourced in the design's
[Tuning](../../game-design/features/roundabouts.md#tuning).

`roundaboutPlan(block, ground)` gives the first reason, or null, with the
block's tiles that have no road yet (`toLay`) and the legs it would have. A
tile to be laid joins every road it touches at its own level, as any tile laid
with snapping on does, so its neighbours outside the block are legs. The
tool asks `roundaboutAtJunction`, which first refuses a tile that is not a
street junction and then picks the block on the pointer's quarter; the
worker asks `roundaboutPlan` of a block it has laid in full, and refuses one
with tiles still to lay.

### The commands

- **`{ kind: 'buildRoundabout', x, z }`**, the block's origin. Refused, with
  the plan's reason, unless `roundaboutPlan` finds the block laid in full and a
  roundabout's site on the world's grid. It writes the roundabout code
  to the four tiles and clears their turn and lane restrictions, since a
  restriction set on the crossing before would ban the one turn onto the ring.
  Its inverse is a `removeRoundabout` carrying the four tiles' previous
  junction state.
- **`{ kind: 'removeRoundabout', x, z, junctions? }`**. Refused unless an
  intact compact roundabout stands at `(x, z)`. It writes `junctions`, one
  per tile in the order north-west, north-east, south-west, south-east, each
  a control override (or null), turns and lane turns; absent, it clears all
  four. Its inverse is `buildRoundabout` at `(x, z)`.

Each is the exact inverse of the other: a ring tile never carries a turn
restriction (below), so a roundabout taken out and put back is the one that
was there.

- **`setJunctionControl`, `setJunctionTurns` and `setJunctionLaneTurns` on a
  ring tile** are refused. The ring is one thing: a control set on one corner
  would dissolve it into three mini roundabouts and a signal.
- **Bulldozing a ring tile** takes the roundabout out first, all four tiles,
  then the road. Its inverse lays the road back and then sends
  `buildRoundabout`, in place of the per-tile `setJunctionControl` it sends for
  other junctions, which a ring tile with two arms would refuse.

The tool's batch is a `buildRoad` for each tile to lay, then
`buildRoundabout`. Batches are not atomic, so the tool sends nothing the world
would refuse partway.

### The graph

After `buildGraph`, `RoadNetwork` shapes every intact block it finds:

- **Ring edges** are the edges whose tiles all lie in one block. Each is
  one-way anticlockwise seen from above, the way right-hand traffic goes round
  (`lanesAtoB` or `lanesBtoA` is 1 and the other 0), so `edgeTraversable`
  refuses the other way. Each is marked `circulating`.
- **The line driven.** A ring node's point is on the circulating lane's
  centre, on the diagonal from the ring's centre through the tile's own
  centre. A ring edge's `route` is the arc between its two nodes' points, and
  its `length` is that arc's length in tiles. Every other edge that meets a
  ring node ends at that node's point instead of the tile centre, so a car
  entering bends onto the ring rather than driving across the island.
- **Delay.** `junctionDelay` charges the roundabout's entry delay only to a
  driver arriving on a leg. Arriving on a ring edge costs nothing: the
  circulating traffic is the traffic an entering driver gives way to.
- **Turns.** A ring tile with two legs meets both at the same node. A driver
  arriving on one of those legs may turn onto the other only to the right,
  which is the short way round; the left turn is the long way round and the
  router is made to take it round the ring. Every other movement at a ring
  node is left to the one-way ring and the U-turn rule.
- **Capacity.** A stretch of the ring carries what its tile's road carries
  both ways, all of it one way round. For a two-lane street that is 600
  game-capacity units, 1,400 veh/h, which is about the HCM's single-lane
  roundabout entry capacity with nothing circulating, 1,380 pc/h.
- **Entry capacity.** `junctionDelay` gives a roundabout entry, on either
  kind, its own v/c before the delay curve reads it. That v/c is the traffic
  arriving on the leg, its share of the edge's volume by the lanes running
  in, over `roundaboutEntryCapacity(v_c)` in `src/shared/junction.ts`. Here
  `v_c` is the conflicting flow:
  - at a ring corner, the smaller of the volumes on the circulating edge
    arriving there and the one leaving;
  - at a mini roundabout's node, `miniRoundaboutConflicting`, over the other
    legs' arrivals in the order the ring runs.

  Both are in veh/h, through k = 3/7.

### The ring on screen

`RoadsMesh` keeps the roundabouts from the snapshot. A ring tile skips
`roadTileVertices` and is drawn by `roundaboutQuarterVertices`, which lays the
tile's quarter of the ring, centred on the block's shared corner:

- the circulatory roadway, an annulus of asphalt;
- the truck apron inside it, in concrete, raised a little;
- the central island inside that, kerbed and grassed;
- a footway round the outside, cut off where it leaves the block;
- each of the tile's legs, carried from the tile's edge until it meets the
  ring, with its kerbs;
- a yield line across each leg's entry lanes, where the entry meets the ring.

Nothing else is painted on the ring: a single-lane roundabout carries no lane
lines, and there are no crossings or stop bars, as on the mini roundabout.

The sizes are `RING_OUTER_RADIUS_M` (18 m), `RING_ROADWAY_WIDTH_M` (5.5 m) and
`RING_APRON_WIDTH_M` (3.7 m) in `src/shared/roundabout.ts`, read by the route
and the mesh alike. Each leg is flared by half the splitter's width on each
side over the part of the ring tile outside the ring, and the splitter
island, `SPLITTER_WIDTH_M` (1.8 m) at the ring, narrows to a point at the
tile's edge. The leg tile beyond is drawn as the plain road it is.

A leg's kerbs never meet the ring at a step; each curves into it on an arc
tangent to the kerb and to the ring's edge, its footway following round into
the footway about the ring:

- the kerb on the side away from the ring's centre meets the ring at a
  shallow angle, and takes FHWA's least exit radius, 15 m, where the tile
  holds it;
- the kerb on the side toward the centre meets it almost square, half a tile
  off it, and has room for a kerb return of up to 3 m;
- on a corner tile with two legs the kerbs facing each other stop where they
  meet, the road fills the corner between them and the ring, and a 3 m kerb
  return turns that corner, leaving each kerb where it really is, flared or
  not.

The footway about the ring opens between each leg's two curves, and between
two legs on one tile.

The first browser check found both of these: the far kerb ran on straight to
the ring and its footway jogged where the ring's took over, and a corner
return laid off a straight kerb left slivers of grass beside a flared one.

### Furniture, lamps and parking

- **Signs.** A leg tile keeps the give-way board an approach to a roundabout
  already gets. A ring tile carries no board, no signal, no bend sign and no
  kerbside furniture: counted as an approach to its neighbours, it would stand
  boards in the ring.
- **Lamps** skip ring tiles.
- **Parking** already skips a tile with roads both across and along it, which
  every ring tile is.

### The tool

`roundabout` is a tool of its own, not a control in the inspector.

- **Preview.** Hovering a street junction picks the block on the quarter of
  the tile nearest the pointer, and previews its four tiles, with the reason
  if it is refused. A tile that is not a junction is refused: a roundabout
  goes on a junction.
- **Cost.** Each tile it lays, at the hovered junction's road's price. The
  roundabout itself, a control, is free.
- **Laying.** A click commits the batch under the label "Compact roundabout".
  The tiles it lays are the hovered junction's road, its tier and profile.

The inspector opened on a ring tile names the roundabout and offers one
action, **Take out the roundabout**, which sends `removeRoundabout`. The
control ladder, turns and lanes are not offered there.

### The snapshot

`SimSnapshot.roundabouts` is every intact compact roundabout, by its origin.
Like `junctions`, the whole list travels whenever it changes, and its absence
means nothing has.

## What could go wrong

- **Legs off centre.** Every leg arrives 10 m off the ring's centre. On a
  straight crossroads half are offset to the entering driver's left, which the
  guides accept, and half to the right, which they discourage. The player
  chose to keep the legs where they are rather than have the stamp move them;
  a pinwheel the player lays is accepted.
- **Routes through the island.** A car driving tile centre to tile centre
  would cross the island. The ring's arcs and its nodes' points exist for
  that, and the browser check looks for it: it sampled 69 positions of cars
  near a ring in a small town, and none inside the apron.
- **A save that already holds a coded 2×2 block.** One could only come from
  four mini roundabouts set on four junctions round a square, which needs
  eight legs; it would now read as a compact roundabout, or as broken and
  inert. No such save is known.

## Alternatives

- **The inspector's Roundabout on a square the player lays.** The player's
  second choice. Rejected in favour of the stamp: it asks the player to lay a
  square of road that reads as four junctions until it is converted.
- **A stored roundabout layer.** Rejected. It would need a save version for
  what the control layer already records.
- **A 3×3 block, so every leg is radial.** Rejected: 60 m is a two-lane
  roundabout's diameter, not a compact one's.

## How we will know it works

- **Unit tests** (`src/shared/roundabout.test.ts`): the block a tile belongs
  to, intact and broken; the legs; every refusal; the tiles to lay and the
  batch; the ring's points and arcs.
- **Worker tests** (`tests/interaction/roundabouts.test.ts`), laid through the
  real commands on a crossroads and on a T:
  - every movement between the legs routes, and none goes against the ring;
  - a left turn is costed longer than a right;
  - one undo restores the grid exactly;
  - bulldozing a ring tile takes the whole roundabout out, and its undo puts
    it back;
  - a control set on a ring tile is refused.
- **Graph tests:** ring edges one-way, arc routes, entry-only delay, the
  leg-to-leg turn at a two-legged ring tile.
- **Render tests:** a ring tile draws its island and yield lines, no stop bar,
  no crossing; the furniture places nothing on it.
- **Tool and UI tests:** the preview's quarter, refusal, cost and label;
  commit sending nothing when refused; the inspector on a ring tile.
- **Looked at in a browser:** a roundabout on a crossroads and on a T, from
  above and at an angle, laid through the drawer's card, with traffic running
  round it.

## Out of scope

- The two-lane roundabout for a two-tile corridor.
- Crossings on the legs, set back from the yield line.
- Lamps round the ring, and a roundabout-ahead warning sign.
- A tramway through a roundabout.
