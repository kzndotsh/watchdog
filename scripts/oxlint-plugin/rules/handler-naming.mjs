import { SKIP_KEYS, isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import {
  calleeName,
  componentFunction,
  identifierName,
  moduleBindings,
  unwrap,
} from "../lib/react-components.mjs";
import { webSrcPath } from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const HANDLE_NAME = /^handle[A-Z]/;
const ON_NAME = /^on[A-Z]/;
const TYPE_DEPTH = 4;
const CONVENTION =
  "conventions: props are `onX`, their implementations inside the component are `handleX`, and no `handleX` names in props";

/**
 * `handleSave` -> `onSave`, `onSave` -> `handleSave`.
 * @param {string} name
 * @param {"on" | "handle"} prefix
 */
const swapPrefix = (name, prefix) =>
  `${prefix}${name.replace(/^(handle|on)/, "")}`;

/**
 * Module-level `type X = ...` and `interface X { ... }` by name, as the node holding the
 * members (a type annotation, or the interface body).
 * @param {readonly unknown[]} body
 * @returns {Map<string, unknown>}
 */
const moduleTypes = (body) => {
  /** @type {Map<string, unknown>} */
  const types = new Map();
  for (const stmt of body) {
    const decl =
      isRecord(stmt) &&
      (stmt.type === "ExportNamedDeclaration" ||
        stmt.type === "ExportDefaultDeclaration")
        ? stmt.declaration
        : stmt;
    if (!isRecord(decl)) continue;
    const name = identifierName(decl.id);
    if (name === null) continue;
    if (decl.type === "TSTypeAliasDeclaration") {
      types.set(name, decl.typeAnnotation);
    } else if (decl.type === "TSInterfaceDeclaration") {
      types.set(name, decl.body);
    }
  }
  return types;
};

/**
 * The directly declared members of a props type: an object type literal, an interface
 * body, a local alias or interface name, or the parts of an intersection or union of
 * those. Anything else (an imported type, a generic, a mapped type) yields nothing.
 * @param {unknown} type
 * @param {ReadonlyMap<string, unknown>} types
 * @param {number} [depth]
 * @returns {unknown[]}
 */
const propsMembers = (type, types, depth = TYPE_DEPTH) => {
  if (depth < 0 || !isRecord(type)) return [];
  if (type.type === "TSTypeLiteral" && Array.isArray(type.members)) {
    return type.members;
  }
  if (type.type === "TSInterfaceBody" && Array.isArray(type.body)) {
    return type.body;
  }
  if (
    (type.type === "TSIntersectionType" || type.type === "TSUnionType") &&
    Array.isArray(type.types)
  ) {
    /** @type {readonly unknown[]} */
    const parts = type.types;
    return parts.flatMap((part) => propsMembers(part, types, depth - 1));
  }
  if (type.type === "TSTypeReference") {
    const name = identifierName(type.typeName);
    if (name === null || type.typeArguments || type.typeParameters) return [];
    return propsMembers(types.get(name), types, depth - 1);
  }
  return [];
};

/**
 * A property or method signature's plain key name, else null.
 * @param {unknown} member
 * @returns {string | null}
 */
const memberName = (member) => {
  if (
    !isRecord(member) ||
    (member.type !== "TSPropertySignature" &&
      member.type !== "TSMethodSignature") ||
    member.computed === true
  ) {
    return null;
  }
  const key = member.key;
  if (identifierName(key) !== null) return identifierName(key);
  return isRecord(key) && typeof key.value === "string" ? key.value : null;
};

/**
 * The type annotation of a component's first parameter.
 * @param {Record<string, unknown>} fn
 * @returns {unknown}
 */
const firstParamType = (fn) => {
  /** @type {readonly unknown[]} */
  const params = Array.isArray(fn.params) ? fn.params : [];
  const first = params[0];
  return isRecord(first) && isRecord(first.typeAnnotation)
    ? first.typeAnnotation.typeAnnotation
    : null;
};

/** @param {unknown} expr */
const isFunction = (expr) =>
  isRecord(expr) &&
  (expr.type === "ArrowFunctionExpression" ||
    expr.type === "FunctionExpression");

/**
 * Names bound directly in a component's body to a function: a function declaration, or a
 * const initialised with an arrow, a function expression or `useCallback(<function>, ...)`.
 * Values from hooks and libraries (`useState` setters, destructured hook results) never
 * appear here.
 * @param {Record<string, unknown>} fn
 * @returns {Set<string>}
 */
const localFunctions = (fn) => {
  /** @type {Set<string>} */
  const names = new Set();
  const body = isRecord(fn.body) ? fn.body.body : null;
  if (!Array.isArray(body)) return names;
  for (const stmt of body) {
    if (!isRecord(stmt)) continue;
    if (stmt.type === "FunctionDeclaration") {
      const name = identifierName(stmt.id);
      if (name !== null) names.add(name);
    } else if (
      stmt.type === "VariableDeclaration" &&
      stmt.kind === "const" &&
      Array.isArray(stmt.declarations)
    ) {
      /** @type {readonly unknown[]} */
      const declarations = stmt.declarations;
      for (const d of declarations) {
        const name = isRecord(d) ? identifierName(d.id) : null;
        if (name === null) continue;
        const init = unwrap(d.init);
        if (
          isFunction(init) ||
          (isRecord(init) &&
            init.type === "CallExpression" &&
            calleeName(init.callee) === "useCallback" &&
            Array.isArray(init.arguments) &&
            isFunction(unwrap(init.arguments[0])))
        ) {
          names.add(name);
        }
      }
    }
  }
  return names;
};

/**
 * Names a binding pattern introduces (`a`, `{ a, b: c }`, `[a, ...rest]`, `a = 1`).
 * @param {unknown} pattern
 * @param {Set<string>} out
 */
const patternNames = (pattern, out) => {
  if (!isRecord(pattern)) return;
  const name = identifierName(pattern);
  if (name !== null) {
    out.add(name);
  } else if (pattern.type === "AssignmentPattern") {
    patternNames(pattern.left, out);
  } else if (pattern.type === "RestElement") {
    patternNames(pattern.argument, out);
  } else if (
    pattern.type === "ArrayPattern" &&
    Array.isArray(pattern.elements)
  ) {
    for (const element of pattern.elements) patternNames(element, out);
  } else if (
    pattern.type === "ObjectPattern" &&
    Array.isArray(pattern.properties)
  ) {
    for (const prop of pattern.properties) {
      patternNames(
        isRecord(prop) && prop.type === "Property" ? prop.value : prop,
        out
      );
    }
  }
};

/**
 * Names declared directly in a statement list: variables, functions and classes.
 * @param {unknown} statements
 * @param {Set<string>} out
 */
const declaredNames = (statements, out) => {
  if (!Array.isArray(statements)) return;
  for (const stmt of statements) {
    if (!isRecord(stmt)) continue;
    if (
      stmt.type === "VariableDeclaration" &&
      Array.isArray(stmt.declarations)
    ) {
      for (const d of stmt.declarations) {
        patternNames(isRecord(d) ? d.id : null, out);
      }
    } else if (
      stmt.type === "FunctionDeclaration" ||
      stmt.type === "ClassDeclaration"
    ) {
      patternNames(stmt.id, out);
    }
  }
};

const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);
const SCOPE_TYPES = new Set([
  "BlockStatement",
  "CatchClause",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "SwitchStatement",
]);

