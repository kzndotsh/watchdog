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
 * The called name of `f(...)` or `ns.f(...)` (`React.memo`), else null. Matches by
 * spelling on purpose: it only decides whether a PascalCase declaration is a component
 * (`memo` / `forwardRef` wrappers), so a same-named local helper at worst treats one more
 * declaration as a component; binding-aware lookups live in `scope.mjs`.
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
 * Module-level function declarations and variable declarators by name, so a wrapper
 * argument `memo(impl)` can be resolved to the function it wraps.
 * @param {readonly unknown[]} body
 * @returns {Map<string, unknown>}
 */
export const moduleBindings = (body) => {
  /** @type {Map<string, unknown>} */
  const locals = new Map();
  /** @param {unknown} decl */
  const add = (decl) => {
    if (!isRecord(decl)) return;
    if (decl.type === "FunctionDeclaration") {
      const name = identifierName(decl.id);
      if (name !== null) locals.set(name, decl);
    } else if (decl.type === "VariableDeclaration") {
      for (const d of Array.isArray(decl.declarations)
        ? decl.declarations
        : []) {
        const name = isRecord(d) ? identifierName(d.id) : null;
        if (name !== null) locals.set(name, d);
      }
    }
  };
  for (const stmt of body) {
    if (!isRecord(stmt)) continue;
    add(
      stmt.type === "ExportNamedDeclaration" ||
        stmt.type === "ExportDefaultDeclaration"
        ? stmt.declaration
        : stmt
    );
  }
  return locals;
};

/**
 * @param {unknown} expr
 * @returns {Record<string, unknown> | null}
 */
const asFunction = (expr) =>
  isRecord(expr) &&
  (expr.type === "ArrowFunctionExpression" ||
    expr.type === "FunctionExpression")
    ? expr
    : null;

/**
 * The function node a PascalCase declaration builds as a component: a function
 * declaration, or a variable declarator initialised with a function or arrow, also inside
 * `memo` / `forwardRef`. A wrapper argument that is an identifier resolves through
 * `locals` (module-level bindings) to a local function declaration or function-valued
 * constant; an imported or unresolvable identifier yields null. Null for anything else.
 * @param {unknown} node a FunctionDeclaration or VariableDeclarator
 * @param {ReadonlyMap<string, unknown>} [locals]
 * @returns {{ name: string, fn: Record<string, unknown> } | null}
 */
export const componentFunction = (node, locals = new Map()) => {
  if (!isRecord(node)) return null;
  const name = identifierName(node.id);
  if (name === null || !COMPONENT_NAME.test(name)) return null;
  if (node.type === "FunctionDeclaration") return { name, fn: node };
  if (node.type !== "VariableDeclarator") return null;
  let expr = unwrap(node.init);
  let wrapped = false;
  while (isRecord(expr) && expr.type === "CallExpression") {
    const callee = calleeName(expr.callee);
    if (callee === null || !WRAPPERS.has(callee)) return null;
    expr = unwrap(Array.isArray(expr.arguments) ? expr.arguments[0] : null);
    wrapped = true;
  }
  const impl = identifierName(expr);
  if (wrapped && impl !== null) {
    const decl = locals.get(impl);
    if (!isRecord(decl)) return null;
    if (decl.type === "FunctionDeclaration") return { name, fn: decl };
    const fn = asFunction(
      decl.type === "VariableDeclarator" ? unwrap(decl.init) : null
    );
    return fn === null ? null : { name, fn };
  }
  const fn = asFunction(expr);
  return fn === null ? null : { name, fn };
};
