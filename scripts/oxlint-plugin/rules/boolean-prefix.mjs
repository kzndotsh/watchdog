import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { calleeName, identifierName } from "../lib/react-components.mjs";
import { webSrcPath } from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const PREFIXED = /^_*(is|has|can|should)([A-Z0-9]|$)/;
const CONSTANT = /^_*[A-Z][A-Z0-9_]*$/;

/**
 * Prop names that must keep their spelling because they are an HTML attribute or a
 * Radix / shadcn control contract (a prop forwarded to a native element or a primitive:
 * `<button disabled>`, `<Dialog open defaultOpen>`). Applies to props only: a local
 * variable, state or parameter of the same name is renamed. Documented, with the reason,
 * in `docs/reference/web/ui/rules.md`.
 */
const BOOLEAN_PROP_ALLOWLIST = new Set([
  "disabled",
  "checked",
  "defaultChecked",
  "open",
  "defaultOpen",
  "required",
  "readOnly",
  "hidden",
  "multiple",
  "autoFocus",
]);

const COMPARISONS = new Set([
  "===",
  "!==",
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "in",
  "instanceof",
]);

/**
 * `boolean` or `boolean | undefined` (the type node, not the annotation wrapper).
 * @param {unknown} type
 */
const isBooleanType = (type) => {
  if (!isRecord(type)) return false;
  if (type.type === "TSBooleanKeyword") return true;
  if (type.type !== "TSUnionType" || !Array.isArray(type.types)) return false;
  /** @type {readonly unknown[]} */
  const members = type.types;
  return (
    members.length === 2 &&
    members.some((m) => isRecord(m) && m.type === "TSBooleanKeyword") &&
    members.some((m) => isRecord(m) && m.type === "TSUndefinedKeyword")
  );
};

/**
 * @param {unknown} annotation a `typeAnnotation` wrapper (`: T`)
 */
const annotatesBoolean = (annotation) =>
  isRecord(annotation) && isBooleanType(annotation.typeAnnotation);

/**
 * @param {unknown} node
 */
const isBooleanLiteral = (node) =>
  isRecord(node) && node.type === "Literal" && typeof node.value === "boolean";

/**
 * An initializer whose boolean type is certain from syntax alone: a literal, a unary
 * `!`, or a comparison / `in` / `instanceof`. `&&`, `||`, `??` and ternaries are not.
 * @param {unknown} init
 */
const isCertainBoolean = (init) => {
  if (!isRecord(init)) return false;
  if (isBooleanLiteral(init)) return true;
  if (init.type === "UnaryExpression") return init.operator === "!";
  return (
    init.type === "BinaryExpression" &&
    typeof init.operator === "string" &&
    COMPARISONS.has(init.operator)
  );
};

/**
 * The type arguments of a call (`useState<boolean>`), across parser spellings.
 * @param {Record<string, unknown>} call
 * @returns {readonly unknown[]}
 */
const typeArgs = (call) => {
  const holder = call.typeArguments ?? call.typeParameters;
  return isRecord(holder) && Array.isArray(holder.params) ? holder.params : [];
};

/**
 * `useState(true)` / `useState<boolean>(x)` / `useRef<boolean>(x)` / `useRef(false)`:
 * the identifier the state value or ref is bound to (never the setter), else null.
 * @param {Record<string, unknown>} declarator
 * @returns {Record<string, unknown> | null}
 */
const hookBoolean = (declarator) => {
  const init = declarator.init;
  if (!isRecord(init) || init.type !== "CallExpression") return null;
  const callee = calleeName(init.callee);
  if (callee !== "useState" && callee !== "useRef") return null;
  const args = Array.isArray(init.arguments) ? init.arguments : [];
  const [first] = typeArgs(init);
  const certain =
    first === undefined ? isBooleanLiteral(args[0]) : isBooleanType(first);
  if (!certain) return null;
  const id = declarator.id;
  /** @type {readonly unknown[]} */
  const elements =
    isRecord(id) && id.type === "ArrayPattern" && Array.isArray(id.elements)
      ? id.elements
      : [];
  const target =
    callee === "useState" && elements.length > 0 ? elements[0] : id;
  return isRecord(target) && target.type === "Identifier" ? target : null;
};

/**
 * Requires boolean props, parameters and variables in web code to read as a predicate:
 * prefixed `is` / `has` / `can` / `should`. Only syntactically certain booleans count
 * (oxlint plugins have no type information): a property signature annotated `boolean` or
 * `boolean | undefined`; a parameter or variable annotated `boolean`; a variable
 * initialised with `true` / `false`, a unary `!` or a comparison (`===`, `<`, `in`,
 * `instanceof`, ...); the state variable of `useState<boolean>` / `useState(true)` and
 * the ref of `useRef<boolean>` / `useRef(false)`. Anything inferred (`a && b`, a call
 * result, an unannotated prop) is not checked. `BOOLEAN_PROP_ALLOWLIST` keeps HTML and
 * primitive contract prop names; `SCREAMING_CASE` constants are not checked.
 */
export const booleanPrefix = withBaseline("boolean-prefix", {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require boolean props and variables in web code to be prefixed is/has/can/should.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    if (webSrcPath(context.filename) === null) return {};
    /**
     * @param {unknown} node the node to report on
     * @param {unknown} nameNode
     * @param {string} kind
     */
    const check = (node, nameNode, kind) => {
      const name = identifierName(nameNode);
      if (
        name === null ||
        PREFIXED.test(name) ||
        CONSTANT.test(name) ||
        (kind === "prop" && BOOLEAN_PROP_ALLOWLIST.has(name))
      ) {
        return;
      }
      context.report({
        node,
        message: `Boolean ${kind} \`${name}\` should be prefixed is/has/can/should (e.g. \`is${name.charAt(0).toUpperCase()}${name.slice(1)}\`): a boolean reads as a predicate (conventions: boolean props and variables are prefixed is/has/can/should)`,
      });
    };
    /** @param {Record<string, unknown>} fn */
    const checkParams = (fn) => {
      for (const param of Array.isArray(fn.params) ? fn.params : []) {
        if (isRecord(param) && annotatesBoolean(param.typeAnnotation)) {
          check(param, param, "parameter");
        }
      }
    };
    return {
      /** @param {Record<string, unknown>} node */
      TSPropertySignature(node) {
        if (node.computed === true || !annotatesBoolean(node.typeAnnotation)) {
          return;
        }
        check(node, node.key, "prop");
      },
      FunctionDeclaration: checkParams,
      FunctionExpression: checkParams,
      ArrowFunctionExpression: checkParams,
      /** @param {Record<string, unknown>} node */
      VariableDeclarator(node) {
        const id = node.id;
        if (!isRecord(id)) return;
        if (
          id.type === "Identifier" &&
          (annotatesBoolean(id.typeAnnotation) || isCertainBoolean(node.init))
        ) {
          check(node, id, "variable");
          return;
        }
        const hook = hookBoolean(node);
        if (hook !== null) check(node, hook, "state");
      },
    };
  },
});
