import { Icon } from "./Icon";

/**
 * The one quantity control in Arca with +/- buttons — Move dialog and item
 * editor both ask "how many", and before this they each answered it
 * differently: Move dialog built its own stepper inline, and the item editor
 * had a plain number field with no buttons at all. Design.md Step E lists one
 * `NumberStepper` for both; this is it.
 *
 * Controlled only, like every other input in this system — the caller owns
 * `value`. `name` is optional and forwards straight onto the real `<input>`,
 * so a server-action form (the item editor) reads it from `FormData` exactly
 * as it would a plain `TextField`; a client-only caller (the move dialog)
 * omits it.
 */
export function NumberStepper({
  id,
  label,
  name,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  /** Composes the +/- buttons' accessible names ("Decrease qty") — not
   *  rendered as a visible label. The caller supplies its own `<label
   *  htmlFor={id}>`, the way every field in this system does. */
  label: string;
  name?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => {
    const bounded = max !== undefined ? Math.min(max, n) : n;
    return Math.max(min, Number.isNaN(bounded) ? min : bounded);
  };

  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="flex h-9 w-fit items-center rounded-md border border-border bg-surface2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={atMin}
        className="grid h-full w-9 place-items-center rounded-l-md text-muted hover:bg-surface3 hover:text-text disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
      >
        <Icon name="minus" size={14} strokeWidth={2} />
        <span className="sr-only">Decrease {label.toLowerCase()}</span>
      </button>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-full w-14 border-x border-border bg-transparent text-center font-mono text-base tabular-nums text-text"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={atMax}
        className="grid h-full w-9 place-items-center rounded-r-md text-muted hover:bg-surface3 hover:text-text disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
      >
        <Icon name="plus" size={14} strokeWidth={2} />
        <span className="sr-only">Increase {label.toLowerCase()}</span>
      </button>
    </div>
  );
}
