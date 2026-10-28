# Junction panel

Floating over the viewport at the left, in the exact same slot as the
building info panel above (roughly a third of the way down) — the two are
mutually exclusive by construction, since a building under the click
always wins over the junction beneath it. It opens with the `select` tool
active, on a click that lands on a real junction (three or more roads
meeting; a plain stretch of road is not one) with no building there.
Escape does not close it — unlike the building info panel, nothing in the
Escape stack (see [`interaction.md`](../interaction.md)) touches it. It closes via
its own close button, or automatically once the click resolves to
something else (a building, empty ground, a plain road tile) or the
junction itself is gone (bulldozed away).

- **Header**: the roads icon, `Junction · {x}, {z}`, and a close button.
- **Gives way**: names the control the junction currently resolves to.
  See [road-model.md](../../world-sim/road-model/README.md) for how a junction is warranted and what each
  control costs a driver.
- **Control**: an `Automatic` chip, always first and labeled with what the
  warrant currently makes of the junction (e.g. "Signals as it stands") —
  it keeps saying this even while the player has overridden it, since that
  is what handing the junction back would mean. Beside it, the explicit
  ladder — Uncontrolled, Give way, Stop, All-way stop, Signals — least
  restrictive first, then Roundabout off the end of the ladder, since it
  changes the junction's shape rather than only who waits at it and is
  therefore never a default. A line beneath the chips explains whichever
  one is active, in a driver's terms. Picking Automatic hands the junction
  back to the warrant; picking any explicit control is a decision the
  warrant will not later argue with.
- **Turns allowed**: one row per arm the junction actually has (no row for
  a cardinal with no road on it), each a Left/Through/Right toggle — a
  U-turn is a separate matter and is not offered here. Every turn is on by
  default. A toggle disables itself once it is the only movement its arm
  has left, since an arm has to be leavable by whoever arrives on it.
- **Lanes**: shown only where at least one arm actually has more than one
  lane serving it — a single-lane arm already does everything the arm
  allows, so it earns no row. Where it appears, one row per lane
  (`Left lane`, `Lane 2`, …, `Right lane`), each with its own
  Left/Through/Right toggles.
  - What a lane shows starts from what its real lane count derives by
    default (a dedicated left from three lanes on, a dedicated right from
    four on — see
    [road-model.md](../../world-sim/road-model/approach-lanes-turn-pockets-and-tapers.md))
    and then takes on
    whatever the player has explicitly set for that lane.
  - A lane can only ever narrow what its arm currently allows: the arm's
    own restriction always wins, so a lane can never offer a turn its arm
    has just banned.
  - A toggle disables itself for either of two reasons: it is the last
    movement that lane has, or the whole arm has already banned it — in
    the second case it stays unavailable regardless of what the lane
    itself would otherwise offer.
  - A lane change is sent for that one lane only; it never touches its
    neighbors or the arm's own restriction.
- **On a corner of a compact roundabout** the panel is headed
  `Compact roundabout · {x}, {z}`, says in a line what a roundabout does, and
  offers one action, **Take out the roundabout**. No control, turn or lane row is
  shown: the roundabout is one junction on four tiles, and a control set on
  one of its corners alone would break it up. Taking it out leaves the four
  tiles as junctions under their warrants, and undo puts it back.

