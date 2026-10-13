import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import {
  COMPONENT_NAME,
  WRAPPERS,
  calleeName,
  identifierName,
  unwrap,
} from "../lib/react-components.mjs";
import { webSrcPath } from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 * @typedef {{ name: string, node: unknown }} Component
 */

const CLASS_BASES = new Set(["Component", "PureComponent"]);
const LAZY = "lazy";
const ALIAS_DEPTH = 4;

/**
 * `extends Component`, `extends PureComponent`, `extends React.Component`, ...
 * @param {unknown} node a class node
 */
const isComponentClass = (node) => {
  if (!isRecord(node)) return false;
  const base = unwrap(node.superClass);
  const name = identifierName(base);
  if (name !== null) return CLASS_BASES.has(name);
  return (
    isRecord(base) &&
    base.type === "MemberExpression" &&
    base.computed !== true &&
    CLASS_BASES.has(identifierName(base.property) ?? "")
  );
};

/**
 * True when an expression builds a component: a function or arrow, a `memo` /
 * `forwardRef` wrapper around a component (a function, an identifier or member
 * expression, possibly imported, or another wrapper), a `lazy` loader, a component
 * class, or an identifier that resolves (through module-level bindings) to one.
 * @param {unknown} expr
 * @param {Map<string, unknown>} locals module-level binding name -> declaring node
 * @param {number} depth
 * @param {boolean} wrapped the expression is the argument of memo/forwardRef, so an
 *   identifier or member expression is the wrapped component whether local or imported
 * @returns {boolean}
 */
const buildsComponent = (expr, locals, depth, wrapped = false) => {
  const node = unwrap(expr);
  if (!isRecord(node)) return false;
  switch (node.type) {
    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      return true;
    }
    case "ClassExpression": {
      return isComponentClass(node);
    }
    case "CallExpression": {
      /** @type {unknown} */
      const first = Array.isArray(node.arguments) ? node.arguments[0] : null;
      const callee = calleeName(node.callee);
      if (callee !== null && WRAPPERS.has(callee)) {
        return buildsComponent(first, locals, depth, true);
      }
      if (callee === LAZY) {
        const loader = unwrap(first);
        return (
          isRecord(loader) &&
          (loader.type === "ArrowFunctionExpression" ||
            loader.type === "FunctionExpression" ||
            loader.type === "Identifier" ||
            loader.type === "MemberExpression")
        );
      }
      return false;
    }
    case "MemberExpression": {
      return wrapped;
    }
    case "Identifier": {
      if (wrapped) return true;
      const name = identifierName(node);
      if (name === null || depth <= 0) return false;
      return isLocalComponent(name, locals, depth - 1);
    }
    default: {
      return false;
    }
  }
};

/**
 * True when the module-level binding `name` is a component: a PascalCase function
 * declaration, a PascalCase variable built by `buildsComponent`, or a PascalCase class
 * extending a React component base. Imported bindings are not in `locals`, so a
 * re-exported import never counts.
 * @param {string} name
 * @param {Map<string, unknown>} locals
 * @param {number} depth
 * @returns {boolean}
 */
const isLocalComponent = (name, locals, depth = ALIAS_DEPTH) => {
  if (!COMPONENT_NAME.test(name)) return false;
  const decl = locals.get(name);
  if (!isRecord(decl)) return false;
  if (
    decl.type === "FunctionDeclaration" ||
    decl.type === "TSDeclareFunction"
  ) {
    return true;
  }
  if (decl.type === "ClassDeclaration") return isComponentClass(decl);
  if (decl.type === "VariableDeclarator") {
    return buildsComponent(decl.init, locals, depth);
  }
  return false;
};

/**
 * Records every module-level binding declared in the program (exported or not).
 * Imports are deliberately absent.
 * @param {readonly unknown[]} body
 * @returns {Map<string, unknown>}
 */
const collectLocals = (body) => {
  /** @type {Map<string, unknown>} */
  const locals = new Map();
  /** @param {unknown} decl */
  const add = (decl) => {
    if (!isRecord(decl)) return;
    if (
      decl.type === "FunctionDeclaration" ||
      decl.type === "TSDeclareFunction" ||
      decl.type === "ClassDeclaration"
    ) {
      const name = identifierName(decl.id);
      // An overload signature must not shadow the implementation.
      if (
        name !== null &&
        (decl.type !== "TSDeclareFunction" || !locals.has(name))
      ) {
        locals.set(name, decl);
      }
    } else if (decl.type === "VariableDeclaration") {
      for (const declarator of Array.isArray(decl.declarations)
        ? decl.declarations
        : []) {
        const name = isRecord(declarator)
          ? identifierName(declarator.id)
          : null;
        if (name !== null) locals.set(name, declarator);
      }
    }
  };
  for (const stmt of body) {
    if (!isRecord(stmt)) continue;
    if (
      stmt.type === "ExportNamedDeclaration" ||
      stmt.type === "ExportDefaultDeclaration"
    ) {
      add(stmt.declaration);
    } else {
      add(stmt);
    }
  }
  return locals;
};

