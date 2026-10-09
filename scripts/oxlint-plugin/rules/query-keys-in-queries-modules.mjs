import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { staticKeyName } from "../lib/react-query.mjs";

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
 * True when an expression can evaluate to a key tuple: the tuple itself or any branch of
 * a conditional, logical or sequence expression.
 * @param {unknown} node
 * @returns {boolean}
 */
const yieldsKeyTuple = (node) => {
  const expr = unwrap(node);
  if (!isRecord(expr)) return false;
  if (expr.type === "ConditionalExpression") {
    return yieldsKeyTuple(expr.consequent) || yieldsKeyTuple(expr.alternate);
  }
  if (expr.type === "LogicalExpression") {
    return yieldsKeyTuple(expr.left) || yieldsKeyTuple(expr.right);
  }
  if (expr.type === "SequenceExpression" && Array.isArray(expr.expressions)) {
    return yieldsKeyTuple(expr.expressions.at(-1));
  }
  return isKeyTuple(expr);
};

/**
 * True when any `return` reachable in a statement (through blocks, `if`, `switch`, `try`
 * and loops, never into a nested function) returns a key tuple.
 * @param {unknown} stmt
 * @returns {boolean}
 */
const statementReturnsKeyTuple = (stmt) => {
  if (!isRecord(stmt)) return false;
  switch (stmt.type) {
    case "ReturnStatement": {
      return yieldsKeyTuple(stmt.argument);
    }
    case "BlockStatement": {
      return (
        Array.isArray(stmt.body) && stmt.body.some(statementReturnsKeyTuple)
      );
    }
    case "IfStatement": {
      return (
        statementReturnsKeyTuple(stmt.consequent) ||
        statementReturnsKeyTuple(stmt.alternate)
      );
    }
    case "SwitchStatement": {
      return (
        Array.isArray(stmt.cases) &&
        stmt.cases.some(
          (c) =>
            isRecord(c) &&
            Array.isArray(c.consequent) &&
            c.consequent.some(statementReturnsKeyTuple)
        )
      );
    }
    case "TryStatement": {
      return (
        statementReturnsKeyTuple(stmt.block) ||
        (isRecord(stmt.handler) &&
          statementReturnsKeyTuple(stmt.handler.body)) ||
        statementReturnsKeyTuple(stmt.finalizer)
      );
    }
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement":
    case "WhileStatement":
    case "DoWhileStatement":
    case "LabeledStatement": {
      return statementReturnsKeyTuple(stmt.body);
    }
    default: {
      return false;
    }
  }
};

/**
 * True for an arrow or function that returns a key tuple on any branch.
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
  if (body.type !== "BlockStatement") return yieldsKeyTuple(body);
  return statementReturnsKeyTuple(body);
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
        const name = staticKeyName(node);
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
