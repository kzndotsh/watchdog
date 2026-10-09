import { isRecord } from "../lib/ast.mjs";
import { createEffectResolver } from "../lib/effect-calls.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void } & import("../lib/effect-calls.mjs").ScopeContext} RuleContext
 */

const TRY_FUNCTIONS = new Set(["try", "tryPromise"]);

/**
 * True when `arg` is an inline object literal with a direct `catch` property (a spread
 * may carry one, but that cannot be judged statically, so it does not count).
 * @param {unknown} arg
 * @returns {boolean}
 */
const hasCatchOption = (arg) => {
  if (!isRecord(arg) || arg.type !== "ObjectExpression") return false;
  if (!Array.isArray(arg.properties)) return false;
  return arg.properties.some((prop) => {
    if (!isRecord(prop)) return false;
    if (prop.type !== "Property" || !isRecord(prop.key)) return false;
    return prop.key.name === "catch" || prop.key.value === "catch";
  });
};

/**
 * Requires `Effect.try` / `Effect.tryPromise` to be called with an inline
 * `{ try, catch }` object. The bare thunk form types the failure as `UnknownError`, which
 * no caller can handle by tag. Replaces the regex gate `check-effect-edges.mjs`, which
 * accepted a bare call whenever a `catch:` appeared anywhere in the next 200 lines (so a
 * neighbouring call's handler hid it); this reads the call's own argument.
 */
export const effectTryRequiresCatch = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require Effect.try / Effect.tryPromise to be called with an inline { try, catch } object.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const effect = createEffectResolver(context);
    return {
      /** @param {{ body?: readonly unknown[] }} node */
      Program(node) {
        effect.init(node);
      },
      /** @param {{ callee: unknown, arguments: readonly unknown[] }} node */
      CallExpression(node) {
        const name = effect.calleeName(node.callee);
        if (name === null || !TRY_FUNCTIONS.has(name)) return;
        if (hasCatchOption(node.arguments[0])) return;
        context.report({
          node,
          message: `Effect.${name} without its own { try, catch } maps every failure to UnknownError: pass an inline object whose catch wraps the cause in a tagged error, e.g. Effect.${name}({ try: () => ..., catch: (cause) => new XError({ cause }) }) (docs/reference/platform/conventions.md, Effect row).`,
        });
      },
    };
  },
};
