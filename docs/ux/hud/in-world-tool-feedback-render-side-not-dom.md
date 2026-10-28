# In-world tool feedback (render-side, not DOM)

Everything above is DOM. This is the part of the same interaction language
that is drawn into the 3D scene instead, alongside whatever tool is
active:

- **Ghost preview**: a translucent accent-blue ribbon or cell block
  replaces the plain tiles under a tool — a white dashed centerline marks a
  road preview, an orange-red tint marks an invalid one. Zone painting
  shows as a bright green cell fill with darker borders; de-zoning shows
  grey. The crisp outer-border treatment on top of this ghost is a
  cross-cutting rule — see [`interaction.md`](../interaction.md).
- **A road ghost is drawn at the road's own width**, not the tile's, because
  the width is what the player is choosing and every road would otherwise
  preview identically: a neighbourhood street reads as the 11 m it is inside
  its 20 m tile, and an avenue nearly fills that tile. Replacing one with the
  other is where it earns its keep — the ghost is what says beforehand that
  the new road is twice the street it is going over. A section too wide for a
  tile is laid as two carriageways on two rows of tiles, and the ghost shows
  both, so the extra ground a corridor claims is visible before it is taken.
  Each half is ghosted where it will be laid: a corridor with nothing
  dividing it — a six-lane motorway, an undivided arterial — previews as one
  unbroken band across the edge its halves share, and only a divided road
  shows the median's gap between them.
  The tile frame is still drawn around the tiles themselves, so which tiles
  are claimed and how much of them the road covers are both readable at once.
- **A road ghost stands at the road's own deck**: a raised road, a bridge or
  an overpass previews climbing its ramps and standing at the height it will
  be built at, frame and all, rather than lying flat on the ground under
  where it will go ([overpasses.md](../../world-sim/overpasses.md)).
- **Cursor chips**: a small DOM chip stack follows the pointer (see
  [`interaction.md`](../interaction.md) for what it shows).
- **Zoning grid visualization**: while a zone tool is active, every
  zonable cell along a road renders as a faint translucent grid square —
  the classic zoning grid — tinted green where the hovered brush will
  paint. It is fed from grid data as an instanced layer and disappears the
  moment the tool goes inactive. Over painted low-density, row-housing,
  medium-density, commercial (low or high), high-density or mixed-use land it
  also draws the **plat**: an amber outline round every lot the block
  will cut into (industrial and farm grids show none), by the same rule the spawner grows by, so the player sees the lots before a
  house stands on any of them; a standing house is its own lot and keeps no
  outline. With a building ploppable in hand — a service, transport, utility
  or park building — the same grid, the painted tint and the plats of every
  platted zone show together, so the player sees the lots a station or a
  depot would stand on before placing it over them. A bus stop tool, which
  takes no land, shows none of it: its ghost is the sign or shelter on the
  footway of the street tile under the pointer, on the pointer's side.
- **Selection highlight**: a selected building gets a green edge outline
  plus a floating map-pin sprite above its roof for as long as its info
  panel stays open.

