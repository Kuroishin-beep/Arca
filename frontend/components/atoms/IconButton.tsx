import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "@frontend/components/atoms/Icon";

/** The one place the icon-control's box is described. Shared with
 *  `IconButtonLink` so a control that navigates and a control that acts are
 *  the same size and the same weight — they read as one family in the bar
 *  because they are. */
const SHELL =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-muted hover:bg-surface2 hover:text-text";

/**
 * The icon-only control — Design.md Step E.
 *
 * Its whole reason to exist is the `label` prop being **required**. An
 * icon-only button with no accessible name is a button that reads as "button"
 * to a screen reader, and the way that happens is never a decision — it is a
 * component that let the name be optional. Here it cannot be: the same string
 * becomes the `aria-label` and the `title`, so the hover tooltip and the
 * accessible name are one value and cannot drift apart.
 *
 * `h-8 w-8` is 32×32, which is the design system's minimum hit target inside
 * the panel. Below the `panel` breakpoint the checklist asks for 44×44, which
 * is what `sm:h-8` down to a larger base size gives the callers that need it —
 * pass it through `className` rather than baking a second size in here.
 *
 * `type` defaults to "button" on purpose. A bare `<button>` inside a `<form>`
 * defaults to *submit*, so a decorative icon button dropped next to a form
 * field would silently submit it; the one caller that genuinely wants to
 * submit says so.
 */
export function IconButton({
  icon,
  label,
  size = 16,
  type = "button",
  className = "",
  ...props
}: {
  icon: IconName;
  /** Required. Becomes both the accessible name and the tooltip. */
  label: string;
  size?: number;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children">) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={label}
      className={`${SHELL} ${className}`}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

/**
 * The same control, when the thing it does is go somewhere.
 *
 * A separate component rather than an `asChild` prop on `IconButton`, because
 * the two have genuinely different contracts: this one cannot be `disabled`,
 * cannot submit a form, and is a real link — so it works with JavaScript off
 * and can be opened in a new tab. Collapsing them behind one prop would hide
 * all three of those differences behind a boolean.
 *
 * `label` is required here for exactly the reason it is there: an icon-only
 * link with no accessible name announces itself as "link".
 */
export function IconButtonLink({
  icon,
  label,
  size = 16,
  href,
  className = "",
  ...props
}: {
  icon: IconName;
  /** Required. Becomes both the accessible name and the tooltip. */
  label: string;
  size?: number;
  href: string;
} & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-label" | "children" | "href"
>) {
  return (
    <Link
      {...props}
      href={href}
      aria-label={label}
      title={label}
      className={`${SHELL} ${className}`}
    >
      <Icon name={icon} size={size} />
    </Link>
  );
}
