import { redirect } from "next/navigation";

import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { WorkspaceShell } from "@frontend/components/organisms/WorkspaceShell";
import { DatabaseTable } from "@frontend/routes/database";
import { repository } from "@backend/db";
import { CAMPAIGN_NAME } from "@backend/db/seed-data";
import { listDatabases, searchEverything } from "@backend/domain/database";
import {
  canCreateItem,
  canWrite,
  creatableContainerTypes,
} from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

/**
 * Search everything — the sidebar's search box.
 *
 * The top bar searches the container you are looking at. This is the other
 * question: "where is the rope?" — every container you can open, and the
 * catalogue, each item listed once with every place it is held.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; nav?: string; rail?: string }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const repo = repository();

  const [containers, databases, rows] = await Promise.all([
    repo.listContainers(principal),
    listDatabases(repo, principal),
    searchEverything(repo, principal, query),
  ]);

  const railCollapsed = sp.rail === "0";
  const withQuery = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const qs = p.toString();
    return qs ? `/search?${qs}` : "/search";
  };
  const writable = containers.find((c) => canWrite(principal, c));

  return (
    <WorkspaceShell
      principal={principal}
      containers={containers}
      databases={databases}
      campaignName={principal.campaignName ?? CAMPAIGN_NAME}
      newContainerHref={
        writable && creatableContainerTypes(principal).length > 0
          ? `/c/${writable.id}?dialog=new-container`
          : undefined
      }
      newDatabaseHref={
        writable && canCreateItem(principal) ? `/c/${writable.id}?dialog=add` : undefined
      }
      searchAction="/search"
      query={query}
      placeholder="Search everything…"
      navOpen={sp.nav === "1"}
      drawerHref={withQuery({ nav: "1" })}
      railCollapsed={railCollapsed}
      railHref={railCollapsed ? withQuery({}) : withQuery({ rail: "0" })}
      closeHref={withQuery({})}
      quickAccess={undefined}
    >
      <div className="shrink-0 border-b border-border bg-bg px-3 py-3 md:px-4 md:py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="search" size={18} className="shrink-0 text-primary" />
          <h1 className="min-w-0 truncate font-serif text-xl font-bold text-text">
            {query ? `Results for “${query}”` : "Search everything"}
          </h1>
          {query ? (
            <Chip tone="neutral">
              {rows.length} {rows.length === 1 ? "item" : "items"}
            </Chip>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          Every container you can open, and the catalogue — by name, tag, type or
          container.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {query === "" ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface2">
              <Icon name="search" size={20} className="text-muted" />
            </div>
            <p className="max-w-[40ch] text-base text-muted">
              Type in the search box to find anything, anywhere you can see it.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface2">
              <Icon name="search" size={20} className="text-muted" />
            </div>
            <p className="text-base text-text">Nothing matches “{query}”.</p>
            <p className="mt-1 max-w-[40ch] text-sm text-muted">
              Try part of a name, a tag such as “weapon”, or a container&rsquo;s name.
            </p>
          </div>
        ) : (
          <DatabaseTable rows={rows} fields={[]} />
        )}
      </div>
    </WorkspaceShell>
  );
}
