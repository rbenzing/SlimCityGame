# A road is a class, a cross-section and a set of junctions

A road is not a tier picked from a drawer. Three objects carry everything a
player can choose, and nothing is decided by which catalog card they
clicked:

- The **class** says what the road is for — dirt, alley, rural, local street,
  urban street, collector, arterial, divided, one-way, highway, ramp — and
  fixes what a class really does fix: posted speed range, per-lane
  throughput, the lane-count range, which lane pieces it may hold, and
  whether it is zonable and utility-carrying.
- The **profile** is the cross-section: an ordered list of lane pieces from
  one kerb to the other — travel lanes with a direction, a centre turn lane,
  a median, a parking lane, a bike lane, a bus lane, a tram lane, a shoulder,
  a barrier, a sidewalk — each with a width. Every catalog road is a preset
  profile of some class.
- The **junction** is where two or more profiles meet: it owns the traffic
  control, the turn restrictions per approach, and the approach lanes — how
  the last stretch of each incoming profile splits into through/left/right
  lanes.

Markings, furniture and capacity are derived from those three; none is
authored separately. A dashed centre line means "two-way, passing allowed"
and nothing else; a turn arrow means an approach lane exists with that
movement; capacity is lanes times a per-class, per-lane figure. See
[../engineering/adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md](../../engineering/adr/0012-a-road-is-a-class-a-cross-section-and-junctions.md)
for why the game is built this way rather than as a fixed tier catalog.

