import { SKIP_KEYS, isRecord } from "../lib/ast.mjs";
import { importTypeSource, literalString } from "../lib/web-modules.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 * @typedef {{ types: Set<string>, values: Set<string>, typeImports: unknown[] }} Scan
 */

/** `./x.functions`, `@/domains/x/x.functions`, with or without a script extension. */
const FUNCTIONS_MODULE = /\.functions(\.[cm]?[jt]sx?)?$/;

/** Keys whose Identifier is a property name, not a reference (unless the node is computed). */
const NAME_KEYS = new Set(["property", "key"]);

/**
 * The child key holding a type name (`Foo` in `x: Foo`, `implements Foo`, `extends Foo`).
 * @param {string} type
 * @returns {string | null}
 */
const typeHolderKey = (type) => {
  if (type === "TSTypeReference") return "typeName";
  if (type === "TSInterfaceHeritage" || type === "TSClassImplements") {
    return "expression";
  }
  return null;
};

/**
 * Walks the program once, recording every identifier that references a binding as a type
 * reference or a value reference, and every `import("x.functions").T` type.
 * An identifier counts as a type reference only in a type-name position (`T`, `ns.T`,
 * `implements T`, `extends T`, `export type { T }`); `typeof fn` is a value reference.
 * Shadowing is not resolved, and errs toward silence: a same-named local counts as a
 * value use, and a binding with any value use is never reported.
 * @param {unknown} root
 * @returns {Scan}
 */
const scan = (root) => {
  /** @type {Scan} */
  const out = { types: new Set(), values: new Set(), typeImports: [] };
  /**
   * @param {unknown} node
   * @param {boolean} inType
   * @param {boolean} inQuery
   */
  const walk = (node, inType, inQuery) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, inType, inQuery);
      return;
    }
    if (!isRecord(node) || typeof node.type !== "string") return;
    switch (node.type) {
      case "ImportDeclaration": {
        return;
      }
      case "Identifier":
      case "JSXIdentifier": {
        if (typeof node.name === "string") {
          (inType ? out.types : out.values).add(node.name);
        }
        // `const x: T` / `(a: T)` hang the annotation off the binding identifier.
        walk(node.typeAnnotation, false, inQuery);
        return;
      }
      case "TSQualifiedName": {
        walk(node.left, inType, inQuery);
        return;
      }
      case "TSTypeQuery": {
        walk(node.exprName, false, true);
        return;
      }
      case "TSImportType": {
        if (!inQuery) out.typeImports.push(node);
        return;
      }
      case "ExportNamedDeclaration": {
        if (node.source !== null && node.source !== undefined) return;
        if (isRecord(node.declaration)) walk(node.declaration, false, false);
        for (const spec of Array.isArray(node.specifiers)
          ? node.specifiers
          : []) {
          if (!isRecord(spec)) continue;
          const asType =
            node.exportKind === "type" || spec.exportKind === "type";
          walk(spec.local, asType, false);
        }
        return;
      }
      default:
    }
    const typeHolder = typeHolderKey(node.type);
    for (const [key, value] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) continue;
      // `a.b` member names and `{ b: 1 }` keys are not references; a shorthand `{ b }`
      // still walks `value`.
      const isName =
        NAME_KEYS.has(key) &&
        node.computed !== true &&
        (node.type === "MemberExpression" || node.type === "Property");
      if (isName) continue;
      walk(value, key === typeHolder, inQuery);
    }
  };
  walk(root, false, false);
  return out;
};

/** @param {string} name */
const message = (name) =>
  `${name} is a type imported from a *.functions server-function module: import it from @watchdog/schemas or the domain's types.ts instead (define it there if it is missing; the domain's own *.functions.ts and queries.ts are exempt) (conventions: types are imported from schemas or types.ts, never from *.functions)`;

/**
 * @param {unknown} spec
 * @returns {string}
 */
const nameOf = (spec) => {
  if (!isRecord(spec)) return "(unknown)";
  const node = isRecord(spec.local) ? spec.local : spec.exported;
  return isRecord(node) && typeof node.name === "string" ? node.name : "(type)";
};

/**
 * Bans importing a type (an `import type`, an inline `type` specifier, or a binding the
 * file only uses in type positions) from a `*.functions` module, plus `export type ...
 * from` and `import("x.functions").T`. Server-function modules own the RPC surface;
 * their types come from `@watchdog/schemas` or the domain `types.ts`. The domain's own
 * `*.functions.ts` and `queries.ts` / `*-queries.ts` are exempted in `oxlint.config.ts`.
 */
export const noTypesFromFunctions = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban importing types from *.functions modules in apps/web; use @watchdog/schemas or the domain types.ts.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {{ body?: readonly unknown[] }} program */
      Program(program) {
        const usage = scan(program);
        for (const stmt of program.body ?? []) {
          if (!isRecord(stmt)) continue;
          const source = literalString(stmt.source);
          if (source === null || !FUNCTIONS_MODULE.test(source)) continue;
          const specifiers = Array.isArray(stmt.specifiers)
            ? stmt.specifiers
            : [];
          if (stmt.type === "ImportDeclaration") {
            for (const spec of specifiers) {
              if (!isRecord(spec)) continue;
              const local = nameOf(spec);
              const typeOnly =
                stmt.importKind === "type" ||
                spec.importKind === "type" ||
                (usage.types.has(local) && !usage.values.has(local));
              if (typeOnly) {
                context.report({ node: spec, message: message(local) });
              }
            }
          } else if (stmt.type === "ExportNamedDeclaration") {
            for (const spec of specifiers) {
              if (
                isRecord(spec) &&
                (stmt.exportKind === "type" || spec.exportKind === "type")
              ) {
                context.report({ node: spec, message: message(nameOf(spec)) });
              }
            }
          } else if (
            stmt.type === "ExportAllDeclaration" &&
            stmt.exportKind === "type"
          ) {
            context.report({ node: stmt, message: message("*") });
          }
        }
        for (const node of usage.typeImports) {
          const source = importTypeSource(node);
          if (source !== null && FUNCTIONS_MODULE.test(source)) {
            context.report({ node, message: message("an import() type") });
          }
        }
      },
    };
  },
};
