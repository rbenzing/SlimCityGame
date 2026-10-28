# Junctions

A **junction** is a node where three or more roads meet, or two roads meet at
an angle or with different profiles. A node where two roads continue in line
with the same profile is not a junction; the road runs straight through it.

- **Its shape is built from its roads.** Each road is set back from the node
  until its kerbs clear the kerbs of the roads either side of it, with the
  kerb returning between them at the road's kerb-return radius
  (`kerbReturnRadiusOf`). The junction area is what lies between the
  set-back road ends and the kerb returns. A grid crossroads built this way is
  the crossroads the game draws today.
- **Control belongs to the node.** Control, turn restrictions and lane turns
  are stored per node and per road meeting it, with the roads numbered
  clockwise from north. Warrants, defaults and the delay formulas in
  [road-model.md](../road-model/README.md) are unchanged; they read a road's approach
  from its segment instead of from a compass direction.
- **The class rules are unchanged.** Rank, replacement, which classes may
  meet, and that a highway meets only a highway or a ramp, all hold as in
  [road-model.md](../road-model/README.md).
- **A ramp meets a motorway alongside it.** Where a ramp joins or leaves a
  motorway, it does so at no more than 20° to the motorway, in the motorway's
  direction of travel. The narrowest-angle rule does not apply there, because
  a merge and a diverge are shallow by nature. A ramp meeting a motorway at a
  wider angle is refused; that is the head-on meeting the road model already
  refuses.

