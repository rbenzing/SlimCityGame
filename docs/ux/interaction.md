# Patterns

Rules that cut across panels rather than belonging to any one of them. If a
rule is stated here, it is not repeated on the panel page — see
[`hud.md`](hud.md) for where a given panel lives and what it shows.

## Rule Zero: nothing renders as a dead control

Every row, toggle, and button that appears must be wired to real,
currently-consumed behavior. A control that would do nothing if clicked is
not rendered "for completeness" or "for later" — it is omitted until the
behavior behind it exists. This is why several panels are shorter than a
generic city-builder's: a road tool's mode row only lists `Straight` and
`L-path` because a grid-drag mode isn't built; zone tools and Bulldoze
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
