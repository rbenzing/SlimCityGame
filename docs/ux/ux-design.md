# Interaction philosophy

The rules the rest of the UX documentation follows from. Behaviour, not
layout — see [hud.md](hud.md) for what actually sits where.

## The world is the surface; the DOM floats over it

The 3D viewport is the whole screen (`#viewport`, `position: fixed; inset:
0`); the interface is an HTML layer stacked on top of it
(`#ui-root`, same `fixed; inset: 0`, `z-index: 10`), never a page the
viewport sits inside. See [ui-architecture.md](ui-architecture.md) for the
pointer-events mechanics that make this work. Chrome exists to operate the
city, not to decorate the screen: panels dock to the edges, the center
stays clear, and closing every panel leaves nothing between the player and
the ground.

## Bottom-heavy, genre-familiar grammar

Everything load-bearing collects at the bottom of the screen in two
stacked bars — build categories and sim controls — with only small utility
buttons in the top corners. This is a deliberate, recognisable city-builder
shape rather than an original layout: see
[../engineering/adr/0014-genre-grammar-is-deliberate-originality-is-elsewhere.md](../engineering/adr/0014-genre-grammar-is-deliberate-originality-is-elsewhere.md).
The full arrangement is [hud.md](hud.md); this page only states why it is
shaped that way.

## Rule zero: nothing renders that is not wired to real behaviour

Every control the game renders is wired to a real, working system behind
it. A feature that is not built yet is not shown half-built or disabled —
it is simply absent, and lives in [../DESIGN.md](../DESIGN.md) instead. See
[../engineering/adr/0011-rule-zero-every-control-is-wired-to-real-behaviour.md](../engineering/adr/0011-rule-zero-every-control-is-wired-to-real-behaviour.md)
for the reasoning: a UI that can ship ahead of its backing system
eventually cannot be trusted at all, because a visible button stops
implying a working feature.

This is why the interface is shorter than a genre veteran might expect in
places — a road tool offers only `Straight` and `L-path` because a
grid-drag mode does not exist; the corner buttons carry no gear/settings
icon because there is no settings system apart from the in-game Options
screen. Shorter-but-true beats complete-but-fake.

## Immediate feedback

An action reads back before it is confirmed and again the instant it
lands:

- A tool preview (ghost ribbon, cell block, or extruded volume) shows what
  would be built, tinted invalid the moment it would not fit or afford.
- A cursor-chip stack quotes the live cost and, for an invalid placement,
  the reason — never just a red tint with no explanation.
- District policy toggles flip their local reading at once, ahead of the
  worker's own confirmation over the snapshot channel.

The cross-cutting rules for exactly what this looks like — border
treatment, chip contents, disabled-vs-gated colouring — are in
[interaction.md](interaction.md); this page states only that immediacy is
a requirement, not a nicety.

## Reversibility through undo

Every committed edit is a reversible command: the worker computes and
returns the exact inverse of what it applied, so undo is never a
best-effort approximation of "put it back" — it is the same state
transition run backwards. See
[../engineering/adr/0008-every-tool-commit-is-a-reversible-command.md](../engineering/adr/0008-every-tool-commit-is-a-reversible-command.md).
This is also why the interface can afford to make placement fast and
low-friction (single click for a ploppable, single drag for a road) rather
than gating every commit behind a confirmation dialog — the safety net is
`Ctrl+Z`, not a modal.
