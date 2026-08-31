/**
 * Databases — every object of one type, across every container you may open.
 *
 * Wireframe.png puts two sections in the sidebar: **Containers** and
 * **Databases**. A container is a place; a database is a kind. "Kova's Pack" is
 * a container, "Weapon" is a database, and the same longsword appears in both —
 * which is the object graph's whole point (Schema.png: *an object doesn't need
 * to know what container it is being viewed through*).
 *
 * This is a projection, not a table. `object_types` and `object_type_memberships`
 * already exist and already carry every membership; nothing here stores
 * anything. That is why a database is addressed by a slug of its type NAME
 * rather than by a type id — the name is what `ItemView.types` carries, so this
 * module works identically against the fixture store and against Postgres, with
 * no third query path to keep in step.
 *
 * ## Why this is not a repository method
 *
 * It composes `listContainers` and `listItems` and derives nothing they do not
 * already expose. Adding it to `ArcaRepository` would mean two copies of a
 * permission-sensitive filter — one per implementation — that have to stay
 * identical forever. One copy, over the authorised methods, cannot drift.
 *
 * ## The security property
 *
 * A database view is the first thing in Arca that crosses container boundaries,
 * so it is the first place a read-permission bug would leak loot: an
 * unrevealed world container's contents must never appear in one. Two things
 * stop that, and the second exists because the first is someone else's
 * invariant: `listContainers` returns only containers the principal may read,
 * AND every container is re-checked here with `canRead` before its items are
 * fetched. See `database.test.ts`.
 */
import type { ArcaRepository } from "@backend/db/repository";
import { canRead } from "@backend/lib/permissions";
import type { ContainerView, ItemView, Principal } from "@backend/domain/view";

/** One row in the sidebar's Databases section. */
export interface DatabaseSummary {
  /** The type name as the campaign spells it — "Weapon", "Potion". */
  name: string;
  /** URL-safe form, and the `[slug]` segment of `/db/[slug]`. */
  slug: string;
  /** How many objects the PRINCIPAL can see in it. Two people at one table
   *  legitimately see different numbers here, and showing a total that
   *  includes rows they cannot open would be a count that leaks. */
  itemCount: number;
}

/** One row in a database table: the object, plus where it happens to be. */
export interface DatabaseRow {
  item: ItemView;
  container: ContainerView;
}

/**
 * Lowercased, non-alphanumerics collapsed to a single dash, ends trimmed.
 *
 * Not reversible, and it does not need to be: `readDatabase` slugifies every
 * candidate name and compares, rather than trying to turn a slug back into a
 * name. That keeps "Magic Item" and "magic-item" the same database and costs
 * one pass over a list that is already in memory.
 */
export function slugifyType(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Every container this principal may read, with its items. The one place that
 *  walks the whole readable graph, so the `canRead` re-check lives here. */
async function readableContents(
  repo: ArcaRepository,
  principal: Principal,
): Promise<DatabaseRow[]> {
  const containers = (await repo.listContainers(principal)).filter((c) =>
    canRead(principal, c),
  );

  // Sequential rather than `Promise.all`: the fixture store is synchronous
  // anyway, and against Postgres a table of six people with a handful of
  // containers is not worth opening a connection per container for.
  const rows: DatabaseRow[] = [];
  for (const container of containers) {
    for (const item of await repo.listItems(principal, container.id)) {
      rows.push({ item, container });
    }
  }
  return rows;
}

/**
 * The Databases section of the sidebar.
 *
 * Built from the types actually present on visible objects, so a database never
 * offers itself as a destination that can only ever be empty. The consequence,
 * stated because it is a real limitation and not an oversight: a type with no
 * objects in it does not appear. Arca has no type manager yet — types are
 * created by naming them on an item — so an empty type is currently
 * unreachable by any route, not just this one.
 */
export async function listDatabases(
  repo: ArcaRepository,
  principal: Principal,
): Promise<DatabaseSummary[]> {
  const counts = new Map<string, number>();
  for (const { item } of await readableContents(repo, principal)) {
    // An object is routinely several types at once — that is composition, not
    // a bug — so it counts once in each of its databases.
    for (const type of item.types) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, itemCount]) => ({ name, slug: slugifyType(name), itemCount }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One database, as a table.
 *
 * `null` when the slug names no type this principal can see. That deliberately
 * conflates "no such type" with "a type only the GM's containers hold", for the
 * same reason the workspace answers 403 and 404 identically (SCOPE.md §12.3):
 * a distinguishable 404 turns the URL bar into a way to ask whether the GM has
 * any Relics.
 */
export async function readDatabase(
  repo: ArcaRepository,
  principal: Principal,
  slug: string,
): Promise<{ name: string; rows: DatabaseRow[] } | null> {
  const wanted = slugifyType(slug);
  if (wanted === "") return null;

  const contents = await readableContents(repo, principal);

  // The display name comes from the data rather than from the URL, so the
  // heading reads "Weapon" and never the slug someone typed.
  let name: string | null = null;
  const rows: DatabaseRow[] = [];

  for (const row of contents) {
    const match = row.item.types.find((t) => slugifyType(t) === wanted);
    if (!match) continue;
    name ??= match;
    rows.push(row);
  }

  if (name === null) return null;

  // Grouped by container, then by name inside it — a database is read as "what
  // do we have, and where is it", and an alphabetical list of forty items
  // across five packs answers only the first half.
  rows.sort(
    (a, b) =>
      a.container.name.localeCompare(b.container.name) ||
      a.item.name.localeCompare(b.item.name),
  );

  return { name, rows };
}
