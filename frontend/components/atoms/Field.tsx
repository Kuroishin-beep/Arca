import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { Icon } from "./Icon";

/**
 * Every input in Arca goes through one of these, because every one of them
 * carries a real `<label for>` / `id` pair. Making the label a required prop is
 * the cheapest way to guarantee that — an unlabelled field cannot be written
 * without deliberately passing `srOnlyLabel`.
 */

interface FieldShellProps {
  id: string;
  label: string;
  /** Visually hides the label but keeps it for assistive tech. */
  srOnlyLabel?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FieldShell({
  id,
  label,
  srOnlyLabel,
  required,
  error,
  hint,
  children,
  className = "",
}: FieldShellProps) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={
          srOnlyLabel
            ? "sr-only"
            : "mb-1 block text-sm font-medium text-muted"
        }
      >
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1 flex items-center gap-1 text-sm text-danger"
        >
          <Icon name="alert" size={12} strokeWidth={1.8} />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const BASE =
  "h-9 w-full rounded-md border bg-surface2 px-2 text-base text-text placeholder:text-faint";

export function TextField({
  id,
  label,
  srOnlyLabel,
  required,
  error,
  hint,
  className,
  numeric,
  ...props
}: Omit<FieldShellProps, "children"> &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "required"> & {
    numeric?: boolean;
  }) {
  return (
    <FieldShell
      id={id}
      label={label}
      srOnlyLabel={srOnlyLabel}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
        className={[
          BASE,
          error ? "border-danger" : "border-border",
          // Numerals are mono + tabular so a column of them lines up and a
          // total is scannable without being read.
          numeric ? "text-right font-mono tabular-nums" : "",
        ].join(" ")}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  srOnlyLabel,
  required,
  error,
  hint,
  className,
  ...props
}: Omit<FieldShellProps, "children"> &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "required">) {
  return (
    <FieldShell
      id={id}
      label={label}
      srOnlyLabel={srOnlyLabel}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
        className={`w-full rounded-md border bg-surface2 p-2 text-base text-text placeholder:text-faint ${
          error ? "border-danger" : "border-border"
        }`}
      />
    </FieldShell>
  );
}
