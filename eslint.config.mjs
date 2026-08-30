import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

/**
 * Lint rules.
 *
 * `npm run typecheck` already proves the types; this is for the things a type
 * checker cannot see — a hook with a missing dependency, an `await` that was
 * forgotten, a Server Action's promise dropped on the floor. The type-aware
 * rules are the point, so the project's tsconfig is wired in below rather than
 * running the cheap syntactic subset.
 *
 * The `backend/` boundary is enforced here too. Nothing under `backend/` may
 * import from `frontend/`: the split is meant to be a real direction of
 * dependency, and without a rule it degrades into two folders that import each
 * other freely.
 */
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "mockups/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },

  js.configs.recommended,

  /* Next's rules first. It registers its own parser, so the TypeScript block
     below has to come after AND name its parser explicitly — otherwise the
     type-aware rules find no type information and every one of them throws. */
  ...next,

  /* Config files are plain JS and are not in tsconfig, so type-aware linting
     cannot work on them and would fail on the config that defines it. */
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* Unused code is a review distraction, but an argument named `_` is
         often deliberate — a signature being honoured, not dead code. */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],

      /* The one that matters most here. Every mutation in this app is an async
         Server Action, and a dropped promise is a write that silently did not
         happen — the exact failure that reads as "the app lost my loot". */
      "@typescript-eslint/no-floating-promises": "error",

      /* `require-await` is deliberately OFF. It flags an `async` method with no
         `await` inside, which here is not a mistake but interface conformance:
         `RealtimeTransport.publish` returns a promise because the Postgres
         implementation must, so the in-process one is async too even though it
         has nothing to wait for. Next's own `headers()` signature is the same
         shape. The failure it guards against — a promise nobody waits on — is
         already caught by `no-floating-promises` above, from the calling side,
         where it is actually a bug. */
      "@typescript-eslint/require-await": "off",

      /* `any` defeats the branded ids the domain model relies on. */
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    files: ["backend/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@frontend/*", "../frontend/*"],
              message:
                "backend/ must not import from frontend/. The dependency runs one way: the UI knows about the domain, the domain knows nothing about the UI.",
            },
          ],
        },
      ],
    },
  },

  {
    /* Tests and config assert against fixtures and cast freely; holding them to
       the same rules as the domain produces noise, not safety. */
    files: ["**/*.test.ts", "e2e/**/*.ts", "*.config.{ts,mts,mjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
);
