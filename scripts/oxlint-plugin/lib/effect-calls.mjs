/**
 * Resolves calls to `effect/Effect` functions (`Effect.runPromise(...)`, an aliased
 * `E.runPromise(...)`, a named `runPromise(...)` import) for the Effect edge rules.
 * Nodes are plain ESTree objects; see ast.mjs.
 */
import { isRecord } from "./ast.mjs";

const EFFECT_MODULES = new Set(["effect", "effect/Effect"]);

/**
 * Tracks the local names bound to the `Effect` namespace and to named `Effect` exports
 * in one file. `Effect` is always a namespace name: the codebase imports it that way and
 * a file that uses it without an import is still talking about the Effect namespace.
 * Call `record` from the rule's `ImportDeclaration` visitor and `calleeName` per call.
 */
export const createEffectResolver = () => {
  const namespaces = new Set(["Effect"]);
  /** @type {Map<string, string>} local name -> exported function name */
  const named = new Map();

  return {
    /** @param {{ source?: unknown, specifiers?: readonly unknown[] }} node */
    record(node) {
      const { source } = node;
      if (!isRecord(source) || typeof source.value !== "string") return;
      if (!EFFECT_MODULES.has(source.value)) return;
      for (const spec of node.specifiers ?? []) {
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
    },
    /**
     * The `Effect` function a call invokes (`runPromise`, `tryPromise`, ...), or null.
     * @param {unknown} callee
     * @returns {string | null}
     */
    calleeName(callee) {
      if (!isRecord(callee)) return null;
      if (callee.type === "Identifier" && typeof callee.name === "string") {
        return named.get(callee.name) ?? null;
      }
      if (
        callee.type === "MemberExpression" &&
        callee.computed !== true &&
        isRecord(callee.object) &&
        callee.object.type === "Identifier" &&
        typeof callee.object.name === "string" &&
        namespaces.has(callee.object.name) &&
        isRecord(callee.property) &&
        typeof callee.property.name === "string"
      ) {
        return callee.property.name;
      }
      return null;
    },
  };
};
