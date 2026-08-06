/**
 * Single inline-SVG line-icon set: one set, line style, 20px, no emoji in
 * final chrome. `lucide-react` isn't a project dependency
 * (file ownership forbids adding one), so these are small hand-rolled
 * `<svg>` glyphs sharing one stroke style — one component, zero new deps.
 */
import type { JSX, SVGProps } from 'react';

export type IconName =
  | 'zoning'
  | 'roads'
  | 'electricity'
  | 'water'
  | 'health'
  | 'fire'
  | 'police'
  | 'education'
  | 'parks'
  | 'bulldoze'
  | 'landscaping'
  | 'land-value'
  | 'pollution'
  | 'garbage'
  | 'noise'
  | 'traffic'
  | 'crime'
  | 'happiness'
  | 'info'
  | 'help'
  | 'play'
  | 'pause'
  | 'undo'
  | 'redo'
  | 'trophy'
  | 'close'
  | 'lock'
  | 'infoviews'
  | 'overlay-off'
  | 'city'
  | 'sun'
  | 'leaf'
  | 'transit'
  | 'districts'
  | 'camera'
  | 'menu';

function Base({ children, ...props }: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type Glyph = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const GLYPHS: Record<IconName, Glyph> = {
  zoning: (p) => (
    <Base {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Base>
  ),
  roads: (p) => (
    <Base {...p}>
      <rect x="8" y="2" width="8" height="20" rx="1.5" />
      <line x1="12" y1="4.5" x2="12" y2="19.5" strokeDasharray="3 3" />
    </Base>
  ),
  electricity: (p) => (
    <Base {...p} fill="currentColor" stroke="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </Base>
  ),
  water: (p) => (
    <Base {...p}>
      <path d="M12 3c3 4 6 8.2 6 11.5a6 6 0 1 1-12 0C6 11.2 9 7 12 3Z" />
    </Base>
  ),
  health: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </Base>
  ),
  fire: (p) => (
    <Base {...p}>
      <path d="M12 21a6 6 0 0 0 6-6c0-3-2-4.5-3-6.5-1 2-2 2-2 4a2.5 2.5 0 0 1-3-2.4C8.5 7 12 4.5 11 2c-3 2-7 6-7 11a8 8 0 0 0 8 8Z" />
    </Base>
  ),
  police: (p) => (
    <Base {...p}>
      <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" />
    </Base>
  ),
  education: (p) => (
    <Base {...p}>
      <path d="M2 8 12 4l10 4-10 4-10-4Z" />
      <path d="M6 10v5c0 1.4 2.7 3 6 3s6-1.6 6-3v-5" />
    </Base>
  ),
  parks: (p) => (
    <Base {...p}>
      <path d="M12 2 6.5 11h2.7L5 18h6v3M12 2l5.5 9h-2.7L19 18h-6" />
    </Base>
  ),
  bulldoze: (p) => (
    <Base {...p}>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </Base>
  ),
  landscaping: (p) => (
    <Base {...p}>
      <path d="M18 4a2.3 2.3 0 0 1 0 3.2L10.5 14.7" />
      <path d="M11 12.5 5.3 18.2a2.2 2.2 0 0 0 3.1 3.1L14 15.6" />
      <path d="M4 21h6" />
    </Base>
  ),
  'land-value': (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1.1 1.1-2 2.5-2s2.5.7 2.5 1.8-1 1.6-2.5 2-2.5.9-2.5 2 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
    </Base>
  ),
  pollution: (p) => (
    <Base {...p}>
      <path d="M6 17a3.5 3.5 0 0 1 .5-7 4.5 4.5 0 0 1 8.7-1.6A3.8 3.8 0 0 1 18 15.6a1 1 0 0 1-.2 1.4H6Z" />
    </Base>
  ),
  garbage: (p) => (
    <Base {...p}>
      <path d="M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  ),
  noise: (p) => (
    <Base {...p}>
      <path d="M4 10v4h3l5 4V6l-5 4H4Z" />
      <path d="M16 9a4.2 4.2 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
    </Base>
  ),
  traffic: (p) => (
    <Base {...p}>
      <rect x="8" y="2" width="8" height="6" rx="1.5" />
      <circle cx="10.5" cy="5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="5" r="0.6" fill="currentColor" stroke="none" />
      <path d="M6 10h12l1.5 5v6h-3v-2H7.5v2h-3v-6Z" />
      <circle cx="8" cy="18" r="1.3" />
      <circle cx="16" cy="18" r="1.3" />
    </Base>
  ),
  crime: (p) => (
    <Base {...p}>
      <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" />
      <line x1="9.5" y1="12" x2="14.5" y2="12" />
    </Base>
  ),
  happiness: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" />
      <circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </Base>
  ),
  info: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
    </Base>
  ),
  help: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.4 2.4 0 1 1 3.3 2.2c-.9.5-1 .9-1 1.9" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
    </Base>
  ),
  play: (p) => (
    <Base {...p} fill="currentColor" stroke="none">
      <path d="M7 4.5v15l13-7.5-13-7.5Z" />
    </Base>
  ),
  pause: (p) => (
    <Base {...p} fill="currentColor" stroke="none">
      <rect x="6" y="4" width="4.5" height="16" rx="1" />
      <rect x="13.5" y="4" width="4.5" height="16" rx="1" />
    </Base>
  ),
  undo: (p) => (
    <Base {...p}>
      <path d="M8 8 4 12l4 4" />
      <path d="M4 12h10a6 6 0 0 1 0 12h-2" />
    </Base>
  ),
  redo: (p) => (
    <Base {...p}>
      <path d="M16 8l4 4-4 4" />
      <path d="M20 12H10a6 6 0 0 0 0 12h2" />
    </Base>
  ),
  trophy: (p) => (
    <Base {...p}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.5v2A3 3 0 0 0 7 10M17 5h2.5v2A3 3 0 0 1 17 10" />
      <path d="M12 13v3M9 20h6M10 20v-1.5a2 2 0 0 1 4 0V20" />
    </Base>
  ),
  close: (p) => (
    <Base {...p}>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </Base>
  ),
  lock: (p) => (
    <Base {...p}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Base>
  ),
  infoviews: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
    </Base>
  ),
  'overlay-off': (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
    </Base>
  ),
  city: (p) => (
    <Base {...p}>
      <rect x="3" y="10" width="4" height="11" />
      <rect x="10" y="5" width="4" height="16" />
      <rect x="17" y="13" width="4" height="8" />
    </Base>
  ),
  sun: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </Base>
  ),
  leaf: (p) => (
    <Base {...p}>
      <path d="M20 4c-9 0-16 5-16 13 0 1.5.3 2.6.7 3 5-1 12-4 15-10 1-2 1.3-4 .3-6Z" />
      <path d="M5 20c2-4 5-7 10-9" />
    </Base>
  ),
  transit: (p) => (
    <Base {...p}>
      <rect x="5" y="4" width="14" height="12" rx="2" />
      <line x1="5" y1="10" x2="19" y2="10" />
      <circle cx="8.5" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8 16v3M16 16v3" />
    </Base>
  ),
  districts: (p) => (
    <Base {...p}>
      <path d="M3 4h8v8H3zM13 8h8v12h-8zM3 14h8v6H3z" />
    </Base>
  ),
  camera: (p) => (
    <Base {...p}>
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </Base>
  ),
  menu: (p) => (
    <Base {...p}>
      <line x1="4" y1="6.5" x2="20" y2="6.5" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17.5" x2="20" y2="17.5" />
    </Base>
  ),
};

/** All known icon names, in declaration order — handy for exhaustive tests/menus. */
export const ICON_NAMES: readonly IconName[] = Object.keys(GLYPHS) as IconName[];

export function Icon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>): JSX.Element {
  const Glyph = GLYPHS[name];
  return <Glyph {...props} />;
}
