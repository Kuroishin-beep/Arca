import { encumbrance, weightPercent } from "@backend/domain/view";

/**
 * Carried vs capacity.
 *
 * Both numbers are derived at read time from the containment edges — there is
 * no stored total to fall out of date (SCOPE.md §5.4).
 *
 * The bar is two flat colours: a track and a fill. No gradient, which also
 * means the three states read correctly in greyscale, and the numeric label
 * carries the same information for anyone who cannot see the bar at all.
 */
const FILL = {
  ok: "bg-accent",
  "at-limit": "bg-warning",
  over: "bg-danger",
} as const;

const TEXT = {
  ok: "text-muted",
  "at-limit": "text-warning",
  over: "text-danger",
} as const;

export function WeightMeter({
  carried,
  capacity,
  label,
  compact = false,
}: {
  carried: number;
  capacity: number | null;
  label?: string;
  compact?: boolean;
}) {
  const state = encumbrance(carried, capacity);
  const percent = weightPercent(carried, capacity);

  // A wagon is not encumbered; a dwarf is. With no capacity there is nothing to
  // be a fraction OF, so the bar would be meaningless and is not drawn.
  if (capacity === null) {
    return (
      <p className="font-mono text-xs tabular-nums text-muted">
        {carried.toFixed(1)} kg
      </p>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      {label ? (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate text-sm text-muted">{label}</span>
          <span
            className={`shrink-0 font-mono text-sm tabular-nums ${TEXT[state]}`}
          >
            {carried.toFixed(1)} / {capacity.toFixed(1)} kg
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <div
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface3"
          role="progressbar"
          aria-valuenow={Math.round(carried)}
          aria-valuemin={0}
          aria-valuemax={Math.round(capacity)}
          aria-label={label ? `${label} carried weight` : "Carried weight"}
        >
          <div
            className={`h-full rounded-full ${FILL[state]}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {!label ? (
          <span
            className={`shrink-0 font-mono text-xs tabular-nums ${TEXT[state]}`}
          >
            {compact
              ? `${carried.toFixed(1)}kg`
              : `${carried.toFixed(1)} / ${capacity.toFixed(1)} kg`}
          </span>
        ) : null}
      </div>

      {/* Over capacity is a WARNING, never a block. What it costs is the GM's
          ruling, not the app's. */}
      {label && state !== "ok" ? (
        <p className={`mt-1 text-sm ${TEXT[state]}`}>
          {state === "over"
            ? `Over by ${(carried - capacity).toFixed(1)} kg — the GM decides what that costs.`
            : "At carry limit."}
        </p>
      ) : null}
    </div>
  );
}
