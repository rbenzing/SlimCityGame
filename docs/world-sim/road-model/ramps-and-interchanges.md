# Ramps and interchanges

`ramp` is its own class: one or two lanes, one-way, unzonable, at the
highway's own speed range but posted lower, admitting only a travel lane and
a shoulder. It is the ONLY way onto a motorway, which refuses every other
class outright. A ramp touching a highway forms one of two junction kinds,
both uncontrolled two-approach nodes:

- A **merge**, where the ramp joins the flow. The highway grows one extra
  lane on that side — an **auxiliary lane** — that opens from nothing 8
  tiles out to full width against the junction, so a driver coming up the
  ramp has road to get up to speed on before the lane runs out again beyond
  the join.
- A **diverge**, where the ramp leaves. The same auxiliary lane appears
  upstream of the junction instead, for slowing down before the exit.

The auxiliary lane is added and painted automatically wherever the tool
detects a ramp meeting a highway — the player draws the ramp and the
highway grows the lane and paints the gore on its own, so the merge length
costs land and nothing else. The lane's width comes from the verge the tile
has not spent, and then from the hard shoulder on that side, which narrows
to no less than 1.2 m (the motorway's own median-side shoulder, and the 4 ft
a constrained section may narrow an outside shoulder to beside such a lane),
so a walled motorway grows the lane inside its wall; a side whose shoulder
is already at that floor, with no verge to spare, grows none. Only a
motorway grows one: the auxiliary lane is read off the road that carries
it, and a street that meets a ramp grows nothing but its ordinary approach.
A ramp's other end is a **terminal**: an ordinary node on the surface
network, taking an ordinary warranted control and ordinary approach lanes
like any other junction.

### How a ramp meets a motorway: alongside, never head-on

A ramp does not T into a motorway. Nobody joins traffic at motorway speed by
turning ninety degrees into it, and nobody leaves it that way either. A real
slip road comes off the surface road, bends round — the **elbow** — and runs
beside the motorway in the same direction before it merges, and an exit peels
off the same way in reverse. On this grid that is:

- **The ramp joins alongside.** The ramp's tile beside the motorway runs the
  same way as the motorway tile it joins. Which way each runs is its stored
  flow, never its shape.
- **It joins at one tile only.** An on-ramp joins at its END — the ramp tile
  with a ramp arriving into it and none ahead of it along its flow. An
  off-ramp joins at its START — the ramp tile with a ramp ahead and none
  arriving into it. What arrives into a tile is a ramp neighbour whose own
  flow points at it, which is how an elbow tile beside the motorway, flowing
  away from it with a ramp on both sides, is told from a start: it joins
  nothing.
- **Everywhere else beside the motorway it is its own road.** Along the
  parallel stretch a ramp tile and the motorway tile next to it are separate
  roads, exactly as two carriageways side by side are: no mask bit, no graph
  edge, no junction. Traffic changes road only at the join.
- **The tool bends the ramp for the player.** A ramp drawn as an L-path has
  two legs, and which is laid first decides where its elbow lands. The player
  marks the two ends; the road tool tries both leg orders and keeps the one a
  ramp can join by — the elbow beside the motorway, the last leg running
  alongside it. Only when neither order joins does the drag stay refused.
  However long the leg along the motorway, the same two ends give the same
  ramp. The ramp still flows the way it is drawn: dragged from the street it
  is an on-ramp, dragged from the motorway it is an off-ramp, and either way
  its alongside leg has to run with the motorway's traffic — the tool bends a
  ramp, it never turns one round.
- **A head-on ramp is refused, and so is one against the traffic.** A ramp
  that cannot bend — a straight drag into the motorway's side — or one whose
  alongside leg runs against the motorway's traffic is refused with the
  reason, by the road tool and again by the world when the command arrives,
  and the reason says what to do: bend the ramp to run beside the motorway,
  the way it is going, before it meets it. A save that already holds a
  head-on ramp keeps it and draws it as it always did.
- **A ramp's street end is a junction on the street, never a tile of it.** A
  ramp drag ended on a street tile is trimmed to the tile before it, so the
  ramp meets the street at a T and the street keeps its tile; a ramp may not
  replace a street tile, whatever the class rank says, because a one-way
  ramp tile in a two-way street breaks the street in both directions. A
  ramp that would have no tile left to meet the street from is refused with
  the reason.
