# Map generation

- **Status:** Proposed

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
| Generator ids | 1 hills (the first), 2 coast | id | appended; never reused |
| Sea's mean width along its edge | 34 tiles, 680 | m | dial: 13% of the map's width |
| Coastline wobble | ±15 tiles, on waves 180 and 67 tiles long | tiles | dial |
| Sea bed and beach plain | the bed falls 0.25 a tile from the shore, to −8; the plain rises 0.15 a tile for 40 tiles, hollows filling to it and hills staying | m | dial: the terrain's own floor; a 0.75% grade |
| River's width | 4 tiles inland, 6 at the mouth; 80 to 120 | m | dial: under the 200 m a channel may be |
| River's bed | 2 below sea level | m | dial: deeper than the 1.5 m at which a river's bed is lost to sight |
| River's course | from the coast to the far edge, swinging ±24 tiles about a line leaning up to 14° | tiles | dial |
| Valley | level for 3 tiles each bank, then rising 1 a tile | m | dial: a 5% side, a quarter of `MAX_BUILD_SLOPE` |
| Hills and lakes | the first generator's, untouched 40 tiles in from the shore and outside the valley | — | `generateProceduralMap` |
| Water, and buildable ground, on a map | 17.7% and 82.0% (the first generator: 3.3% and 96.7%) | share | measured over 24 seeds on a prototype |
| Maps with ocean, river, lake | 24, 24, 24 of 24 (the first generator: 14, 4, 24) | maps | same measurement |
| Room on the start's bank | at least 10,000 buildable tiles, 4 | km² | dial: to be measured over 200 seeds when built |

**Code:** not built. `src/world/maps.ts` `generateProceduralMap` is generator 1 and stays as it is.

**Tests:** not built. To pin: generator 1 gives today's heights for a seed; generator 2's promises over many seeds (coast, river that is a River by shape, lakes, start on dry ground, room on its bank); a save round trip keeps each generator's terrain; a save with no id loads on generator 1.

**Open:** a choice of map kinds at New Game; a second river, islands and a harbour bay; the land's three other edges still end at the map's edge.

## Why the rules are what they are

### What the player gets

A new game opens on a coast. One edge of the map is sea, about 680 m of it, with a shoreline that wanders. A river 80 to 120 m wide winds across the map and out to that sea, in a valley with level ground along both banks. The hills and lakes inland are the ones maps have always had.

So the three kinds of water are on every map from the first minute: swell and surf on the coast, a current in the river, gusts on the lakes. Today a map is 3.3% water, 10 maps in 24 have no sea at all, and 20 in 24 have no river.

### What it costs

Land. Buildable ground falls from 96.7% of the map to 82.0%, still 21 km². The river cuts the map in two, so a growing city bridges it. A road already bridges water on its own, at a price by the deck's height, and the valley keeps both banks low.

The first town is not asked for anything new. It starts on dry ground with room on its own bank, and a pumping station has more shore to choose from than before.

### Why a new generator and not a change to the old one

A save stores its seed, and loading runs the generator again to rebuild the ground. Change what a seed gives and every saved city would wake up on different terrain, with roads under the sea. So the first generator is frozen, the new one has its own id, and a save says which made it.

The same holds for tests, shot series and probes. Many place a town at fixed tiles on a known seed. They keep the first generator unless they ask for the new one; the water series should ask, since it now finds a real river instead of digging a canal.

### Why the coast is laid over the hills

The new terrain starts from the first generator's heights and then shapes them: the sea bed and beach along one edge, the river's bed and valley across. Everything further than 40 tiles from the shore and outside the valley is unchanged. That keeps the hills and lakes players know, and it keeps the new code small: two passes over a height field.

Which edge the sea takes, where the river meets it and how it winds all come from the seed, by a stream of numbers separate from the hills' own.

### Why the sea runs past the edge

A coast on every map puts the map's edge beside water on every map. Today that edge ends in a white void, which is rare enough to live with on 3% water. The sea's surface is carried out to the horizon beyond the edge, calm and without detail, so the coast reads as a coast. The land's other three edges are left as they are.

### Why the river is the width it is

Water draws as a river when its channel is under 200 m wide and at least 400 m long with a way out. At 80 to 120 m the river is safely that, takes four to six tiles to bridge, and is wide enough to see from a town-wide view. Its bed lies 2 m down, so the surface hides the bed in mid-channel and shows it at the banks.

## Decided

- One coast and one river on every map, over a choice of map kinds at New Game: no new screen, and every player sees all three waters.
- A sea 680 m wide, over 1 km: 1 km takes water to 23.6% and buildable ground to 76.1% for the same coastline.
- A river across the whole map, over one that rises mid-map: a river 5 km long does not start inside the map.
- The generator's id in the save's header as an optional field, over a save version: older saves load unchanged, as they do for the header's other optional fields.
- The city's name stays as it is: naming maps is not part of this.
