# UI design system

This is the design system for SlimCity's DOM overlay: the React + Zustand +
Tailwind v4 layer that floats over the 3D viewport. It covers every panel,
bar, and popover a player clicks on, plus the tokens and interaction rules
that keep them consistent.

The in-world 3D art direction — terrain, buildings, roads, vehicles, sky —
lives in [art/](../art/README.md) and is not duplicated here. Where a DOM panel reflects
something the 3D world is doing (a ghost preview, a selection outline), this
folder covers the DOM half and links out rather than re-describing the
render-side mechanism.

## Files

| File                         | Answers                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| [`layout.md`](layout.md)     | Where does this panel live on screen, and what does it contain?                |
| [`tokens.md`](tokens.md)     | What color, type, spacing, or icon do I reach for, and where do I change it?   |
| [`patterns.md`](patterns.md) | What rule applies across every panel — cost readouts, disabled states, Escape? |

Delivery status and the deferred backlog are not this folder's job: see
[ROADMAP.md](../ROADMAP.md) and [DESIGN.md](../DESIGN.md). What the interface
does, as opposed to how it looks, is in [SPEC.md](../SPEC.md).
