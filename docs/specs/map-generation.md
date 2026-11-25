# Map generation

- **Status:** Built

**Owns:** the terrain a new game starts on: which generator makes it, what every new map is promised to hold, and how a save keeps the terrain it was made with.

**Rules:**

- Every new game's map has one sea coast, one river running to it, and lakes. `[R-world-069]`
- A generator, once shipped, never changes what a seed gives. A new terrain is a new generator with its own id. `[R-world-069]`
- A save records its generator's id, and loading rebuilds the terrain with that generator. A save without an id was made by the first one. `[R-saves-014]`
- New Game uses the newest generator. A test, a shot series or a probe names the generator it wants, and gets the first one if it names none.
- The start point's bank holds room for a town: the dry, buildable ground joined to it without crossing water. `[R-world-069]`
- The river is one a street bridges: narrower than a channel must be to draw as a river, wide enough to read from the air.
- The sea runs on past the map's edge to the horizon; the map never ends in a void beside water.
- Nothing in the first town needs the coast or the river: a town grows on its own bank as on the first generator's land.

**Numbers:**

| Constant | Value | Unit | Source |
| --- | --- | --- | --- |
| `MapGenerator` | 1 hills (the first), 2 coast | id | appended; never reused |
| `SEA_TILES`, the sea's mean width along its edge | 34 tiles, 680, wandering ±15 tiles on waves 180 and 67 tiles long | m | dial: 13% of the map's width |
| `SEA_BED_SLOPE` | the bed falls 0.25 a tile from the shore, to −8 | m | dial: the terrain's own floor |
| `BANK_HEIGHT`, a bank's and a beach's top | 3.2 | m | dial: 0.2 over the 3 m below which ground draws as sand |
| Beach and plain | up to the bank's top within 4 tiles of the shore, then 0.15 a tile, fading into the hills by 40 tiles | m | dial: a beach 80 m wide |
| River's width across its channel, and `RIVER_BED` | 4 tiles inland, 6 at the mouth, 80 to 120; the bed 2 below sea level | m | dial: under the 200 m a channel may be; deeper than the 1.5 m at which a river's bed is lost to sight |
| River's course | coast to far edge, swinging ±24 tiles about a line leaning up to 14°, 8 tiles clear of the side edges | tiles | dial |
| River's bank and valley | up to the bank's top in 1.7 tiles, level for 3, then rising 1 a tile | m | dial: 1.7 keeps the first dry tile within `MAX_BUILD_SLOPE` of the water |
| Hills and lakes | the first generator's, untouched 40 tiles in from the shore and outside the valley | — | `generateProceduralMap` |
| Water and buildable ground on a map; maps with ocean, river, lake | 18.0% and 82.0%; 200, 200, 200 of 200 (the first generator: 3.3% and 96.7%; 14, 4, 24 of 24) | share, maps | measured over 40 seeds; the promise tests |
| Room on the start's bank | least 22,535, median 32,920 buildable tiles; 9 and 13 | km² | the promise tests, 200 seeds |
| A street's bridge over the river | one drag; 2 dry tiles of ramp a bank; 199 for 4 tiles of water, 360 for 8 | cost | measured; any road class, no longest span |

**Code:** `src/world/maps.ts` `generateMap`, `generateCoastMap`, `generateProceduralMap` (generator 1, frozen); `src/shared/types.ts` `MapGenerator`, `SaveHeader.generator`; `src/app/session.ts` `terrainSource` — which generator a new or loaded game gets.

**Tests:** `src/world/maps.coast.test.ts` — generator 1 by hash for three seeds, the promises over 200 seeds, no cliff on a shore or bank, banks above the sand; `tests/interaction/mapgen.test.ts` — save round trips, a first town on a coast map; `src/world/bridges.test.ts` — the crossing. Frames: the `coast` shot series.

**Open:** a choice of map kinds at New Game; a second river, islands and a harbour bay; the land's three other edges still end at the map's edge.

## Why the rules are what they are

