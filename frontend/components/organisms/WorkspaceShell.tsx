import Link from "next/link";

import { Icon } from "@frontend/components/atoms/Icon";
import { IconButtonLink } from "@frontend/components/atoms/IconButton";
import { QuickAccess, type QuickAccessEntry } from "@frontend/components/organisms/QuickAccess";
import { Sidebar } from "@frontend/components/organisms/Sidebar";
import { TopBar } from "@frontend/components/organisms/TopBar";
import type { DatabaseSummary } from "@backend/domain/database";
import type { ContainerView, Principal } from "@backend/domain/view";

/**
 * The chrome every inside-the-app screen shares — Wireframe.png frame 1.
 *
 * Extracted when the Databases section arrived and the workspace stopped being
 * the only screen with a sidebar. The alternative was a second copy of the
 * pinned nav, the drawer, its scrim and its close button, which is exactly the
 * kind of duplication that lets two screens' navigation drift apart until one
 * of them is missing a container.
 *
 * It owns no data. Everything is fetched by the route and handed down, because
 * the route is where the principal is and where a permission error has somewhere
 * to be rendered.
 */
export function WorkspaceShell({
  principal,
  containers,
  databases,
  campaignName,
  selectedId,
  selectedDatabase,
  newContainerHref,
  searchAction,
  query,
  placeholder,
  navOpen,
  drawerHref,
  railCollapsed,
  railHref,
  closeHref,
  quickAccess,
  actions,
  aside,
  children,
}: {
  principal: Principal;
  containers: ContainerView[];
  databases: DatabaseSummary[];
  campaignName: string;
  selectedId?: string;
  selectedDatabase?: string;
  newContainerHref?: string;
  /** Where the top bar's search form GETs to. */
  searchAction?: string;
  query?: string;
  placeholder?: string;
  /** The below-`lg` drawer, a URL state so it survives the reloads the embedded
   *  browser does constantly. */
  navOpen?: boolean;
  /** Where the top bar's drawer toggle points. Absent on a screen with no
   *  drawer to open. */
  drawerHref?: string;
  /** The `lg`-and-up rail, collapsed. Also URL state, and for the same
   *  reason — plus it means a collapsed rail is part of a link you can send. */
  railCollapsed?: boolean;
  /** Where the collapse toggle points: the same URL with the rail flipped. */
  railHref: string;
  /** Where anything that closes points — the current screen with its overlays
   *  dropped. */
  closeHref: string;
  quickAccess?: QuickAccessEntry;
  /** Share, and the overflow menu — the right-hand end of the wireframe's
   *  strip row. Per-screen, so the shell takes them rather than knowing what a
   *  container's actions are. */
  actions?: React.ReactNode;
  /** The right-hand panel, a SIBLING of the main column rather than inside it —
   *  so the content scrolls and the panel scrolls independently, which is the
   *  behaviour the docked detail panel has always had. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const nav = (
    <Sidebar
      containers={containers}
      databases={databases}
      principal={principal}
      selectedId={selectedId}
      selectedDatabase={selectedDatabase}
      newContainerHref={newContainerHref}
      campaignName={campaignName}
    />
  );

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar
        principal={principal}
        drawerHref={navOpen ? undefined : drawerHref}
        searchAction={searchAction}
        query={query}
        placeholder={placeholder}
      />

      <div className="flex min-h-0 flex-1">
        {/* Pinned rail at lg, unless collapsed. */}
        {railCollapsed ? null : (
          <nav
            aria-label="Containers"
            className="hidden w-[var(--sidebar-w)] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex"
          >
            {nav}
          </nav>
        )}

        {/* Drawer below lg. */}
        {navOpen ? (
          <div className="fixed inset-0 z-30 lg:hidden">
            <Link
              href={closeHref}
              aria-label="Close container list"
              className="absolute inset-0 bg-black/60"
            />
            <nav
              aria-label="Containers"
              className="absolute inset-y-0 left-0 flex w-[264px] flex-col overflow-y-auto border-r border-border bg-surface"
            >
              <div className="flex h-[var(--topbar-h)] shrink-0 items-center justify-between border-b border-border px-3">
                <span className="font-serif text-lg font-bold text-primary">
                  Arca
                </span>
                <Link
                  href={closeHref}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface2"
                >
                  <Icon name="close" size={14} />
                  <span className="sr-only">Close</span>
                </Link>
              </div>
              {nav}
            </nav>
          </div>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col">
          {/* The Quick Access strip, with the rail toggle on its left — which
              is where the wireframe labels "Collapse". Both are chrome for the
              rail rather than for the content, so they share one row and it
              sits above the content's own header. */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 md:px-3">
            {/* A link, not a button: this is URL state, so it works without
                JavaScript and survives the reload. */}
            <IconButtonLink
              icon="panel"
              label={railCollapsed ? "Show the sidebar" : "Hide the sidebar"}
              size={13}
              href={railHref}
              className="hidden h-7 w-7 lg:grid"
            />
            <QuickAccess current={quickAccess} />

            {actions ? (
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {actions}
              </div>
            ) : null}
          </div>

          {children}
        </main>

        {aside}
      </div>
    </div>
  );
}
