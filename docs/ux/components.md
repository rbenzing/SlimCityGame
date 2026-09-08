# Components

The reusable pieces every panel is built from, and where each is actually
defined. Colour, spacing, and radius **values** live in one place —
[../art/ui-style-guide.md](../art/ui-style-guide.md) — and are not
repeated here; this page is about shape and when to reach for each piece.

Shared recipes live in `src/ui/theme.ts` as plain Tailwind class-string
constants (`PANEL`, `PANEL_ROUNDED`, `CARD_RADIUS`, `LABEL`) rather than
custom CSS classes, so every panel stays in the same Tailwind-utility idiom
as the rest of `src/ui`. Icons are a single set, covered in
[../art/iconography.md](../art/iconography.md) rather than here.

## Panels

A floating chrome surface: `PANEL` (dark translucent background, a 1px
border, a soft drop shadow) or `PANEL_ROUNDED` (`PANEL` plus a 10px
corner radius) from `theme.ts`. Every docked bar, drawer, and popover uses
one of the two. Reach for `PANEL_ROUNDED` for anything that is its own
floating island (a popover, the drawer, a side panel); `PANEL` alone suits
a bar flush against a screen edge, where a rounded corner would look
wrong (the status strip, `StatusStrip.tsx`, is the one bar-not-drawer case
and uses plain `PANEL`).

Examples: `AdvisorPanel.tsx`, `DistrictPanel.tsx`, `InfoPanel.tsx`,
`JunctionPanel.tsx`, `MainDock.tsx`, `AssetDrawer.tsx`,
`ToolOptionsPanel.tsx`, `TransitLinesPanel.tsx`.

## Popovers

`PopoverFrame` in `src/ui/Popovers.tsx` — a small `PANEL_ROUNDED` card
with an uppercase caps-label title row and an optional close button
(`role="dialog"`, `aria-label` set to the title). Used for read-only
informational content opened from a corner button or the milestone
badge: `MilestonePopover`, `CityInfoPopover`, `HelpPopover`. Reach for this
rather than a bespoke panel whenever the content is a short, read-only
list with no interactive rows of its own — the moment a popover needs its
own toggles or inputs, it has outgrown this component (compare
`DistrictPanel.tsx`, which is a full panel rather than a popover precisely
because its rows are interactive).

## Cards

The asset-drawer's pictogram tile (`AssetDrawer.tsx`, `CardPictogram` +
its enclosing `<button>`): a `w-24` card, `CARD_RADIUS` (6px) corners, a
flat-shaded pictogram on top (a tinted silhouette for a ploppable, a
cross-section stripe for a road, a colour block for a zone, a
raise/lower/level/smooth glyph for terraform), the item's name, and a cost
chip. Three states, each a distinct visual treatment rather than a shared
"disabled" look:

- **Selected** — accent border + accent-tinted fill (`aria-pressed=true`).
- **Gated by milestone** — 40% opacity, a lock icon, and a `title` naming
  the milestone that unlocks it; still clickable-looking but refuses the
  click (`disabled`).
- **Plain** — transparent border, a faint hover fill.

This is the only card component in the overlay; every buildable/paintable
thing in every drawer category renders through it.

## Chips

Two distinct things share the name "chip" here, and neither is a card:

- **Toggle chips** — the `CHIP` / `CHIP_ON` / `CHIP_OFF` / `CHIP_STEP`
  class constants local to `RoadToolOptions.tsx`: a small rounded-`md`
  pill, accent-filled when on (`CHIP_ON`), translucent white when off
  (`CHIP_OFF`), used for every segmented choice in the road tool's own
  options row (`Path`, lane count, `Middle`, `Snap`, `Replace`,
  parking/bike side) and for the sub-tab row in the asset drawer's own
  header treatment. `CHIP_STEP` is the same shape for a step +/− control
  (posted speed, road elevation) rather than an on/off toggle. Reach for
  these for any small inline choice that lives inside another panel's own
  header or options row, not as a standalone floating panel.
- **Cursor chips** — the small stack that follows the pointer while a tool
  is active (`src/app/cursorchip.ts`, rendered outside React entirely,
  alongside the viewport input in `main.ts`), carrying the live cost and,
  for an invalid placement, the reason. Covered fully in
  [interaction.md](interaction.md) — it is DOM but deliberately not a
  React component, since it has to update every pointer move without a
  React re-render.

## Buttons

Every clickable control in the overlay is a real `<button type="button">`
(there are no `onClick`-bearing `<div>`s anywhere in `src/ui`), which is
what makes Tab-and-Enter operability free — see
[accessibility.md](accessibility.md). Three recurring shapes:

- **Circular icon button** — the top-corner utility buttons
  (`CornerButtons.tsx`) and the main dock's category/infoview buttons
  (`MainDock.tsx`): a filled circle, accent-filled when active, otherwise
  transparent with a hover fill.
- **Text menu button** — `MenuButton` in `StartMenu.tsx`: a wide rounded
  rectangle, white-on-translucent, disabled to 30% opacity with the click
  refused (Save/Load/Quit without an active game or save).
- **Small utility button** — a close (✕), a load/delete row action
  (`SaveBrowser.tsx`), a back action (`OptionsPanel.tsx`,
  `SaveBrowser.tsx`) — plain text or icon at reduced opacity, no chrome of
  its own beyond a hover fill.

## Toggles

Three different visual treatments, all wired to the same `aria-pressed`
convention (see [accessibility.md](accessibility.md)) rather than a native
`role="switch"`:

- **Chip toggle** — the `CHIP`/`CHIP_ON`/`CHIP_OFF` pill above, for a
  choice inside another panel's own row.
- **Checkbox** — a native `<input type="checkbox">` styled with
  `accent-accent`, used only in `OptionsPanel.tsx` (Bloom, Sandbox,
  Unlimited money, Mute) — the one place the overlay uses a native form
  control instead of a custom button.
- **Pill switch** — `DistrictPanel.tsx`'s policy rows: a full-width
  `<button>` whose right-hand side draws a small rounded track with a
  sliding dot (`justify-end`/`justify-start` on the track flips the dot's
  side). Visually a switch, but semantically a toggle button
  (`aria-pressed`), not `role="switch"` — kept consistent with every other
  toggle in the overlay rather than introducing a second convention for
  one panel.

## Sliders

A native `<input type="range">`, `accent-accent` for the fill colour, no
custom track/thumb styling. Every slider in the overlay: terraform brush
radius and strength (`ToolOptionsPanel.tsx`), master volume and music
volume (`OptionsPanel.tsx`, `MusicPanel.tsx`), and the music seek bar
(disabled until a track is chosen). A stepped numeric value that has a
small, discrete range instead uses a pair of +/− `CHIP_STEP` buttons
rather than a slider — posted speed and road elevation both do this,
since a slider implies a continuous range neither actually has.

## Level pips

A building's `LEVEL` row in `InfoPanel.tsx`: three `h-3.5 w-1.5
rounded-sm` pips, filled up to the building's level with
`--color-positive`, empty ones at `#ffffff1f`. Defined inline where it is
drawn rather than as a shared component or a `theme.ts` recipe — there is
exactly one place in the overlay a level reads out, so a shared component
would be an abstraction with one caller.
