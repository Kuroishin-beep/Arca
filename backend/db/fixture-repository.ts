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

import { normaliseStats } from "@backend/domain/item-fields";

import {
  type CharacterSheet,
  clampSheet,
  emptySheet,
} from "@backend/domain/character";
import {
  type CatalogItemView,
  type CharacterView,
  type CommentView,
  type ContainerView,
  type CreateItemInput,
  type ItemView,
  type MoveItemInput,
  type Principal,
  type UpdateCharacterInput,
  type UpdateItemInput,
  carriedWeight,
  changedInheritedFields,
  inheritedFieldsMessage,
  ownershipProblem,
} from "@backend/domain/view";
import {
  assertCanEditContainer,
  assertCanCreateItem,
  assertCanManageCatalog,
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
  SEED_CATALOG,
  SEED_CHARACTERS,
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
  /**
   * Sheets by container id, and only for the containers that have one. A
   * character container with no entry gets `emptySheet()` on read, which is the
   * same thing the Postgres side does when the eight properties are absent —
   * so "never filled in" behaves identically on both backends.
   */
  characters: Record<string, CharacterSheet>;
  /**
   * Catalogue entries — SCOPE.md S3. Objects no container holds, which is why
   * they are their own list here rather than items with a flag: the Postgres
   * side distinguishes them by the absence of a containment edge, and a list
   * nothing joins to is the in-memory shape of that.
   */
  catalog: (Omit<CatalogItemView, "copies"> & { archivedAt: Date | null })[];
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
      stats: normaliseStats(item.types, item.stats),
      // The seed's items are typed in by hand, not taken from the catalogue —
      // they predate it, and leaving them free-standing keeps the seed a
      // worked example of BOTH kinds of item.
      catalogItemId: null,
      updatedAt: now,
      archivedAt: null,
    })),
    catalog: SEED_CATALOG.map((entry) => ({
      id: entry.id as ItemView["id"],
      name: entry.name,
      weight: entry.weight,
      value: entry.value,
      tags: [...entry.tags],
      types: [...entry.types],
      stats: normaliseStats(entry.types, entry.stats),
      notes: entry.notes,
      updatedAt: now,
      archivedAt: null,
    })),
    characters: Object.fromEntries(
      Object.entries(SEED_CHARACTERS).map(([id, sheet]) => [
        id,
        structuredClone(sheet),
      ]),
    ),
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

/**
 * Drop the internal column and resolve the catalogue link (SCOPE.md S3).
 *
 * A copy stores only `qty` and `notes`. Everything else is read from its
 * entry HERE, on the way out, rather than copied in on the way in — which is
 * the difference between "the rope's weight was corrected" and "the rope's
 * weight was corrected in the catalogue and in none of the six packs holding
 * one".
 *
 * An entry that has been archived out from under a copy falls back to
 * whatever the copy itself holds, so a broken link degrades to a nameless row
 * rather than to a crash. `archiveCatalogItem` refuses to create that
 * situation; this is the belt to its braces.
 */
