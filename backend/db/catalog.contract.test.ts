import { beforeEach, describe, expect, it } from "vitest";

import { readDatabase } from "@backend/domain/database";
import type { ContainerId, ItemId } from "@backend/domain/types";
import type { Principal } from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";

import { fixtureRepository, resetFixtureStore } from "./fixture-repository";
import { ConflictError } from "./repository";
import {
  GM_EMAIL,
  GM_ID,
  KOVA_CONTAINER_ID,
  KOVA_EMAIL,
  KOVA_ID,
  PARTY_WAGON_ID,
  SEED_CATALOG,
} from "./seed-data";

/**
 * The catalogue — SCOPE.md S3.
 *
 * The feature's whole claim is that a copy does not hold its own values, so
 * correcting a definition corrects every copy of it at once. That claim is
 * only true if nothing, anywhere, snapshots those fields on the way in — which
 * is not something a type can enforce and is therefore what most of this file
 * is about.
 */

const gm: Principal = {
  userId: GM_ID as Principal["userId"],
  displayName: "Ravna",
  email: GM_EMAIL,
  role: "gm",
};

const kova: Principal = {
  userId: KOVA_ID as Principal["userId"],
  displayName: "Kova",
  email: KOVA_EMAIL,
  role: "player",
};

/** Seed ids are plain strings; the domain speaks branded ones. Asserted once
 *  here rather than at every call site below. */
const ROPE = SEED_CATALOG[0]!.id as ItemId;
const KOVAS_PACK = KOVA_CONTAINER_ID as ContainerId;
const WAGON = PARTY_WAGON_ID as ContainerId;

beforeEach(() => resetFixtureStore());

describe("reading the catalogue", () => {
  it("is open to every member, player included", async () => {
    // Not an oversight. A catalogue says what a rope weighs, never who has
    // one — there is nothing in an entry for a read rule to protect.
    const entries = await fixtureRepository.listCatalog(kova);
    expect(entries.length).toBe(SEED_CATALOG.length);
  });

  it("carries no quantity, because a definition has none", async () => {
    const entry = await fixtureRepository.getCatalogItem(kova, ROPE);
    expect(entry).not.toBeNull();
    expect(entry).not.toHaveProperty("qty");
  });

  /**
   * Entries are objects no container holds, so every existing read — which
   * walks containment edges to find items — skips them without being told to.
   * If this fails, entries have started showing up as loot.
   */
  it("never appears in a container, and appears in its database once", async () => {
    const items = await fixtureRepository.listItems(kova, KOVAS_PACK);
    expect(items.some((i) => i.id === ROPE)).toBe(false);

    // The reference diagram's model: the Gear database lists the rope as a
    // definition — once, and with no holdings until someone takes a copy.
    const gear = await readDatabase(fixtureRepository, kova, "gear");
    const ropes = gear!.rows.filter((r) => r.id === ROPE);
    expect(ropes).toHaveLength(1);
    expect(ropes[0]!.holdings).toEqual([]);
  });
});

