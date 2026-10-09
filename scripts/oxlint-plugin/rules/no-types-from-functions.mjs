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
 * Only identifiers that resolve to an import binding count (`isImport`), so a same-named
 * local value or type never changes what the import is used for.
 * @param {unknown} root
 * @param {(name: string, node: unknown) => boolean} isImport true when `name`, seen from `node`, resolves to an import binding
 * @returns {Scan}
 */
const scan = (root, isImport) => {
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
        if (typeof node.name === "string" && isImport(node.name, node)) {
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
        (node.type === "MemberExpression" ||
          node.type === "Property" ||
          node.type === "TSPropertySignature" ||
          node.type === "TSMethodSignature");
      if (isName) continue;
      walk(value, key === typeHolder, inQuery);
    }
  };
  walk(root, false, false);
  return out;
};

/** @param {string} name */
const reexportMessage = (name) =>
  `${name} is re-exported from a *.functions server-function module, which leaks its types past every import check: import the function where it is used and the type from @watchdog/schemas or the domain's types.ts (conventions: types are imported from schemas or types.ts, never from *.functions)`;

/**
 * @typedef {{ set: Map<string, { defs: { type?: string }[] }>, upper: Scope | null }} Scope
 * @typedef {{ sourceCode?: { getScope?: (node: unknown) => Scope | null } }} ScopeContext
 */

/**
 * True when `name`, seen from `node`, resolves to an import binding. Without scope
 * support every name counts.
 * @param {ScopeContext} context
 * @param {string} name
 * @param {unknown} node
 */
const isImport = (context, name, node) => {
  const source = context.sourceCode;
  if (typeof source?.getScope !== "function") return true;
  /** @type {Scope | null | undefined} */
  let scope = source.getScope(node);
  while (scope) {
    const variable = scope.set.get(name);
    if (variable) return variable.defs[0]?.type === "ImportBinding";
    scope = scope.upper;
  }
  return false;
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
 * file only uses in type positions) from a `*.functions` module, any re-export from
 * one (`export { x } from`, `export * from`) and `import("x.functions").T`. Server-function modules own the RPC surface;
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
        const usage = scan(program, (name, node) =>
          isImport(context, name, node)
        );
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
            // A re-export cannot tell a type from a value: it leaks the module's types.
            for (const spec of specifiers) {
              if (isRecord(spec)) {
                context.report({
                  node: spec,
                  message: reexportMessage(nameOf(spec)),
                });
              }
            }
          } else if (stmt.type === "ExportAllDeclaration") {
            context.report({ node: stmt, message: reexportMessage("*") });
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
