import { isRecord, typeNameOf } from "../lib/ast.mjs";

/**
 * @typedef {{ loc: { start: { line: number }, end: { line: number } }, value: string }} Comment
 * @typedef {{
 *   type: string,
 *   name: string,
 *   loc: { start: { line: number }, end: { line: number } },
 *   parent?: Node,
 *   source?: { value?: unknown },
 *   importKind?: string,
 *   exportKind?: string,
 *   specifiers?: readonly Node[],
 *   imported?: unknown,
 *   local: unknown,
 *   key?: unknown,
 *   property?: unknown,
 *   object?: unknown,
 *   computed?: boolean,
 *   shorthand?: boolean,
 * }} Node
 * @typedef {{
 *   report: (diagnostic: { node: unknown, message: string }) => void,
 *   sourceCode: { getAllComments: () => readonly Comment[] },
 * }} RuleContext
 */

/** Matches `os`, `./os`, `../os`, `../os.ts` (the module exporting the builders). */
const OS_MODULE = /(^|\/)os(\.(ts|mjs|js))?$/;

/** `// public: <reason>`; the reason must be non-empty. */
const JUSTIFICATION = /^[\s*]*public:\s*\S/;

const FIX =
  "build the procedure from `authed` (or `graphChildWrite`), or justify a public one with an adjacent `// public: <reason>` comment directly above its statement (conventions: API procedures are guarded unless justified public)";

/**
 * Walk up to the statement that sits directly under Program.
 * @param {Node} node
 * @returns {Node}
 */
const topLevelStatement = (node) => {
  let current = node;
  while (current.parent && current.parent.type !== "Program") {
    current = current.parent;
  }
  return current;
};

/**
 * Every API procedure is built from the authenticated builder. The public builder
 * `pub` (imported, aliased, namespaced, re-exported or wrapped in a helper) and a raw
 * `os` from `@orpc/server` build unguarded procedures, so each use needs a
 * `// public: <reason>` comment on the line(s) directly above its top-level statement
 * (or on the same line). Scoped to `packages/api/src/procedures` (not its tests) in
 * `oxlint.config.ts`.
 */
export const procedureMustBeGuarded = {
  meta: {
    type: "problem",
    docs: {
      description:
        "API procedures use the authenticated builder; the public builder needs an adjacent justification comment.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    /** Local names bound to the public builder (`pub`), and namespace imports of the builders module. */
    const pubNames = new Set();
    const namespaces = new Set();
    /** @type {readonly Comment[] | null} */
    let comments = null;

    /** @param {Node} statement */
    const isJustified = (statement) => {
      comments ??= context.sourceCode.getAllComments();
      const startLine = statement.loc.start.line;
      const endLine = statement.loc.end.line;
      const sorted = [...comments].sort(
        (a, b) => b.loc.end.line - a.loc.end.line
      );
      // Trailing comment on the statement's first or last line.
      if (
        sorted.some(
          (c) =>
            JUSTIFICATION.test(c.value) &&
            (c.loc.end.line === startLine || c.loc.end.line === endLine)
        )
      ) {
        return true;
      }
      // Contiguous comment lines directly above; a blank line breaks adjacency.
      let needed = startLine - 1;
      for (const c of sorted) {
        if (c.loc.end.line !== needed) continue;
        if (JUSTIFICATION.test(c.value)) return true;
        needed = c.loc.start.line - 1;
      }
      return false;
    };

    /**
     * @param {Node} node
     * @param {string} what
     */
    const flag = (node, what) => {
      if (isJustified(topLevelStatement(node))) return;
      context.report({
        node,
        message: `${what} builds an unguarded API procedure: ${FIX}`,
      });
    };

    return {
      /** @param {Node} node */
      ImportDeclaration(node) {
        const source = node.source?.value;
        if (typeof source !== "string" || node.importKind === "type") return;
        if (source === "@orpc/server") {
          for (const spec of node.specifiers ?? []) {
            if (
              spec.type === "ImportSpecifier" &&
              spec.importKind !== "type" &&
              typeNameOf(spec.imported) === "os"
            ) {
              flag(spec, "Importing the raw `os` builder from @orpc/server");
            }
          }
          return;
        }
        if (!OS_MODULE.test(source)) return;
        for (const spec of node.specifiers ?? []) {
          if (spec.importKind === "type") continue;
          if (spec.type === "ImportNamespaceSpecifier") {
            namespaces.add(spec.local.name);
          } else if (typeNameOf(spec.imported) === "pub") {
            pubNames.add(spec.local.name);
          }
        }
      },
      /** @param {Node} node */
      ExportNamedDeclaration(node) {
        const source = node.source?.value;
        if (
          typeof source !== "string" ||
          !OS_MODULE.test(source) ||
          node.exportKind === "type"
        ) {
          return;
        }
        for (const spec of node.specifiers ?? []) {
          if (spec.exportKind !== "type" && typeNameOf(spec.local) === "pub") {
            flag(spec, "Re-exporting the public builder `pub`");
          }
        }
      },
      /** @param {Node} node */
      ExportAllDeclaration(node) {
        const source = node.source?.value;
        if (
          typeof source === "string" &&
          OS_MODULE.test(source) &&
          node.exportKind !== "type"
        ) {
          flag(node, "`export *` of the builders module (it includes `pub`)");
        }
      },
      /** @param {Node} node */
      Identifier(node) {
        if (!pubNames.has(node.name)) return;
        const parent = node.parent;
        if (!isRecord(parent) || parent.type === "ImportSpecifier") return;
        if (
          (parent.type === "MemberExpression" &&
            parent.property === node &&
            !parent.computed) ||
          (parent.type === "Property" &&
            parent.key === node &&
            !parent.shorthand &&
            !parent.computed)
        ) {
          return;
        }
        flag(node, `\`${node.name}\` (the public builder)`);
      },
      /** @param {Node} node */
      MemberExpression(node) {
        const { object, property } = node;
        if (
          isRecord(object) &&
          object.type === "Identifier" &&
          namespaces.has(object.name) &&
          !node.computed &&
          typeNameOf(property) === "pub"
        ) {
          flag(node, "`pub` (the public builder)");
        }
      },
    };
  },
};
