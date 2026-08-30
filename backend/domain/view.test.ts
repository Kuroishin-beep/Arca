import { describe, expect, it } from "vitest";

import {
  CreateCommentInput,
  CreateContainerInput,
  type ItemView,
  matchesTags,
  tagsOf,
} from "./view";

function item(name: string, tags: string[]): ItemView {
  return {
    id: name as ItemView["id"],
    containerId: "c1" as ItemView["containerId"],
    name,
    qty: 1,
    weight: 1,
    value: "",
    tags,
    notes: "",
    types: [],
    updatedAt: new Date(),
  };
}

describe("tag filtering (M9)", () => {
  const rope = item("Rope", ["gear", "bulky"]);
  const potion = item("Potion", ["consumable"]);
  const oil = item("Oil", ["consumable", "bulky"]);

  it("matches everything when nothing is selected", () => {
    expect(matchesTags(rope, [])).toBe(true);
    expect(matchesTags(potion, [])).toBe(true);
  });

  /**
   * The behaviour worth pinning down: chips narrow, they do not widen. Two
   * selected tags mean "both", so pressing a second chip can only ever shrink
   * the list — an OR here would grow it and read as the filter being broken.
   */
  it("ANDs selected tags rather than ORing them", () => {
    expect(matchesTags(oil, ["consumable", "bulky"])).toBe(true);
    expect(matchesTags(potion, ["consumable", "bulky"])).toBe(false);
    expect(matchesTags(rope, ["consumable", "bulky"])).toBe(false);
  });

  it("is case-insensitive, because tags are typed by hand", () => {
    expect(matchesTags(rope, ["GEAR"])).toBe(true);
    expect(matchesTags(item("X", ["Gear"]), ["gear"])).toBe(true);
  });

  it("collects a sorted, de-duplicated tag set for the chip row", () => {
    expect(tagsOf([rope, potion, oil])).toEqual([
      "bulky",
      "consumable",
      "gear",
    ]);
  });

  it("offers no chips for items that carry no tags", () => {
    expect(tagsOf([item("Plain", [])])).toEqual([]);
  });
});

describe("CreateContainerInput ownership invariant", () => {
  const base = { name: "The Barrow Chest", capacity: null, revealed: false };

  it("requires an owner for a character container", () => {
    const parsed = CreateContainerInput.safeParse({
      ...base,
      type: "character",
      ownerId: null,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["ownerId"]);
  });

  it("forbids an owner on a party or world container", () => {
    for (const type of ["party", "world"] as const) {
      const parsed = CreateContainerInput.safeParse({
        ...base,
        type,
        ownerId: "00000000-0000-4000-8000-000000000102",
      });
      expect(parsed.success, `${type} should reject an owner`).toBe(false);
    }
  });

  it("accepts the two valid shapes", () => {
    expect(
      CreateContainerInput.safeParse({
        ...base,
        type: "character",
        ownerId: "00000000-0000-4000-8000-000000000102",
      }).success,
    ).toBe(true);
    expect(
      CreateContainerInput.safeParse({ ...base, type: "world", ownerId: null })
        .success,
    ).toBe(true);
  });

  /** World containers start hidden — the GM reveals a chest when it is found. */
  it("defaults revealed to false", () => {
    const parsed = CreateContainerInput.parse({
      name: "Sealed door",
      type: "world",
    });
    expect(parsed.revealed).toBe(false);
    expect(parsed.capacity).toBeNull();
    expect(parsed.ownerId).toBeNull();
  });
});

describe("CreateCommentInput (M12)", () => {
  it("defaults parentId to null, making a bare post top-level", () => {
    const parsed = CreateCommentInput.parse({
      containerId: "11111111-1111-4111-8111-111111111111",
      content: "Found a rune on the lid.",
    });
    expect(parsed.parentId).toBeNull();
  });

  it("rejects whitespace-only content", () => {
    const parsed = CreateCommentInput.safeParse({
      containerId: "11111111-1111-4111-8111-111111111111",
      content: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("trims content so a stray newline is not stored as a comment", () => {
    const parsed = CreateCommentInput.parse({
      containerId: "11111111-1111-4111-8111-111111111111",
      content: "  careful  ",
    });
    expect(parsed.content).toBe("careful");
  });
});
