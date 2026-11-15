/**
 * Arca's mark: the chest on a rounded tile — the same drawing as the favicon
 * (app/icon.svg), the home-screen icon and the TaleSpire Symbiote icon.
 *
 * Drawn in theme tokens rather than the favicon's fixed colours: the tile is
 * the primary colour and the chest is cut out of it in the inverse text
 * colour, so it reads in light, dark, and inside TaleSpire's own palette.
 * Decorative — callers put the name "Arca" next to it as text.
 */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <rect width="32" height="32" rx="7" fill="var(--color-primary)" />
      <g
        fill="none"
        stroke="var(--color-text-invert)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M6 15v-2.5C6 9 9.5 7 16 7s10 2 10 5.5V15" />
        <rect x="6" y="15" width="20" height="10" rx="1.5" />
        <path d="M11 8v17M21 8v17" />
      </g>
      <rect x="13.5" y="13" width="5" height="6" rx="1.2" fill="var(--color-text-invert)" />
      <rect x="15.25" y="15.2" width="1.5" height="2.2" rx="0.6" fill="var(--color-primary)" />
    </svg>
  );
}
