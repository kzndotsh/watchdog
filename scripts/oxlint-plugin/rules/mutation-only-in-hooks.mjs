import { withBaseline } from "../lib/baseline.mjs";
import { createUseMutationResolver } from "../lib/react-query.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void } & import("../lib/effect-calls.mjs").ScopeContext} RuleContext
 */

/**
 * `useMutation` (any import form of `@tanstack/react-query`: named, aliased, namespace)
 * is called only in a domain or shared hook. The allowed trees (`domains/*` `/hooks/` and
 * `shared/hooks/`) and the test trees are switched off by `overrides` in
 * `oxlint.config.ts`, which is the allowlist. Components that mutate today are baselined
 * per file (shrink-only): move the mutation into a hook, never raise a count.
 */
export const mutationOnlyInHooks = withBaseline("mutation-only-in-hooks", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban useMutation outside apps/web domain hooks and shared hooks.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const mutation = createUseMutationResolver(context);
    return {
      /** @param {unknown} program */
      Program(program) {
        mutation.init(program);
      },
      /** @param {{ callee: unknown }} node */
      CallExpression(node) {
        if (!mutation.isUseMutation(node.callee)) return;
        context.report({
          node,
          message:
            "useMutation outside a hook: move the mutation into a `use-*` hook under `domains/<domain>/hooks/` (or `shared/hooks/`) and have the component call that hook, so one mutation machine owns each noun and its invalidation (conventions: mutations and invalidation only in domain hooks)",
        });
      },
    };
  },
});
