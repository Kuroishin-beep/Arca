/**
 * In-memory repository — the default when no DATABASE_URL is set.
 *
 * It is not a mock. It implements the same rules the Postgres repository does:
 * both ends authorised on a move, partial stacks split, soft delete, derived
 * weights. That is deliberate — if the fixture repo were permissive, the UI
 * would be built against rules the real backend does not honour, and every
 * permission bug would surface only in production.
 *
 * State lives on `globalThis` so Next's dev-server module reloading does not
 * reset the wagon every time a component is edited.
 */
import { randomUUID } from "node:crypto";

import {
  type CommentView,
  type ContainerView,
  type CreateItemInput,
  type ItemView,
  type MoveItemInput,
  type Principal,
  type UpdateItemInput,
  carriedWeight,
} from "@backend/domain/view";
import {
  assertCanMove,
  assertCanRead,
  assertCanWrite,
  visibleContainers,
} from "@backend/lib/permissions";

import {
  type ArcaRepository,
  ConflictError,
  type MoveOutcome,
  NotFoundError,
} from "./repository";
import {
  SEED_COMMENTS,
  SEED_CONTAINERS,
  SEED_ITEMS,
  SEED_USERS,
} from "./seed-data";

interface Store {
  users: Principal[];
  containers: Omit<ContainerView, "itemCount" | "carriedWeight">[];
  items: (ItemView & { archivedAt: Date | null })[];
  comments: CommentView[];
}

const STORE_KEY = Symbol.for("arca.fixture.store");

function freshStore(): Store {
  const now = new Date();
  return {
    users: SEED_USERS.map((u) => ({
      userId: u.id as Principal["userId"],
      displayName: u.displayName,
      role: u.role,
    })),
    containers: SEED_CONTAINERS.map((c) => ({
      id: c.id as ContainerView["id"],
      name: c.name,
      type: c.type,
      ownerId: c.ownerId as ContainerView["ownerId"],
      revealed: c.revealed,
      capacity: c.capacity,
    })),
    items: SEED_ITEMS.map((item) => ({
      id: item.id as ItemView["id"],
      containerId: item.containerId as ItemView["containerId"],
      name: item.name,
      qty: item.qty,
      weight: item.weight,
      value: item.value,
      tags: [...item.tags],
      notes: item.notes,
      types: [...item.types],
      updatedAt: now,
      archivedAt: null,
    })),
    comments: SEED_COMMENTS.map((c) => {
      const author = SEED_USERS.find((u) => u.id === c.authorId);
      return {
        id: c.id,
        containerId: c.containerId as ContainerView["id"],
        authorName: author?.displayName ?? "Unknown",
        authorRole: author?.role ?? "player",
        content: c.content,
        parentId: c.parentId,
        createdAt: new Date(now.getTime() - c.minutesAgo * 60_000),
      };
    }),
  };
}

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  let s = g[STORE_KEY];
  if (!s) {
    s = freshStore();
    g[STORE_KEY] = s;
  }
  return s;
}

/** Test helper. Not exported through the repository interface. */
export function resetFixtureStore(): void {
  (globalThis as unknown as Record<symbol, Store | undefined>)[STORE_KEY] =
    freshStore();
}

/* ------------------------------------------------------------------ */

function liveItemsIn(containerId: string): ItemView[] {
  return store()
    .items.filter((i) => i.containerId === containerId && i.archivedAt === null)
    .map(stripInternal);
}

function stripInternal(item: ItemView & { archivedAt: Date | null }): ItemView {
  const { archivedAt: _archivedAt, ...rest } = item;
  return rest;
}

/** Containers carry their derived counts; nothing is stored. */
function hydrate(
  container: Omit<ContainerView, "itemCount" | "carriedWeight">,
): ContainerView {
  const items = liveItemsIn(container.id);
  return {
    ...container,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    carriedWeight: carriedWeight(items),
  };
}

function findContainer(containerId: string): ContainerView {
  const raw = store().containers.find((c) => c.id === containerId);
  if (!raw) throw new NotFoundError("No such container.");
  return hydrate(raw);
}

function findItem(itemId: string) {
  const item = store().items.find(
    (i) => i.id === itemId && i.archivedAt === null,
  );
  if (!item) throw new NotFoundError("That item is no longer here.");
  return item;
}

