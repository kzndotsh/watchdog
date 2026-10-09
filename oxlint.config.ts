import { readdirSync } from "node:fs";

import { recommended as effecttsgoRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

/** Scoped off for Promise/Node/TanStack boundaries — not pure Effect pipelines. */
const effecttsgoOff = {
  "effecttsgo/abort-controller-in-effect": "off",
  "effecttsgo/any-unknown-in-error-context": "off",
  "effecttsgo/async-function": "off",
  "effecttsgo/catch-to-ignore": "off",
  "effecttsgo/catch-to-or-else-succeed": "off",
  "effecttsgo/crypto-random-uuid": "off",
  "effecttsgo/extends-native-error": "off",
  "effecttsgo/global-console": "off",
  "effecttsgo/global-date": "off",
  "effecttsgo/global-date-in-effect": "off",
  "effecttsgo/global-error-in-effect-failure": "off",
  "effecttsgo/global-fetch": "off",
  "effecttsgo/global-fetch-in-effect": "off",
  "effecttsgo/global-random": "off",
  "effecttsgo/global-timers": "off",
  "effecttsgo/lazy-effect": "off",
  "effecttsgo/multiple-effect-provide": "off",
  "effecttsgo/new-promise": "off",
  "effecttsgo/node-builtin-import": "off",
  "effecttsgo/prefer-schema-over-json": "off",
  "effecttsgo/process-env": "off",
  "effecttsgo/run-effect-inside-effect": "off",
  "effecttsgo/try-catch-in-effect-gen": "off",
  "effecttsgo/unknown-in-effect-catch": "off",
  "effecttsgo/unnecessary-effect-gen": "off",
  // `effect/http` (the HTTP client every tool and the Cap context use) is still
  // flagged unstable upstream. Using it is deliberate; an Effect bump reviews
  // its changelog.
  "effecttsgo/unstable-api-usage": "off",
} as const;

/** Re-enabled in packages/tools — Clock-backed timestamps and abort signals. */
const effecttsgoTier2Warn = {
  "effecttsgo/global-date-in-effect": "warn",
  "effecttsgo/abort-controller-in-effect": "warn",
} as const;

/** Re-enabled in packages/core — fix violations instead of blanket-off. */
const effecttsgoTier1Warn = {
  "effecttsgo/unknown-in-effect-catch": "warn",
  "effecttsgo/any-unknown-in-error-context": "warn",
  "effecttsgo/global-date-in-effect": "warn",
  "effecttsgo/async-function": "warn",
  "effecttsgo/catch-to-or-else-succeed": "warn",
  "effecttsgo/catch-to-ignore": "warn",
  "effecttsgo/extends-native-error": "warn",
  "effecttsgo/try-catch-in-effect-gen": "warn",
  "effecttsgo/prefer-schema-over-json": "warn",
} as const;

/**
 * Effect edge conventions (formerly `scripts/check-effect-edges.mjs`): production source
 * of these roots may not start an Effect (`watchdog/no-effect-run-outside-edge`), must give
 * `Effect.try` / `tryPromise` its own `{ try, catch }` (`watchdog/effect-try-requires-catch`),
 * and may not return `unknown` from a catch or run an Effect inside one
 * (`effecttsgo/unknown-in-effect-catch`, `effecttsgo/run-effect-inside-effect`).
 */
const effectEdgeRoots = [
  "packages/core/src/**/*.{ts,tsx}",
  "packages/api/src/**/*.{ts,tsx}",
  "packages/tools/src/**/*.{ts,tsx}",
  "packages/policy/src/**/*.{ts,tsx}",
  "packages/caps/src/**/*.{ts,tsx}",
  "packages/ai/src/**/*.{ts,tsx}",
  "packages/db/src/**/*.{ts,tsx}",
  "packages/log/src/**/*.{ts,tsx}",
  "apps/cli/src/**/*.{ts,tsx}",
  "apps/worker/src/**/*.{ts,tsx}",
  "apps/web/src/**/*.{ts,tsx}",
];

/** Tests start Effects freely: `__tests__` trees and `*.test.*` files. */
const effectEdgeTests = ["**/__tests__/**", "**/*.test.{ts,tsx}"];

/**
 * The sanctioned `Effect.run*` edges: the allowlist. A new production edge is added here
 * with its reason in the nearest AGENTS.md.
 */
const effectRunEdges = [
  // Process: the API ManagedRuntime and `runApp`.
  "packages/api/src/runtime.ts",
  // Process: the worker boot (`NodeRuntime.runMain`).
  "apps/worker/src/boot-worker.ts",
  // `runDomain`, the test and script bridge for core programs.
  "packages/core/src/infra/run-domain.ts",
  // `transact`: the driver's transaction API is promise-based, so the body runs
  // through `runPromiseExitWith` (caller services, abort signal) at this one edge.
  "packages/core/src/infra/postgres-tx.ts",
  // `runCap`, the Promise edge for Cap `run()` tests.
  "packages/caps/src/sdk/run.ts",
];

/**
 * Same-name Watchdog wrappers over shadcn primitives (apps/web/src/shared/ui/primitives).
 * Their vanilla `@watchdog/ui/components/<name>` path is banned in app code so nobody
 * silently skips the wrapper; the list follows the folder, so adding a wrapper bans its twin.
 */
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return -- root config files sit outside every tsconfig project, so per-file (staged) lint cannot resolve node types */
const wrappedImportBans: string[] = readdirSync(
  new URL("apps/web/src/shared/ui/primitives/", import.meta.url)
)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => `@watchdog/ui/components/${f.replace(/\.tsx$/, "")}`);
/* oxlint-enable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return */

