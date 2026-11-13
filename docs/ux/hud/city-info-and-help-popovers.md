# City info and Help popovers

Both open from a top-corner button and share the same read-only popover
frame — a small floating card with a caps-label title (see
[`ui-style-guide.md`](../../art/ui-style-guide.md) for the `PANEL_ROUNDED` chrome) — and neither
carries a close button of its own. Neither closes on an outside click
either: each is dismissed only by pressing its own corner button again.

- **City info** (left button): a fuller read of the city's live stats —
  `Jobs` (employed/total), `Power`, `Water` and `Sewer` as what is made and
  what is used ("0.2 MW made, 0.24 MW used"), and `Loan` (the outstanding
  balance). The figures are the sim's own totals, shown to two places below
  ten so a single wind turbine does not read as zero. Where use is above
  supply a line in the warning colour says by how much and what follows
  ("Short by 0.04 MW: some buildings go dark").
- **Help** (right cluster): only the keyboard shortcuts actually wired to
  a listener, no aspirational bindings — Play/Pause, Undo, Redo, Save,
  Load latest save, Rotate ploppable, the Escape stack (see
  [`interaction.md`](../interaction.md) for what Escape does at each stage),
  and every toolbar category with its jump key, or "Click its icon" where
  it has none. The list is read from the table the toolbar and the key
  handler use, so it cannot name a category the dock does not show.