export const fixtureRepository: ArcaRepository = {
  async listContainers(principal) {
    return visibleContainers(principal, store().containers.map(hydrate));
  },

  async getContainer(principal, containerId) {
    const raw = store().containers.find((c) => c.id === containerId);
    if (!raw) return null;
    const container = hydrate(raw);
    assertCanRead(principal, container);
    return container;
  },

  async listItems(principal, containerId) {
    // Read the container first so an unauthorised caller never reaches the
    // item list at all — the contents of a sealed vault must not be assembled
    // in memory and then filtered.
    assertCanRead(principal, findContainer(containerId));
    return liveItemsIn(containerId);
  },

  async getItem(principal, itemId) {
    const item = store().items.find(
      (i) => i.id === itemId && i.archivedAt === null,
    );
    if (!item) return null;
    assertCanRead(principal, findContainer(item.containerId));
    return stripInternal(item);
  },

  async listComments(principal, containerId) {
    assertCanRead(principal, findContainer(containerId));
    return store()
      .comments.filter((c) => c.containerId === containerId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async createComment(principal, input) {
    // Read, not write — see the note on the interface. A player may discuss a
    // revealed world container they cannot touch.
    assertCanRead(principal, findContainer(input.containerId));

    // One level, enforced the same way the Postgres backend does it: a reply to
    // a reply is re-pointed at that reply's parent.
    let parentId = input.parentId;
    if (parentId) {
      const parent = store().comments.find(
        (c) => c.id === parentId && c.containerId === input.containerId,
      );
      parentId = parent ? (parent.parentId ?? parent.id) : null;
    }

    const comment: CommentView = {
      id: randomUUID(),
      containerId: input.containerId,
      authorName: principal.displayName,
      authorRole: principal.role,
      content: input.content,
      parentId,
      createdAt: new Date(),
    };
    store().comments.push(comment);
    return comment;
  },

  async createItem(principal, input: CreateItemInput) {
    assertCanWrite(principal, findContainer(input.containerId));
    const item = {
      id: randomUUID() as ItemView["id"],
      containerId: input.containerId,
      name: input.name,
      qty: input.qty,
      weight: input.weight,
      value: input.value,
      tags: input.tags,
      notes: input.notes,
      types: input.types,
      updatedAt: new Date(),
      archivedAt: null,
    };
    store().items.push(item);
    return stripInternal(item);
  },

  async updateItem(principal, input: UpdateItemInput) {
    const item = findItem(input.id);
    assertCanWrite(principal, findContainer(item.containerId));

    // `undefined` means "leave this alone" — a patch, not a replacement.
    if (input.name !== undefined) item.name = input.name;
    if (input.qty !== undefined) item.qty = input.qty;
    if (input.weight !== undefined) item.weight = input.weight;
    if (input.value !== undefined) item.value = input.value;
    if (input.tags !== undefined) item.tags = input.tags;
    if (input.notes !== undefined) item.notes = input.notes;
    if (input.types !== undefined) item.types = input.types;
    item.updatedAt = new Date();

    return stripInternal(item);
  },

  async archiveItem(principal, itemId) {
    const item = findItem(itemId);
    assertCanWrite(principal, findContainer(item.containerId));
    item.archivedAt = new Date();
  },

  async moveItem(principal, input: MoveItemInput): Promise<MoveOutcome> {
    const item = findItem(input.itemId);
    const from = findContainer(item.containerId);
    const to = findContainer(input.toContainerId);

    if (from.id === to.id) {
      throw new ConflictError("That item is already there.");
    }

    // BOTH ends. Checking only the destination is how an item gets laundered
    // out of a container the actor cannot touch.
    assertCanMove(principal, from, to);

    if (input.qty > item.qty) {
      throw new ConflictError(
        `Only ${item.qty} left — someone may have moved the rest.`,
      );
    }

    const split = input.qty < item.qty;

    if (split) {
      // A partial move splits the stack: the source keeps the remainder and a
      // NEW object arrives at the destination. Identity is preserved for the
      // part that stayed.
      item.qty -= input.qty;
      item.updatedAt = new Date();
      store().items.push({
        ...item,
        id: randomUUID() as ItemView["id"],
        containerId: to.id,
        qty: input.qty,
        tags: [...item.tags],
        types: [...item.types],
        updatedAt: new Date(),
        archivedAt: null,
      });
    } else {
      // The whole stack moves: ONE field changes. The object's id, properties,
      // notes and history are untouched — this is the payoff of containment
      // being an edge rather than a column (SCOPE.md §5.1).
      item.containerId = to.id;
      item.updatedAt = new Date();
    }

    return {
      movedQty: input.qty,
      split,
      fromContainerId: from.id,
      toContainerId: to.id,
      itemName: item.name,
    };
  },

  async listMembers() {
    return store().users;
  },

  /**
   * Always `null`, and correctly so.
   *
   * Membership is a database fact — a row in `campaign_members` that the GM
   * put there. Fixture mode is the no-database mode, so it has no Discord
   * links to resolve and cannot invent one without deciding, in code, that
   * whoever signs in is a member of the campaign. Discord auth therefore
   * requires DATABASE_URL; without it the app uses the member picker, which
   * `authConfigured()` in `backend/lib/auth.ts` selects between.
   */
  async findMemberByDiscordId() {
    return null;
  },
};
