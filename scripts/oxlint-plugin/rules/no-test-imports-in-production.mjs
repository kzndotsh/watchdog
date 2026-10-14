import { moduleSourceVisitors } from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/** Packages that only tests may load: runners, DOM test kits, and the repo's test helpers. */
const TEST_ONLY_PACKAGE =
  /^(@vitest\/|@testing-library\/)|^(vitest|@playwright\/test|fast-check|happy-dom|jsdom|@watchdog\/test-db|@watchdog\/test-kit)(\/|$)/;

/** A relative specifier naming a test module: a `__tests__` segment or a `.test`/`.spec` file. */
const TEST_MODULE =
  /(^|\/)__tests__(\/|$)|(^|\/)[^/]*\.(test|spec)(\.[cm]?[jt]sx?)?$/;

/**
 * Production source never imports test-only code. This replaces the guard the second
 * `tsc -p tsconfig.json` pass gave for free: `tsconfig.json` leaves out tests, test types
 * and `allowImportingTsExtensions`, so a production file that pulled in `@watchdog/test-db`
 * or a test module failed there. The one-pass typecheck checks `src` with the test config,
 * so the rule states it directly. Scope (production trees only) is set in `oxlint.config.ts`.
 */
export const noTestImportsInProduction = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban production source importing test runners, test helper packages and test modules.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return moduleSourceVisitors((specifier, node) => {
      const isTestPackage = TEST_ONLY_PACKAGE.test(specifier);
      const isTestModule =
        (specifier.startsWith(".") || specifier.startsWith("@/")) &&
        TEST_MODULE.test(specifier);
      if (!isTestPackage && !isTestModule) return;
      context.report({
        node,
        message: `production source imports test-only code (${specifier}): move the shared piece into non-test source, or move this file into a test tree (__tests__, *.test.ts, or a testing/ helper folder) (conventions: production source never imports test-only code)`,
      });
    });
  },
};
