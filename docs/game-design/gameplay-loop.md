# The core loop

What the player actually does, minute to minute, and what the game does
back. The full rules behind each step — the exact demand formulas, the
spawner, levels and abandonment — are in
[simulation-rules.md](simulation-rules.md); this document is the shape of
the loop itself.

## Roads are the skeleton

Everything needs road access, so the loop always starts with a road. Laying
one does two things at once: it extends the buildable grid a zone brush can
paint against, and it extends the network power and water travel along.
Draw a road out into open land and a band of zonable tiles appears
alongside it before anything else happens — the game is telling the player
where a lot could go, not yet whether one will.

## Paint zones, don't place houses

The player marks land residential, commercial, or industrial with a zone
brush; they never place an individual building. What fills a zone in, and
how fast, is decided by demand — the three RCI bars the player watches
while they zone. A zone with no demand behind it just sits empty; painting
more of an oversupplied sector wastes the brush stroke, not the player's
money, since zoning itself is free.

## Power and water flow through roads

A zoned tile only develops once it is served: a generator and a water
source, each placed against the road network, carry power and piped water
along every connected road and out one further step onto the buildings
beside it. Forgetting to connect a utility — or losing the connection to a
brownout — is the most common reason a zoned area refuses to grow, which is
why the loop treats "is this lot served" as a first-class question the
player has to answer before anything else.

## Watch it grow, then read it

Once a tile is zoned, served, and within reach of a street, the spawner can
place a building on it; growth happens on the simulation's own clock, not
on a click. A spawned building spends time under construction, becomes
Active, and from there can level up as land value and (for housing)
education rise around it, or abandon if it loses power, water, or road
access for too long. None of this is invisible: the infoview lenses and the
stats panel exist so the player can read _why_ a lot grew, stalled, or
emptied out, rather than only see that it did.

## Milestones pace the unlocks

Growth is measured in population, and crossing a milestone is what unlocks
denser zones, bigger roads, and more services — the game hands the player
new tools only once the city has grown into needing them, rather than
gating on playtime. See [progression.md](progression.md) for the milestone
table and what each one unlocks, and [economy.md](economy.md) for the
monthly money cycle that runs alongside all of this, independent of it.

## The loop repeats, wider

Nothing above is a one-time setup: the same five moves — road, zone,
utility, watch, milestone — repeat at the map's growing edge for the whole
of a session, at whatever speed the player sets the clock to. Districts and
policies (also in [progression.md](progression.md)) let a player start
tuning a sub-area differently once the loop has run long enough to need it,
without changing how the loop runs anywhere else.
