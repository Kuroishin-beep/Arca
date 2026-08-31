import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonLink } from "@frontend/components/atoms/Button";
import { Chip, ContainerBadge, ContainerDot } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { ContainerActions } from "@frontend/components/organisms/ContainerActions";
import { ContainerEditorDialog } from "@frontend/components/organisms/ContainerEditorDialog";
import { DetailPanel } from "@frontend/components/organisms/DetailPanel";
import { ShareDialog } from "@frontend/components/organisms/ShareDialog";
import { WorkspaceShell } from "@frontend/components/organisms/WorkspaceShell";
import {
  OptimisticItemsProvider,
  OptimisticWeightMeter,
} from "@frontend/components/organisms/OptimisticItems";
import { ItemEditorDialog } from "@frontend/components/organisms/ItemEditorDialog";
import {
  MoveItemDialog,
  type MoveTarget,
} from "@frontend/components/organisms/MoveItemDialog";
import { ItemTable } from "@frontend/components/organisms/ItemTable";
import { repository } from "@backend/db";
import { CAMPAIGN_NAME } from "@backend/db/seed-data";
import { listDatabases } from "@backend/domain/database";
import {
  DEFAULT_SORT,
  SortColumn,
  SortDirection,
  type Sort,
  matchesQuery,
  matchesTags,
  sortItems,
  tagsOf,
} from "@backend/domain/view";
import {
  PermissionError,
  canRetireContainer,
  canWrite,
  creatableContainerTypes,
  writeDeniedReason,
} from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

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
    /** Comma-separated tag filter (M9). In the URL like every other piece of
     *  view state, so a filtered list is a link you can send someone. */
    tags?: string;
    sort?: string;
    dir?: string;
    dialog?: string;
    nav?: string;
    /** "0" collapses the pinned rail. Absent means shown. */
    rail?: string;
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

  const selectedTags = (sp.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");

  // Chips are built from what is ACTUALLY in this container, so a tag never
  // offers itself as a filter that can only ever return nothing.
  const availableTags = tagsOf(allItems);

  const items = sortItems(
    allItems.filter(
      (item) => matchesQuery(item, query) && matchesTags(item, selectedTags),
    ),
    sort,
  );

  /** Toggling one chip preserves every other piece of view state. */
  const tagHref = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (next.length > 0) params.set("tags", next.join(","));
    if (sp.sort) params.set("sort", sp.sort);
    if (sp.dir) params.set("dir", sp.dir);
    const qs = params.toString();
    return `/c/${containerId}${qs ? `?${qs}` : ""}`;
  };

  const selected = sp.item
    ? (allItems.find((i) => i.id === sp.item) ?? null)
    : null;
  const comments = await repo.listComments(principal, containerId);
  const editable = canWrite(principal, container);

  const closeHref = `/c/${containerId}${
    sp.item ? `?item=${sp.item}` : query ? `?q=${encodeURIComponent(query)}` : ""
  }`;

  // The pinned rail, collapsed — Wireframe.png labels this control "Collapse".
  // URL state like everything else on this screen, which also makes a collapsed
  // rail part of a link you can send someone.
  const railCollapsed = sp.rail === "0";

  /** The rail toggle: this screen's URL with `rail` flipped and everything
   *  else kept, so collapsing the sidebar never also drops your search. */
  const railHref = (() => {
    const p = new URLSearchParams();
    if (sp.item) p.set("item", sp.item);
    if (query) p.set("q", query);
    if (sp.tags) p.set("tags", sp.tags);
    if (sp.sort) p.set("sort", sp.sort);
    if (sp.dir) p.set("dir", sp.dir);
    if (!railCollapsed) p.set("rail", "0");
    const qs = p.toString();
    return `/c/${containerId}${qs ? `?${qs}` : ""}`;
  })();

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
  const isGm = principal.role === "gm";

  // The Databases section of the sidebar. Derived from the types on objects
  // this principal can reach, so it is a per-viewer list by construction —
  // see `backend/domain/database.ts`.
  const databases = await listDatabases(repo, principal);

  // The Sidebar renders this only for someone who may create something — but
  // the action checks the principal again server-side, because a link is not a
  // permission.
  const newContainerHref = `/c/${containerId}?dialog=new-container`;

  // The kinds this principal may bring into existence, and whether they may
  // reshape one that already exists. Computed here, in server code, and passed
  // down: the dialog is a client component and the rules are not.
  const allowedTypes = creatableContainerTypes(principal);
  const canRetireThis = canRetireContainer(principal, container);
  // Only fetched when the dialog is actually open: the owner picker is the one
  // place the roster is needed, and a GM opening a container list should not
  // cost a members query every time.
  // Needed by BOTH container dialogs now that owner is editable, and still only
  // fetched when one of them is actually open.
  const containerDialogOpen =
    sp.dialog === "new-container" || sp.dialog === "edit-container";
  // Only the GM gets an owner picker, so only the GM needs the roster there.
  // Share needs it for everyone, because the whole point of that dialog is the
  // per-member answer — so it is fetched when either is open.
  const shareOpen = sp.dialog === "share";
  const members =
    shareOpen || (containerDialogOpen && isGm) ? await repo.listMembers() : [];

  // Somewhere to land after retiring, since the current container will be gone.
  const retireFallbackHref = (() => {
    const other = containers.find((c) => c.id !== containerId);
    return other ? `/c/${other.id}` : undefined;
  })();

  /**
   * The detail panel — pinned at lg, a sheet below it.
   *
   * Built here and handed to the shell as `aside` rather than rendered inside
   * the content column, because it is a SIBLING of the main column: the two
   * scroll independently, and nesting it would put the item detail inside the
   * scroll container of the table it is describing.
   */
  const detailPanel = selected ? (
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
  ) : null;

  return (
    // The provider spans the table, the footer meter and the dialogs, because
    // a move begun in a dialog has to be reflected in the other two before the
    // server answers (SCOPE.md §8.1 step 4).
    <OptimisticItemsProvider>
      <WorkspaceShell
        principal={principal}
        containers={containers}
        databases={databases}
        campaignName={CAMPAIGN_NAME}
        selectedId={containerId}
        newContainerHref={newContainerHref}
        searchAction={`/c/${containerId}`}
        query={query}
        placeholder={`Search ${container.name}…`}
        navOpen={drawerOpen}
        drawerHref={`/c/${containerId}?nav=1`}
        railCollapsed={railCollapsed}
        railHref={railHref}
        closeHref={closeHref}
        quickAccess={{
          href: `/c/${containerId}`,
          label: container.name,
          kind: "container",
        }}
        actions={
          <ContainerActions
            container={container}
            principal={principal}
            editable={editable}
          />
        }
        aside={detailPanel}
      >
          <div className="shrink-0 border-b border-border bg-bg px-3 pt-3 md:px-4 md:pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ContainerDot type={container.type} />
                <h1 className="min-w-0 truncate font-serif text-xl font-bold text-text">
                  {container.name}
                </h1>
                <ContainerBadge type={container.type} />
                {!editable ? <Chip tone="neutral">Read only</Chip> : null}
                {/* A GM looking at an unrevealed container should be able to
                    tell at a glance, without opening anything. */}
                {isGm && container.type === "world" && !container.revealed ? (
                  <Chip tone="warning">Hidden</Chip>
                ) : null}
              </div>

              {editable ? (
                <div className="flex items-center gap-2">
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

            {/* Filter row: tag chips (M9) plus whatever narrowing is active.
                Chips are links, not buttons, so a filtered view is a real URL
                and the whole row works with JavaScript off. */}
            {availableTags.length > 0 || query || selectedTags.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 pb-2">
                {availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Link
                      key={tag}
                      href={tagHref(tag)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs ${
                        active
                          ? "border-primary bg-primary-weak font-medium text-primary"
                          : "border-border bg-surface2 text-muted hover:text-text"
                      }`}
                    >
                      {tag}
                      {active ? (
                        <Icon name="close" size={10} strokeWidth={2} />
                      ) : null}
                    </Link>
                  );
                })}

                {query ? (
                  <Chip>
                    search: {query}
                    <Link
                      href={
                        selectedTags.length > 0
                          ? `/c/${containerId}?tags=${encodeURIComponent(selectedTags.join(","))}`
                          : `/c/${containerId}`
                      }
                      className="text-muted hover:text-text"
                    >
                      <Icon name="close" size={10} strokeWidth={2} />
                      <span className="sr-only">Clear search</span>
                    </Link>
                  </Chip>
                ) : null}

                {query || selectedTags.length > 0 ? (
                  <span className="text-sm text-muted">
                    {items.length} of {allItems.length}
                  </span>
                ) : null}
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
              {/* Counts the container's FULL contents, not the filtered view —
                  a tag filter narrows what you are looking at, it does not
                  make the pack lighter. */}
              <OptimisticWeightMeter items={allItems} container={container} />
            </div>
          </div>
      </WorkspaceShell>

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

      {/* Share is gated on READ, not write — which reaching this line already
          proves. It describes who can see this container; someone who can see
          it may know who else can. */}
      {shareOpen ? (
        <ShareDialog
          container={container}
          members={members}
          closeHref={`/c/${containerId}`}
        />
      ) : null}

      {sp.dialog === "new-container" && allowedTypes.length > 0 ? (
        <ContainerEditorDialog
          members={members}
          closeHref={`/c/${containerId}`}
          allowedTypes={allowedTypes}
          canReshape={isGm}
          selfId={principal.userId}
        />
      ) : null}

      {/* Editing needs write access to the container itself: renaming the
          Barrow Chest is not something a player does to a revealed world
          container they cannot even take from. The retire control appears
          only for someone who may actually retire this one. */}
      {sp.dialog === "edit-container" && editable ? (
        <ContainerEditorDialog
          members={members}
          container={container}
          closeHref={`/c/${containerId}`}
          retireFallbackHref={canRetireThis ? retireFallbackHref : undefined}
          allowedTypes={allowedTypes}
          canReshape={isGm}
          selfId={principal.userId}
        />
      ) : null}

      {sp.dialog === "edit" && selected && editable ? (
        <ItemEditorDialog
          container={container}
          item={selected}
          closeHref={closeHref}
        />
      ) : null}
    </OptimisticItemsProvider>
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
