import Link from "next/link";
import { redirect } from "next/navigation";

import { Chip, ContainerDot } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { WorkspaceShell } from "@frontend/components/organisms/WorkspaceShell";
import { repository } from "@backend/db";
import { CAMPAIGN_NAME } from "@backend/db/seed-data";
import {
  listDatabases,
  readDatabase,
  slugifyType,
  type DatabaseRow,
} from "@backend/domain/database";
import { matchesQuery } from "@backend/domain/view";
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

  const shell = {
    principal,
    containers,
    databases,
    campaignName: CAMPAIGN_NAME,
    selectedDatabase: database ? slugifyType(slug) : undefined,
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
    ? database.rows.filter((row) => matchesQuery(row.item, query))
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
              {database.rows.length === 1 ? "object" : "objects"}
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
          <DatabaseTable rows={rows} />
        )}
      </div>
    </WorkspaceShell>
  );
}

/**
 * The wireframe's table, with the column a container's table does not need:
 * **Where**. A database is read as "what do we have, and where is it", and
 * without that column the answer to the second half is missing.
 */
function DatabaseTable({ rows }: { rows: DatabaseRow[] }) {
  return (
    <table className="w-full border-collapse text-base">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="border-b border-border text-left">
          <Th>Name</Th>
          <Th className="w-[1%] text-right">Qty</Th>
          <Th className="w-[1%] text-right">Weight</Th>
          <Th className="w-[30%]">Where</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ item, container }) => (
          <tr
            key={item.id}
            className="border-b border-border last:border-0 hover:bg-surface2"
          >
            <td className="px-3 py-2">
              {/* Every row is a link INTO the container, with the item already
                  selected. That is the edit path: this table does not write,
                  so the useful thing it can do is take you to the screen that
                  does. */}
              <Link
                href={`/c/${container.id}?item=${item.id}`}
                className="font-medium text-text hover:text-primary"
              >
                {item.name}
              </Link>
              {item.tags.length > 0 ? (
                <span className="ml-2 text-xs text-faint">
                  {item.tags.join(" · ")}
                </span>
              ) : null}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-text">
              {item.qty}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
              {(item.weight * item.qty).toFixed(1)}
            </td>
            <td className="px-3 py-2">
              <Link
                href={`/c/${container.id}`}
                className="flex items-center gap-2 text-muted hover:text-text"
              >
                <ContainerDot type={container.type} />
                <span className="min-w-0 truncate">{container.name}</span>
              </Link>
            </td>
          </tr>
        ))}
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
