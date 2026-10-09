/**
 * Resolves calls to `effect/Effect` functions (`Effect.runPromise(...)`, an aliased
 * `E.runPromise(...)`, `Effect["runPromise"](...)`, a named `runPromise(...)` import) for
 * the Effect edge rules. Nodes are plain ESTree objects; see ast.mjs.
 */
import { isRecord } from "./ast.mjs";

/**
 * @typedef {{ set: Map<string, { defs: readonly { type?: string }[] }>, upper: Scope | null }} Scope
 * @typedef {{ sourceCode?: { getScope?: (node: unknown) => Scope | null } }} ScopeContext
 */

const EFFECT_MODULES = new Set(["effect", "effect/Effect"]);

/**
 * The statically known name of a member's property: `.x`, `["x"]` or `` [`x`] ``.
 * @param {Record<string, unknown>} member
 * @returns {string | null}
 */
export const propertyName = (member) => {
  const { property } = member;
  if (!isRecord(property)) return null;
  if (member.computed !== true) {
    return property.type === "Identifier" && typeof property.name === "string"
      ? property.name
      : null;
  }
  if (property.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  if (
    property.type === "TemplateLiteral" &&
    Array.isArray(property.expressions) &&
    property.expressions.length === 0 &&
    Array.isArray(property.quasis) &&
    property.quasis.length === 1
  ) {
    /** @type {readonly unknown[]} */
    const quasis = property.quasis;
    const quasi = quasis[0];
    if (isRecord(quasi) && isRecord(quasi.value)) {
      const { cooked } = quasi.value;
      return typeof cooked === "string" ? cooked : null;
    }
  }
  return null;
};

/**
 * True when `name`, seen from `node`, resolves to a binding that is not an import (a
 * local variable or parameter shadowing it). Without scope support nothing is shadowed.
 * @param {ScopeContext} context
 * @param {string} name
 * @param {unknown} node
 */
export const isShadowedBinding = (context, name, node) => {
  const source = context.sourceCode;
  if (typeof source?.getScope !== "function") return false;
  /** @type {Scope | null | undefined} */
  let scope = source.getScope(node);
  while (scope) {
    const variable = scope.set.get(name);
    if (variable) return variable.defs[0]?.type !== "ImportBinding";
    scope = scope.upper;
  }
  return false;
};

/**
 * Tracks the local names bound to the `Effect` namespace and to named `Effect` exports
 * in one file. `Effect` is always a namespace name: the codebase imports it that way and
 * a file that uses it without an import is still talking about the Effect namespace. A
 * name that a nested scope rebinds (a parameter or local variable) is not Effect.
 *
 * Call `init(program)` from the rule's `Program` visitor (imports hoist, so they are
 * collected before any call is judged), then `calleeName(callee)` per call.
 * @param {ScopeContext} context
 */
export const createEffectResolver = (context) => {
  const namespaces = new Set(["Effect"]);
  /** @type {Map<string, string>} local name -> exported function name */
  const named = new Map();

  /** @param {Record<string, unknown>} node an ImportDeclaration */
  const record = (node) => {
    const { source } = node;
    if (!isRecord(source) || typeof source.value !== "string") return;
    if (!EFFECT_MODULES.has(source.value)) return;
    const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
    for (const spec of specifiers) {
      if (!isRecord(spec) || !isRecord(spec.local)) continue;
      const local = spec.local.name;
      if (typeof local !== "string") continue;
      if (spec.type === "ImportNamespaceSpecifier") {
        if (source.value === "effect/Effect") namespaces.add(local);
      } else if (spec.type === "ImportSpecifier" && isRecord(spec.imported)) {
        const imported = spec.imported.name ?? spec.imported.value;
        if (typeof imported !== "string") continue;
        if (source.value === "effect" && imported === "Effect") {
          namespaces.add(local);
        } else if (source.value === "effect/Effect") {
          named.set(local, imported);
        }
      }
    }
  };

  /**
   * @param {string} name
   * @param {unknown} node
   */
  const isShadowed = (name, node) => isShadowedBinding(context, name, node);

  return {
    /** @param {{ body?: readonly unknown[] }} program */
    init(program) {
      for (const stmt of program.body ?? []) {
        if (isRecord(stmt) && stmt.type === "ImportDeclaration") record(stmt);
      }
    },
    /**
     * The `Effect` function a call invokes (`runPromise`, `tryPromise`, ...), or null.
     * @param {unknown} callee
     * @returns {string | null}
     */
    calleeName(callee) {
      if (!isRecord(callee)) return null;
      if (callee.type === "Identifier" && typeof callee.name === "string") {
        const imported = named.get(callee.name);
        if (imported === undefined || isShadowed(callee.name, callee)) {
          return null;
        }
        return imported;
      }
      if (
        callee.type === "MemberExpression" &&
        isRecord(callee.object) &&
        callee.object.type === "Identifier" &&
        typeof callee.object.name === "string" &&
        namespaces.has(callee.object.name) &&
        !isShadowed(callee.object.name, callee)
      ) {
        return propertyName(callee);
      }
      return null;
    },
  };
};
