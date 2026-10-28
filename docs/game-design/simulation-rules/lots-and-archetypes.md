# Lots and archetypes

A zoned building's mass does not fill its footprint tile: the body is a
size in metres set by its kind — 4.75 m per lot tile for a detached house,
13.6 m per tile for a block, and a fixed share of the lot capped in metres
for a duplex, a fourplex or a multiplex, never more than 85% of the tile on
either axis (see [../art/buildings/residential-kinds/README.md](../../art/buildings/residential-kinds/README.md)) —
so that neighbouring buildings never share a wall. The lot, not the building, claims the rest of
the tile: a lot pad reserves the building's whole footprint, sitting under
the body and surfacing whatever remainder the building implies — paved yard,
parking, or planting. Adjacent lots' pads meet edge to edge with no gap
between them, stopping short of the road at the verge the parking apron
already respects; a home's lawn instead runs across the verge to the
sidewalk, and the house stands at the front of its lot with its drive and
yard laid out from the street (see
[buildings.md](../../art/buildings/residential-lots.md)).

Whether a lot's kerb may be used for parking is decided by two independent
rules that compose. The road decides whether and when its kerb is parkable: a
kerb on the side where the street paints a parking lane takes cars at any
hour; a street whose tier declares kerbside parking in its data but paints
no lane — today the two-lane, gravel, alley and one-way presets — takes only
short daytime stays, never overnight; every other road takes none, since a
through-route, a reserved bus or bike lane, tram rails, or a railway all have
a better use for their edge. The building decides whether it needs the kerb
at all: one with its own bay row, or a home with a drive, does not use it;
apartments do. Utilities, parks, and civic buildings never park at the kerb,
having nobody to park. A kerbside car sits parallel, in the middle of the
parking lane where there is one and otherwise half a car into the
carriageway, with no apron or painted bay of its own, since the road surface
is already there.

Every object that would stand at the kerb — a parked car, a lamp, a sign —
is checked against the tile it would actually occupy, not the building or
road that placed it: is a road there, does that tier allow kerb parking,
and is the tile a junction (excluded, since two crossing carriageways have
no kerb — the offset that clears one lane lands inside the other). Checking
per tile rather than per row means a frontage that runs onto a bend or a
corner still parks the part of itself that is clear.

A driveway tile is excluded from street-lamp placement, even though lamps
are otherwise placed purely from the road side — a lamp placed in a curb
cut would stand where cars drive through it. Driveways belong to buildings,
so the lamp line is rebuilt whenever the building set changes, not only the
road set.

A cosmetic pedestrian anchored on a building's frontage sidewalk walks a
loop stretched along the street and narrow across it, rather than orbiting
its anchor point; which way is "along the street" is read from the road
tile's own neighbours, not the building's facing, so a corner lot still
walks the street it actually fronts.

A catalog entry's category, kind and level select an archetype: a named
assembly of parts drawn from one shared kit (see [../art/README.md](../../art/README.md)
for what those parts are and look like). Two buildings of the same zone at
different levels, or of different archetypes entirely, can therefore look
distinct without any divergent game logic. Parts that hang on a building's
road-facing wall are included only when the building actually fronts a
street; parts that sit on the roof carry no such requirement.

Industrial buildings carry a pollution figure independent of their level or
name, and whether an industrial building's silhouette carries a smokestack
is driven by that same figure, so the skyline and the simulation can never
disagree. The top industrial level, whose pollution figure is zero, has
more jobs than the level below it — a genuine upgrade rather than a reskin.

Every ground surface belonging to a lot — its pad, its parking apron, its
driveway, its painted bays — is built by the same terrain-conforming
ground-surface builder: it samples the real surface at each corner and
splits on the same diagonal the terrain mesh uses, so a paved lot can never
float above a dip or be clipped by a slope beneath it. See
[../world-sim/README.md](../../world-sim/README.md) for how that terrain
surface and its height query are built.
