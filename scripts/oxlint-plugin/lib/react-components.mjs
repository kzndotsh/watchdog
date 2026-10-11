import { isRecord } from "./ast.mjs";

/**
 * React-component name and wrapper helpers shared by the web component rules.
 */

/**
 * `Foo`, `FooBar2`, `H1`; not `foo`, not `FOO` / `FOO_BAR` / `MAX_ROWS` (constants), not
 * `useFoo`. PascalCase with a lowercase letter, or one capital followed only by digits.
 */
export const COMPONENT_NAME = /^[A-Z]([A-Za-z0-9]*[a-z][A-Za-z0-9]*|[0-9]+)?$/;
export const WRAPPERS = new Set(["memo", "forwardRef"]);

/**
 * @param {unknown} node
 * @returns {string | null}
 */
export const identifierName = (node) =>
  isRecord(node) && node.type === "Identifier" && typeof node.name === "string"
    ? node.name
    : null;

/**
 * Strips `x as T`, `x satisfies T`, `x!` and parentheses.
 * @param {unknown} node
 * @returns {unknown}
 */
export const unwrap = (node) => {
  let current = node;
  while (
    isRecord(current) &&
    (current.type === "TSAsExpression" ||
      current.type === "TSSatisfiesExpression" ||
      current.type === "TSNonNullExpression" ||
      current.type === "ParenthesizedExpression" ||
      current.type === "TSTypeAssertion")
  ) {
    current = current.expression;
  }
  return current;
};

/**
 * The called name of `f(...)` or `ns.f(...)` (`React.memo`), else null.
 * @param {unknown} callee
 * @returns {string | null}
 */
export const calleeName = (callee) => {
  const name = identifierName(callee);
  if (name !== null) return name;
  if (
    isRecord(callee) &&
    callee.type === "MemberExpression" &&
    callee.computed !== true
  ) {
    return identifierName(callee.property);
  }
  return null;
};

/**
 * The function node a PascalCase declaration builds as a component: a function
 * declaration, or a variable declarator initialised with a function or arrow, also inside
 * `memo` / `forwardRef`. Null for anything else.
 * @param {unknown} node a FunctionDeclaration or VariableDeclarator
 * @returns {{ name: string, fn: Record<string, unknown> } | null}
 */
export const componentFunction = (node) => {
  if (!isRecord(node)) return null;
  const name = identifierName(node.id);
  if (name === null || !COMPONENT_NAME.test(name)) return null;
  if (node.type === "FunctionDeclaration") return { name, fn: node };
  if (node.type !== "VariableDeclarator") return null;
  let expr = unwrap(node.init);
  while (isRecord(expr) && expr.type === "CallExpression") {
    const callee = calleeName(expr.callee);
    if (callee === null || !WRAPPERS.has(callee)) return null;
    expr = unwrap(Array.isArray(expr.arguments) ? expr.arguments[0] : null);
  }
  return isRecord(expr) &&
    (expr.type === "ArrowFunctionExpression" ||
      expr.type === "FunctionExpression")
    ? { name, fn: expr }
    : null;
};
