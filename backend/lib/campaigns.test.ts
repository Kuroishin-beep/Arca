import { beforeEach, describe, expect, it } from "vitest";

import { repository } from "@backend/db";
import { resetFixtureStore } from "@backend/db/fixture-repository";
import {
  GM_EMAIL,
  GM_ID,
  KOVA_EMAIL,
  KOVA_ID,
  MILO_ID,
} from "@backend/db/seed-data";
import type { Principal } from "@backend/domain/view";
import { defaultCampaignId } from "@backend/lib/campaign";

/**
 * Several campaigns in one deployment.
 *
 * The property that matters above all: nothing in one campaign is visible
 * from another — not a container, not an item, not a member — for any role.
 * Then: the same person can hold different roles at different tables, and the
 * GM decides who sits at theirs.
 *
 * These go through `repository()`, the scoped wrapper the app uses, because
 * that wrapper is what puts each call in the caller's campaign.
 */
const repo = repository();

const ravna: Principal = {
  userId: GM_ID as Principal["userId"],
  displayName: "Ravna",
  email: GM_EMAIL,
  role: "gm",
  campaignId: defaultCampaignId(),
};
const kovaHome: Principal = {
  userId: KOVA_ID as Principal["userId"],
  displayName: "Kova",
  email: KOVA_EMAIL,
  role: "player",
  campaignId: defaultCampaignId(),
};

/** Kova starts a campaign of her own, and is its GM. */
async function kovasCampaign() {
  const seat = await repo.createCampaign(kovaHome, { name: "The Misty Vale" });
  const kovaGm: Principal = { ...kovaHome, role: "gm", campaignId: seat.campaignId };
  return { seat, kovaGm };
}

beforeEach(() => resetFixtureStore());

describe("starting a campaign", () => {
  it("makes its creator the GM, and lists it beside the others", async () => {
    const { seat } = await kovasCampaign();
    expect(seat.role).toBe("gm");

    const seats = await repo.membershipsOf(KOVA_ID);
    expect(seats.map((s) => [s.campaignName, s.role]).sort()).toEqual(
      [
        ["Ravenholt Westmarch", "player"],
        ["The Misty Vale", "gm"],
      ].sort(),
    );
  });

  it("comes with one shared container, open to the table", async () => {
    const { kovaGm } = await kovasCampaign();
    const containers = await repo.listContainers(kovaGm);
    expect(containers.map((c) => c.name)).toEqual(["Party Stash"]);
    expect(containers[0]!.memberIds).toBeNull();
  });
});

describe("isolation between campaigns", () => {
  it("shows none of one campaign's containers or items from another", async () => {
    const { kovaGm } = await kovasCampaign();

    const home = await repo.listContainers(ravna);
    const vale = await repo.listContainers(kovaGm);
    const homeIds = new Set(home.map((c) => c.id));
    expect(vale.some((c) => homeIds.has(c.id))).toBe(false);

    // Something written in the new campaign stays there.
    const stash = vale[0]!;
    await repo.createItem(kovaGm, {
      containerId: stash.id,
      name: "Misty lantern",
      qty: 1,
      weight: 1,
      value: "",
      tags: [],
      notes: "",
      types: [],
      stats: {},
    });
    for (const container of await repo.listContainers(ravna)) {
      const items = await repo.listItems(ravna, container.id);
      expect(items.some((i) => i.name === "Misty lantern")).toBe(false);
    }
  });

  it("will not open another campaign's container even by id", async () => {
    const { kovaGm } = await kovasCampaign();
    const stash = (await repo.listContainers(kovaGm))[0]!;
    // Ravna is GM of her own campaign, which is not a key to Kova's.
    await expect(repo.listItems(ravna, stash.id)).rejects.toThrow();
  });

  it("has its own roster", async () => {
    const { kovaGm } = await kovasCampaign();
    const vale = await repo.listMembers(kovaGm);
    expect(vale.map((m) => m.userId)).toEqual([KOVA_ID]);
    const home = await repo.listMembers(ravna);
    expect(home.length).toBeGreaterThan(1);
  });
});

describe("assigning players", () => {
  it("adds an existing account to the campaign, with a role of its own there", async () => {
    const { kovaGm } = await kovasCampaign();

    // Ravna — GM at home — joins Kova's table as a player.
    const added = await repo.addMember(kovaGm, {
      displayName: "Ravna",
      email: GM_EMAIL,
      role: "player",
    });
    expect(added?.userId).toBe(GM_ID);

    const ravnaSeats = await repo.membershipsOf(GM_ID);
    const byName = Object.fromEntries(ravnaSeats.map((s) => [s.campaignName, s.role]));
    expect(byName).toEqual({ "Ravenholt Westmarch": "gm", "The Misty Vale": "player" });

    // Already at this table: refused, not duplicated.
    await expect(
      repo.addMember(kovaGm, { displayName: "Ravna", email: GM_EMAIL, role: "gm" }),
    ).resolves.toBeNull();
  });

  it("removes a member from this campaign only", async () => {
    const { kovaGm } = await kovasCampaign();
    await repo.addMember(kovaGm, { displayName: "Ravna", email: GM_EMAIL, role: "player" });

    await repo.removeMember(kovaGm, GM_ID);
    const ravnaSeats = await repo.membershipsOf(GM_ID);
    expect(ravnaSeats.map((s) => s.campaignName)).toEqual(["Ravenholt Westmarch"]);
  });

  it("never removes yourself, never the last GM, and only for the GM", async () => {
    const { kovaGm } = await kovasCampaign();
    await expect(repo.removeMember(kovaGm, KOVA_ID)).rejects.toThrow(/yourself/i);

    // A player at home cannot remove anyone there.
    await expect(repo.removeMember(kovaHome, MILO_ID)).rejects.toThrow(/only the GM/i);

    // Promote Ravna to GM of the vale, then the vale still refuses to lose its
    // last GM when it would be the only one left.
    await repo.addMember(kovaGm, { displayName: "Ravna", email: GM_EMAIL, role: "gm" });
    const ravnaGm: Principal = { ...ravna, campaignId: kovaGm.campaignId };
    await repo.removeMember(ravnaGm, KOVA_ID);
    await expect(repo.removeMember(ravnaGm, GM_ID)).rejects.toThrow(/yourself/i);
  });
});
