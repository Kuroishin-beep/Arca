import { describe, expect, it } from "vitest";

import {
  fieldsForTypes,
  normaliseStats,
  sameStats,
  sharedFields,
  statsFromForm,
} from "./item-fields";

const keys = (fields: { key: string }[]) => fields.map((f) => f.key);

describe("fieldsForTypes", () => {
  it("gives a weapon the Weapons database's columns, in order", () => {
    expect(keys(fieldsForTypes(["Physical Object", "Weapon"]))).toEqual([
      "grip",
      "str",
      "damage",
      "durability",
      "features",
    ]);
  });

  it("is case-insensitive and unions several types", () => {
    expect(keys(fieldsForTypes(["weapon", "GEAR"]))).toEqual([
      "grip",
      "str",
      "damage",
      "durability",
      "features",
      "effect",
    ]);
  });

  it("gives an untyped or plain item nothing extra", () => {
    expect(fieldsForTypes([])).toEqual([]);
    expect(fieldsForTypes(["Physical Object", "Treasure"])).toEqual([]);
  });
});

describe("sharedFields — the diagram's container rule", () => {
  const dagger = { types: ["Physical Object", "Weapon"] };
  const axe = { types: ["Physical Object", "Weapon", "Equipment"] };
  const fur = { types: ["Physical Object", "Gear"] };
  const torch = { types: ["Physical Object", "Gear", "Consumable"] };

  it("At Hand, holding only weapons, shows the weapon columns", () => {
    expect(keys(sharedFields([dagger, axe]))).toEqual([
      "grip",
      "str",
      "damage",
      "durability",
      "features",
    ]);
  });

  it("a backpack with a dagger and a sleeping fur shows only what they share", () => {
    expect(sharedFields([dagger, fur])).toEqual([]);
  });

  it("items that all have an Effect share it", () => {
    expect(keys(sharedFields([fur, torch]))).toEqual(["effect"]);
  });

  it("an empty container shows the common columns only", () => {
    expect(sharedFields([])).toEqual([]);
  });
});

describe("normaliseStats", () => {
  it("keeps only the fields the types have, trimmed, empties dropped", () => {
    expect(
      normaliseStats(["Weapon"], { damage: " 1D6 ", grip: "", effect: "x", junk: "y" }),
    ).toEqual({ damage: "1D6" });
  });

  it("treats anything that is not an object as no stats", () => {
    expect(normaliseStats(["Weapon"], null)).toEqual({});
    expect(normaliseStats(["Weapon"], "1D6")).toEqual({});
    expect(normaliseStats(["Weapon"], ["1D6"])).toEqual({});
  });
});

describe("statsFromForm", () => {
  it("collects stat: fields and nothing else", () => {
    const form = new FormData();
    form.set("name", "Dagger");
    form.set("stat:damage", "1D6");
    form.set("stat:grip", "1H");
    expect(statsFromForm(form)).toEqual({ damage: "1D6", grip: "1H" });
  });

  it("is undefined when the form showed no stat fields, so an edit leaves them alone", () => {
    const form = new FormData();
    form.set("name", "Rope");
    expect(statsFromForm(form)).toBeUndefined();
  });
});

describe("sameStats", () => {
  it("ignores key order and treats a missing key as empty", () => {
    expect(sameStats({ a: "1", b: "" }, { a: "1" })).toBe(true);
    expect(sameStats({ a: "1" }, { a: "2" })).toBe(false);
  });
});
