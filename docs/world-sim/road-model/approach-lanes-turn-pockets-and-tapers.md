# Approach lanes, turn pockets and tapers

For each approach of a node, the last few tiles of the profile are its
**approach zone** — the AASHTO storage length: 1 tile on dirt or alley, 2 on
rural, local, one-way or a ramp, 3 on urban or collector, 4 on arterial, 5
on divided or a highway. Inside that zone every travel lane carries a
movement set — left, through, right, and U-turn (never offered by default) —
packed as a nibble per lane, up to four lanes of one arm. The default set
is derived from the lane count: one lane does everything; two share the
turns with through; three earn a dedicated left; four or more earn a
dedicated right as well, with everything between running through. A player
edits any lane's set from the junction inspector, which always shows the
derived default as the baseline a lane reads until it is touched. What is
stored narrows only what the arm's own restriction already allows — a lane
can narrow the arm, never override it, and a lane is never left with
nothing.

Before any of that, the arm's set is narrowed by **the legs the junction
actually has**. A turn is a movement onto another road, so where there is no
road there is no turn: the arm of a tee has open ground on one side of it and
offers no turn that way however little anybody has restricted it, and the stem
of one cannot go through at all. A one-way leg running AT the junction is the
same case — a road there, but not one a driver may take. This is geometry
rather than restriction: nothing is stored, `armIsRestricted` still reads
false, and the arm goes back to offering the turn the moment a leg is laid.
Both the arrows and the pocket warrant read the narrowed set, and so does the
router's delay model, so the queue it prices and the lanes the road lays are
the same lanes.

A **turn pocket** is what an approach gains for that zone when the
junction's control actually holds THAT ARM and the arm both goes through and
turns left. Holding the arm is the condition the control alone cannot express:
a signal and an all-way stop hold everybody, but a minor-road stop or a
give-way holds only the arms below the top rank, and the road running through
is not stopped by it. A street with an alley stopping at it therefore gains
nothing — it has no queue to take a turning driver out of, and a storage bay
for a turn nobody waits to make is just a wider road. Neither does the ALLEY,
on its own side: a service access stores nothing, and a bay would double the
width of a single lane for a queue one van long. (The class is what rules that
out. The legs rule above already takes the pocket off any arm of a tee, since
one that cannot go through has no through traffic to take a turn out of — but
an alley crossing a street has all four legs and still stores nothing.) The
pocket is
the lane beside the centreline, carved from whatever the width budget has
spare, in this order — the verge the profile has not spent, the kerbside
parking lane or the shared median, and only as a last resort the through
lanes themselves narrowed to as little as 10 ft (3.05 m, the US minimum for
a constrained retrofit). A pocket that cannot find at least that width is
not built. A road that already carries a two-way centre turn lane needs no
pocket — it already turns from a lane of its own everywhere. The pocket
does not snap in at full width: it opens over a taper the same length as an
ordinary lane-drop taper for the class, full width only against the
junction itself, so the width the road gives up (parking, verge) shrinks
gracefully rather than vanishing at a line. On a partly open tile the road
gives up only what the opened bay needs beyond its spare width — first the
verge, then as much of the parking as the bay has reached, then the through
lanes in proportion — so the carriageway is never narrower than the plain
road's anywhere along the bay, and a road never narrows toward its junction.
Whether the road can have a bay at all, and what it gives up against the
junction, is decided by the full bay, so a partly open tile is never the one
that refuses. A parking lane narrowed below its own width is the taper's kerb
strip: it carries no stalls, no parked cars and no meters.

**A short block takes a shared turn lane instead of two bays.** A pocket
belongs to ONE HALF of the road — it is the lane beside the centreline on the
approaching side — so a stretch with a junction at each end would carry one
bay on one side and the other bay on the other, tapering down and back up in
between: a road that widens, narrows, and widens again on the opposite side
over a couple of hundred metres. Where the two junctions are within
`SHARED_TURN_LANE_MAX_TILES` (8 tiles, 160 m) of each other, and BOTH of them
would give the road a bay, the whole block carries a **two-way left-turn
lane** instead — one lane at the centreline that
traffic turns from in either direction. It serves both junctions, is the same
width the whole way, and is symmetrical, so nothing swaps sides and there is
no taper at either end. It is the same lane a player can put down the middle
of a road from the profile editor, and it carries no through capacity, so the
road's capacity is unchanged.

