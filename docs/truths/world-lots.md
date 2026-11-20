# Truths — World: lots and parcels

Back to [the index](../GROUND-TRUTHS.md).

- [R-world-037] A detached house is platted on the lot the land warrants and stays on it:
  the land value at the tile picks half (under 64, 1×1), normal (64–159,
  1×2), double (160–223, 2×2) or acre (224 and over, 3×3, with the 2×3
  estate where only two tiles of frontage are free), or the next
  smaller lot that fits, never a larger one than the land warrants. The three
  levels of a lot share its footprint, a level-up looks up the same zone,
  kind and lot and footprint, and no building ever grows its lot. A house
  body is 9.5 m across the front whatever its lot. A duplex and a fourplex
  stand on one parcel of the plat too, a half or a normal lot (upright or
  turned) with the footprint the parcel has, never on a double or an estate
  parcel, and a level-up never changes their lot; the homes and residents of
  a plex do not change with the lot. A kind takes whole parcels of the plat,
  all fronting one street and tiling its footprint exactly, never half of
  one: a multiplex or a courtyard block (lot normal, 2×2 at every level)
  assembles two normal parcels side by side. Medium density plats normal
  lots at every standing, and a strip too shallow for one plats nothing,
  never a half lot. Row housing plats normal lots at every standing, like
  medium density, and a townhouse row takes one normal parcel at every level
  (1×2, or 2×1 turned) and holds three homes at every level: the level adds
  storeys, never homes or length. The
  zone lens draws the plat only for the zones whose kinds stand on it: low
  density, row housing, medium density, low and high commercial, high density
  and mixed use (`PLATTED_ZONES`); industrial and farm zones are never
  platted. —
  [lots-and-land.md](../specs/lots-and-land.md);
  `lotForStanding`, `platCandidates`, `warrantedLot`, `lotsOfZone`,
  `PLATTED_ZONES` in `src/shared/lots.ts`, `takesWholeParcels`, `platReaches`
  in `src/world/plat.ts`, `tryLevelUp` in `src/sim/growth.ts`

