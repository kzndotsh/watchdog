import { isRecord } from "../lib/ast.mjs";
import { moduleSourceVisitors } from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const TS_EXTENSION = /\.[cm]?tsx?$/;

/**
 * `import type` / `export type` declarations may name a `.ts` path; value imports may not.
 * @param {unknown} node
 */
const isTypeOnly = (node) =>
  isRecord(node) &&
  (node.importKind === "type" ||
    node.exportKind === "type" ||
    node.type === "TSImportType");

/**
 * Production source imports by extensionless path. `tsconfig.json` does not enable
 * `allowImportingTsExtensions` (TS5097), while `tsconfig.test.json` does so tests can
 * import `.ts` helpers; with one typecheck program per package on the test config, this
 * rule keeps the production restriction. Type-only imports are legal in TypeScript and
 * stay legal here. Scope (production trees outside `apps/web`, whose tsconfig allows the
 * extension) is set in `oxlint.config.ts`.
 */
export const noTsExtensionImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban value imports ending in .ts/.tsx in production source that is not allowed them.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return moduleSourceVisitors((specifier, node) => {
      if (!TS_EXTENSION.test(specifier) || isTypeOnly(node)) return;
      context.report({
        node,
        message: `import path ends in a TypeScript extension (${specifier}): drop the extension, this package's tsconfig.json does not set allowImportingTsExtensions and the typecheck runs on the test config (conventions: production source imports without .ts)`,
      });
    });
  },
};
