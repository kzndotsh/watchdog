import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { webSrcPath } from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const HOOK_NAME = /^use[A-Z0-9]/;
const LIB_FOLDER = /(^|\/)lib\//;

/**
 * Bans defining a React hook (`function useX`, `const useX = () => {}` or
 * `= function () {}`, exported or not) in a `lib/` folder under apps/web/src
 * (`domains/<x>/lib`, `shared/lib`, `lib`). `lib/` holds pure helpers; hooks live in
 * `hooks/` (domain) or `shared/hooks/`. A hook file that also holds pure helpers moves
 * as a whole or splits; the baseline covers what has not moved yet.
 */
export const noHooksInLib = withBaseline("no-hooks-in-lib", {
  meta: {
    type: "problem",
    docs: {
      description: "Ban hook definitions (use*) in apps/web lib/ folders.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const fileRel = webSrcPath(context.filename);
    if (fileRel === null || !LIB_FOLDER.test(fileRel)) return {};
    /**
     * @param {unknown} id
     * @param {unknown} node
     */
    const check = (id, node) => {
      if (
        !isRecord(id) ||
        id.type !== "Identifier" ||
        typeof id.name !== "string" ||
        !HOOK_NAME.test(id.name)
      ) {
        return;
      }
      context.report({
        node,
        message: `${id.name} is a hook defined in lib/: lib/ holds pure helpers, so move the hook to the domain's hooks/ folder (shared/hooks/ for cross-domain hooks) and keep the pure parts in lib/ (conventions: lib/ holds pure helpers, hooks live in hooks/)`,
      });
    };
    return {
      /** @param {{ id?: unknown }} node */
      FunctionDeclaration(node) {
        check(node.id, node);
      },
      /** @param {{ id?: unknown, init?: unknown }} node */
      VariableDeclarator(node) {
        const { init } = node;
        if (
          isRecord(init) &&
          (init.type === "ArrowFunctionExpression" ||
            init.type === "FunctionExpression")
        ) {
          check(node.id, node);
        }
      },
    };
  },
});