/**
 * The names a scope-introducing node adds on top of `outer`.
 * @param {Record<string, unknown>} node
 * @param {ReadonlySet<string>} outer
 * @returns {Set<string>}
 */
const scopeNames = (node, outer) => {
  const names = new Set(outer);
  if (FUNCTION_TYPES.has(String(node.type))) {
    const params = Array.isArray(node.params) ? node.params : [];
    for (const param of params) patternNames(param, names);
    if (node.type === "FunctionExpression") patternNames(node.id, names);
  }
  if (node.type === "CatchClause") patternNames(node.param, names);
  if (node.type === "BlockStatement") declaredNames(node.body, names);
  if (node.type === "SwitchStatement" && Array.isArray(node.cases)) {
    for (const c of node.cases) {
      declaredNames(isRecord(c) ? c.consequent : null, names);
    }
  }
  if (node.type === "ForStatement") declaredNames([node.init], names);
  if (node.type === "ForInStatement" || node.type === "ForOfStatement") {
    declaredNames([node.left], names);
  }
  return names;
};

/**
 * Every JSXAttribute under a component's body, passed to `visit` with the names
 * shadowed at that point. Nested components (PascalCase function declarations and
 * bindings) are skipped: they are checked on their own. A nested function's parameters
 * and the declarations of any nested block shadow for everything inside them.
 * @param {unknown} node
 * @param {ReadonlySet<string>} shadowed
 * @param {(attr: Record<string, unknown>, shadowed: ReadonlySet<string>) => void} visit
 */
const eachAttribute = (node, shadowed, visit) => {
  if (Array.isArray(node)) {
    for (const item of node) eachAttribute(item, shadowed, visit);
    return;
  }
  if (!isRecord(node)) return;
  if (node.type === "JSXAttribute") visit(node, shadowed);
  if (
    (node.type === "FunctionDeclaration" ||
      node.type === "VariableDeclarator") &&
    componentFunction(node) !== null
  ) {
    return;
  }
  const inner =
    FUNCTION_TYPES.has(String(node.type)) || SCOPE_TYPES.has(String(node.type))
      ? scopeNames(node, shadowed)
      : shadowed;
  for (const [key, value] of Object.entries(node)) {
    if (!SKIP_KEYS.has(key)) eachAttribute(value, inner, visit);
  }
};

