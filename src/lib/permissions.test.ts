import { beforeEach, describe, expect, it } from "vitest";

import { fixtureRepository, resetFixtureStore } from "@/db/fixture-repository";
import { GM_ID, KOVA_ID, MILO_ID, SEED_CONTAINERS } from "@/db/seed-data";
import type { Principal } from "@/domain/view";
import { PermissionError } from "@/lib/permissions";

/**
 * The tests that matter most in this repository.
 *
 * SCOPE.md acceptance criterion 3 says a player must not be able to reach
 * another player's container by id, and criterion 4 says derived values must be
 * correct and never read from a stored column. Both are asserted here against
 * the same repository interface the real Postgres implementation satisfies.
 */

const gm: Principal = {
  userId: GM_ID as Principal["userId"],
  displayName: "Ravna",
  role: "gm",
};
const kova: Principal = {
  userId: KOVA_ID as Principal["userId"],
  displayName: "Kova",
  role: "player",
};
const milo: Principal = {
  userId: MILO_ID as Principal["userId"],
  displayName: "Milo",
  role: "player",
};

const id = (name: string) =>
  SEED_CONTAINERS.find((c) => c.name === name)!.id;

const KOVAS_PACK = id("Kova's Pack");
const MILOS_PACK = id("Milo's Pack");
const PARTY_WAGON = id("Party Wagon");
const BARROW_CHEST = id("Barrow Chest");
const SUNKEN_VAULT = id("The Sunken Vault");

beforeEach(() => resetFixtureStore());

