# Markings

Markings are read off the profile and the junction, never authored
per-tier:

- **Colour** follows one rule, and it is not the obvious one: yellow marks
  the side of the line that oncoming traffic is on, whether or not that
  traffic is adjacent. On an undivided road that is the centre — the dashed
  centre of a two-lane road, the double solid of an undivided multi-lane
  road, both edges of a two-way turn lane, which faces opposing traffic on
  each side. On a **one-way carriageway it is the left edge line**, because
  the far side of that line is where the opposing carriageway is: MUTCD
  §3B.09 ¶03 requires a solid yellow left edge line on the roadways of
  divided highways, on one-way streets, and on any ramp in the direction of
  travel. The right edge line is a solid white line (§3B.09 ¶02), and lane
  lines between same-direction lanes are broken white (§3B.06 ¶05). Every
  paved road carries edge lines; an unpaved track, a service alley and a rail
  line carry no paint at all.

  The shorter rule "yellow separates opposing directions, everything else is
  white" is what this model used to say, and it is wrong for exactly the
  roads where it matters most: a motorway carriageway painted white on both
  sides gives a driver no way to tell the median side from the shoulder side
  at speed, which is the whole reason the standard makes the distinction.

- **Where the edge line goes** is the inside edge of any reserved lane
  running along the kerb — a shoulder, a bike lane, a bus lane — because
  that is where general traffic actually ends. On a road with a shoulder it
  is the line that tells a driver where it is safe to pull over; on one with
  a bus lane it is the line they are not to cross, and the lane's coloured
  fill lies outside it, unbroken. Where the outermost lane is an ordinary
  travel lane the line falls back to a fixed inset from the edge of the
  pavement. That inset is held all the way down a road that is CHANGING
  width, which is a thing the paint and the kerb have to be told the same way:
  the carriageway settles a width difference by bending the wider tile all the
  way in to its narrower neighbour, so a line meeting its opposite number half
  way across the boundary — which is right between two roads of the same width
  — would sit half a step inside a kerb that has already moved, and the gap
  would open and close down every taper. So where one side is narrower, the
  narrower side's offsets are what both tiles paint to.
- **A bike lane lies between two white lines** (MUTCD 2023 §9E.01, §9E.02).
  On the travel side is the solid bike-lane line, at the lane's inside edge.
  On the other side is whatever bounds the lane there: the parking lane line
  where parking lies beyond it, the edge line — at its usual inset from the
  edge of the pavement — where the road has no kerb, and nothing where a kerb
  bounds it. The green is only a supplement to those lines (§3H.06): it fills
  the lane between the lines' inner faces, hugging the outer side where the
  lane is wider than the paint, and never lies under a line, past one, or off
  the pavement. A bike lane on the left of a one-way carriageway keeps its
  white bike-lane line, and the yellow is the left edge line beyond it. The
  same holds on every profile with a kerbside or parking-side bike lane, the
  Bike Lane preset and a composed one alike. The lane, its green and its
  lines run on into the junction up to where the intersection begins for it
  (§9E.02): the crossing over its arm, the stop line across its own lanes, or
  else the point where its kerb starts to turn the corner; its outermost line
  goes on round the corner with the kerb return.
- **A parking lane's travel side is its solid white parking lane line**, and
  no edge line runs inside the lane, where it would lay a second line through
  the cars. Its stall marks are white (§3B.27): ticks from the parking lane
  line toward the kerb, ending inside the lane at least 0.3 m short of the
  edge of the pavement. The stalls follow the 2009 MUTCD's parallel-parking
  layout (Figure 3B-21): an interior stall is 22 ft (6.7 m) long, inside the
  figure's 22–26 ft, and the stall nearest a junction 20 ft (6.1 m). The
  interior stalls are pitched from world metre 0, so they run on unbroken
  across every seam; the end stall is measured from the edge of the
  junction's no-parking zone (from the edge of the junction's tile where the
  zone ends inside it). No marked stall is shorter than 6.1 m or longer than
  7.9 m (26 ft). Where the pitch leaves an odd length beside the end stall,
  the end stall takes it up as far as 7.9 m; beyond that the no-parking zone
  grows instead, so the 6.1 m end stall ends on a pitch tick and the strip
  between it and the zone stays unmarked and empty. Where two zones leave too
  little room for an end stall each, as many legal stalls as fit are marked
  from one zone's edge, and none where not even one fits. The lane's 2.25 m sits inside
  the figure's 8 ft (2.4 m) stall width.
