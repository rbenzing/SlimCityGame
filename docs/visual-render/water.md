# Water rendering specification

What the water looks like from the camera. The rules, the wave figures and
their sources are [the water surface](../specs/water-surface.md); this page
is the picture.

Seas, lakes, rivers and dug canals share one sea level. The surface is a
mesh over the wet tiles and their neighbours, a vertex every 10 m, drawn
after the land with the terrain continuing beneath it.

## What each water shows

- **Ocean** — deep blue offshore. A swell rolls in from the open edge in
  long lines that close up and turn to face the beach, break into ragged
  surf with a fading trail, and die behind a headland. Between them a wind
  sea of short crossing waves.
- **Lake** — clear at the rim, darker in the middle, with a thin lapping
  line at the shore. Its waves are too small to see from above; what moves
  is the gust patches, ruffled and smooth water drifting downwind.
- **River and canal** — green-teal and murkier, the bed lost by 1.5 m. Soft
  ripples and faint streaks drift toward the outlet, fastest mid-channel.
  Where it meets open water its colour runs out over about 100 m.

## The surface

- **The bed** keeps the ground's own colour: sand at the shore running to
  silt 3 m down (`seabedColor` in `src/render/terrain.ts`). The terrain
  paints no depth tint and no foam; both are the water's.
- **Through the surface** the bed is bent by the waves and dimmed by depth,
  red first, then green. A light net moves over the bed to 3 m down by day.
- **Reflection** is the sky's own colour at the mirrored ray's height, weak
  looking straight down and strong at a glancing view. There is no
  reflection pass.
- **Glint** is one patch round the sun's mirror direction, wider where the
  water is rougher, pale and faint under the moon.
- **Fouling**: where the city's drains empty, the water turns toward a murky
  brown by the square root of the sim's `waterFoul` layer, so a village's
  few units read as a smudge and a saturated outfall is fully brown — see
  [the sewage model](../world-sim/utilities-model.md#the-fouled-water).
- **Night**: the surface takes the one night tint, like the land beside it —
  see [lighting.md](lighting.md).

A canal dug after the map loads becomes a river half a second after the
digging stops: kind, depth and current are worked out again.

## How it is made

One TSL node graph on a `MeshStandardNodeMaterial`, arithmetic on position,
time and a few per-vertex figures, with no image texture — see
[shaders.md](shaders.md). It reads the frame behind the water once, colour
and depth, on both the WebGPU and the WebGL2 backend. With bloom off the
frame is still drawn through a pass of the scene alone, so the read is the
same. Only where no pass can be built is the water a plain blended sheet:
no bent bed and no light net, the rest as above.

## Not built

**Dynamic fluid flow** — water that moves between tiles, a flood simulation —
is deferred. A river's drawn current moves no water.

**Planar reflections** (a true mirror render pass) are not built; the sky's
colour stands in for them.

[../DESIGN.md](../DESIGN.md) owns both decisions and their reasoning.
