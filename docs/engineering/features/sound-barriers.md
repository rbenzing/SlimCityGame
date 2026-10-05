# Sound barriers — technical design

- **Status:** Draft
- **Date:** 2026-10-01
- **Design:** [../../game-design/features/sound-barriers.md](../../game-design/features/sound-barriers.md)

## What we are building, and why now

A noise wall is a cross-section piece, `soundWall`, that a motorway or a ramp
carries at the outer edge of either side, with a height of 3, 4.5 or 6 m.
Noise crossing the tile edge it stands on is cut by the wall's insertion loss.
It is the last unbuilt road-composition piece in the ROADMAP, and the road
model already stores everything it needs except the piece itself.

## What it touches

| Module                                      | Change                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                       | `'soundWall'` appended to `LanePieceKind`; `LanePiece.height`.                               |
| `src/data/roads.json`                       | The highway and ramp classes admit `soundWall`.                                              |
| `src/shared/soundwall.ts` (new)             | The figures, the insertion loss, the transmission and the price.                             |
| `src/shared/soundwallsites.ts` (new)        | `soundWallsAt`: which tile edges a wall stands on, and where across the tile.                |
| `src/world/noisewalls.ts` (new)             | The noise edges the worker derives from the grid with `soundWallsAt`.                        |
| `src/shared/roadprofile.ts`                 | The piece's width; edits, compose, read back, equality; the room refusal; the price.         |
| `src/world/freeroads.ts`                    | `planSegment` refuses a section with a wall.                                                 |
| `src/sim/fields.ts`                         | Noise diffusion reads a per-edge transmission.                                               |
| `src/sim/worker.entry.ts`                   | Rebuilds the noise edges when the roads or the profile table change.                         |
| `src/render/soundwalls.ts` (new), `main.ts` | The wall: barrier, panels and posts, one `InstancedMesh` each.                               |
| `src/app/clientgrid.ts`                     | The reader `soundWallsAt` takes, over the mirror.                                            |
| `src/ui/RoadToolOptions.tsx`                | The Sound wall panel.                                                                        |
| `tools/soundwall-shots.mjs` (new)           | The browser check: walled and open motorways, a ramp's gap, a corridor, a bridge, the panel. |

**Save format:** no change. A profile is saved as JSON, its pieces by name, so
a new kind and a new field travel as they are. **Worker protocol:** no change.
The wall reaches the mirror inside the profile table it already receives.

## The design

### What is stored

A wall is an edge piece, like a footway: `{ kind: 'soundWall', width: 0.6,
height }`, outermost on its side of the section, outside the shoulder. The
0.6 m is the concrete safety barrier the wall stands on, the same width as
the barrier piece. The height is one of `SOUND_WALL_HEIGHTS_M`. Only the
highway and ramp classes admit the piece, so `admitsAllPieces` keeps it off
every other road, through the tool and through the worker's
`defineRoadProfile` gate alike. It is not a carriageway piece: it is outside
`CARRIAGEWAY_KINDS`, so it changes no lane offset, no marking, no capacity
and no kerb. It does count in `profileWidth`, which is what has to fit the
tile.

### Where a wall stands

One function, `soundWallsAt(x, z, reader)` in `src/shared/soundwallsites.ts`,
decides it for the worker and the renderer alike. It reads the tile's own
section, in world order and halved where the tile is half of a corridor
(`worldOrderedProfile`, `corridorHalfProfile`), its stored flow and its
neighbour mask. For each end of that section that holds a wall:

- **The edge.** A tile running east–west has its low end on its north edge
  and its high end on its south edge; one running north–south, west and east.
  The axis is the stored flow's, or the mask's where the flow says nothing.
- **Gaps.** A wall stands only on an edge no arm leaves by. A slip road
  leaving or joining is an arm on that side, and so is the road a corner turns
  into. So the wall opens across a ramp's mouth and round the inside of a
  corner, which is where real walls break.
- **Across the tile.** Its base runs from the carriageway's edge outward, 0.6 m,
  plus the corridor shift for half of a motorway nothing divides
  (`carriagewayShiftOf`).

Which edge a wall stands on is read off the road's own section, so the sim
and the renderer agree without either needing the approach walk. How far
across the tile its base stands is the renderer's question alone, and the
mirror's reader answers it from the drawn section (`drawnAt`), so where the
motorway grows an auxiliary lane the wall's face steps out to the drawn
carriageway's edge and the lane runs inside it. The room comes from
`withAuxiliaryLane`, which takes the verge first and then the hard shoulder
on that side down to `AUXILIARY_SHOULDER_MIN_M` (1.2 m); a walled three-lane
motorway's 3 m shoulder narrows to about 1.75 m beside the lane. The noise
field's reader has no `drawnAt` and needs none, since the field reads edges.
The auxiliary lane is drawing only; no traffic figure reads it.

Only the ground layer carries a wall. Where a motorway passes over another
road, on the over layer, its wall stops for that tile.

### Room for it

