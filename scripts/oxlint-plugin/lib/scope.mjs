import { isRecord } from "./ast.mjs";

/**
 * Lexical-scope lookups shared by rules that follow a variable to its initializer.
 * @typedef {{ set: Map<string, { defs: readonly { type?: string, node?: unknown }[] }>, upper: Scope | null }} Scope
 */

/** @typedef {{ sourceCode?: { getScope?: (node: unknown) => Scope | null } }} ScopeContext */

/**
 * What `name`, seen from `node`, resolves to by lexical scope: an `import` binding, a
 * `local` binding (variable, parameter, function, class) that shadows it, or `unbound`
 * (a global or undeclared). `unknown` when the plugin context has no scope API. The one
 * binding-aware lookup the rules share, so none matches an identifier by spelling alone.
 * @param {ScopeContext} context
 * @param {string} name
 * @param {unknown} node
 * @returns {"import" | "local" | "unbound" | "unknown"}
 */
export const bindingKind = (context, name, node) => {
  const source = context.sourceCode;
  if (typeof source?.getScope !== "function") return "unknown";
  /** @type {Scope | null | undefined} */
  let scope = source.getScope(node);
  while (scope) {
    const variable = scope.set.get(name);
    if (variable) {
      return variable.defs[0]?.type === "ImportBinding" ? "import" : "local";
    }
    scope = scope.upper;
  }
  return "unbound";
};

/**
 * True when `name` at `node` resolves to a binding that is not an import (a local variable
 * or parameter shadowing it). Without scope support nothing is shadowed.
 * @param {ScopeContext} context
 * @param {string} name
 * @param {unknown} node
 */
export const isShadowedBinding = (context, name, node) =>
  bindingKind(context, name, node) === "local";

/**
 * True when `name` at `node` resolves to an import binding. Without scope support every
 * name counts, so a rule that bans imports stays strict rather than silently off.
 * @param {ScopeContext} context
 * @param {string} name
 * @param {unknown} node
 */
export const isImportBinding = (context, name, node) => {
  const kind = bindingKind(context, name, node);
  return kind === "import" || kind === "unknown";
};

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
        // A destructuring declarator (`const [a] = ...`) binds a part of its initializer,
        // not the initializer itself, so only a plain `NAME = <expr>` counts.
        return def.type === "Variable" &&
          isRecord(decl) &&
          isRecord(decl.id) &&
          decl.id.type === "Identifier" &&
          isRecord(decl.init)
          ? [{ node: decl.init, at: decl }]
          : [];
      });
    }
    scope = scope.upper;
  }
  return null;
};
