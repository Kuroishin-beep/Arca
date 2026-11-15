import { beforeEach, describe, expect, it } from "vitest";

import type { Principal } from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";

import { nameClash, resolveContainerId } from "@backend/lib/container-ref";

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

describe("resolveContainerId", () => {
  const repo = fixtureRepository;

  it("finds a container by its plain name slug", async () => {
    expect(await resolveContainerId(repo, gm, "kova")).toBe(KOVA_CONTAINER_ID);
    expect(await resolveContainerId(repo, gm, "party-wagon")).toBe(PARTY_WAGON_ID);
  });

  it("still finds old links: a full id, or any name with the id's last 8 hex", async () => {
    expect(await resolveContainerId(repo, gm, KOVA_CONTAINER_ID)).toBe(KOVA_CONTAINER_ID);
    expect(await resolveContainerId(repo, gm, `kova-${KOVA_CONTAINER_ID.slice(-8)}`)).toBe(
      KOVA_CONTAINER_ID,
    );
    expect(await resolveContainerId(repo, gm, `old-name-${KOVA_CONTAINER_ID.slice(-8)}`)).toBe(
      KOVA_CONTAINER_ID,
    );
  });

  it("answers nothing for a name no container has", async () => {
    expect(await resolveContainerId(repo, gm, "no-such-place")).toBeNull();
  });
});

describe("nameClash", () => {
  it("refuses a name that would share another container's address", async () => {
    expect(await nameClash(fixtureRepository, gm, "party  wagon!")).toMatch(/already has that name/);
    expect(await nameClash(fixtureRepository, gm, "A brand new chest")).toBeNull();
  });

  it("lets a container keep its own name on rename", async () => {
    expect(await nameClash(fixtureRepository, gm, "Party Wagon", PARTY_WAGON_ID)).toBeNull();
  });
});

describe("renaming keeps old links working", () => {
  it("resolves a container's former name after a rename", async () => {
    await fixtureRepository.updateContainer(gm, {
      id: PARTY_WAGON_ID,
      name: "The Big Cart",
    } as Parameters<typeof fixtureRepository.updateContainer>[1]);

    expect(await resolveContainerId(fixtureRepository, gm, "the-big-cart")).toBe(PARTY_WAGON_ID);
    expect(await resolveContainerId(fixtureRepository, gm, "party-wagon")).toBe(PARTY_WAGON_ID);
  });
});
