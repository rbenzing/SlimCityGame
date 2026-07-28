/**
 * Shared Tailwind utility-class recipes for the style tokens.
 * Kept as plain class-string constants (not a custom CSS class) so every
 * panel stays in the same Tailwind-utility idiom as the rest of src/ui;
 * the actual color tokens are registered in styles.css's `@theme` block.
 */

/** Panel chrome: dark translucent, subtle border, soft shadow. */
export const PANEL =
  'bg-panel/85 backdrop-blur-md border border-[#ffffff14] shadow-[0_4px_24px_#0008]';
/** Panel chrome + the 10px "panel/drawer" corner radius. */
export const PANEL_ROUNDED = `${PANEL} rounded-[10px]`;
/** The 6px "card/chip" corner radius, for use alongside PANEL. */
export const CARD_RADIUS = 'rounded-[6px]';

/** Uppercase 10px tracking-wide grey label text. */
export const LABEL = 'uppercase text-[10px] tracking-wide text-white/60';