describe("reads", () => {
  it("lets the GM see every container", async () => {
    const containers = await fixtureRepository.listContainers(gm);
    expect(containers.map((c) => c.id)).toEqual(
      expect.arrayContaining([KOVAS_PACK, MILOS_PACK, SUNKEN_VAULT]),
    );
  });

  it("hides another player's pack from a player", async () => {
    const containers = await fixtureRepository.listContainers(kova);
    expect(containers.map((c) => c.id)).toContain(KOVAS_PACK);
    expect(containers.map((c) => c.id)).not.toContain(MILOS_PACK);
  });

  it("hides an unrevealed world container from a player", async () => {
    const containers = await fixtureRepository.listContainers(kova);
    expect(containers.map((c) => c.id)).not.toContain(SUNKEN_VAULT);
  });

  // Acceptance criterion 3: guessing the id must not work either.
  it("refuses a player who reaches for another pack by id", async () => {
    await expect(
      fixtureRepository.getContainer(kova, MILOS_PACK),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      fixtureRepository.listItems(kova, MILOS_PACK),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses a player who reaches for the sealed vault by id", async () => {
    await expect(
      fixtureRepository.listItems(kova, SUNKEN_VAULT),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("lets every player read the shared wagon", async () => {
    const items = await fixtureRepository.listItems(kova, PARTY_WAGON);
    expect(items.length).toBeGreaterThan(0);
  });
});

describe("writes", () => {
  it("refuses a player writing to a world container even when revealed", async () => {
    const items = await fixtureRepository.listItems(kova, BARROW_CHEST);
    await expect(
      fixtureRepository.updateItem(kova, { id: items[0]!.id, qty: 99 }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("lets the GM write to a world container", async () => {
    const items = await fixtureRepository.listItems(gm, BARROW_CHEST);
    const updated = await fixtureRepository.updateItem(gm, {
      id: items[0]!.id,
      qty: 3,
    });
    expect(updated.qty).toBe(3);
  });
});

describe("moveItem — the headline operation", () => {
  it("moves a whole stack and preserves the item's identity", async () => {
    const items = await fixtureRepository.listItems(kova, PARTY_WAGON);
    const lantern = items.find((i) => i.name === "Lantern, hooded")!;

    const outcome = await fixtureRepository.moveItem(kova, {
      itemId: lantern.id,
      toContainerId: KOVAS_PACK as never,
      qty: lantern.qty,
    });

    expect(outcome.split).toBe(false);
    // Identity survives the move — this is the whole argument for containment
    // being an edge rather than a column.
    const moved = await fixtureRepository.getItem(kova, lantern.id);
    expect(moved?.id).toBe(lantern.id);
    expect(moved?.containerId).toBe(KOVAS_PACK);
  });

  it("splits a stack on a partial move, conserving the total", async () => {
    const items = await fixtureRepository.listItems(kova, PARTY_WAGON);
    const potions = items.find((i) => i.name === "Healing Potion")!;
    const before = potions.qty;

    const outcome = await fixtureRepository.moveItem(kova, {
      itemId: potions.id,
      toContainerId: KOVAS_PACK as never,
      qty: 2,
    });

    expect(outcome.split).toBe(true);

    const wagonAfter = await fixtureRepository.listItems(kova, PARTY_WAGON);
    const packAfter = await fixtureRepository.listItems(kova, KOVAS_PACK);
    const remaining =
      wagonAfter.find((i) => i.id === potions.id)?.qty ?? 0;
    const arrived = packAfter
      .filter((i) => i.name === "Healing Potion")
      .reduce((n, i) => n + i.qty, 0);

    expect(remaining).toBe(before - 2);
    expect(arrived).toBe(2);
    // Nothing is created or destroyed by a move.
    expect(remaining + arrived).toBe(before);
  });

  it("refuses a move whose SOURCE the actor cannot write", async () => {
    const items = await fixtureRepository.listItems(gm, MILOS_PACK);
    await expect(
      fixtureRepository.moveItem(kova, {
        itemId: items[0]!.id,
        toContainerId: PARTY_WAGON as never,
        qty: 1,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses a move whose DESTINATION the actor cannot write", async () => {
    const items = await fixtureRepository.listItems(kova, PARTY_WAGON);
    await expect(
      fixtureRepository.moveItem(kova, {
        itemId: items[0]!.id,
        toContainerId: BARROW_CHEST as never,
        qty: 1,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses moving more than the stack holds", async () => {
    const items = await fixtureRepository.listItems(kova, PARTY_WAGON);
    const lantern = items.find((i) => i.name === "Lantern, hooded")!;
    await expect(
      fixtureRepository.moveItem(kova, {
        itemId: lantern.id,
        toContainerId: KOVAS_PACK as never,
        qty: lantern.qty + 5,
      }),
    ).rejects.toThrow(/Only/);
  });
});

describe("derived values", () => {
  it("recomputes carried weight after a move, from source rows", async () => {
    const before = (await fixtureRepository.getContainer(kova, KOVAS_PACK))!;
    const items = await fixtureRepository.listItems(kova, PARTY_WAGON);
    const lantern = items.find((i) => i.name === "Lantern, hooded")!;

    await fixtureRepository.moveItem(kova, {
      itemId: lantern.id,
      toContainerId: KOVAS_PACK as never,
      qty: 1,
    });

    const after = (await fixtureRepository.getContainer(kova, KOVAS_PACK))!;
    expect(after.carriedWeight).toBeCloseTo(
      before.carriedWeight + lantern.weight,
      5,
    );
  });

  it("drops an archived item out of the derived totals", async () => {
    const before = (await fixtureRepository.getContainer(gm, PARTY_WAGON))!;
    const items = await fixtureRepository.listItems(gm, PARTY_WAGON);
    const first = items[0]!;

    await fixtureRepository.archiveItem(gm, first.id);

    const after = (await fixtureRepository.getContainer(gm, PARTY_WAGON))!;
    expect(after.carriedWeight).toBeCloseTo(
      before.carriedWeight - first.qty * first.weight,
      5,
    );
    // Soft delete: gone from the view, still in the store.
    expect(await fixtureRepository.getItem(gm, first.id)).toBeNull();
  });
});
