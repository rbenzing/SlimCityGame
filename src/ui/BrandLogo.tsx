/**
 * SlimCity wordmark: self-contained inline SVG (no external image/font/network
 * assets), so it renders identically in the packaged app and in tests. Two-tone
 * text ("Slim" light + "City" bold) sits on a tiny building-blocks skyline.
 * Uses currentColor for the skyline + "Slim" so callers can tint the whole
 * mark via `className` (e.g. `text-white`); "City" uses the shared
 * `--color-accent` token so it reads on any dark menu backdrop without a
 * hardcoded light-only palette.
 */
export default function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 96"
      width="100%"
      role="img"
      aria-label="SlimCity"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* tiny skyline / building-blocks motif, tucked behind the wordmark */}
      <g fill="currentColor" opacity={0.85}>
        <rect x="8" y="46" width="14" height="30" rx="1.5" />
        <rect x="26" y="34" width="14" height="42" rx="1.5" />
        <rect x="44" y="54" width="14" height="22" rx="1.5" />
      </g>
      <text
        x="70"
        y="64"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="44"
        fontWeight={300}
        letterSpacing="0.5"
        fill="currentColor"
      >
        Slim
        <tspan fontWeight={800} fill="var(--color-accent, #38b6e3)">
          City
        </tspan>
      </text>
    </svg>
  );
}
