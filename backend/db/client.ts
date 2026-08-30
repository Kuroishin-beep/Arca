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