- [R-world-038] A level-up never changes a building's kind; the one change of kind is a
  teardown. A detached house on a half or normal lot whose tile's land value
  is at the estate band (224 and over) converts, with a chance that makes 2%
  a year, into a level-1 duplex or fourplex of the same zone on the same lot
  and footprint, drawn by share, with spare supply for what it adds. It
  never crosses its zone, never grows its lot, and no other kind converts. —
  [lots-and-land.md](../specs/lots-and-land.md#a-small-house-on-prime-land-becomes-a-plex);
  `tryConvert` in `src/sim/growth.ts`

- [R-world-039] A lot forms from its street: the tiles along a street that front the same
  side are cut a frontage at a time, from one end, into parcels, and a
  detached house grows only on the tile a parcel starts on, with its frontage
  along the street (a turned twin on a street running north to south), never
  behind another house. The plat is derived from the zone, the streets, the
  buildings and the land value and stored nowhere; a building standing is a
  parcel the cut steps over and never moves. Round a bend each arm fronts its
  own side, and a cul-de-sac is cut down its two sides, never across its end.
  The whole plat is cut once, run by run in map order, and no two parcels
  ever share a tile: a run cut later steps over what an earlier one claimed.
  The zone lens draws that same plat — the one function, over the render
  mirror and the land value asked of the worker — so the lines the player
  sees are exactly the lots that will grow. A ploppable in hand — any
  service, transport, utility or park building — shows the same zoning grid,
  the painted tint and the plat of every platted zone at once, so nothing is
  ever placed over painted land unseen. The plat is re-cut every growth
  pass and never stored, and it re-cuts only empty ground: a built parcel
  never moves when the land value rises or falls, and painting a zone never
  changes a built tile, so a rezone leaves the standing houses on the lots
  they grew on and replats only the gaps. The inspector's lot line reads the
  catalog entry's lot and footprint, at 400 m² a tile, and a building with
  no lot shows no row. —
  [lots-and-land.md](../specs/lots-and-land.md#the-plat-is-cut-from-the-street);
  `platOf`, `parcelsAnchoredAt` in `src/world/plat.ts`, `setParcels` in
  `src/render/zonegrid.ts`, `cmdPaintZone` in `src/sim/worker.entry.ts`,
  `lotLine` in `src/ui/format.ts`

- [R-world-040] Beside a free-form street a parcel has a frame: a north-fronting grid lot
  moved to the kerb and turned to the road's heading, its front line on the
  right-of-way edge. A building on it carries `frame` and rotation 0, its
  `x, z` the min tile of the tiles whose centres lie in its rectangle; those
  tiles are its footprint for placing, bulldozing, flattening and every
  tile-keyed reader, and claiming by centre is what lets two parcels stand
  end to end at any angle without sharing a tile. Every renderer composes a
  framed building through the one frame transform, never its own centre and
  quarter turn; a grid lot's frame is the identity, and the south and west
  grid layouts stay the mirrors they always were. A building with no frame
  is a grid building and nothing about it changes. —
  [curved-parcels.md](../specs/curved-parcels.md),
  [engineering/features/curved-parcels.md](../specs/curved-parcels.md);
  `src/shared/lotframe.ts`, `platAlongKerbs` in `src/world/plat.ts`,
  `edgeFrameOfParcel` in `src/render/frontage.ts`

- [R-world-041] A building ploppable in hand shows the zoning grid, the painted tint and
  the plat of every platted zone, so nothing is placed over painted land
  unseen; a bus stop tool, which takes no land, shows none of it. —
  [hud.md](../ux/hud/README.md); `rebuildPlat` in `src/main.ts`

- [R-world-042] A commercial or dense building (a catalog entry with no `lot`) takes whole
  lots along its frontage and never half of one: every lot it touches fronts
  the same street, lies wholly within its width and starts at its front edge;
  where it is shallower than its lots the rest is its yard, and where it is
  deeper it runs into the unparcelled ground behind. Low commercial (3), high
  commercial (4), high density (2) and mixed use (8) are cut into normal lots
  at every standing, low commercial falling back to a half lot on a strip one
  tile deep. On a street running north to south these buildings stand at
  rotation 1, a quarter turn, since the catalog has no turned twins for them.
  Every frontage kind is weighed at the same street-row tile on every side
  of a street, never from the building's back corner, so a south- or
  east-fronting block grows corner shops as a north one does. A level-up
  that keeps its footprint improves in place; one that grows its footprint
  is a redevelopment that keeps its street edge fixed and must take whole
  lots by the same rule, only where they are free, the old building's ground
  counting as part of them, and it never happens where a neighbour stands.
  Along its street it may grow toward either side, its own corner tried
  first. A kind's first level stands on the smallest site that kind is built
  on: mid-rise and shopfront flats start on one normal lot. —
  [lots-and-land.md](../specs/lots-and-land.md#commercial-and-dense-land-is-cut-into-frontage-lots),
  [a block starts on one lot](../specs/lots-and-land.md#a-block-starts-on-one-lot);
  `takesFrontageLots` in `src/world/plat.ts`, `tryLevelUp` in
  `src/sim/growth.ts`

- [R-world-064] The zoned ground behind a low-density home's lot, joined to its rear
  line up to the zoning depth, that holds no building and that no parcel of
  the plat covers, is that home's yard, and no one else's: a tile two homes
  could claim goes to the one whose street is nearer, then to the first in
  map order. The yard is derived with the plat and stored nowhere; it gives
  up a tile the plat later claims. It changes nothing a lot is counted by:
  not its area, its home, its residents, its road, power or water, and
  growth never reads it. It carries lawn, the lot's fence and trees, and no
  amenity: a patio, a pool and play equipment stay on the lot. —
  [lots-and-land.md](../specs/lots-and-land.md#the-plat-is-cut-from-the-street);
  `yardRowsBehind` in `src/world/yard.ts`, `detachedYard` in
  `src/render/houselot.ts`
