import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ContainerId, ItemId } from "@backend/domain/types";
import type { Principal } from "@backend/domain/view";

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
 * The catalogue against REAL Postgres — SCOPE.md S3.
 *
 * `catalog.contract.test.ts` runs against the fixture repository, and that is
 * exactly why it passed while the feature was broken: the fixture store keeps
 * a copy's link by spreading the whole record, and Postgres keeps it in a
 * separate `object_relations` row that a clone does not carry. Two
 * implementations of one interface drift precisely where one of them has to do
 * something the other gets for free, so the claims that matter are re-checked
 * here against the storage that will actually be deployed.
 *
 * ── Why it is opt-in ──────────────────────────────────────────────────────
 *
 * Every test reseeds, and reseeding DELETES THE CAMPAIGN. So this never reads
 * `DATABASE_URL` — which is the developer's real database — and runs only when
 * `ARCA_TEST_DATABASE_URL` names a throwaway one explicitly. The loopback guard
 * is the same one `e2e/global-setup.ts` uses, for the same reason.
 */
const TEST_URL = process.env.ARCA_TEST_DATABASE_URL;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

function safeToReseed(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Loopback AND not the everyday database — a throwaway one is named so.
    return LOOPBACK.has(parsed.hostname) && parsed.pathname.endsWith("_test");
  } catch {
    return false;
  }
}

const enabled = TEST_URL !== undefined && safeToReseed(TEST_URL);

function reseed(): void {
  execFileSync("npx", ["tsx", "backend/db/seed.ts"], {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
    shell: true,
  });
}

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

const ROPE = SEED_CATALOG[0]!.id as ItemId;
const ROPE_NAME = SEED_CATALOG[0]!.name;
const KOVAS_PACK = KOVA_CONTAINER_ID as ContainerId;
const WAGON = PARTY_WAGON_ID as ContainerId;

describe.skipIf(!enabled)("the catalogue on Postgres", () => {
  // Imported lazily so the client reads the TEST url on its first call, not
  // whatever DATABASE_URL happens to be in the environment.
  let repo: typeof import("./postgres-repository").postgresRepository;
  let rawSql: typeof import("./client").rawSql;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    ({ postgresRepository: repo } = await import("./postgres-repository"));
    ({ rawSql } = await import("./client"));
  });

  afterAll(async () => {
    await rawSql?.().end();
  });

  beforeEach(() => reseed());

  it("makes one correction reach every copy, in every container", async () => {
    await repo.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });
    await repo.addFromCatalog(gm, {
      catalogItemId: ROPE,
      containerId: WAGON,
      qty: 5,
    });

    await repo.updateCatalogItem(gm, { id: ROPE, name: "Rope, short", weight: 0.5 });

    const inPack = (await repo.listItems(kova, KOVAS_PACK)).find(
      (i) => i.catalogItemId === ROPE,
    )!;
    const inWagon = (await repo.listItems(kova, WAGON)).find(
      (i) => i.catalogItemId === ROPE,
    )!;

    expect([inPack.name, inWagon.name]).toEqual(["Rope, short", "Rope, short"]);
    expect([inPack.weight, inWagon.weight]).toEqual([0.5, 0.5]);
    expect([inPack.qty, inWagon.qty]).toEqual([1, 5]);
  });

  it("resolves a copy read on its own, not only in a list", async () => {
    const copy = await repo.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    const read = await repo.getItem(kova, copy.id);
    expect(read?.name).toBe(ROPE_NAME);
    expect(read?.catalogItemId).toBe(ROPE);
  });

  /**
   * The corruption case. Splitting a stack clones the moving half, and the
   * clone must carry the LINK — a copy's name and weight live on the entry,
   * so a clone of its own properties alone is an "Unnamed" 0 kg item.
   */
  it("keeps both halves of a split copy linked to their entry", async () => {
    const copy = await repo.addFromCatalog(gm, {
      catalogItemId: ROPE,
      containerId: WAGON,
      qty: 4,
    });

    const outcome = await repo.moveItem(gm, {
      itemId: copy.id,
      toContainerId: KOVAS_PACK,
      qty: 1,
    });
    expect(outcome.split).toBe(true);
    expect(outcome.itemName).toBe(ROPE_NAME);

    const stayed = (await repo.listItems(gm, WAGON)).find(
      (i) => i.id === copy.id,
    )!;
    const arrived = (await repo.listItems(gm, KOVAS_PACK)).find(
      (i) => i.catalogItemId === ROPE,
    );

    expect(stayed.qty).toBe(3);
    expect(arrived).toBeDefined();
    expect(arrived!.name).toBe(ROPE_NAME);
    expect(arrived!.weight).toBe(SEED_CATALOG[0]!.weight);
    expect(arrived!.qty).toBe(1);

    // And the entry now has two live copies, not one.
    expect((await repo.getCatalogItem(gm, ROPE))!.copies).toBe(2);
  });

  it("names a copy correctly when the whole stack moves", async () => {
    const copy = await repo.addFromCatalog(gm, {
      catalogItemId: ROPE,
      containerId: WAGON,
      qty: 2,
    });
    const outcome = await repo.moveItem(gm, {
      itemId: copy.id,
      toContainerId: KOVAS_PACK,
      qty: 2,
    });
    expect(outcome.itemName).toBe(ROPE_NAME);
  });

  it("refuses to rename a copy, and says where to do it instead", async () => {
    const copy = await repo.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    await expect(
      repo.updateItem(kova, { id: copy.id, name: "My own rope" }),
    ).rejects.toThrow(/catalogue/i);
  });

  it("still lets a copy's own quantity and notes be edited", async () => {
    const copy = await repo.addFromCatalog(kova, {
      catalogItemId: ROPE,
      containerId: KOVAS_PACK,
      qty: 1,
    });

    // The edit form round-trips the displayed (inherited) values unchanged;
    // those must be accepted as a no-op, not refused.
    const updated = await repo.updateItem(kova, {
      id: copy.id,
      name: ROPE_NAME,
      qty: 3,
      notes: "Found in the barrow.",
    });

    expect(updated.qty).toBe(3);
    expect(updated.notes).toBe("Found in the barrow.");
    expect(updated.name).toBe(ROPE_NAME);
    expect(updated.catalogItemId).toBe(ROPE);
  });
  it("stores type stats, resolves them on copies, and follows a correction", async () => {
    const dagger = SEED_CATALOG.find((e) => e.name === "Dagger")!.id as ItemId;
    const copy = await repo.addFromCatalog(kova, {
      catalogItemId: dagger,
      containerId: KOVAS_PACK,
      qty: 1,
    });
    expect(copy.stats.damage).toBe("1D6");

    const entry = (await repo.getCatalogItem(gm, dagger))!;
    await repo.updateCatalogItem(gm, {
      id: dagger,
      stats: { ...entry.stats, damage: "1D8" },
    });
    expect((await repo.getItem(kova, copy.id))?.stats.damage).toBe("1D8");

    await expect(
      repo.updateItem(kova, { id: copy.id, stats: { ...copy.stats, damage: "3D6" } }),
    ).rejects.toThrow(/catalogue/i);

    // A hand-made weapon owns its stats, and loses the ones its types drop.
    const made = await repo.createItem(gm, {
      containerId: WAGON,
      name: "Walking stick",
      qty: 1,
      weight: 1,
      value: "",
      tags: [],
      notes: "",
      types: ["Physical Object", "Weapon"],
      stats: { damage: "D6", effect: "not a weapon field" },
    });
    expect((await repo.getItem(gm, made.id))?.stats).toEqual({ damage: "D6" });
  });
});
