import type { Protection } from "./character";
import type { ItemView } from "./view";

/**
 * The printed Dragonbane sheet's inventory rule, over Arca's items.
 *
 * A character carries as many items as half their STR, rounded up. Three
 * things on the sheet sit outside that count, each in its own box:
 *
 *   - weapons at hand (here: items typed `Weapon`),
 *   - the armour and helmet being worn (the items named in the sheet's
 *     Armour section),
 *   - tiny items (here: items tagged `tiny` — a ring, a letter, a key),
 *   - coins (currency items), which are summed into a purse instead.
 *
 * Everything else is one slot per row. A stack is one row because Arca stores
 * "20 arrows" as one thing, the way the sheet writes "Arrows" on one line.
 *
 * Over capacity is shown, never blocked: what it costs is the GM's call.
 */

export const TINY_TAG = "tiny";

/** Coins in hand, read from the currency items the character carries. */
export interface Purse {
  gold: number;
  silver: number;
  copper: number;
}

/** Currency: typed or tagged so, or named like the catalogue's
 *  "Currency, Gold Piece". */
function isCurrency(item: ItemView): boolean {
  return (
    item.types.some((t) => norm(t) === "currency") ||
    item.tags.some((t) => norm(t) === "currency") ||
    CURRENCY_NAME.test(item.name)
  );
}

const WORD = (words: string) => new RegExp(`(^|[^a-z])(${words})([^a-z]|$)`, "i");
const CURRENCY_NAME = WORD("currency|coin|coins");
const GOLD = WORD("gold|gp");
const SILVER = WORD("silver|sp");
const COPPER = WORD("copper|cp");

function coinKind(item: ItemView): keyof Purse | null {
  const name = item.name.toLowerCase();
  if (GOLD.test(name)) return "gold";
  if (SILVER.test(name)) return "silver";
  if (COPPER.test(name)) return "copper";
  return null;
}

/** Half STR, rounded up. */
export function inventorySlots(strength: number): number {
  return Math.ceil(strength / 2);
}

export interface InventoryBreakdown {
  weapons: ItemView[];
  worn: ItemView[];
  tiny: ItemView[];
  /** Currency items — no slot, summed into `purse`. */
  coins: ItemView[];
  purse: Purse;
  /** Everything that takes a slot. */
  carried: ItemView[];
  slots: number;
  used: number;
  over: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

export function inventoryBreakdown(
  items: readonly ItemView[],
  strength: number,
  protection: Protection,
): InventoryBreakdown {
  const wornNames = new Set(
    [protection.armour.name, protection.helmet.name].map(norm).filter((n) => n !== ""),
  );
  const out: Omit<InventoryBreakdown, "slots" | "used" | "over"> = {
    weapons: [],
    worn: [],
    tiny: [],
    coins: [],
    purse: { gold: 0, silver: 0, copper: 0 },
    carried: [],
  };
  for (const item of items) {
    if (item.types.some((t) => norm(t) === "weapon")) out.weapons.push(item);
    else if (isCurrency(item)) {
      out.coins.push(item);
      const kind = coinKind(item);
      if (kind) out.purse[kind] += item.qty;
    }
    else if (item.tags.some((t) => norm(t) === TINY_TAG)) out.tiny.push(item);
    // Only the first item of a worn name is "worn": a spare helmet of the same
    // make in the pack still takes a slot.
    else if (wornNames.delete(norm(item.name))) out.worn.push(item);
    else out.carried.push(item);
  }
  const slots = inventorySlots(strength);
  const used = out.carried.length;
  return { ...out, slots, used, over: used > slots };
}
