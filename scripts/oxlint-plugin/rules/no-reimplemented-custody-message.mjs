import { isRecord } from "../lib/ast.mjs";
import { lexicalInits } from "../lib/scope.mjs";

/**
 * @typedef {{ filename: string, sourceCode?: { getScope?: (node: unknown) => import("../lib/scope.mjs").Scope | null }, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/**
 * The distinctive text of `CONFIRMED_REQUIRES_EVIDENCE` ("confirmed requires at least one
 * Evidence attachment") and its known variants, matched on lowercased text with runs of
 * whitespace collapsed. Deliberately narrow so user-facing copy that merely mentions
 * "confirmed" or "Evidence" stays legal.
 */
const PHRASES = [
  /confirmed requires (?:at least|evidence)/,
  /at least one evidence attachment/,
];

/** Stands for a value the rule cannot read, so text around it never joins into a match. */
const UNKNOWN = "\u0000";

/**
 * JSX text keeps entities raw: turn the space-like ones into a space before matching.
 * @param {string} text
 */
const decodeSpaces = (text) =>
  text.replaceAll(/&(?:nbsp|ensp|emsp|thinsp|#160|#x0*a0);/gi, " ");

/** @param {string} text */
const matches = (text) => {
  const norm = text.toLowerCase().replaceAll(/\s+/g, " ");
  return PHRASES.some((phrase) => phrase.test(norm));
};

/** Wrappers that do not change a value. */
const TRANSPARENT = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "ParenthesizedExpression",
]);

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * The static text of one template quasi (cooked, else raw).
 * @param {Record<string, unknown>} quasi
 * @param {string} fallback
 * @returns {string}
 */
const quasiText = (quasi, fallback) => {
  const value = quasi.value;
  if (!isRecord(value)) return fallback;
  if (typeof value.cooked === "string") return value.cooked;
  return typeof value.raw === "string" ? value.raw : fallback;
};

/**
 * @param {unknown} node
 * @returns {boolean}
 */
const isPlus = (node) =>
  isRecord(node) && node.type === "BinaryExpression" && node.operator === "+";

/**
 * `a.concat(...)` or `a.join(...)`: the member name, else null.
 * @param {unknown} node
 * @returns {"concat" | "join" | null}
 */
const methodOf = (node) => {
  if (!isRecord(node) || node.type !== "CallExpression") return null;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== "MemberExpression") return null;
  const prop = callee.property;
  if (!isRecord(prop)) return null;
  /** @type {unknown} */
  let name = prop.name;
  if (callee.computed === true)
    name = prop.type === "Literal" ? prop.value : null;
  return name === "concat" || name === "join" ? name : null;
};

/**
 * A node that builds a string out of parts: the rule evaluates the outermost one.
 * @param {unknown} node
 * @returns {boolean}
 */
const isBuilder = (node) =>
  isRecord(node) &&
  (isPlus(node) ||
    node.type === "TemplateLiteral" ||
    (methodOf(node) !== null && isRecord(node.callee)));

/**
 * True when `node` is an operand of an enclosing string builder (looking through
 * wrappers), so that builder is evaluated instead.
 * @param {Record<string, unknown>} node
 * @returns {boolean}
 */
const isOperand = (node) => {
  /** @type {unknown} */
  let child = node;
  let parent = isRecord(child) ? child.parent : null;
  while (isRecord(parent) && TRANSPARENT.has(String(parent.type))) {
    child = parent;
    parent = parent.parent;
  }
  if (!isRecord(parent)) return false;
  if (parent.type === "TemplateLiteral") return true;
  if (isPlus(parent)) return true;
  if (methodOf(parent) !== null) {
    return asArray(parent.arguments).includes(child);
  }
  // `receiver.concat(...)`: the receiver hangs off the call through its member expression.
  const call = parent.parent;
  return (
    parent.type === "MemberExpression" &&
    parent.object === child &&
    isRecord(call) &&
    call.callee === parent &&
    methodOf(call) !== null
  );
};

