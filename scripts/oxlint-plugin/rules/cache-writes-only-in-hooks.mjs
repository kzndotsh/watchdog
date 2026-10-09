import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { propertyName } from "../lib/effect-calls.mjs";
import { CACHE_WRITE_MEMBERS, staticKeyName } from "../lib/react-query.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/** @param {string} member */
const message = (member) =>
  `${member} outside a hook: do cache writes in a domain hook (\`domains/<domain>/hooks/use-*\` or \`shared/hooks/\`) or add a named contract to \`shared/lib/query-invalidation.ts\` and call it from the mutation's \`onSuccess\`, not an ad-hoc call here (conventions: mutations and invalidation only in domain hooks)`;

/**
 * QueryClient cache writes (`invalidateQueries`, `setQueryData`, `setQueriesData`,
 * `removeQueries`, `resetQueries`, `refetchQueries`, `cancelQueries`) only in domain or
 * shared hooks and `shared/lib/query-invalidation.ts`. Matches the member itself, so a
 * call, `.call` / `.bind` / `.apply`, an optional call, a computed `["invalidateQueries"]`
 * access and a destructured `{ invalidateQueries }` all count. The member names are
 * QueryClient specific; there is no type information to prove the receiver. The allowed
 * trees and tests are switched off by `overrides` in `oxlint.config.ts`. Existing sites
 * are baselined per file (shrink-only).
 */
export const cacheWritesInHooks = withBaseline("cache-writes-only-in-hooks", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban QueryClient cache writes outside apps/web hooks and query-invalidation.ts.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      MemberExpression(node) {
        const name = propertyName(node);
        if (name !== null && CACHE_WRITE_MEMBERS.has(name)) {
          context.report({ node, message: message(name) });
        }
      },
      /** @param {{ properties?: readonly unknown[] }} node */
      ObjectPattern(node) {
        for (const prop of node.properties ?? []) {
          if (!isRecord(prop) || prop.type !== "Property") continue;
          const name = staticKeyName(prop);
          if (name !== null && CACHE_WRITE_MEMBERS.has(name)) {
            context.report({ node: prop, message: message(name) });
          }
        }
      },
    };
  },
});
