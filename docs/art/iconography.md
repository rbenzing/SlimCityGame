# Iconography

One rule set, verified against `src/ui/icons.tsx` and
[ui-style-guide.md](ui-style-guide.md).

## One inline-SVG line-icon set

Every icon in the overlay comes from a single hand-rolled component,
`Icon` in `src/ui/icons.tsx` — there is no second icon set anywhere in
`src/ui`. `lucide-react` was considered and rejected specifically because
it is not a project dependency; adding one for a few dozen glyphs was
judged not worth the new dependency when the glyphs needed are simple
enough to hand-draw sharing one stroke style (see
[naming-conventions.md](naming-conventions.md) for the project's general
posture on minimising dependencies).

37 icons exist today (`ICON_NAMES`, the `IconName` union in `icons.tsx`),
covering the build categories (`zoning`, `roads`, `electricity`, `water`,
`health`, `fire`, `police`, `education`, `parks`, `bulldoze`,
`landscaping`), the infoview lenses (`land-value`, `pollution`, `noise`,
`traffic`, `crime`, `happiness`), transport/administration
(`transit`, `districts`), sim/UI chrome (`info`, `help`, `play`, `pause`,
`undo`, `redo`, `trophy`, `close`, `lock`, `infoviews`, `overlay-off`,
`city`, `sun`, `leaf`, `camera`, `advisor`, `menu`), and `garbage`. Every
name maps to exactly one glyph — there is no per-context variant of the
same icon.

## Construction and sizing

Every glyph shares one `Base` wrapper (`icons.tsx`):

- `viewBox="0 0 24 24"`, rendered at `20×20` px by default (overridable via
  the same `SVGProps` a caller passes through, e.g. `className="h-4 w-4"`
  or `"h-3.5 w-3.5"` where a smaller context calls for it).
- `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.8}`,
  `strokeLinecap="round"`, `strokeLinejoin="round"` — one consistent line
  weight and cap style across every icon, so a road icon and a happiness
  icon read as the same visual family.
- `currentColor` means an icon always inherits its container's text
  colour rather than carrying its own — the same glyph renders white,
  accent-tinted, or dimmed purely from the button state around it (see
  [../ux/components.md](../ux/components.md) for the button/toggle
  states that drive this).
- A handful of glyphs deliberately break the outline-only rule where a
  filled shape reads better at this size — `electricity` (a solid
  lightning bolt), `play`/`pause` (solid shapes), and the small solid dots
  used as accents inside a few icons (`traffic`'s signal lights,
  `happiness`'s eyes) — each sets its own `fill="currentColor"
stroke="none"` locally rather than changing the shared default.

## Decorative by default

`Base` sets `aria-hidden="true"` on every icon unless a caller overrides
it, so an icon never doubles up with the accessible name a surrounding
button already supplies via its own `aria-label` — see
[../ux/accessibility.md](../ux/accessibility.md). A caller only needs to
override this when the icon **is** the entire accessible content with no
labelled container around it, which does not currently happen anywhere in
the overlay.

## No emoji in final chrome — with named, tracked exceptions

The rule is explicit in [ui-style-guide.md](ui-style-guide.md): no emoji
belongs in finished chrome. A small number still stand in for a glyph
that has not been drawn into the icon set yet — the happiness face
(`happinessFace()` in `src/ui/format.ts`, four literal emoji stepped by
score), the population-count glyph and toast severity glyphs
(`StatusStrip.tsx`, `Toasts.tsx`). Each of these is marked
`aria-hidden="true"` and, in `Toasts.tsx`, carries a `data-placeholder`
attribute precisely so it can be found and swapped for a drawn icon later
rather than being mistaken for a finished design decision. See
[../ux/accessibility.md](../ux/accessibility.md) for why "hidden from
assistive tech" is a mitigation here, not a fix.