`layRefusal` refuses a section whose wall would overrun its tile: on one
tile, the carriageway's half-width plus 0.6 m must fit inside half a tile on
every walled side. On a corridor the same is asked of each half, after the
shift. A three-lane motorway (15.45 m) and a four-lane one built at the
motorway's 3.6 m lanes (18.6 m) both leave room on each side; five and six
lanes are corridors whose outer halves have room. The refusal ("No room
beside the carriageway for a sound wall") is for a section that already
reaches the tile's edge, such as four lanes at the preset's old 3.75 m
(19.2 m). The side and height chips are disabled with it as their title.

A road off the grid is refused with a wall (`planSegment`: "A sound wall goes
only along a road on the grid"), since nothing stores which tile edges it
crosses.

### Noise

`FieldSim` keeps two `Uint16Array`s of the map's size, the transmission of
each tile's east edge and south edge, `256` where nothing stands. When noise
diffuses, a neighbour across an edge of transmission `t` contributes
`self + ((neighbour − self) × t >> 8)` in place of itself. The flow between
two tiles is scaled the same way from either side, so the blend still
conserves what it moves, as the map edge does at `t = 0`. Only the Noise field
reads the edges.

The transmission is `10^(−loss / 10)`, with the loss `5 + 1.5 × (h − 3)` dB:
81, 48 and 29 out of 256 for 3, 4.5 and 6 m. The field is treated as sound
energy. Its emission is proportional to the traffic on a road, as acoustic
energy is, so this is how a decibel cut applies to it.

The worker rebuilds both arrays when the road network's version or the custom
profile table changes, and after a load. It visits only tiles whose profile
carries a wall, so a city without walls pays nothing per tick.

### Price

`soundWallPrice(h)` is the motorway preset's own price per tile, scaled by the
wall's cost per metre against a three-lane motorway's:

- $525/m² × h for the wall (FHWA inventory, 2020–22);
- 3 × $3.551M a lane-mile for the motorway (FHWA C&P Exhibit A-1, 2014).

That gives ¢16, ¢24 and ¢32 per side per tile, with upkeep at the motorway's
own ratio of upkeep to price. `roadPriceOf` adds it for each wall, divided by
the tiles the road spans, because each run of a corridor is charged per tile,
and its walls are on one half each.

### The wall on screen

`src/render/soundwalls.ts` turns `soundWallsAt` into segments: one per walled
tile edge, 20 m long, at the wall's offset, at the terrain's height or the
deck's. Three `InstancedMesh` buckets draw them:

- the safety barrier, 0.6 × 0.81 m, its sloped face toward the road;
- the panel, 0.15 m thick, scaled to the height, at the back of the barrier;
- steel posts every 5 m.

Colours come from `palette.ts`, the palest neutrals in it: a wall is a
vertical face lit mostly from the side, and the darker concretes read as black
on it. The renderer rebuilds with the bridges whenever road tiles change,
which is also when a newly defined profile first reaches a tile. A lamp column at the kerb stands on
the barrier in front of the panel, and a gantry's legs stand behind it, so
neither moves.

### The tool

The road tool's options gain a **Sound wall** panel wherever the class admits
the piece:

- **Sides:** None, Left, Right, Both.
- **Height:** 3 m, 4.5 m, 6 m. Each chip's title gives its cut, and the row
  shows only while a side is chosen.

`ProfileEdits` gains `soundWall` and `soundWallHeight`, `editsOf` reads them
back, and `composeProfile` lays the wall outermost. Each chip is disabled with
`layRefusal` as its title where it would overrun the tile. The cursor chip's
price is `roadPriceOf`'s, so it includes the walls.

## What could go wrong

- **Sides read the wrong way round.** A road drawn south has its driver's
  left at the high offset. Composing by the driver's side and placing in world
  order keeps this right; tests lay a wall each way in each direction.
- **Noise flowing through a wall on one side only.** Both tiles read one stored
  edge, so it cannot.
- **A wall the sim and the screen disagree about.** Both call `soundWallsAt`
  over readers of the same layers.
- **The lost auxiliary lane** read as a regression to a player who knew the
  road without a wall, and was one until 2026-10-05, when the lane learnt to
  narrow the shoulder and the wall to follow the drawn edge.

## Alternatives

- **A structure drawn along tile edges**, like a power line. It could stand
  anywhere, but it needs a saved layer and its own placement rules. The
  player chose the road option.
- **Blocking noise outright.** That cuts more than any wall can, 20 dB being
  FHWA's ceiling for a thin wall.
- **Placing the wall at the tile edge.** That is nearer where real walls
  stand, at the right-of-way, but it collides with an auxiliary lane, which
  reaches the edge, and with the kerb furniture.

## How we will know it works

- **Unit tests:**
  - `soundWallsAt`: each direction, each side, corridor halves, ramp mouths,
    corners, no wall over an arm.
  - Transmission and price figures.
  - Compose and read back.
  - The room refusal.
  - The diffusion's conservation, and the cut across a wall.
- **Interaction test:** a busy motorway past homes, with and without a wall,
  through the real commands. Noise is lower behind the wall, land value is
  higher, the road side is no quieter, and bulldoze and undo take the wall
  with the road.
- **The browser:** the wall on a motorway and on a ramp, along a bridge, and
  at an interchange's gaps, under the Noise lens.

## Out of scope

Absorptive walls, berms, a wall drawn apart from a road, walls on streets or
roads off the grid, walls over an overpass tile, and the reflection a wall
sends to the far side.