describe("writing the catalogue", () => {
  it("is the GM's alone", async () => {
    await expect(
      fixtureRepository.createCatalogItem(kova, {
        name: "Homebrew Sword",
        weight: 1,
        value: "",
        tags: [],
        types: [],
        notes: "",
        stats: {},
      }),
    ).rejects.toBeInstanceOf(PermissionError);

    await expect(
      fixtureRepository.updateCatalogItem(kova, { id: ROPE, weight: 99 }),
    ).rejects.toBeInstanceOf(PermissionError);

    await expect(
      fixtureRepository.archiveCatalogItem(kova, ROPE),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("lets the GM define something new", async () => {
    const created = await fixtureRepository.createCatalogItem(gm, {
      name: "Lantern, hooded",
      weight: 1,
      value: "5 gp",
      tags: ["gear"],
      types: ["Physical Object", "Gear"],
      notes: "",
      // `grip` is not a Gear field, so it must not survive the write.
      stats: { effect: "Lights a room.", grip: "1H" },
    });

    expect(created.name).toBe("Lantern, hooded");
    expect(created.copies).toBe(0);
    expect(created.stats).toEqual({ effect: "Lights a room." });
  });

  it("patches only the fields it is given", async () => {
    const before = (await fixtureRepository.getCatalogItem(gm, ROPE))!;
    await fixtureRepository.updateCatalogItem(gm, { id: ROPE, weight: 2 });
    const after = (await fixtureRepository.getCatalogItem(gm, ROPE))!;

    expect(after.weight).toBe(2);
    expect(after.name).toBe(before.name);
    expect(after.tags).toEqual(before.tags);
  });
});

describe("taking a copy", () => {
  it("puts an item in the container without emptying the catalogue", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 2,
    });

    expect(copy.name).toBe(SEED_CATALOG[0]!.name);
    expect(copy.qty).toBe(2);
    expect(copy.catalogItemId).toBe(ROPE);

    // The entry is still there — this is a copy, not a move.
    expect(await fixtureRepository.getCatalogItem(kova, ROPE)).not.toBeNull();
  });

  it("is gated on the destination, and only the destination", async () => {
    // Kova may not write to a world container, so she may not copy into one.
    const worldish = (await fixtureRepository.listContainers(gm)).find(
      (c) => c.type === "world",
    )!;

    await expect(
      fixtureRepository.addFromCatalog(kova, {
        catalogItemId: ROPE,
        containerId: worldish.id,
        qty: 1,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  /**
   * ── THE TEST ──────────────────────────────────────────────────────────
   *
   * Two copies, in two different containers, owned by different rules. One
   * correction in the catalogue. Both change.
   *
   * If this ever fails, something started snapshotting the entry's fields onto
   * the copy, and the feature has quietly become "template" — a starting point
   * that drifts — rather than "catalogue".
   */
  it("makes one correction reach every copy, in every container", async () => {
    await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });
    await fixtureRepository.addFromCatalog(gm, {
      catalogItemId: ROPE,
      containerId: WAGON,
      qty: 5,
    });

    await fixtureRepository.updateCatalogItem(gm, {
      id: ROPE,
      name: "Rope, hempen (8 m)",
      weight: 0.8,
    });

    const inPack = (
      await fixtureRepository.listItems(kova, KOVAS_PACK)
    ).find((i) => i.catalogItemId === ROPE)!;
    const inWagon = (
      await fixtureRepository.listItems(kova, WAGON)
    ).find((i) => i.catalogItemId === ROPE)!;

    expect(inPack.name).toBe("Rope, hempen (8 m)");
    expect(inWagon.name).toBe("Rope, hempen (8 m)");
    expect(inPack.weight).toBe(0.8);
    expect(inWagon.weight).toBe(0.8);

    // And the quantities did NOT converge — those belong to the containers.
    expect(inPack.qty).toBe(1);
    expect(inWagon.qty).toBe(5);
  });

  it("keeps a copy's own notes out of the shared definition", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    await fixtureRepository.updateItem(kova, {
      id: copy.id,
      notes: "Frayed. Found in the barrow.",
    });

    const entry = (await fixtureRepository.getCatalogItem(kova, ROPE))!;
    expect(entry.notes).not.toContain("barrow");

    const mine = (
      await fixtureRepository.listItems(kova, KOVAS_PACK)
    ).find((i) => i.id === copy.id)!;
    expect(mine.notes).toBe("Frayed. Found in the barrow.");
  });

  it("counts its copies, so archiving can refuse on evidence", async () => {
    expect((await fixtureRepository.getCatalogItem(gm, ROPE))!.copies).toBe(0);

    await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    expect((await fixtureRepository.getCatalogItem(gm, ROPE))!.copies).toBe(1);
  });
});

describe("retiring an entry", () => {
  /**
   * The same answer `archiveContainer` gives for a container that still holds
   * items: refuse, and say how many. Archiving it would leave every copy
   * reading a definition no screen can open — the closest thing to losing an
   * item's identity that a soft delete can manage.
   */
  it("refuses while copies of it still exist, and says how many", async () => {
    await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    await expect(
      fixtureRepository.archiveCatalogItem(gm, ROPE),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      fixtureRepository.archiveCatalogItem(gm, ROPE),
    ).rejects.toThrow(/1 copy/);
  });

  it("goes through once nothing is reading it", async () => {
    await fixtureRepository.archiveCatalogItem(gm, ROPE);

    expect(await fixtureRepository.getCatalogItem(gm, ROPE)).toBeNull();
    expect(
      (await fixtureRepository.listCatalog(gm)).some((e) => e.id === ROPE),
    ).toBe(false);
  });
});

/**
 * The side paths — every way to reach a copy OTHER than listing a container.
 *
 * The list was the only path the original tests exercised, and it was the only
 * one that resolved links; getting, moving and editing a copy all read its own
 * properties instead. Mirrored in `catalog.postgres.test.ts`, where the same
 * gaps turned a split stack into an "Unnamed" 0 kg item.
 */
describe("a copy reached some other way", () => {
  it("is resolved when read on its own", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });
    const read = await fixtureRepository.getItem(kova, copy.id);
    expect(read?.name).toBe(SEED_CATALOG[0]!.name);
    expect(read?.catalogItemId).toBe(ROPE);
  });

  it("is named correctly in the move the whole table is told about", async () => {
    const copy = await fixtureRepository.addFromCatalog(gm, {
      catalogItemId: ROPE,
      containerId: WAGON,
      qty: 3,
    });

    const partial = await fixtureRepository.moveItem(gm, {
      itemId: copy.id,
      toContainerId: KOVAS_PACK,
      qty: 1,
    });
    expect(partial.itemName).toBe(SEED_CATALOG[0]!.name);

    const arrived = (await fixtureRepository.listItems(gm, KOVAS_PACK)).find(
      (i) => i.catalogItemId === ROPE,
    );
    expect(arrived?.name).toBe(SEED_CATALOG[0]!.name);
  });

  it("refuses a rename, pointing at the catalogue", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });
    await expect(
      fixtureRepository.updateItem(kova, { id: copy.id, name: "Mine now" }),
    ).rejects.toThrow(/catalogue/i);
  });

  it("accepts the unchanged values an edit form round-trips", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    const updated = await fixtureRepository.updateItem(kova, {
      id: copy.id,
      name: SEED_CATALOG[0]!.name,
      weight: SEED_CATALOG[0]!.weight,
      tags: [...SEED_CATALOG[0]!.tags],
      types: [...SEED_CATALOG[0]!.types],
      qty: 4,
    });

    expect(updated.qty).toBe(4);
    expect(updated.catalogItemId).toBe(ROPE);
  });
});