- **An angled or head-in lane marks its stalls at their angle** (§3B.27).
  Each stall line runs from the parking lane line, which stays as the lane's
  travel edge, toward the kerb at the stall's angle and stops at least 0.3 m
  short of the outer edge: at 60° every 3.0 m of kerb on an angled lane, at
  90° every 2.6 m on a head-in one, pitched from world metre 0 like the
  parallel ticks. On an angled lane the kerb end of each line lies upstream
  of its travel end for the traffic in the lane beside it: on a two-way road
  the direction of travel on that side, and on a one-way road the way it was
  drawn, read from its stored flow and never from its shape. A stall is
  marked only where its whole footprint, the slant's length along the kerb
  included, stands clear of the no-parking zones below and the lane is its
  full depth (a turn pocket carved from the lane leaves it shallower).
- **Every block face that marks stalls marks accessible ones**, to the
  count of PROWAG R211: 1 for 1–25 marked stalls, 2 for 26–50, 3 for
  51–75, 4 for 76–100, 5 for 101–150, 6 for 151–200, and 4% (rounded up)
  beyond that. A block face is one kerb's parking along a straight run, from
  one end of its parking lane to the other — a junction or the road's end at
  each. The accessible stalls stand together at the end of the face nearest
  a crosswalk; where neither or both ends have one, at the end that meets a
  junction; where that still ties, at the end with the lower world
  coordinate. A parallel one is 7.3 m (24 ft, R310.2.1) long: the end stall,
  lengthened, still inside the 6.1–7.9 m rule, and where the pitch leaves the
  stall beside it too short the no-parking zone grows instead. An angled one
  is 3.35 m (11 ft) wide across the stall with a 1.5 m (5 ft) access aisle
  (R310.4); a head-in one is 2.6 m wide with a 2.4 m (8 ft) aisle (R310.3).
  The aisle is on the passenger side of the parked car and hatched with
  white diagonal lines, and the stalls after the accessible ones resume on
  the regular pitch. Each accessible stall carries the International Symbol
  of Accessibility, a white wheelchair on a blue square, centred in the
  stall and read from the travel lane (MUTCD 3B.22 ¶08–09). One function
  lays the face — regular stalls, accessible stalls and aisles — and the
  paint and the parked cars both read it.
- **No parking at a junction.** The Uniform Vehicle Code (§11-1003) forbids
  standing within 20 ft (6.1 m) of a crosswalk at an intersection, and within
  30 ft (9.1 m) on the approach to a stop sign or a traffic signal; the 2009
  MUTCD's Figure 3B-21 draws the same two no-parking zones. So no stall is
  marked, and no car stands, within 9.1 m before a stop line on an approach
  a stop or a signal holds; within 6.1 m of a crosswalk; or, where an arm has
  no crosswalk, within 6.1 m of the junction's mouth — on the approach side
  and the departure side alike. The parking lane line itself runs on to the
  mouth as the lane's travel edge. One function measures the zone, and the
  paint and the parked cars both read it. A car parks one to a marked stall,
  centred in it, the stalls read off the same layout the ticks are painted
  from; a kerb whose street allows parking but paints no lane has no stalls,
  and its cars keep their plain row.
- **An edge line is broken only across the mouth of a road that joins**
  (§3B.09 ¶07, §3B.11 ¶07–08). On a junction tile every side with no arm
  keeps its edge line for the tile's full length, so the far side of a T is
  unbroken: the road it runs along runs on past the junction there. It runs
  at the edge line's own inset from the junction's kerb on that side,
  bending from one arm's inset to the other's where the two differ.
- **Round a junction's corners** the edge line follows the kerb return. It
  marks where the running surface ends, and at a corner the running surface
  ends along that arc, so it is the same line the arms carry rather than a
  decoration on top of it — and it is drawn as the return's own arc at a
  larger radius, which is what makes it concentric with the kerb rather than
  merely near it. It is not a control marking: an uncontrolled junction paints
  no stop line and no crossing, and still carries this. Where the two arms
  put their outermost line different distances inside the kerb — a parking
  lane line on one, an edge line on the other — the arc's inset bends from
  one to the other round the sweep, so it leaves each arm exactly where that
  arm's own line runs. A kerbside bus lane's inner edge is marked once,
  solid, rather than dashed as a boundary between two ordinary same-way lanes
  would be.
- **Centre line** is derived per class: dirt, alley, one-way, highway,
  ramp and rail paint no centre line at all (a one-way or a motorway has no
  opposing traffic to separate, and dirt/alley carry no paint of any kind).
  Rural, local, urban and collector paint a dashed centre when the road
  carries one lane each way and a double solid when it carries two or more
  each way — the standard no-passing rule for a wider undivided road.
  Arterial and divided roads always paint double solid (a divided road's
  median is the real separator; the double solid is what shows on the
  paved side of it).
