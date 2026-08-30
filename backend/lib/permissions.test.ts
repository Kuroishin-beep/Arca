import { beforeEach, describe, expect, it } from "vitest";

import { fixtureRepository, resetFixtureStore } from "@backend/db/fixture-repository";
import { ConflictError } from "@backend/db/repository";
import { GM_ID, KOVA_ID, MILO_ID, SEED_CONTAINERS } from "@backend/db/seed-data";
import type { ContainerId } from "@backend/domain/types";
import type { Principal } from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";

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

/** Seed ids are plain strings; the branded type is what the domain speaks, and
 *  asserting it once here beats casting at every call site. */
const id = (name: string): ContainerId =>
  SEED_CONTAINERS.find((c) => c.name === name)!.id as ContainerId;

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

  /**
   * The same rule from the other side. Kova being unable to read Milo's pack
   * could be satisfied by a rule that simply favours Milo; only the symmetric
   * case shows the rule is about ownership rather than about a particular
   * player. The `milo` principal existed for this and the assertion was never
   * written — the linter is what surfaced it, as an unused variable.
   */
  it("hides a player's pack from the other player, both ways", async () => {
    const containers = await fixtureRepository.listContainers(milo);
    expect(containers.map((c) => c.id)).toContain(MILOS_PACK);
    expect(containers.map((c) => c.id)).not.toContain(KOVAS_PACK);

    await expect(
      fixtureRepository.getContainer(milo, KOVAS_PACK),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  /**
   * Creating containers is GM-only (SCOPE.md §3), and deliberately not implied
   * by write access. Kova can write to the party wagon all day; that must not
   * let her conjure a second one.
   */
  it("refuses a player who tries to create a container", async () => {
    await expect(
      fixtureRepository.createContainer(kova, {
        name: "Kova's secret stash",
        type: "party",
        ownerId: null,
        capacity: null,
        revealed: false,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("lets the GM create one, and it appears in the list", async () => {
    const created = await fixtureRepository.createContainer(gm, {
      name: "The Drowned Cellar",
      type: "world",
      ownerId: null,
      capacity: null,
      revealed: false,
    });
    const forGm = await fixtureRepository.listContainers(gm);
    expect(forGm.map((c) => c.id)).toContain(created.id);

    // Unrevealed, so it must not reach a player at all.
    const forKova = await fixtureRepository.listContainers(kova);
    expect(forKova.map((c) => c.id)).not.toContain(created.id);
  });

  it("refuses a player who tries to retire a container", async () => {
    await expect(
      fixtureRepository.archiveContainer(kova, KOVAS_PACK),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  /**
   * The guard that matters: hiding a container that still holds items would
   * leave them belonging somewhere and appearing nowhere.
   */
  it("refuses to retire a container that still holds items", async () => {
    await expect(
      fixtureRepository.archiveContainer(gm, KOVAS_PACK),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("retires an empty container", async () => {
    const empty = await fixtureRepository.createContainer(gm, {
      name: "Empty crate",
      type: "world",
      ownerId: null,
      capacity: null,
      revealed: true,
    });
    await fixtureRepository.archiveContainer(gm, empty.id);
    const after = await fixtureRepository.listContainers(gm);
    expect(after.map((c) => c.id)).not.toContain(empty.id);
  });

  it("refuses a player who tries to edit a container", async () => {
    await expect(
      fixtureRepository.updateContainer(kova, {
        id: KOVAS_PACK,
        name: "Kova's much larger pack",
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  /**
   * The point of the whole feature: revealing changes what a PLAYER can see,
   * not just what a flag says.
   */
  it("revealing a world container makes it visible to players", async () => {
    const before = await fixtureRepository.listContainers(kova);
    expect(before.map((c) => c.id)).not.toContain(SUNKEN_VAULT);

    await fixtureRepository.updateContainer(gm, {
      id: SUNKEN_VAULT,
      revealed: true,
    });

    const after = await fixtureRepository.listContainers(kova);
    expect(after.map((c) => c.id)).toContain(SUNKEN_VAULT);
  });

  it("hiding it again takes it back out of a player's list", async () => {
    await fixtureRepository.updateContainer(gm, {
      id: SUNKEN_VAULT,
      revealed: true,
    });
    await fixtureRepository.updateContainer(gm, {
      id: SUNKEN_VAULT,
      revealed: false,
    });
    const after = await fixtureRepository.listContainers(kova);
    expect(after.map((c) => c.id)).not.toContain(SUNKEN_VAULT);
  });

  /**
   * The data-loss guard, one level up from the item version: revealing a chest
   * must not also rename it or clear its capacity.
   */
  it("leaves untouched fields alone on a patch", async () => {
    const created = await fixtureRepository.createContainer(gm, {
      name: "Cellar",
      type: "world",
      ownerId: null,
      capacity: 40,
      revealed: false,
    });

    const patched = await fixtureRepository.updateContainer(gm, {
      id: created.id,
      revealed: true,
    });

    expect(patched.revealed).toBe(true);
    expect(patched.name).toBe("Cellar");
    expect(patched.capacity).toBe(40);
  });

  it("clears capacity when told to, distinctly from leaving it alone", async () => {
    const created = await fixtureRepository.createContainer(gm, {
      name: "Cart",
      type: "party",
      ownerId: null,
      capacity: 80,
      revealed: true,
    });

    const untouched = await fixtureRepository.updateContainer(gm, {
      id: created.id,
      name: "Handcart",
    });
    expect(untouched.capacity).toBe(80);

    const cleared = await fixtureRepository.updateContainer(gm, {
      id: created.id,
      capacity: null,
    });
    expect(cleared.capacity).toBeNull();
    expect(cleared.name).toBe("Handcart");
  });

  /** A pack is never hidden, so a reveal on one is a no-op rather than a way to
   *  make a player's own container vanish from their sidebar. */
  it("ignores revealed on a non-world container", async () => {
    const patched = await fixtureRepository.updateContainer(gm, {
      id: KOVAS_PACK,
      revealed: false,
    });
    expect(patched.revealed).toBe(true);

    const forKova = await fixtureRepository.listContainers(kova);
    expect(forKova.map((c) => c.id)).toContain(KOVAS_PACK);
  });

  /* ---------------------------------------------------------------- *
   * Changing kind and owner. The ownership invariant has to hold across
   * the change, and the change moves the container between permission
   * rules — so each conversion is asserted by what a PLAYER can see
   * afterwards, not just by the stored flag.
   * ---------------------------------------------------------------- */

  it("converts a pack into a shared container, stripping its owner", async () => {
    const patched = await fixtureRepository.updateContainer(gm, {
      id: KOVAS_PACK,
      type: "party",
      ownerId: null,
    });
    expect(patched.type).toBe("party");
    expect(patched.ownerId).toBeNull();

    // Milo could not see Kova's pack; he can see a shared container.
    const forMilo = await fixtureRepository.listContainers(milo);
    expect(forMilo.map((c) => c.id)).toContain(KOVAS_PACK);
  });

  it("converts a shared container into a pack, giving it an owner", async () => {
    const patched = await fixtureRepository.updateContainer(gm, {
      id: PARTY_WAGON,
      type: "character",
      ownerId: kova.userId,
    });
    expect(patched.type).toBe("character");
    expect(patched.ownerId).toBe(kova.userId);

    // Milo loses it; Kova keeps it.
    const forMilo = await fixtureRepository.listContainers(milo);
    expect(forMilo.map((c) => c.id)).not.toContain(PARTY_WAGON);
    const forKova = await fixtureRepository.listContainers(kova);
    expect(forKova.map((c) => c.id)).toContain(PARTY_WAGON);
  });

  it("refuses a pack with no owner", async () => {
    await expect(
      fixtureRepository.updateContainer(gm, {
        id: PARTY_WAGON,
        type: "character",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a shared or world container that keeps an owner", async () => {
    await expect(
      fixtureRepository.updateContainer(gm, {
        id: KOVAS_PACK,
        type: "party",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  /**
   * A world container is the only hidden kind. Converting away from it must
   * force visibility, or the container would linger invisible to every player
   * with no control left to bring it back.
   */
  it("forces visibility when converting away from world", async () => {
    const patched = await fixtureRepository.updateContainer(gm, {
      id: SUNKEN_VAULT,
      type: "party",
      ownerId: null,
    });
    expect(patched.revealed).toBe(true);

    const forKova = await fixtureRepository.listContainers(kova);
    expect(forKova.map((c) => c.id)).toContain(SUNKEN_VAULT);
  });

  it("reassigns a pack to another player", async () => {
    await fixtureRepository.updateContainer(gm, {
      id: KOVAS_PACK,
      ownerId: milo.userId,
    });

    const forKova = await fixtureRepository.listContainers(kova);
    expect(forKova.map((c) => c.id)).not.toContain(KOVAS_PACK);
    const forMilo = await fixtureRepository.listContainers(milo);
    expect(forMilo.map((c) => c.id)).toContain(KOVAS_PACK);
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
      toContainerId: KOVAS_PACK,
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
      toContainerId: KOVAS_PACK,
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
        toContainerId: PARTY_WAGON,
        qty: 1,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses a move whose DESTINATION the actor cannot write", async () => {
    const items = await fixtureRepository.listItems(kova, PARTY_WAGON);
    await expect(
      fixtureRepository.moveItem(kova, {
        itemId: items[0]!.id,
        toContainerId: BARROW_CHEST,
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
        toContainerId: KOVAS_PACK,
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
      toContainerId: KOVAS_PACK,
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