function stripInternal(item: ItemView & { archivedAt: Date | null }): ItemView {
  const { archivedAt: _archivedAt, ...stored } = item;
  // Normalised on read as well as on write: see `normaliseStats`.
  const rest = { ...stored, stats: normaliseStats(stored.types, stored.stats) };
  if (rest.catalogItemId === null) return rest;

  const entry = store().catalog.find(
    (c) => c.id === rest.catalogItemId && c.archivedAt === null,
  );
  if (!entry) return rest;

  return {
    ...rest,
    name: entry.name,
    weight: entry.weight,
    value: entry.value,
    tags: [...entry.tags],
    types: [...entry.types],
    stats: normaliseStats(entry.types, entry.stats),
  };
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

/** Live copies of one catalogue entry, across every container. Derived, which
 *  is why archiving can ask the question without a stored counter to trust. */
function copyCount(catalogItemId: string): number {
  return store().items.filter(
    (i) => i.catalogItemId === catalogItemId && i.archivedAt === null,
  ).length;
}

function withCopyCount(
  entry: Store["catalog"][number],
): CatalogItemView {
  const { archivedAt: _archivedAt, ...rest } = entry;
  return {
    ...rest,
    stats: normaliseStats(rest.types, rest.stats),
    copies: copyCount(entry.id),
  };
}

function findCatalogItem(catalogItemId: string) {
  const entry = store().catalog.find(
    (c) => c.id === catalogItemId && c.archivedAt === null,
  );
  if (!entry) throw new NotFoundError("No such catalogue entry.");
  return entry;
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

  async getCharacter(principal, containerId): Promise<CharacterView | null> {
    const container = findContainer(containerId);
    assertCanRead(principal, container);
    if (container.type !== "character") return null;

    return {
      containerId: container.id,
      name: container.name,
      ownerId: container.ownerId,
      // Clamped on the way out, not only on the way in: a sheet whose CON was
      // lowered while HP sat at the old maximum has to render legally.
      sheet: clampSheet(store().characters[containerId] ?? emptySheet()),
    };
  },

  async updateCharacter(
    principal,
    input: UpdateCharacterInput,
  ): Promise<CharacterView> {
    const container = findContainer(input.containerId);
    assertCanWrite(principal, container);
    if (container.type !== "character") {
      throw new NotFoundError("That container is not a character.");
    }

    const { containerId, ...patch } = input;
    const current = store().characters[containerId] ?? emptySheet();

    // Only the sections actually present are replaced; `undefined` means leave
    // it alone, which is what makes ticking a skill safe while someone else is
    // editing the profile.
    const next = clampSheet({
      ...current,
      ...(Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ) as Partial<CharacterSheet>),
    });

    store().characters[containerId] = next;

    return {
      containerId: container.id,
      name: container.name,
      ownerId: container.ownerId,
      sheet: next,
    };
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

  /* ---------------------------------------------------------------- *
   * The catalogue — SCOPE.md S3
   * ---------------------------------------------------------------- */

  async listCatalog(): Promise<CatalogItemView[]> {
    // Unfiltered by principal on purpose: a catalogue says what a rope
    // weighs, never who has one. See `listCatalog` on the interface.
    return store()
      .catalog.filter((entry) => entry.archivedAt === null)
      .map(withCopyCount)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getCatalogItem(_principal, catalogItemId) {
    const entry = store().catalog.find(
      (c) => c.id === catalogItemId && c.archivedAt === null,
    );
    return entry ? withCopyCount(entry) : null;
  },

  async createCatalogItem(principal, input) {
    assertCanManageCatalog(principal);

    const entry = {
      id: randomUUID() as ItemView["id"],
      name: input.name,
      weight: input.weight,
      value: input.value,
      tags: [...input.tags],
      types: [...input.types],
      stats: normaliseStats(input.types, input.stats),
      notes: input.notes,
      updatedAt: new Date(),
      archivedAt: null,
    };
    store().catalog.push(entry);
    return withCopyCount(entry);
  },

  async updateCatalogItem(principal, input) {
    assertCanManageCatalog(principal);

    const entry = findCatalogItem(input.id);
    const { id: _id, ...patch } = input;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        // Only the keys actually present; `undefined` means leave it alone,
        // the same patch discipline `updateItem` follows.
        (entry as Record<string, unknown>)[key] = value;
      }
    }
    if (input.stats !== undefined) {
      entry.stats = normaliseStats(entry.types, input.stats);
    }
    entry.updatedAt = new Date();

    // Nothing fans out. Every copy reads these fields through the link, so
    // correcting them here has already corrected them everywhere.
    return withCopyCount(entry);
  },

  async archiveCatalogItem(principal, catalogItemId) {
    assertCanManageCatalog(principal);

    const entry = findCatalogItem(catalogItemId);
    const copies = copyCount(entry.id);
    if (copies > 0) {
      throw new ConflictError(
        `${copies} ${copies === 1 ? "copy" : "copies"} of that still ` +
          `${copies === 1 ? "exists" : "exist"}. Archiving it would leave ` +
          `${copies === 1 ? "it" : "them"} reading a definition nothing can open.`,
      );
    }
    entry.archivedAt = new Date();
  },

  async addFromCatalog(principal, input) {
    const container = findContainer(input.containerId);
    // The destination only. Nothing leaves the catalogue, so there is no
    // source to authorise — this is a copy, not a move.
    assertCanWrite(principal, container);

    const entry = findCatalogItem(input.catalogItemId);

    const item: ItemView & { archivedAt: Date | null } = {
      id: randomUUID() as ItemView["id"],
      containerId: container.id,
      // Stored empty, and read through the link. Writing the entry's values
      // in here would make this a copy in the bad sense: a snapshot that
      // stops agreeing with its source the moment the source is corrected.
      name: "",
      weight: 0,
      value: "",
      tags: [],
      types: [],
      stats: {},
      qty: input.qty,
      notes: "",
      catalogItemId: entry.id,
      updatedAt: new Date(),
      archivedAt: null,
    };
    store().items.push(item);
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
    assertCanCreateItem(principal);
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
      stats: normaliseStats(input.types, input.stats),
      // Typed in by hand, so it owns its own fields. `addFromCatalog` is the
      // other door, and the one that sets a link.
      catalogItemId: null,
      updatedAt: new Date(),
      archivedAt: null,
    };
    store().items.push(item);
    return stripInternal(item);
  },

  async updateItem(principal, input: UpdateItemInput) {
    const item = findItem(input.id);
    assertCanWrite(principal, findContainer(item.containerId));

    // A catalogue copy owns only its quantity and notes. See the same guard in
    // the Postgres repository: a CHANGED inherited field is refused with
    // directions, an unchanged one (the form round-tripping what it showed)
    // is dropped, and either way nothing is written that the next read would
    // silently overwrite from the entry.
    if (item.catalogItemId !== null) {
      const changed = changedInheritedFields(stripInternal(item), input);
      if (changed.length > 0) {
        throw new ConflictError(inheritedFieldsMessage(changed));
      }
      if (input.qty !== undefined) item.qty = input.qty;
      if (input.notes !== undefined) item.notes = input.notes;
      item.updatedAt = new Date();
      return stripInternal(item);
    }

    // `undefined` means "leave this alone" — a patch, not a replacement.
    if (input.name !== undefined) item.name = input.name;
    if (input.qty !== undefined) item.qty = input.qty;
    if (input.weight !== undefined) item.weight = input.weight;
    if (input.value !== undefined) item.value = input.value;
    if (input.tags !== undefined) item.tags = input.tags;
    if (input.notes !== undefined) item.notes = input.notes;
    if (input.types !== undefined) item.types = input.types;
    if (input.stats !== undefined) {
      item.stats = normaliseStats(item.types, input.stats);
    }
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
      // Resolved, not raw: a catalogue copy's stored name is empty, and this
      // string is announced to the whole table.
      itemName: stripInternal(item).name,
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

  async setMemberRole(principal, userId, role) {
    assertCanManageRoster(principal);

    const member = store().users.find((u) => u.userId === userId);
    if (!member) throw new NotFoundError("No such member.");

    // The last GM cannot be demoted — see the note on the interface.
    if (member.role === "gm" && role !== "gm") {
      const gms = store().users.filter((u) => u.role === "gm").length;
      if (gms <= 1) {
        throw new ConflictError(
          "This is the only GM. Make someone else a GM first, then change this one.",
        );
      }
    }

    member.role = role;
    return { ...principalOf(member), hasPassword: member.passwordHash !== null };
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
