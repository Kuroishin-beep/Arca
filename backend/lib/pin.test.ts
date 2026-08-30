import { beforeEach, describe, expect, it } from "vitest";

import { fixtureRepository, resetFixtureStore } from "@backend/db/fixture-repository";
import { GM_ID, KOVA_ID } from "@backend/db/seed-data";
import { clearFailures, hashPin, pinProblem, verifyPin } from "@backend/lib/pin";

/**
 * The PIN is the whole of Arca's access control — the roster is public to
 * anyone holding the link, so what stops someone sitting down as the GM is
 * this and nothing else. These tests are about that, not about the hash
 * function being a hash function.
 */
describe("pin rules", () => {
  it("accepts 4 to 8 digits", () => {
    expect(pinProblem("4821")).toBeNull();
    expect(pinProblem("90210")).toBeNull();
    expect(pinProblem("52739184")).toBeNull();
  });

  it("rejects anything that is not 4 to 8 digits", () => {
    expect(pinProblem("123")).not.toBeNull();
    expect(pinProblem("123456789")).not.toBeNull();
    expect(pinProblem("12a4")).not.toBeNull();
    expect(pinProblem("")).not.toBeNull();
    // Whitespace is not a digit, and a PIN that round-trips through a form
    // field is exactly where a stray space arrives.
    expect(pinProblem("12 34")).not.toBeNull();
  });

  it("rejects the two that get chosen by accident", () => {
    expect(pinProblem("1111")).not.toBeNull();
    expect(pinProblem("1234")).not.toBeNull();
  });
});

describe("hashing", () => {
  it("verifies the PIN it was made from", async () => {
    const hash = await hashPin("4821");
    await expect(verifyPin("4821", hash)).resolves.toBe(true);
  });

  it("rejects a different PIN", async () => {
    const hash = await hashPin("4821");
    await expect(verifyPin("4822", hash)).resolves.toBe(false);
  });

  /** Salted: the same PIN twice must not produce the same record, or the
   *  stored column tells you which members share a PIN. */
  it("produces a different hash for the same PIN", async () => {
    const a = await hashPin("4821");
    const b = await hashPin("4821");
    expect(a).not.toBe(b);
    await expect(verifyPin("4821", b)).resolves.toBe(true);
  });

  /** A corrupt row must close that one member's door, not throw on a screen
   *  that renders before anyone is authenticated. */
  it("returns false for a malformed record instead of throwing", async () => {
    await expect(verifyPin("4821", "")).resolves.toBe(false);
    await expect(verifyPin("4821", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPin("4821", "scrypt$16384$8$1$$")).resolves.toBe(false);
    await expect(verifyPin("4821", "bcrypt$16384$8$1$aa$bb")).resolves.toBe(false);
    // Non-hex where hex is expected: Buffer.from truncates rather than
    // throwing, so this is the case the length check exists for.
    await expect(verifyPin("4821", "scrypt$16384$8$1$zzzz$zzzz")).resolves.toBe(
      false,
    );
  });
});

describe("enrolment and sign-in", () => {
  beforeEach(() => {
    resetFixtureStore();
    clearFailures(KOVA_ID);
    clearFailures(GM_ID);
  });

  it("starts every member unenrolled", async () => {
    const members = await fixtureRepository.listMembers();
    expect(members.every((m) => !m.hasPin)).toBe(true);
  });

  it("never exposes the hash on a member", async () => {
    await fixtureRepository.enrolMemberPin(KOVA_ID, "4821");
    const members = await fixtureRepository.listMembers();
    for (const member of members) {
      expect(Object.keys(member)).not.toContain("pinHash");
    }
  });

  it("signs in with the PIN just chosen", async () => {
    await fixtureRepository.enrolMemberPin(KOVA_ID, "4821");
    const principal = await fixtureRepository.authenticateMember(KOVA_ID, "4821");
    expect(principal?.userId).toBe(KOVA_ID);
    expect(principal?.role).toBe("player");
  });

  it("marks a member enrolled once they have chosen", async () => {
    await fixtureRepository.enrolMemberPin(KOVA_ID, "4821");
    const members = await fixtureRepository.listMembers();
    expect(members.find((m) => m.userId === KOVA_ID)?.hasPin).toBe(true);
  });

  /**
   * The rule that makes self-enrolment safe: the window is "before that
   * member first signs in", not "any time". Without it, anyone holding the
   * link could overwrite the GM PIN and take the seat.
   */
  it("refuses to re-enrol a member who already has a PIN", async () => {
    await fixtureRepository.enrolMemberPin(GM_ID, "4821");

    await expect(
      fixtureRepository.enrolMemberPin(GM_ID, "9999"),
    ).resolves.toBeNull();

    // The original still works, so the second attempt changed nothing.
    await expect(
      fixtureRepository.authenticateMember(GM_ID, "4821"),
    ).resolves.not.toBeNull();
    await expect(
      fixtureRepository.authenticateMember(GM_ID, "9999"),
    ).resolves.toBeNull();
  });

  it("refuses a wrong PIN", async () => {
    await fixtureRepository.enrolMemberPin(KOVA_ID, "4821");
    await expect(
      fixtureRepository.authenticateMember(KOVA_ID, "0000"),
    ).resolves.toBeNull();
  });

  /** Unenrolled and wrong-PIN answer identically, so the response cannot be
   *  used to find out which names are still unclaimed. */
  it("refuses a member who has not enrolled", async () => {
    await expect(
      fixtureRepository.authenticateMember(KOVA_ID, "4821"),
    ).resolves.toBeNull();
  });

  it("refuses an unknown member", async () => {
    await expect(
      fixtureRepository.authenticateMember("not-a-member", "4821"),
    ).resolves.toBeNull();
  });
});
