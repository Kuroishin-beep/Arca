import Link from "next/link";

import { Icon } from "@/components/atoms/Icon";
import { SyncPill, UserBadge } from "@/components/atoms/Status";
import { signOutAction } from "@/actions/session";
import type { Principal } from "@/domain/view";

/**
 * Present on every screen. Three jobs, in priority order: say where you are,
 * let you search, and say whether what you are looking at is current.
 */
export function TopBar({
  principal,
  containerId,
  query = "",
  placeholder = "Search items…",
}: {
  principal: Principal;
  containerId?: string;
  query?: string;
  placeholder?: string;
}) {
  return (
    <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-4">
      {/* Drawer toggle. A plain link to `?nav=1` rather than client state, so
          the drawer survives a reload — which the embedded browser does a lot
          of. */}
      {containerId ? (
        <Link
          href={`/c/${containerId}?nav=1`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface2 hover:text-text lg:hidden"
        >
          <Icon name="menu" />
          <span className="sr-only">Show container list</span>
        </Link>
      ) : null}

      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 text-primary"
      >
        <Icon name="chest" size={18} />
        <span className="font-serif text-lg font-bold tracking-wide">Arca</span>
      </Link>

      {/* A GET form, so search works without JavaScript and a searched view is
          a real URL you can hand to someone. */}
      {containerId ? (
        <form
          action={`/c/${containerId}`}
          method="get"
          className="relative ml-auto min-w-0 flex-1 md:ml-4 md:max-w-md"
        >
          <label htmlFor="q" className="sr-only">
            Search items
          </label>
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={placeholder}
            className="h-8 w-full rounded-md border border-border bg-surface2 pl-7 pr-2 text-base text-text placeholder:text-faint"
          />
        </form>
      ) : (
        <div className="ml-auto" />
      )}

      <SyncPill status="idle" className="hidden sm:flex" />

      <form action={signOutAction} className="contents">
        <button
          type="submit"
          className="rounded-md"
          title="Sign out"
        >
          <UserBadge principal={principal} />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </header>
  );
}
