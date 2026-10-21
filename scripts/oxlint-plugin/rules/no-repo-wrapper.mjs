import { isRecord } from "../lib/ast.mjs";

const MESSAGE =
  "Do not wrap a repo call in tryDb / tryDbWith: call the Effect repo from infra/repos-fx.ts instead (`xRepoFx.m(exec, ...)` with an explicit handle, `xRepoFxDb.m(...)` on the pool; add the repo there if it is missing). A call that needs the conflict mapping passes `opts` ({ uniqueIndex, conflictReason }) as the second argument and is allowed: the mapping reads the raw driver error, which the Fx form hides.";

const WRAPPERS = new Set(["tryDb", "tryDbWith"]);

/**
 * The expression a thunk returns: an expression body, or a block holding one `return`.
 * @param {unknown} fn
 * @returns {unknown}
 */
const returnedExpression = (fn) => {
  if (!isRecord(fn) || fn.type !== "ArrowFunctionExpression") return null;
  const body = fn.body;
  if (!isRecord(body)) return null;
  if (body.type !== "BlockStatement") return body;
  /** @type {unknown[]} */
  const statements = Array.isArray(body.body) ? body.body : [];
  const only = statements.at(0);
  return statements.length === 1 &&
    isRecord(only) &&
    only.type === "ReturnStatement"
    ? only.argument
    : null;
};

/**
 * Whether `node` is `<name>Repo.<method>(...)`: a call on an identifier ending in `Repo`.
 * @param {unknown} node
 */
const isRepoCall = (node) => {
  if (!isRecord(node) || node.type !== "CallExpression") return false;
  const callee = node.callee;
  return (
    isRecord(callee) &&
    callee.type === "MemberExpression" &&
    !callee.computed &&
    isRecord(callee.object) &&
    callee.object.type === "Identifier" &&
    typeof callee.object.name === "string" &&
    /[a-z]Repo$/.test(callee.object.name)
  );
};

/**
 * `tryDb(() => xRepo.m(...))` and `tryDbWith((exec) => xRepo.m(exec, ...))` without the
 * second (`opts`) argument. The repo's Effect module (`xRepoFx`, `xRepoFxDb`) is the same
 * seam, so the wrapper is a second copy of it. Matching is by name (an identifier ending in
 * `Repo`), so a repo reached through a variable or a table descriptor is not seen. Scope (core
 * `src`, tests exempt) is set in `oxlint.config.ts`.
 */
export const noRepoWrapper = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban tryDb / tryDbWith around a repo call without opts in core: use the xRepoFx / xRepoFxDb modules.",
    },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      CallExpression(node) {
        const callee = node.callee;
        if (
          !isRecord(callee) ||
          callee.type !== "Identifier" ||
          typeof callee.name !== "string" ||
          !WRAPPERS.has(callee.name)
        ) {
          return;
        }
        const args = Array.isArray(node.arguments) ? node.arguments : [];
        if (args.length !== 1) return;
        if (isRepoCall(returnedExpression(args[0]))) {
          context.report({ node, message: MESSAGE });
        }
      },
    };
  },
};
