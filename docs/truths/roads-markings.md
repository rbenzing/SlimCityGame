# Truths — Roads: markings and kerb parking

Back to [the index](../GROUND-TRUTHS.md).

- [R-roads-044] Yellow marks the side of a line that oncoming traffic is on, adjacent or
  not. On an undivided road that is the centre line. On a **one-way
  carriageway — a motorway, a ramp, a one-way street, either half of a
  divided road — the LEFT edge line is solid yellow and the right is solid
  white** (MUTCD §3B.09 ¶02–03); lane lines between same-direction lanes are
  broken white (§3B.06 ¶05). Every paved road carries edge lines; dirt, alley
  and rail carry no paint; one-way, highway and ramp paint no centre line. —
  [road-model.md](../world-sim/road-model/README.md); `src/render/roadmarkings.ts`
- [R-roads-045] An edge line is broken only across the mouth of a road that joins. On a
  junction tile, every side with no arm keeps its edge line for the tile's
  full length, so the far side of a T is unbroken (MUTCD 3B.09 ¶07, 3B.11
  ¶07–08). Between two arms, the edge line follows the kerb return, bending
  from one arm's inset to the other's. — [road-model.md](../world-sim/road-model/README.md);
  `src/render/roadsmesh.ts`
- [R-roads-046] A bike lane lies between two white lines: the solid bike-lane line on the
  travel side, and on the other the edge line or the parking lane line, or
  the kerb where one bounds it (MUTCD 9E.01, 9E.02). Green is only a
  supplement inside those lines (3H.06): never under a line, past one, or off
  the pavement. — [road-model.md](../world-sim/road-model/README.md);
  `src/render/roadmarkings.ts`
- [R-roads-047] A parallel parking lane marks its stalls with white corner marks on its
  travel edge: a T where two stalls meet and an L at each end of a run, the
  bar 0.3 m either side of a 0.6 m stem (MUTCD 3B.27, Figure 3B-23). It
  carries no continuous line (3B.10 ¶05) except against a bike lane, and no
  edge line runs inside it. Each run of kerb between two no-parking zones is
  laid on its own from its upstream end: 6.7 m (22 ft) stalls, 6.1 m (20 ft)
  at each end, the last taking an odd length up to 7.9 m (26 ft); the rest
  stays unmarked, and a run under 6.1 m marks nothing. A car stands one to a
  stall, centred. The zones: 9.1 m (30 ft) before a stop line or signal,
  6.1 m (20 ft) from a crosswalk or a junction mouth with none (UVC
  §11-1003), and a drive's mouth with 1.5 m (5 ft) either side. —
  [markings.md](../world-sim/road-model/markings.md);
  `src/shared/kerbstalls.ts`, `src/shared/kerblayout.ts`, `src/render/parked.ts`
- [R-roads-048] A parking lane is parallel, angled or head-in, and the style is part of
  the road's profile (a field on its parking piece, parallel when absent), so
  an old save reads as it was. The stall is 2.6 × 5.5 m (8.5 × 18 ft). An
  angled lane parks at 60° for backing in: the lane is 6.0 m deep, one stall
  per 3.0 m of kerb, and each stall's kerb end lies upstream of its travel
  end, so a car leaves nose-first with the flow. A head-in lane parks at 90°:
  5.5 m deep, one stall per 2.6 m. The deeper lane counts against the tile's
  width like any piece, and the road tool refuses a profile that does not
  fit. An angled or head-in stall is marked only where its whole footprint
  stands clear of the no-parking zones. — [road-model.md](../world-sim/road-model/README.md);
  `src/shared/roadprofile.ts`, `src/shared/kerbstalls.ts`
- [R-roads-049] Every block face that marks stalls and has room for an accessible one
  marks accessible ones, to PROWAG R211:
  1 for 1–25 stalls, 2 for 26–50, 3 for 51–75, 4 for 76–100, 5 for 101–150,
  6 for 151–200, and 4% beyond that. They stand at the end of the block face
  nearest a crosswalk, or nearest a junction where there is none. A parallel
  one is 7.3 m (24 ft) long (R310.2.1); an angled one is 3.35 m (11 ft) wide
  with a 1.5 m (5 ft) aisle (R310.4); a head-in one has a 2.4 m (8 ft) aisle
  (R310.3). The aisle is on the passenger side and hatched white. Each one
  carries the International Symbol of Accessibility on a blue square
  (MUTCD 3B.22 ¶08–09), drawn as geometry. — [road-model.md](../world-sim/road-model/README.md);
  `src/shared/kerbstalls.ts`, `src/render/roadsmesh.ts`
