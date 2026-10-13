import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { componentFunction, moduleBindings } from "../lib/react-components.mjs";
import { webSrcPath } from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const MAX_INLINE_PROPS = 2;

/**
 * The inline object type literal annotating a component's first parameter, else null.
 * @param {Record<string, unknown>} fn
 * @returns {{ members: readonly unknown[] } | null}
 */
const inlinePropsLiteral = (fn) => {
  /** @type {readonly unknown[]} */
  const params = Array.isArray(fn.params) ? fn.params : [];
  const first = params[0];
  if (!isRecord(first) || !isRecord(first.typeAnnotation)) return null;
  /** @type {unknown} */
  const type = first.typeAnnotation.typeAnnotation;
  return isRecord(type) &&
    type.type === "TSTypeLiteral" &&
    Array.isArray(type.members)
    ? { members: type.members }
    : null;
};

/**
 * Requires a named `XProps` type for a component with more than two props. A component
 * in a `.tsx` file under `apps/web/src` (a PascalCase function declaration, or a
 * PascalCase binding of a function or arrow, also inside `memo` / `forwardRef`) whose
 * first parameter is annotated with an inline object type literal of more than two
 * members is a finding; one or two inline props stay legal. Any named annotation
 * (`FooProps`, an imported type, `React.ComponentProps<...>`, an intersection, a generic
 * reference) and an unannotated parameter pass: the rule asks only that the props not be
 * written inline, and does not check that the type is named `${Component}Props`, since
 * shared, imported and derived prop types are legitimate. `Foo = memo(impl)` / `forwardRef(impl)` resolves a module-level `impl` (function declaration or function-valued const) in the same file and checks that function, while an imported or unresolvable `impl` is not checked; a function wrapped twice or both declared and wrapped reports once. Non-component functions are not PascalCase; a PascalCase `.tsx` function that does not return JSX is not detected
 * apart from its name.
 */
export const componentPropsType = withBaseline("component-props-type", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a named XProps type for web components with more than two props.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const fileRel = webSrcPath(context.filename);
    if (fileRel === null || !fileRel.endsWith(".tsx")) return {};
    /** @type {Map<string, unknown>} */
    let locals = new Map();
    /** @type {Set<unknown>} */
    const reported = new Set();
    /** @param {unknown} node */
    const check = (node) => {
      const component = componentFunction(node, locals);
      if (component === null || reported.has(component.fn)) return;
      const literal = inlinePropsLiteral(component.fn);
      if (literal === null || literal.members.length <= MAX_INLINE_PROPS) {
        return;
      }
      reported.add(component.fn);
      context.report({
        node,
        message: `${component.name} types ${literal.members.length} props inline: extract \`type ${component.name}Props = { ... }\` directly above the component and annotate the parameter with it (conventions: a named XProps type when a component has more than two props)`,
      });
    };
    return {
      /** @param {{ body?: readonly unknown[] }} program */
      Program(program) {
        locals = moduleBindings(program.body ?? []);
      },
      FunctionDeclaration: check,
      VariableDeclarator: check,
    };
  },
});
