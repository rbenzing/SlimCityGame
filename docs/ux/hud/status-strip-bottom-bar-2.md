# Status strip (bottom bar #2)

A single 28px row, left to right, each group separated by a subtle
divider:

- **Sim controls**: a play/pause button plus speed as a chevron count
  (`▶` = 1×, `▶▶` = 2×, `▶▶▶` = 4×, active speed picked out in the positive
  color), and undo/redo.
- **Clock and date**: `HH:MM` derived from the simulation's time-of-day,
  and `MMM YYYY` derived from the tick — the displayed year is an offset
  from a fixed base year.
- **Season chip**: a sun or leaf glyph plus a season name, derived purely
  from the in-game month — a display flavor, not a separate weather
  system.
- **City name**: centered, from the map's name.
- **Population**: a count plus a trend arrow against last month's
  snapshot.
- **Funds**: the current balance plus a monthly delta chip (positive or
  danger colored, labeled `/mo` rather than faking an hourly rate).
- **Happiness face**: a single emoji-style face stepped from the city's
  happiness score. Clicking it opens the Happiness infoview.

