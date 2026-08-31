"use client";

import { useId, useState } from "react";

import { Icon } from "@frontend/components/atoms/Icon";

/**
 * A password field with a show/hide control.
 *
 * The only client component on the sign-in screen, and it earns that: revealing
 * a password is local, immediate, and has no server to ask. Everything else on
 * that page is a server component with its state in the URL, and putting *this*
 * in the URL would write the password into the address bar and the history.
 *
 * ## Why it exists
 *
 * The password is typed on a phone, one-handed, next to a dice tray, and it is
 * typed from memory because there is no reset mail to fall back on. A masked
 * field with no way to check it turns one fat-fingered keystroke into an
 * "incorrect password" the person cannot debug — and on a FIRST sign-in it is
 * worse than that: an unnoticed typo, confirmed twice the same wrong way, is a
 * password nobody knows on the one member who can no longer enrol.
 *
 * ## Two details that are easy to get wrong
 *
 * The toggle is `type="button"`. A bare `<button>` inside a `<form>` submits
 * it, so without this, revealing your password would post the form.
 *
 * The state resets to hidden on every render of a fresh page, and there is no
 * attempt to remember it. "Show password" is a momentary check, not a
 * preference — persisting it would leave a password visible on a shared screen
 * because of a decision someone made last week.
 */
export function PasswordField({
  id,
  name,
  label,
  hint,
  required = false,
  autoFocus = false,
  autoComplete = "current-password",
  minLength,
  maxLength = 200,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: "current-password" | "new-password";
  minLength?: number;
  maxLength?: number;
}) {
  const [shown, setShown] = useState(false);
  const hintId = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          // Revealed or not, this is a password: no autocorrect, no
          // capitalisation, no spellcheck underline.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={minLength}
          maxLength={maxLength}
          aria-describedby={hint ? hintId : undefined}
          // `pr-10` leaves room for the toggle, so a long password scrolls
          // under the label rather than behind the button.
          className="h-10 w-full rounded-md border border-border bg-surface2 pl-2 pr-10 text-base text-text"
        />

        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          // The name says what clicking DOES, and `aria-pressed` says what the
          // state currently is. A screen reader user needs both: "Show
          // password, pressed" is unambiguous in a way that either alone is
          // not.
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          aria-controls={id}
          title={shown ? "Hide password" : "Show password"}
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface3 hover:text-text"
        >
          <Icon name={shown ? "eye-off" : "eye"} size={15} />
        </button>
      </div>

      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
