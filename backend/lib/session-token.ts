import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * The session cookie's value — a user id, and proof that WE issued it.
 *
 * It used to be the bare id. `currentSession` read the cookie and trusted it,
 * and the seeded ids are hard-coded in a public repository — `u(1)` in
 * seed-data.ts is the GM — so one hand-set cookie made anyone the GM without a
 * password. The id is still in the clear (it is not a secret, and hiding it
 * would buy nothing); what changes is that a cookie now carries an HMAC over
 * that id, and a cookie whose HMAC does not verify is simply not a session.
 *
 * Kept free of `next/headers` so the whole of it is unit-testable.
 */

/** Domain separation: a MAC made for anything else can never pass as this. */
const LABEL = "arca-session-v1";

/** Below this a secret is guessable; see `sessionSecret`. */
const MIN_SECRET_LENGTH = 32;

function mac(userId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${LABEL}:${userId}`)
    .digest("base64url");
}

/** `userId.signature`. A UUID contains dashes but never a dot, so the last
 *  dot is an unambiguous separator. */
export function signSession(userId: string, secret: string): string {
  return `${userId}.${mac(userId, secret)}`;
}

/**
 * The user id a cookie vouches for, or `null` if it vouches for nothing.
 *
 * Every failure is `null` rather than a throw — a forged cookie, a tampered
 * one, one from before signing existed, and garbage are all the same state as
 * never having signed in, and none of them is an error the visitor caused.
 *
 * Compared with `timingSafeEqual`, because a byte-by-byte `===` returns sooner
 * the earlier it finds a mismatch, and that difference is measurable enough to
 * recover a signature one byte at a time.
 */
export function verifySession(
  token: string | undefined,
  secret: string,
): string | null {
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  // No dot at all is exactly the pre-signing cookie — the bare id.
  if (dot <= 0 || dot === token.length - 1) return null;

  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(userId, secret));

  // `timingSafeEqual` throws on a length mismatch; a wrong length is simply a
  // wrong signature.
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
}

const DEV_SECRET_KEY = Symbol.for("arca.session.devSecret");

/**
 * The key sessions are signed with.
 *
 * In order of preference:
 *
 *   1. `ARCA_SESSION_SECRET`, when a deployment sets one. It must be at least
 *      32 characters; a shorter one throws rather than quietly signing every
 *      session in the campaign with something guessable.
 *
 *   2. Derived from `DATABASE_URL`. That string is already a secret wherever
 *      Arca is really deployed, and — unlike a random value — it is identical
 *      across every serverless instance, so it does not sign everyone out on
 *      each cold start. It is hashed with a label rather than used directly, so
 *      the cookie key is never also the database password. The practical
 *      effect is that deploying this fix needs NO new configuration; setting
 *      (1) is still better, because rotating the database password would then
 *      no longer sign everybody out.
 *
 *   3. Random per process, with neither set — fixture mode, which is
 *      development only and forgets its data on restart anyway.
 */
export function sessionSecret(): string {
  const explicit = process.env.ARCA_SESSION_SECRET;
  if (explicit !== undefined && explicit !== "") {
    if (explicit.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `ARCA_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters. ` +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    return explicit;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return createHash("sha256")
      .update(`${LABEL}\0${databaseUrl}`)
      .digest("hex");
  }

  const g = globalThis as unknown as Record<symbol, string | undefined>;
  g[DEV_SECRET_KEY] ??= randomBytes(32).toString("hex");
  return g[DEV_SECRET_KEY];
}
