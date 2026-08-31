import Link from "next/link";

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
 * Pinned at `lg`. Below that it is a drawer, rendered by the workspace.
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
  /** Where the "New container" link points. Absent on screens with no
   *  container context to return to. */
  newContainerHref,
  /** The campaign name, in the switcher at the top. */
  campaignName,
}: {
  containers: ContainerView[];
  databases: DatabaseSummary[];
  principal: Principal;
  selectedId?: string;
  selectedDatabase?: string;
  lockedContainers?: ContainerView[];
  newContainerHref?: string;
  campaignName: string;
}) {
  return (
    <>
      {/* Campaign switcher. One campaign exists, so the chevron is honest
          about being inert for now rather than opening an empty menu: it is
          rendered as a heading, not a button, and becomes a control the day
          there is a second campaign to switch to. */}
      <div className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-border px-3">
        <Icon name="chest" size={15} className="shrink-0 text-primary" />
        <h2 className="min-w-0 flex-1 truncate font-serif text-sm font-bold text-text">
          {campaignName}
        </h2>
        <Icon name="chevron-down" size={12} className="shrink-0 text-faint" />
      </div>

      {/* Search lives in the sidebar in the wireframe, next to what it
          searches. It is a link rather than a second input: the real search
          box is in the top bar and already owns the `q` parameter, and two
          fields writing one piece of state is how they end up disagreeing. */}
      <div className="px-3 pt-3">
        <Link
          href={
            selectedId ? `/c/${selectedId}#q` : (newContainerHref ?? "/")
          }
          className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface2 px-2 text-sm text-muted hover:text-text"
        >
          <Icon name="search" size={13} className="shrink-0" />
          Search
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
            editor rather than at a dialog that would have nothing to write. */}
        {newContainerHref && selectedId ? (
          <NewLink href={`/c/${selectedId}?dialog=add`}>New database</NewLink>
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
