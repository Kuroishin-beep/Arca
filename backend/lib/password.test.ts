import { beforeEach, describe, expect, it } from "vitest";

import { fixtureRepository, resetFixtureStore } from "@backend/db/fixture-repository";
import { GM_EMAIL, KOVA_EMAIL, KOVA_ID } from "@backend/db/seed-data";
import {
  clearFailures,
  emailProblem,
  hashPassword,
  normaliseEmail,
  passwordProblem,
  verifyPassword,
} from "@backend/lib/password";

/**
 * The password is the whole of Arca's access control — anyone holding the link
 * reaches the sign-in form, so what stops them sitting down as the GM is this
 * and nothing else. These tests are about that, not about the hash function
 * being a hash function.
 */
describe("email normalisation", () => {
  it("lowercases and trims, so one person is one member", () => {
    expect(normaliseEmail("  Kova@Ravenholt.Example ")).toBe(
      "kova@ravenholt.example",
    );
  });

  it("accepts an ordinary address", () => {
    expect(emailProblem("kova@ravenholt.example")).toBeNull();
    expect(emailProblem("k.ova+arca@sub.ravenholt.example")).toBeNull();
  });

  it("rejects what is not shaped like an address", () => {
    expect(emailProblem("")).not.toBeNull();
    expect(emailProblem("   ")).not.toBeNull();
    expect(emailProblem("Kova")).not.toBeNull();
    expect(emailProblem("kova@ravenholt")).not.toBeNull();
    expect(emailProblem("kova @ravenholt.example")).not.toBeNull();
    expect(emailProblem(`${"a".repeat(250)}@b.example`)).not.toBeNull();
  });
});

describe("password rules", () => {
  it("accepts eight characters or more", () => {
    expect(passwordProblem("brass-lantern")).toBeNull();
    expect(passwordProblem("8charact")).toBeNull();
  });

  it("rejects anything shorter than eight", () => {
    expect(passwordProblem("7chars.")).not.toBeNull();
    expect(passwordProblem("")).not.toBeNull();
  });

  it("rejects the handful that get guessed first", () => {
    expect(passwordProblem("password")).not.toBeNull();
    expect(passwordProblem("PASSWORD123")).not.toBeNull();
    expect(passwordProblem("12345678")).not.toBeNull();
  });

  /** A secret written next to the lock. This is the one such case common
   *  enough to be worth naming. */
  it("rejects the member's own address", () => {
    expect(
      passwordProblem("kova@ravenholt.example", "Kova@Ravenholt.example"),
    ).not.toBeNull();
    expect(passwordProblem("ravenholt", "ravenholt@table.example")).not.toBeNull();
  });

  it("caps the length, so one request cannot sit in the KDF", () => {
    expect(passwordProblem("x".repeat(201))).not.toBeNull();
  });
});

describe("hashing", () => {
  it("round-trips", async () => {
    const stored = await hashPassword("brass-lantern");
    await expect(verifyPassword("brass-lantern", stored)).resolves.toBe(true);
    await expect(verifyPassword("brass-lanterm", stored)).resolves.toBe(false);
  });

  it("salts, so two members with one password have two hashes", async () => {
    const a = await hashPassword("brass-lantern");
    const b = await hashPassword("brass-lantern");
    expect(a).not.toBe(b);
  });

  /** A corrupt row means that member cannot sign in, which is the safe
   *  direction. Throwing would turn one bad row into a 500 on the sign-in
   *  screen for everyone. */
  it("returns false rather than throwing on a malformed record", async () => {
    await expect(verifyPassword("brass-lantern", "")).resolves.toBe(false);
    await expect(verifyPassword("brass-lantern", "not-a-hash")).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword("brass-lantern", "scrypt$16384$8$1$$"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("brass-lantern", "bcrypt$16384$8$1$aa$bb"),
    ).resolves.toBe(false);
    // Non-hex where hex is expected: Buffer.from truncates rather than
    // throwing, so this is the case the length check exists for.
    await expect(
      verifyPassword("brass-lantern", "scrypt$16384$8$1$zzzz$zzzz"),
    ).resolves.toBe(false);
  });
});

