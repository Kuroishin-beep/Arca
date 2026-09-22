import Link from "next/link";
import { redirect } from "next/navigation";

import { Chip, ContainerDot } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { StatChips } from "@frontend/components/molecules/StatFields";
import { WorkspaceShell } from "@frontend/components/organisms/WorkspaceShell";
import { repository } from "@backend/db";
import { CAMPAIGN_NAME } from "@backend/db/seed-data";
import {
  listDatabases,
  readDatabase,
  slugifyType,
  type DatabaseRow,
} from "@backend/domain/database";
import { fieldsForTypes, type ItemField } from "@backend/domain/item-fields";
import { matchesQuery } from "@backend/domain/view";
import { canWrite, creatableContainerTypes } from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

/**
 * A database — Wireframe.png's second sidebar section, rendered as the table in
 * frame 1.
 *
 * Every object of one type, across every container this principal may open. It
 * is the view that makes the object graph visible: the same longsword is in
 * Kova's Pack AND in Weapons, because containment and typing are different
 * edges (Schema.png — *an object doesn't need to know what container it is
 * being viewed through*).
 *
 * Read-only, deliberately. A row here belongs to a container, and the write
 * rules are per-container — so an editable cell in this table would need to
 * answer "may I write to the container this row happens to be in?" per row, and
 * silently do nothing on the rows where the answer is no. Sending you to the
 * container to edit is one more click and no lies.
 *
 * The permission work is in `backend/domain/database.ts` and is tested there:
 * a row from a container this principal cannot read must never appear, which is
 * the property that matters now that a screen reads across containers.
 */
export default async function DatabasePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; nav?: string; rail?: string }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const { slug } = await params;
  const sp = await searchParams;
  const query = sp.q ?? "";
  const repo = repository();

  const [containers, databases, database] = await Promise.all([
    repo.listContainers(principal),
    listDatabases(repo, principal),
    readDatabase(repo, principal, slug),
  ]);

  const railCollapsed = sp.rail === "0";
  const base = `/db/${slug}`;
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (railCollapsed) p.set("rail", "0");
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };
  /** The rail toggle: this URL with `rail` flipped. */
  const railHref = (() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (!railCollapsed) p.set("rail", "0");
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  })();

  // Creating a container and adding an item both need a container to act
  // FROM — the dialogs are URL state on a container's screen. This screen has
  // no container of its own, so it borrows the first one this principal may
  // write to. Without this the sidebar's two "New" links would simply vanish
  // whenever a database is open, and navigation that changes shape between
  // screens is the thing the shared shell exists to prevent.
  const writable = containers.find((c) => canWrite(principal, c));

  const shell = {
    principal,
    containers,
    databases,
    campaignName: CAMPAIGN_NAME,
    selectedDatabase: database ? slugifyType(slug) : undefined,
    newContainerHref:
      writable && creatableContainerTypes(principal).length > 0
        ? `/c/${writable.id}?dialog=new-container`
        : undefined,
    newDatabaseHref: writable ? `/c/${writable.id}?dialog=add` : undefined,
    searchAction: base,
    query,
    placeholder: database ? `Search ${database.name}…` : "Search…",
    navOpen: sp.nav === "1",
    drawerHref: keep({ nav: "1" }),
    railCollapsed,
    railHref,
    closeHref: keep({}),
  };

  // A type that does not exist and one whose objects are all out of reach are
  // answered identically — the same rule the workspace applies to containers
  // (SCOPE.md §12.3). A distinguishable 404 would turn the URL bar into a way
  // to ask whether the GM has any Relics.
  if (!database) {
    return (
      <WorkspaceShell {...shell} quickAccess={undefined}>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface2">
            <Icon name="table" size={22} className="text-muted" />
          </div>
          <h1 className="font-serif text-xl font-bold text-text">
            No such database
          </h1>
          <p className="mt-2 max-w-[36ch] text-base text-muted">
            Nothing you can reach has that type. A database appears once an item
            you can see carries its name.
          </p>
        </div>
      </WorkspaceShell>
    );
  }

  const rows = query
    ? database.rows.filter((row) => matchesQuery(row, query))
    : database.rows;

  return (
    <WorkspaceShell
      {...shell}
      quickAccess={{
        href: base,
        label: database.name,
        kind: "database",
      }}
    >
      <div className="shrink-0 border-b border-border bg-bg px-3 pt-3 md:px-4 md:pt-4">
        <div className="flex flex-wrap items-center gap-3 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="table" size={18} className="shrink-0 text-primary" />
            <h1 className="min-w-0 truncate font-serif text-xl font-bold text-text">
              {database.name}
            </h1>
            <Chip tone="neutral">
              {database.rows.length}{" "}
              {database.rows.length === 1 ? "item" : "items"}
            </Chip>
            <Chip tone="neutral">Read only</Chip>
          </div>

          {query ? (
            <div className="ml-auto flex items-center gap-2">
              <Chip>
                search: {query}
                <Link href={base} className="text-muted hover:text-text">
                  <Icon name="close" size={10} strokeWidth={2} />
                  <span className="sr-only">Clear search</span>
                </Link>
              </Chip>
              <span className="text-sm text-muted">
                {rows.length} of {database.rows.length}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-base text-muted">
            Nothing here matches “{query}”.
          </p>
        ) : (
          <DatabaseTable rows={rows} fields={fieldsForTypes([database.name])} />
        )}
      </div>
    </WorkspaceShell>
  );
}

