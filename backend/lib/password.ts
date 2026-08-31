/**
 * Email addresses and passwords — how a member proves they are who they say.
 *
 * Sign-in is an email address and a password. The email is the identity: it is
 * what the roster is keyed by, what a comment is attributed to, and what
 * appears beside an avatar throughout the UI. The password is the secret.
 *
 * This replaced a name-picker plus a four-digit PIN. The PIN was sized for a
 * phone next to a dice tray, and it bought exactly one thing — that the public
 * roster was not also a list of seats anyone holding the link could sit down
 * in. A typed email buys that too, and a password is a real secret rather than
 * one of ten thousand, so the attempt throttle at the bottom of this file stops
 * being the whole defence and goes back to being a backstop.
 *
 * What this is still not: account recovery. There is no reset mail, because
 * there is no mail. A member who forgets their password asks the GM, who
 * clears the hash and puts them back at "choose a password" — the same state
 * they started in.
 *
 * scrypt rather than a bare hash, with the cost parameters stored in the hash
 * so they can be raised later without invalidating every password already set.
 */
import {
  randomBytes,
  type ScryptOptions,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

/**
 * Hand-written rather than `promisify`d: the promisified signature drops the
 * options overload, and the options are the entire point here — a scrypt call
 * without cost parameters is a fast hash with extra steps.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Cost parameters, stored in the hash so they can be raised without
 *  invalidating every password already set. */
const N = 16384;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/**
 * scrypt's default maxmem is 32 MB and N=16384 needs slightly more than that
 * (128 · N · r ≈ 16 MB, plus working space), so it is raised explicitly rather
 * than left to fail at verification time on the first real sign-in.
 */
const MAX_MEM = 64 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Email addresses
 * ------------------------------------------------------------------ */

/**
 * Lowercased and trimmed. Every comparison in the app goes through this, so
 * `Kova@Table.example` and `kova@table.example` are one member and not two —
 * which matters because the email is now the thing a person types from memory.
 *
 * The local part is lowercased too. That is technically lossy (RFC 5321 allows
 * a case-sensitive local part) and universally correct in practice; no provider
 * anyone at this table uses treats them as different mailboxes.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately not an RFC 5322 grammar. A validating regex for that is famous
 * for being long, wrong, and for rejecting real addresses; the only thing this
 * screen actually needs to know is that the string is shaped like an address
 * rather than like a display name someone typed out of habit.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function emailProblem(email: string): string | null {
  const normalised = normaliseEmail(email);
  if (normalised === "") return "Enter your email address.";
  if (normalised.length > 254) return "That email address is too long.";
  if (!EMAIL_PATTERN.test(normalised)) return "That is not an email address.";
  return null;
}

/* ------------------------------------------------------------------ *
 * Passwords
 * ------------------------------------------------------------------ */

/** Eight characters, which is the shortest length worth calling a password.
 *  No composition rules — they push people towards `Password1!` and buy
 *  nothing that length does not buy better. */
const MIN_LENGTH = 8;

/**
 * scrypt hashes its input in full, so there is no truncation bug to guard
 * against the way bcrypt's 72 bytes would be. The cap is here so a
 * multi-megabyte field cannot make one request spend a minute in the KDF.
 */
const MAX_LENGTH = 200;

/** The handful that get chosen first and guessed first. Not a strength meter,
 *  and not a dictionary — a list this short is honest about being a speed
 *  bump. */
const OBVIOUS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwertyui",
  "iloveyou",
  "letmein1",
  "dragonbane",
]);

/**
 * `email` is taken so the password can be checked against it. Someone whose
 * password is their own address has a secret that is written next to the lock,
 * and this is the one such case common enough to be worth naming.
 */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < MIN_LENGTH) {
    return `A password is at least ${MIN_LENGTH} characters.`;
  }
  if (password.length > MAX_LENGTH) {
    return `A password is at most ${MAX_LENGTH} characters.`;
  }
  if (OBVIOUS.has(password.toLowerCase())) return "Pick a less obvious password.";

  const normalised = normaliseEmail(email);
  if (normalised !== "") {
    const lower = password.toLowerCase();
    if (lower === normalised) return "Your password cannot be your email address.";
    const local = normalised.split("@")[0] ?? "";
    if (local.length >= MIN_LENGTH && lower === local) {
      return "Your password cannot be your email address.";
    }
  }
  return null;
}

