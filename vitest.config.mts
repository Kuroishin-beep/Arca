import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Unit tests live beside the code they cover, which is all in `backend/`:
    // permission rules, derived-value maths, the dice parser, the repository
    // contract. `frontend/` is covered by the Playwright suite in `e2e/`
    // instead — those need a browser, and this config runs in node.
    include: ["backend/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@backend": fileURLToPath(new URL("./backend", import.meta.url)),
      "@frontend": fileURLToPath(new URL("./frontend", import.meta.url)),
    },
  },
});