- **A broken line is painted at the size one is painted**: a 10 ft segment
  with a 30 ft gap — 3.05 m of paint every 12.2 m — and a line 6 in (0.15 m)
  wide. One part paint to three parts gap is the whole of what a driver reads
  a broken line by, and it is the same figure for a lane line as for a centre
  line, so both come from the one metric. The phase is anchored at global
  world-metre 0 rather than per tile, so the pattern runs unbroken across
  every tile and chunk seam.
- **A turn bay is fenced by a solid line.** The line between a turn bay and
  the through lane beside it is solid white, the normal 6 in width: MUTCD
  §3B.06 ¶07 wants a solid line between a through lane and a mandatory turn
  lane, because a through driver is not to drift into the queue. It runs the
  whole of the bay, taper included, and where the bay has closed it ends on
  the centre line the bay opened from, not on the kerb — the bay closes
  toward the middle of the road, so that is where its line goes. The dotted
  extension through the taper that §3B.23 ¶03 allows is not painted.
- **A line never crosses another on its way across a seam.** The lines on each
  side of a seam are paired in the order they lie across the road, colour by
  colour, and the pairing that moves them least is the one drawn. So the two
  lines of a double centre that a bay pushes sideways stay side by side: paired
  by nearness alone, a shift wider than the gap between them paired each line
  with the other's partner, and the two crossed.
- **Turn-lane paint.** A two-way left-turn lane carries a solid line toward
  the through lane and a broken line toward the turn lane on each side —
  legal to cross into to turn, illegal to travel along — with white turn
  arrows painted in it pointing each way, each hooking toward the left of the
  driver it faces, across the oncoming traffic they turn through.
  It counts toward the road's width and its class's lane range, and carries
  no through capacity, which is what a turn lane is for.
- **Turn arrows, merge arrows, gore chevrons** all come from the approach
  lane movement sets and the tapers, never authored: an arrow exists only
  where a lane's resolved movement set says the movement exists. A
  single-lane approach is left unmarked, since it does everything anyway —
  which is also what MUTCD 3D.06 ¶01 says of one at a circular
  intersection.
- **An arrow is painted at the size one is painted.** The MUTCD leaves the
  sizes to the Pavement Markings chapter of FHWA's _Standard Highway Signs_
  (§3B.20 ¶05), which draws a through arrow 9.5 ft long (2.90 m) with a
  5 ft (1.52 m) head, a turn arrow 8 ft (2.44 m), and a combined turn and
  through arrow 12.75 ft (3.89 m), the turn's head leaving the stem 7.5 ft
  (2.29 m) behind the through head's tip; every stem is 12 in (0.30 m) wide.
  The head of a through arrow is not dimensioned there, so it takes Georgia
  DOT's standard detail T-12B, 3 ft 8 in (1.12 m) across. A lane-use arrow,
  a two-way turn lane's arrows and a one-way street's direction arrows are
  all these sizes; no road in the game is slow enough for the 25% reduction
  §3B.20 ¶11 allows below 25 mph, and the long freeway arrow is never
  painted, because nothing arrows a motorway. An arrow stays inside its own
  lane (§3B.20 ¶08). Drawn at twice this, an approach's arrows ran the length
  of a car and a half and read as lane lines.
- **Gore hatching** is diagonal bars at 45°, sloping away from the traffic
  beside them in the direction that traffic goes (MUTCD 3B.25 ¶08–09), so both
  halves of a two-way road lean the same way on a map and each leans
  correctly for its own direction. Each bar is clipped exactly at the tile
  edge and the next tile draws the rest of it, rather than being squashed
  into a smear along the boundary or stepped into a staircase.
- **A roundabout is painted as a roundabout.** The crossings and stop bars
  go. A yield line of solid white triangles pointing at the approaching
  driver goes across every entry (MUTCD 3B.19 ¶10), and a give-way board
  stands at each one — the single place a give-way may face every approach
  (MUTCD 2B.10 ¶06). No centre line runs through, because there is an
  island where it would go, and no road runs _through_ a roundabout. The
  white edge line round the outer circulatory roadway, which MUTCD 3D.03
  puts in the arcs between the arms and never across an exit, arrives with
  the two-lane roundabout; see [../ROADMAP.md](../../ROADMAP.md). A compact
  roundabout's yield line follows the edge of its ring across each entry
  (MUTCD 3D.04), each entry has a raised splitter island between it and the
  exit beside it, and its single-lane ring carries no lines at all.