describe("enrolment and sign-in", () => {
  beforeEach(() => {
    resetFixtureStore();
    clearFailures(KOVA_EMAIL);
    clearFailures(GM_EMAIL);
  });

  it("starts every member unenrolled", async () => {
    const members = await fixtureRepository.listMembers();
    expect(members.every((m) => !m.hasPassword)).toBe(true);
  });

  it("never exposes the hash on a member", async () => {
    await fixtureRepository.enrolMemberPassword(KOVA_EMAIL, "brass-lantern");
    const members = await fixtureRepository.listMembers();
    for (const member of members) {
      expect(Object.keys(member)).not.toContain("passwordHash");
    }
  });

  it("signs in with the password just chosen", async () => {
    await fixtureRepository.enrolMemberPassword(KOVA_EMAIL, "brass-lantern");
    const principal = await fixtureRepository.authenticateMember(
      KOVA_EMAIL,
      "brass-lantern",
    );
    expect(principal?.userId).toBe(KOVA_ID);
    expect(principal?.email).toBe(KOVA_EMAIL);
    expect(principal?.role).toBe("player");
  });

  /** The address is typed from memory, so the one thing it must not be is
   *  case-sensitive. */
  it("signs in regardless of how the address was typed", async () => {
    await fixtureRepository.enrolMemberPassword(KOVA_EMAIL, "brass-lantern");
    await expect(
      fixtureRepository.authenticateMember(
        "  Kova@Ravenholt.Example  ",
        "brass-lantern",
      ),
    ).resolves.not.toBeNull();
  });

  it("marks a member enrolled once they have chosen", async () => {
    await fixtureRepository.enrolMemberPassword(KOVA_EMAIL, "brass-lantern");
    const members = await fixtureRepository.listMembers();
    expect(members.find((m) => m.userId === KOVA_ID)?.hasPassword).toBe(true);
  });

  /**
   * The rule that makes self-enrolment safe: the window is "before that
   * member first signs in", not "any time". Without it, anyone holding the
   * link could overwrite the GM password and take the seat.
   */
  it("refuses to re-enrol a member who already has a password", async () => {
    await fixtureRepository.enrolMemberPassword(GM_EMAIL, "brass-lantern");

    await expect(
      fixtureRepository.enrolMemberPassword(GM_EMAIL, "iron-lantern"),
    ).resolves.toBeNull();

    // The original still works, so the second attempt changed nothing.
    await expect(
      fixtureRepository.authenticateMember(GM_EMAIL, "brass-lantern"),
    ).resolves.not.toBeNull();
    await expect(
      fixtureRepository.authenticateMember(GM_EMAIL, "iron-lantern"),
    ).resolves.toBeNull();
  });

  it("refuses a wrong password", async () => {
    await fixtureRepository.enrolMemberPassword(KOVA_EMAIL, "brass-lantern");
    await expect(
      fixtureRepository.authenticateMember(KOVA_EMAIL, "iron-lantern"),
    ).resolves.toBeNull();
  });

  /** Unenrolled, wrong-password and not-at-this-table answer identically, so
   *  the response cannot be used to find out who is at the table. */
  it("refuses a member who has not enrolled", async () => {
    await expect(
      fixtureRepository.authenticateMember(KOVA_EMAIL, "brass-lantern"),
    ).resolves.toBeNull();
  });

  it("refuses an unknown address", async () => {
    await expect(
      fixtureRepository.authenticateMember("nobody@elsewhere.example", "brass-lantern"),
    ).resolves.toBeNull();
    await expect(
      fixtureRepository.enrolMemberPassword("nobody@elsewhere.example", "brass-lantern"),
    ).resolves.toBeNull();
  });
});
