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

/**
 * A floating panel scrolls inside itself rather than run under the dock, which
 * reaches 6.5rem up from the bottom edge. One recipe per top offset a panel hangs from.
 */
export const SCROLL_FROM_TOP_16 = 'max-h-[calc(100vh-10.5rem)] overflow-y-auto';
export const SCROLL_FROM_TOP_28 = 'max-h-[calc(100vh-13.5rem)] overflow-y-auto';
export const SCROLL_FROM_THIRD = 'max-h-[calc(66.6vh-6.5rem)] overflow-y-auto';

/** Uppercase 10px tracking-wide grey label text. */
export const LABEL = 'uppercase text-[10px] tracking-wide text-white/60';
