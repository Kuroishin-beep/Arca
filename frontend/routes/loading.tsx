import { TableSkeleton } from "@frontend/components/molecules/EmptyState";

/**
 * What a click shows while the server renders the next screen.
 *
 * Without it a click on a container did nothing visible until the whole page
 * had rendered, which reads as "the click was ignored". Shaped like the
 * workspace — a rail and a table.
 *
 * Mounted on /c/[containerId] ONLY, not at the root. A loading boundary
 * streams the page shell with status 200 before the page runs, so any route
 * that answers with `notFound()` (the character sheet a player may not open)
 * would answer 200 instead of 404. The workspace never calls `notFound` — it
 * renders its own Sealed page — so it is the one place this is safe.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh bg-bg" aria-busy="true">
      <div className="hidden w-60 shrink-0 flex-col gap-2 border-r border-border bg-surface p-3 md:flex">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="h-7 rounded-md bg-surface2" aria-hidden="true" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-3 border-b border-border px-4" aria-hidden="true">
          <span className="h-4 w-40 rounded-sm bg-surface2" />
          <span className="h-6 w-24 rounded-md bg-surface2" />
        </div>
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