- **The join tile is a taper, not a corner.** On the ramp side the join tile
  carries the ramp's carriageway straight along its flow and fans its asphalt
  across the verge into the motorway's auxiliary lane on the half of the tile
  nearest the motorway's traffic — downstream at a merge, upstream at a
  diverge — so the ramp slants into the lane rather than turning into it. On
  the motorway side the tile is a ramp node, below, with its edge line open
  across the taper's mouth.
- **Merge or diverge comes from the join.** A join at a ramp's end is a
  merge and its auxiliary lane runs on downstream; a join at its start is a
  diverge and its auxiliary lane runs up to it. The exit board stands on the
  motorway tile before a diverge.

`rampJoin` in `src/shared/corridor.ts` decides how a ramp tile meets the
motorway beside it, and `rampJoinAround` reads it off any map; the grid mask
and graph, the approach walk, the furniture and the road tool's refusal all
ask it. `rampMouthAt` tells the motorway tile which half to open, and
`emitRampTaper` in `src/render/roadsmesh.ts` draws the ramp's side.

A whole interchange can be laid at once: a diamond, a partial cloverleaf or a
full cloverleaf, stamped onto a motorway already there
([interchanges](../../specs/interchanges.md)). It lays nothing
these rules would not: ordinary ramps that obey them, and a street carried
over the motorway as any overpass is.

**A merge or a diverge is not an intersection**, whatever its arm count, and
highways rarely have intersections at all. Nobody stops at one, nobody gives
way, and nobody picks a lane at it: a driver leaving is already in the
auxiliary lane before it, and a driver joining gets up to speed in the one
after it. So the motorway tile a ramp meets — a **ramp node**: its own
carriageway running straight through, and nothing beside it but ramps — is
drawn as the straight carriageway it is. Its lane lines and its left edge
line run through unbroken; it grows no junction box and no rounded corners;
its ramp-side edge line opens across the ramp's mouth and nowhere else; the
ramp's asphalt is as wide as the ramp; and the auxiliary lane is at full
width over the half of the tile the ramp joins over, instead of stopping short
of it. Over the other half, the tile bends to meet the plain motorway the way
a straight run meets a narrower one. That is past the ramp at a diverge,
where the lane has been left, and before it at a merge, where the lane has
not yet begun. Drawn at full width across the whole tile, as a square box,
the node stepped out at both ends, on the far side too. Nothing approaching
it is a junction approach, so nothing is arrowed on the way in — not the
motorway, and not the ramp's own last tile. A motorway meeting a motorway,
or one that turns or ends where a ramp meets it, is not a ramp node.

It takes no control, as nothing touching a motorway does, and a player's
override cannot put one there: setting a signal, stop or give-way on a
junction a motorway touches is refused, the same rule the warrant applies.
Its exit board stands once, on the motorway tile before a ramp that leaves —
a ramp alongside that diverges there, or a head-on ramp a save holds that
points away — and never after it or where a ramp joins. `isRampNode` in `src/shared/junction.ts` decides it,
and the render, the approach walk and the furniture all ask it.

Nobody is stopped joining a highway and nothing holds them, but finding a
gap in fast traffic is not free: a merging driver loses `2 + 22·x³` seconds,
where `x` is the volume-to-capacity ratio of the highway lane they are
joining — small on an empty road, and the queue up the ramp every motorway
gets at rush hour once the road they are joining is close to saturated.
Only the traffic coming up the ramp pays this; a driver already on the
highway pays nothing, and leaving costs nothing here (whatever a diverge
costs is paid at the ramp's terminal further down).

Interchange **templates** — a diamond, a trumpet, a parclo, a roundabout
interchange, a cloverleaf — are not implemented as placeable stamps yet.
Everything they would be built from (the ramp class, merge/diverge
detection, the auxiliary lane, ordinary terminal junctions) already exists
and works when laid tile by tile; only the one-click, ghosted, rotatable
template is missing. See [../DESIGN.md](../../DESIGN.md) for the backlog.