const watchdogIgnores = [
  // Local frozen tree, untracked: never format/lint it.
  "_legacy-v2/**",
  ".direnv/**",
  "graph/**",
  "data/**",
  "staging/**",
  "export/**",
  "reports/**",
  "templates/**",
  "**/routeTree.gen.ts",
  "packages/client/src/generated/**",
  "packages/caps/capabilities.gen.json",
  "packages/db/drizzle/**",
  "**/dist/**",
  "node_modules/**",
  // Vendored shadcn primitives (@watchdog/ui): byte-identical to the CLI output, never linted.
  "packages/ui/src/components/**",
  "packages/ui/src/hooks/**",
  ".cursor/**",
  ".agents/**",
  ".claude/**",
  ".kiro/**",
  "skills/**",
  "repos/**",
];

/** `no-restricted-imports` options for web code; `extra` adds patterns for narrower trees. */
const webImportRestrictions = (
  extra: { group: string[]; message: string }[]
) => ({
  paths: [
    {
      name: "@watchdog/db",
      message:
        "ServerFns call oRPC (@watchdog/api) → core → repos. Auth's db access lives in @watchdog/auth.",
    },
  ],
  patterns: [
    {
      group: wrappedImportBans,
      message:
        "This primitive has a Watchdog wrapper: import it from @/shared/ui/primitives/<name> (loading, Enter-to-confirm, mono, ...).",
    },
    {
      // Wrapper kept in shared/ui (no className surface, so not under primitives/).
      group: ["@watchdog/ui/components/toast"],
      message:
        "Import toast and Toaster from @/shared/ui/toast: the Watchdog wrapper adds toast.success/error/warning/info/loading.",
    },
    ...extra,
  ],
});