### What the player gets

A new game opens on a coast. One edge of the map is sea, about 680 m of it, with a shoreline that wanders. A river 80 to 120 m wide winds across the map and out to that sea, in a valley with level ground along both banks. The hills and lakes inland are the ones maps have always had.

So the three kinds of water are on every map from the first minute: swell and surf on the coast, a current in the river, gusts on the lakes. Today a map is 3.3% water, 10 maps in 24 have no sea at all, and 20 in 24 have no river.

### What it costs

Land. Buildable ground falls from 96.7% of the map to 82.0%, still 21 km². The river cuts the map in two, so a growing city bridges it. A road of any class bridges water on its own, in one drag and with no longest span. Over the river it needs two dry tiles of ramp on each bank and costs 199 for four tiles of water, 360 for eight.

The first town is not asked for anything new. It starts on dry ground with room on its own bank, and a pumping station has more shore to choose from than before.

### Why a new generator and not a change to the old one

A save stores its seed, and loading runs the generator again to rebuild the ground. Change what a seed gives and every saved city would wake up on different terrain, with roads under the sea. So the first generator is frozen, the new one has its own id, and a save says which made it.

The same holds for tests, shot series and probes. Many place a town at fixed tiles on a known seed. They keep the first generator unless they ask for the new one; the water series should ask, since it now finds a real river instead of digging a canal.

### Why the coast is laid over the hills

The new terrain starts from the first generator's heights and then shapes them: the sea bed and beach along one edge, the river's bed and valley across. Everything further than 40 tiles from the shore and outside the valley is unchanged. That keeps the hills and lakes players know, and it keeps the new code small: two passes over a height field.

Which edge the sea takes, where the river meets it and how it winds all come from the seed, by a stream of numbers separate from the hills' own.

### Why a bank climbs out of the sand

Ground under 3 m draws as sand. A valley floor just over the water, and a beach rising 0.15 m a tile, left 120 m of bare sand on each river bank and 400 m behind the shore. So a bank climbs to 3.2 m within 1.7 tiles of the river and a beach within 4 tiles of the sea: a strip of sand, then grass.

A bank is never raised into a cliff. It is capped by the beach near the shore, it only ever lowers ground beside one of the hills' own pools, and no dry tile stands more than a buildable step above the tile beside it.

The valley is measured from the river's true line, not along the coast. Measured along the coast, a tile beside one limb of a hairpin read as near the other limb, and the valley ran off every bend in tongues.

### Why the sea runs past the edge

A coast on every map puts the map's edge beside water on every map. That edge used to end in a white void, rare enough to live with on 3% water. The sea is now carried out to the horizon beyond the edge, calm and plain, so the coast reads as a coast; [the water surface](water-surface.md) says how it is drawn. The sky's dome follows the camera, since a dome fixed over the map left white above a far horizon. The land's other three edges are left as they are.

### Why the river is the width it is

Water draws as a river when its channel is under 200 m wide and at least 400 m long with a way out. At 80 to 120 m the river is safely that, takes four to six tiles to bridge, and is wide enough to see from a town-wide view. Its bed lies 2 m down, so the surface hides the bed in mid-channel and shows it at the banks.

## Decided

- One coast and one river on every map, over a choice of map kinds at New Game: no new screen, and every player sees all three waters.
- A sea 680 m wide, over 1 km: 1 km takes water to 23.6% and buildable ground to 76.1% for the same coastline.
- A river across the whole map, over one that rises mid-map: a river 5 km long does not start inside the map.
- The generator's id in the save's header as an optional field, over a save version: older saves load unchanged, as they do for the header's other optional fields.
- The city's name stays as it is: naming maps is not part of this.
- The river's width is measured across its channel, over along the coast: a leaning reach would otherwise be narrower than its tile count.
- The river keeps 8 tiles from the map's side edges, over free drift: it always reaches the far edge and never leaves by a side.
- The coast's and river's numbers come from the seed by their own stream, salted apart from the hills' and the trees'.
