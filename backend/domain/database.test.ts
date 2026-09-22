import { beforeEach, describe, expect, it } from "vitest";

import {
  fixtureRepository,
  resetFixtureStore,
} from "@backend/db/fixture-repository";
import {
  GM_EMAIL,
  GM_ID,
  KOVA_CONTAINER_ID,
  KOVA_EMAIL,
  KOVA_ID,
  MILO_EMAIL,
  MILO_ID,
  PARTY_WAGON_ID,
  SEED_CATALOG,
  SEED_CONTAINERS,
  SEED_ITEMS,
} from "@backend/db/seed-data";
import {
  listDatabases,
  readDatabase,
  slugifyType,
} from "@backend/domain/database";
import type { ItemView, Principal } from "@backend/domain/view";

/**
 * A database view is the first thing in Arca that reads across containers, so
 * it is the first place a read-permission bug would leak loot rather than
 * merely showing the wrong count. These tests are mostly about that.
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
const milo: Principal = {
  userId: MILO_ID as Principal["userId"],
  displayName: "Milo",
  email: MILO_EMAIL,
  role: "player",
};

const repo = fixtureRepository;

beforeEach(() => {
  resetFixtureStore();
});

describe("slugifyType", () => {
  it("survives a round trip through a URL segment", () => {
    expect(slugifyType("Weapon")).toBe("weapon");
    expect(slugifyType("Magic Item")).toBe("magic-item");
    expect(slugifyType("  Potion / Elixir  ")).toBe("potion-elixir");
  });

  it("gives nothing back for a name with no letters in it", () => {
    expect(slugifyType("///")).toBe("");
  });
});

describe("listDatabases", () => {
  it("lists a database for every type on a visible object", async () => {
    const databases = await listDatabases(repo, gm);
    expect(databases.length).toBeGreaterThan(0);

    const names = databases.map((d) => d.name);
    // Sorted, because the sidebar is a list somebody scans.
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it("counts each definition once in each of its types", async () => {
    const databases = await listDatabases(repo, gm);
    const total = databases.reduce((sum, d) => sum + d.itemCount, 0);
    // The seed's items are all hand-made, so each is its own definition; the
    // catalogue's entries are definitions whether or not anyone holds one.
    const expected =
      SEED_ITEMS.reduce((sum, i) => sum + i.types.length, 0) +
      SEED_CATALOG.reduce((sum, e) => sum + e.types.length, 0);
    expect(total).toBe(expected);
  });

  it("lists a catalogue entry once, however many copies are held", async () => {
    const dagger = SEED_CATALOG.find((e) => e.name === "Dagger")!;
    for (const containerId of [KOVA_CONTAINER_ID, PARTY_WAGON_ID]) {
      await repo.addFromCatalog(gm, {
        catalogItemId: dagger.id as ItemView["id"],
        containerId: containerId as ItemView["containerId"],
        qty: 1,
      });
    }

    const weapons = await readDatabase(repo, gm, "weapon");
    const daggers = weapons!.rows.filter((r) => r.name === "Dagger");
    expect(daggers).toHaveLength(1);
    expect(daggers[0]!.holdings.map((h) => h.container.id).sort()).toEqual(
      [KOVA_CONTAINER_ID, PARTY_WAGON_ID].sort(),
    );
    expect(daggers[0]!.stats.damage).toBe("1D6");
  });

  /**
   * The count is per-principal on purpose. A shared total would be a number
   * that leaks: "Weapon 12" to a player who can reach four of them says the GM
   * is holding eight somewhere.
   */
  it("counts only what the principal can reach", async () => {
    const forGm = await listDatabases(repo, gm);
    const forKova = await listDatabases(repo, kova);

    const gmTotal = forGm.reduce((sum, d) => sum + d.itemCount, 0);
    const kovaTotal = forKova.reduce((sum, d) => sum + d.itemCount, 0);
    expect(kovaTotal).toBeLessThan(gmTotal);
  });
});

describe("readDatabase", () => {
  it("returns the type's real name, not the slug that was typed", async () => {
    const databases = await listDatabases(repo, gm);
    const first = databases[0]!;

    const read = await readDatabase(repo, gm, first.slug.toUpperCase());
    expect(read?.name).toBe(first.name);
  });

  it("returns null for a type that does not exist", async () => {
    await expect(readDatabase(repo, gm, "not-a-type")).resolves.toBeNull();
    await expect(readDatabase(repo, gm, "")).resolves.toBeNull();
  });

  it("agrees with the count in the sidebar", async () => {
    for (const summary of await listDatabases(repo, kova)) {
      const read = await readDatabase(repo, kova, summary.slug);
      expect(read?.rows.length).toBe(summary.itemCount);
    }
  });

  /**
   * THE test. An unrevealed world container is invisible to a player in the
   * sidebar; a database that reads across containers must not be the back door
   * that lists its contents anyway.
   */
  it("never shows an item from a container the principal cannot read", async () => {
    const hidden = SEED_CONTAINERS.filter(
      (c) => c.type === "world" && !c.revealed,
    );
    expect(hidden.length).toBeGreaterThan(0);

    const hiddenItemIds = new Set(
      SEED_ITEMS.filter((i) =>
        hidden.some((c) => c.id === i.containerId),
      ).map((i) => i.id),
    );
    expect(hiddenItemIds.size).toBeGreaterThan(0);

    for (const summary of await listDatabases(repo, kova)) {
      const read = await readDatabase(repo, kova, summary.slug);
      for (const row of read!.rows) {
        expect(hiddenItemIds.has(row.id)).toBe(false);
        for (const holding of row.holdings) {
          expect(hiddenItemIds.has(holding.itemId)).toBe(false);
          expect(hidden.map((c) => c.id)).not.toContain(holding.container.id);
        }
      }
    }
  });

  /** The other half of the same rule: one player's pack is not another's. */
  it("never shows an item from another player's pack", async () => {
    const kovasPacks = SEED_CONTAINERS.filter(
      (c) => c.type === "character" && c.ownerId === KOVA_ID,
    ).map((c) => c.id);
    expect(kovasPacks.length).toBeGreaterThan(0);

    for (const summary of await listDatabases(repo, milo)) {
      const read = await readDatabase(repo, milo, summary.slug);
      for (const row of read!.rows) {
        for (const holding of row.holdings) {
          expect(kovasPacks).not.toContain(holding.container.id);
        }
      }
    }
  });

  /** A type only present in containers the player cannot open must be
   *  indistinguishable from a type that does not exist — otherwise the URL bar
   *  is a way to ask what the GM is holding. */
  it("hides a database whose only objects are out of reach", async () => {
    const forGm = await listDatabases(repo, gm);
    const forKova = new Set(
      (await listDatabases(repo, kova)).map((d) => d.slug),
    );

    const outOfReach = forGm.filter((d) => !forKova.has(d.slug));
    for (const database of outOfReach) {
      await expect(readDatabase(repo, kova, database.slug)).resolves.toBeNull();
    }
  });
});
