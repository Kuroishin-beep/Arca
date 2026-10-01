import Link from "next/link";

import { ContainerDot } from "@frontend/components/atoms/Chip";
import { CampaignMenu } from "@frontend/components/organisms/CampaignMenu";
import { ContainerRow } from "@frontend/components/molecules/ContainerRow";
import { Icon } from "@frontend/components/atoms/Icon";
import type { ContainerType } from "@backend/domain/types";
import type { DatabaseSummary } from "@backend/domain/database";
import type { ContainerView, Principal } from "@backend/domain/view";
import {
  canRead,
  creatableContainerTypes,
  writeDeniedReason,
} from "@backend/lib/permissions";

/**
 * The sidebar — Wireframe.png, left column.
 *
 * Two sections, in the wireframe's order: **Containers**, then **Databases**.
 * That order is the model, not a layout preference. A container is a place and
 * a database is a kind; the same longsword is in exactly one place and in as
 * many kinds as it is, and at a table people reach for the place first.
 *
 * Containers keep their My Packs / Party / World sub-headings. The wireframe
 * draws two placeholder rows and rules nothing out, and the grouping is not
 * cosmetic — it is the same distinction the permission rules key off, so
 * flattening it would hide the one thing about the list that is load-bearing.
 *
 * Pinned full (248px) at `md` and up. Between `panel` and `md` — the docked
 * Symbiote's own primary target width — it is pinned too, but as a 48px icon
 * rail (`compact`, below): the workspace renders both and lets Tailwind's
 * breakpoints pick one, because a rail that only shows icons needs different
 * markup, not the same rows squeezed. Below `panel` there is no room for even
 * that, so it is a drawer, rendered by the workspace.
 */
const GROUPS: { type: ContainerType; heading: string }[] = [
  { type: "character", heading: "My Packs" },
  { type: "party", heading: "Party" },
  { type: "world", heading: "World" },
];

