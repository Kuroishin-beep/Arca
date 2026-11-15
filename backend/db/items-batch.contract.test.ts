import { beforeEach, describe, expect, it } from "vitest";

import type { Principal } from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";

import { fixtureRepository, resetFixtureStore } from "./fixture-repository";
import {
  GM_EMAIL,
  GM_ID,
  KOVA_CONTAINER_ID,
  KOVA_EMAIL,
  KOVA_ID,
  MILO_CONTAINER_ID,
  PARTY_WAGON_ID,
} from "./seed-data";

/**
 * `listItemsIn` — the batched `listItems` that keeps cross-container views
 * (the Databases sidebar) to one round trip. It has to be exactly `listItems`
 * run once per id: same items, same gate.
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

beforeEach(() => resetFixtureStore());

describe("listItemsIn", () => {
  it("returns what listItems returns, for every id asked for", async () => {
    const ids = [KOVA_CONTAINER_ID, PARTY_WAGON_ID];
    const batch = await fixtureRepository.listItemsIn(gm, ids);

    expect([...batch.keys()]).toEqual(ids);
    for (const id of ids) {
      expect(batch.get(id)).toEqual(await fixtureRepository.listItems(gm, id));
    }
  });

  it("answers an empty request with an empty map", async () => {
    expect((await fixtureRepository.listItemsIn(gm, [])).size).toBe(0);
  });

  it("refuses the whole batch when any container is unreadable", async () => {
    await expect(
      fixtureRepository.listItemsIn(kova, [KOVA_CONTAINER_ID, MILO_CONTAINER_ID]),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
