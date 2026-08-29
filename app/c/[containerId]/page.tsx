import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonLink } from "@/components/atoms/Button";
import { Chip, ContainerBadge, ContainerDot } from "@/components/atoms/Chip";
import { Icon } from "@/components/atoms/Icon";
import { WeightMeter } from "@/components/molecules/WeightMeter";
import { DetailPanel } from "@/components/organisms/DetailPanel";
import { ItemEditorDialog } from "@/components/organisms/ItemEditorDialog";
import {
  MoveItemDialog,
  type MoveTarget,
} from "@/components/organisms/MoveItemDialog";
import { ItemTable } from "@/components/organisms/ItemTable";
import { Sidebar } from "@/components/organisms/Sidebar";
import { TopBar } from "@/components/organisms/TopBar";
import { repository } from "@/db";
import {
  DEFAULT_SORT,
  SortColumn,
  SortDirection,
  type Sort,
  matchesQuery,
  sortItems,
} from "@/domain/view";
import { PermissionError, canWrite, writeDeniedReason } from "@/lib/permissions";
import { currentPrincipal } from "@/lib/session";

/**
 * The Workspace — SCOPE.md screen 2, and the app.
 *
 * A Server Component. The item table renders on the server and arrives as
 * HTML, so a docked panel paints without first shipping the whole inventory as
 * JSON and hydrating it. The only client components on this screen are the two
 * dialogs, which genuinely need local state.
 *
 * Every piece of view state — selection, sort, search, which dialog is open —
 * lives in the URL. That is not a shortcut: the Symbiote's embedded browser
 * reloads often, and a panel that forgets what you were looking at every time
 * is worse than no panel.
 */
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ containerId: string }>;
  searchParams: Promise<{
    item?: string;
    q?: string;
    sort?: string;
    dir?: string;
    dialog?: string;
    nav?: string;
  }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const { containerId } = await params;
  const sp = await searchParams;
  const query = sp.q ?? "";
  const repo = repository();

  const containers = await repo.listContainers(principal);

  // A container that exists but is not theirs, and one that does not exist at
  // all, are answered separately — but neither answer says what is inside.
  let container;
  try {
    container = await repo.getContainer(principal, containerId);
  } catch (error) {
    if (error instanceof PermissionError) {
      return <Forbidden message={error.message} containers={containers} />;
    }
    throw error;
  }
  if (!container) {
    return <Forbidden message="No such container." containers={containers} />;
  }

  const sort: Sort = {
    column: SortColumn.safeParse(sp.sort).data ?? DEFAULT_SORT.column,
    direction: SortDirection.safeParse(sp.dir).data ?? DEFAULT_SORT.direction,
  };

  const allItems = await repo.listItems(principal, containerId);
  const items = sortItems(
    allItems.filter((item) => matchesQuery(item, query)),
    sort,
  );

  const selected = sp.item
    ? (allItems.find((i) => i.id === sp.item) ?? null)
    : null;
  const comments = await repo.listComments(principal, containerId);
  const editable = canWrite(principal, container);

  const closeHref = `/c/${containerId}${
    sp.item ? `?item=${sp.item}` : query ? `?q=${encodeURIComponent(query)}` : ""
  }`;

  // Destinations: every container the principal can READ, annotated with
  // whether they may WRITE to it. Ones they cannot are shown disabled with the
  // reason rather than removed from the list.
  const moveTargets: MoveTarget[] = containers
    .filter((c) => c.id !== containerId)
    .map((c) => ({
      container: c,
      deniedReason: writeDeniedReason(principal, c),
    }));

  const drawerOpen = sp.nav === "1";

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar
        principal={principal}
        containerId={containerId}
        query={query}
        placeholder={`Search ${container.name}…`}
      />

      <div className="flex min-h-0 flex-1">
        {/* Pinned sidebar at lg */}
        <nav
          aria-label="Containers"
          className="hidden w-[var(--sidebar-w)] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex"
        >
          <Sidebar
            containers={containers}
            principal={principal}
            selectedId={containerId}
          />
        </nav>

        {/* Drawer below lg. A URL state, so it survives the reloads the
            embedded browser does constantly. */}
        {drawerOpen ? (
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
              <Sidebar
                containers={containers}
                principal={principal}
                selectedId={containerId}
              />
            </nav>
          </div>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-bg px-3 pt-3 md:px-4 md:pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ContainerDot type={container.type} />
                <h1 className="min-w-0 truncate font-serif text-xl font-bold text-text">
                  {container.name}
                </h1>
                <ContainerBadge type={container.type} />
                {!editable ? <Chip tone="neutral">Read only</Chip> : null}
              </div>

              {editable ? (
                <div className="ml-auto flex items-center gap-2">
                  <ButtonLink
                    href={`/c/${containerId}?dialog=add`}
                    variant="primary"
                    size="sm"
                    icon="plus"
                  >
                    Add item
                  </ButtonLink>
                </div>
              ) : null}
            </div>

            {query ? (
              <div className="mt-3 flex items-center gap-2 pb-2">
                <Chip>
                  search: {query}
                  <Link href={`/c/${containerId}`} className="text-muted hover:text-text">
                    <Icon name="close" size={10} strokeWidth={2} />
                    <span className="sr-only">Clear search</span>
                  </Link>
                </Chip>
                <span className="text-sm text-muted">
                  {items.length} of {allItems.length}
                </span>
              </div>
            ) : (
              <div className="pb-3" />
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <ItemTable
              items={items}
              containerId={containerId}
              sort={sort}
              selectedId={selected?.id}
              canEdit={editable}
              query={query}
            />
          </div>

          {/* Footer summary. Every number here is derived at read time. */}
          <div className="shrink-0 border-t border-border bg-surface px-3 py-2 md:px-4">
            <div className="flex items-center gap-3">
              <span className="shrink-0 font-mono text-xs text-muted">
                {container.itemCount} items
              </span>
              <WeightMeter
                carried={container.carriedWeight}
                capacity={container.capacity}
              />
            </div>
          </div>
        </main>

        {/* Detail panel: pinned at lg, a sheet below it. */}
        {selected ? (
          <>
            <aside
              aria-label="Item detail"
              className="hidden w-[var(--detail-w)] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface lg:flex"
            >
              <DetailPanel
                item={selected}
                container={container}
                comments={comments}
                canEdit={editable}
                query={query}
              />
            </aside>

            <div className="fixed inset-0 z-20 lg:hidden">
              <Link
                href={`/c/${containerId}${query ? `?q=${encodeURIComponent(query)}` : ""}`}
                aria-label="Close item detail"
                className="absolute inset-0 bg-black/60"
              />
              <aside
                aria-label="Item detail"
                className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-surface"
              >
                <DetailPanel
                  item={selected}
                  container={container}
                  comments={comments}
                  canEdit={editable}
                  query={query}
                />
              </aside>
            </div>
          </>
        ) : null}
      </div>

      {/* Dialogs are URL state too, so a move in progress survives a reload. */}
      {sp.dialog === "move" && selected && editable ? (
        <MoveItemDialog
          item={selected}
          from={container}
          targets={moveTargets}
          closeHref={closeHref}
        />
      ) : null}

      {sp.dialog === "add" && editable ? (
        <ItemEditorDialog container={container} closeHref={closeHref} />
      ) : null}

      {sp.dialog === "edit" && selected && editable ? (
        <ItemEditorDialog
          container={container}
          item={selected}
          closeHref={closeHref}
        />
      ) : null}
    </div>
  );
}

/** 403 and 404 look the same on purpose: telling a player that a container
 *  exists but is closed to them is itself a small leak (SCOPE.md §12.3). */
function Forbidden({
  message,
  containers,
}: {
  message: string;
  containers: { id: string; name: string }[];
}) {
  const fallback = containers[0];
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-danger-weak">
        <Icon name="lock" size={22} className="text-danger" />
      </div>
      <h1 className="font-serif text-xl font-bold text-text">Sealed</h1>
      <p className="mt-2 max-w-[34ch] text-base text-muted">
        {message} Its contents were never sent to your device.
      </p>
      {fallback ? (
        <ButtonLink href={`/c/${fallback.id}`} className="mt-5">
          Back to {fallback.name}
        </ButtonLink>
      ) : null}
    </main>
  );
}