/** `scrypt$N$r$p$salt$key`, all hex. Self-describing so a stored hash carries
 *  the parameters it was made with. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("hex"),
    key.toString("hex"),
  ].join("$");
}

/**
 * Constant-time compare against a stored hash.
 *
 * Returns false rather than throwing on a malformed record: a corrupt hash
 * means that member cannot sign in, which is the safe direction. Throwing here
 * would turn one bad row into a 500 on the sign-in screen for everyone.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, rawN, rawR, rawP, rawSalt, rawKey] = stored.split("$");
  if (scheme !== "scrypt") return false;
  if (
    rawN === undefined ||
    rawR === undefined ||
    rawP === undefined ||
    rawSalt === undefined ||
    rawKey === undefined
  ) {
    return false;
  }

  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const salt = Buffer.from(rawSalt, "hex");
  const expected = Buffer.from(rawKey, "hex");
  // `Buffer.from` does not throw on bad hex, it truncates — so the length
  // check is the validation, not a sanity assertion.
  if (salt.length !== rawSalt.length / 2) return false;
  if (expected.length !== rawKey.length / 2) return false;
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scrypt(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: MAX_MEM,
  });

  return timingSafeEqual(actual, expected);
}

/* ------------------------------------------------------------------ *
 * Attempt throttle
 * ------------------------------------------------------------------ */

/**
 * A backstop now rather than the main defence. Hashing slowly stops an attacker
 * who has stolen the table; it does nothing about one who simply keeps typing,
 * so repeated failures against the same address get progressively slower and
 * then refused outright.
 *
 * This is in-process and per-instance, which is a real limitation stated
 * plainly: on one long-lived Node server — which is how this is deployed and
 * how `npm start` runs it — it is the whole defence and it works. Spread
 * across serverless instances it degrades to one window per instance, and the
 * honest fix at that point is a shared store, not a comment claiming this is
 * enough. For a table of six on a single deployment it is.
 *
 * Keyed by the typed email, not by IP: the players are behind one household NAT
 * often enough that an IP key would lock out the table. Keying by the typed
 * address rather than by a resolved user id also means an attacker spraying
 * addresses that are not at this table gets throttled the same way, and the
 * throttle never has to look a member up to decide.
 */
const WINDOW_MS = 15 * 60 * 1000;
const FREE_ATTEMPTS = 5;
const MAX_ATTEMPTS = 10;

interface Attempts {
  count: number;
  first: number;
}

const ATTEMPTS_KEY = Symbol.for("arca.password.attempts");

function attempts(): Map<string, Attempts> {
  const g = globalThis as Record<symbol, unknown>;
  g[ATTEMPTS_KEY] ??= new Map<string, Attempts>();
  return g[ATTEMPTS_KEY] as Map<string, Attempts>;
}

function current(email: string): Attempts | null {
  const record = attempts().get(normaliseEmail(email));
  if (!record) return null;
  if (Date.now() - record.first > WINDOW_MS) {
    attempts().delete(normaliseEmail(email));
    return null;
  }
  return record;
}

/** How long this address is locked out for, in whole minutes; 0 when it is
 *  not. */
export function lockoutMinutes(email: string): number {
  const record = current(email);
  if (!record || record.count < MAX_ATTEMPTS) return 0;
  return Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - record.first)) / 60000));
}

/** Called before verifying. Sleeps once the free attempts are spent, so a
 *  script gets slower without a legitimate mistyped password ever noticing. */
export async function delayForAttempts(email: string): Promise<void> {
  const record = current(email);
  if (!record || record.count < FREE_ATTEMPTS) return;
  const over = record.count - FREE_ATTEMPTS + 1;
  await new Promise((resolve) => setTimeout(resolve, Math.min(2000, over * 400)));
}

export function recordFailure(email: string): void {
  const record = current(email);
  if (record) record.count += 1;
  else attempts().set(normaliseEmail(email), { count: 1, first: Date.now() });
}

export function clearFailures(email: string): void {
  attempts().delete(normaliseEmail(email));
}
