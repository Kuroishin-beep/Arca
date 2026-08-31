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
  ownershipProblem,
} from "@backend/domain/view";
import {
  assertCanEditContainer,
  assertCanManageContainer,
  assertCanManageRoster,
  assertCanMove,
  assertCanRead,
  assertCanRetireContainer,
  assertCanWrite,
  visibleContainers,
} from "@backend/lib/permissions";
import {
  clearFailures,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "@backend/lib/password";

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
  /** The roster, plus the enrolled password hash. `passwordHash` is
   *  deliberately part of the store and NOT of `Member`: it is compared inside
   *  this module and is never handed to a caller. Null means "has not chosen
   *  one yet". */
  users: (Principal & { passwordHash: string | null })[];
  containers: Omit<ContainerView, "itemCount" | "carriedWeight">[];
  items: (ItemView & { archivedAt: Date | null })[];
  comments: CommentView[];
}

const STORE_KEY = Symbol.for("arca.fixture.store");

function freshStore(): Store {
  const now = new Date();
  return {
    // Seeded unenrolled. Fixture mode is the no-database mode, so a password
    // set here would survive only until the dev server restarts; starting every
    // member at "choose a password" exercises the real first-run flow every
    // time rather than once.
    users: SEED_USERS.map((u) => ({
      userId: u.id as Principal["userId"],
      displayName: u.displayName,
      email: u.email,
      role: u.role,
      passwordHash: null,
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
        authorEmail: author?.email ?? "unknown@arca.invalid",
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

  async createContainer(principal, input) {
    assertCanManageContainer(principal, {
      type: input.type,
      ownerId: input.ownerId,
    });

    const container = {
      id: randomUUID() as ContainerView["id"],
      name: input.name,
      type: input.type,
      ownerId: input.ownerId,
      // Only a world container has anything to reveal.
      revealed: input.type === "world" ? input.revealed : true,
      capacity: input.capacity,
    };
    store().containers.push(container);
    return hydrate(container);
  },

  async updateContainer(principal, input) {
    const raw = store().containers.find((c) => c.id === input.id);
    if (!raw) throw new NotFoundError("No such container.");

    // The merged result, judged before anything is written — same rule and
    // same order as the Postgres backend.
    const type = input.type ?? raw.type;
    const ownerId = input.ownerId !== undefined ? input.ownerId : raw.ownerId;

    // Authorised against BOTH the stored row and the row this patch would
    // produce, so an edit cannot walk a container from a kind you may touch to
    // one you may not.
    assertCanEditContainer(
      principal,
      { type: raw.type, ownerId: raw.ownerId },
      { type, ownerId },
    );

    const problem = ownershipProblem(type, ownerId);
    if (problem) throw new ConflictError(problem);

    // `undefined` means leave it alone; `null` on capacity means no limit.
    // Assigning unconditionally is exactly the data-loss bug UpdateItemInput's
    // comment warns about, one level up.
    if (input.name !== undefined) raw.name = input.name;
    if (input.capacity !== undefined) raw.capacity = input.capacity;
    raw.type = type;
    raw.ownerId = ownerId;

    // Converting away from world forces it visible; a lingering invisible
    // container would have no control left to fix it.
    if (type !== "world") {
      raw.revealed = true;
    } else if (input.revealed !== undefined) {
      raw.revealed = input.revealed;
    }

    return hydrate(raw);
  },

  async archiveContainer(principal, containerId) {
    assertCanRetireContainer(principal, findContainer(containerId));

    // Same refusal as the Postgres backend: hiding a container that still
    // holds items would leave them belonging somewhere and appearing nowhere.
    const held = liveItemsIn(containerId);
    if (held.length > 0) {
      throw new ConflictError(
        `That container still holds ${held.length} ${
          held.length === 1 ? "item" : "items"
        }. Move them somewhere else first.`,
      );
    }

    const all = store().containers;
    const at = all.findIndex((c) => c.id === containerId);
    if (at >= 0) all.splice(at, 1);
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
      authorEmail: principal.email,
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
    // Projected, not returned: `passwordHash` lives on the store rows and must
    // not travel with them. Spreading the row and deleting the field would
    // leave the hash one forgotten `...member` away from a client component.
    return store().users.map(
      ({ userId, displayName, email, role, passwordHash }) => ({
        userId,
        displayName,
        email,
        role,
        hasPassword: passwordHash !== null,
      }),
    );
  },

  async authenticateMember(email, password) {
    const member = byEmail(email);
    // Same `null` for unknown address, unenrolled member and wrong password —
    // see the note on the interface. Nothing here distinguishes them.
    if (!member?.passwordHash) return null;
    if (!(await verifyPassword(password, member.passwordHash))) return null;

    clearFailures(email);
    return principalOf(member);
  },

  async registerMember(input) {
    const email = normaliseEmail(input.email);
    // Taken is taken — including by a member the GM added who has not signed in
    // yet. Letting a stranger register over an unenrolled row would be a way to
    // claim somebody else's invited seat by guessing their address.
    if (byEmail(email)) return null;

    const member = {
      userId: randomUUID() as Principal["userId"],
      displayName: input.displayName,
      email,
      // Never from the input. Self-signup mints players and only players.
      role: "player" as const,
      passwordHash: await hashPassword(input.password),
    };
    store().users.push(member);
    return principalOf(member);
  },

  async addMember(principal, input) {
    assertCanManageRoster(principal);

    const email = normaliseEmail(input.email);
    if (byEmail(email)) return null;

    const member = {
      userId: randomUUID() as Principal["userId"],
      displayName: input.displayName,
      email,
      role: input.role,
      // Unenrolled: they choose their own password on first sign-in.
      passwordHash: null,
    };
    store().users.push(member);
    return { ...principalOf(member), hasPassword: false };
  },

  async resetMemberPassword(principal, userId) {
    assertCanManageRoster(principal);

    const member = store().users.find((u) => u.userId === userId);
    if (!member) throw new NotFoundError("No such member.");
    member.passwordHash = null;
    // The throttle is keyed by address, so a reset that did not clear it would
    // leave a locked-out member locked out with a brand new password.
    clearFailures(member.email);
  },

  async enrolMemberPassword(email, password) {
    const member = byEmail(email);
    // Refusing when a password already exists is what keeps this a first-run
    // step rather than a way to overwrite somebody else's.
    if (!member || member.passwordHash !== null) return null;

    member.passwordHash = await hashPassword(password);
    return principalOf(member);
  },
};

/** Normalised on the way in, so `Kova@…` and `kova@…` find the same member —
 *  the store holds already-normalised addresses. */
function byEmail(email: string) {
  const wanted = normaliseEmail(email);
  return store().users.find((u) => u.email === wanted) ?? null;
}

/** Strips `passwordHash` by naming the fields that may leave, rather than by
 *  removing the one that may not. */
function principalOf(member: Store["users"][number]): Principal {
  return {
    userId: member.userId,
    displayName: member.displayName,
    email: member.email,
    role: member.role,
  };
}
