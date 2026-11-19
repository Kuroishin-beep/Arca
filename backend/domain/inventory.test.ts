import { describe, expect, it } from "vitest";

import { emptySheet } from "./character";
import { inventoryBreakdown, inventorySlots } from "./inventory";
import type { ItemView } from "./view";

const item = (name: string, fields: Partial<ItemView> = {}): ItemView =>
  ({
    id: name,
    containerId: "c1",
    name,
    qty: 1,
    weight: 1,
    value: "",
    tags: [],
    notes: "",
    types: [],
    stats: {},
    catalogItemId: null,
    updatedAt: new Date(0),
    ...fields,
  }) as ItemView;

describe("inventorySlots", () => {
  it("is half STR, rounded up", () => {
    expect(inventorySlots(10)).toBe(5);
    expect(inventorySlots(11)).toBe(6);
    expect(inventorySlots(3)).toBe(2);
    expect(inventorySlots(18)).toBe(9);
  });
});

describe("inventoryBreakdown", () => {
  const protection = {
    ...emptySheet().protection,
    armour: { name: "Leather armour", rating: 1, banes: "" },
  };

  it("keeps weapons, worn armour and tiny items out of the slot count", () => {
    const result = inventoryBreakdown(
      [
        item("Longbow", { types: ["Weapon"] }),
        item("leather armour"),
        item("Silver ring", { tags: ["Tiny"] }),
        item("Bedroll"),
        item("Arrows", { qty: 20 }),
      ],
      4,
      protection,
    );
    expect(result.weapons.map((i) => i.name)).toEqual(["Longbow"]);
    expect(result.worn.map((i) => i.name)).toEqual(["leather armour"]);
    expect(result.tiny.map((i) => i.name)).toEqual(["Silver ring"]);
    expect(result.carried.map((i) => i.name)).toEqual(["Bedroll", "Arrows"]);
    expect(result).toMatchObject({ slots: 2, used: 2, over: false });
  });

  it("counts a second item of the worn name as carried, and flags over capacity", () => {
    const result = inventoryBreakdown(
      [item("Leather armour"), item("Leather armour"), item("Rope"), item("Torch")],
      3,
      protection,
    );
    expect(result.worn).toHaveLength(1);
    expect(result).toMatchObject({ used: 3, slots: 2, over: true });
  });
});

describe("coins", () => {
  it("sums currency items into a purse, and takes no slots", () => {
    const result = inventoryBreakdown(
      [
        item("Currency, Gold Piece", { qty: 2 }),
        item("Currency, Silver Piece", { qty: 5 }),
        item("Currency, Copper Piece", { qty: 20 }),
        item("Copper coins", { qty: 3 }),
        item("Rope"),
      ],
      10,
      emptySheet().protection,
    );
    expect(result.purse).toEqual({ gold: 2, silver: 5, copper: 23 });
    expect(result.coins).toHaveLength(4);
    expect(result.used).toBe(1);
  });
});
