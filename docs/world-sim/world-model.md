# World model

The tile grid and its layers, map size, terrain and height, terraforming,
water as a derived sea-level model, and the map edge. For the simulation
clock and speed controls, see [time-system.md](time-system.md).

## The tile grid

A tile is 20 metres (`TILE_METERS`) on a side — wide enough that the widest
street the game builds pays for itself: four 3.75 m lanes, a 1.2 m refuge,
and a 1.875 m footway on each side, all inside 19.95 m. Lane and vehicle
sizes are real metres and do not scale with the tile; building footprints
are given in tiles and do, so a lot grows with the street it fronts rather
than being stranded on it.

The map is a 256×256 grid of tiles (`MAP_SIZE`) — roughly 5.1 km (5,120 m)
on a side — addressed by a single row-major index. World origin sits at the
map's corner tile (0, 0); a tile's centre in world metres is
`(tile + 0.5) × 20`.

Every tile carries a stack of parallel layers rather than one shared record:
terrain height, a derived water flag, tree density, zone type, road tier and
road occupancy, building occupancy, and whether power and piped water reach
the tile. Growth and demand additionally read a set of per-tile 0–255
fields — land value, pollution, crime, and education among them (see the
RCI demand model in the zoning and growth documentation).

## Terrain and height

Height is stored as metres above sea level, negative below it. The rendered
terrain is a triangulated surface — each tile's quad is split along one
diagonal into two flat triangles — and the game's height query reproduces
that surface exactly: it interpolates within whichever triangle a point
falls in, rather than blending the quad's four corners as a flat plane.
Every consumer that samples the ground — roads, driveways, parking aprons,
ground props, vehicles, pedestrians, street lamps — reads this same
function, so nothing built on the terrain can disagree with what is drawn.

A building — together with its roof, its setback tiers, and any
roof-mounted parts — seats its base at the MAXIMUM terrain height found over
its footprint's `(w+1)×(d+1)` grid of tile corners, not the footprint's
centre. Because those corners land exactly on terrain vertices, that
maximum is exact rather than sampled: on a slope, a building can only float
above the ground by the corner-to-corner height difference, never sink into
it.

A tile is buildable — for a building, for zoning, or (under a looser gate)
for a road — only if it is not water and the height difference to every
existing orthogonal neighbour is within a slope ceiling:

- **`MAX_BUILD_SLOPE` = 4 m** per tile, for buildings and zoning.
- **`ROAD_MAX_SLOPE` = 10 m** per tile, for roads only. A road tolerates a
  steeper grade because placing it re-flattens and banks the footprint
  underneath anyway, so the terrain never actually stays this steep once
  the road is down.

## Terraforming

Four tools reshape the ground: **Raise**, **Lower**, **Level** (flattens to
the height sampled where the drag started), and **Smooth** (a box-blur
toward neighbouring heights). Each stroke takes a brush radius of 2–16
tiles and a strength of 1–5.

A terraform edit carries a mode, a centre, a radius, a strength, and (for
Level) a target height, and applies a smoothstep falloff kernel across the
brush. Tiles already carrying a road or a building are excluded from the
kernel — the game does not terraform under a structure. Editing costs ¢0.5
per metre of height change per tile (`TERRAFORM_COST_PER_METER_TILE`),
funds-gated like any other edit; undoing or redoing a stroke restores the
exact prior heights rather than re-running the tool.

Editing terrain re-derives, for the edited region: the water mask (any tile
whose height drops below sea level becomes water), tree clearing on newly
submerged tiles, and buildability. Digging below sea level therefore floods
the hole with no separate mechanism — lakes and canals are simply terrain
dug low enough for the derived water mask to claim.

## Water

Water is not an authored layer; it is derived — every tile whose height is
below **`SEA_LEVEL` = 0** metres is water. Terraforming raises or lowers
this ground like any other, so digging a hole below sea level creates
water and filling one drains it: the same model covers seas, natural lakes,
and dug canals, with no separate case for any of them. Dynamic water
flow — rivers or floods that actually move water between tiles — is not
part of this model: a heightfield flow simulation is a performance cost the
derived sea-level model avoids by not attempting it. See
[../art/README.md](../art/README.md) for how the surface, shoreline, and
depth read on screen.

## The map edge

The map's boundary is not a drop into nothing: a perimeter wall runs down
from the surface at every edge tile to a fixed base 18 m below sea level,
following terrain height and rebuilding when a terraform edit touches an
edge row. See [../art/README.md](../art/README.md) for its cross-section
treatment.

The camera does not fly to the edge when the pointer leaves the window.
Losing pointer-move delivery would otherwise leave the last cursor position
parked in the edge-scroll band and drive the camera there; instead, the
camera cancels all edge-scroll contribution the moment the pointer leaves
its element, the window loses focus, or the document registers the pointer
leaving entirely, and parks its tracked pointer at the viewport centre —
resuming edge-scroll only once a real pointer movement is seen inside the
viewport again. A fresh city boots with the camera 380 m out, close enough
that the opening view is filled with land rather than dominated by the
horizon.