/**
 * The database as the reference diagram draws it: one row per item, with the
 * columns of THIS type — Grip, STR, Damage, Durability and Features for
 * Weapon; Effect for Gear — plus cost and weight, which every item has.
 *
 * And **Where**: the containers that reference it. An item exists
 * independently of them; this column is how you get from the definition to
 * the places it is actually being carried.
 */
function DatabaseTable({
  rows,
  fields,
}: {
  rows: DatabaseRow[];
  fields: ItemField[];
}) {
  return (
    <table className="w-full border-collapse text-base">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="border-b border-border text-left">
          <Th>Item</Th>
          {fields.map((field) => (
            <Th
              key={field.key}
              className={`hidden md:table-cell ${field.numeric ? "w-[1%] text-right" : ""}`}
            >
              {field.label}
            </Th>
          ))}
          {/* A database with no columns of its own (Physical Object, Treasure)
              has room to say what else each item is. */}
          {fields.length === 0 ? (
            <Th className="hidden md:table-cell">Type</Th>
          ) : null}
          <Th className="hidden w-[1%] text-right md:table-cell">Cost</Th>
          <Th className="hidden w-[1%] text-right md:table-cell">Weight</Th>
          <Th className="w-[30%]">Where</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const types = row.types.filter((t) => t !== "Physical Object");
          const first = row.holdings[0];
          // The name is the link to the item's complete details: the detail
          // panel of wherever it is held, or its catalogue entry when nobody
          // is carrying one.
          const detailsHref = first
            ? `/c/${first.container.id}?item=${first.itemId}`
            : "/catalog";
          return (
            <tr
              key={row.id}
              className="border-b border-border last:border-0 hover:bg-surface2"
            >
              <td className="min-w-[8rem] px-3 py-2">
                <Link
                  href={detailsHref}
                  className="block font-medium text-text underline decoration-border underline-offset-4 hover:text-primary hover:decoration-primary"
                >
                  {row.name}
                </Link>
                {row.catalogItemId ? (
                  <span className="text-xs text-muted">Catalogue</span>
                ) : null}
                {/* Below `md` the stat columns do not fit, so the same values
                    ride under the name instead of disappearing. */}
                <div className="mt-1 flex flex-wrap gap-1 md:hidden">
                  <StatChips types={row.types} stats={row.stats} />
                  {row.value ? (
                    <span className="rounded-sm border border-border px-1 font-mono text-xs text-muted">
                      {row.value}
                    </span>
                  ) : null}
                </div>
              </td>
              {fields.map((field) => (
                <td
                  key={field.key}
                  className={`hidden px-3 py-2 md:table-cell ${
                    field.numeric
                      ? "whitespace-nowrap text-right font-mono tabular-nums text-text"
                      : "text-text"
                  }`}
                >
                  {row.stats[field.key] ?? <span className="text-faint">—</span>}
                </td>
              ))}
              {fields.length === 0 ? (
                <td className="hidden px-3 py-2 md:table-cell">
                  {types.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {types.map((type) => (
                        <Chip key={type} tone="primary">
                          {type}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                </td>
              ) : null}
              <td className="hidden whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-muted md:table-cell">
                {row.value || "—"}
              </td>
              <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-muted md:table-cell">
                {row.weight.toFixed(1)}
              </td>
              <td className="px-3 py-2">
                {row.holdings.length === 0 ? (
                  <span className="text-sm text-muted">Not carried</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {row.holdings.map((holding) => (
                      <li key={holding.itemId}>
                        <Link
                          href={`/c/${holding.container.id}?item=${holding.itemId}`}
                          className="flex items-center gap-2 text-muted hover:text-text"
                        >
                          <ContainerDot type={holding.container.type} />
                          <span className="min-w-0 truncate">
                            {holding.container.name}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums">
                            ×{holding.qty}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Th({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-sm font-medium uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  );
}
