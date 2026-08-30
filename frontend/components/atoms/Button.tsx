import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

/**
 * The one gold fill on a screen belongs to the primary action. If two things
 * are gold, neither is the answer to "what do I do here?".
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-invert font-bold hover:bg-primary-hover",
  secondary:
    "border border-border bg-surface text-text font-medium hover:bg-surface2",
  ghost: "text-muted font-medium hover:bg-surface2 hover:text-text",
  danger:
    "border border-border text-danger font-medium hover:bg-danger-weak",
};

const SIZE: Record<ButtonSize, string> = {
  // 32px in the panel, which is the minimum comfortable target at 380px wide.
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

function classes({
  variant = "secondary",
  size = "md",
  fullWidth,
  className = "",
  disabled,
}: CommonProps & { disabled?: boolean }): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-md whitespace-nowrap",
    SIZE[size],
    // `text-faint` is the one place the sub-AA colour is allowed: a disabled
    // control carries no information, so it does not need to be readable.
    disabled
      ? "bg-surface3 text-faint cursor-not-allowed"
      : VARIANT[variant],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  fullWidth,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={classes({
        variant,
        size,
        fullWidth,
        className,
        children,
        disabled: props.disabled,
      })}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

/** Same skin, but a real `<a>`. Navigation must be a link so it survives
 *  middle-click, Ctrl-click and a screen reader's link list. */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  fullWidth,
  children,
  className,
}: CommonProps & { href: string }) {
  return (
    <Link
      href={href}
      className={classes({ variant, size, fullWidth, className, children })}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </Link>
  );
}

/**
 * An icon-only control. `label` is REQUIRED and becomes the accessible name —
 * the prop is not optional precisely so that an unlabelled icon button cannot
 * be written by accident.
 */
export function IconButton({
  icon,
  label,
  size = 32,
  className = "",
  ...props
}: {
  icon: IconName;
  label: string;
  size?: number;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      {...props}
      className={`grid shrink-0 place-items-center rounded-md text-muted hover:bg-surface2 hover:text-text ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={14} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
