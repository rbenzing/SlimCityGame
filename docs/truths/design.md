# Truths — Game design and interface

Back to [the index](../GROUND-TRUTHS.md).


- [R-design-001] Rule Zero: every rendered control is wired to real, currently consumed
  behaviour. An unbuilt feature is absent and listed in
  [DESIGN.md](../DESIGN.md), never a disabled, placeholder or "coming soon"
  control. —
  [ADR-0011](../engineering/adr/0011-rule-zero-every-control-is-wired-to-real-behaviour.md),
  [ux/README.md](../ux/README.md)
- [R-design-002] A tuning constant lives in code and [balancing.md](../game-design/balancing.md)
  names its file. Change the number in the code, never only the doc, and never
  create a second copy of a dial. —
  [game-design/README.md](../game-design/README.md)
- [R-design-003] There are no difficulty levels; game speed (0, 1, 2, 4) changes pacing only,
  never a rule. — [difficulty.md](../game-design/difficulty.md)
- [R-design-004] Progression is by milestone, never "level" or "tier"; buildings have levels
  1–3. — [progression.md](../game-design/progression.md)
- [R-design-005] The Advisor re-ranks every tenth snapshot, sorts by severity, then affected
  count, then fixed priority so it never reshuffles under the cursor, and
  returns an empty list for a healthy city. —
  [progression.md](../game-design/progression.md), [hud.md](../ux/hud.md)
- [R-design-006] The Advisor reports a grid too small for its city as a shortage ("build
  another plant"), never as a gap in the network, and says so for as long as
  a building stands dark from it or growth waits on it. —
  [progression.md](../game-design/progression.md#the-advisor-detecting-and-ranking-problems);
  `cityIssues` in `src/ui/advisor.ts`
- [R-design-007] The Advisor reports zoned land the road it fronts brings no power or water:
  an empty zoned tile beside a road, without a utility its zone needs. Before
  it, a town zoned down a gravel road, which carries no cable, sat empty with
  the Advisor silent, since no building stood there to carry a flag. Ground
  zoned too deep to reach the road is not counted; the road is not what fails
  it. —
  [progression.md](../game-design/progression.md#the-advisor-detecting-and-ranking-problems);
  `zonedUnserved` in `src/sim/growth.ts`
- [R-design-008] A tool preview reads back before commit: invalid tint plus a cursor-chip
  reason ("Insufficient funds", "Locked", "Overlapping items"), never a red tint
  alone. — [ux-design.md](../ux/ux-design.md), [interaction.md](../ux/interaction.md)
- [R-design-009] A road off the grid is previewed by the same `planSegment` its command runs,
  against the render thread's mirror of the grid and the road network, so the
  ghost and the command never disagree about what may be laid. A motorway
  offers no `Grid` mode. — [road-network.md](../world-sim/road-network.md),
  [interaction.md](../ux/interaction.md)
- [R-design-010] A road option that would compose a road the tool refuses is disabled with
  the refusal as its tooltip, never offered and then refused; the choice
  already made is never disabled. A selected tool's card is always on the
  drawer's visible sub-tab: opening another sub-tab puts the tool down. —
  [hud.md](../ux/hud.md), [road-model.md](../world-sim/road-model/README.md); `layRefusal`
  in `src/shared/roadprofile.ts`, `src/ui/RoadToolOptions.tsx`
- [R-design-011] Disabled (nothing to do now, about 30% opacity) and gated by milestone (40%
  opacity, lock, tooltip naming the milestone) are distinct treatments and are
  never merged. — [interaction.md](../ux/interaction.md),
  [components.md](../ux/components.md)
- [R-design-012] Text the layout may cut short (a card's name, a track's title, anything
  `truncate`d) always carries its full text as a `title` tooltip; a clipped
  label the player cannot read in full is a broken control. —
  [components.md](../ux/components.md), [accessibility.md](../ux/accessibility.md)
- [R-design-013] Escape is a fixed stack: leave photo mode, cancel the drag, close the drawer,
  drop the tool to select and deselect. In the pause menu Escape only means
  Resume; on the start screen it does nothing. Opening the pause overlay pauses
  at the running speed and Resume restores that exact speed. —
  [interaction.md](../ux/interaction.md), [menu-flow.md](../ux/menu-flow.md)
- [R-design-014] New Game, Load and Quit write an intent to `sessionStorage` and reload; there
  is no in-app teardown path. Save and Options act on the live game. —
  [menu-flow.md](../ux/menu-flow.md)
- [R-design-015] Every clickable control is a real `<button type="button">` or a native input;
  toggles use `aria-pressed`, never `role="switch"`; icon-only buttons carry
  `aria-label`. — [accessibility.md](../ux/accessibility.md),
  [components.md](../ux/components.md)
- [R-design-016] A key binding is listed in the docs or the Help popover only after it is
  verified against `main.ts` and `App.tsx`; never an aspirational binding. —
  [hud.md](../ux/hud.md), [input-mapping.md](../ux/input-mapping.md)
- [R-design-017] A game-design document precedes the technical plan, which precedes the code.
  A shipped design document stays as a record of intent, and the behaviour moves
  to the specifications. —
  [game-design/features/README.md](../game-design/features/README.md)

