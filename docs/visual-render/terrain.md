# Terrain specification

How the ground is built, levelled and closed off at the edge of the world.

Everything here is deterministic — seeded from map data or tile coordinates,
never `Math.random` — so the same map always looks the same.

## Levelling under structures

Placing a road or a building levels its own footprint — plus a 1-tile apron
around a road — to the mean height of the tiles it covers, so the new structure
sits flat instead of a terrain "diamond" poking up through it.

Because a rendered terrain corner is shared by the two chunks that meet there,
dirtying one tile always dirties its neighbours' chunks too: rebuild only the
edited chunk and the shared edge would show the old height on one side and the
new one on the other — a crack that shows the water plane straight through the
ground.

## The map edge

At the edge of the map, a perimeter skirt wall closes the view from outside:
for every boundary-chunk edge vertex, a vertical quad strip drops from the
surface down to a fixed base (−18 m), vertex-coloured as an earth
cross-section — a thin topsoil band matching the local ground colour, then dirt
brown, then darker rock at the base. It follows the terrain height, and a
terraform edit touching an edge row rebuilds just that skirt segment.

Below the waterline the strata read straight through the translucent water,
closing what would otherwise look like a set of floating layers.

## Materials

The terrain carries no textures. The grass, dirt and rock reads are all
per-vertex colour baked at chunk build time — see
[vegetation.md](vegetation.md) for the ground-cover variation and
[shaders.md](shaders.md) for why there is no shader doing this.

The rules governing what the terrain _is_ — height, sea level, terraforming and
buildability — are simulation, not rendering; see
[../world-sim/world-model.md](../world-sim/world-model.md).
