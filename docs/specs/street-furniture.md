# Street furniture placement

- **Status:** Agreed

**Owns:** where every roadside object stands, across a street's section and along it: the furnishing strip and the clear walk, lamps, signs, signals, manhole covers, meters, cabinets and street trees, on a street with a footway, with a kerb only and with neither. The objects' shapes are [the lamp kit's](../art/props-and-vehicles/street-furniture-and-lamp-kit.md); a bus stop's own furniture is [civic-access-and-bus-stops.md](civic-access-and-bus-stops.md).

**Rules:**

- Split a footway into a furnishing strip at the kerb and a clear walk behind it. Every pole, post, box and tree stands in the strip; nothing stands in the walk. `[R-render-036]`
- Stand a pole's centre 0.46 m behind the kerb face and leave the walk behind it 1.2 m or more. `[R-render-036]`
- Keep a bus stop's boarding area, the kerb before its pad and its shelter's path clear of every object, lamps and trees included. `[R-roads-037]` `[R-render-036]`
- Keep every object off a drive, a kerb ramp and a crosswalk; a junction's lamp stands past the crosswalk, 3 m from it. `[R-render-036]`
- Light a street by its width: lamps alternate sides on a narrow street and stand in facing pairs on a wide one, taller as the street widens.
- On a road with no kerb, stand a lamp, a sign and a pole back from the travelled way by the clear zone, or at the tile's edge where the tile is narrower. `[R-render-036]`
- Stand a sign's post in the strip, its board 2.1 m clear of the walk; a stop sign on the near right, at the stop line.
- Stand a signal's mast in the strip at the far right corner; its arm reaches over the lanes and never lies along a footway.
- Lay a manhole cover in the middle of a lane, never on a painted line, an arrow, a crosswalk or a bike lane. `[R-roads-067]`
- Measure a meter from the kerb face, not from the lanes: it stands behind the kerb of the stall it serves.
- Keep a street tree out of a stop's span, off a road's end cap and clear of lamps, signs, signals and drives.
- One object to a place: nothing stands within 1.5 m of another along the strip. `[R-render-028]`

**Numbers:** every source is in [the sources](../sources/street-furniture.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Pole behind the kerb face | 0.46 (18 in) | m | [lateral offset](../sources/street-furniture.md#the-strip-and-the-walk) |
| Clear walk, least | 1.2 (48 in); 0.915 the accessibility floor | m | [same](../sources/street-furniture.md#the-strip-and-the-walk) |
| Footway | 1.875 (`FOOTWAY_WIDTH_M`): strip 0.6, walk 1.275 | m | `src/shared/roadprofile.ts` |
| Boarding area kept clear | 2.44 from the kerb × 1.52 along it | m | [bus stops](../sources/street-furniture.md#bus-stops) |
| Lamp from a crosswalk | 3 (10 ft) | m | [lighting](../sources/street-furniture.md#street-lights) |
| Narrow street | carriageway to 15 m (50 ft): lamps alternate, every 3 tiles (60 m) | | 180 ft, [lighting](../sources/street-furniture.md#street-lights) |
| Wide street | over 15 m: facing pairs, every 4 tiles (80 m) | | 250 ft, same |
| Lamp height by width | 6.1 / 9.1 / 12.2 (20 / 30 / 40 ft) | m | same |
| Lamp height breaks | under 9 m of carriageway, 9 to 15 m, over 15 m | | dial; the three heights are the standard's |
| Motorway | one twin-armed pole on the median or barrier every 4 tiles; facing poles at the tile's edge where it has neither | | dial |
| Ramp | one pole every 3 tiles at the tile's edge, on its wider shoulder | | dial |
| A stop's clear span | 2.59 either side of the stop's centre along its kerb | m | half the pad and half the boarding area |
| Clear zone, to 65 km/h | 3.0 (10 ft) | m | [no kerb](../sources/street-furniture.md#roads-with-no-kerb) |
| Clear zone, faster | 4.6 (15 ft) | m | same |
| Sign post behind the kerb face | 0.46; the board's edge 0.3 at least | m | [signs](../sources/street-furniture.md#signs-and-signals) |
| Sign's bottom over the walk | 2.1 (7 ft); 1.5 with no walk | m | same |
| Sign with no kerb | 3.7 (12 ft) from the travelled way | m | same |
| Signal mast behind the kerb face | 0.61 (2 ft) | m | same |
| Signal head over the road | 4.6 to 7.8 | m | same |
| Tree from a lamp / a stop sign or signal / a drive | 4.6 / 6.1 / 1.8 (15 / 20 / 6 ft) | m | [trees](../sources/street-furniture.md#street-trees) |
| Between two objects | 1.5 | m | dial |

**Code:** `src/render/lamps.ts` `lampLateralOffset`, `tierGetsLamp`, `computeLampPlacements` the spacing, sides, heights and the stops it keeps clear of; `src/shared/constants.ts` `LAMP_SPACING_TILES`, `LAMP_SPACING_WIDE_TILES`; `src/shared/roadprofile.ts` `postedKmhOf`, `centralReserveOffsetOf`; `src/render/roadfurniture.ts` `POLE_BEHIND_KERB_M`; `src/render/freeroadmesh.ts` lamps along a curve; `src/render/roadfurniture.ts` covers, meters, boards, masts, cabinets; `src/render/busstops.ts` `busStopPlacement`; `src/shared/roadprofile.ts` `kerbWidthOf`, `FOOTWAY_WIDTH_M`; `src/main.ts` what `lamps.rebuild` is told.

**Tests:** `src/render/lamps.test.ts` holds a lamp 0.46 m behind the kerb face on every profile with the walk clear behind it, the no-kerb clear zone, the spacing and sides of a narrow and a wide street, the three heights, the motorway and the ramp, and no lamp in a stop's span or within 3 m of a crosswalk. To be written with the rest: no cover on a painted line; signs, signals, meters and trees in their places.

**Open:** the lamps are built; covers, signs, signals, meters and trees are not. A curved street's lamps do not yet keep off a drive or a stop. A motorway's median lamp is one pole drawn twice, and no shot shows it lit. Poles of different kinds do not yet keep 1.5 m apart. Hydrants, benches and mailboxes do not exist in the game and are not proposed here.

## Why the rules are what they are

### What is wrong today

A lamp stands in the middle of the footway: its offset is the lanes' half-width plus half the footway. A walker meets a pole every forty metres, and a bus stop's pad, which lies behind the footway, has a lamp between it and the bus door, since the lamp placer is never told where a stop is. On a road with no kerb the same sum puts the lamp on the carriageway's edge. Covers run down the centre line, so they sit on the yellow paint and on lane arrows. Stop signs stand behind the footway, on the grass.

### The strip and the walk

A street-design manual divides a sidewalk in two. The strip at the kerb takes "poles, lights, hydrants, trees, benches, utility boxes"; the walk behind it is kept "clear of obstacles". The game's footway is 1.875 m, narrow by any manual, so the strip is the least a pole needs: its centre 0.46 m behind the kerb face, the figure the bus stop's own pole already uses. That leaves 1.2 m of walk behind a pole, the accessibility guideline's clear width, and nothing else may stand in it.

### A stop, a drive, a crossing

A bus's door opens onto a boarding area 2.44 m deep from the kerb and 1.52 m along it. A lamp, a tree, a meter or a cabinet inside a stop's span stands in that area or in the path from pad to door, so the span is kept clear of all of them, as a drive already is of a lamp. A junction's lamp lights the crossing from beyond it: it stands past the crosswalk, 3 m off, and never on a kerb ramp.

### Lamps by the street's width

One lighting standard alternates lamps along a street up to 50 ft wide and sets them in facing pairs on a wider one, further apart. On the 20 m tile that is every third tile on alternate sides for a two-lane street and every fourth tile in pairs for a four-lane road or an avenue. Height follows width, 20, 30 and 40 ft: the 5.5 m pole of today is shorter than any of them and reads as a path light on an avenue.

### Where there is no kerb

Nothing shields a pole beside an open road, so the manuals keep it out of the clear zone: 10 ft from the travelled way on a slow road, 15 ft on a faster one, or as near the right-of-way line as the land allows. The tile's edge is that line. A sign stands 12 ft out and lower, there being no walker to clear.

### Covers, signs, signals, meters, trees

- **Covers** lie outside the wheel paths and off the paint: the middle of one lane, the same lane along a run, never a crosswalk or a bike lane.
- **A sign** stands in the strip with its board over the walk's edge at 2.1 m, so it is read from the lane and walked under. A stop sign stands on the near right, as close to the junction as the stop line.
- **A signal's mast** stands in the strip at the far right corner, 0.61 m behind the kerb, clear of the ramp; the arm is over the road, the heads 4.6 m up.
- **A meter** is measured from the kerb face of the stall it serves; measured from the lanes it lands on the road side of the kerb where a parking lane lies between.
- **A tree** keeps 4.6 m from a lamp, 6.1 m from a stop sign or a signal and 1.8 m from a drive, and stays off a road's end cap and out of a stop's span.

## Decided

- A strip of 0.6 m in the footway there is, over a wider footway: the profile's width, and every lot that meets it, stay as they are.
- Lamp spacing in whole tiles, over metres: a lamp's place stays a function of its tile.
- Heights by width from one city's standard, over one height for all: the avenue is the case that reads wrong today.
- Slices: the lamp's offset, the stop's clear span and the no-kerb setback first; then lamp height and arrangement; then covers, signs, signals and meters; then trees.
