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
drag runs wherever the cursor goes instead of snapping to a row or column. A
drag that stays on one row or column is still a grid street, as it always
was; only one that leaves it runs off the grid. With the lock on, every drag
snaps to a row or column.

With snapping to roads on (see [Snapping to roads](#snapping-to-roads)), each
click, and each end of a drag, snaps to what is already there: onto an
existing node within 4 m, onto an existing free road within 4 m of its centre
line (splitting it with a new junction, in the same undo step as the new
road), onto the centre of a grid road tile, or, with guide snapping on, into
line with a road nearby. A curve that starts on the end of an existing road
starts in that road's direction unless the bend says otherwise: a bend placed
within 8 m of that road's line, ahead of its end, is pulled onto the line, so
a road can be continued round a bend without a kink, and one placed further
off keeps the kink the player asked for.

The cursor chip carries the cost, the length along the centre line and, for a
curve, its tightest radius. When the road would be refused it carries the
reason instead: too tight for its class (with the radius it needs), too
narrow an angle where it meets another road, a crossing of two classes that
may not meet, or ground that is taken. A refused ghost draws red and the final
click does nothing.

`Backspace` takes back the last click, so a misplaced bend is moved without
starting again. Right-click is not used, and leaves a curve in progress
alone: a right-drag turns the camera, which is how a player looks round a
bend before placing its end. Escape cancels the road in progress, the same as
it cancels a drag. The profile and the class-join refusals apply as for any
road. The replace flag has nothing to replace off the grid, and until roads
off the grid can be raised a curve with the elevation set above the ground is
refused with that reason rather than laid on the ground. A curve is one undo
step, including any road it split.

**Which classes get which modes.** Every road class that can be laid offers
`Straight`, `L-path` and `Curve`. Every class except the motorway (highway
and ramp) also offers `Grid`. Picking a motorway while `Grid` is selected
falls back to `Straight`.

## Snapping to roads

A `Roads` toggle in the road tool's Snap row, on by default, decides whether a
new road connects to the roads it reaches. It applies to every road type and
every path mode — `Straight`, `L-path`, `Grid` and `Curve` — on and off the
grid alike. It is not guide snapping: guide snapping lines a road up with
another, this decides whether it joins one, and the two are toggled apart.

**On, a road carries on from the roads it reaches.**

- **The reticle finds road ends.** Before a drag starts, and at each end of
  it, a road end within half a tile (10 m) of the cursor — the end tile of a
  grid road, or the end node of a road off the grid — takes the reticle, and
  the ghost's first tile sits on it. The drag then carries on from that end in
  whichever path mode is selected, laying the road card that is selected: a
  continuation is a new drag that starts where the old road stops, not a copy
  of the old road.
- **A curve's end moves onto the grid to meet a grid drag.** A grid drag
  (`Straight`, `L-path` or `Grid`) starting or ending on a road off the grid's
  end node, where that node is not on a tile centre, moves the node onto the
  centre of the tile it lies on — at most half a tile on each axis — by laying
  the free road again with that end moved, in the same batch and the same undo
  step as the grid road. If the moved road would break a geometry rule, the
  drag is refused with that rule's reason, in the preview.
- A road off the grid snaps as described under
  [Curve and free road modes](#curve-and-free-road-modes), and a grid road
  joins the grid roads it touches, as it always has.

**Off, a road is laid as its own road.** Nothing snaps: no end moves onto a
node, a road end, a road's centre line or a tile centre, and no free road is
split or moved. The road joins nothing it merely lies beside or ends against —
a street laid on the row next to another stays two streets, and one ending a
tile short of another road's end stays two dead ends. Where it crosses or
overlaps another road on the same level it still joins there: a crossing is a
junction however it was drawn, and a crossing refused when on is refused when
off. The separation is a fact of the world, not of the drag: it survives a
save and a load, and traffic, utilities, services and the renderers all treat
the two as separate roads (see
[How roads meet](../world-sim/road-model.md#how-roads-meet-rank-replacement-and-transitions)).

**The preview says what the commit will do.** A grid drag that would run into
a road off the grid anywhere but at a tile centre it meets is shown refused,
with the world's own reason, rather than shown valid and refused after
release.

**Status** (2026-09-28): the preview's refusal is built, and so are roads laid
apart in the world, though nothing the player does lays one yet. The `Roads`
toggle, road-end snapping for grid drags, carrying on from an end and moving
a curve's end are specified, not built; until they are, free roads snap as
described above and grid roads join whatever they touch.

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
