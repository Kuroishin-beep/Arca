/**
 * The domain model — a direct translation of the state table in
 * `final-project-planning/01-proposal.md`.
 *
 * Each entity here becomes one table in `migrations/` and one array in the
 * React state tree later. Where this file and the proposal disagree, the
 * proposal is right and this file is a bug.
 *
 * Everything is defined as a zod schema first and the TypeScript type is
 * inferred from it. That way there is one definition, not a type and a
 * separately-maintained validator that drift apart.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Identifiers
 * ------------------------------------------------------------------ */

/**
 * IDs are branded, so a `ContainerId` will not typecheck where an `ItemId` is
 * expected. This is not ceremony: the core operation of the whole app is
 * `moveItem(itemId, containerId)` — two bare strings in the same order, which
 * is exactly the shape of argument you eventually swap by accident. The brand
 * exists only at compile time; at runtime these are ordinary UUID strings.
 */
export const UserId = z.string().uuid().brand<"UserId">();
export type UserId = z.infer<typeof UserId>;

export const ContainerId = z.string().uuid().brand<"ContainerId">();
export type ContainerId = z.infer<typeof ContainerId>;

export const ItemId = z.string().uuid().brand<"ItemId">();
export type ItemId = z.infer<typeof ItemId>;

export const CommentId = z.string().uuid().brand<"CommentId">();
export type CommentId = z.infer<typeof CommentId>;

/* ------------------------------------------------------------------ *
 * User
 * ------------------------------------------------------------------ */

/**
 * A Westmarch campaign has asymmetric permissions: the GM may open and edit any
 * container, a player only their own. Every permission rule in the service
 * layer keys off this one field.
 */
export const USER_ROLES = ["gm", "player"] as const;
export const UserRole = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRole>;

export const User = z.object({
  id: UserId,
  displayName: z.string().trim().min(1).max(80),
  role: UserRole,
});
export type User = z.infer<typeof User>;

/* ------------------------------------------------------------------ *
 * Container
 * ------------------------------------------------------------------ */

/**
 * `character` — a player's own pack, owned by exactly one user.
 * `party`     — the shared wagon or stash, owned by nobody, writable by all.
 * `world`     — a dungeon chest or vault, owned by nobody, GM-only.
 */
export const CONTAINER_TYPES = ["character", "party", "world"] as const;
export const ContainerType = z.enum(CONTAINER_TYPES);
export type ContainerType = z.infer<typeof ContainerType>;

/**
 * `ownerId` is nullable, and which types allow it is a real rule rather than a
 * convention: a character pack without an owner has no one who may edit it,
 * and an owned party stash is a contradiction. Enforced here as well as by a
 * CHECK constraint in the schema — the database is the backstop, this is the
 * error message a human reads.
 */
const ContainerFields = z.object({
  id: ContainerId,
  name: z.string().trim().min(1).max(120),
  type: ContainerType,
  ownerId: UserId.nullable(),
  updatedAt: z.date(),
});

/** Declared once and applied to both the full row and the insert shape. */
const enforceOwnership = (
  container: { type: ContainerType; ownerId: UserId | null },
  ctx: z.RefinementCtx,
): void => {
  if (container.type === "character" && container.ownerId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ownerId"],
      message: "a character container must have an owner",
    });
  }
  if (container.type !== "character" && container.ownerId !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ownerId"],
      message: `a ${container.type} container must not have an owner`,
    });
  }
};

export const Container = ContainerFields.superRefine(enforceOwnership);
export type Container = z.infer<typeof Container>;

/* ------------------------------------------------------------------ *
 * Item
 * ------------------------------------------------------------------ */

/**
 * `containerId` is the single most important field in the model. It is how an
 * item knows where it lives, which makes moving one between containers a
 * one-column write instead of a remove-and-append across two arrays.
 *
 * `weight` is a float because Dragonbane encumbrance counts light items as a
 * half unit and tiny items as zero. Carried totals are derived from these rows
 * at read time and never stored.
 */
export const Item = z.object({
  id: ItemId,
  containerId: ContainerId,
  name: z.string().trim().min(1).max(120),
  qty: z.number().int().positive(),
  weight: z.number().nonnegative().finite().default(0),
  // Defaulted rather than optional so the parsed value is always a string and
  // callers never have to write `item.notes ?? ""`. Matches the column default.
  notes: z.string().max(2000).default(""),
  updatedAt: z.date(),
});
export type Item = z.infer<typeof Item>;

/* ------------------------------------------------------------------ *
 * Comment
 * ------------------------------------------------------------------ */

/**
 * `parentId` exists because the `Comment Card` in the design system takes an
 * `onReply` prop. A reply is a comment pointing at another comment: `null` is
 * top-level, otherwise it holds the id of what it answers. Without this field
 * the reply button has nowhere to put its result.
 *
 * The design system lists an `author` prop; stored here as `authorId` and
 * resolved to a display name on read, so renaming a user does not leave stale
 * names scattered through old comments.
 */
export const Comment = z.object({
  id: CommentId,
  containerId: ContainerId,
  authorId: UserId,
  content: z.string().trim().min(1).max(4000),
  parentId: CommentId.nullable(),
  createdAt: z.date(),
});
export type Comment = z.infer<typeof Comment>;

/* ------------------------------------------------------------------ *
 * Insert shapes
 * ------------------------------------------------------------------ */

/**
 * What a caller supplies when creating a row. The database owns `id`,
 * `createdAt`, and `updatedAt`, so accepting them from a caller would let a
 * client forge a timestamp or collide an id.
 */
export const NewUser = User.omit({ id: true });
export type NewUser = z.infer<typeof NewUser>;

export const NewContainer = ContainerFields.omit({
  id: true,
  updatedAt: true,
}).superRefine(enforceOwnership);
export type NewContainer = z.infer<typeof NewContainer>;

export const NewItem = Item.omit({ id: true, updatedAt: true });
export type NewItem = z.infer<typeof NewItem>;

export const NewComment = Comment.omit({ id: true, createdAt: true });
export type NewComment = z.infer<typeof NewComment>;

/** A partial update. `undefined` means "leave this column alone". */
export const ItemPatch = NewItem.partial();
export type ItemPatch = z.infer<typeof ItemPatch>;