The lane stands in for two bays, so it is laid only where both would really be
built: each junction's control has to hold this road, and the road has to be
able to go through and turn left there. A two-lane street running through
junctions its side streets give way at — or that nothing controls — earns no
bay at either end and carries no centre lane; the same street stopping for
bigger roads at both ends does.

Whether a tile is in such a block is a question about the RUN rather than
about an approach, and is asked separately: the tile halfway along belongs to
neither junction more than the other, and the approach walk rightly declines
to say which one it approaches — but it still has to be the same road as its
neighbours.

The width comes from the verge the profile has not spent, and then, as a last
resort, from the through lanes themselves — every one of them, each giving up
the same share of what it has to spare, down to the same 10 ft floor a bay
uses. That is the difference that matters: a BAY can only ask the half of the
road it belongs to, so a four-lane street has no room for one; a lane shared
both ways asks all four, and there is room. A four-lane street between two
close junctions therefore carries a turn lane where it could carry no bay at
all. Reserved lanes are never asked — a bus lane narrowed is a bus lane that
no longer fits a bus — so a road whose spare width is all in its bus lanes
gets nothing rather than a lane too narrow to wait in.

A road that cannot take the lane keeps whatever it had: a one-way has no
opposing traffic to share it with, a road with a median or a turn lane already
has its middle spoken for, and the lane is for streets that meet at grade —
never a motorway or its slip roads, which have no at-grade turn to store, and
never an unpaved track or a service alley, which carry no paint at all.

Turn **restrictions** (no left, no right, no straight, no U) are the same
mechanism in the degenerate case: a movement removed from every lane of an
arm rather than left on some. Turn arrows are painted from the resolved
movement set and nothing else, so a lane with no arrow is not a legal path
to that leg — the router treats a movement no lane offers as a banned turn.

**Tapers** govern a lane drop along one road, where a wider stretch of it runs
on as a narrower one: the extra width closes over a length set by the class's
own standard ratio, not by taste — 1:10 on dirt or alley, 1:12 on rural, 1:15
on every ordinary street class (local through arterial), 1:30 on a divided
road, 1:50 on a highway or a ramp. A 3.5 m lane closing at 1:50 takes 175 m,
about 10 tiles; at 1:10–1:15 it takes 35–50 m, about 3 tiles.

**A road tapers only into more of itself.** A lane reduction is made away
from an intersection (MUTCD 2023 §3B.12 ¶01), so a road keeps its full width
up to the mouth of any junction it meets, however much narrower the road it
crosses is: the walk that finds a taper stops at a junction tile, or at a
road held apart, and never takes the crossing road's width for its own. A
merge or a diverge is not a junction (below), so a motorway still tapers
through one exactly as before.

**The pieces that end close, and the pieces that carry on keep their
width.** A parking lane or a bike lane the narrower road does not carry
closes itself over the taper, on its own side, and the travel lanes beside
it are not touched; a parking lane ending needs no lane-reduction taper of
its own (§3B.12 ¶06), so it simply narrows away with the kerb. What is left
of the width difference is travel lanes: the outermost travel lane on each
side closes first, taking the wider side of an uneven road down to an even
one, and then the two directions close together, so the centre line runs
straight down the taper. A road whose lanes all run one way closes the
driver's right-hand lane first. A lane drop never squeezes the lanes that
remain, and footways and reserved transit lanes survive it untouched.

**The paint follows the pavement.** Each tile of a taper bends its edge from
its own width to the next tile's over its length, and every line and every
coloured lane on it bends the same way — the edge line, the lane lines, the
bike lane's green, a bus lane's terracotta and a parking lane's line and stall
marks — so nothing steps at a seam and nothing lies off the pavement.

A taper begins at full width, never part-closed: where the wide
road is shorter than its own taper, as a four-lane stub of three tiles between
a junction and a two-lane street is, the lanes close over the length the stub
has, steeper than the ratio. Started part-closed, the stub leaves the junction
already narrower than the junction box, and its kerb steps there. The lane
that closes carries its merge arrow at the head of the taper, placed in the
lane as wide as it is at that point. Placed further along, the taper has
narrowed the lane to less than the arrow. On a
motorway or a divided road the lane closes by paint alone — the tarmac runs
on at full width and the edge line moves inward, hatched into a gore, so a
driver who misses the merge still has pavement to recover on; on a street the
pavement narrows with the paint.

