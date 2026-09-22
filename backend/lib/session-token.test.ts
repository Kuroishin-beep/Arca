import { afterEach, describe, expect, it } from "vitest";

import { sessionSecret, signSession, verifySession } from "./session-token";

/**
 * The session cookie — and the hole it used to be.
 *
 * Until this module existed, the cookie WAS the user id: `currentSession` read
 * `arca_user` and trusted it. Seeded ids are hard-coded in a public repository
 * (`u(1)` in seed-data.ts is the GM), so setting one cookie by hand made anyone
 * the GM with no password at all. Verified against the running app with curl
 * before the fix; the test named "the exploit" below is that request, pinned.
 */

const SECRET = "a".repeat(48);
const GM = "00000000-0000-4000-8000-000000000101";
const PLAYER = "00000000-0000-4000-8000-000000000102";

describe("signing and verifying", () => {
  it("round-trips a user id", () => {
    expect(verifySession(signSession(GM, SECRET), SECRET)).toBe(GM);
  });

  /** ── The exploit ─────────────────────────────────────────────────────
   *  Exactly the cookie that took the GM seat: a bare user id, no signature. */
  it("rejects a bare user id, which is what the old cookie was", () => {
    expect(verifySession(GM, SECRET)).toBeNull();
  });

  it("rejects a signature lifted onto a different user", () => {
    // A player's legitimately-issued cookie, with the GM's id swapped in. If
    // the signature did not cover the id, every player could promote
    // themselves.
    const playerToken = signSession(PLAYER, SECRET);
    const signature = playerToken.slice(playerToken.lastIndexOf(".") + 1);
    expect(verifySession(`${GM}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    expect(verifySession(signSession(GM, "b".repeat(48)), SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signSession(GM, SECRET);
    const last = token.at(-1) === "A" ? "B" : "A";
    expect(verifySession(`${token.slice(0, -1)}${last}`, SECRET)).toBeNull();
  });

  it("treats missing and malformed cookies as signed out, never as an error", () => {
    for (const garbage of [undefined, "", ".", `${GM}.`, `.${"x".repeat(43)}`, "not-a-token"]) {
      expect(verifySession(garbage, SECRET)).toBeNull();
    }
  });
});

describe("the secret", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("uses ARCA_SESSION_SECRET when it is set", () => {
    process.env.ARCA_SESSION_SECRET = SECRET;
    expect(sessionSecret()).toBe(SECRET);
  });

  /**
   * A short secret is an operator's choice, and a weak one. Failing loudly on
   * it beats signing every session in the campaign with something guessable.
   */
  it("refuses a secret too short to be one", () => {
    process.env.ARCA_SESSION_SECRET = "hunter2";
    expect(() => sessionSecret()).toThrow(/at least/i);
  });

  /**
   * Without an explicit secret it is derived from DATABASE_URL — already a
   * secret in any real deployment, and stable across serverless instances,
   * which a per-process random value would not be: every cold start would sign
   * everybody out.
   */
  it("derives a stable secret from DATABASE_URL when none is set", () => {
    delete process.env.ARCA_SESSION_SECRET;
    process.env.DATABASE_URL = "postgresql://arca:s3cret@db.example:5432/arca";
    const first = sessionSecret();
    expect(sessionSecret()).toBe(first);
    // And never the connection string itself — a leaked cookie secret must
    // not also be the database password.
    expect(first).not.toContain("s3cret");

    process.env.DATABASE_URL = "postgresql://arca:other@db.example:5432/arca";
    expect(sessionSecret()).not.toBe(first);
  });
});
