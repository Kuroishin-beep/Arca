/**
 * The fields a TYPE adds to an item — the columns of its database.
 *
 * Every item has the common columns (name, cost, weight, and its own quantity
 * and notes). A type adds more: the Weapons database has Grip, STR, Damage,
 * Durability and Features; the Items database has Effect. That is the reference
 * diagram's whole shape — each database is a table with its own columns, and a
 * container showing items from several of them "adapts to show only matching
 * columns" (`sharedFields`).
 *
 * Declared here, in code, rather than read from `property_definitions` /
 * `type_properties`. Those tables exist and could carry this one day, but a
 * GM-editable schema is a feature of its own (a type manager, migrations of
 * existing values), and nothing in the diagram asks for it. What it does ask
 * for — typed columns that follow the item wherever it is referenced — works
 * the same from a constant, and works identically against the fixture store
 * and Postgres.
 *
 * Values are stored as short strings. "1D6", "—", "2H" and "Subtle, Piercing"
 * are all real answers, and the only arithmetic Arca does with an item is on
 * its weight, which is not one of these.
 */
import { z } from "zod";

export interface ItemField {
  /** Storage key inside `stats`. Never shown. */
  key: string;
  /** Column header and form label. */
  label: string;
  /** Header when the column is narrow — "Dura" for Durability. */
  short: string;
  placeholder: string;
  /** Right-aligned and monospaced, like weight. */
  numeric?: boolean;
}

const GRIP: ItemField = { key: "grip", label: "Grip", short: "Grip", placeholder: "1H" };
const STR: ItemField = { key: "str", label: "STR", short: "STR", placeholder: "—", numeric: true };
const DAMAGE: ItemField = { key: "damage", label: "Damage", short: "Dmg", placeholder: "1D6", numeric: true };
const DURABILITY: ItemField = { key: "durability", label: "Durability", short: "Dura", placeholder: "9", numeric: true };
const FEATURES: ItemField = { key: "features", label: "Features", short: "Features", placeholder: "Subtle" };
const EFFECT: ItemField = { key: "effect", label: "Effect", short: "Effect", placeholder: "What it does at the table" };

/**
 * Every field, in the one order columns are ever drawn in. A container holding
 * weapons shows Grip before Damage whichever weapon happens to be first, so
 * two containers of weapons read the same.
 */
export const ALL_FIELDS: readonly ItemField[] = [GRIP, STR, DAMAGE, DURABILITY, FEATURES, EFFECT];

/** Type name (lower-cased) → the fields it contributes. A type absent here
 *  (Treasure, Equipment, Physical Object) adds nothing beyond the common
 *  columns. */
const TYPE_FIELDS: ReadonlyMap<string, readonly ItemField[]> = new Map([
  ["weapon", [GRIP, STR, DAMAGE, DURABILITY, FEATURES]],
  ["gear", [EFFECT]],
  ["consumable", [EFFECT]],
]);

export const StatValue = z.string().trim().max(80);
/** An item's type-specific values, keyed by `ItemField.key`. */
export const Stats = z.record(z.string(), StatValue);
export type Stats = z.infer<typeof Stats>;

/** The fields an item with these types has — the union over its types, in
 *  `ALL_FIELDS` order. An object is routinely several types at once. */
export function fieldsForTypes(types: readonly string[]): ItemField[] {
  const keys = new Set<string>();
  for (const type of types) {
    for (const field of TYPE_FIELDS.get(type.trim().toLowerCase()) ?? []) {
      keys.add(field.key);
    }
  }
  return ALL_FIELDS.filter((field) => keys.has(field.key));
}

/**
 * The columns a container shows: only the fields EVERY item in it has.
 *
 * The diagram's rule, stated on its own sticky note: the backpack holds a
 * dagger (a weapon) and a sleeping fur (an item), so it shows the columns the
 * two share and nothing else; "At Hand", holding only weapons, shows the
 * weapon columns. An empty container, or one with a single untyped item,
 * shows the common columns only.
 */
export function sharedFields(items: readonly { types: readonly string[] }[]): ItemField[] {
  if (items.length === 0) return [];
  const [first, ...rest] = items.map((item) => fieldsForTypes(item.types));
  return (first ?? []).filter((field) =>
    rest.every((fields) => fields.some((f) => f.key === field.key)),
  );
}

/**
 * Keep only the values these types have a field for, trimmed, empties dropped.
 *
 * Applied on write AND on read. On write so a stray key never lands in
 * storage; on read so taking "Weapon" off an item hides its Grip at once,
 * rather than leaving a column of stale weapon stats on something that is now
 * a lantern. (The stored value survives, so putting the type back restores it.)
 */
export function normaliseStats(types: readonly string[], raw: unknown): Stats {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: Stats = {};
  for (const field of fieldsForTypes(types)) {
    const value = source[field.key];
    if (typeof value === "string" && value.trim() !== "") {
      out[field.key] = value.trim().slice(0, 80);
    }
  }
  return out;
}

/** Form fields are named `stat:<key>`; this collects them. `undefined` when
 *  the form carried none, so an edit that never showed a stats field leaves
 *  the stored ones alone — a patch, like every other field. */
export function statsFromForm(form: FormData): Stats | undefined {
  let found = false;
  const out: Stats = {};
  for (const [name, value] of form.entries()) {
    if (!name.startsWith("stat:") || typeof value !== "string") continue;
    found = true;
    out[name.slice("stat:".length)] = value;
  }
  return found ? out : undefined;
}

/** Equal as stored: same keys with the same non-empty values. */
export function sameStats(a: Stats, b: Stats): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? "").trim() !== (b[key] ?? "").trim()) return false;
  }
  return true;
}
