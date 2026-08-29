/**
 * The projection layer.
 *
 * `src/db/schema.ts` stores the general object graph — objects, composable
 * types, JSONB property values, containment edges. No component ever sees that
 * shape. These are the flat records the UI actually renders, and the boundary
 * that lets the storage model evolve without touching a screen
 * (SCOPE.md §5.3, schema doc rule 10).
 *
 * Everything here is a zod schema first, with the TypeScript type inferred, so
 * there is one definition rather than a type and a validator that drift.
 */
import { z } from "zod";

import { ContainerId, ContainerType, ItemId, UserId, UserRole } from "./types";

/* ------------------------------------------------------------------ *
 * Principal — who is asking
 * ------------------------------------------------------------------ */

/**
 * Every read and every write is evaluated against one of these. This is Arca's
 * version of Coda's volatile `User()` (see the research doc): one view
 * definition, evaluated per viewer, rather than a GM codepath and a player
 * codepath maintained side by side.
 */
export const Principal = z.object({
  userId: UserId,
  displayName: z.string().min(1),
  role: UserRole,
});
export type Principal = z.infer<typeof Principal>;

/* ------------------------------------------------------------------ *
 * Containers
 * ------------------------------------------------------------------ */

export const ContainerView = z.object({
  id: ContainerId,
  name: z.string(),
  type: ContainerType,
  ownerId: UserId.nullable(),
  /** World containers only. A player cannot see an unrevealed one at all. */
  revealed: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  /** Derived at read time, never stored — schema doc rule 9. */
  carriedWeight: z.number().nonnegative(),
  /** `null` means "no limit" (a wagon is not encumbered, a person is). */
  capacity: z.number().positive().nullable(),
});
export type ContainerView = z.infer<typeof ContainerView>;

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

export const ItemView = z.object({
  id: ItemId,
  containerId: ContainerId,
  name: z.string(),
  qty: z.number().int().positive(),
  /** Per unit. Dragonbane counts light items as 0.5 and tiny ones as 0. */
  weight: z.number().nonnegative(),
  /** Free text on purpose: "4 sp" and "150 gp" are both real answers, and a
   *  campaign-wide currency conversion is not MVP scope. */
  value: z.string(),
  tags: z.array(z.string()),
  notes: z.string(),
  /** Names of the object types this item carries. Composable — an item is
   *  routinely several at once. */
  types: z.array(z.string()),
  updatedAt: z.date(),
});
export type ItemView = z.infer<typeof ItemView>;

export const CommentView = z.object({
  id: z.string(),
  containerId: ContainerId,
  authorName: z.string(),
  authorRole: UserRole,
  content: z.string(),
  parentId: z.string().nullable(),
  createdAt: z.date(),
});
export type CommentView = z.infer<typeof CommentView>;

/* ------------------------------------------------------------------ *
 * Sorting — owned by the view, never by the data
 * ------------------------------------------------------------------ */

export const SORTABLE_COLUMNS = ["name", "qty", "weight", "value"] as const;
export const SortColumn = z.enum(SORTABLE_COLUMNS);
export type SortColumn = z.infer<typeof SortColumn>;

export const SortDirection = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof SortDirection>;

export const Sort = z.object({
  column: SortColumn,
  direction: SortDirection,
});
export type Sort = z.infer<typeof Sort>;

export const DEFAULT_SORT: Sort = { column: "name", direction: "asc" };

/* ------------------------------------------------------------------ *
 * Action inputs — the same schemas validate the form and the Server Action
 * ------------------------------------------------------------------ */

/**
 * The fields, WITHOUT defaults.
 *
 * Keeping this separate from `CreateItemInput` is not tidiness — it is a
 * data-loss fix. Defaults survive `.partial()`: a field declared
 * `.default("")` still produces `""` when the key is absent, even once it is
 * optional. Deriving the update schema from the create schema therefore turned
 * "I only changed the quantity" into "clear the notes and tags", because the
 * repository reads `undefined` as leave-alone and got `""` instead.
 */
const ItemFields = z.object({
  containerId: ContainerId,
  name: z.string().trim().min(1, "A name is required.").max(120),
  qty: z.coerce
    .number()
    .int("Quantity must be a whole number.")
    .positive("Quantity must be at least 1."),
  weight: z.coerce.number().nonnegative("Weight cannot be negative.").finite(),
  value: z.string().trim().max(40),
  tags: z.array(z.string().trim().min(1)),
  notes: z.string().max(2000),
  types: z.array(z.string().trim().min(1)),
});

/** Creating: the optional fields get their empty defaults. */
export const CreateItemInput = ItemFields.extend({
  value: ItemFields.shape.value.default(""),
  tags: ItemFields.shape.tags.default([]),
  notes: ItemFields.shape.notes.default(""),
  types: ItemFields.shape.types.default([]),
});
export type CreateItemInput = z.infer<typeof CreateItemInput>;

/**
 * Updating: a true patch. Every field optional, none defaulted, so `undefined`
 * reaches the repository and means "leave this column alone".
 * `containerId` is omitted deliberately — changing where an item lives is a
 * move, not an edit, and it goes through `MoveItemInput`.
 */
export const UpdateItemInput = ItemFields.omit({ containerId: true })
  .partial()
  .extend({ id: ItemId });
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;

/**
 * The headline operation. `qty` is how much of the stack moves — a partial move
 * splits it, which is the common case at a table, not an edge case.
 */
export const MoveItemInput = z.object({
  itemId: ItemId,
  toContainerId: ContainerId,
  qty: z.coerce.number().int().positive(),
});
export type MoveItemInput = z.infer<typeof MoveItemInput>;

/* ------------------------------------------------------------------ *
 * Derived values
 *
 * Computed from source rows at read time and never stored — schema doc rule 9
 * and SCOPE.md acceptance criterion 4. There is no `total_weight` column to
 * fall out of date.
 * ------------------------------------------------------------------ */

export function itemWeight(item: Pick<ItemView, "qty" | "weight">): number {
  return round1(item.qty * item.weight);
}

export function carriedWeight(items: readonly ItemView[]): number {
  return round1(items.reduce((sum, item) => sum + itemWeight(item), 0));
}

export type Encumbrance = "ok" | "at-limit" | "over";

/**
 * Over capacity is a WARNING, never a block. What being overloaded costs is the
 * GM's ruling, not the app's (SCOPE.md M10).
 */
export function encumbrance(
  carried: number,
  capacity: number | null,
): Encumbrance {
  if (capacity === null) return "ok";
  if (carried > capacity) return "over";
  if (carried >= capacity) return "at-limit";
  return "ok";
}

/** Bar fill, clamped so an overloaded pack shows a full bar rather than one
 *  that overflows its track. */
export function weightPercent(
  carried: number,
  capacity: number | null,
): number {
  if (capacity === null || capacity <= 0) return 0;
  return Math.min(100, Math.round((carried / capacity) * 100));
}

/** Weights are half-units at the smallest, so one decimal is exact, and
 *  floating-point drift across a 40-item sum never surfaces in the UI. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function sortItems(items: readonly ItemView[], sort: Sort): ItemView[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = a[sort.column];
    const right = b[sort.column];
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * factor;
    }
    return String(left).localeCompare(String(right)) * factor;
  });
}

/**
 * Search matches the name and the type names — the Capacities "aliases" idea,
 * so that "sword" finds "Longsword +1" (SCOPE.md M9).
 */
export function matchesQuery(item: ItemView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return (
    item.name.toLowerCase().includes(q) ||
    item.tags.some((t) => t.toLowerCase().includes(q)) ||
    item.types.some((t) => t.toLowerCase().includes(q))
  );
}
