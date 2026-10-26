import { isRecord } from "../lib/ast.mjs";
import { propertyName } from "../lib/effect-calls.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 * @typedef {Record<string, unknown> & { parent?: Node }} Node
 */

/** Zod constructors that produce unbounded text or lists unless a `.max()` follows. */
const CONSTRUCTORS = new Set(["string", "array", "url", "email"]);

/** Chain methods that bound a string's length or an array's count. */
const BOUNDS = new Set(["max", "length"]);

/**
 * Modules where every declaration is an input building block (field primitives, ids, and the
 * list filter kinds and declaration): all of their schemas count as input schemas. Elsewhere a schema is an
 * input schema when it is a declaration named `*Input[Schema]`, `*Fields[Schema]`,
 * `*Filters[Schema]` or `*Params[Schema]`, or the argument of a procedure's `.input()`.
 */
const WHOLE_FILE =
  /\/packages\/schemas\/src\/(?:primitives|ids|lists\/filter-kinds|lists\/build-list-api)\.ts$/;
const INPUT_NAME = /(?:Input|Fields|Filters|Params)(?:Schema)?$/;

const FIX =
  "add `.max(<named limit>)` (NAME_MAX, NOTES_MAX, URL_MAX, ARRAY_MAX, ... from `@watchdog/schemas/shared`) or use `requiredText(max)` / `optionalText(max)` (conventions: input schemas are bounded)";

/**
 * `z.string()` / `z.array(...)` / `z.url()` / `z.email()`: the constructor name.
 * @param {Node} node
 * @returns {string | null}
 */
const constructorName = (node) => {
  const { callee } = node;
  if (
    !isRecord(callee) ||
    callee.type !== "MemberExpression" ||
    !isRecord(callee.object) ||
    callee.object.type !== "Identifier" ||
    callee.object.name !== "z"
  ) {
    return null;
  }
  const name = propertyName(callee);
  return name !== null && CONSTRUCTORS.has(name) ? name : null;
};

/**
 * The method this node is the receiver of: for `a` in `a.max(1)`, the `max` call.
 * @param {Node} node
 * @returns {Node | null}
 */
const chainParentCall = (node) => {
  const member = node.parent;
  if (
    !isRecord(member) ||
    member.type !== "MemberExpression" ||
    member.object !== node
  ) {
    return null;
  }
  const call = member.parent;
  return isRecord(call) &&
    call.type === "CallExpression" &&
    call.callee === member
    ? call
    : null;
};

/**
 * Method names called on `node` afterwards, in order, and the outermost node of that chain.
 * @param {Node} node
 * @returns {{ names: string[], top: Node }}
 */
const chainAbove = (node) => {
  /** @type {string[]} */
  const names = [];
  let top = node;
  for (let call = chainParentCall(top); call; call = chainParentCall(top)) {
    const name = isRecord(call.callee) ? propertyName(call.callee) : null;
    if (name !== null) names.push(name);
    top = call;
  }
  return { names, top };
};

/**
 * Method names called on the receiver chain below `node`: for `a.b().c()` the `b` and
 * `c` calls.
 * @param {unknown} node
 * @returns {Set<string>}
 */
const chainBelow = (node) => {
  /** @type {Set<string>} */
  const names = new Set();
  let current = node;
  while (isRecord(current) && current.type === "CallExpression") {
    const { callee } = current;
    if (!isRecord(callee) || callee.type !== "MemberExpression") break;
    const name = propertyName(callee);
    if (name !== null) names.add(name);
    current = callee.object;
  }
  return names;
};

/** @param {Iterable<string>} names */
const isBounded = (names) => [...names].some((name) => BOUNDS.has(name));

/**
 * What stays unbounded along a chain: a bound belongs to the segment it follows, and
 * `.array()` starts a new one, so `z.string().array().max(5)` bounds the list but not the
 * strings in it, and `z.string().max(5).array()` the strings but not the list.
 * @param {string} kind the constructor (`string`, `array`, `url`, `email`)
 * @param {readonly string[]} names method names called after it, in order
 * @returns {string[]}
 */
const unboundedKinds = (kind, names) => {
  /** @type {string[]} */
  const out = [];
  let current = kind;
  let bounded = false;
  for (const name of names) {
    if (BOUNDS.has(name)) bounded = true;
    if (name === "array") {
      if (!bounded) out.push(current);
      current = "array";
      bounded = false;
    }
  }
  if (!bounded) out.push(current);
  return out;
};

/**
 * `x.pipe(z.string()...)` where `x` is already bounded: the piped string never sees
 * more text than `x` let through.
 * @param {Node} top
 * @returns {boolean}
 */
const isPipedFromBounded = (top) => {
  const call = top.parent;
  if (
    !isRecord(call) ||
    call.type !== "CallExpression" ||
    !Array.isArray(call.arguments) ||
    !call.arguments.includes(top)
  ) {
    return false;
  }
  const { callee } = call;
  if (
    !isRecord(callee) ||
    callee.type !== "MemberExpression" ||
    propertyName(callee) !== "pipe"
  ) {
    return false;
  }
  return isBounded(chainBelow(callee.object));
};

/**
 * Whether a schema sits in an input position (see {@link WHOLE_FILE}). A schema inside
 * `.output(...)` is a wire shape, never an input.
 * @param {Node} node
 * @param {boolean} wholeFile
 * @returns {boolean}
 */
const isInputPosition = (node, wholeFile) => {
  let isInput = wholeFile;
  /** @type {unknown} */
  let child = node;
  for (let at = node.parent; isRecord(at); child = at, at = at.parent) {
    // Which call the node is an ARGUMENT of decides: `a.input(x).output(y)` holds x in
    // `.input`, not in `.output`, though `.output` is an ancestor of both.
    if (
      at.type === "CallExpression" &&
      isRecord(at.callee) &&
      at.callee.type === "MemberExpression" &&
      Array.isArray(at.arguments) &&
      at.arguments.includes(child)
    ) {
      const method = propertyName(at.callee);
      if (method === "output") return false;
      if (method === "input") isInput = true;
    }
    if (
      at.type === "VariableDeclarator" &&
      isRecord(at.id) &&
      at.id.type === "Identifier" &&
      typeof at.id.name === "string" &&
      INPUT_NAME.test(at.id.name)
    ) {
      isInput = true;
    }
  }
  return isInput;
};

/**
 * Fails an unbounded `z.string()`, `z.array()`, `z.url()` or `z.email()` in an input
 * schema: a field with no maximum lets one request carry unbounded text or lists. The
 * maximums are named once in `@watchdog/schemas` (`limits.ts`). Scope (paths) is in
 * `oxlint.config.ts`; there is no baseline. Policy: docs/reference/platform/conventions.md.
 */
export const boundedInputSchema = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a named maximum on every z.string() and z.array() in an input schema.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const wholeFile = WHOLE_FILE.test(context.filename.replaceAll("\\", "/"));
    return {
      /** @param {Node} node */
      CallExpression(node) {
        const name = constructorName(node);
        if (name === null) return;
        const { names, top } = chainAbove(node);
        const unbounded = unboundedKinds(name, names);
        if (unbounded.length === 0 || isPipedFromBounded(top)) return;
        if (!isInputPosition(node, wholeFile)) return;
        for (const kind of unbounded) {
          context.report({
            node,
            message: `unbounded ${kind === name ? `z.${name}()` : `list built with .${kind}()`} in an input schema: ${FIX}`,
          });
        }
      },
    };
  },
};