- [R-roads-050] The kerb stall layout and its no-parking zones are computed in one shared
  module that the renderer and the sim both call, each reading the roads
  through a `KerbSurroundings` built by the same `roadSurroundings`; the sim
  never infers stalls another way. Every input is grid state (the road tiles,
  the profile table, the junction controls) and the drive cuts on the face,
  and nothing off the map: a lookup past the edge finds no road on either
  thread. One input is still open: a home's drive is planned by the
  renderer, so the sim's layout holds only the cut of the lot it is
  crediting. — [parking-to-code.md](../specs/parking-to-code.md);
  `src/shared/kerblayout.ts`, `src/sim/kerbsurroundings.ts`
- [R-roads-068] A broken line is 3.05 m of paint and a 9.15 m gap (a 12.2 m period), 0.15 m
  wide, with its phase anchored at world metre 0 across every seam. Through
  a bend the pattern runs on from the run before and its gaps stretch to
  meet the run after (MUTCD 3A.04 ¶06). Where a line is cut, a remainder
  under 0.6 m is not painted, and a lane line within 1 m of the edge line
  beside it is not painted. —
  [road-model.md](../world-sim/road-model/README.md); `src/render/roadsmesh.ts`,
  `drawBend` in `src/render/freeroadmesh.ts`
- [R-roads-069] Turn arrows exist only where a lane's resolved movement set says the movement
  exists, and a single-lane approach is unmarked (MUTCD 3D.06 ¶01). Every
  arrow is the _Standard Highway Signs_ size the MUTCD points to (§3B.20 ¶05):
  a through arrow 2.90 m, a turn arrow 2.44 m, turn and through 3.89 m, stems
  0.30 m, never wider than its lane. A one-way road's flow arrow is the
  through arrow, one centred in each lane, never on a line (3B.23). Gore
  hatching slants away from the adjacent traffic (MUTCD 3B.25 ¶08–09). —
  [road-model.md](../world-sim/road-model/README.md)
- [R-roads-087] A reserved lane's colour follows its lane: round a bend and a dead end's cap
  on the road's arc, and past a junction side with no arm, never inside a
  crosswalk (MUTCD 3H.06 ¶03). A bike lane crosses an arm's mouth between
  two dotted lines, green only between each pair of marks (9E.03 ¶07, ¶10;
  3H.06 ¶04). A bus lane's red lies only where general traffic may not go:
  none in a kerb return's wedge or across a mouth (3H.07 ¶03). A stop line
  crosses every arriving lane, reserved ones too. A free road lays the
  grid's lane symbols every 60 m along its arc. — [markings.md](../world-sim/road-model/markings.md);
  `src/render/roadsmesh.ts`
- [R-roads-089] An exit's neutral area carries a wide white channelizing line on each side,
  from the theoretical gore to the nose, and white chevrons between them
  pointing at approaching traffic (MUTCD 3B.08 ¶05, 3B.25 ¶05). The slip
  road keeps its lane's full width at the nose. An entrance's neutral area
  carries the same two lines to the theoretical gore and no chevrons (3B.08
  ¶06, ¶09). — [interchanges.md](../specs/interchanges.md); `emitGore` in
  `src/render/roadsmesh.ts`
- [R-roads-090] A two-way road's bend at or under its class's bend radius is a no-passing
  zone: an unpaired broken yellow centre line becomes a solid yellow pair
  through it, on a free bend and a grid turn tile alike (MUTCD 3B.03 ¶03),
  centred on the road, and the pair runs out to the next whole dash: no gap,
  no single solid line, and a dash under half a dash beside it becomes pair.
  White lane lines stay broken and keep one rhythm through the bend. — [markings.md](../world-sim/road-model/markings.md);
  `bendIsNoPassing` in `src/shared/roadprofile.ts`
- [R-roads-091] A road's end cap carries its edge line only: no centre line, lane line or
  dash wraps the cap. Two bike lanes' dotted extensions stop at each other's
  footprint where they cross. — [markings.md](../world-sim/road-model/markings.md);
  `emitEndCapMarkings` in `src/render/roadsmesh.ts`
