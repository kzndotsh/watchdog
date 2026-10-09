import { isRecord } from "../lib/ast.mjs";
import { createEffectResolver } from "../lib/effect-calls.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/** `Effect.run*` entry points that start an Effect from plain code. */
const RUN_FUNCTIONS = new Set([
  "runPromise",
  "runPromiseExit",
  "runSync",
  "runSyncExit",
  "runFork",
  "runCallback",
  "runPromiseWith",
  "runPromiseExitWith",
  "runSyncWith",
  "runSyncExitWith",
  "runForkWith",
  "runCallbackWith",
]);

/** The ManagedRuntime the API boots; its `runPromise` is an edge like `Effect.runPromise`. */
const RUNTIME_OBJECT = "appRuntime";

/**
 * @param {unknown} callee
 * @returns {boolean}
 */
const isAppRuntimeRun = (callee) =>
  isRecord(callee) &&
  callee.type === "MemberExpression" &&
  callee.computed !== true &&
  isRecord(callee.object) &&
  callee.object.name === RUNTIME_OBJECT &&
  isRecord(callee.property) &&
  callee.property.name === "runPromise";

/**
 * Bans starting an Effect (`Effect.runPromise`, `runSync`, `runFork`, ... and
 * `appRuntime.runPromise`) outside the sanctioned process, HTTP and `transact` edges.
 * Replaces the regex gate `check-effect-edges.mjs`: oxlint has no `no-restricted-syntax`,
 * so the match is on the call node, which ignores comments and strings and follows an
 * aliased `Effect` import. The sanctioned files and the test trees are switched off by
 * `overrides` in `oxlint.config.ts`, which is the allowlist.
 */
export const noEffectRunOutsideEdge = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban Effect.run* and appRuntime.runPromise outside the sanctioned edge files.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const effect = createEffectResolver();
    /** @param {{ callee: unknown }} node */
    const check = (node) => {
      const name = effect.calleeName(node.callee);
      let label = null;
      if (name !== null && RUN_FUNCTIONS.has(name)) {
        label = `Effect.${name}`;
      } else if (isAppRuntimeRun(node.callee)) {
        label = `${RUNTIME_OBJECT}.runPromise`;
      }
      if (label === null) return;
      context.report({
        node,
        message: `${label} starts an Effect outside a sanctioned run edge: keep the program an Effect and let the caller run it (API handlers through runApp, core tests through runDomain, Cap run through runCap). A new production edge goes in the sanctioned-edge list in oxlint.config.ts with its reason in the nearest AGENTS.md (docs/reference/platform/conventions.md, Effect row).`,
      });
    };
    return {
      /** @param {{ specifiers?: readonly unknown[] }} node */
      ImportDeclaration(node) {
        effect.record(node);
      },
      CallExpression: check,
    };
  },
};
