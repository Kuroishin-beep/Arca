import { beforeEach, describe, expect, it } from "vitest";

import { fixtureRepository as repo, resetFixtureStore } from "@backend/db/fixture-repository";
import {
  GM_EMAIL,
  GM_ID,
  KOVA_CONTAINER_ID,
  KOVA_EMAIL,
  KOVA_ID,
  MILO_EMAIL,
  MILO_ID,
} from "@backend/db/seed-data";
import type { ContainerView, Principal } from "@backend/domain/view";
import { PermissionError, canViewSheet } from "@backend/lib/permissions";

/**
 * Party members see each other's character SHEETS, read-only; the packs stay
 * private. A party is a shared container's member list (none = whole table).
 */

const player = (userId: string, email: string, name: string): Principal => ({
  userId: userId as Principal["userId"],
  displayName: name,
  email,
  role: "player",
});
const kova = player(KOVA_ID, KOVA_EMAIL, "Kova");
const milo = player(MILO_ID, MILO_EMAIL, "Milo");
const gm: Principal = { ...player(GM_ID, GM_EMAIL, "Ravna"), role: "gm" };

const view = (fields: Partial<ContainerView>): ContainerView =>
  ({
    id: "c" as ContainerView["id"],
    name: "x",
    type: "character",
    ownerId: KOVA_ID as ContainerView["ownerId"],
    revealed: true,
    itemCount: 0,
    carriedWeight: 0,
    capacity: null,
    memberIds: null,
    ref: "x",
    ...fields,
  });

describe("canViewSheet", () => {
  const kovasSheet = view({});

  it("lets the owner and the GM view, as before", () => {
    expect(canViewSheet(kova, kovasSheet, [])).toBe(true);
    expect(canViewSheet(gm, kovasSheet, [])).toBe(true);
  });

  it("lets a player view another's sheet when a whole-table party exists", () => {
    expect(canViewSheet(milo, kovasSheet, [view({ type: "party", memberIds: null })])).toBe(true);
  });

  it("needs BOTH players in the same party", () => {
    const party = (ids: string[]) =>
      view({ type: "party", memberIds: ids as ContainerView["memberIds"] & string[] });
    expect(canViewSheet(milo, kovasSheet, [party([MILO_ID, KOVA_ID])])).toBe(true);
    expect(canViewSheet(milo, kovasSheet, [party([MILO_ID])])).toBe(false);
    expect(canViewSheet(milo, kovasSheet, [party([KOVA_ID])])).toBe(false);
  });

  it("gives nothing with no party at all", () => {
    expect(canViewSheet(milo, kovasSheet, [view({ type: "world" })])).toBe(false);
  });
});

describe("a party member's sheet, through the repository", () => {
  beforeEach(() => resetFixtureStore());

  it("is readable as a sheet, while the pack stays sealed", async () => {
    const sheet = await repo.getCharacter(milo, KOVA_CONTAINER_ID);
    expect(sheet?.name).toBe("Kova");
    await expect(repo.listItems(milo, KOVA_CONTAINER_ID)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.getContainer(milo, KOVA_CONTAINER_ID)).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("is not writable", async () => {
    await expect(
      repo.updateCharacter(milo, { containerId: KOVA_CONTAINER_ID, hp: 1 } as Parameters<
        typeof repo.updateCharacter
      >[1]),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("lists party members' characters, not your own", async () => {
    const party = await repo.listPartyCharacters(milo);
    expect(party.map((c) => c.name)).toContain("Kova");
    expect(party.map((c) => c.name)).not.toContain("Milo");
  });
});
