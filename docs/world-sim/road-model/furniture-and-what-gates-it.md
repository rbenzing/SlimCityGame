# Furniture and what gates it

Furniture reads mostly from the profile's own lane pieces rather than from
a fixed tier list: a sidewalk piece is what a footway is, a median piece is
what a raised or planted centre is, a bike/bus/tram piece is what that
reserved lane is, and every marking that depends on one of them (bike-lane
fill, bus-lane fill, dashed-versus-double centre, edge lines) reads the
piece directly, so a composed profile gets the correct furniture with no
per-class special case.

**Lamps** have not yet migrated off the road's tier: they are placed on
every tier except gravel and rail, not on a piece toggle. **Kerbside
parking** reads both. A kerb beside the profile's own parking piece takes
cars at any hour, overnight included, whatever the tier; a kerb with no
parking piece beside it takes only short daytime stays, and only on a tier
whose catalog entry sets the per-tier flag (the two-lane road, the gravel
road, the alley and the one-way road); everything else takes none. No
preset paints a parking lane, so on the presets the flag alone decides, and
only by day. Wherever a kerb takes cars, none stands inside a junction's
no-parking zone (see [Markings](markings.md)): the same measurement keeps the
stall marks and the cars out of it.

A junction places its own furniture by control rather than by tier: the
road ranked highest at a node runs through with no stop marking; every arm
below it gets a stop bar, and a ladder crosswalk wherever the road has a
footway (a road with no footway paints no crossing, since there is nobody
on foot to cross, and its kerb still sweeps round at the corner radius with
grass filling what would be the footway). Crosswalk presence at a junction
is derived this way from footway presence and rank; it is not (yet) an
independent per-approach toggle a player sets from the junction inspector.

A crossing is as DEEP as the footway it carries across the road, never less
than the 1.8 m a marked crossing may be (MUTCD 3C.03 ¶05), and it lies AGAINST THE
KERB LINE, which is where that footway runs. It is not as deep as the strip of
tile the footway sits in: the strip is the room available and runs opposite to
the road, leaving 6.25 m beside a two-lane street and 1.90 m beside an avenue —
so reading the room as the figure gave the quiet street a crossing 20 ft deep
and the busy one a normal 6 ft. Nor is it anchored at the tile edge, the outer
end of that strip, which leaves it floating with 4.4 m of road between it and
the kerb it is supposed to meet. Its bars are 0.45 m wide at 0.6 m spacing,
inside the 12–24 in bar and 12–60 in gap the standard allows.

No crossing is painted over a **service access**. The footway runs straight
across an alley's mouth rather than breaking for it, so the pavement IS the way
across; bars laid in that strip sit underneath it where nobody can see them.

**A manhole cover is the top of a sewer, so it exists only where a sewer
does.** A cover is drawn on the running surface of a road whose class carries
water, and on no other. A motorway and a ramp carry none — they drain off the
shoulder to the verge rather than to a buried line under the carriageway — so
a cover on one is a hole in a road with nothing beneath it, which is both
wrong and, at motorway speed, conspicuous. The test is the class's own water
flag rather than a list of tiers, so a class that stops carrying water stops
growing covers in the same change.

**A corridor is furnished as the road it is.** Its other half lies beside each
half along the whole run but is not an arm of it, so the furniture asks the
same question the mask and the approach walk ask (`isSeparateRoad` in
`src/shared/approachzone.ts`). Counted as an arm, it made every tile of the
road a crossing, and no corridor carried a lamp, a board or a signal head.

- **The shared edge stays bare.** Nothing kerbside stands on the edge the two
  halves share: lamps, boards, cabinets and meters take the outer kerb,
  measured from where the carriageway is. On a corridor nothing divides, that
  is pushed against the shared edge.
- **Lamps** stand only on a kerb with no road beside it. A lamp tile is
  chosen by its x + z, so the two halves are lit one tile apart, each from its
  own outer kerb.
- **Manhole covers.** A sewer runs under the middle of the street it serves.
  On a corridor nothing divides, the middle is the shared edge, so the covers
  lie there, laid by the half at the lower coordinate so the road carries one
  line of them. A divided corridor has a median there and carries none, like
  any road with a median.
- **Control boards.** A stop or give-way board and a signal head stand on an
  approach only where traffic arrives at the junction, the lanes a stop line
  is painted across. On a corridor that is the half whose lanes run toward
  the junction, and the board is on its driver's right, which is the outer
  kerb. The half running away from the junction carries none, and nor does a
  one-way street leaving one. The junction an approach tile serves, and who
  gives way there, are read from the roads that join it, never from a
  corridor half beside it.

A deck (an elevated or bridged road tile,
[Bridges and elevated roads](bridges-and-elevated-roads.md)) inverts the
kerbside rules: no verge, so no parking meters, utility cabinets, manhole
covers, verge grass or street trees. What survives is what the road still
needs to be driven — lamps, and the boards or signal that govern right of
way where a junction lands on the deck, plus a motorway's exit boards and
gantries, whose signage is overhead because nobody is walking beside it.

See [../art/README.md](../../art/README.md) for what every piece of furniture
actually looks like.

