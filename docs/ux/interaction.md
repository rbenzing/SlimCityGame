# Patterns

Rules that cut across panels rather than belonging to any one of them. If a
rule is stated here, it is not repeated on the panel page — see
[`hud.md`](hud.md) for where a given panel lives and what it shows.

## Rule Zero: nothing renders as a dead control

Every row, toggle, and button that appears must be wired to real,
currently-consumed behavior. A control that would do nothing if clicked is
not rendered "for completeness" or "for later" — it is omitted until the
behavior behind it exists. This is why several panels are shorter than a
generic city-builder's: a motorway's mode row leaves out `Grid`, because a
grid of motorways is not a thing anyone builds; zone tools and Bulldoze
render no mode row at all, because each has exactly one real mode (`Rect`);
the corner buttons carry no gear/settings icon, because there is no
settings system separate from the in-game Options screen. When a genuinely
useful toggle is always-on in the engine (grid snapping, for instance), it
is left off the panel entirely rather than rendered pressed-and-disabled —
a control that can never be clicked reads as broken, not as informative.

## Placement footprint feedback

Every tool preview — road, zone, bulldoze, terraform, or a ploppable —
gets the same crisp-border treatment on top of its translucent ghost fill,
because a flat-shaded tint alone doesn't read as "this is how big the
thing is":

- A bright border traces the **outer perimeter** of the previewed tile
  set only — inner edges between two previewed tiles are skipped — so a
  4×4 power plant reads as one bordered square, a road drag as one
  bordered ribbon, and a brush stroke as its true outline. White at 90%
  opacity when the placement is valid, the danger color when it isn't.
- Faint (25%) inner grid lines subdivide a multi-tile footprint so the
  tile count stays readable under the border.
- A ploppable additionally gets a translucent extruded box at its true
  footprint × height (accent blue at 25%, danger-tinted when invalid), so
  its mass is judged before the player commits — road, zone, bulldoze, and
  terraform previews stay flat frames without this box.

## Grid road mode

The road tool's third path mode. `Straight` lays one run, `L-path` lays two
legs; `Grid` takes the rectangle a drag encloses and lays a street grid inside
it in one action — the four sides, plus the internal streets that divide the
block.

**The spacing is the zoning depth, not a taste.** A road puts frontage
`ZONE_DEPTH` cells out from each of its sides (`world/zonable.ts`), so two
parallel streets zone everything between them when the gap is twice that. The
grid pitch is therefore `2 × ZONE_DEPTH + 1` = **9 tiles centre to centre** —
eight tiles of block and the street itself. It is the widest spacing that
leaves no dead ground in the middle of a block, and at 20 m tiles it is a
180 m block, which is a city block. A tighter grid would be a choice about
taste; this one falls out of the rule the game already enforces.

Internal streets are laid only where a whole block still fits behind them. A
rectangle narrower than the pitch gets its perimeter and nothing inside, and
one that would put a street a tile short of the far edge stops before it —
cutting off a sliver nothing can be built in is worse than the slightly wide
block it would have avoided. A drag too small to enclose anything degenerates
to the straight run it looks like. The internal streets are spaced from the
rectangle's low edge, so growing a drag adds streets rather than shuffling the
ones already previewed, and the grid a rectangle gets does not depend on which
corner the drag started from.

Everything else about a road drag is unchanged: the same profile, elevation,
replace flag and refusals apply, the preview shows every tile the grid will
occupy, and the cursor chip prices the lot before it is committed. A grid is
one undo step, because it was one gesture.

## Curve and free road modes

Two path modes lay roads off the grid, once the road network
([road-network.md](../world-sim/road-network.md)) has reached its tool stage.
What a free road may be — how tight a curve each class may take, how narrow an
angle two roads may meet at — is that document; this is how the player draws
one.

**`Curve` is three clicks** rather than a drag, because a bend has a shape a
drag cannot say:

1. **Start.** The first click places the start. From then on the ghost is a
   straight road from the start to the cursor.
2. **Bend.** The second click places the bend: the point both ends of the
   curve aim at. From then on the ghost is the whole curve, from the start,
   pulled toward the bend, to the cursor. It is drawn at the road's real
   width, so the player sees which way it bends and how much ground it takes
   before placing it.
3. **End.** The third click lays the curve.

