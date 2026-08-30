/**
 * PINs — how a member proves they are the person they picked.
 *
 * The campaign signs in by choosing a name from the table's roster. That alone
 * is a list of names and a click, so the PIN is what stops anyone holding the
 * link from sitting down as the GM. It is deliberately a PIN and not a
 * password: six people at one table, on a shared link, typing it on a phone
 * next to a dice tray.
 *
 * What that buys, and what it does not:
 *
 *   - It gates the GM seat and each player's own pack behind a secret only
 *     they know. That is the threat this app actually has.
 *   - It is NOT protection against someone who can guess four digits with
 *     unlimited tries. `RATE` below is the answer to that, and it is a
 *     deliberately blunt one — see the note there.
 *
 * scrypt rather than a bare hash because a four-digit PIN has ten thousand
 * possibilities: anything fast enough to verify cheaply is fast enough to
 * enumerate the whole space offline. The cost parameters below are the Node
 * defaults raised to the point where one verification is a few tens of
 * milliseconds on the machines this runs on.
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
 *  invalidating every PIN already set. */
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

/** Four to eight digits. Digits only, because this is typed one-handed on a
 *  phone during someone else's turn. */
const PIN_PATTERN = /^\d{4,8}$/;

export function pinProblem(pin: string): string | null {
  if (!PIN_PATTERN.test(pin)) return "A PIN is 4 to 8 digits.";
  // Not a strength meter — just the two that get typed by accident and then
  // guessed first by anyone who tries.
  if (/^(\d)\1*$/.test(pin)) return "Pick a PIN that is not all the same digit.";
  if (pin === "1234" || pin === "12345678") return "Pick a less obvious PIN.";
  return null;
}

/** `scrypt$N$r$p$salt$key`, all hex. Self-describing so a stored hash carries
 *  the parameters it was made with. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(pin, salt, KEY_BYTES, {
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
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
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

  const actual = await scrypt(pin, salt, expected.length, {
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
 * Ten thousand PINs is not many. Hashing slowly stops an attacker who has
 * stolen the table, but it does nothing about one who simply keeps typing, so
 * repeated failures against the same member get progressively slower and then
 * refused outright.
 *
 * This is in-process and per-instance, which is a real limitation stated
 * plainly: on one long-lived Node server — which is how this is deployed and
 * how `npm start` runs it — it is the whole defence and it works. Spread
 * across serverless instances it degrades to one window per instance, and the
 * honest fix at that point is a shared store, not a comment claiming this is
 * enough. For a table of six on a single deployment it is.
 *
 * Keyed by member, not by IP: the players are behind one household NAT often
 * enough that an IP key would lock out the table, and it is the GM seat that
 * needs guarding rather than the network.
 */
const WINDOW_MS = 15 * 60 * 1000;
const FREE_ATTEMPTS = 5;
const MAX_ATTEMPTS = 10;

interface Attempts {
  count: number;
  first: number;
}

const ATTEMPTS_KEY = Symbol.for("arca.pin.attempts");

function attempts(): Map<string, Attempts> {
  const g = globalThis as Record<symbol, unknown>;
  g[ATTEMPTS_KEY] ??= new Map<string, Attempts>();
  return g[ATTEMPTS_KEY] as Map<string, Attempts>;
}

function current(userId: string): Attempts | null {
  const record = attempts().get(userId);
  if (!record) return null;
  if (Date.now() - record.first > WINDOW_MS) {
    attempts().delete(userId);
    return null;
  }
  return record;
}

/** How long this member is locked out for, in whole minutes; 0 when they are
 *  not. */
export function lockoutMinutes(userId: string): number {
  const record = current(userId);
  if (!record || record.count < MAX_ATTEMPTS) return 0;
  return Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - record.first)) / 60000));
}

/** Called before verifying. Sleeps once the free attempts are spent, so a
 *  script gets slower without a legitimate mistyped PIN ever noticing. */
export async function delayForAttempts(userId: string): Promise<void> {
  const record = current(userId);
  if (!record || record.count < FREE_ATTEMPTS) return;
  const over = record.count - FREE_ATTEMPTS + 1;
  await new Promise((resolve) => setTimeout(resolve, Math.min(2000, over * 400)));
}

export function recordFailure(userId: string): void {
  const record = current(userId);
  if (record) record.count += 1;
  else attempts().set(userId, { count: 1, first: Date.now() });
}

export function clearFailures(userId: string): void {
  attempts().delete(userId);
}