export function Sidebar({
  containers,
  databases,
  principal,
  selectedId,
  /** Slug of the open database, when the current screen is one. */
  selectedDatabase,
  /** Containers the principal may not READ at all, shown as locked rows so the
   *  list does not silently change shape between GM and player. */
  lockedContainers = [],
  /** Where the "New container" link points. Absent only when this principal
   *  may not create one. */
  newContainerHref,
  /** Where "New database" points — the item editor, because a database is not
   *  created, it is named. Absent when there is nowhere they may write. */
  newDatabaseHref,
  /** Where the Search row jumps — the current screen's search input. */
  /** The campaign name, in the switcher at the top. */
  campaignName,
  /** True on the catalogue screen, so its row reads as current the way a
   *  container's does. */
  catalogOpen,
  /** Render the 48px icon rail instead of the full labelled list —
   *  `panel`-to-`md` width, where there is room to pin something but not to
   *  label it. */
  compact,
  /** The compact rail's own expand affordance: opens the same drawer the
   *  workspace already builds for below-`panel`, so "expandable on click" is
   *  the existing overlay rather than a second thing to build and keep in
   *  sync with it. Unused when `compact` is false. */
  drawerHref,
  /** What the expand affordance says. The same rail serves two jobs: opening
   *  the drawer between `panel` and `md`, and bringing a collapsed sidebar
   *  back from `md` up — and those should not be described the same way. */
  expandLabel = "Show the full container list",
}: {
  containers: ContainerView[];
  databases: DatabaseSummary[];
  principal: Principal;
  selectedId?: string;
  selectedDatabase?: string;
  lockedContainers?: ContainerView[];
  newContainerHref?: string;
  newDatabaseHref?: string;
  campaignName: string;
  catalogOpen?: boolean;
  compact?: boolean;
  drawerHref?: string;
  expandLabel?: string;
}) {
  if (compact) {
    return (
      <>
        <div className="flex h-[var(--topbar-h)] shrink-0 items-center justify-center border-b border-border">
          <Icon name="chest" size={16} className="text-primary" />
        </div>

        {drawerHref ? (
          <Link
            href={drawerHref}
            aria-label={expandLabel}
            title={expandLabel}
            className="mx-auto mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-surface2 text-text hover:border-primary hover:text-primary"
          >
            <Icon name="menu" size={16} />
          </Link>
        ) : null}

        {/* One icon per container, not one per group — the group headings are
            the thing a 48px rail has no room to keep, and the colour + shape
            pair (ContainerDot) is still the one signal that survives being
            reduced to an icon. */}
        <div className="mt-2 flex flex-1 flex-col items-center gap-1 overflow-y-auto px-1 pb-2">
          {containers.map((container) => (
            <Link
              key={container.id}
              href={`/c/${container.id}`}
              aria-current={container.id === selectedId ? "page" : undefined}
              title={container.name}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${
                container.id === selectedId
                  ? "bg-surface2"
                  : "hover:bg-surface2"
              }`}
            >
              <ContainerDot type={container.type} />
              <span className="sr-only">{container.name}</span>
            </Link>
          ))}
          {lockedContainers.map((container) => (
            <span
              key={container.id}
              aria-disabled="true"
              title={`${container.name} is GM-only.`}
              className="grid h-9 w-9 shrink-0 cursor-not-allowed place-items-center rounded-md opacity-60"
            >
              <Icon name="lock" size={13} className="text-faint" />
              <span className="sr-only">{container.name}, GM-only</span>
            </span>
          ))}
        </div>

        {databases.length > 0 ? (
          <div className="flex shrink-0 flex-col items-center gap-1 border-t border-border px-1 py-2">
            {databases.map((database) => (
              <Link
                key={database.slug}
                href={`/db/${database.slug}`}
                aria-current={
                  database.slug === selectedDatabase ? "page" : undefined
                }
                title={database.name}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${
                  database.slug === selectedDatabase
                    ? "bg-surface2 text-primary"
                    : "text-muted hover:bg-surface2"
                }`}
              >
                <Icon name="table" size={15} />
                <span className="sr-only">{database.name}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {/* The campaign menu: switch campaign, start one, and (for the GM) the
          roster. See CampaignMenu. */}
      <div className="relative flex h-[var(--topbar-h)] shrink-0 items-center gap-1 border-b border-border px-2">
        <CampaignMenu principal={principal} campaignName={campaignName} />

        {/* The roster hangs off the campaign, not off a container — it is the
            one thing on this screen that belongs to the campaign itself.
            GM-only in the markup AND in the route, because a rendered link is
            not a permission. */}
        {principal.role === "gm" ? (
          <Link
            href="/members"
            aria-label="Members"
            title="Members"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface2 hover:text-text"
          >
            <Icon name="users" size={14} />
          </Link>
        ) : null}
      </div>

      {/* Search everything. This used to be a link that jumped to the top
          bar's box without focusing it — and went home on pages with no box —
          so it looked broken. It is a real search now, with a different job
          from the top bar's: that one filters the container you are in, this
          one answers "where is it?" across every container and the catalogue.
          A GET form, so it works without JavaScript and results are a URL. */}
      <div className="flex flex-col gap-1 px-3 pt-3">
        <form action="/search" method="get" role="search" className="relative">
          <label htmlFor="sidebar-search" className="sr-only">
            Search everything
          </label>
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            id="sidebar-search"
            name="q"
            type="search"
            placeholder="Search everything…"
            className="h-8 w-full rounded-md border border-border bg-surface2 pl-7 pr-2 text-sm text-text placeholder:text-faint"
          />
        </form>

        {/* The catalogue is neither a place nor a kind, so it belongs with
            Search rather than in either section below: it is the campaign's
            rulebook, and every container borrows from it. */}
        <Link
          href="/catalog"
          aria-current={catalogOpen ? "page" : undefined}
          className={[
            "flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm",
            catalogOpen
              ? "border border-primary bg-primary-weak font-medium text-primary"
              : "border border-border bg-surface2 text-muted hover:text-text",
          ].join(" ")}
        >
          <Icon name="table" size={13} className="shrink-0" />
          Catalogue
        </Link>
      </div>

      <Section title="Containers">
        {GROUPS.map(({ type, heading }) => {
          const inGroup = containers.filter((c) => c.type === type);
          const lockedInGroup = lockedContainers.filter((c) => c.type === type);
          if (inGroup.length === 0 && lockedInGroup.length === 0) return null;

          // "My Packs" is only "mine" for a player. A GM sees everyone's.
          const label =
            type === "character" && principal.role === "gm" ? "Packs" : heading;

          return (
            <div key={type} className="pt-3 first:pt-1">
              <h4 className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-faint">
                {label}
              </h4>
              <ul className="flex flex-col gap-1">
                {inGroup.map((container) => (
                  <li key={container.id}>
                    <ContainerRow
                      container={container}
                      selected={container.id === selectedId}
                      disabledReason={
                        canRead(principal, container)
                          ? undefined
                          : (writeDeniedReason(principal, container) ??
                            undefined)
                      }
                    />
                  </li>
                ))}
                {lockedInGroup.map((container) => (
                  <li key={container.id}>
                    <ContainerRow
                      container={container}
                      disabledReason={`${container.name} is GM-only.`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {/* Creating a container is a rare, deliberate act: it sits below the
            list rather than competing with it.

            Shown to players too — a player may add their own pack or a shared
            container, just not a world one (SCOPE.md §3). The kinds they may
            pick are decided by the same predicate the server enforces, so
            somebody who may create nothing never receives this markup. */}
        {creatableContainerTypes(principal).length > 0 && newContainerHref ? (
          <NewLink href={newContainerHref}>New container</NewLink>
        ) : null}
      </Section>

      <Section title="Databases">
        {databases.length === 0 ? (
          <p className="px-2 py-1 text-sm text-faint">
            Nothing typed yet. Give an item a type and its database appears
            here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {databases.map((database) => {
              const selected = database.slug === selectedDatabase;
              return (
                <li key={database.slug}>
                  <Link
                    href={`/db/${database.slug}`}
                    aria-current={selected ? "page" : undefined}
                    className={[
                      "flex items-center gap-2 rounded-md px-2 text-base",
                      "h-11 panel:h-9",
                      selected
                        ? "border-l-2 border-primary bg-surface2 font-medium text-text"
                        : "text-text hover:bg-surface2",
                    ].join(" ")}
                  >
                    <Icon
                      name="table"
                      size={15}
                      className={`shrink-0 ${selected ? "text-primary" : "text-muted"}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {database.name}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-xs ${
                        selected ? "text-muted" : "text-faint"
                      }`}
                    >
                      {database.itemCount}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* A database is not created, it is named: typing a type onto an item
            brings its database into existence. So this points at the item
            editor rather than at a dialog that would have nothing to write.

            Not gated on a container being OPEN — the sidebar is on every screen
            and must not change shape between them. The route resolves where to
            send you; here it is either offered or it is not. */}
        {newDatabaseHref ? (
          <NewLink href={newDatabaseHref}>New database</NewLink>
        ) : null}
      </Section>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 pt-5">
      <h3 className="mb-2 px-2 font-serif text-sm font-bold uppercase tracking-wider text-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NewLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-strong text-sm font-medium text-muted hover:border-primary hover:text-primary"
    >
      <Icon name="plus" size={13} />
      {children}
    </Link>
  );
}
