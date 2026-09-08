# Accessibility

What is actually done, verified against the code, and — just as
important — what is not. 31 files under `src/ui/` carry `aria-`
attributes (`grep -rl "aria-" src/ui | wc -l`); this page describes what
they do rather than restating that count as an achievement.

## What is done

### Every interactive control is a real `<button>` or native form input

There is not one `onClick` handler on a `<div>` anywhere in `src/ui` — every
clickable control is a `<button type="button">`, and every checkbox/slider
is a native `<input type="checkbox">`/`<input type="range">`. This is the
single biggest accessibility fact about the overlay: it means every
control is reachable by `Tab`, activates on `Enter`/`Space` (buttons) or
arrow keys (range inputs), and shows up in a screen reader's default
control list, all for free from the browser rather than from any custom
keyboard-handling code the project had to write and could get wrong.

### The `aria-pressed` toggle convention

Every toggle in the overlay — a category button, an infoview lens, a
road-options chip, a district-policy pill switch, a corner utility
button — sets `aria-pressed={active}` rather than relying on a colour
change alone. This is consistent across every toggle family; see
[components.md](components.md) for what each family looks like. A plain
non-toggling action button (Close, Back, Undo, Redo) does not set
`aria-pressed`, since it has no on/off state to report.

### Labelling

- Every icon-only button carries `aria-label` naming its action
  (`"Close advisor"`, `"Undo"`, `"Rotate ploppable"` is actually `R` — not
  a button — but e.g. `"Post a lower speed"`, `"Raise the road"`). The
  icon itself renders `aria-hidden="true"` by default
  (`src/ui/icons.tsx`'s `Base` component) so a labelled button never
  double-announces via both the label and the glyph's own content.
- Grouped controls carry `role="group"` (or `role="toolbar"`,
  `role="tablist"`/`role="tab"`, `role="menu"`) with an `aria-label` naming
  the group — `"Simulation speed"`, `"Build categories"`, `"Lanes"`,
  `"Between the directions"`, `"RCI demand"` — so a screen reader
  announces what a cluster of otherwise-unlabelled buttons is choosing
  between, not just each button in isolation.
- Full-screen overlays declare `role="dialog"` with an `aria-label`
  (`StartMenu`, `OptionsPanel`, `SaveBrowser`, the popovers, the advisor
  panel) — there is no focus trap or modal `aria-modal` attribute, so this
  is a labelling convention rather than true modal semantics (see gaps
  below).
- The status strip is `role="contentinfo"`; a toast is `role="status"`,
  so a screen reader's live-region handling picks up a new notification
  without the page needing to move focus to it.
- Per-lane and per-arm junction controls carry a full sentence as their
  label rather than a short name — `"From the north, lane 1: Left"`,
  `"{arm}, lane {n}: {movement}"` — because a bare `"Left"` button would be
  meaningless out of visual context, and the visual context (which lane,
  which arm) is exactly what a screen reader cannot see.

### Live regions

The road tool's elevation readout (`"Ground"` / `"{n} m"`) is
`aria-live="polite"`, so raising or lowering the road announces the new
height without moving focus away from the +/− buttons driving it.

### Decorative content is marked as decorative

Purely visual elements — the bar dividers in the status strip, the sun/
leaf season glyph's own icon, the emoji stand-ins (population count icon,
happiness face, toast severity glyphs) — carry `aria-hidden="true"`, so
they never surface as unlabelled noise to a screen reader; the meaningful
text beside them (the actual number, the actual severity) is what gets
read.

## What is genuinely not done

- **No screen-reader pass.** The attributes above are the honest result of
  following a labelling convention while building each panel, not the
  product of testing with NVDA, JAWS, or VoiceOver. Reading order,
  verbosity, and whether a screen reader's rotor makes sense of the panel
  structure above are all unverified.
- **No contrast audit.** `ui-style-guide.md`'s token palette was chosen for
  legibility over the 3D viewport, not checked against WCAG contrast
  ratios; several tokens (`text-white/60`, `text-white/50`, `text-white/45`
  label and secondary text) are visually subtle by design and have not
  been measured.
- **No reduced-motion handling.** There is no `prefers-reduced-motion`
  media query anywhere in `src/`. Camera inertia damping, the day/night
  cycle, water animation, clouds, and bloom all run unconditionally; a
  player who has asked their OS to reduce motion gets no accommodation
  from this project.
- **No custom focus styling.** There is no `:focus-visible` rule and no
  `tabIndex` override anywhere in `src/ui` — keyboard focus relies
  entirely on the browser's own default focus ring, unstyled and unchecked
  against the dark panel backgrounds it has to show up on.
- **No controller support.** See [input-mapping.md](input-mapping.md) — no
  `Gamepad` API usage exists, so nothing in the overlay or the world is
  reachable from a controller.
- **A locked asset card's lock state is a `title` tooltip, not an
  announced state.** The card sets `disabled` (which a screen reader does
  announce) and a lock icon plus a `title` naming the unlocking milestone,
  but `title` attributes are not reliably surfaced by screen readers — the
  _reason_ a card is locked is, in practice, a sighted-mouse-hover-only
  affordance today.
- **Emoji placeholders remain non-final chrome.** The happiness face and a
  few numeric-readout glyphs are literal emoji rather than the project's
  own icon set, explicitly called out as placeholders in
  [../art/ui-style-guide.md](../art/ui-style-guide.md) and in the
  `Toasts.tsx`/`StatusStrip.tsx` source (`data-placeholder="emoji"`). They
  are marked `aria-hidden` so they cost nothing today, but they are listed
  here because "marked decorative" is a workaround, not a fix — the glyph
  itself was never meant to ship this way.

None of the above is invented work-to-do — see
[../DESIGN.md](../DESIGN.md) for anything on an actual backlog. This page
exists so a reader can tell the difference between "not yet audited" and
"actively broken," which the aria-attribute count alone cannot say.