export default defineConfig({
  extends: [core, react, tanstack, effecttsgoRecommended],
  ignorePatterns: [...(core.ignorePatterns ?? []), ...watchdogIgnores],
  options: {
    typeAware: true,
  },
  // React Doctor only — not the full Ultracite js-plugins (github/sonarjs).
  // effecttsgo comes from `@effect/tsgo/oxlint-presets` after `effect-tsgo patch --oxlint`.
  jsPlugins: [
    { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
    // Tailwind v4-aware class checks (theme tokens, unknown classes, arbitrary values).
    // Web only — enabled in the apps/web override below. Pin exact: pre-1.0.
    "@shadcn/lint",
    // Local rules oxlint has no built-in for (scripts/oxlint-plugin/index.mjs).
    "./scripts/oxlint-plugin/index.mjs",
  ],
  rules: {
    // --- Permanent off: low signal / huge churn (lint debt burn-down P7) ---
    // reconsider curly only with proven safe autofix
    "eslint/curly": "off",
    // declaration vs expression holy war
    "eslint/func-style": "off",
    "react/function-component-definition": "off",
    "react/exhaustive-effect-dependencies": "off",
    "react/set-state-in-effect": "off",
    "react/incompatible-library": "off",
    "react/todo": "off",
    "eslint/no-void": "off",
    // often worse readability
    "eslint/prefer-destructuring": "off",
    // regex churn, little safety
    "eslint/prefer-named-capture-group": "off",
    // object key order noise
    "eslint/sort-keys": "off",
    // oxfmt import sort owns style
    "import/consistent-type-specifier-style": "off",
    // custom Queue listboxes are not native select/datalist
    "jsx-a11y/prefer-tag-over-role": "off",
    // intentional public API barrels (schemas etc.)
    "oxc/no-barrel-file": "off",
    // .toSorted needs ES2023; tsconfig is ES2022
    "unicorn/no-array-sort": "off",
    // fights promise-function-async on framework handlers that must be async
    // but only forward a Promise (TanStack / oRPC / runApp)
    "eslint/require-await": "off",
    // unicode flag churn on every regex; low safety signal here
    "eslint/require-unicode-regexp": "off",
    // ~100+ hits of mechanical truthiness churn; dedicated milestone later
    "typescript/strict-boolean-expressions": "off",
    // script/JSDoc noise — descriptions aren't our lint bar
    "jsdoc/require-param-description": "off",
    "jsdoc/require-returns-description": "off",

    // effecttsgo recommended warn rules stay on for uncovered paths (ultracite
    // does not deny warnings). Boundary layers disable via effecttsgoOff overrides.

    // --- Burn-down backlog (tighten gradually; see lint debt plan) ---
    "eslint/complexity": "off",
    "eslint/eqeqeq": "error",
    // ADR-0003: branded ids are minted by constructors, never cast (test-kit exempt below).
    "watchdog/no-brand-cast": "error",
    // ADR-0003: untrusted*Id test helpers are importable only from tests and test helpers (override below).
    "watchdog/no-untrusted-id-import": "error",
    "eslint/logical-assignment-operators": "error",
    "eslint/no-control-regex": "error",
    "eslint/no-empty-function": "error",
    "eslint/no-eq-null": "error",
    "eslint/no-misleading-character-class": "error",
    "eslint/no-negated-condition": "error",
    // P4/P5/P6 medium rules — already clean; enforced as error
    "eslint/no-nested-ternary": "error",
    // Ultracite passes rule options oxlint 1.81+ no longer accepts (see ultracite core).
    "eslint/no-unmodified-loop-condition": "error",
    "eslint/no-plusplus": "error",
    "eslint/no-await-in-loop": "error",
    "eslint/no-shadow": "error",
    "eslint/no-unused-vars": "error",
    "eslint/no-use-before-define": "error",
    "eslint/preserve-caught-error": "error",
    "import/no-cycle": "error",
    "jsx-a11y/anchor-has-content": "error",
    "jsx-a11y/click-events-have-key-events": "error",
    "jsx-a11y/control-has-associated-label": "error",
    "jsx-a11y/interactive-supports-focus": "error",
    "jsx-a11y/label-has-associated-control": "error",
    "jsx-a11y/no-noninteractive-element-interactions": "error",
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
    "jsx-a11y/no-static-element-interactions": "error",
    "jsx-a11y/role-has-required-aria-props": "error",
    "jsx-a11y/role-supports-aria-props": "error",
    "promise/prefer-await-to-callbacks": "error",
    "promise/prefer-await-to-then": "error",
    "react/button-has-type": "error",
    "react/display-name": "error",
    "react/jsx-handler-names": "error",
    "react/jsx-no-constructed-context-values": "error",
    "react/jsx-no-useless-fragment": "error",
    "react/no-danger": "error",
    "react/no-object-type-as-default-prop": "error",
    "react/no-unescaped-entities": "error",
    "react/no-unstable-nested-components": "error",
    "react-hooks/exhaustive-deps": "error",
    "typescript/array-type": "error",
    "typescript/ban-ts-comment": "error",
    "typescript/consistent-indexed-object-style": "error",
    "typescript/consistent-return": "error",
    "typescript/consistent-type-imports": "error",
    "typescript/no-base-to-string": "error",
    "typescript/no-confusing-void-expression": "error",
    "typescript/no-deprecated": "error",
    "typescript/no-dynamic-delete": "error",
    "typescript/no-floating-promises": [
      "error",
      {
        // vitest `describe`/`it` at module scope are fire-and-forget registration.
        allowForKnownSafeCalls: [
          {
            from: "package",
            name: ["describe", "it", "test"],
            package: "vitest",
          },
        ],
      },
    ],
    "typescript/no-invalid-void-type": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/no-redundant-type-constituents": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unnecessary-type-conversion": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-type-assertion": "error",
    "typescript/no-unused-vars": "error",
    "typescript/only-throw-error": "error",
    "typescript/prefer-nullish-coalescing": "error",
    "typescript/promise-function-async": "error",
    "typescript/restrict-template-expressions": "error",
    "typescript/return-await": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/use-unknown-in-catch-callback-variable": "error",
    "unicorn/consistent-function-scoping": "error",
    "unicorn/import-style": "error",
    "unicorn/no-array-for-each": "error",
    "unicorn/no-array-reduce": "error",

    "unicorn/no-await-expression-member": "error",
    "unicorn/no-document-cookie": "error",
    "unicorn/no-hex-escape": "error",
    "unicorn/no-negated-condition": "error",
    "unicorn/no-nested-ternary": "error",
    "unicorn/no-useless-collection-argument": "error",
    "unicorn/prefer-array-find": "error",
    "unicorn/prefer-export-from": [
      "error",
      // Barrel files (e.g. packages/api/src/schemas.ts) legitimately both use
      // and re-export the same imported schema — don't flag those as
      // redundant just because a subset is also re-exported.
      { checkUsedVariables: false },
    ],
    "unicorn/prefer-logical-operator-over-ternary": "error",
    "unicorn/prefer-number-coercion": "error",
    "unicorn/prefer-single-call": "error",
    "unicorn/prefer-string-replace-all": "error",
    "unicorn/prefer-ternary": "error",
    "react-doctor/effect-needs-cleanup": "error",
    "react-doctor/no-array-index-as-key": "error",
    "react-doctor/no-async-effect-callback": "error",
    "react-doctor/no-derived-state": "error",
    "react-doctor/no-derived-state-effect": "error",
    "react-doctor/no-fetch-in-effect": "error",
    "react/only-export-components": [
      "error",
      {
        allowConstantExport: true,
        allowExportNames: [
          "Route",
          "loader",
          "meta",
          "links",
          "headers",
          "action",
        ],
        customHOCs: [
          "createFileRoute",
          "createRootRoute",
          "createRootRouteWithContext",
        ],
      },
    ],
  },
  overrides: [
    {
      // packages/db repo contract (packages/db/AGENTS.md Repo contract): repo modules only,
      // not the `_*.ts` helpers or tests beside them.
      files: ["packages/db/src/repos/*.repo.ts"],
      rules: {
        "watchdog/db-repo-exec-first": "error",
        "watchdog/db-repo-no-dto-date": "error",
        "watchdog/db-repo-no-job-status-set": "error",
        "watchdog/db-repo-no-notify": "error",
        "watchdog/db-repo-no-raw-sql": "error",
        "watchdog/db-repo-no-sql-param": "error",
        "watchdog/db-repo-no-throw": "error",
        "watchdog/db-repo-no-transaction": "error",
        "watchdog/db-repo-no-trim-or-null": "error",
        "watchdog/db-repo-no-validation-import": "error",
        "watchdog/db-repo-trim-lookup-only": "error",
      },
    },
    {
      // Tests and test-helper trees may stamp unvalidated brands (ADR-0003).
      files: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "packages/caps/src/testing/**",
        "packages/schemas/src/testing/**",
        "packages/test-db/src/**",
      ],
      rules: { "watchdog/no-untrusted-id-import": "off" },
    },
    {
      // Schemas' branded test fixtures are the one place allowed to stamp a brand (ADR-0003).
      files: ["packages/schemas/src/testing/**/*.{ts,tsx}"],
      rules: { "watchdog/no-brand-cast": "off" },
    },
    {
      // Astro components use PascalCase filenames (import paths match).
      files: ["apps/site/**/*.astro"],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
    {
      files: ["scripts/**/*.mjs"],
      rules: {
        "eslint/no-use-before-define": "off",
      },
    },
    {
      files: [
        "packages/core/src/infra/tagged-errors.ts",
        "packages/core/src/infra/repo-layers.ts",
        "packages/tools/src/errors/tagged-errors.ts",
        "packages/ai/src/structured-extract.ts",
      ],
      rules: {
        "eslint/max-classes-per-file": "off",
      },
    },
    {
      // TanStack file routes export `Route` for the route tree generator.
      files: ["**/routes/**/*.{ts,tsx}", "**/src/routes/**/*.{ts,tsx}"],
      rules: {
        "typescript/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
            varsIgnorePattern: "^(_|Route)$",
          },
        ],
      },
    },
    {
      // Web must not import @watchdog/db except auth adapter + SSE listen, and must use the
      // Watchdog wrapper (not the vanilla @watchdog/ui primitive) wherever one exists.
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: {
        "eslint/no-restricted-imports": ["error", webImportRestrictions([])],
      },
    },
    {
      // Web design-system bans (ported from the retired ds-ban-check.mjs; inventory in
      // docs/reference/web/ui/rules.md). The decorative ban skips vendored primitives and
      // the Better Auth UI shells; the id-slice ban is for domain screens only.
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: {
        "watchdog/no-decorative-class": "error",
        "watchdog/no-banned-surface-name": "error",
      },
    },
    {
      files: ["apps/web/src/domains/**/*.{ts,tsx}"],
      rules: { "watchdog/no-opaque-id-slice": "error" },
    },
    {
      // TanStack Query ownership (docs/reference/web/data.md): mutations and cache writes
      // live in hooks, query keys in queries modules. Allowed trees and tests are off.
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: {
        "watchdog/mutation-only-in-hooks": "error",
        "watchdog/cache-writes-only-in-hooks": "error",
        "watchdog/query-keys-in-queries-modules": "error",
      },
    },
    {
      files: [
        "apps/web/src/domains/*/hooks/**/*.{ts,tsx}",
        "apps/web/src/shared/hooks/**/*.{ts,tsx}",
      ],
      rules: {
        "watchdog/mutation-only-in-hooks": "off",
        "watchdog/cache-writes-only-in-hooks": "off",
      },
    },
    {
      files: ["apps/web/src/shared/lib/query-invalidation.ts"],
      rules: { "watchdog/cache-writes-only-in-hooks": "off" },
    },
    {
      // A queries module is a domain's `queries.ts`, a `*-queries.ts` or a `*-keys.ts`.
      files: [
        "apps/web/src/**/queries.ts",
        "apps/web/src/**/*-queries.ts",
        "apps/web/src/**/*-keys.ts",
      ],
      rules: { "watchdog/query-keys-in-queries-modules": "off" },
    },
    {
      files: [
        "apps/web/src/**/__tests__/**/*.{ts,tsx}",
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
      ],
      rules: {
        "watchdog/mutation-only-in-hooks": "off",
        "watchdog/cache-writes-only-in-hooks": "off",
        "watchdog/query-keys-in-queries-modules": "off",
      },
    },
    {
      files: [
        "apps/web/src/shared/ui/primitives/**/*.{ts,tsx}",
        "apps/web/src/auth/ui/**/*.{ts,tsx}",
      ],
      rules: { "watchdog/no-decorative-class": "off" },
    },
    {
      // Loading doctrine (docs/reference/web/ui/loading.md): pages own their pending surface
      // with PendingRegion + shape skeletons; the route-level shell is the router's floor.
      files: [
        "apps/web/src/domains/**/*.{ts,tsx}",
        "apps/web/src/routes/**/*.{ts,tsx}",
      ],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          webImportRestrictions([
            {
              group: ["@watchdog/ui/components/skeleton"],
              message:
                "Use the shape skeletons in @/shared/ui/skeletons (they own layout parity), not a raw Skeleton.",
            },
            {
              group: ["@/shared/layout/route-pending"],
              message:
                "Shell-first: use an in-page PendingRegion + shape skeleton. RoutePending is the router's defaultPendingComponent floor only.",
            },
          ]),
        ],
      },
    },
    {
      // Wrappers are the one place that composes the vanilla primitives they wrap.
      files: [
        "apps/web/src/shared/ui/primitives/**/*.{ts,tsx}",
        "apps/web/src/shared/ui/toast.tsx",
      ],
      rules: {
        // Wrappers re-export their base module (`export *`): fast-refresh boundaries don't apply.
        "react/only-export-components": "off",
        "eslint/no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@watchdog/db",
                message: "UI wrappers never touch the database.",
              },
            ],
          },
        ],
      },
    },
    {
      // Vitest mocks and component tests — vi.mock hoisting, typed fixtures, void handlers.
      files: [
        "**/__tests__/**/*.{ts,tsx}",
        "**/*.{test,spec}.{ts,tsx}",
        "**/*.int.test.{ts,tsx}",
      ],
      rules: {
        "import/first": "off",
        "eslint/class-methods-use-this": "off",
        "eslint/no-empty-function": "off",
        "promise/prefer-await-to-callbacks": "off",
        "promise/prefer-await-to-then": "off",
        "promise/no-nesting": "off",
        "typescript/consistent-type-imports": "off",
        "typescript/no-confusing-void-expression": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-unnecessary-type-assertion": "off",
        "typescript/strict-void-return": "off",
        "typescript/unbound-method": "off",
        "unicorn/no-useless-undefined": "off",
        "typescript/promise-function-async": "off",
        "typescript/await-thenable": "off",
        "typescript/only-throw-error": "off",
        "typescript/no-misused-spread": "off",
        "typescript/use-unknown-in-catch-callback-variable": "off",
        "typescript/no-non-null-assertion": "off",
        "eslint/arrow-body-style": "off",
        "eslint/no-eq-null": "off",
        "eslint/eqeqeq": "off",
        "eslint/no-throw-literal": "off",
        "eslint/no-shadow": "off",
        "promise/avoid-new": "off",
        "unicorn/prefer-response-static-json": "off",
        "unicorn/no-useless-promise-resolve-reject": "off",
        "react/jsx-handler-names": "off",
        "react/jsx-no-useless-fragment": "off",
        "react/self-closing-comp": "off",
        "react/no-clone-element": "off",
        "eslint/max-classes-per-file": "off",
        "typescript/no-extraneous-class": "off",
        "unicorn/no-object-as-default-parameter": "off",
        "unicorn/consistent-function-scoping": "off",
        "unicorn/no-await-expression-member": "off",
        ...effecttsgoOff,
      },
    },
    {
      // Promise repos, job Date interop, tools HTTP, TanStack/CLI edges, build scripts.
      files: [
        "packages/db/src/**/*.{ts,tsx}",
        "packages/db/drizzle.config.ts",
        "packages/db/scripts/**/*.{mjs,ts}",
        "packages/**/scripts/**/*.{mjs,ts}",
        "packages/caps/src/**/*.{ts,tsx}",
        "packages/ai/src/**/*.{ts,tsx}",
        "packages/env/src/**/*.{ts,tsx}",
        "packages/log/src/**/*.{ts,tsx}",
        "packages/schemas/src/**/*.{ts,tsx}",
        "packages/test-kit/src/**/*.{ts,tsx}",
        "packages/test-db/src/**/*.{ts,tsx}",
        "packages/client/src/**/*.{ts,tsx}",
        "packages/api/src/**/*.{ts,tsx}",
        "packages/auth/src/**/*.{ts,tsx}",
        "apps/**/*.{ts,tsx,mjs}",
        "e2e/**/*.{ts,tsx}",
        "scripts/**/*.{mjs,ts}",
        "vitest.config.ts",
        "playwright.config.ts",
        "oxlint.config.ts",
        "knip.ts",
      ],
      rules: effecttsgoOff,
    },
    {
      // Tools HTTP/DNS — tier-2 rules stay on; boundary rules stay off.
      files: ["packages/tools/src/**/*.{ts,tsx}"],
      rules: {
        ...effecttsgoOff,
        ...effecttsgoTier2Warn,
        "effecttsgo/missing-effect-context": "off",
        "effecttsgo/missing-effect-error": "off",
      },
    },
    {
      files: [
        "packages/tools/src/**/__tests__/**/*.{ts,tsx}",
        "packages/tools/src/**/*.{test,spec,int.test}.{ts,tsx}",
      ],
      rules: effecttsgoOff,
    },
    {
      // Core Effect pipeline — tier-1 rules stay on; boundary rules stay off.
      files: ["packages/core/src/**/*.{ts,tsx}"],
      rules: {
        ...effecttsgoOff,
        ...effecttsgoTier1Warn,
      },
    },
    {
      files: [
        "packages/core/src/**/__tests__/**/*.{ts,tsx}",
        "packages/core/src/**/*.{test,spec,int.test}.{ts,tsx}",
      ],
      rules: effecttsgoOff,
    },
    {
      // Effect edge conventions over the old gate's roots (see `effectEdgeRoots`).
      files: effectEdgeRoots,
      rules: {
        "watchdog/no-effect-run-outside-edge": "error",
        "watchdog/effect-try-requires-catch": "error",
        "effecttsgo/unknown-in-effect-catch": "error",
        "effecttsgo/run-effect-inside-effect": "error",
      },
    },
    {
      files: effectRunEdges,
      rules: {
        "watchdog/no-effect-run-outside-edge": "off",
        "effecttsgo/run-effect-inside-effect": "off",
      },
    },
    {
      files: effectEdgeTests,
      rules: {
        "watchdog/no-effect-run-outside-edge": "off",
        "watchdog/effect-try-requires-catch": "off",
        "effecttsgo/unknown-in-effect-catch": "off",
        "effecttsgo/run-effect-inside-effect": "off",
      },
    },
    {
      // ADR-0002 phase 2: core reaches the database through the `Db` service
      // (`tryDbWith`, `transact`), never the module-global client. Type imports
      // (`DbExec`, `DbTx`) and repo imports stay allowed. Phase 3: the S3 client
      // comes from the `BlobStore` service, so `new S3Client` lives in one file.
      files: ["packages/core/src/**/*.{ts,tsx}"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@watchdog/db",
                importNames: ["db"],
                message:
                  "Core reads the database through the Db service (tryDbWith / transact, see packages/core/AGENTS.md), not the global db client.",
              },
              {
                name: "@aws-sdk/client-s3",
                importNames: ["S3Client", "S3"],
                allowTypeImports: true,
                message:
                  "Core reads the S3 client from the BlobStore service (infra/blob-store.ts, see packages/core/AGENTS.md), not a module-level client.",
              },
            ],
          },
        ],
        // `no-restricted-imports` does not see `import("@watchdog/db")`.
        "watchdog/no-core-db-dynamic-import": "error",
        // Same gap for `import("@aws-sdk/client-s3")`.
        "watchdog/no-core-s3-dynamic-import": "error",
      },
    },
    {
      // API procedures are built from `authed`; the public builder needs a
      // `// public: <reason>` comment (health.ts is the only one). Tests live in
      // `procedures/__tests__/`, which `*.ts` does not reach.
      files: ["packages/api/src/procedures/*.ts"],
      rules: { "watchdog/procedure-must-be-guarded": "error" },
    },
    {
      // Exempt: the Db live Layer is the one place that wraps the global client;
      // tests seed and assert on the real connection.
      files: [
        "packages/core/src/infra/db-service.ts",
        "packages/core/src/**/__tests__/**/*.{ts,tsx}",
        "packages/core/src/**/*.{test,spec,int.test}.{ts,tsx}",
      ],
      rules: {
        "eslint/no-restricted-imports": "off",
        "watchdog/no-core-db-dynamic-import": "off",
        "watchdog/no-core-s3-dynamic-import": "off",
      },
    },
    {
      // Exempt: the BlobStore live Layer (and its recording test Layer) is the one
      // place that constructs an `S3Client`; the global-db ban stays on.
      files: ["packages/core/src/infra/blob-store.ts"],
      rules: {
        "watchdog/no-core-s3-dynamic-import": "off",
        "eslint/no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@watchdog/db",
                importNames: ["db"],
                message:
                  "Core reads the database through the Db service (tryDbWith / transact, see packages/core/AGENTS.md), not the global db client.",
              },
            ],
          },
        ],
      },
    },
    {
      // Job pipeline + evidence: promise chains avoid desloppify async_no_await churn.
      files: [
        "packages/core/src/**/*.{ts,tsx}",
        "packages/db/src/**/*.{ts,tsx}",
      ],
      rules: {
        "eslint/no-empty-function": "off",
        "promise/prefer-await-to-callbacks": "off",
        "promise/prefer-await-to-then": "off",
        "promise/no-nesting": "off",
        "typescript/promise-function-async": "off",
        "typescript/return-await": "off",
        "typescript/consistent-return": "off",
        "typescript/no-non-null-assertion": "off",
        "unicorn/no-useless-promise-resolve-reject": "off",
      },
    },
    {
      // Integration helpers — intentional empty stubs in test kit.
      files: [
        "packages/test-kit/src/**/*.{ts,tsx}",
        "packages/test-db/src/**/*.{ts,tsx}",
        "packages/caps/src/testing/**/*.{ts,tsx}",
        "packages/schemas/src/testing/**/*.{ts,tsx}",
      ],
      rules: {
        "eslint/no-empty-function": "off",
      },
    },
    {
      // Server fns + SSE + case switch: promise chains over raw async churn.
      files: [
        "apps/web/src/auth/session.server.ts",
        "apps/web/src/domains/**/hooks/*.{ts,tsx}",
        "apps/web/src/domains/**/*.functions.ts",
        "apps/web/src/domains/intake/lib/upload-file.ts",
        "apps/web/src/shared/lib/active-case-switch.ts",
        "apps/web/src/routes/api/events.ts",
      ],
      rules: {
        "eslint/no-empty-function": "off",
        "eslint/no-shadow": "off",
        "promise/prefer-await-to-callbacks": "off",
        "promise/prefer-await-to-then": "off",
        "promise/no-nesting": "off",
        "typescript/promise-function-async": "off",
        "typescript/return-await": "off",
        "unicorn/no-useless-promise-resolve-reject": "off",
        "eslint/prefer-const": "off",
      },
    },
    {
      // TanStack table meta + identifier cells: narrow meta casts and handler prop names.
      files: [
        "apps/web/src/domains/**/components/**/*.{cells,columns,composer}.tsx",
        "apps/web/src/domains/**/hooks/use-*-table-state.ts",
        "apps/web/src/domains/tasks/components/use-task-form-dialog.ts",
        "apps/web/src/shared/ui/identifiers/**/*.tsx",
        "apps/web/src/shared/ui/rich-text/rich-text-toolbar-controls.tsx",
        "apps/web/src/shared/ui/relative-time.tsx",
        "apps/web/src/domains/entities/lib/parse-identifier-paste.types.ts",
      ],
      rules: {
        "react/only-export-components": "off",
        "react/jsx-handler-names": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-deprecated": "off",
        "typescript/unbound-method": "off",
      },
    },
    {
      // CLI is HTTP-only — never pull server packages or process logs.
      files: ["apps/cli/src/**/*.{ts,tsx}"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          {
            // `paths` matches the bare package name only; subpath exports need `patterns`.
            patterns: [
              {
                group: [
                  "@watchdog/core/*",
                  "@watchdog/db/*",
                  "@watchdog/api/*",
                ],
                message: "CLI talks HTTP via @watchdog/client only.",
              },
            ],
            paths: [
              {
                name: "@watchdog/core",
                message: "CLI talks HTTP via @watchdog/client only.",
              },
              {
                name: "@watchdog/db",
                message: "CLI talks HTTP via @watchdog/client only.",
              },
              {
                name: "@watchdog/api",
                message: "CLI talks HTTP via @watchdog/client only.",
              },
              {
                name: "@watchdog/log",
                message:
                  "CLI stdout is the agent JSON contract — do not use @watchdog/log.",
              },
              {
                name: "@watchdog/env",
                message: "CLI owns WD_API_* in apps/cli/src/env.ts.",
              },
              {
                name: "@watchdog/env/server",
                message: "CLI owns WD_API_* in apps/cli/src/env.ts.",
              },
            ],
          },
        ],
      },
    },
    {
      // CLI build/pack scripts: Node ESM + progress logs.
      files: ["apps/cli/scripts/**/*.mjs"],
      rules: {
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "effecttsgo/global-console": "off",
      },
    },
    {
      // Worker boot: pg-boss handlers return void, not wrapped resolves.
      files: ["apps/worker/src/**/*.{ts,tsx}"],
      rules: {
        "promise/prefer-await-to-then": "off",
        "typescript/promise-function-async": "off",
        "typescript/return-await": "off",
        "unicorn/no-useless-promise-resolve-reject": "off",
      },
    },
    {
      // Cap wrappers + OpenAPI generator: thin promise delegates.
      files: [
        "packages/api/src/openapi.ts",
        "packages/caps/src/network/url.enrich/**/*.{ts,tsx}",
      ],
      rules: {
        "typescript/promise-function-async": "off",
        "typescript/return-await": "off",
      },
    },
    {
      // Tools clients: promise chains avoid desloppify async_no_await; require-await is off globally.
      files: ["packages/tools/src/**/*.{ts,tsx}"],
      rules: {
        "eslint/no-use-before-define": "off",
        "promise/prefer-await-to-then": "off",
        "typescript/promise-function-async": "off",
        "typescript/return-await": "off",
        "unicorn/no-await-expression-member": "off",
        "unicorn/no-useless-promise-resolve-reject": "off",
      },
    },
    {
      // Pan/zoom graph — layout measurement requires effect-driven view state.
      files: ["apps/web/src/shared/ui/graph/graph-canvas.tsx"],
      rules: {
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "jsx-a11y/no-noninteractive-tabindex": "off",
        "typescript/consistent-return": "off",
      },
    },
    {
      // Web maintenance scripts — sequential browser steps, loose DOM typing.
      files: ["apps/web/scripts/**/*.mjs"],
      rules: {
        "eslint/no-await-in-loop": "off",
        "eslint/no-empty-function": "off",
        "eslint/no-unused-vars": "off",
        "promise/avoid-new": "off",
        "typescript/await-thenable": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/use-unknown-in-catch-callback-variable": "off",
        "unicorn/no-useless-undefined": "off",
      },
    },
    {
      // Fixture modules — inert handlers and mixed exports.
      files: [
        "apps/web/src/shared/ui/active-tab-body.tsx",
        "apps/web/src/shared/ui/stack-pending-fallback.tsx",
      ],
      rules: {
        "react/only-export-components": "off",
      },
    },
    {
      // Fixture modules — inert handlers and mixed exports.
      files: ["apps/web/src/**/fixtures/**/*.{ts,tsx}"],
      rules: {
        "react/only-export-components": "off",
        "unicorn/prefer-export-from": "off",
      },
    },
    {
      // Tailwind class checks on web UI. Class strings live in constants (STATUS_TONES),
      // so scan every string. no-inline-styles / require-static-classes
      // are deliberately off: see docs/reference/web/ui/rules.md.
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: {
        "shadcn/no-raw-colors": ["error", { scanAllStrings: true }],
        "shadcn/no-arbitrary-values": [
          "error",
          { allow: ["layout"], scanAllStrings: true },
        ],
        "shadcn/no-unknown-classes": "error",
      },
    },
    {
      // Domains and routes compose primitives; they don't restyle them. Callers may
      // place (layout classes, truncate); size, color, and shape come from variants.
      // shared/ atoms own their style, like shadcn's ui/ dir.
      files: [
        "apps/web/src/domains/**/*.{ts,tsx}",
        "apps/web/src/routes/**/*.{ts,tsx}",
      ],
      rules: {
        "shadcn/no-restyle": [
          "error",
          {
            allow: ["layout", "truncate"],
            // Code-like values (ids, timestamps, pasted handles) render monospace.
            contracts: [
              {
                pattern: "^(Input|Textarea)$",
                allow: ["layout", "truncate", "font-mono"],
              },
            ],
          },
        ],
      },
    },
    {
      // `auth/ui` started as Better Auth UI registry source (docs/reference/web/ui/auth-ui.md).
      // It is linted and formatted like our code, but these rules are off because the
      // upstream patterns trip them and their autofixes change behavior (`||` to `??`,
      // dropping casts the types still need). Remove entries as the files get rewritten.
      files: ["apps/web/src/auth/ui/**/*.{ts,tsx}"],
      rules: {
        "typescript/consistent-return": "off",
        "typescript/consistent-type-definitions": "off",
        "typescript/use-unknown-in-catch-callback-variable": "off",
        "eslint/no-nested-ternary": "off",
        "unicorn/no-nested-ternary": "off",
        "eslint/no-use-before-define": "off",
        "eslint/no-empty-function": "off",
        "eslint/no-negated-condition": "off",
        "unicorn/no-negated-condition": "off",
        "unicorn/consistent-function-scoping": "off",
        "jsdoc/check-tag-names": "off",
        "promise/prefer-await-to-then": "off",
        "promise/prefer-await-to-callbacks": "off",
      },
    },
    {
      // Fixtures assert on made-up class / token names.
      files: [
        "apps/web/src/**/__tests__/**/*.{ts,tsx}",
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
      ],
      rules: {
        "shadcn/no-raw-colors": "off",
        "shadcn/no-arbitrary-values": "off",
        "shadcn/no-unknown-classes": "off",
        "shadcn/no-restyle": "off",
      },
    },
  ],
});
