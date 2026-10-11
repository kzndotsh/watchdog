import { isRecord } from "./ast.mjs";

/**
 * Lexical-scope lookups shared by rules that follow a variable to its initializer.
 * @typedef {{ set: Map<string, { defs: readonly { type?: string, node?: unknown }[] }>, upper: Scope | null }} Scope
 */

/**
 * Initializers of the variable `name` resolves to from `at`, by lexical scope: a
 * same-named variable in another function never counts. Null when the scope API is
 * missing or the name is not bound in this file (the caller falls back to the file's
 * declarations).
 * @param {{ sourceCode?: { getScope?: (node: unknown) => Scope | null } }} context
 * @param {string} name
 * @param {unknown} at
 * @returns {{ node: unknown, at: unknown }[] | null}
 */
export const lexicalInits = (context, name, at) => {
  const source = context.sourceCode;
  if (typeof source?.getScope !== "function") return null;
  let scope = source.getScope(at);
  while (scope) {
    const variable = scope.set.get(name);
    if (variable) {
      return variable.defs.flatMap((def) => {
        const decl = def.node;
        return def.type === "Variable" && isRecord(decl) && isRecord(decl.init)
          ? [{ node: decl.init, at: decl }]
          : [];
      });
    }
    scope = scope.upper;
  }
  return null;
};
