// Applies pending database migrations during a PRODUCTION deploy on Vercel,
// before `next build`, so new code never goes live against a database that
// lacks its columns. Run by the `vercel-build` script (Vercel prefers it over
// `build`; local and test builds still use plain `build` and never migrate).
//
// Production only: preview deploys skip it, so a branch's unmerged migration
// can never reach the production database through a preview that shares its
// DATABASE_URL.
//
// If a migration fails, this exits non-zero and the deploy fails — the
// previous deployment keeps serving, against an unchanged database.
import { execFileSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  process.stdout.write(`[migrate] skipped: VERCEL_ENV is ${env ?? "unset"}, not production\n`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  process.stdout.write("[migrate] skipped: no DATABASE_URL (fixture deployment)\n");
  process.exit(0);
}

process.stdout.write("[migrate] applying pending migrations from drizzle/\n");
// On Windows `npx` is a .cmd file, which only runs through a shell; Vercel
// builds on Linux, where it does not need one.
execFileSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.stdout.write("[migrate] done\n");
