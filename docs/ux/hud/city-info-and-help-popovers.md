# City info and Help popovers

Both open from a top-corner button and share the same read-only popover
frame — a small floating card with a caps-label title (see
[`ui-style-guide.md`](../../art/ui-style-guide.md) for the `PANEL_ROUNDED` chrome) — and neither
carries a close button of its own. Neither closes on an outside click
either: each is dismissed only by pressing its own corner button again.

- **City info** (left button): a fuller read of the city's live stats —
  `Jobs` (employed/total), `Power` and `Water` (supply/demand, in MW and
  kL), and `Loan` (the outstanding balance).
- **Help** (right cluster): only the keyboard shortcuts actually wired to
  a listener, no aspirational bindings — Play/Pause, Undo, Redo, Save,
  Load latest save, Rotate ploppable, the 1–7 toolbar-category jump keys,
  and the Escape stack (see [`interaction.md`](../interaction.md) for what Escape
  does at each stage).

