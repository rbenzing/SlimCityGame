# Junction and motorway signage

A junction is signed by its own control, which the simulation's warrant
decides from the classes that meet and what they carry
([road-model.md](../../world-sim/road-model/README.md)), never by the approaching
road's tier. A signalised junction puts a **traffic signal** on every
approach — a mast with a short arm reaching over the carriageway and a
three-lens head hung off it.
The mast stands at the KERB FACE, not at the back of the footway where a flat
board goes: the arm is short, and one that has to cross the paving first
arrives at the kerb line with nothing left and hangs its head over the kerb
rather than over the lanes it holds.
An all-way stop puts a **stop** board on every approach; a minor-road stop or
a **give way** boards only the approaches that give way, and the road running
through carries none; a roundabout gives way at every entry; an uncontrolled
junction is not signed at all. A signal head shows three dark lenses with
exactly one lit over them, and the lit one cycles on the same city-wide
signal clock the simulation uses, so what a head shows is the phase the
junction is actually in.

A motorway is signed like a motorway, not like a street: it takes none of the
street furniture above — no kerb, so no utility boxes, no parking meters, no
stop/give-way boards, and never a signal, because you do not halt traffic on
a motorway, you give it an exit. It gets two sign types of its own:

- An **exit** cantilever where something leaves the motorway: one post at the
  shoulder, a lattice-truss arm reaching over the carriageway, and a green
  panel hung off it carrying an exit-number tab above its top edge, a
  diagonal exit arrow, and a yellow advisory-speed plaque beneath.
- A **gantry** periodically along a straight run: legs outside both
  shoulders, a truss carrying right across, and two panels beneath it with
  lane-assignment down-arrows. This is the one sign type that straddles the
  centreline instead of standing at a kerb, so it takes no lateral offset. It
  is stretched across its own road, legs 1.2 m outside whatever shoulders the
  section has; a motorway laid across two tiles gets one, over the edge the
  two share and spanning both.

Every sign faces the traffic it serves, and its facing comes from the
direction that traffic approaches from, not from the roadway edge the sign
happens to stand on (MUTCD §2A.17 ¶01–02). On a two-way road the two agree,
because each kerb has its own stream. On a one-way carriageway — a motorway, a
ramp, a one-way street — they do not: both kerbs carry the same stream, so
only the tile's stored flow says which way it runs, and the sign reads that.

- A **flat board** turns freely, so it faces back against the flow from
  whichever kerb it is on, and on a two-way road back along its own kerb's
  stream.
- A **cantilever** — the traffic signal and the exit board — cannot turn
  freely. It is authored reaching along +X and yawed by the shared
  `signalYaw`, which swings the arm in over the road from its kerb; the face
  is fixed to the arm, on local −Z, so that one turn decides both. From the
  approaching driver's right, −Z looks back down the lanes at them. So a
  cantilever stands only on the right of the traffic it serves: a signal at
  the stop line on the driver's right, and a one-way carriageway's exit board
  on the kerb to the right of the flow or not at all, since a board showing
  drivers its back is worse than none. An arm pointed the wrong way hangs
  over the grass; a face pointed the wrong way shows a lit head to the
  drivers across the junction instead of the ones waiting under it.
- A **gantry** straddles the carriageway on legs outside both shoulders, so
  it has no kerb and no arm to turn. Its face is on local +Z and it turns to
  face back against the stored flow.

The placement decides the facing and the renderer applies it; it never
works one out for itself.

