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
 *   - tiny items (here: items tagged `tiny` — a ring, a letter, a key).
 *
 * Everything else is one slot per row. A stack is one row because Arca stores
 * "20 arrows" as one thing, the way the sheet writes "Arrows" on one line.
 *
 * Over capacity is shown, never blocked: what it costs is the GM's call.
 */

export const TINY_TAG = "tiny";

/** Half STR, rounded up. */
export function inventorySlots(strength: number): number {
  return Math.ceil(strength / 2);
}

export interface InventoryBreakdown {
  weapons: ItemView[];
  worn: ItemView[];
  tiny: ItemView[];
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
    carried: [],
  };
  for (const item of items) {
    if (item.types.some((t) => norm(t) === "weapon")) out.weapons.push(item);
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
