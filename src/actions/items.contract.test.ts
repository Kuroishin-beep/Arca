import { beforeEach, describe, expect, it } from "vitest";

import { fixtureRepository, resetFixtureStore } from "@/db/fixture-repository";
import { KOVA_ID, SEED_CONTAINERS } from "@/db/seed-data";
import {
  CreateItemInput,
  MoveItemInput,
  UpdateItemInput,
  type Principal,
} from "@/domain/view";
import { PermissionError } from "@/lib/permissions";

/**
 * The action CONTRACT: FormData in, zod parse, repository call.
 *
 * `src/actions/items.ts` itself imports `next/cache` and `next/headers`, which
 * need a request context that does not exist under Vitest. So this exercises
 * the two halves that actually carry risk — the FormData→zod boundary and the
 * repository call — with the real schemas and the real repository.
 *
 * This is the layer where the seed-uuid bug lived: reads all worked, and the
 * failure only appeared once `z.string().uuid()` ran on a mutation.
 */

const kova: Principal = {
  userId: KOVA_ID as Principal["userId"],
  displayName: "Kova",
  role: "player",
};

const id = (name: string) => SEED_CONTAINERS.find((c) => c.name === name)!.id;
const WAGON = id("Party Wagon");
const KOVAS_PACK = id("Kova's Pack");
const BARROW = id("Barrow Chest");

/** Mirrors the parsing in createItemAction, including the comma-split lists. */
const splitList = (raw: FormDataEntryValue | null): string[] =>
  String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

beforeEach(() => resetFixtureStore());

describe("create", () => {
  it("accepts what the editor form actually submits", async () => {
    const form = new FormData();
    form.set("containerId", WAGON);
    form.set("name", "Grappling hook");
    form.set("qty", "2");
    form.set("weight", "1.5");
    form.set("value", "3 gp");
    form.set("tags", "gear, climbing");
    form.set("notes", "Bent tine.");
    form.set("types", "Physical Object, Gear");

    const parsed = CreateItemInput.safeParse({
      containerId: form.get("containerId"),
      name: form.get("name"),
      qty: form.get("qty"),
      weight: form.get("weight"),
      value: form.get("value") ?? "",
      tags: splitList(form.get("tags")),
      notes: form.get("notes") ?? "",
      types: splitList(form.get("types")),
    });
    expect(parsed.success, parsed.error?.message).toBe(true);
    if (!parsed.success) return;

    // Strings from the form are coerced to real numbers, not left as text.
    expect(parsed.data.qty).toBe(2);
    expect(parsed.data.weight).toBe(1.5);
    expect(parsed.data.tags).toEqual(["gear", "climbing"]);

    const created = await fixtureRepository.createItem(kova, parsed.data);
    expect(created.name).toBe("Grappling hook");

    const items = await fixtureRepository.listItems(kova, WAGON);
    expect(items.map((i) => i.name)).toContain("Grappling hook");
  });

  it("rejects an empty name with a message aimed at the field", () => {
    const parsed = CreateItemInput.safeParse({
      containerId: WAGON,
      name: "   ",
      qty: "1",
      weight: "0",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.path[0]).toBe("name");
  });

  it("rejects a zero quantity — removing the last one is an archive", () => {
    const parsed = CreateItemInput.safeParse({
      containerId: WAGON,
      name: "Rope",
      qty: "0",
      weight: "1",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toMatch(/at least 1/i);
  });

  it("rejects a negative weight", () => {
    const parsed = CreateItemInput.safeParse({
      containerId: WAGON,
      name: "Rope",
      qty: "1",
      weight: "-2",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("move — the form the dialog submits", () => {
  it("parses and performs a whole-stack move", async () => {
    const items = await fixtureRepository.listItems(kova, WAGON);
    const lantern = items.find((i) => i.name === "Lantern, hooded")!;

    const form = new FormData();
    form.set("itemId", lantern.id);
    form.set("toContainerId", KOVAS_PACK);
    form.set("qty", "1");

    const parsed = MoveItemInput.safeParse({
      itemId: form.get("itemId"),
      toContainerId: form.get("toContainerId"),
      qty: form.get("qty"),
    });
    // The exact assertion that the 37-character seed ids used to fail.
    expect(parsed.success, parsed.error?.message).toBe(true);
    if (!parsed.success) return;

    const outcome = await fixtureRepository.moveItem(kova, parsed.data);
    expect(outcome.movedQty).toBe(1);
    expect(outcome.split).toBe(false);
    expect(outcome.itemName).toBe("Lantern, hooded");
  });

  it("parses and performs a partial move, splitting the stack", async () => {
    const items = await fixtureRepository.listItems(kova, WAGON);
    const potions = items.find((i) => i.name === "Healing Potion")!;

    const parsed = MoveItemInput.safeParse({
      itemId: potions.id,
      toContainerId: KOVAS_PACK,
      qty: "2",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const outcome = await fixtureRepository.moveItem(kova, parsed.data);
    expect(outcome.split).toBe(true);
    expect(outcome.movedQty).toBe(2);
  });

  it("refuses a destination the dialog renders as disabled", async () => {
    const items = await fixtureRepository.listItems(kova, WAGON);
    const parsed = MoveItemInput.parse({
      itemId: items[0]!.id,
      toContainerId: BARROW,
      qty: "1",
    });
    // The dialog disables this row; the server refuses it regardless, which is
    // the half that actually matters.
    await expect(
      fixtureRepository.moveItem(kova, parsed),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects a malformed item id rather than passing it through", () => {
    const parsed = MoveItemInput.safeParse({
      itemId: "00000000-0000-4000-8000-0000000003001", // 13 hex, not 12
      toContainerId: KOVAS_PACK,
      qty: "1",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("update", () => {
  it("treats omitted fields as 'leave alone' rather than 'clear'", async () => {
    const items = await fixtureRepository.listItems(kova, WAGON);
    const rope = items.find((i) => i.name.startsWith("Rope"))!;

    const parsed = UpdateItemInput.safeParse({ id: rope.id, qty: "7" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const updated = await fixtureRepository.updateItem(kova, parsed.data);
    expect(updated.qty).toBe(7);
    expect(updated.name).toBe(rope.name);
    expect(updated.notes).toBe(rope.notes);
  });
});