/**
 * True for a component tag: `<Foo>`, `<Ui.Foo>`, `<form.Field>`; false for DOM tags
 * (`<div>`, lowercase).
 * @param {unknown} name a JSXOpeningElement name
 */
const isComponentTag = (name) =>
  isRecord(name) &&
  (name.type === "JSXMemberExpression" ||
    (name.type === "JSXIdentifier" &&
      typeof name.name === "string" &&
      /^[A-Z]/.test(name.name)));

/**
 * Handler naming for web components: props are `onX`, implementations are `handleX`.
 * Three findings in a `.tsx` file under `apps/web/src`:
 *
 * - a member named `handleX` declared directly in a component's props type (an inline
 *   literal, or a local `type` / `interface`, followed through local aliases,
 *   intersections and unions to a depth of four levels): rename it `onX`. Imported and
 *   generic props types are not inspected, and members nested inside a prop's own type
 *   (a form API's `handleSubmit`) are not props;
 * - a JSX attribute named `handleX` on a component tag (`<Foo handleX={...}>`,
 *   `<Ui.Foo ...>`): pass it as `onX`. DOM tags are not checked;
 * - a function bound directly in a component's body (a function declaration, a const
 *   arrow or function expression (`let` / `var` bindings are reassignable, not stable handlers), or `useCallback(<function>)`) that is passed to an
 *   `onX` attribute under a name other than `handleX`: name it `handleX`. The name is
 *   resolved lexically: a nested function parameter or nested block declaration that
 *   shadows it is not a finding, and nested components are checked on their own. Inline arrows,
 *   member expressions (`props.onX`, `form.handleChange`), hook results and setters,
 *   module-level and imported functions are legal.
 *
 * Hook return values named `handleX` are out of scope, and `.ts` files are not covered.
 */
export const handlerNaming = withBaseline("handler-naming", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Web component props are onX; implementations are handleX; no handleX names in props.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const fileRel = webSrcPath(context.filename);
    if (fileRel === null || !fileRel.endsWith(".tsx")) return {};
    /** @type {Map<string, unknown>} */
    let locals = new Map();
    /** @type {Map<string, unknown>} */
    let types = new Map();
    /** @type {Set<unknown>} */
    const seen = new Set();
    /** @param {unknown} node */
    const once = (node) => {
      if (seen.has(node)) return false;
      seen.add(node);
      return true;
    };
    /** @param {unknown} node */
    const checkComponent = (node) => {
      const component = componentFunction(node, locals);
      if (component === null || !once(component.fn)) return;
      for (const member of propsMembers(firstParamType(component.fn), types)) {
        const name = memberName(member);
        if (name === null || !HANDLE_NAME.test(name) || !once(member)) continue;
        context.report({
          node: member,
          message: `Prop \`${name}\` of ${component.name} is named like an implementation: rename it \`${swapPrefix(name, "on")}\` (${CONVENTION})`,
        });
      }
      const functions = localFunctions(component.fn);
      if (functions.size === 0) return;
      const body = component.fn.body;
      // The component's own top-level statements declare the locals; they are not shadows.
      const statements =
        isRecord(body) && Array.isArray(body.body) ? body.body : [body];
      eachAttribute(statements, new Set(), (attr, shadowed) => {
        const attrName = isRecord(attr.name) ? attr.name.name : null;
        const value = attr.value;
        const passed =
          isRecord(value) && value.type === "JSXExpressionContainer"
            ? identifierName(unwrap(value.expression))
            : null;
        if (
          typeof attrName !== "string" ||
          !ON_NAME.test(attrName) ||
          passed === null ||
          HANDLE_NAME.test(passed) ||
          !functions.has(passed) ||
          shadowed.has(passed) ||
          !once(attr)
        ) {
          return;
        }
        context.report({
          node: attr,
          message: `Local function \`${passed}\` is passed to \`${attrName}\`: name the implementation \`${swapPrefix(attrName, "handle")}\` (${CONVENTION})`,
        });
      });
    };
    return {
      /** @param {{ body?: readonly unknown[] }} program */
      Program(program) {
        locals = moduleBindings(program.body ?? []);
        types = moduleTypes(program.body ?? []);
      },
      FunctionDeclaration: checkComponent,
      VariableDeclarator: checkComponent,
      /** @param {Record<string, unknown>} node */
      JSXOpeningElement(node) {
        if (!isComponentTag(node.name) || !Array.isArray(node.attributes)) {
          return;
        }
        for (const attr of node.attributes) {
          const name =
            isRecord(attr) &&
            attr.type === "JSXAttribute" &&
            isRecord(attr.name)
              ? attr.name.name
              : null;
          if (typeof name !== "string" || !HANDLE_NAME.test(name)) continue;
          if (!once(attr)) continue;
          context.report({
            node: attr,
            message: `JSX attribute \`${name}\` is named like an implementation: pass it as \`${swapPrefix(name, "on")}\` (${CONVENTION})`,
          });
        }
      },
    };
  },
});
