/**
 * @typedef {{ source: { type: string, value?: unknown } }} ImportExpressionNode
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/**
 * A rule banning `import("<specifier>")`, which `no-restricted-imports` misses.
 * @param {string} specifier
 * @param {string} description
 * @param {string} message
 */
export const bansDynamicImport = (specifier, description, message) => ({
  meta: { type: "problem", docs: { description } },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {ImportExpressionNode} node */
      ImportExpression(node) {
        if (node.source.type === "Literal" && node.source.value === specifier) {
          context.report({ node, message });
        }
      },
    };
  },
});
