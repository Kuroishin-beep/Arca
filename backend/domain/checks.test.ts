import { describe, expect, it } from "vitest";

import { emptySheet } from "./character";
import { armourDefaultsFor, banesFor, diceFor, resolveCheck, rollD20s } from "./checks";

describe("resolveCheck", () => {
  it("succeeds at or under the target", () => {
    expect(resolveCheck(12, [12]).success).toBe(true);
    expect(resolveCheck(12, [13]).success).toBe(false);
  });

  it("keeps the worst die when there are banes", () => {
    const result = resolveCheck(12, [3, 15]);
    expect(result.kept).toBe(15);
    expect(result.success).toBe(false);
  });

  it("keeps the best die with a boon", () => {
    const result = resolveCheck(12, [3, 15], "boon");
    expect(result).toMatchObject({ kept: 3, success: true, edge: "boon" });
  });

  it("throws one die plainly, two for a boon, one per bane plus one", () => {
    expect(diceFor("normal", 2)).toBe(1);
    expect(diceFor("boon", 0)).toBe(2);
    expect(diceFor("bane", 0)).toBe(2);
    expect(diceFor("bane", 2)).toBe(3);
  });

  it("calls a 1 a Dragon and a 20 a Demon, whatever the target", () => {
    expect(resolveCheck(1, [1])).toMatchObject({ dragon: true, success: true });
    expect(resolveCheck(18, [20])).toMatchObject({ demon: true, success: false });
  });
});

describe("banesFor", () => {
  it("adds one bane per reason: condition, armour, helmet", () => {
    const sheet = emptySheet();
    sheet.conditions.dazed = true;
    sheet.protection.armour = { name: "Chainmail", rating: 4, banes: "Evade, Sneaking" };
    sheet.protection.helmet = { name: "Great helm", rating: 2, banes: "Sneaking" };
    expect(banesFor(sheet, "AGL", "Sneaking")).toEqual(["Dazed", "Chainmail", "Great helm"]);
    expect(banesFor(sheet, "AGL", "Evade")).toEqual(["Dazed", "Chainmail"]);
    expect(banesFor(sheet, "INT", "Awareness")).toEqual([]);
  });

  it("matches whole skill names, not fragments", () => {
    const sheet = emptySheet();
    sheet.protection.armour = { name: "Odd", rating: 1, banes: "Sneaking and Evade" };
    expect(banesFor(sheet, "AGL", "Evade")).toEqual(["Odd"]);
    expect(banesFor(sheet, "AGL", "Sneak")).toEqual([]);
  });
});

describe("armourDefaultsFor", () => {
  it("knows the core rules' armour and helmets", () => {
    expect(armourDefaultsFor("Studded Leather Armor", "armour")).toEqual({ rating: 2, banes: "Sneaking" });
    expect(armourDefaultsFor("Leather armour", "armour")).toEqual({ rating: 1, banes: "" });
    expect(armourDefaultsFor("Plate armour", "armour")?.rating).toBe(6);
    expect(armourDefaultsFor("Great Helm", "helmet")?.rating).toBe(2);
    expect(armourDefaultsFor("Open helmet", "helmet")?.rating).toBe(1);
  });

  it("fills nothing in for an unknown item", () => {
    expect(armourDefaultsFor("Wizard's robe", "armour")).toBeNull();
  });
});

describe("rollD20s", () => {
  it("rolls the asked number of d20s", () => {
    const dice = rollD20s(50);
    expect(dice).toHaveLength(50);
    expect(dice.every((d) => d >= 1 && d <= 20)).toBe(true);
  });
});
