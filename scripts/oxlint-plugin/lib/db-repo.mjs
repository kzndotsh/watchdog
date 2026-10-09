/**
 * Shared pieces of the `db-repo-*` rules: the packages/db repo contract
 * (packages/db/AGENTS.md Repo contract) as AST checks on `src/repos/*.repo.ts`.
 * Scope is set by the `overrides` entry in `oxlint.config.ts`, not here.
 */
import { isRecord } from "./ast.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 * @typedef {Record<string, unknown>} Node
 */

/** Pointer every message ends with, so the agent knows where the contract is stated. */
export const REPO_CONTRACT = "packages/db/AGENTS.md Repo contract";

/** Lookup-only methods where `trimmedOrUndefined` is allowed (not display write validation). */
export const TRIM_LOOKUP_METHODS = new Set([
  "getIdByName",
  "getCiphertext",
  "deleteByName",
  "findIdByIdempotency",
  "listActiveForCapability",
  "listSucceededForCapability",
  "lookupActive",
  "upsert",
]);

/**
 * A rule that reports every node of `type` the `test` accepts.
 * @param {{ type: string, test: (node: Node) => boolean, description: string, message: string }} spec
 */
export const bansNode = ({ type, test, description, message }) => ({
  meta: { type: "problem", docs: { description } },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {Node} node */
      [type](node) {
        if (test(node)) context.report({ node, message });
      },
    };
  },
});

/**
 * Name of a non-computed member property or a computed string key.
 * @param {unknown} member
 * @returns {string | null}
 */
export const memberName = (member) => {
  if (!isRecord(member) || member.type !== "MemberExpression") return null;
  const { property } = member;
  if (!isRecord(property)) return null;
  if (!member.computed && property.type === "Identifier") {
    return typeof property.name === "string" ? property.name : null;
  }
  if (property.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  if (
    property.type === "TemplateLiteral" &&
    Array.isArray(property.expressions) &&
    property.expressions.length === 0 &&
    Array.isArray(property.quasis) &&
    isRecord(property.quasis[0]) &&
    isRecord(property.quasis[0].value) &&
    typeof property.quasis[0].value.cooked === "string"
  ) {
    return property.quasis[0].value.cooked;
  }
  return null;
};

/**
 * The callee name of `name(...)` or `ns.name(...)`, or null.
 * @param {Node} call
 * @returns {string | null}
 */
export const calleeName = (call) => {
  const { callee } = call;
  if (
    isRecord(callee) &&
    callee.type === "Identifier" &&
    typeof callee.name === "string"
  ) {
    return callee.name;
  }
  return memberName(callee);
};

/** Wrapper nodes that do not change which object an initializer is. */
const WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
]);

/**
 * Unwraps `x as const` / `x satisfies T` around an initializer.
 * @param {unknown} node
 * @returns {Node | null}
 */
const unwrap = (node) => {
  let current = node;
  while (isRecord(current) && WRAPPERS.has(String(current.type))) {
    current = current.expression;
  }
  return isRecord(current) ? current : null;
};

/**
 * True when `property` is a function-valued property (method, arrow, function expression)
 * of an object literal bound to a `...Repo` const: `export const thingRepo = { async get(...) {} }`.
 * @param {Node} property
 */
export const isRepoMethod = (property) => {
  if (property.type !== "Property") return false;
  const { value } = property;
  if (
    !isRecord(value) ||
    (value.type !== "FunctionExpression" &&
      value.type !== "ArrowFunctionExpression")
  ) {
    return false;
  }
  const object = property.parent;
  if (!isRecord(object) || object.type !== "ObjectExpression") return false;
  /** @type {unknown} */
  let up = object.parent;
  while (isRecord(up) && WRAPPERS.has(String(up.type))) up = up.parent;
  if (!isRecord(up) || up.type !== "VariableDeclarator") return false;
  const { id } = up;
  return (
    isRecord(id) &&
    id.type === "Identifier" &&
    typeof id.name === "string" &&
    id.name.endsWith("Repo") &&
    unwrap(up.init) === object
  );
};

/**
 * Name of a repo method's key (`get` in `get() {}` / `get: () => {}`), or null.
 * @param {Node} property
 * @returns {string | null}
 */
export const repoMethodName = (property) => {
  const { key } = property;
  if (!isRecord(key)) return null;
  if (!property.computed && key.type === "Identifier") {
    return typeof key.name === "string" ? key.name : null;
  }
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
};

/**
 * Visitor pair that tracks the enclosing repo method: `current()` is its name inside a
 * method (including nested functions) and null anywhere else in the file.
 */
export const trackRepoMethod = () => {
  /** @type {(string | null)[]} */
  const stack = [];
  return {
    current: () => stack.at(-1) ?? null,
    visitors: {
      /** @param {Node} node */
      Property(node) {
        if (isRepoMethod(node)) stack.push(repoMethodName(node));
      },
      /** @param {Node} node */
      "Property:exit"(node) {
        if (isRepoMethod(node)) stack.pop();
      },
    },
  };
};
