import { redirect } from "next/navigation";

import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { CatalogManager } from "@frontend/components/organisms/CatalogManager";
import { WorkspaceShell } from "@frontend/components/organisms/WorkspaceShell";
import { repository } from "@backend/db";
import { CAMPAIGN_NAME } from "@backend/db/seed-data";
import { listDatabases } from "@backend/domain/database";
import {
  canManageCatalog,
  canWrite,
  creatableContainerTypes,
} from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

/**
 * The catalogue — SCOPE.md S3.
 *
 * What the campaign has DEFINED, as opposed to what anybody is carrying. A
 * container is a place, a database is a kind, and this is the third thing: a
 * rulebook. It says what a hempen rope weighs and never who has one, which is
 * why it is readable by the whole table and writable only by the GM.
 *
 * Every copy of an entry reads its name, weight, value and tags from here, so
 * correcting a row on this screen corrects it in every pack holding one. That
 * is not a fan-out write — the copies never held those values to begin with.
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ nav?: string; rail?: string }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const sp = await searchParams;
  const repo = repository();

  const [containers, databases, entries] = await Promise.all([
    repo.listContainers(principal),
    listDatabases(repo, principal),
    repo.listCatalog(principal),
  ]);

  const railCollapsed = sp.rail === "0";
  const writable = containers.find((c) => canWrite(principal, c));

  const shell = {
    principal,
    containers,
    databases,
    campaignName: CAMPAIGN_NAME,
    newContainerHref:
      writable && creatableContainerTypes(principal).length > 0
        ? `/c/${writable.id}?dialog=new-container`
        : undefined,
    newDatabaseHref: writable ? `/c/${writable.id}?dialog=add` : undefined,
    navOpen: sp.nav === "1",
    drawerHref: "/catalog?nav=1",
    railCollapsed,
    railHref: railCollapsed ? "/catalog" : "/catalog?rail=0",
    closeHref: "/catalog",
    catalogOpen: true,
  };

  const editable = canManageCatalog(principal);

  return (
    <WorkspaceShell {...shell}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-3 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Icon name="table" size={18} className="shrink-0 text-primary" />
            <h1 className="font-serif text-xl font-bold text-text">
              The catalogue
            </h1>
            <Chip tone="neutral">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </Chip>
            {editable ? null : <Chip tone="neutral">Read only</Chip>}
          </div>

          <p className="mt-2 text-base text-muted">
            What the campaign has defined, as opposed to what anybody is
            carrying. Taking a copy into a container does not empty this list —
            and a copy keeps reading its name, weight and value from here, so a
            correction lands in every pack at once.
          </p>

          {editable ? null : (
            <p className="mt-2 text-sm text-faint">
              Only the GM can change these. Take a copy from any container with
              &ldquo;From catalogue&rdquo;.
            </p>
          )}

          <CatalogManager entries={entries} canEdit={editable} />
        </div>
      </div>
    </WorkspaceShell>
  );
}
