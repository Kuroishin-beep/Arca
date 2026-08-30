import { defineConfig, devices } from "@playwright/test";

/**
 * E2E — SCOPE.md §4 (testing) and the phase 4 exit criterion.
 *
 * Vitest covers the permission rules and the derived-value maths, which are
 * pure functions. This covers the one thing those cannot: two browsers, one
 * campaign, and a change made in one appearing in the other. That flow crosses
 * a Server Action, Postgres or the fixture store, the realtime channel, an
 * EventSource and a re-render — the parts are all unit tested and the seam
 * between them is exactly where M8 would break.
 *
 * `next start` rather than `next dev`: dev-mode recompilation makes the two
 * second budget in M8 meaningless, and a production build is what the panel
 * actually loads.
 */
export default defineConfig({
  testDir: "./e2e",
  // Gives every run the same starting inventory. Against Postgres the data
  // outlives the run, so without this the suite drifts a little further from
  // its own assumptions each time it executes.
  globalSetup: "./e2e/global-setup.ts",
  // The realtime test drives two contexts against ONE shared server whose
  // fixture store is process-global. Running files in parallel would let one
  // test's moves land in another's inventory.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    // No DATABASE_URL: the suite runs against fixtures and the in-process
    // channel, so it needs no database to be provisioned in CI. The transport
    // is swapped by config precisely so this is possible (§10 R1).
    command: "npm run build && npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/signin",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
