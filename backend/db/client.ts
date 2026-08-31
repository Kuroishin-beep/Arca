/**
 * The Drizzle client.
 *
 * Vercel functions are stateless and short-lived, so the connection pool is
 * kept small and cached on `globalThis` — a fresh pool per invocation is how a
 * serverless app exhausts a Postgres connection limit with six users at the
 * table.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const CLIENT_KEY = Symbol.for("arca.postgres.client");

type Cached = {
  sql: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

function connect(): Cached {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Unset it to run against fixtures, or set it to a Postgres connection string.",
    );
  }
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    // Vercel Postgres and Neon both require TLS; a local docker Postgres does
    // not, so this follows the URL rather than being forced on.
    prepare: false,
  });
  return { sql, db: drizzle(sql, { schema }) };
}

function cached(): Cached {
  const g = globalThis as unknown as Record<symbol, Cached | undefined>;
  let c = g[CLIENT_KEY];
  if (!c) {
    c = connect();
    g[CLIENT_KEY] = c;
  }
  return c;
}

export function db() {
  return cached().db;
}

export function rawSql() {
  return cached().sql;
}

export { schema };

/* ------------------------------------------------------------------ *
 * Diagnosis
 * ------------------------------------------------------------------ */

/**
 * Turn a driver error into a sentence someone can act on.
 *
 * This exists because of what the failure looked like without it: pointing
 * `DATABASE_URL` at a database that is not running produced a 500 whose only
 * content was the generated SQL of whatever query happened to run first. That
 * says nothing about the actual problem — the server is down — and it says it
 * on the sign-in screen, which is where somebody meets this app for the first
 * time.
 *
 * The four cases below are the four that actually happen while developing, in
 * the order they happen: nothing listening, wrong credentials, no such
 * database, migrations not run.
 */
export function describeDatabaseError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";

  switch (code) {
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EHOSTUNREACH":
    case "ETIMEDOUT":
    case "CONNECT_TIMEOUT":
      return "The database is not reachable. Start it with `docker compose up -d`, or unset DATABASE_URL to run against in-memory fixtures.";
    case "28P01":
    case "28000":
      return "The database refused those credentials. Check the user and password in DATABASE_URL.";
    case "3D000":
      return "That database does not exist yet. `docker compose up -d` creates it, then run `npm run db:migrate`.";
    case "42P01":
      // The tables are missing, which on a fresh database means exactly one
      // thing and is worth naming rather than describing.
      return "The database is reachable but has no tables. Run `npm run db:migrate` and then `npm run db:seed`.";
    default:
      return "The database returned an error. See the server log for the query.";
  }
}

/**
 * Is storage actually usable right now?
 *
 * `select 1` rather than a real query: it touches no table, so it separates
 * "the server is down" from "the migrations have not run", and both answers are
 * useful on their own.
 *
 * Returns a reason instead of throwing, because the caller is a screen that
 * wants to RENDER the problem rather than become it.
 */
export async function storageProblem(): Promise<string | null> {
  try {
    await rawSql()`select 1`;
    return null;
  } catch (error) {
    return describeDatabaseError(error);
  }
}