/**
 * Bans spelling the custody evidence message outside `@watchdog/policy`: a string or
 * template literal whose text holds the message (or its distinctive phrase), and the
 * same text split across a `+` chain, template parts, `concat`, `join` or consts the
 * parts resolve to by lexical scope. An imported `CONFIRMED_REQUIRES_EVIDENCE` (named,
 * aliased or through a namespace) is opaque and always legal; so is any part the rule
 * cannot read. A split message is reported once, on the whole expression, never at each
 * piece. A const is read only when proven unchanged: a `let` / `var` written anywhere
 * else in the file (assignment, `+=`, `++`, destructuring or `for ... of` target) is
 * unknown, and a destructured binding is never read. Plain JSX text is checked too
 * (`<p>confirmed requires evidence</p>`, whitespace and `&nbsp;`-style entities
 * normalised); text split across elements (`<b>confirmed</b> requires ...`) is not a
 * finding, since no single node spells it. `@watchdog/policy` itself is switched off by `overrides` in `oxlint.config.ts`.
 */
export const noReimplementedCustodyMessage = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban re-typing the custody evidence message outside @watchdog/policy.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const message =
      "the custody evidence message is typed here, a second copy that drifts from the rule: import CONFIRMED_REQUIRES_EVIDENCE (or call confirmedEvidenceViolation) from @watchdog/policy in server code and from @watchdog/policy/confirmed-evidence in browser code, never the @watchdog/policy root; web forms ask isConfirmedBlocked in apps/web/src/shared/lib/confirmed-evidence.ts (conventions: one source per domain rule)";

    /** Names written after their declaration anywhere in the file (`x = ...`, `x += ...`, `x++`, `[x] = ...`). */
    const written = new Set();
    /** @param {unknown} target */
    const markWritten = (target) => {
      if (!isRecord(target)) return;
      if (target.type === "Identifier" && typeof target.name === "string") {
        written.add(target.name);
      } else if (target.type === "ArrayPattern") {
        for (const e of asArray(target.elements)) markWritten(e);
      } else if (target.type === "ObjectPattern") {
        for (const p of asArray(target.properties)) {
          markWritten(isRecord(p) && p.type === "Property" ? p.value : p);
        }
      } else if (target.type === "RestElement") markWritten(target.argument);
      else if (target.type === "AssignmentPattern") markWritten(target.left);
    };

    /**
     * The one initializer a name provably keeps: a `const`, or a `let` / `var` never
     * written after its declaration. Anything else (reassigned, several declarations,
     * unreadable scope) is null and evaluates as unknown.
     * @param {string} name
     * @param {unknown} at
     * @returns {{ node: unknown, at: unknown } | null}
     */
    const stableInit = (name, at) => {
      const inits = lexicalInits(context, name, at) ?? [];
      const [init] = inits;
      if (inits.length !== 1 || init === undefined) return null;
      const decl = isRecord(init.at) ? init.at : null;
      const kind =
        decl !== null && isRecord(decl.parent) ? decl.parent.kind : null;
      if (kind !== "const" && written.has(name)) return null;
      return init;
    };

    /**
     * The text units a string expression is built from, in order. An identifier is one
     * unit holding the text of its (lexically resolved) initializer; an import, a
     * parameter or any other value is `UNKNOWN`.
     * @param {unknown} node
     * @param {unknown} at node whose scope resolves identifiers
     * @param {Set<unknown>} seen
     * @returns {string[]}
     */
    const units = (node, at, seen) => {
      if (!isRecord(node) || seen.has(node)) return [UNKNOWN];
      seen.add(node);
      try {
        return evalUnits(node, at, seen);
      } finally {
        seen.delete(node);
      }
    };

    /**
     * @param {Record<string, unknown>} node
     * @param {unknown} at
     * @param {Set<unknown>} seen
     * @returns {string[]}
     */
    const evalUnits = (node, at, seen) => {
      const type = String(node.type);
      if (TRANSPARENT.has(type)) return units(node.expression, at, seen);
      if (type === "Literal") {
        return typeof node.value === "string" ? [node.value] : [UNKNOWN];
      }
      if (type === "TemplateLiteral") {
        const quasis = asArray(node.quasis).map((q) =>
          isRecord(q) ? quasiText(q, UNKNOWN) : UNKNOWN
        );
        const exprs = asArray(node.expressions);
        return quasis.flatMap((q, i) => [
          q,
          ...(i < exprs.length ? units(exprs[i], at, seen) : []),
        ]);
      }
      if (isPlus(node)) {
        return [...units(node.left, at, seen), ...units(node.right, at, seen)];
      }
      if (type === "Identifier" && typeof node.name === "string") {
        const init = stableInit(node.name, at);
        if (init === null) return [UNKNOWN];
        return [units(init.node, init.at, seen).join("")];
      }
      if (type === "ArrayExpression") {
        return asArray(node.elements).flatMap((e) => units(e, at, seen));
      }
      const method = methodOf(node);
      if (method !== null && isRecord(node.callee)) {
        const object = node.callee.object;
        const args = asArray(node.arguments);
        if (method === "concat") {
          return [
            ...units(object, at, seen),
            ...args.flatMap((a) => units(a, at, seen)),
          ];
        }
        const [sepNode] = args;
        const sep =
          sepNode === undefined ? [","] : units(sepNode, at, new Set(seen));
        const items = isRecord(object)
          ? joinItems(object, at, seen)
          : [[UNKNOWN]];
        return items.flatMap((item, i) => (i === 0 ? item : [...sep, ...item]));
      }
      return [UNKNOWN];
    };

    /**
     * Each element of the array a `join` receiver names, as its own unit list.
     * @param {Record<string, unknown>} object
     * @param {unknown} at
     * @param {Set<unknown>} seen
     * @returns {string[][]}
     */
    const joinItems = (object, at, seen) => {
      /** @type {unknown} */
      let array = object;
      let scope = at;
      if (
        isRecord(object) &&
        object.type === "Identifier" &&
        typeof object.name === "string"
      ) {
        const init = stableInit(object.name, at);
        if (init === null) return [[UNKNOWN]];
        array = init.node;
        scope = init.at;
      }
      if (!isRecord(array) || array.type !== "ArrayExpression") {
        return [[UNKNOWN]];
      }
      return asArray(array.elements).map((e) => units(e, scope, new Set(seen)));
    };

    /**
     * Queue the builder `node` for evaluation at `Program:exit`, once every write in
     * the file is known; an operand of a larger builder is left to that builder.
     * @param {Record<string, unknown>} node
     */
    const checkBuilder = (node) => {
      if (isOperand(node)) return;
      builders.push(node);
    };

    /** @type {Record<string, unknown>[]} Builders queued by `checkBuilder`. */
    const builders = [];

    return {
      "Program:exit"() {
        for (const node of builders) {
          const parts = units(node, node, new Set());
          if (parts.some((part) => matches(part))) continue;
          if (matches(parts.join(""))) context.report({ node, message });
        }
      },
      /** @param {Record<string, unknown>} node */
      AssignmentExpression(node) {
        markWritten(node.left);
      },
      /** @param {Record<string, unknown>} node */
      UpdateExpression(node) {
        markWritten(node.argument);
      },
      /** @param {Record<string, unknown>} node */
      ForInStatement(node) {
        if (isRecord(node.left) && node.left.type !== "VariableDeclaration")
          markWritten(node.left);
      },
      /** @param {Record<string, unknown>} node */
      ForOfStatement(node) {
        if (isRecord(node.left) && node.left.type !== "VariableDeclaration")
          markWritten(node.left);
      },
      /** @param {Record<string, unknown>} node */
      JSXText(node) {
        if (
          typeof node.value === "string" &&
          matches(decodeSpaces(node.value))
        ) {
          context.report({ node, message });
        }
      },
      /** @param {Record<string, unknown>} node */
      Literal(node) {
        if (typeof node.value === "string" && matches(node.value)) {
          context.report({ node, message });
        }
      },
      /** @param {Record<string, unknown>} node */
      TemplateLiteral(node) {
        const quasis = asArray(node.quasis).map((q) =>
          isRecord(q) ? quasiText(q, "") : ""
        );
        if (quasis.some((q) => matches(q))) {
          context.report({ node, message });
          return;
        }
        if (isBuilder(node)) checkBuilder(node);
      },
      /** @param {Record<string, unknown>} node */
      BinaryExpression(node) {
        if (isPlus(node)) checkBuilder(node);
      },
      /** @param {Record<string, unknown>} node */
      CallExpression(node) {
        if (methodOf(node) !== null) checkBuilder(node);
      },
    };
  },
};
