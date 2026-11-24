# Centred circles

- **Status:** Agreed

**Owns:** the centred forms of the two circles: a cul-de-sac whose bulb sits on its street's centre line, and a compact roundabout whose ring sits on the junction's own tile. The offset forms stay in [cul-de-sacs.md](cul-de-sacs.md) and [roundabouts.md](roundabouts.md).

**Rules:**

- A centred cul-de-sac is the centred cul-de-sac code on all six tiles of an intact block three tiles across and two along, beyond a dead end. `[R-roads-097]`
- Its circle is the offset bulb's own, centred on the street's centre line where the block's two rows meet. `[R-roads-097]`
- A centred roundabout is the centred roundabout code on all nine tiles of an intact 3×3 block, the junction's tile in the middle. `[R-roads-098]`
- Its ring is the compact roundabout's own, centred on the middle tile; every leg enters on the ring's centre line through the middle of a side. `[R-roads-098]`
- Each is one thing, as its offset form is: one predicate, drawn whole, no control or paint set on one tile, bulldozed and restored whole. `[R-roads-097]` `[R-roads-098]`
- Nothing fronts a centred roundabout: no lot takes its drive or walk from one of the nine tiles. `[R-roads-098]`
- No road touches a block except the street at a bulb's mouth and a ring's legs; refuse one that would, and say which.
- The tool picks the form by where the pointer is: over the middle, centred; to a side, the offset form on that side.
- A centred circle obeys every rule of its offset form that this card does not change.

**Numbers:**

| Constant | Value | Unit | Source |
| --- | --- | --- | --- |
| Centred bulb's block and centre | 3 across × 2 along, 60 × 40; centre on the line, 20 beyond the end tile's far edge | m | dial: a circle 33 m across on a tile's centre line overhangs that tile by 6.5 m a side; the offset bulb's distance along |
| Ground beside the footway | 13.5 a flank; 3.5 at the mouth and the far end | m | derived: 30 − 16.5 and 20 − 16.5 |
| Lots on a centred bulb, and each one's distance to the footway | 7: two a flank at 15.1, far middle at 3.5, two far corners at 11.8 | m | derived: the offset bulb has 6 lots at 5.9 |
| Centred ring's block | 3×3, 60 × 60 | m | dial: a ring 36 m across on a tile's centre overhangs it by 8 m a side |
| Leg inside the block | 12, at no offset from the ring's centre line | m | derived: 30 − 18 |
| Kerb returns | entry 10, exit 15 | m | the low end of the entry radius and the exit radius the roundabouts Numbers table cites; both fit the 12 m of leg |
| Crosswalk and splitter | unchanged; the crosswalk lies inside the block, the splitter runs 3 past it | m | derived: 18 + 6.1 = 24.1; 18 + 15 = 33 |
| `CENTRED_ZONE_M`, the pointer's middle zone | under 5 from the centre line (bulb); under 5 from the tile's centre both ways (ring); 5 itself is a side | m | dial: half the tile's width, a quarter of its area |
| Kerb return at a centred mouth | 5 at most, swung outward on both sides | m | dial: the offset bulb's cap; the mouth opens wider than the street |
| Codes | 8 centred roundabout, read as a roundabout; 9 centred cul-de-sac, never a control | byte | appended in the junction-control layer |
| Tiles laid, and paid for at the street's price | ring 4 on a crossroads, 5 on a T; bulb 6 | tiles | derived: the ring's corners and a side with no arm |

**Code:** the bulb is built, the ring is not. `src/shared/culdesac.ts` `culDeSacBlockOf`, `centredCulDeSacAtEnd`, `pointerOnCentreLine`, `culDeSacTiles`, `culDeSacCentre` — one predicate and plan for both bulbs; `src/world/culdesacs.ts` `withoutBulbIslands` — the loop; `src/render/culdesacmesh.ts` — the block drawn whole.

**Tests:** the offset bulb's files, each with the centred shape: `src/shared/culdesac.test.ts`, `tests/interaction/culdesacs.test.ts`, `src/render/culdesacmesh.test.ts`, `src/render/culdesaclots.test.ts`, `src/world/zonable.test.ts`, `src/tools/tools.test.ts`. Frames: the `ends` and `circles` shot series.

