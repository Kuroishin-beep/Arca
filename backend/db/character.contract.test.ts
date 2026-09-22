import { beforeEach, describe, expect, it } from "vitest";

import { emptySheet } from "@backend/domain/character";
import type { Principal, UpdateCharacterInput } from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";

import { fixtureRepository, resetFixtureStore } from "./fixture-repository";
import {
  GM_EMAIL,
  GM_ID,
  KOVA_CONTAINER_ID,
  KOVA_EMAIL,
  KOVA_ID,
  MILO_CONTAINER_ID,
  MILO_EMAIL,
  MILO_ID,
  PARTY_WAGON_ID,
} from "./seed-data";

/**
 * The character sheet's storage contract — SCOPE.md S1.
 *
 * Written against the fixture repository because it is the one both backends
 * are checked against: the Postgres implementation is the same call sequence
 * over the same `assertCan*` helpers, and the seed exists precisely so the two
 * are comparable. What is pinned here is the behaviour, not the storage.
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

const patch = (fields: Partial<UpdateCharacterInput>): UpdateCharacterInput =>
  ({
    containerId: KOVA_CONTAINER_ID,
    ...fields,
  }) as UpdateCharacterInput;

beforeEach(() => resetFixtureStore());

describe("reading a sheet", () => {
  it("gives a player their own, seeded", async () => {
    const character = await fixtureRepository.getCharacter(
      kova,
      KOVA_CONTAINER_ID,
    );

    expect(character).not.toBeNull();
    expect(character!.sheet.attributes.AGL).toBe(16);
    // The name is the CONTAINER's name — one identity, not a second field.
    expect(character!.name).toBe("Kova");
  });

  it("gives the GM anyone's", async () => {
    const character = await fixtureRepository.getCharacter(
      gm,
      MILO_CONTAINER_ID,
    );
    expect(character!.sheet.attributes.STR).toBe(14);
  });

  /**
   * The rule that matters: a character sheet is as private as the pack it
   * hangs off, and it is the SAME check — so this cannot drift from the
   * container rules by being a second implementation of them.
   */
  it("refuses another player's", async () => {
    await expect(
      fixtureRepository.getCharacter(milo, KOVA_CONTAINER_ID),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns null for a container that is not a character", async () => {
    expect(
      await fixtureRepository.getCharacter(gm, PARTY_WAGON_ID),
    ).toBeNull();
  });
});

describe("writing a sheet", () => {
  it("lets a player edit their own", async () => {
    const result = await fixtureRepository.updateCharacter(
      kova,
      patch({ hp: 4 }),
    );
    expect(result.sheet.hp).toBe(4);
  });

  it("lets the GM edit anyone's", async () => {
    const result = await fixtureRepository.updateCharacter(gm, {
      containerId: MILO_CONTAINER_ID,
      hp: 2,
    } as UpdateCharacterInput);
    expect(result.sheet.hp).toBe(2);
  });

  it("refuses another player's", async () => {
    await expect(
      fixtureRepository.updateCharacter(milo, patch({ hp: 1 })),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  /**
   * THE reason the patch is sectioned rather than a whole-sheet save.
   *
   * Two people edit this screen at once as a matter of course — a GM marking
   * damage while the player ticks a skill. If a write carrying only `hp` also
   * rewrote `skills`, the second click of the two would silently discard the
   * first, and nobody would find out until a skill they trained was untrained
   * next session.
   */
  it("leaves every section the patch did not name alone", async () => {
    const before = (await fixtureRepository.getCharacter(
      kova,
      KOVA_CONTAINER_ID,
    ))!.sheet;

    await fixtureRepository.updateCharacter(kova, patch({ hp: 7 }));

    const after = (await fixtureRepository.getCharacter(
      kova,
      KOVA_CONTAINER_ID,
    ))!.sheet;

    expect(after.hp).toBe(7);
    expect(after.skills).toEqual(before.skills);
    expect(after.profile).toEqual(before.profile);
    expect(after.attributes).toEqual(before.attributes);
    expect(after.conditions).toEqual(before.conditions);
  });

  /**
   * Lowering CON has to bring current HP down with it. The write that caused
   * this touched `attributes` and had no reason to look at `hp` at all, which
   * is exactly why the clamp cannot live in the caller.
   */
  it("pulls current HP down when the attribute behind its maximum drops", async () => {
    const full = emptySheet().attributes;

    const result = await fixtureRepository.updateCharacter(
      kova,
      patch({ attributes: { ...full, CON: 5 } }),
    );

    expect(result.sheet.hp).toBe(5);
  });

  it("refuses to write a sheet onto a container that is not a character", async () => {
    await expect(
      fixtureRepository.updateCharacter(gm, {
        containerId: PARTY_WAGON_ID,
        hp: 3,
      } as UpdateCharacterInput),
    ).rejects.toThrow();
  });
});
