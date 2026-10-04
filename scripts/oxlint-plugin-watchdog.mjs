/**
 * Local oxlint JS plugin: rules oxlint has no built-in for (it ships no
 * `no-restricted-syntax`). Loaded from `oxlint.config.ts` `jsPlugins`.
 */

const DB_PACKAGE = "@watchdog/db";

/**
 * @typedef {{ source: { type: string, value?: unknown } }} ImportExpressionNode
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const noCoreDbDynamicImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban `import('@watchdog/db')`, which bypasses the static global-db import ban.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {ImportExpressionNode} node */
      ImportExpression(node) {
        if (
          node.source.type === "Literal" &&
          node.source.value === DB_PACKAGE
        ) {
          context.report({
            node,
            message:
              "Core reads the database through the Db service (tryDbWith / transact, see packages/core/AGENTS.md); a dynamic import of @watchdog/db bypasses the global-db ban.",
          });
        }
      },
    };
  },
};

export default {
  meta: { name: "watchdog" },
  rules: { "no-core-db-dynamic-import": noCoreDbDynamicImport },
};