**Open:** the centred roundabout is not built; a circle with two arms on a plain road, for which no design guide was found; a centred bulb's flanks, 13.5 m of plain grass.

## Why the rules are what they are

### What the player gets

Two more shapes from the two cards already in the road drawer, with no new card and no switch. Point at a dead end's middle and the bulb previews square on the street, `=O`. Point at a junction's middle and the ring previews with every road meeting it head on, `=O=`. Point to one side and the offset form previews there, as it always has.

The preview names what it will lay, "Centred cul-de-sac" or "Centred roundabout", and turns red with the reason where the ground refuses it. A refused centred form never falls back to an offset one: the player moves the pointer.

### Why the centred bulb is three tiles by two

A road runs down a tile's centre. The offset bulb puts its circle on a corner four tiles share, so it fits two tiles across and sits half a tile to one side. A circle on the centre line cannot fit two tiles across: it needs the street's own column and part of the column on each side. A side column cannot be shared with a lot, because a lot is whole tiles. So the block is three across.

Along the street nothing changes. The centre stays where the block's two rows meet, so the circle clears the mouth and the far end by the offset bulb's own margin.

The mouth is symmetric too. On the offset bulb one kerb return curves in toward the circle; on a street this narrow a return curving in would cross the centre line. Both returns of a centred mouth curve outward instead, so the street opens into the circle like a funnel.

To traffic the bulb is a loop, as the offset one is. The block's two middle tiles are road like the rest, but the road graph does not join them, so no route crosses the middle of the circle.

The cost is land and a longer walk to the kerb. The block takes six tiles for four, and the homes on its flanks stand 13.5 m further from the ring across plain grass. It gains one lot.

### Why the centred ring is three tiles by three

Two roads cross at a tile's centre, so a ring on both centre lines sits on that tile. A ring 36 m across overhangs it by 8 m on every side and cuts each corner tile. All eight tiles round the junction are therefore the roundabout's ground.

The ring keeps its size. The first form's 2×2 block was chosen because 60 m is too wide for a single-lane ring; the centred block is 60 m wide round a ring that is still 36 m. The 12 m between ring and block edge is what a real approach uses: the crosswalk, the splitter and the curves of the kerbs.

### What the centred ring puts right

On a 2×2 block every leg meets the ring half a tile off its centre, two of four on the side the guides like least. A centred leg has no offset. Its kerbs curve in on both sides alike, with room for a 10 m entry return where the 2×2 block holds 3 m.

### Why nothing fronts a centred roundabout

The ring stands at least 12 m inside its block, and a drive across that ground would open onto the circulating road. The guide the roundabout spec cites advises against a driveway into a ring. Lots beside the block front its legs. On a T, the three tiles facing the side with no arm need another street.

### What the stamp asks of the ground

A centred ring goes on a junction of three or four arms, each running straight for two tiles: one inside the block, one beyond it as the leg. The four corners, and a side with no arm, must be open ground with no building, water or road. In a built-up town that means clearing the corner lots first. The offset form asks for at most three tiles and stays the cheaper stamp there.

A centred bulb needs six open tiles beyond the dead end. The lots beside the street's last tile keep their ground, as they do with the offset bulb.

### What is stored

Two codes, appended in the junction-control layer. A new code and not the old one on a bigger block: nine roundabout codes with one corner lost would hold an intact 2×2 block, and read as an offset roundabout that nobody laid. A block of the new codes that is not intact reads as plain road and no override.

The centred bulb's block lies three across its street, and the street joins the middle tile of a long side. No block may touch another of its kind, so a run of coded tiles is always one block.

## Decided

- Picked by the pointer, over a second pair of cards or a switch on the card: both circles already take their side from the pointer.
- The bulb on a 3×2 block, over 3×3: the circle fits two tiles along the street, and the third row would be 1,200 m² of grass.
- The ring on a 3×3 block at 36 m, over a plus of five tiles: a plus keeps the corner lots only if the ring shrinks to about 24 m.
- The commands carry the shape as an optional field, over a second pair of commands: with the field absent a recorded batch still lays the offset bulb.
- Any bulb's code on a tile refuses another bulb there, of either shape.
- Three or four legs, as the offset ring: a ring with two arms on a plain road waits for a source.
- The offset forms stay: they take less land, and the offset ring goes on a built-up junction without clearing its corners.
