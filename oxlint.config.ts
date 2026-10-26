import { readdirSync } from "node:fs";

import { recommended as effecttsgoRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
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
 * `@watchdog/db` exports that reach the process-global Postgres pool (#443): the pool has one
 * owner per process (`Db.owned` in `@watchdog/core`), so production code outside `packages/db`
 * and that owner never imports them. Tests, `@watchdog/test-db` and the two one-shot CLIs
 * (`withPool`) are exempt.
 */
const globalPoolImportNames = [
  "db",
  "client",
  "acquirePool",
  "endPool",
  "createPool",
  "withPool",
];

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

/**
 * The infinite-query APIs: a list reads a page at a time through the list standard's view and
 * hooks (`shared/lib/list/**`, `shared/hooks/list/**`), never a hand-built infinite query.
 */
const INFINITE_QUERY_NAMES = ["useInfiniteQuery", "infiniteQueryOptions"];

/**
 * Client row models and filter features: the browser sorts, filters or pages nothing a list
 * shows (a declared list's server does, ADR-0007). A bounded table that needs them goes in
 * `shared/ui/data-table/table-features.ts` with a named exemption below.
 */
const CLIENT_TABLE_NAMES = [
  "createFilteredRowModel",
  "createSortedRowModel",
  "createPaginatedRowModel",
  "createGroupedRowModel",
  "createExpandedRowModel",
  "createFacetedRowModel",
  "createFacetedMinMaxValues",
  "createFacetedUniqueValues",
  "columnFilteringFeature",
  "globalFilteringFeature",
  "rowPaginationFeature",
  "columnFacetingFeature",
  "globalFacetingFeature",
  "rowExpandingFeature",
  "columnGroupingFeature",
];

/**
 * `no-restricted-imports` options for web code; `extra` adds patterns for narrower trees.
 * `allowInfinite` is for the list machinery and the named legacy feeds (see the overrides).
 */
const webImportRestrictions = (
  extra: { group: string[]; message: string }[],
  { allowInfinite = false }: { allowInfinite?: boolean } = {}
) => ({
  paths: [
    {
      name: "@watchdog/db",
      message:
        "ServerFns call oRPC (@watchdog/api) → core → repos. Auth's db access lives in @watchdog/auth.",
    },
    ...(allowInfinite
      ? []
      : [
          {
            name: "@tanstack/react-query",
            importNames: INFINITE_QUERY_NAMES,
            message:
              "A list reads a page at a time through the list standard (listView + useList, or useListFirstPage), never a hand-built infinite query. Only shared/lib/list, shared/hooks/list and the named legacy feeds (Recent activity, row history) may; see conventions.md.",
          },
        ]),
    ...["@tanstack/react-table", "@tanstack/table-core"].map((name) => ({
      name,
      importNames: CLIENT_TABLE_NAMES,
      message:
        "No client row models or filter features: the server sorts, filters and pages a list (ADR-0007). A bounded table adds them in shared/ui/data-table/table-features.ts; see conventions.md.",
    })),
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

/** Extra patterns of the domain and route trees (loading doctrine). */
const domainImportRestrictions = [
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
];

export default defineConfig({
  extends: [core, react, tanstack, effecttsgoRecommended],
  ignorePatterns: [...(core.ignorePatterns ?? []), ...watchdogIgnores],
  options: {
    typeAware: true,
  },
  // React Doctor only — not the full Ultracite js-plugins (github/sonarjs).
  // effecttsgo comes from `@effect/tsgo/oxlint-presets` after `effect-tsgo patch --oxlint`.
  jsPlugins: [
    // Ultracite anti-slop plugin, loaded from the preset's own entry. Only the two
    // rules enabled below are on; the rest of the preset is too noisy here (#401).
    ...(antiSlop.jsPlugins ?? []),
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
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reflect-apply": "error",
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
    "typescript/consistent-type-definitions": ["error", "type"],
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
    // An icon-only Button needs an accessible name, aria-label or sr-only text (docs/reference/web/ui/atoms.md Accessibility).
    "react-doctor/shadcn-icon-button-requires-label": "error",
    // Effect policy (docs/reference/web/ui/effects.md): no prop-to-state sync.
    "react-doctor/no-mirror-prop-effect": "error",
    "react-doctor/no-adjust-state-on-prop-change": "error",
    "react-doctor/no-reset-all-state-on-prop-change": "error",
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
        "watchdog/no-button-height-class": "error",
      },
    },
    {
      files: ["apps/web/src/domains/**/*.{ts,tsx}"],
      rules: { "watchdog/no-opaque-id-slice": "error" },
    },
    {
      // One source per domain rule: the custody evidence message is typed once, in
      // @watchdog/policy; everywhere else imports it (conventions: one source per domain
      // rule). Tests are not exempt: they assert against the imported constant.
      files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      rules: { "watchdog/no-reimplemented-custody-message": "error" },
    },
    {
      files: ["packages/policy/**/*.{ts,tsx}"],
      rules: { "watchdog/no-reimplemented-custody-message": "off" },
    },
    {
      // Derived Cap metadata (user agent, reportLabel equal to id, needs_key / third_party
      // flags) has one source; the rule exempts tests itself. No baseline.
      files: ["packages/caps/src/**/*.{ts,tsx}"],
      rules: { "watchdog/no-derived-cap-metadata": "error" },
    },
    {
      // Production source imports no test-only code and no `.ts` extension. The typecheck is
      // one program per package on tsconfig.test.json, which allows both; these rules keep
      // the restrictions tsconfig.json used to enforce (conventions: production source never
      // imports test-only code). apps/web allows the extension in its own tsconfig.
      files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      rules: {
        "watchdog/no-test-imports-in-production": "error",
        "watchdog/no-ts-extension-import": "error",
      },
    },
    {
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: { "watchdog/no-ts-extension-import": "off" },
    },
    {
      // Test trees and the test helper packages and folders may import test code.
      files: [
        "**/__tests__/**",
        "**/*.{test,spec}.{ts,tsx}",
        "**/*.int.test.{ts,tsx}",
        "**/testing/**",
        "apps/web/src/test-setup.ts",
        "packages/test-db/**",
        "packages/test-kit/**",
      ],
      rules: {
        "watchdog/no-test-imports-in-production": "off",
        "watchdog/no-ts-extension-import": "off",
      },
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
      // The wrapper defines the size scale, so it is where heights live; tests probe it.
      files: [
        "apps/web/src/shared/ui/primitives/**/*.{ts,tsx}",
        "apps/web/src/**/__tests__/**/*.{ts,tsx}",
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
      ],
      rules: { "watchdog/no-button-height-class": "off" },
    },
    {
      // Web layering (docs/reference/web/domains.md, conventions table "Web" rows).
      files: ["apps/web/src/shared/ui/**/*.{ts,tsx}"],
      rules: { "watchdog/shared-ui-no-domain-imports": "error" },
    },
    {
      files: ["apps/web/src/**/lib/**/*.{ts,tsx}"],
      rules: { "watchdog/no-hooks-in-lib": "error" },
    },
    {
      // One exported component per .tsx file (docs/reference/web/ui/rules.md). Re-exports
      // never count, so barrels pass; a file that defines several components on purpose
      // (a gallery, an icon map) is exempt below.
      files: ["apps/web/src/**/*.tsx"],
      rules: { "watchdog/one-component-per-file": "error" },
    },
    {
      // Registries: the /ui gallery routes hold specimen chrome on purpose, and a primitives/
      // wrapper mirrors the several components of the vendored shadcn module it extends.
      files: [
        "apps/web/src/routes/_protected/ui/**/*.tsx",
        "apps/web/src/shared/ui/primitives/**/*.tsx",
      ],
      rules: { "watchdog/one-component-per-file": "off" },
    },
    {
      // A component with more than two props names its type XProps (docs/reference/web/ui/rules.md).
      files: ["apps/web/src/**/*.tsx"],
      rules: { "watchdog/component-props-type": "error" },
    },
    {
      // Tests probe components with inline props.
      files: [
        "apps/web/src/**/__tests__/**/*.{ts,tsx}",
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
      ],
      rules: { "watchdog/component-props-type": "off" },
    },
    {
      // Boolean props and variables read as predicates: is/has/can/should
      // (docs/reference/web/ui/rules.md). Vendored primitives, the Better Auth UI shells
      // and tests keep their upstream spellings.
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: { "watchdog/boolean-prefix": "error" },
    },
    {
      files: [
        "apps/web/src/shared/ui/primitives/**/*.{ts,tsx}",
        "apps/web/src/auth/ui/**/*.{ts,tsx}",
        "apps/web/src/**/__tests__/**/*.{ts,tsx}",
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
      ],
      rules: { "watchdog/boolean-prefix": "off" },
    },
    {
      // Mock policy (docs/contributing/testing/standards.md): tests mock boundaries, not
      // internal modules; no casts that silence a type error; no real sleeps. Existing
      // sites are baselined per file (shrink-only, scripts/oxlint-plugin/baselines/).
      files: ["**/__tests__/**/*.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}"],
      rules: {
        "watchdog/no-internal-module-mock": "error",
        "watchdog/no-test-casts": "error",
        "watchdog/no-test-sleep": "error",
      },
    },
    {
      // Props are onX, implementations handleX, no handleX in props (docs/reference/web/ui/rules.md).
      files: ["apps/web/src/**/*.tsx"],
      rules: { "watchdog/handler-naming": "error" },
    },
    {
      // Tests probe components with their own names; auth/ui mirrors the Better Auth UI registry.
      files: [
        "apps/web/src/**/__tests__/**/*.{ts,tsx}",
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
        "apps/web/src/auth/ui/**/*.{ts,tsx}",
      ],
      rules: { "watchdog/handler-naming": "off" },
    },
    {
      files: ["apps/web/src/domains/**/*.{ts,tsx}"],
      rules: { "watchdog/no-cross-domain-relative-imports": "error" },
    },
    {
      files: ["apps/web/src/**/*.{ts,tsx}"],
      rules: { "watchdog/no-types-from-functions": "error" },
    },
    {
      // A domain's own server-function and Query modules sit next to the RPC surface they wrap.
      files: [
        "apps/web/src/domains/**/*.functions.ts",
        "apps/web/src/domains/**/queries.ts",
        "apps/web/src/domains/**/*-queries.ts",
      ],
      rules: { "watchdog/no-types-from-functions": "off" },
    },
    {
      // Tests may build hooks as helpers, and a shared/ui test may compose a domain factory.
      files: [
        "apps/web/src/**/__tests__/**/*.{ts,tsx}",
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
      ],
      rules: {
        "watchdog/no-hooks-in-lib": "off",
        "watchdog/one-component-per-file": "off",
        "watchdog/shared-ui-no-domain-imports": "off",
      },
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
          webImportRestrictions(domainImportRestrictions),
        ],
      },
    },
    {
      // Infinite queries: the list machinery builds them, and two legacy feeds keep one each
      // (conventions.md): Recent activity collapses entries by group in a window function before
      // the keyset, and row history is ordered by the history id itself, so neither is a
      // filterable declared list (pagination-coverage.test.ts names them too).
      files: [
        "apps/web/src/shared/lib/list/**/*.{ts,tsx}",
        "apps/web/src/shared/hooks/list/**/*.{ts,tsx}",
        "apps/web/src/domains/activity/queries.ts",
        "apps/web/src/domains/dashboard/components/recent-activity.tsx",
        "apps/web/src/domains/entities/history/queries.ts",
        "apps/web/src/domains/dossier/components/row-history-popup.tsx",
      ],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          webImportRestrictions(domainImportRestrictions, {
            allowInfinite: true,
          }),
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
      // One outbound HTTP client (docs/reference/platform/caps-boundary.md): Caps and tools
      // reach the network through `@watchdog/tools/http` (`OutboundClient`, `httpClientLayer`),
      // which validates every resolved address and redirect hop, streams with a byte cap and
      // times out. A direct `fetch`, a raw transport or a raw socket skips all of that.
      files: [
        "packages/caps/src/**/*.{ts,tsx}",
        "packages/tools/src/**/*.{ts,tsx}",
      ],
      rules: {
        "eslint/no-restricted-globals": [
          "error",
          {
            name: "fetch",
            message:
              "Use OutboundClient or httpClientLayer from @watchdog/tools/http (see packages/tools/AGENTS.md); a direct fetch skips the outbound address, redirect, size and timeout checks.",
          },
          {
            name: "require",
            message:
              "Caps and tools are ESM: import through the restricted-imports allowlist (see packages/tools/AGENTS.md), never require a transport or socket module.",
          },
        ],
        // `globalThis.fetch(...)` is a property read, not the `fetch` global.
        "eslint/no-restricted-properties": [
          "error",
          ...["globalThis", "window", "self"].map((object) => ({
            object,
            property: "fetch",
            message:
              "Use OutboundClient or httpClientLayer from @watchdog/tools/http (see packages/tools/AGENTS.md); a direct fetch skips the outbound address, redirect, size and timeout checks.",
          })),
        ],
        "eslint/no-restricted-imports": [
          "error",
          {
            paths: [
              ...["http", "https", "http2", "tls", "dgram"].flatMap((name) =>
                [name, `node:${name}`].map((module) => ({
                  name: module,
                  message:
                    "Use OutboundClient or httpClientLayer from @watchdog/tools/http (see packages/tools/AGENTS.md), not a raw transport or socket.",
                }))
              ),
              ...["dns", "dns/promises"].flatMap((name) =>
                [name, `node:${name}`].map((module) => ({
                  name: module,
                  allowTypeImports: true,
                  message:
                    "DNS lookups live in the egress module (`Egress.resolve`) and the outbound policy (see packages/tools/AGENTS.md).",
                }))
              ),
              ...["net", "node:net"].map((module) => ({
                name: module,
                // `isIP` and friends are pure parsing; only the connecting APIs are banned.
                importNames: [
                  "connect",
                  "createConnection",
                  "createServer",
                  "Server",
                  "Socket",
                ],
                message:
                  "Open sockets only through the outbound client (see packages/tools/AGENTS.md).",
              })),
              {
                name: "undici",
                allowTypeImports: true,
                message:
                  "Use OutboundClient or httpClientLayer from @watchdog/tools/http (see packages/tools/AGENTS.md), not a raw HTTP transport.",
              },
              {
                name: "effect/http",
                importNames: ["FetchHttpClient"],
                message:
                  "toolsHttpClientLayer is the one HttpClient of Caps and tools; do not build another from FetchHttpClient.",
              },
            ],
          },
        ],
      },
    },
    {
      // The explicit allowlist: the outbound client and policy, the HttpClient layer and the
      // egress module's TLS socket and DNS resolver are the only production files that touch a
      // transport, socket or resolver directly.
      files: [
        "packages/tools/src/http/safe-fetch.ts",
        "packages/tools/src/http/http-client-layer.ts",
        "packages/tools/src/http/outbound-policy.ts",
        "packages/tools/src/http/egress-tls.ts",
        "packages/tools/src/http/egress-dns.ts",
      ],
      rules: { "eslint/no-restricted-imports": "off" },
    },
    {
      // Tests that stand up a local HTTP server or proxy.
      files: [
        "packages/tools/src/http/__tests__/safe-fetch.test.ts",
        "packages/tools/src/http/__tests__/safe-fetch-proxy.test.ts",
        "packages/tools/src/http/__tests__/safe-fetch-retry.test.ts",
        "packages/tools/src/http/__tests__/helpers/loopback-server.ts",
        "packages/tools/src/http/__tests__/outbound-lifecycle.test.ts",
      ],
      rules: {
        "eslint/no-restricted-imports": "off",
      },
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
                importNames: globalPoolImportNames,
                message:
                  "Core reads the database through the Db service (tryDbWith / transact, see packages/core/AGENTS.md), not the global pool: Db.owned owns it (conventions.md).",
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
      // Only the Job lifecycle module changes a Job's status (conventions.md): `jobsRepo.settle`
      // is called from lifecycle/settle.ts alone, and `jobs-settle.repo.ts` is the one db file
      // that writes `jobs.status`. Seeds sit outside `src` (db demo-seed) or in test-db.
      files: ["packages/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
      rules: { "watchdog/job-status-only-in-lifecycle": "error" },
    },
    {
      files: [
        "packages/core/src/jobs/lifecycle/**",
        "packages/db/src/repos/jobs-settle.repo.ts",
        "packages/test-db/src/**",
        "**/__tests__/**",
        "**/*.{test,spec,int.test}.{ts,tsx}",
      ],
      rules: { "watchdog/job-status-only-in-lifecycle": "off" },
    },
    {
      // A repo call is not wrapped in tryDb / tryDbWith: the Effect repo modules
      // (`infra/repos-fx.ts`, `xRepoFx` / `xRepoFxDb`) are that seam, so the wrapper is a second
      // copy. A wrapper with `opts` (the conflict mapping) is allowed; the rule skips it.
      files: ["packages/core/src/**/*.ts"],
      rules: { "watchdog/no-repo-wrapper": "error" },
    },
    {
      files: [
        "packages/core/src/**/__tests__/**",
        "packages/core/src/**/*.{test,spec,int.test}.ts",
      ],
      rules: { "watchdog/no-repo-wrapper": "off" },
    },
    {
      // Input schemas carry a named maximum (limits.ts); outputs and tests are not input schemas.
      files: [
        "packages/schemas/src/*.ts",
        "packages/schemas/src/lists/*.ts",
        "packages/api/src/procedures/*.ts",
      ],
      rules: { "watchdog/bounded-input-schema": "error" },
    },
    {
      // API procedures are built from `authed`; the public builder needs a
      // `// public: <reason>` comment (health.ts and ready.ts are the only ones). Tests live in
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
      // #443: auth gets the pool injected (`createAuth({ db })`, `resolveActorOrganizationId(db, ...)`),
      // never the process-global one. The first-admin command is a process entry (`withPool`).
      files: ["packages/auth/src/**/*.{ts,tsx}"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@watchdog/db",
                importNames: globalPoolImportNames,
                message:
                  "Auth takes the database handle as a parameter (createAuth({ db })); the process pool is owned by Db.owned (conventions.md).",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "packages/auth/src/bootstrap-admin-cli.ts",
        "packages/auth/src/__tests__/**/*.{ts,tsx}",
        "packages/auth/src/**/*.{test,spec,int.test}.{ts,tsx}",
      ],
      rules: { "eslint/no-restricted-imports": "off" },
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
                importNames: globalPoolImportNames,
                message:
                  "Core reads the database through the Db service (tryDbWith / transact, see packages/core/AGENTS.md), not the global pool: Db.owned owns it (conventions.md).",
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
