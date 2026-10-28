# Stages

Each stage leaves the game playable, and until stage 3 no road can be built
that the grid could not already hold.

1. **The network is the store.** Nodes, segments and their slots, saved in
   place of the road tile layers; older saves convert. Only axis-aligned
   segments exist. The grid commands keep planning on tiles, because every
   rule they enforce is written against tiles. After each command the network
   takes up what the plan laid, keeping the slot of every node still in the
   same place and every segment still between the same nodes, and the tile
   layers are then derived from the network again. A derived tile that
   differs from the plan is reported as an error, never silently kept: it is
   a conversion bug. The check is also run by converting and re-deriving
   every road scenario the tests build.
2. **The graph and the spreads read the network.** The routing graph, the
   utility spread and the service spread walk the network's cells — one per
   road per tile, linked only where the network joins them — instead of the
   tile masks and tile adjacency. The graph comes out exactly as before; the
   spreads stop leaking to roads that merely lie alongside.
3. **Free geometry**, in three parts.
   - **3a, the world holds them.** Segments at any angle and curves, stored in
     the network and saved; the shared geometry (sampling, length, tangents,
     radius, footprint); `buildSegment` and `removeSegment` with every
     refusal in the geometry rules above; the derived footprint layer; grid
     drags kept off it; and the network keeping its free segments, and the
     grid nodes they meet, when it takes up a grid command.
   - **3b, the simulation reads them.** Free segments in the cells the graph
     and the spreads walk, a free run's length measured along its centre
     line, and facilities and trips finding a free road beside them.
   - **3c, the land reads them.** Zoning frontage measured from a free road's
     kerb, and buildings and zones kept off its footprint.
4. **Drawing free roads**, in three parts. Grid roads still draw through the
   tile renderer.
   - **4a, the render thread takes up the network.** The worker sends the
     whole network, encoded as the save holds it, whenever it changes; the
     render thread derives the footprint from it as the worker does, so its
     zoning grid visual reads free frontage exactly as `paintZone` does and
     nothing is plopped on a free road. The segment sweep, the junction mesh
     and the markings along each segment.
   - **4b, lamps along segments.** Street lamps stood along a free road
     between its junctions, at the lamp spacing, on alternate kerbs, reaching
     square across it, and only where it has power, as on the grid.
   - **4c, vehicles following segment centre lines.** Every graph edge
     carries the line a vehicle drives along it, world metres: each grid
     tile's centre and a free road's centre line about every 5 m, run the way
     the edge is driven. A path joins its edges' lines, and cars, service
     vehicles and garbage trucks all drive that.
5. **The tool**, in two parts, checked in the browser.
   - **5a, the curve.** The `Curve` mode's three clicks, each end snapped onto
     a road node within reach or to the centre of the grid road tile under
     it; the ghost at the road's real width; the chip with cost, length and
     tightest radius, or the refusal; Backspace and Escape; and motorways
     without `Grid`. The preview is judged by the world's own `planSegment`,
     run against the render thread's mirror of the grid and network, so it
     refuses exactly what the command would.
   - **5b, the rest of the drawing.** A straight at any angle (`Straight` with
     the 90° lock off, leaving its row or column), an end landing partway
     along a free road splitting it with a new junction (`splitSegment`, sent
     in the same batch as the road and undone with it by `joinSegments`), and
     a curve starting on a road's end continuing its direction.
   - **5c, guide snapping off the grid.** With guide snapping on, a free
     road's end that lands on nothing is pulled, on each axis, onto the
     centre line of the nearest row or column a grid road runs along, within
     the grid drag's reach, and then lands on whatever is there. The rows and
     columns that guide are found exactly as a grid drag finds them.
6. **Angled junction behaviour.** Control, stop lines, crossings, approach
   lanes and turn pockets at junctions that are not on the grid, and the
   signs and kerbside furniture along free roads, which the grid places by
   each tile's role at its junction.
7. **Free roads in the air.** Bridges, overpasses at any angle and climbing
   ramps on free segments.
8. **One renderer.** Grid roads draw through the network path, and the tile
   renderer's road meshing is removed.

