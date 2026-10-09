import { isRecord, typeNameOf } from "../lib/ast.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/** Test-kit helpers that stamp a brand without validating (ADR-0003). */
const UNTRUSTED_ID_HELPERS = new Set([
  "untrustedCaseId",
  "untrustedOrganizationId",
]);

/**
 * Bans importing (or re-exporting) `untrustedCaseId` / `untrustedOrganizationId` from
 * `@watchdog/test-kit`. They stamp a brand on unvalidated text so tests can feed
 * malformed ids to code that must reject them; production code could use them to
 * bypass the validating constructors. Allowed trees are exempted in `oxlint.config.ts`.
 */
export const noUntrustedIdImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban importing untrustedCaseId / untrustedOrganizationId outside tests and test helpers.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    /** @param {{ source?: unknown, specifiers?: readonly unknown[] }} node */
    const check = (node) => {
      const { source } = node;
      if (
        !isRecord(source) ||
        typeof source.value !== "string" ||
        !(
          source.value.startsWith("@watchdog/test-kit") ||
          source.value === "@watchdog/schemas/testing"
        )
      ) {
        return;
      }
      for (const spec of node.specifiers ?? []) {
        if (!isRecord(spec)) continue;
        const name = typeNameOf(spec.imported ?? spec.local);
        if (name !== null && UNTRUSTED_ID_HELPERS.has(name)) {
          context.report({
            node: spec,
            message: `${name} stamps an unvalidated brand and is for tests only: mint ids with asCaseId / asOrganizationId or a schema parse (ADR-0003). Allowed in __tests__, *.test.ts, testing/ helper dirs and packages/test-db/src.`,
          });
        }
      }
    };
    return { ImportDeclaration: check, ExportNamedDeclaration: check };
  },
};
