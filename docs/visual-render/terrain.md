# Terrain specification

How the ground is built, levelled and closed off at the edge of the world.

Everything here is deterministic — seeded from map data or tile coordinates,
never `Math.random` — so the same map always looks the same.

## Levelling under structures

Placing a road or a building levels its own footprint — plus a 1-tile apron
around a road — to the mean height of the tiles it covers, so the new structure
sits flat instead of a terrain "diamond" poking up through it. A building the
sim grows is placed as surely as one the player plops, and levels its ground
the same way when it spawns and when it levels up; growth is not a command,
so there is nothing to undo.

A map cell holds one height, and a rendered terrain corner is the mean of
the four cells meeting there (`cornerHeight` in `src/render/terrain.ts`), so
every corner of a tile is shared with its neighbours and the ground inside a
tile is one plane only when the cells around it agree. The levelling takes
the apron's cells too where open ground owns them — so the whole surface
under the footprint is one plane — and leaves alone any that a road, another
building or water owns, since moving it would tilt the road, unseat the
neighbour or move the shoreline.

**A road's ground carries on past its end.** A wide road's turning head —
the rounded cap and the footway that wraps it, up to the class's kerb return
past the carriageway's end — stands over the apron tile beyond a dead end,
whose far corners average cells the apron never touched. Cut into a
hillside, that ground rose over the cap's uphill corner. So the levelling
runs out two tiles past a dead end: each run-out cell takes the height of
the end tile or side-apron cell it lies behind, raised or lowered to it,
held at or below the end tile and any road it borders, and never a cell a
road, a building or water owns. The cap then stands on a level shelf with
the terrace edge behind it. A narrow road's head never leaves its tile, and
the run-out is harmless there.

**A drag is solved one run at a time.** The grade solver that lifts a road
onto decks where the ground steps more than it may climb reads a drag as
contiguous runs; a command that carries two runs — the two halves of a
corridor, which the road tool lays as one command for this reason — solves
each on its own ground, and the halves take the higher of their two lifts at
each station, so both are on the ground or both on decks and neither's
corners average the other's unlevelled cells. The body is
then seated on the highest
ground under the body itself ([buildings.md](../art/buildings.md#lots-and-paved-ground)),
never under the whole footprint, so a street climbing past the lot does not
lift the house off the pad it stands on.

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
