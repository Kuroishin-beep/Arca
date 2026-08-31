import { beforeEach, describe, expect, it } from "vitest";

import {
  fixtureRepository,
  resetFixtureStore,
} from "@backend/db/fixture-repository";
import { GM_EMAIL, GM_ID, KOVA_EMAIL, KOVA_ID } from "@backend/db/seed-data";
import type { Principal } from "@backend/domain/view";
import { clearFailures } from "@backend/lib/password";
import { PermissionError } from "@backend/lib/permissions";

/**
 * Two doors into the roster, and they are not the same door.
 *
 * `registerMember` is open to anyone with the link and can only ever produce a
 * player. `addMember` is the GM's and can produce either. The tests that matter
 * most here are the ones asserting that the first cannot be talked into doing
 * the second's job.
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

const repo = fixtureRepository;

beforeEach(() => {
  resetFixtureStore();
  clearFailures("newcomer@elsewhere.example");
});

describe("self-signup", () => {
  it("creates an account that can sign in immediately", async () => {
    const principal = await repo.registerMember({
      displayName: "Sera",
      email: "newcomer@elsewhere.example",
      password: "brass-lantern",
    });

    expect(principal?.displayName).toBe("Sera");
    // The password is set here, not on a later first sign-in: the person is
    // present and typing, so leaving an enrolment window open buys nothing.
    await expect(
      repo.authenticateMember("newcomer@elsewhere.example", "brass-lantern"),
    ).resolves.not.toBeNull();
  });

  /**
   * THE test on this path. `SignUpInput` has no role field, so this is
   * asserting the repository does not read one even if a caller invents it.
   */
  it("can only ever mint a player", async () => {
    const principal = await repo.registerMember({
      displayName: "Sera",
      email: "newcomer@elsewhere.example",
      password: "brass-lantern",
      // Not part of the type. Present here precisely because a hand-built
      // FormData could carry it.
      ...({ role: "gm" } as Record<string, unknown>),
    });

    expect(principal?.role).toBe("player");

    const members = await repo.listMembers();
    expect(members.find((m) => m.userId === principal!.userId)?.role).toBe(
      "player",
    );
  });

  it("normalises the address, so one person cannot become two", async () => {
    await repo.registerMember({
      displayName: "Sera",
      email: "  NewComer@Elsewhere.Example ",
      password: "brass-lantern",
    });

    await expect(
      repo.authenticateMember("newcomer@elsewhere.example", "brass-lantern"),
    ).resolves.not.toBeNull();
  });

  it("refuses an address that is already taken", async () => {
    await expect(
      repo.registerMember({
        displayName: "Not Kova",
        email: KOVA_EMAIL,
        password: "brass-lantern",
      }),
    ).resolves.toBeNull();
  });

  /**
   * The seat-stealing case. A member the GM added has no password yet, and if
   * sign-up could register over that row, guessing an invited address would be
   * a way to claim someone else's seat — including a GM's.
   */
  it("cannot register over a member who has not signed in yet", async () => {
    await repo.addMember(gm, {
      displayName: "Sera",
      email: "newcomer@elsewhere.example",
      role: "gm",
    });

    await expect(
      repo.registerMember({
        displayName: "Not Sera",
        email: "newcomer@elsewhere.example",
        password: "brass-lantern",
      }),
    ).resolves.toBeNull();

    // Still a GM, still unenrolled, still theirs to claim.
    const members = await repo.listMembers();
    const seat = members.find((m) => m.email === "newcomer@elsewhere.example");
    expect(seat?.role).toBe("gm");
    expect(seat?.hasPassword).toBe(false);
  });
});

describe("the GM adding a member", () => {
  it("adds them unenrolled, so no secret travels through the group chat", async () => {
    const member = await repo.addMember(gm, {
      displayName: "Sera",
      email: "newcomer@elsewhere.example",
      role: "player",
    });

    expect(member?.hasPassword).toBe(false);

    // They choose it themselves on first sign-in.
    await expect(
      repo.enrolMemberPassword("newcomer@elsewhere.example", "brass-lantern"),
    ).resolves.not.toBeNull();
  });

  it("may seat a GM, which self-signup may not", async () => {
    const member = await repo.addMember(gm, {
      displayName: "Sera",
      email: "newcomer@elsewhere.example",
      role: "gm",
    });
    expect(member?.role).toBe("gm");
  });

  it("refuses a player", async () => {
    await expect(
      repo.addMember(kova, {
        displayName: "Sera",
        email: "newcomer@elsewhere.example",
        role: "gm",
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses an address already at the table", async () => {
    await expect(
      repo.addMember(gm, {
        displayName: "Not Kova",
        email: KOVA_EMAIL,
        role: "player",
      }),
    ).resolves.toBeNull();
  });
});

describe("resetting a password", () => {
  it("puts the member back at choose-a-password", async () => {
    await repo.enrolMemberPassword(KOVA_EMAIL, "brass-lantern");
    await repo.resetMemberPassword(gm, KOVA_ID);

    const members = await repo.listMembers();
    expect(members.find((m) => m.userId === KOVA_ID)?.hasPassword).toBe(false);

    // The old one is genuinely gone, not merely hidden.
    await expect(
      repo.authenticateMember(KOVA_EMAIL, "brass-lantern"),
    ).resolves.toBeNull();
    // And enrolment is open again, which is what "reset" has to mean when
    // there is no reset mail.
    await expect(
      repo.enrolMemberPassword(KOVA_EMAIL, "iron-lantern"),
    ).resolves.not.toBeNull();
  });

  it("refuses a player", async () => {
    await expect(
      repo.resetMemberPassword(kova, GM_ID),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
