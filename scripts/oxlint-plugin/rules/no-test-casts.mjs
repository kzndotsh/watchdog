import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/**
 * @param {unknown} annotation
 * @param {string} kind
 */
const isKeyword = (annotation, kind) =>
  isRecord(annotation) && annotation.type === kind;

/**
 * Bans `x as never` and `x as unknown as T` in tests: a cast that silences a type error
 * hides the drift between the test and the type it exercises. Build a valid value (a
 * `build*` helper from `@watchdog/schemas/testing` or `apps/web/src/testing/records.ts`),
 * or use the `untrusted*` helpers for deliberately invalid input. `as const`, a single
 * `as T` and `as unknown` alone stay legal. Existing casts are baselined per file
 * (shrink-only). Policy: docs/contributing/testing/standards.md Mock policy.
 */
export const noTestCasts = withBaseline("no-test-casts", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban `as never` and `as unknown as T` casts in tests; fix the types instead.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      TSAsExpression(node) {
        if (isKeyword(node.typeAnnotation, "TSNeverKeyword")) {
          context.report({
            node,
            message:
              "`as never` in a test silences a type error: pass a valid value (a build* helper) or an untrusted* helper for deliberately invalid input (standards.md: never cast to silence a test type error; Mock policy)",
          });
          return;
        }
        if (
          isRecord(node.expression) &&
          node.expression.type === "TSAsExpression" &&
          isKeyword(node.expression.typeAnnotation, "TSUnknownKeyword") &&
          !isKeyword(node.typeAnnotation, "TSUnknownKeyword")
        ) {
          context.report({
            node,
            message:
              "`as unknown as T` in a test silences a type error: build a value of the real type (a build* helper, a typed fake of the interface) instead of forcing one (standards.md: never cast to silence a test type error; Mock policy)",
          });
        }
      },
    };
  },
});
