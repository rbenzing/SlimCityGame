# ADR-0014: Genre grammar is adopted deliberately; originality applies to names, assets, and branding, not genre vocabulary

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28). The project's
stated identity includes the city-builder genre's UI grammar directly —
bottom toolbar with category tabs and an asset-card panel, top-left city
info with a milestone XP bar, top-right time/weather controls, infoview
lenses, demand bars docked at the zoning tools — and the visual-parity
spec is explicitly derived from reference city-builder screenshots
(2026-07-21). An instinct toward an original UI with no genre conventions
was considered and set aside.

## Decision

SlimCity deliberately reuses the city-builder genre's established
grammar — UI layout conventions and mechanic vocabulary (zoning, RCI
demand, milestones, infoviews, service radius, and the like) — rather
than inventing its own from scratch. Originality is spent elsewhere:
names, visual assets, and branding are original to SlimCity and must
never reference or imitate any specific commercial game.

## Consequences

- **Good:** players already fluent in the genre can operate SlimCity's UI
  and mechanics without a learning curve, which matters for a
  small-form-factor showcase with no scope budget to teach a novel
  interaction model; design effort goes into execution — visual language,
  performance, the engine showcase — instead of re-litigating solved UI
  and mechanic problems.
- **Bad:** SlimCity forecloses a distinctive interaction identity of its
  own at the grammar level — it will always read as a city builder in the
  familiar mould rather than something that differentiates on UI or
  mechanic novelty; every future feature has to fit genre expectations
  first, which can rule out mechanically interesting ideas that do not
  match the grammar players expect.
- **Neutral:** this puts the entire burden of "originality" on names,
  assets, and branding — a narrower, more easily policed surface than
  genre-level mechanic or UI invention would have been, and exactly what
  the project's no-commercial-game-references convention enforces.

## Alternatives considered

- **"Original UI / no genre conventions":** rejected — "the project's
  identity IS the genre's grammar" (DESIGN.md rejected list); originality
  was redirected to names, assets, and branding instead.

---
