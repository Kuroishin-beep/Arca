import { execFileSync } from "node:child_process";

/**
 * Reset the database before the suite runs.
 *
 * Against fixtures this is unnecessary — the in-memory store is rebuilt when
 * the server starts. Against Postgres it is essential: the data survives the
 * run, so the second execution starts from wherever the first one left its
 * items, and a test that moves "the first row" is then moving something
 * different every time. That is not a flaky test, it is a test with no fixed
 * starting state, and it fails eventually by construction.
 *
 * The guard matters more than the reset. `npm run db:seed` DELETES the campaign
 * and rebuilds it, so pointing this at a real deployment would destroy a
 * table's inventory. It therefore refuses to run against any host that is not
 * loopback, and says why rather than seeding something it should not.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export default function globalSetup(): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.log("[e2e] no DATABASE_URL — running against fixtures.");
    return;
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("[e2e] DATABASE_URL is set but is not a valid URL.");
  }

  if (!LOOPBACK.has(host)) {
    throw new Error(
      `[e2e] refusing to seed a non-local database (host: ${host}).\n` +
        "This suite resets the campaign, which would delete real inventory.\n" +
        "Point DATABASE_URL at the local docker compose database, or unset it " +
        "to run against fixtures.",
    );
  }

  console.log(`[e2e] reseeding ${host} for a known starting state…`);
  execFileSync("npm", ["run", "db:seed"], {
    stdio: "inherit",
    shell: true,
  });
}
