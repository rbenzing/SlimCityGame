# Frontage and zonability

One predicate decides whether a tile can be zoned at all, and both the
visual zoning grid and the zone-paint command defer to it — they can never
disagree about what is zonable.

A road tile's frontage is the sides a lot could front onto, derived from
its own orthogonal road neighbours:

- A straight run, a turn, or a junction fronts every side that is not
  itself connected to another road tile (a straight run fronts its two
  parallel sides; a turn or a T fronts each of its open sides; a four-way
  junction fronts none).
- A dangling end — exactly one road neighbour — fronts only the two sides
  perpendicular to that neighbour, never the open end, so nothing zones
  on, or straight across, the end of a road.
- An isolated road tile with no road neighbour has no run and so no
  frontage.
- Only a drivable street tier provides frontage; rail does not. A bridge
  deck provides none either — there is no way onto a lot from a road
  passing overhead.

From every frontage side, the zonable area marches straight outward, up to
`ZONE_DEPTH` = 3 tiles deep, and stops at the first blocking tile — water,
another road, a building, out of bounds, or a slope past
`MAX_BUILD_SLOPE`. Tiles beyond a block have no direct access from that
frontage and are not zonable, even if they sit within the 3-tile depth. The
zonable set is the union of every road tile's frontage marches.

The depth is the same number as `ROAD_CHECK_RADIUS`, the distance a lot may
stand from its street, and it is three because that is the deepest lot the
catalogue holds: a lot grows only when the utilities reach a tile of it, and
they reach one tile off the road, so every lot's first row touches the row
beside the street and a 3×3 house or a 2×3 estate reaches exactly to the
depth. A fourth row was land the brush painted and nothing could ever grow
on — in one grown town, a third of everything zoned — and the second tier of
lots behind the first belongs to the street behind the block, as it does in
a real subdivision, never to a deeper march from the same street.

**Farmland** is the same march with two differences, and the same one
predicate (`zonableMaskFor`) decides it for the grid and for painting:

- Only a **dirt road** fronts it. A farm's gate opens onto a dirt road and
  nothing else, so no paved street, lane or motorway fronts farmland — though
  a field may run right up to one, since a road is where the march stops.
- It runs `FARM_DEPTH` = 8 tiles deep, since fields lie further back from
  their road than a house lot does, and it marks only tiles whose
  [soil](../../world-sim/world-model.md#soil) can be farmed. Unfit ground is left
  unzoned but does not stop the march: a field runs on past a stony corner,
  and only what blocks any lot stops it.

Painting a zone onto a tile additionally requires the tile to be buildable
and carry no road; painting anything other than a de-zone additionally
requires the tile to be free of a building and inside the
frontage-reachable set above. Clearing a zone is exempt from the frontage
check, so a zone can always be removed, even from a tile a road no longer
reaches. A zone therefore changes only empty land: a building keeps the
zone it grew on for life, and a denser zone painted over a built-up block
takes only the gaps, while the houses stand and level up as the kind they
are. A stroke that falls wholly on buildings changes nothing and is refused
with a reason that says so; the way to densify a built block is the
bulldozer, as it is in a real town. The zoning grid itself is drawn only while a zoning tool is the
active tool.

