# Sound barriers

- **Status:** Built

**Owns:** the sound wall: a cross-section piece of a motorway or ramp that cuts the noise crossing the tile edge it stands on, its height, room, price, placement, noise effect and look.

**Rules:**

- A sound wall is a `soundWall` piece of a motorway's or ramp's own section, outermost on its side, never a separate structure; only those two classes admit it. `[R-roads-056]`
- Decide which tile edge a wall stands on with the one function `soundWallsAt`, for the noise field and the renderer alike. `[R-roads-056]`
- Stand a wall only on an edge no arm leaves by, so it opens at a ramp's mouth and round the inside of a corner. `[R-roads-056]`
- Cut noise by insertion loss, 5 dB plus 1.5 dB a metre above 3 m; never block it outright and cut nothing else. `[R-roads-056]`
- Refuse a wall that would overrun its tile, and any wall on a road off the grid. `[R-roads-056]`
- Run the auxiliary lane inside the wall: the wall's face follows the drawn carriageway edge, the hard shoulder narrowing to 1.2 m at the least. `[R-roads-056]`
- Put no wall on the over layer: a motorway passing over another road loses its wall for that tile.
- Change no save layer and no command: the wall travels in the profile table.

**Numbers:**

| Constant                     | Value                                                  | Unit        | Source                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOUND_WALL_HEIGHTS_M`       | 3, 4.5, 6                                              | m           | US average 14 ft (4.3 m), states 7–18 ft ([FHWA inventory](https://www.fhwa.dot.gov/environment/noise/noise_barriers/inventory/)); WSDOT 6–20 ft, normally 12–15 ft ([WSDOT](https://wsdot.wa.gov/construction-planning/protecting-environment/noise-walls-barriers)); "usually limited to eight meters" ([FHWA, Keeping the Noise Down](https://www.fhwa.dot.gov/environment/noise/noise_barriers/design_construction/keepdown.cfm)) |
| Insertion loss               | 5 dB + 1.5 dB per metre over 3 m: 5, 7.25, 9.5         | dB          | [FHWA Noise Barrier Design Handbook §3.5.1](https://www.fhwa.dot.gov/Environment/noise/noise_barriers/design_construction/design/design03.cfm): "5 dB(A) … when the barrier height just breaks the line-of-sight", "1.5 dB(A) for each additional meter" |
| Transmission                 | 10^(−loss/10): 32%, 19%, 11% = 81, 48, 29 of 256 (`256` = open) | % | acoustic energy; a 10 dB cut is heard as half as loud ([FHWA Noise Fundamentals](https://www.fhwa.dot.gov/environment/noise/regulations_and_guidance/polguide/polguide02.cfm)) |
| Line-of-sight height         | 3                                                      | m           | A heavy truck's exhaust stack, 3.66 m (FHWA TNM), seen from a window 1.5 m up across a wall at the shoulder: the line crosses at about 3.1 m                                                                                                          |
| Three heights mean           | feasible 5 dB(A), design goal 7–10 dB(A)               | dB(A)       | [23 CFR 772.13(d)](https://www.law.cornell.edu/cfr/text/23/772.13); 20 dB is FHWA's ceiling for a thin wall                                                                                                                                           |
| Wall base                    | 0.6                                                    | m           | concrete safety-shape barrier ([Handbook §9](https://www.fhwa.dot.gov/Environment/noise/noise_barriers/design_construction/design/design09.cfm)); the barrier piece's width                                                                          |
| Barrier section              | 0.6 × 0.81                                             | m           | dial: the safety barrier, sloped face toward the road                                                                                                                                                                                                 |
| Panel thickness              | 0.15                                                   | m           | precast about 125 mm, cast 150–200 mm ([Handbook §5.1.1](https://www.fhwa.dot.gov/environment/noise/noise_barriers/design_construction/design/design05.cfm))                                                                                          |
| Post and panel spacing       | 5 (panels about 4.5 m for shipping)                    | m           | Handbook §5.1.1                                                                                                                                                                                                                                       |
| Segment length               | 20                                                     | m           | one per walled tile edge, the tile                                                                                                                                                                                                                    |
| Price per side per tile      | ¢5.4 per metre of height: ¢16, ¢24, ¢32                | ¢           | $48.76/ft² ($525/m²), 2020–22 national average ([FHWA inventory](https://www.fhwa.dot.gov/environment/noise/noise_barriers/inventory/)) against $3.551M a lane-mile, rural freeway on new alignment ([FHWA C&P, Exhibit A-1](https://www.fhwa.dot.gov/policy/23cpr/appendixa.cfm)), scaled to the three-lane motorway at ¢68 a tile; different dollar years (2020–22, 2014), so it reads a little dear |
| Upkeep                       | 2% of price a month                                    | %/month     | the motorway's own upkeep against its price                                                                                                                                                                                                           |
| `AUXILIARY_SHOULDER_MIN_M`   | 1.2                                                    | m           | dial: a walled three-lane motorway's 3 m shoulder narrows to about 1.75 m beside the lane                                                                                                                                                            |
| Room, three lanes            | 15.45                                                  | m           | dial: 0.6 m a side left on the tile                                                                                                                                                                                                                   |
| Room, four lanes             | 18.6 at 3.6 m lanes; 19.2 at the old 3.75 m is refused | m           | dial: tile is 20 m                                                                                                                                                                                                                                    |
| Fleet noise                  | motorway three times a street's noise per car          | ×           | dial                                                                                                                                                                                                                                                  |
| Land value noise term        | noise ÷ 12                                             | —           | dial                                                                                                                                                                                                                                                  |
| US walls built               | 3,866 miles since 1963                                 | miles       | [FHWA inventory](https://www.fhwa.dot.gov/environment/noise/noise_barriers/inventory/)                                                                                                                                                               |

**Code:**

- `src/shared/types.ts` `LanePieceKind` (`'soundWall'`), `LanePiece.height`: the piece and its height.
- `src/data/roads.json`: the highway and ramp classes admit `soundWall`.
- `src/shared/soundwall.ts`: figures, insertion loss, transmission, `soundWallPrice`, `SOUND_WALL_HEIGHTS_M`.
- `src/shared/soundwallsites.ts` `soundWallsAt`: which tile edges a wall stands on, and where across the tile.
- `src/world/noisewalls.ts`: the noise edges the worker derives from the grid.
- `src/shared/roadprofile.ts` `layRefusal`, `composeProfile`, `editsOf`, `ProfileEdits`, `roadPriceOf`, `admitsAllPieces`, `profileWidth`, `withAuxiliaryLane`: width, edits, compose, read back, the room refusal, the price.
- `src/world/freeroads.ts` `planSegment`: refuses a section with a wall off the grid.
- `src/sim/fields.ts` `FieldSim`: noise diffusion reads a per-edge transmission.
- `src/sim/worker.entry.ts`: rebuilds the noise edges on road-network or profile-table change and after a load.
- `src/render/soundwalls.ts`, `main.ts`: barrier, panels and posts, one `InstancedMesh` each; `palette.ts` colours.
- `src/app/clientgrid.ts` `drawnAt`: the mirror's reader for `soundWallsAt`.
- `src/ui/RoadToolOptions.tsx`: the Sound wall panel.
- `tools/soundwall-shots.mjs`: the browser check.

**Tests:**

- Unit — `soundWallsAt` each direction, each side, corridor halves, ramp mouths, corners, no wall over an arm; transmission and price figures; compose and read back; the room refusal; the diffusion's conservation and the cut across a wall. Tests lay a wall each way in each direction, since a road drawn south has its driver's left at the high offset.
- Interaction — a busy motorway past homes, with and without a wall, through the real commands: noise lower behind it, land value higher, the road side no quieter, bulldoze and undo take the wall with the road.
- `tools/soundwall-shots.mjs` — walled and open motorways, a ramp's gap, a corridor, a bridge and an interchange's gaps under the Noise lens, and the panel.

**Open:** none. Not built, by choice: absorptive walls, berms, a wall drawn apart from a road, walls on streets or off-grid roads, walls over an overpass tile, the reflection to the far side.

## Why the rules are what they are

### What the player gets

A noise wall along a motorway or slip road. With the motorway or ramp selected in the road drawer, a **Sound wall** panel asks which side gets one (none, left, right, both) and how tall (3 m, 4.5 m or 6 m). The next drag lays the road with its wall; Replace puts a wall up along a motorway already laid. Behind it the motorway's noise is cut and land value recovers.

A motorway is the loudest thing in the game, and noise is one of the three things that pull land value down. The only other answer to a motorway beside a neighbourhood is to move one of them. Real cities build a wall: the United States has built 3,866 miles since 1963. A wall is a cross-section piece like any other, so it costs the road model nothing new to carry. It serves the pillar that the city is read through its data: the noise lens shows the shadow a wall casts.

- **Choose it.** The panel appears for the motorway and the ramp only, the two classes real walls are built along. "Left" and "right" are the driver's, as every side choice in the drawer. On a dual carriageway that is usually the right, away from the other carriageway.
- **Pick a height.** A taller wall cuts more and costs more; each height's tooltip says how much it cuts. The row shows only while a side is chosen.
- **Lay it.** The wall goes up with the road and comes down with it. Bulldozing the road takes the wall, and undo puts both back. A wall adds its price per tile, per side, to the road, shown in the cursor chip like a bus lane's.

### What it does

Noise is a field that spreads from tile to tile. A wall cuts what crosses the tile edge it stands on, in both directions, by its insertion loss. The road side gets no relief: a plain concrete wall reflects, and that reflection is not modelled.

Noise is read only by land value's loss term, so that is what a wall changes, and through land value, level-ups and tax. A wall cuts noise only, not air pollution.

The three heights are feasible, design goal and top of the goal: a wall is feasible at 5 dB(A) and the design goal is 7–10 dB(A). The height-3 m line of sight is the one that just breaks the truck's stack line, so 5 dB is the floor.

Insertion loss is in decibels, and the field adds up like sound energy, a road's emission being proportional to its traffic as acoustic energy is. So a wall passes `10^(−loss/10)` of what crosses it, and the cut is never total.

### What is stored

A wall is an edge piece like a footway: `{ kind: 'soundWall', width: 0.6, height }`, outermost on its side, outside the shoulder. The 0.6 m is the concrete safety barrier it stands on, the barrier piece's width. The height is one of `SOUND_WALL_HEIGHTS_M`.

Only the highway and ramp classes admit it, so `admitsAllPieces` keeps it off every other road, through the tool and through the worker's `defineRoadProfile` gate alike. It is outside `CARRIAGEWAY_KINDS`: it changes no lane offset, marking, capacity or kerb. It counts in `profileWidth`, which has to fit the tile.

Save format: no change, since a profile is saved as JSON with its pieces by name. Worker protocol: no change, since the wall reaches the mirror inside the profile table it already receives.

### Where a wall stands

`soundWallsAt(x, z, reader)` reads the tile's own section, in world order and halved where the tile is half a corridor (`worldOrderedProfile`, `corridorHalfProfile`), its stored flow and its neighbour mask. For each end of that section that holds a wall:

- **The edge.** A tile running east–west has its low end on its north edge and its high end on its south edge; north–south, west and east. The axis is the stored flow's, or the mask's where the flow says nothing.
- **Gaps.** A wall stands only on an edge no arm leaves by. A slip road leaving or joining is an arm on that side, and so is the road a corner turns into. So the wall opens across a ramp's mouth and round the inside of a corner. Real walls break at ramps for the same reason, and the gap lets noise through, as gaps in real walls do. An interchange stamp lays its roads without walls.
- **Across the tile.** The base runs from the carriageway's edge outward 0.6 m, plus the corridor shift for half of a motorway nothing divides (`carriagewayShiftOf`).

Which edge is read off the road's own section, so sim and renderer agree without the approach walk. How far across the tile is the renderer's question alone, answered from the drawn section (`drawnAt`). Where the motorway grows an auxiliary lane, the wall's face steps out to the drawn edge and the lane runs inside it.

The room comes from `withAuxiliaryLane`, which takes the verge first and then the hard shoulder on that side, down to 1.2 m. The noise field's reader has no `drawnAt` and needs none, since the field reads edges. The auxiliary lane is drawing only; no traffic figure reads it.

Only the ground layer carries a wall. A wall carries on along a bridge deck, at deck height; where a motorway passes over another road, on the over layer, its wall stops for that tile.

### Room for it

`layRefusal` refuses a section whose wall would overrun its tile: the carriageway's half-width plus 0.6 m must fit inside half a tile on every walled side. On a corridor the same is asked of each half, after the shift.

Every motorway the tool composes has room. A three-lane motorway (15.45 m) and a four-lane one at the motorway's 3.6 m lanes (18.6 m) both leave room each side, 0.6 m a side on the tile. Five and six lanes are corridors across two tiles whose outer halves have room.

The refusal, "No room beside the carriageway for a sound wall", is for a section already at the tile's edge, such as four lanes at the preset's old 3.75 m (19.2 m). The side and height chips are disabled with it as their title, so the drag is never refused after the fact.

A road off the grid is refused with a wall (`planSegment`: "A sound wall goes only along a road on the grid"), since nothing stores which tile edges it crosses. The tool says so.

### Noise

`FieldSim` keeps two `Uint16Array`s of the map's size, the transmission of each tile's east and south edge, `256` where nothing stands. A neighbour across an edge of transmission `t` contributes `self + ((neighbour − self) × t >> 8)` in place of itself.

The flow between two tiles is scaled the same from either side, so the blend still conserves what it moves, as the map edge does at `t = 0`. Both tiles read one stored edge, so noise cannot flow through a wall on one side only. Only the Noise field reads the edges.

The worker rebuilds both arrays when the road network's version or the custom profile table changes, and after a load. It visits only tiles whose profile carries a wall, so a city without walls pays nothing per tick.

### Price

`soundWallPrice(h)` is the motorway preset's own price per tile, scaled by the wall's cost per metre against a three-lane motorway's: $525/m² × h for the wall (FHWA inventory), 3 × $3.551M a lane-mile for the motorway (FHWA C&P Exhibit A-1). Upkeep follows the motorway's ratio of upkeep to price.

`roadPriceOf` adds it for each wall, divided by the tiles the road spans, because each run of a corridor is charged per tile and its walls are on one half each.

### The wall on screen

On screen the wall stands on a concrete safety barrier at the edge of the shoulder, as walls inside a motorway's clear zone do. Precast panels stand between steel posts every 5 m. `src/render/soundwalls.ts` turns `soundWallsAt` into one segment per walled tile edge, 20 m long, at the wall's offset, at the terrain's or the deck's height. Three `InstancedMesh` buckets draw them:

- the safety barrier, 0.6 × 0.81 m, its sloped face toward the road;
- the panel, 0.15 m thick, scaled to the height, at the back of the barrier;
- steel posts every 5 m.

Colours are the palest neutrals in `palette.ts`: a wall is a vertical face lit mostly from the side, and darker concretes read as black on it. The renderer rebuilds with the bridges whenever road tiles change, which is also when a newly defined profile first reaches a tile.

A lamp column at the kerb stands on the barrier in front of the panel, and a gantry's legs stand behind it, so neither moves.

### The tool

`ProfileEdits` gains `soundWall` and `soundWallHeight`; `editsOf` reads them back and `composeProfile` lays the wall outermost. Each chip is disabled with `layRefusal` as its title where it would overrun the tile. The cursor chip's price is `roadPriceOf`'s, so it includes the walls. Sides are composed by the driver's side and placed in world order, which keeps left and right right in every drawing direction.

## Decided

- The wall is a road cross-section piece, over a structure drawn along tile edges like a power line: that could stand anywhere but needs a saved layer and its own placement rules. The player chose the road option.
- Insertion loss by the FHWA formula, over blocking noise outright, which cuts more than any wall can.
- The wall stands on the shoulder's edge on the safety barrier, over the tile edge nearer the right-of-way: that collides with an auxiliary lane, which reaches the edge, and with kerb furniture.
- The auxiliary lane once vanished under a wall and read as a regression; the lane now narrows the shoulder and the wall follows the drawn edge.
- One kind of wall, plain reflective concrete: no berm, no wall behind gardens, no walls on streets.
- The sim and the screen cannot disagree about a wall, since both call `soundWallsAt` over readers of the same layers.
