import type { SVGProps } from "react";

/**
 * The icon set, inline.
 *
 * No icon library and no sprite fetch: the Symbiote panel loads in TaleSpire's
 * embedded browser, where every extra request is a visible delay on open. These
 * are the same paths the mockups use.
 *
 * Icons are always decorative here — `aria-hidden` is hard-coded on. Every
 * icon-only control gets its meaning from a sibling `.sr-only` label instead,
 * so the accessible name lives with the control rather than with the glyph.
 */
export type IconName =
  | "chest"
  | "pack"
  | "wagon"
  | "lock"
  | "menu"
  | "search"
  | "close"
  | "plus"
  | "minus"
  | "arrow-right"
  | "chevron-up"
  | "chevron-down"
  | "more"
  | "filter"
  | "check"
  | "alert"
  | "info"
  | "trash"
  | "sun"
  | "moon";

const PATHS: Record<IconName, React.ReactNode> = {
  chest: (
    <>
      <rect x="1.5" y="4.5" width="13" height="9" rx="1" />
      <path d="M1.5 8h13" strokeLinecap="round" />
      <rect x="7" y="6.5" width="2" height="3" rx="0.5" fill="currentColor" stroke="none" />
    </>
  ),
  pack: (
    <>
      <path d="M4 6V4.5a4 4 0 0 1 8 0V6" />
      <rect x="2.5" y="6" width="11" height="7.5" rx="1.5" />
    </>
  ),
  wagon: (
    <>
      <rect x="1.5" y="4" width="10" height="6" rx="1" />
      <circle cx="4.5" cy="12" r="1.8" />
      <circle cx="11" cy="12" r="1.8" />
      <path d="M11.5 6h2l1 4" strokeLinecap="round" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6" rx="1" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  menu: <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path
        d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11 3.05 3.05"
        strokeLinecap="round"
      />
    </>
  ),
  moon: (
    <path
      d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"
      strokeLinejoin="round"
    />
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />,
  plus: <path d="M8 3v10M3 8h10" strokeLinecap="round" />,
  minus: <path d="M3 8h10" strokeLinecap="round" />,
  "arrow-right": (
    <path d="M2 8h11M9.5 4.5 13 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  "chevron-up": <path d="M4 10l4-4 4 4" strokeLinecap="round" />,
  "chevron-down": <path d="M4 6l4 4 4-4" strokeLinecap="round" />,
  more: (
    <>
      <circle cx="8" cy="3.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  filter: <path d="M2 4h12M4.5 8h7M6.5 12h3" strokeLinecap="round" />,
  check: <path d="M3.5 8.5 6.5 11.5 12.5 5" strokeLinecap="round" strokeLinejoin="round" />,
  alert: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 11v.01" strokeLinecap="round" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.5v3.5M8 5v.01" strokeLinecap="round" />
    </>
  ),
  trash: (
    <path
      d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5"
      strokeLinecap="round"
    />
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
