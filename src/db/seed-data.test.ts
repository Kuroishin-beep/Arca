import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_ID,
  SEED_COMMENTS,
  SEED_CONTAINERS,
  SEED_ITEMS,
  SEED_USERS,
} from "@/db/seed-data";
import { CreateItemInput, MoveItemInput } from "@/domain/view";

/**
 * Guards on the seed itself.
 *
 * These exist because of a real bug: the item-id helper produced a 37-character
 * string that LOOKED like a uuid. Nothing complained at startup — the ids were
 * only cast, never parsed — and every read worked fine. It failed at the first
 * MUTATION, where `z.string().uuid()` finally ran, so every move in the app was
 * silently rejected as "pick a destination".
 *
 * The lesson generalises: an id that is only ever cast is an id that is never
 * checked. So the seed is validated against the same schemas the actions use.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("seed identifiers", () => {
  it("uses a valid uuid for the campaign", () => {
    expect(CAMPAIGN_ID).toMatch(UUID);
  });

  it.each([
    ["users", SEED_USERS],
    ["containers", SEED_CONTAINERS],
    ["items", SEED_ITEMS],
    ["comments", SEED_COMMENTS],
  ])("uses valid uuids for every %s row", (_label, rows) => {
    for (const row of rows as { id: string }[]) {
      expect(row.id, `${row.id} is not a valid uuid`).toMatch(UUID);
    }
  });

  it("has no duplicate ids across the whole seed", () => {
    const ids = [
      ...SEED_USERS.map((r) => r.id),
      ...SEED_CONTAINERS.map((r) => r.id),
      ...SEED_ITEMS.map((r) => r.id),
      ...SEED_COMMENTS.map((r) => r.id),
      CAMPAIGN_ID,
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("seed rows satisfy the schemas the actions use", () => {
  it("accepts every seeded item as a CreateItemInput", () => {
    for (const item of SEED_ITEMS) {
      const parsed = CreateItemInput.safeParse(item);
      expect(parsed.success, `${item.name}: ${parsed.error?.message}`).toBe(
        true,
      );
    }
  });

  // The exact check that would have caught the original bug.
  it("accepts every seeded item as the subject of a move", () => {
    const destination = SEED_CONTAINERS[0]!.id;
    for (const item of SEED_ITEMS) {
      const parsed = MoveItemInput.safeParse({
        itemId: item.id,
        toContainerId: destination,
        qty: item.qty,
      });
      expect(parsed.success, `${item.name} cannot be moved`).toBe(true);
    }
  });
});

describe("seed integrity", () => {
  it("points every item at a container that exists", () => {
    const ids = new Set(SEED_CONTAINERS.map((c) => c.id));
    for (const item of SEED_ITEMS) {
      expect(ids.has(item.containerId), `${item.name} is orphaned`).toBe(true);
    }
  });

  it("gives every character container an owner and no others one", () => {
    for (const container of SEED_CONTAINERS) {
      if (container.type === "character") {
        expect(container.ownerId, `${container.name} has no owner`).not.toBeNull();
      } else {
        expect(container.ownerId, `${container.name} should not be owned`).toBeNull();
      }
    }
  });
});
