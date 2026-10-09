import { isRecord, typeNameOf } from "../lib/ast.mjs";

/**
 * @typedef {{ loc: { start: { line: number, column: number }, end: { line: number } }, value: string }} Comment
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
 *   id?: Node,
 *   init?: Node,
 *   properties?: readonly Node[],
 * }} Node
 * @typedef {{
 *   report: (diagnostic: { node: unknown, message: string }) => void,
 *   sourceCode: { getAllComments: () => readonly Comment[], text: string },
 * }} RuleContext
 */

/**
 * Modules that export the builders: `os.ts` itself, the API barrel `src/index.ts`
 * (`../index`, `..`, `../..`, `./index`) and the package `@watchdog/api`.
 */
const OS_MODULE =
  /^(?:@watchdog\/api(?:\/os)?|.*\/os(?:\.(?:ts|mjs|js))?|os|\.{1,2}(?:\/\.\.)*(?:\/index(?:\.(?:ts|mjs|js))?)?\/?)$/;

/** `// public: <reason>`; the reason must be non-empty. */
const JUSTIFICATION = /^[\s*]*public:\s*\S/;

const FIX =
  "build the procedure from `authed` (or `graphChildWrite`), or justify a public one with an adjacent `// public: <reason>` comment directly above its statement (conventions: API procedures are guarded unless justified public)";

/**
 * Name read by a member access: `a.pub` or `a["pub"]`.
 * @param {Node} node
 * @returns {string | null}
 */
const accessedName = (node) => {
  const { property } = node;
  if (!node.computed) return typeNameOf(property);
  return isRecord(property) &&
    property.type === "Literal" &&
    typeof property.value === "string"
    ? property.value
    : null;
};

/**
 * Name of a destructured property key: `{ pub }`, `{ "pub": p }`.
 * @param {Node} prop
 * @returns {string | null}
 */
const keyName = (prop) => {
  const { key } = prop;
  if (isRecord(key) && key.type === "Literal") {
    return typeof key.value === "string" ? key.value : null;
  }
  // `{ [pub]: x }` reads a variable, not the name "pub".
  return prop.computed ? null : typeNameOf(key);
};

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
 * `pub` (imported, aliased, namespaced, destructured, re-exported or wrapped in a
 * helper) and a raw `os` from `@orpc/server` build unguarded procedures, so each use
 * needs a `// public: <reason>` comment on the line(s) directly above its top-level
 * statement (or on the same line). Scoped to `packages/api/src/procedures` (not its
 * tests) in `oxlint.config.ts`. Matching is by name, not scope: a local also called
 * `pub` in a file that imports the builder is reported too (rename it).
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
    /** Local names bound to the public builder (`pub`). */
    const pubNames = new Set();
    /**
     * Local namespace name -> the builder it exposes: pub (builders module) or os (@orpc/server).
     * @type {Map<string, "pub" | "os">}
     */
    const namespaces = new Map();
    /** One report per statement: the justification is per statement too. */
    const reported = new Set();
    /** @type {readonly Comment[] | null} */
    let comments = null;
    /** @type {string[] | null} */
    let lines = null;

    /** @param {Comment} c */
    const isTrailing = (c) => {
      lines ??= context.sourceCode.text.split("\n");
      const before = (lines[c.loc.start.line - 1] ?? "").slice(
        0,
        c.loc.start.column
      );
      return before.trim() !== "";
    };

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
      // Contiguous comment lines directly above; a blank line breaks adjacency, and a
      // comment trailing the previous statement belongs to that statement.
      let needed = startLine - 1;
      for (const c of sorted) {
        if (c.loc.end.line !== needed || isTrailing(c)) continue;
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
      const statement = topLevelStatement(node);
      if (reported.has(statement) || isJustified(statement)) return;
      reported.add(statement);
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
            if (spec.type === "ImportNamespaceSpecifier") {
              namespaces.set(typeNameOf(spec.local) ?? "", "os");
            } else if (
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
          const local = typeNameOf(spec.local);
          if (local === null) continue;
          if (spec.type === "ImportNamespaceSpecifier") {
            namespaces.set(local, "pub");
          } else if (typeNameOf(spec.imported) === "pub") {
            pubNames.add(local);
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
        const { object } = node;
        if (!isRecord(object) || object.type !== "Identifier") return;
        const wanted = namespaces.get(object.name);
        if (wanted !== undefined && accessedName(node) === wanted) {
          flag(
            node,
            wanted === "pub"
              ? "`pub` (the public builder)"
              : "The raw `os` builder from @orpc/server"
          );
        }
      },
      /** @param {Node} node */
      VariableDeclarator(node) {
        const { id, init } = node;
        if (init?.type !== "Identifier" || id?.type !== "ObjectPattern") {
          return;
        }
        const wanted = namespaces.get(init.name);
        if (wanted === undefined) return;
        for (const prop of id.properties ?? []) {
          if (prop.type === "Property" && keyName(prop) === wanted) {
            flag(
              prop,
              wanted === "pub"
                ? "Destructuring `pub` (the public builder)"
                : "Destructuring the raw `os` builder"
            );
          }
        }
      },
    };
  },
};
