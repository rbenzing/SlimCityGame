# Transit lanes are a variant of a size, not a road type

A bus lane, a bike lane and a tramway are not separate kinds of road. They are
things a road of a given size can be given, and the profile composition
(`ProfileEdits`) is where they live — `bike` and `parking` at the kerb, `bus`
as a running lane, and `tram` as either mixed running or a reservation. The
presets that used to stand alone read back as exactly that: the bike road is a
small street with a bike lane each side, the tram road is a small street with
its rails in the traffic lanes, and the bus road is a four-lane street with its
outer two lanes reserved.

**Where a reserved lane goes depends on what the road is for.** A street's bus
lane is kerbside, because that is where the stops are and where a bus pulls in.
A motorway has no stops to pull in at, and a kerbside reservation there would
cut across every slip road — so a motorway's reserved lane is the INNER one,
which is where every HOV and express lane runs. A tramway is the player's
choice: rails in the running lane, where the trams share it with the traffic,
or a reservation of two tracks down the middle, which goes up onto an elevated
guideway.

**A reserved bus lane always costs a general lane**, because the tile says so.
Six running lanes and two footways do not fit 20 m. So the width budget above
is what decides every combination, and the trade is the player's to make by
choosing the lane count — lanes are never dropped silently to make something
fit. The measured consequence is that the interesting variation is smaller
than it looks: a bus lane produces one cross-section on a street whatever size
it started from, since the bus lanes plus the general lanes it leaves is four
running lanes either way. Only the bike lane genuinely varies with size, since
it is an edge strip rather than a running lane.

**A tram reservation costs a median, not a lane.** Its tracks run on two
beams over the road ([streets.md](../../art/streets/README.md)), so what the
reservation takes at grade is the column line: its two `tram` pieces are
1.2 m each, a 2.4 m median, and the road keeps its general lanes. Nothing
drives on that median, so `laneCount` does not count it, and a reservation
counts against no lane range. A reservation saved at the old 3.5 m width keeps
it, as every saved piece keeps its width. A guideway track is priced at 2.25
times a street track (`GUIDEWAY_COST_RATIO`), elevated light rail's cost over
at-grade
([tramways spec](../../specs/tramways.md)); its upkeep is a
street track's.

Mixed running is a flag on the lanes the road already has, so it changes no
widths; every other variant rearranges the core, and rearranging re-sizes the
lanes to the class default, which is how a median or a reservation finds the
room it needs.

**A tram lane is track, whatever road it is composed onto.** The tram graph is
built from the profile each tile carries, not from its tier: any street whose
cross-section carries a tram lane — a lane flagged for mixed running or a
reservation's `tram` piece — is tram track (`isTramTrack` in
`src/shared/roadprofile.ts`), so a tram line can be drawn on it and a tram
depot touching it fields it, exactly as on the Tramway preset
([transit-model.md](../transit-model.md)).

**A reserved lane counts against the class's lane range**, which is the second
gate and the one that decides what a SMALL street may carry. A local street is
built for two or three lanes, so it takes a bus lane on one side and is refused
two — two reserved plus two general is a four-lane road, which is a different
class of street, and the refusal says so rather than laying it anyway. The rule
is not asserted anywhere; it falls out of the lane range the class is built
to. A tram reservation is not a lane, so it is offered on every street class
that takes a tram, the local street included.

**A road's tier is its SIZE, and the reserved lane is priced on top.** Giving a
street a bus lane does not turn it into some other road that also has one: a
four-lane street with a bus lane and a two-lane street with a bus lane are still
a four-lane street and a two-lane street, and each is named, priced and ranked
as what it is. What the lane adds is a price per tile, an upkeep per tile, and
its own unlock milestone — a city cannot lay tram track before it could have
laid a tramway.

Those figures are DERIVED rather than chosen. Each is the difference between
the road that used to stand alone and the ordinary road of its own class,
divided by the reserved lanes it carried: the bike road was a local street with
a bike lane each side, the bus road an arterial with a bus lane each side, the
tram road an urban street running rails in both its lanes. So composing what
one of those roads was costs exactly what that road cost, which is checked
against all three. A preset is still priced as itself, so a city built before
is worth what it was.

Speed and capacity never came from the tier — they are read from the
cross-section — so a reserved lane has always carried its own traffic figures.
Rank is likewise the class plus whether a reserved lane is present, which is
why a transit street still outranks the plain street it is a variant of.

**The composer holds to the same table the tool reads.** A class admits a list
of lane pieces, and a piece outside that list is clamped away when the profile
is composed rather than built and then refused — otherwise the Profile row
offers a road the game will not lay, and no amount of dialling gets the player
out of it. So the variants a size is offered are exactly the variants it can
be laid as, and the only refusals left are the two a player can act on: too
wide for the tile, or more lanes than the class runs. The Profile row asks
`layRefusal` of every choice before it is picked, and a choice that would be
refused is disabled with that reason, so no sequence of clicks composes a
road the tool will not lay.

