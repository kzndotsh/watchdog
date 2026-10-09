import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const MESSAGE =
  "Query key built outside a queries module: define the key factory in the domain's `queries.ts` (or its `*-queries.ts` / `*-keys.ts` module, or a shared queries module) and import it here, so invalidation and the query agree on one key (conventions: query keys only in queries modules)";

/** `[ "entities", id ]`-style names and `*Keys` factory objects. */
const KEY_ARRAY_NAME = /(?:[qQ]ueryKey|_QUERY_KEY|_KEY)$/;
const KEYS_OBJECT_NAME = /(?:[qQ]ueryKeys?|Keys)$/;
const KEY_FUNCTION_NAME = /(?:[qQ]ueryKeys?|Keys?)$/;

/** Wrappers that do not change what a value is: `as const`, `satisfies`, `!`, parens. */
const WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
]);

/**
 * @param {unknown} node
 * @returns {unknown}
 */
const unwrap = (node) => {
  let current = node;
  while (
    isRecord(current) &&
    typeof current.type === "string" &&
    WRAPPERS.has(current.type)
  ) {
    current = current.expression;
  }
  return current;
};

/**
 * @param {unknown} node
 * @returns {node is { type: "ArrayExpression", elements: readonly unknown[] }}
 */
const isArrayLiteral = (node) =>
  isRecord(node) && node.type === "ArrayExpression";

/**
 * A key tuple: an array literal whose first element is a string (a key namespace).
 * @param {unknown} node
 */
const isKeyTuple = (node) => {
  const array = unwrap(node);
  if (!isArrayLiteral(array)) return false;
  const first = array.elements[0];
  return (
    isRecord(first) &&
    (first.type === "TemplateLiteral" ||
      (first.type === "Literal" && typeof first.value === "string"))
  );
};

/**
 * True for an arrow or function that returns a key tuple (expression body, or a
 * top-level `return` statement).
 * @param {unknown} node
 */
const returnsKeyTuple = (node) => {
  const fn = unwrap(node);
  if (
    !isRecord(fn) ||
    (fn.type !== "ArrowFunctionExpression" &&
      fn.type !== "FunctionExpression" &&
      fn.type !== "FunctionDeclaration")
  ) {
    return false;
  }
  const { body } = fn;
  if (!isRecord(body)) return false;
  if (body.type !== "BlockStatement") return isKeyTuple(body);
  const statements = Array.isArray(body.body) ? body.body : [];
  return statements.some(
    (stmt) =>
      isRecord(stmt) &&
      stmt.type === "ReturnStatement" &&
      isKeyTuple(stmt.argument)
  );
};

/** @param {unknown} node a value that is a key tuple or a function returning one */
const isKeyProducer = (node) => isKeyTuple(node) || returnsKeyTuple(node);

/**
 * @param {unknown} init
 */
const isKeysObject = (init) => {
  const object = unwrap(init);
  if (!isRecord(object) || object.type !== "ObjectExpression") return false;
  const props = Array.isArray(object.properties) ? object.properties : [];
  return props.some(
    (prop) =>
      isRecord(prop) && prop.type === "Property" && isKeyProducer(prop.value)
  );
};

/**
 * Query key factories (a `*Keys` object of key tuples or functions returning them, a
 * `*_KEY` / `*QueryKey` tuple or key function, and a `queryKey: [...]` literal) are
 * defined only in a queries module: a domain's `queries.ts`, a `*-queries.ts` or
 * `*-keys.ts` file. Other files import the factory. The queries modules and the test
 * trees are switched off by `overrides` in `oxlint.config.ts`, which is the definition.
 * Calling a factory (`queryKey: casesKeys.all`) is not a definition and stays legal.
 * Existing definitions are baselined per file (shrink-only).
 */
export const keysInQueries = withBaseline("query-keys-in-queries-modules", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban query key factories and queryKey array literals outside apps/web queries modules.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      Property(node) {
        const { key } = node;
        if (!isRecord(key) || node.computed === true) return;
        const name = key.type === "Identifier" ? key.name : key.value;
        if (name === "queryKey" && isArrayLiteral(unwrap(node.value))) {
          context.report({ node, message: MESSAGE });
        }
      },
      /** @param {Record<string, unknown>} node */
      VariableDeclarator(node) {
        const { id, init } = node;
        if (!isRecord(id) || id.type !== "Identifier") return;
        const { name } = id;
        if (typeof name !== "string") return;
        const keyArray = KEY_ARRAY_NAME.test(name) && isKeyProducer(init);
        const keyFunction =
          KEY_FUNCTION_NAME.test(name) && returnsKeyTuple(init);
        const keysObject = KEYS_OBJECT_NAME.test(name) && isKeysObject(init);
        if (keyArray || keyFunction || keysObject) {
          context.report({ node, message: MESSAGE });
        }
      },
      /** @param {Record<string, unknown>} node */
      FunctionDeclaration(node) {
        const { id } = node;
        if (!isRecord(id) || typeof id.name !== "string") return;
        if (KEY_FUNCTION_NAME.test(id.name) && returnsKeyTuple(node)) {
          context.report({ node, message: MESSAGE });
        }
      },
    };
  },
});
