import Link from "next/link";

import { Icon } from "@frontend/components/atoms/Icon";
import { IconButton } from "@frontend/components/atoms/IconButton";
import { ThemeToggle } from "@frontend/components/atoms/ThemeToggle";
import { UserBadge } from "@frontend/components/atoms/Status";
import { RealtimeSync } from "@frontend/components/organisms/RealtimeSync";
import { signOutAction } from "@backend/actions/session";
import type { Principal } from "@backend/domain/view";

/**
 * Present on every screen. Three jobs, in priority order: say where you are,
 * let you search, and say whether what you are looking at is current.
 *
 * It takes hrefs rather than a container id. When the Databases screen arrived
 * the bar stopped being able to assume every screen is a container — building
 * `/c/${containerId}?nav=1` in here would have meant the database screen's
 * drawer toggle navigated to a different screen than the one it was on.
 */
export function TopBar({
  principal,
  drawerHref,
  searchAction,
  query = "",
  placeholder = "Search items…",
}: {
  principal: Principal;
  /** Where the below-`lg` drawer toggle points. Absent on a screen with no
   *  drawer. */
  drawerHref?: string;
  /** Where the search form GETs to — the current screen. Absent on a screen
   *  with nothing to search. */
  searchAction?: string;
  query?: string;
  placeholder?: string;
}) {
  return (
    <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-4">
      {/* Drawer toggle. A plain link rather than client state, so the drawer
          survives a reload — which the embedded browser does a lot of. */}
      {drawerHref ? (
        <Link
          href={drawerHref}
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
      {searchAction ? (
        <form
          action={searchAction}
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

      {/* The only client component in the bar. It subscribes to the campaign
          channel and reports what it actually knows, rather than the hardcoded
          "Synced" that stood in before the channel existed. */}
      <RealtimeSync userId={principal.userId} className="hidden sm:flex" />

      <ThemeToggle />

      {/* Who you are, and leaving — two things, two controls.
          They used to be one: the badge WAS the sign-out button, with the only
          hint an `sr-only` span. So the single most destructive control in the
          bar was also the one element people click to check which account they
          are signed in as, and it looked like a label. Signing out is cheap to
          undo but it costs a password, and nothing about an avatar says "this
          ends your session".
          The badge is now inert identity, and leaving is a labelled control
          next to it. */}
      <UserBadge principal={principal} />

      <form action={signOutAction}>
        <IconButton
          type="submit"
          icon="sign-out"
          label="Sign out"
        />
      </form>
    </header>
  );
}
