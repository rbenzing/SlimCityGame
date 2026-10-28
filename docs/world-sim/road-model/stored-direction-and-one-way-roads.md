# Stored direction and one-way roads

Every road tile carries a flow byte: three bits for the cardinal the drag
ran in (north/east/south/west, or "never recorded" for a tile drawn before
direction was stored), one bit marking a corridor half, and one bit for
which half. A one-way road's direction is no longer inferred from tile
geometry — it is exactly what was drawn, flippable by the replace tool.
This is also what makes an asymmetric profile meaningful: a three-lane
street as 2+1, a five-lane one-way corridor as 3+2 — "2+1" means nothing
until the tile knows which way is which.

A tile holds one flow, so where two one-way streets cross, the crossing tile
keeps the flow of whichever was drawn through it last. The graph therefore
reads a run's direction from the run's own tiles and falls back to its end
nodes only when it has none, ignoring a flow that runs across the run.

**A section is authored in the direction of travel and laid in world order.**
Its pieces are listed left to right as its driver sees them. Offsets across a
road grow east and south, so heading north or east the driver's left is the
low offset and the list is already in world order; heading south or west
their left is the high offset, and the section is turned round before it is
drawn (`worldOrderedProfile` in `src/shared/roadprofile.ts`). It is turned
round BEFORE a corridor is halved, because a corridor's halves are stored by
the side of the road they stand on — the low tile and the high tile — so it is
the world-ordered road that is cut in two, and a corridor's median stays
between its tiles whichever way it was drawn. Every piece keeps its own flow,
so `fwd` still means the way the road was drawn, wherever it now lies.

Everything that draws a road reads the section low-to-high, so it inherits
the right layout from that one turn. The two editors that work by the
driver's own left or right ask which way round the section is instead: a
one-way road's turn bay goes outside its left-hand lane, and a lane drop
closes the right-hand lane first (`reversedInWorld`). Without the turn, a
southbound motorway kept its yellow edge on the left but put its wide
shoulder against the median, and a two-way street drawn south put its
southbound lanes on the driver's left.

The graph edge built from this carries lanes-per-direction rather than one
tier-wide number, and its capacity is split by direction share rather than
by half: a lane count of 2 one way and 1 the other gives the wider
direction 4/3 of an even split and the narrower 2/3, so the narrow side
congests first while the whole edge's nominal capacity is unchanged.

**A direction with no lane is not a road.** The router drives a run only in a
direction its cross-section has a travel lane for. A one-way street, a
motorway carriageway and a ramp are all driven one way, as is either half of
a corridor and any composed profile whose travel lanes all run the same way.
A run whose tiles never recorded a flow cannot say which way that is, so it
is gated by its road type instead: a type `roads.json` marks `oneWay` is
driven the way the geometric fallback reads, and every other type both ways.
So a single motorway line carries traffic one way only, as a real carriageway
does, and the other direction takes whatever roads it can until the second
carriageway is drawn beside it.

