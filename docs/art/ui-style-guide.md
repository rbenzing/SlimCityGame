# Tokens

The DOM overlay draws from a small, fixed token set rather than picking
colors or sizes per component. Every color token is a real Tailwind v4
`@theme` entry in `src/ui/styles.css`, so it doubles as a `bg-`, `text-`, or
`border-` utility (opacity modifiers included, e.g. `bg-panel/85`) — that
file is the authority; change a color there; do not hardcode a new hex
value in a component. The shared non-color recipes (panel chrome, label
text, corner radii) live as class-string constants in `src/ui/theme.ts`,
kept there rather than as a custom CSS class so every panel stays in the
same Tailwind-utility idiom as the rest of `src/ui`.

## Color

| Token              | Value     | Reach for it when…                                                               |
| ------------------ | --------- | -------------------------------------------------------------------------------- |
| `--color-panel`    | `#0d1621` | any panel, drawer, or floating chrome background.                                |
| `--color-accent`   | `#38b6e3` | a control is active, selected, or a link — the one "this is on" color.           |
| `--color-positive` | `#5dd06b` | a reading is good: a filled level pip, a positive funds delta, an upward trend.  |
| `--color-warning`  | `#f0a13c` | drawing attention without signaling failure, e.g. the milestone trophy glyph.    |
| `--color-danger`   | `#e5533f` | invalid placement, a problem chip, a negative funds delta or downward trend.     |
| `--color-rci-res`  | `#63c96a` | residential demand and zone tint — the dock's R bar and every res zone card.     |
| `--color-rci-com`  | `#4a9fe3` | commercial demand and zone tint — the dock's C bar and every com zone card.      |
| `--color-rci-ind`  | `#e3a44a` | industrial demand and zone tint — the dock's I bar and the industrial zone card. |

The RCI colors are the one place a single token drives both a status
readout (the dock's demand bars) and a content color (the zone cards in the
asset drawer) — that reuse is deliberate: the player learns the color once.

## Type

- Body font: Inter, falling back to `system-ui`, `-apple-system`, then
  generic sans-serif (set once on `html`/`body` in `styles.css`).
- Panel body text: white at 92% opacity — the default reading color inside
  a panel.
- Field labels: uppercase, 10px, letter-spacing wide, white at 60% opacity
  — the `LABEL` recipe in `theme.ts`. Reach for it for any left-hand row
  label (`ZONE`, `LEVEL`, `UPKEEP`) or section caption, never for body copy.

## Panel chrome and radius

- `PANEL` (`theme.ts`): dark translucent background (`bg-panel/85
backdrop-blur-md`), a 1px `#ffffff14` border, and a soft
  `0 4px 24px #0008` drop shadow. This is the base chrome for every panel,
  drawer, and popover.
- `PANEL_ROUNDED`: `PANEL` plus a 10px corner radius. Reach for this for a
  whole panel or drawer.
- `CARD_RADIUS`: a 6px corner radius, used alongside `PANEL` for anything
  smaller sitting inside a panel — asset cards, chips, pictograms.

## Iconography

The chrome uses one inline-SVG line-icon set (`src/ui/icons.tsx`): 20×20px,
`viewBox 0 0 24 24`, 1.8px stroke, `currentColor`, one visual style across
every glyph. `lucide-react` was considered and rejected — it is not a
project dependency, so the icons are small hand-rolled SVGs sharing the
same stroke rather than adding one for a few dozen glyphs. No emoji belongs
in finished chrome; where one still stands in for a glyph that hasn't been
drawn yet (a numeric readout like the population count, or the happiness
face), it is a placeholder and should be inventoried for replacement rather
than treated as final.

## Level pips

A building's `LEVEL` row reads as three 6×14px rounded-sm pips: filled
pips use `--color-positive`, empty ones use `#ffffff1f`. This pair is
defined inline where it is drawn (`InfoPanel.tsx`), not in `theme.ts` —
change it there if the pip look ever needs to move.