**A straight at any angle** is the `Straight` mode with the 90° lock off: the
drag runs wherever the cursor goes instead of snapping to a row or column.

Each click, and each end of a drag, snaps to what is already there: onto an
existing node, onto an existing road (splitting it with a new junction), or,
with guide snapping on, into line with a road nearby. A curve that starts on
the end of an existing road starts in that road's direction unless the bend
says otherwise, so a road can be continued round a bend without a kink.

The cursor chip carries the cost, the length along the centre line and, for a
curve, its tightest radius. When the road would be refused it carries the
reason instead: too tight for its class (with the radius it needs), too
narrow an angle where it meets another road, a crossing of two classes that
may not meet, or ground that is taken. A refused ghost draws red and the final
click does nothing.

`Backspace` takes back the last click, so a misplaced bend is moved without
starting again. Right-click is not used: a right-drag already turns the
camera. Escape cancels the road in progress, the same as it cancels a drag.
The profile, the replace flag, the elevation control and the class-join
refusals apply as for any road. A curve is one undo step, including any road
it split.

**Which classes get which modes.** Every road class that can be laid offers
`Straight`, `L-path` and `Curve`. Every class except the motorway (highway
and ramp) also offers `Grid`. Picking a motorway while `Grid` is selected
falls back to `Straight`.

## Road guide snapping

A toggle beside the 90° lock. With it on, a road drag that is _nearly_ in line
with an existing road is pulled into line with it: both ends of the drag snap,
independently on each axis, onto the row or column of a nearby road that runs
along it. A new street started a tile off an existing one becomes its
continuation instead of a parallel run, and a drag ending a tile past a cross
street lands on that street's centreline instead of just short of it.

**Only a real run counts as a guide.** A single road tile says nothing about
direction, so a candidate only guides when its neighbour along the same axis is
also road — otherwise a perpendicular road's one crossing tile would drag a new
street sideways onto it.

**The snap reaches two tiles**, which is half the zoning depth. That is the
furthest it can pull a road without destroying ground an existing road already
serves: at two tiles the strip between two parallel streets is a stagger nobody
chose, and beyond it the offset is a block the player meant to leave. A snap
that reached further would move the road somewhere it was not pointed.

The toggle composes with everything else rather than replacing it: the path is
still whichever path mode is selected, still 90°-locked if that chip is on, and
snapping only adjusts where the drag's ends sit before the path is built.

## Cost and validity readouts

A cursor-chip stack, offset from the pointer, carries the live cost of
whatever is being placed (and, for roads, a length in meters). An invalid
placement adds a reason line beneath the cost in the warning color —
"Overlapping items", "Insufficient funds", "Locked" — so the player learns
_why_ before they commit, not just that the ghost turned red.

## Selection

Selecting a building draws a green edge outline around it and floats a
map-pin sprite above its roof for as long as its info panel stays open.
Closing that panel is a return to a fully neutral state: the selection
clears and the active tool drops back to `select`, so only camera pan/zoom
and picking are live afterward — nothing can be placed by accident on the
next click.

## Disabled vs. gated-by-milestone

These read differently on purpose, because they mean different things to
the player:

- **Disabled** is "not applicable right now" — Undo with nothing to undo,
  Save with no game running. It dims to roughly 30% opacity and refuses
  the click; nothing about it is locked, it simply has nothing to do yet.
- **Gated by milestone** is "not available yet, but will be" — an asset
  card whose unlock milestone is still ahead. It renders at 40% opacity
  with a lock glyph and a tooltip naming the milestone that unlocks it.
  The Sandbox option (unlock all build items) bypasses this gate entirely
  for testing, without changing how a genuinely disabled control behaves.

## Keyboard and Escape

`Space` pauses and resumes the simulation; `+`/`-` step the simulation
speed. Escape is a small stack, most-local effect first:

1. If a drag is in progress, Escape cancels it. This is handled at the
   tool level, before anything below sees the key.
2. Otherwise, if the asset drawer is open, Escape closes it — which is the
   same thing as deselecting the active build category, since the drawer's
   open state and the selected category are one piece of state, not two.
3. Otherwise, Escape drops the active tool back to `select` and deselects
   any selected building.

The same key doubles as the way out of the in-game pause menu: opening it
pauses the city at whatever speed it was running, and Escape (or the
Resume button) restores that exact speed rather than leaving the clock
stopped.
