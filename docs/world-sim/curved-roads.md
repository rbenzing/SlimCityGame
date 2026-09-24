# Curved roads

A road that bends through a smooth arc instead of turning on a single grid
corner. The decision to allow them, and the limits on them, is
[ADR-0016](../engineering/adr/0016-a-road-may-curve-between-two-grid-ends.md).

## What a curve is

A curve is defined by three tiles: its **start**, its **corner** and its
**end**. The start and the corner share a row or a column, and so do the
corner and the end, on the other axis. Drawn with straight legs, those three
tiles are an L; a curve is that L with its corner rounded off.

- The **arc** is a quarter circle tangent to both legs. Its radius is the
  shorter leg, measured from tile centre to tile centre, less half a tile. So
  on the shorter leg the arc begins at the edge of the end tile, and on the
  longer leg a straight length runs from the end tile to where the arc
  begins.
- The **start and end tiles are ordinary grid road tiles.** The curve leaves
  each of them along a grid axis, through the middle of a tile edge, exactly
  the way a straight road does. They belong to the grid, not to the curve:
  they can be junctions, they draw as grid tiles, and they stay if the curve
  is bulldozed.
- Everything between them is the curve's own.

A curve always turns through a right angle. An S-bend is two curves, joined
by a grid tile. A road heading off at an arbitrary angle does not exist.

### The tiles a curve holds

Two sets of tiles, both derived from the three defining tiles:

- The **chain** is every tile the centre line passes through, in order from
  start to end, made to step from neighbour to neighbour. Where the line
  passes exactly through a tile corner, the step goes along the first leg's
  axis first. The chain holds the road: its tiles carry the road layers, tier,
  profile and flow, like any road tile.
- The **verge** is every other tile the road's full cross-section overlaps,
  footways included. A verge tile holds no road, grants no frontage and
  carries no utility, but nothing else may be built on it: it is occupied
  ground, like the ground under a bridge.

Both sets are held in a derived per-tile layer naming the curve, recomputed
from the saved curves on load, the same way masks are.

**A chain tile joins only the tiles before and after it in the chain.** A road
laid beside a curve does not join it, and nothing joins a curve partway along.
At each end, the first chain tile joins the start or end tile; the grid tiles
join outward as grid tiles do.

## How tight a curve may be

Each class has a minimum centre-line radius. A curve tighter than its class
allows is refused with the radius it needs.

| Class                 | Minimum radius | Shorter leg, at the least |
| --------------------- | -------------- | ------------------------- |
| dirt, alley           | 30 m           | 2 tiles                   |
| local, one-way        | 40 m           | 3 tiles                   |
| urban                 | 50 m           | 3 tiles                   |
| collector             | 60 m           | 4 tiles                   |
| rural, arterial, ramp | 80 m           | 5 tiles                   |
| divided               | 120 m          | 7 tiles                   |
| rail                  | 150 m          | 8 tiles                   |
| highway               | 200 m          | 11 tiles                  |

The shorter-leg column follows from the radius rule: a leg of _n_ tiles gives
a radius of 20 × _n_ − 10 m. The radii are the game's own choice, sized so
that a class's default posted speed is plausible on its tightest curve and so
that a motorway still fits on a 256-tile map. They stand in for the AASHTO
horizontal-curve tables, which are not held in
[Road Guides](../Road%20Guides/README.md), so they cannot be checked against
the standard here.

## Where a curve may be laid

- **Its footprint must be clear.** Every chain and verge tile must be dry,
  without a building, and without a road, apart from the start and end
  tiles, which may already be roads: the curve joins them there. A curve that
  cannot be laid whole is refused whole with the reason; it never lays part
  of itself. Zoning under the footprint is cleared, as under any road.
- **It lies on the ground.** A curve never bridges, never passes over or under
  another road, and never has a deck height. Its chain tiles follow the
  road slope rule along the chain, and the terrain under the whole footprint
  is graded the way it is under a road.
- **Its start and end tiles obey the grid rules.** Where they are new tiles,
  they are laid with the curve's profile; where they are existing roads, the
  curve meets them the way a grid drag would, and class-join refusals apply
  unchanged. A motorway curve still touches only a motorway or a ramp.
- **A curve's ends are its only junctions.** A grid drag that would run into a
  chain or verge tile is refused.

## Motorway pairs

A corridor profile, whose section needs two tiles side by side, curves as two
concentric curves. As on a straight corridor, the tiles the player draws are
the near carriageway, and the far carriageway lies one tile to the side a
straight corridor along the first leg would put it. It keeps to that side of
the direction of travel the whole way round, so both its legs sit one tile
inside the near curve's, or both one tile outside. Its corner is one tile away
along both axes and its radius differs from the near curve's by one tile. Each carriageway is
its own curve with its own stored flow, and whichever runs inside is held to
the class minimum. Two motorways drawn separately are simply two curves.

## How every system reads a curve

- **The road graph.** A curve's chain is part of a run like any other tiles.
  The run's length is measured along the centre line, not by counting tiles,
  so travel time follows the real distance. Each chain tile records the length
  of centre line inside it.
- **Traffic, utilities, services and coverage** spread along the chain
  through its masks, exactly as along a grid run.
- **Zoning and frontage.** A chain tile grants frontage to its free grid
  neighbours by the ordinary rule, measured from the chain tile. Verge tiles
  grant none. Buildings stay grid-aligned and face the chain tile they front.
- **Rendering.** The start and end tiles draw as grid tiles. Everything
  between them is swept along the curve: carriageway, kerbs, footways and
  markings follow the arc and the straight lengths as one continuous piece,
  with the section laid square to the centre line. Lane lines on the arc are
  arcs, concentric with it.
- **Vehicles.** A vehicle on a chain tile takes its position and heading from
  the curve at the point its route has reached, with its lane offset square to
  the centre line.
- **Furniture and lamps** stand along the curve at the same spacing as along
  a straight road, at the curve's own kerb offsets.
- **Picking.** Any chain or verge tile picks the curve.

## Commands

`buildCurve` carries the three defining tiles, the tier, the profile and, for
a one-way road, the flow. The road tool sends it together with a `buildRoad`
for any start or end tile that is not a road yet, as one gesture and one
undo step. Its inverse is `bulldozeCurve`, naming the curve.

`bulldozeCurve` removes the curve: every chain and verge tile. Its inverse is
the `buildCurve` that puts back the same curve, with the same identity and the
same profile and flow on its chain. Bulldozing any chain or verge tile with
the bulldoze tool removes the whole curve, because a curve is one piece.

Replace mode re-profiles a curve in place when the road tool draws the same
three tiles over it with a new profile that fits; the geometry does not
change.

## Saves

The curves are saved as a table appended after the grid: for each, its slot
and its three defining tiles. The chain's road layers are saved as road layers
already are. The per-tile curve layer is derived, so it is not saved; the
chain and verge a curve derives are therefore part of the save contract and
must never change for a curve already saved. `SAVE_VERSION` goes up by exactly
one from whatever it is when this ships. A save from before loads with no
curves, which is what it held.

## The road tool

The curve tool is a path mode beside `Straight`, `L-path` and `Grid`, and it
is described in [interaction.md](../ux/interaction.md#curve-road-mode).

## What does not change

- Every junction is a grid junction. Junction control, approach lanes, turn
  pockets, stop lines and crossings are unchanged, because a curve never has
  one.
- A grid corner is still a grid corner. The quarter circle drawn inside a
  single tile is not a curve and is not held to the radius table.
- Curves at an angle other than a right angle, curves in the air, curved
  overpasses and ramps that climb stay deferred. See
  [../DESIGN.md](../DESIGN.md).
