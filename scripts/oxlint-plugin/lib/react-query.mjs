/**
 * Shared pieces of the web TanStack Query rules: resolving `useMutation` imports and
 * recognising QueryClient cache-write members. Nodes are plain ESTree objects; see ast.mjs.
 */
import { isRecord } from "./ast.mjs";
import { collectImports } from "./db-imports.mjs";
import { isShadowedBinding, propertyName } from "./effect-calls.mjs";

/** @typedef {import("./effect-calls.mjs").ScopeContext} ScopeContext */

/**
 * @param {string} source
 */
export const isReactQueryModule = (source) =>
  source === "@tanstack/react-query";

/** QueryClient members that write, drop or force-refresh the cache. */
export const CACHE_WRITE_MEMBERS = new Set([
  "invalidateQueries",
  "setQueryData",
  "setQueriesData",
  "removeQueries",
  "resetQueries",
  "refetchQueries",
  "cancelQueries",
]);

/**
 * The statically known name of an object property: `a`, `"a"`, `["a"]` or `` [`a`] ``.
 * @param {Record<string, unknown>} prop a `Property` node
 * @returns {string | null}
 */
export const staticKeyName = (prop) => {
  const { key } = prop;
  if (!isRecord(key)) return null;
  if (prop.computed !== true && key.type === "Literal") {
    return typeof key.value === "string" ? key.value : null;
  }
  return propertyName({ property: key, computed: prop.computed });
};

/**
 * Tracks the local names bound to `useMutation` (named, aliased) and to a namespace import
 * of `@tanstack/react-query` in one file. Call `init(program)` from the `Program` visitor
 * (imports hoist), then `isUseMutation(callee)` per call. A name that a nested scope
 * rebinds (a parameter or local variable) is not the import.
 * @param {ScopeContext} context
 */
export const createUseMutationResolver = (context) => {
  /** @type {Set<string>} */
  let locals = new Set();
  /** @type {Set<string>} */
  let namespaces = new Set();
  return {
    /** @param {unknown} program */
    init(program) {
      const imports = collectImports(program, isReactQueryModule);
      locals = imports.named.get("useMutation") ?? new Set();
      namespaces = imports.namespaces;
    },
    /** @param {unknown} callee */
    isUseMutation(callee) {
      if (!isRecord(callee)) return false;
      if (callee.type === "Identifier" && typeof callee.name === "string") {
        return (
          locals.has(callee.name) &&
          !isShadowedBinding(context, callee.name, callee)
        );
      }
      return (
        callee.type === "MemberExpression" &&
        propertyName(callee) === "useMutation" &&
        isRecord(callee.object) &&
        callee.object.type === "Identifier" &&
        typeof callee.object.name === "string" &&
        namespaces.has(callee.object.name) &&
        !isShadowedBinding(context, callee.object.name, callee)
      );
    },
  };
};
