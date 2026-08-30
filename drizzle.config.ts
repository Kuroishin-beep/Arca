import type { Config } from "drizzle-kit";

/**
 * Migrations are generated as checked-in SQL under `drizzle/`, not pushed
 * straight at the database. The object-graph schema will grow property and
 * relation tables over time (SCOPE.md §5.2) and a reviewable diff per change is
 * the only way that stays safe.
 */
export default {
  schema: "./backend/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
