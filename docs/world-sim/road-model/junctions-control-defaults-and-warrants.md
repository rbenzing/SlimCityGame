# Junctions: control, defaults and warrants

Every junction node carries a control: `none`, `yield` (minor approaches
give way), `stop` (minor approaches stop), `allWayStop`, `signal`, or
`roundabout`. The default is a **warrant**, not a constant, worked out from
the same two inputs an engineer would use — the class of each approach, and
how full its lanes have been running:

- Two approaches at rural or below (dirt, alley, rural) meet with no
  control.
- A road meeting a strictly higher class stops on the lower one.
- Two roads of the same class at collector or above signalise; anything
  touching an arterial, a divided road or above always signalises.
- Two roads of the same class, equal and at one-way or above, all stop —
  the four-way stop an American grid is full of.
- A junction a highway or rail touches never takes a node control at all:
  nothing meets either at grade, so a ramp's motorway end is a merge or a
  diverge (below), never a controlled junction. A ramp's other end is a
  terminal on the surface network and takes an ordinary warranted control.

That classification default is then nudged up one rung when traffic
sustains it, mirroring the MUTCD's absolute thresholds (500 vph major plus
150 vph minor for a signal; 300 plus 200 for an all-way stop; roughly 2,000
vpd combined before two minor roads are signed at all) restated as a
fraction of what the approach lanes carry, so the warrant survives any
change to the sim's trip volume: two minors combined at v/c ≥ 0.15 earn a
yield; a minor against a major at v/c ≥ 0.3 earns a stop; a major at v/c ≥
0.4 with a minor at v/c ≥ 0.3 earns an all-way stop; a major at v/c ≥ 0.4
with two or more lanes per direction, against a minor at v/c ≥ 0.25, earns a
signal instead of a stop. A player's override is never stepped back down by
a warrant: once set, it is sticky, and the junction inspector always shows
the warrant's own recommendation alongside it.

Control has teeth: the delay formulas in
[Capacity, control delay and warrants — the formulas](capacity-control-delay-and-warrants--the-formulas.md)
are added to the path cost of the approach, per movement, so a city of
all-way stops on its arterials is measurably slower and the traffic lens
shows it. A signal runs a two-phase, 60-second cycle (90 seconds once any
approach has a dedicated left, which is a third phase) — cosmetic vehicles
hold at the stop line and the signal head cycles red/amber/green on that
same clock, which is exactly the cycle the delay formula assumes. Every
signalised junction in the city runs the same clock, the way a coordinated
arterial does in life.

**Roundabout** is the one control that changes geometry rather than only
behaviour: choosing it on a node with 3–4 approaches turns the node's own
tile (20 m, a mini roundabout, real range 13–25 m, ≤ 15,000 vpd) into a
circulating carriageway with yield markings on every approach and no
signal.

A **compact roundabout** takes a 2×2 block: a single-lane ring 36 m across,
centred on the corner the block's four tiles share. It is the roundabout
control stored on all four tiles, and is laid by the Roundabout tool on a
street junction, never picked in the inspector. Its ring runs anticlockwise
round a planted island and truck apron; every road into it gives way at the
ring's edge, behind a splitter island. Each of its three or four legs, one to
a side, is a street of one lane each way, and arrives half a tile off the
ring's centre. The router drives the ring the one way it goes, on the circle,
and charges the roundabout's delay only on entry. The design and its sources
are in [the roundabout spec](../../specs/roundabouts.md). A
two-lane roundabout for a two-tile corridor is not buildable yet.

**A roundabout entry carries what the ring in front of it leaves room for.**
An entering driver gives way to the traffic already circulating, so the
busier the ring is in front of the entry, the less it can take. A single-lane
entry onto a single-lane ring has the Highway Capacity Manual's capacity
(HCM 7th edition, Eq. 22-1; the same constants as the 6th):

    c = 1,380 · e^(−0.00102 · v_c)    veh/h

where `v_c` is the conflicting flow, the circulating traffic passing in front
of the entry, in veh/h. The sim has no heavy vehicles, so a vehicle is a
passenger car. With nothing circulating an entry takes 1,380 veh/h; at 1,000
circulating it takes about 500, at 1,800 about 220. The entry's v/c, which
the roundabout's delay curve reads, is the traffic arriving on that arm over
this capacity, not over what the arm's own road carries.

What counts as conflicting is what the manual counts (HCM 7th edition,
Eq. 22-11). For an entry, that is every car from another leg that passes in
front of it before it leaves the ring. That means the through traffic and
the lefts from the leg upstream, and the lefts from the leg opposite. It
never includes a car turning right off the ring before the entry. The sim
reads it from what it has:

- **A compact roundabout** has a ring of its own, so the conflicting flow is
  the ring traffic carrying on past the entry's corner. The sim does not know
  where each car on the ring leaves, so it takes the smaller of the ring
  traffic arriving at the corner and leaving it. That is the most that can
  be carrying on past.
- **A mini roundabout** is one tile, with no ring traffic to read. The
  conflicting flow is worked out from the traffic arriving on the other
  legs, on the assumption that each car is bound for each other leg alike.
  A car from the leg one place upstream passes the entry unless it turns
  right, so two thirds of that leg's traffic conflicts at a four-leg
  roundabout. The leg opposite contributes a third. The leg downstream
  contributes none, since every car from it has left before reaching the
  entry. A three-leg roundabout takes half of the leg upstream and none of
  the other.

Volumes are read in veh/h through the same constant that turns a road's
veh/h into its game capacity (k, below), so a ring at a given v/c conflicts
as the veh/h that v/c stands for.