/**
 * The exported components of a program, one per local binding (a component exported
 * under two names, or by `export default Foo` next to `export function Foo`, is one),
 * in source order. A re-export (`export { X } from`, `export * from`) is registry
 * behaviour and never counts.
 * @param {readonly unknown[]} body
 * @returns {Component[]}
 */
const exportedComponents = (body) => {
  const locals = collectLocals(body);
  /** @type {Map<string, Component>} */
  const found = new Map();
  /**
   * @param {string} key local binding name, or `default` for an anonymous default
   * @param {string} name shown in the message
   * @param {unknown} node
   */
  const record = (key, name, node) => {
    if (!found.has(key)) found.set(key, { name, node });
  };
  for (const stmt of body) {
    if (!isRecord(stmt)) continue;
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.exportKind === "type" || isRecord(stmt.source)) continue;
      const { declaration } = stmt;
      if (isRecord(declaration)) {
        if (declaration.type === "VariableDeclaration") {
          for (const declarator of Array.isArray(declaration.declarations)
            ? declaration.declarations
            : []) {
            const name = isRecord(declarator)
              ? identifierName(declarator.id)
              : null;
            if (name !== null && isLocalComponent(name, locals)) {
              record(name, name, declarator);
            }
          }
        } else {
          const name = identifierName(declaration.id);
          if (name !== null && isLocalComponent(name, locals)) {
            record(name, name, declaration);
          }
        }
      }
      for (const spec of Array.isArray(stmt.specifiers)
        ? stmt.specifiers
        : []) {
        if (!isRecord(spec) || spec.exportKind === "type") continue;
        const local = identifierName(spec.local);
        if (local !== null && isLocalComponent(local, locals)) {
          record(local, local, spec);
        }
      }
    } else if (stmt.type === "ExportDefaultDeclaration") {
      const declaration = unwrap(stmt.declaration);
      if (!isRecord(declaration)) continue;
      const own = identifierName(declaration.id);
      if (
        declaration.type === "FunctionDeclaration" ||
        declaration.type === "TSDeclareFunction"
      ) {
        if (own === null) record("default", "default", stmt);
        else if (isLocalComponent(own, locals)) record(own, own, stmt);
      } else if (declaration.type === "ClassDeclaration") {
        if (isComponentClass(declaration)) {
          record(own ?? "default", own ?? "default", stmt);
        }
      } else if (declaration.type === "Identifier") {
        const local = identifierName(declaration);
        if (local !== null && isLocalComponent(local, locals)) {
          record(local, local, stmt);
        }
      } else if (buildsComponent(declaration, locals, ALIAS_DEPTH)) {
        record("default", "default", stmt);
      }
    }
  }
  return [...found.values()];
};

/**
 * Bans a `.tsx` file under `apps/web/src` exporting more than one component. A file is
 * one screen part or one primitive; a second exported component is its own file (a
 * layout and its thin wrapper are two files). Counts exported function declarations,
 * PascalCase arrow/function-expression bindings (also wrapped in `memo` / `forwardRef`, around a local or imported component, or built by `lazy`),
 * component classes and `export { A, B }` / `export default` forms; a type, an
 * interface, a constant, a hook or a non-PascalCase function is not a component, and a
 * private helper component in the same file is not counted. Re-exports
 * (`export { X } from`, `export *`) are registry behaviour: they do not count, so a
 * barrel passes. A file that must define several components (the /ui gallery routes, a
 * `primitives/` wrapper) is listed in the `oxlint.config.ts` override for this rule,
 * and tests are exempt there.
 * Every component after the first is a finding, so the baseline count is the surplus.
 */
export const oneComponentPerFile = withBaseline("one-component-per-file", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow one exported component per .tsx file in apps/web outside registries.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const fileRel = webSrcPath(context.filename);
    if (fileRel === null || !fileRel.endsWith(".tsx")) return {};
    return {
      /** @param {{ body?: readonly unknown[] }} program */
      Program(program) {
        const components = exportedComponents(program.body ?? []);
        const [first, ...extra] = components;
        if (first === undefined) return;
        for (const component of extra) {
          context.report({
            node: component.node,
            message: `${component.name} is a second exported component in this file (${first.name} is the first): give each exported component its own file, keep helpers private, and re-export from an index.ts barrel when callers need one path (conventions: one exported component per .tsx file; registries are allowlisted in oxlint.config.ts)`,
          });
        }
      },
    };
  },
});