describe("type-specific fields", () => {
  const DAGGER = SEED_CATALOG.find((e) => e.name === "Dagger")!.id as ItemId;

  it("a copy reads its weapon stats from the entry", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: DAGGER,
      containerId: KOVAS_PACK,
      qty: 1,
    });
    expect(copy.stats).toEqual({
      grip: "1H",
      str: "—",
      damage: "1D6",
      durability: "9",
      features: "Subtle",
    });
  });

  it("one correction to the entry's damage reaches every copy", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: DAGGER,
      containerId: KOVAS_PACK,
      qty: 1,
    });
    const entry = (await fixtureRepository.getCatalogItem(gm, DAGGER))!;
    await fixtureRepository.updateCatalogItem(gm, {
      id: DAGGER,
      stats: { ...entry.stats, damage: "1D8" },
    });

    const reread = await fixtureRepository.getItem(kova, copy.id);
    expect(reread?.stats.damage).toBe("1D8");
  });

  it("refuses a copy's own edit to an inherited stat, accepts it round-tripped", async () => {
    const copy = await fixtureRepository.addFromCatalog(kova, {
      catalogItemId: DAGGER,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    await expect(
      fixtureRepository.updateItem(kova, {
        id: copy.id,
        stats: { ...copy.stats, damage: "3D6" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const saved = await fixtureRepository.updateItem(kova, {
      id: copy.id,
      stats: { ...copy.stats },
      notes: "Grandmother's.",
    });
    expect(saved.notes).toBe("Grandmother's.");
    expect(saved.stats.damage).toBe("1D6");
  });

  it("hides a stat once the item no longer has the type that owns it", async () => {
    const created = await fixtureRepository.createItem(gm, {
      containerId: WAGON,
      name: "Walking stick",
      qty: 1,
      weight: 1,
      value: "",
      tags: [],
      notes: "",
      types: ["Physical Object", "Weapon"],
      stats: { damage: "D6" },
    });
    expect(created.stats).toEqual({ damage: "D6" });

    const retyped = await fixtureRepository.updateItem(gm, {
      id: created.id,
      types: ["Physical Object", "Gear"],
    });
    expect(retyped.stats).toEqual({});
  });
});
