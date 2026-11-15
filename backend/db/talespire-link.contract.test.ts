import { beforeEach, describe, expect, it } from "vitest";

import type { Principal } from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";

import { fixtureRepository as repo, resetFixtureStore } from "./fixture-repository";
import { CAMPAIGN_ID, GM_EMAIL, GM_ID, KOVA_EMAIL, KOVA_ID } from "./seed-data";

/** Linking an Arca campaign to the TaleSpire campaign it is played in. */

const gm: Principal = {
  userId: GM_ID as Principal["userId"],
  displayName: "Ravna",
  email: GM_EMAIL,
  role: "gm",
  campaignId: CAMPAIGN_ID,
};
const kova: Principal = {
  userId: KOVA_ID as Principal["userId"],
  displayName: "Kova",
  email: KOVA_EMAIL,
  role: "player",
  campaignId: CAMPAIGN_ID,
};

beforeEach(() => resetFixtureStore());

describe("TaleSpire campaign links", () => {
  it("starts unlinked", async () => {
    expect(await repo.taleSpireLinkOf(gm)).toBeNull();
    expect(await repo.campaignForTaleSpire(KOVA_ID, "ts-westmarch")).toBeNull();
  });

  it("lets the GM link, and then leads every member there", async () => {
    await repo.linkTaleSpireCampaign(gm, "ts-westmarch");
    expect(await repo.taleSpireLinkOf(gm)).toBe("ts-westmarch");
    expect(await repo.campaignForTaleSpire(KOVA_ID, "ts-westmarch")).toBe(CAMPAIGN_ID);
  });

  it("refuses a player", async () => {
    await expect(repo.linkTaleSpireCampaign(kova, "ts-westmarch")).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("never leads someone to a campaign they are not in", async () => {
    await repo.linkTaleSpireCampaign(gm, "ts-westmarch");
    expect(
      await repo.campaignForTaleSpire("00000000-0000-4000-8000-0000000000ff", "ts-westmarch"),
    ).toBeNull();
  });
});
