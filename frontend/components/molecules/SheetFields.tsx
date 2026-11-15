"use client";

import { useState } from "react";

/* ================================================================== *
 * Small shared inputs
 *
 * Text holds its own state and commits on blur. Every other control on this
 * sheet writes on click, but a field that reverted mid-word — which optimistic
 * state would do on every keystroke's round trip — is a field nobody can type
 * a sentence into.
 * ================================================================== */

export function TextInput({
  id,
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        // From the event, not from `draft` — see the note on `commitName`.
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className="h-9 w-full rounded-md border border-border bg-surface px-2 text-base text-text placeholder:text-faint"
      />
    </div>
  );
}

export function LongText({
  id,
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      <textarea
        id={id}
        value={draft}
        rows={2}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
        }}
        className="w-full rounded-md border border-border bg-surface2 p-2 text-base text-text placeholder:text-faint"
      />
    </div>
  );
}

/** A compact labelled select that reads as a chip in the identity row. */
export function Select({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    // The focus ring is drawn on the whole chip, not on the bare control
    // inside it: the control has no border of its own, so the app's standard
    // outline (globals.css, "never removed") goes where the edge actually is.
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface2 px-1.5 py-0.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
      <label htmlFor={id} className="text-xs text-faint">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs text-text focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Free text that still reads as a chip — profession, where an enum would cost
 *  every homebrew class and buy nothing, since nothing is derived from it. */
export function TextChip({
  id,
  label,
  value,
  placeholder,
  suggestions,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  suggestions?: readonly string[];
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const listId = `${id}-suggestions`;

  return (
    // The focus ring is drawn on the whole chip, not on the bare control
    // inside it: the control has no border of its own, so the app's standard
    // outline (globals.css, "never removed") goes where the edge actually is.
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface2 px-1.5 py-0.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
      <label htmlFor={id} className="text-xs text-faint">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        list={suggestions ? listId : undefined}
        size={Math.max(8, draft.length || 8)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className="bg-transparent text-xs text-text placeholder:text-faint focus:outline-none"
      />
      {suggestions ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </span>
  );
}
