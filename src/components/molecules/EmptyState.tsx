import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/atoms/Icon";

/**
 * Every list surface in Arca has one of these. An empty table with no
 * explanation is indistinguishable from a broken one, and at a table the second
 * reading is the one people reach for.
 */
export function EmptyState({
  icon = "chest",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <Icon name={icon} size={36} strokeWidth={1.2} className="mb-4 text-faint" />
      <h3 className="font-serif text-lg font-bold text-text">{title}</h3>
      <p className="mt-2 max-w-[34ch] text-base text-muted">{body}</p>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Flat surface blocks, not a shimmer — a moving gradient inside a docked panel
 *  competes with the 3-D scene rendering behind it. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex-1 p-3" aria-busy="true" aria-live="polite">
      <ul className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className="flex h-9 items-center gap-3 rounded-md bg-surface px-3"
          >
            <span className="h-3 flex-1 rounded-sm bg-surface2" />
            <span className="h-3 w-8 rounded-sm bg-surface2" />
            <span className="h-3 w-10 rounded-sm bg-surface2" />
          </li>
        ))}
      </ul>
      <p className="sr-only">Loading items.</p>
    </div>
  );
}
